import { prisma } from "../config/prisma.js";
import { createWorker } from "../config/bullmq.js";
import type { Job } from "bullmq";
import { sendWebhookWithRetry } from "../services/webhook.js";
import { getTaskHandlerDynamic, getFallbackHandler } from "./registry.js";
import { upstreamKeyService } from "../services/upstreamKeyService.js";

export function startWorker() {
  const worker = createWorker("task-processing", async (job: Job) => {
    const { taskId, taskType, identifier, input } = job.data;

    // Update state to RUNNING
    await prisma.taskJob.update({
      where: { id: taskId },
      data: { state: "RUNNING" },
    });

    const startTime = Date.now();

    // 1. Resolve Handler
    let handler = await getTaskHandlerDynamic(taskType || "model", identifier);
    if (!handler) {
      console.warn(`No specific handler found for ${identifier}, using fallback.`);
      handler = getFallbackHandler(taskType || "model");
    }

    // 2. 借用上游 API Key (并发管理)
    let allocatedConfig: any = null;
    if (handler.platform) {
      allocatedConfig = await upstreamKeyService.borrowKey(handler.platform);
      
      // 如果配置了 Key 但没借到，说明所有 Key 都满了，让 BullMQ 重试 (这就是自动排队机制)
      if (!allocatedConfig && upstreamKeyService.hasConfigForPlatform(handler.platform)) {
        console.log(`[Task ${taskId}] All keys for ${handler.platform} are busy, waiting in queue...`);
        // 抛错触发 BullMQ 重试，注意不要消耗完重试次数，建议在 job 配置里设置合理的延迟
        throw new Error(`UpstreamBusy: all keys for ${handler.platform} are busy.`);
      }
    }

    try {
      // 3. Resolve upstreamIdentifier from strategy
      let upstreamIdentifier: string | undefined;
      if (taskType === 'app') {
        const strategy = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
        upstreamIdentifier = strategy?.appId || identifier;
      } else {
        const strategy = await prisma.modelStrategy.findUnique({ where: { modelName: identifier } });
        upstreamIdentifier = strategy?.modelId || identifier;
      }

      // 4. Execute Business Logic
      const result = await handler.execute({
        taskId,
        identifier,
        upstreamIdentifier,
        input,
        allocatedKey: allocatedConfig?.key, // 传递借到的 Key
        updateProgress: async (progress: number, message: string) => {
          console.log(`[Task ${taskId} Progress]: ${progress}% - ${message}`);
        }
      });
      
      const costTime = Date.now() - startTime;

      // 4. Update Success State
      await prisma.taskJob.update({
        where: { id: taskId },
        data: {
          state: "SUCCESS",
          resultJson: result as any,
          costTime,
          completeTime: new Date(),
        },
      });

      // 5. Trigger Success Webhook
      await sendWebhookWithRetry(taskId);
    } catch (err: any) {
      // 检查是否为上游并发超限 (429 / Too many requests)
      const errLower = err.message?.toLowerCase() || "";
      if (allocatedConfig && (errLower.includes("429") || errLower.includes("too many requests") || errLower.includes("rate limit"))) {
        console.warn(`[Task ${taskId}] Upstream 429 detected for ${handler.platform}. Cooling down key...`);
        await upstreamKeyService.cooldownKey(allocatedConfig, 15); // 冷却 15 秒
        allocatedConfig = null; // 置空，防止 finally 里重复归还
      }

      const maxAttempts = job.opts.attempts || 1;
      const currentAttempt = job.attemptsMade + 1;

      // 如果是并发超限或正常的重试，则抛出错误触发 BullMQ 重试
      if (currentAttempt < maxAttempts || errLower.includes("upstreambusy")) {
        console.warn(`[Task ${taskId}] Execution failed/Busy (Attempt ${currentAttempt}/${maxAttempts}). Retrying... Error: ${err.message}`);
        throw err;
      }

      console.error(`[Task ${taskId}] Execution failed finally after ${maxAttempts} attempts. Error: ${err.message}`);
      const costTime = Date.now() - startTime;

      // 提取原始错误详情供后台排查 (Shadow Record)
      const rawError = {
        message: err.message,
        stack: err.stack,
        status: err.response?.status || err.status || null,
        responseData: err.response?.data || null,
      };

      // 业务端友好的错误脱敏与标准化
      let failCode = "TASK_EXECUTION_ERROR";
      let failMsg = "任务执行过程中发生未知错误";

      if (errLower.includes("timeout")) {
        failCode = "TIMEOUT";
        failMsg = "任务执行超时";
      } else if (err.response || errLower.includes("upstream")) {
        failCode = "UPSTREAM_ERROR";
        failMsg = "上游服务异常或暂时不可用，请稍后重试";
      } else if (err.message) {
        // 尝试透传一些非敏感的已知错误，如果觉得仍然敏感，可以统一覆盖
        failMsg = err.message;
      }

      // 6. Update Failure State
      await prisma.taskJob.update({
        where: { id: taskId },
        data: {
          state: "FAILED",
          failCode,
          failMsg,
          rawError: rawError as any,
          costTime,
          completeTime: new Date(),
        },
      });

      // 7. Trigger Failure Webhook
      await sendWebhookWithRetry(taskId);

      throw err;
    } finally {
      // 8. 归还名额
      if (allocatedConfig) {
        await upstreamKeyService.returnKey(allocatedConfig);
      }
    }
  }, { concurrency: 3 } as any);

  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    // 过滤掉正常的排队重试日志，减少噪音
    if (!err.message.includes("UpstreamBusy")) {
      console.error(`❌ Job ${job?.id} failed: ${err.message}`);
    }
  });

  return worker;
}
