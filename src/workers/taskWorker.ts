import { prisma } from "../config/prisma.js";
import { createWorker } from "../config/bullmq.js";
import type { Job } from "bullmq";
import { enqueueWebhook } from "./webhookWorker.js";
import { getTaskHandlerDynamic, getFallbackHandler } from "./registry.js";
import { upstreamKeyService } from "../services/upstreamKeyService.js";
import { env } from "../config/env.js";

function memMB(): number {
  return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
}

function memSnapshot() {
  const m = process.memoryUsage();
  return {
    rss: Math.round(m.rss / 1024 / 1024),
    heapUsed: Math.round(m.heapUsed / 1024 / 1024),
    heapTotal: Math.round(m.heapTotal / 1024 / 1024),
    external: Math.round(m.external / 1024 / 1024),
  };
}

export function startWorker() {
  // 每 30 秒输出一次进程内存概览
  setInterval(() => {
    const m = memSnapshot();
    console.log(`[MEM] pid=${process.pid} rss=${m.rss}MB heap=${m.heapUsed}/${m.heapTotal}MB ext=${m.external}MB`);
  }, 30_000).unref();

  const worker = createWorker("task-processing", async (job: Job) => {
    const { taskId, taskType, identifier, input } = job.data;

    await prisma.taskJob.update({
      where: { id: taskId },
      data: { state: "RUNNING" },
    });

    const startTime = Date.now();
    const memBefore = memMB();

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

      if (!allocatedConfig && upstreamKeyService.hasConfigForPlatform(handler.platform)) {
        console.log(`[Task ${taskId}] All keys for ${handler.platform} are busy, waiting in queue...`);
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
        allocatedKey: allocatedConfig?.key,
        updateProgress: async (progress: number, message: string) => {
          console.log(`[Task ${taskId} Progress]: ${progress}% - ${message}`);
        }
      });

      const costTime = Date.now() - startTime;
      const memAfter = memMB();
      const memDelta = memAfter - memBefore;

      console.log(
        `[MEM] task=${taskId} handler=${handler.platform || 'mock'}/${identifier}` +
        ` time=${costTime}ms mem=${memBefore}→${memAfter}MB (${memDelta >= 0 ? '+' : ''}${memDelta}MB)`
      );

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

      // 5. Trigger Success Webhook (async via queue)
      await enqueueWebhook(taskId);
    } catch (err: any) {
      const errLower = err.message?.toLowerCase() || "";
      if (allocatedConfig && (errLower.includes("429") || errLower.includes("too many requests") || errLower.includes("rate limit"))) {
        console.warn(`[Task ${taskId}] Upstream 429 detected for ${handler.platform}. Cooling down key...`);
        await upstreamKeyService.cooldownKey(allocatedConfig, 15);
        allocatedConfig = null;
      }

      const maxAttempts = job.opts.attempts || 1;
      const currentAttempt = job.attemptsMade + 1;

      if (currentAttempt < maxAttempts || errLower.includes("upstreambusy")) {
        console.warn(`[Task ${taskId}] Execution failed/Busy (Attempt ${currentAttempt}/${maxAttempts}). Retrying... Error: ${err.message}`);
        throw err;
      }

      console.error(`[Task ${taskId}] Execution failed finally after ${maxAttempts} attempts. Error: ${err.message}`);
      const costTime = Date.now() - startTime;
      const memAfter = memMB();
      const memDelta = memAfter - memBefore;

      console.log(
        `[MEM] task=${taskId} handler=${handler.platform || 'mock'}/${identifier}` +
        ` FAILED time=${costTime}ms mem=${memBefore}→${memAfter}MB (${memDelta >= 0 ? '+' : ''}${memDelta}MB)`
      );

      const rawError = {
        message: err.message,
        stack: err.stack,
        status: err.response?.status || err.status || null,
        responseData: err.response?.data || null,
      };

      let failCode = "TASK_EXECUTION_ERROR";
      let failMsg = "任务执行过程中发生未知错误";

      if (errLower.includes("timeout")) {
        failCode = "TIMEOUT";
        failMsg = "任务执行超时";
      } else if (err.response || errLower.includes("upstream")) {
        failCode = "UPSTREAM_ERROR";
        failMsg = "上游服务异常或暂时不可用，请稍后重试";
      } else if (err.message) {
        failMsg = err.message;
      }

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

      await enqueueWebhook(taskId);

      throw err;
    } finally {
      if (allocatedConfig) {
        await upstreamKeyService.returnKey(allocatedConfig);
      }
    }
  }, {
    concurrency: env.workerConcurrency,
    lockDuration: 5 * 60 * 1000,
    maxStalledCount: 2,
  });

  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    if (!err.message.includes("UpstreamBusy")) {
      console.error(`❌ Job ${job?.id} failed: ${err.message}`);
    }
  });

  return worker;
}
