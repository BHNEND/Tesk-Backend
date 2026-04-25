import { prisma } from "../config/prisma.js";
import { createWorker } from "../config/bullmq.js";
import type { Job } from "bullmq";
import { enqueueWebhook } from "./webhookWorker.js";
import { getTaskHandlerDynamic, getFallbackHandler } from "./registry.js";
import { upstreamKeyService } from "../services/upstreamKeyService.js";
import { env } from "../config/env.js";

function isFinalError(job: Job, err: any): boolean {
  const maxAttempts = job.opts.attempts || 1;
  const currentAttempt = job.attemptsMade + 1;
  return currentAttempt >= maxAttempts;
}

async function handleFinalFailure(taskId: string, err: any, identifier: string, platform: string | undefined, startTime: number) {
  const costTime = Date.now() - startTime;
  const errLower = err.message?.toLowerCase() || "";

  console.error(`[Task ${taskId}] Failed: ${err.message}`);

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
}

// ─── Model Worker: 高并发，报错重试几次就放弃 ───

export function startWorker() {
  const worker = createWorker("task-processing", async (job: Job) => {
    const { taskId, taskType, identifier, input } = job.data;
    const channel = job.data.channel || "standard";

    await prisma.taskJob.update({
      where: { id: taskId },
      data: { state: "RUNNING" },
    });

    const startTime = Date.now();

    let handler = await getTaskHandlerDynamic(taskType || "model", identifier);
    if (!handler) {
      console.warn(`No specific handler found for ${identifier}, using fallback.`);
      handler = getFallbackHandler(taskType || "model");
    }

    let upstreamIdentifier: string | undefined;
    let strategyApiKeys: string[] | null = null;
    let economyKey: string | null = null;

    if (taskType === 'app') {
      const strategy = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
      upstreamIdentifier = strategy?.appId || identifier;
    } else {
      const strategy = await prisma.modelStrategy.findUnique({ where: { modelName: identifier } });
      upstreamIdentifier = strategy?.modelId || identifier;
      if (strategy?.standardKeys && Array.isArray(strategy.standardKeys) && strategy.standardKeys.length > 0) {
        strategyApiKeys = strategy.standardKeys as string[];
      }
      if (strategy?.economyKey) {
        economyKey = strategy.economyKey;
      }
    }

    const updateProgress = async (progress: number, message: string) => {
      console.log(`[Task ${taskId} Progress]: ${progress}% - ${message}`);
    };

    // ─── Economy 渠道：固定 Key，3 次指数退避重试 ───
    if (channel === "economy") {
      if (!economyKey) {
        const err = new Error("Economy channel not available for this model (no economyKey configured)");
        await handleFinalFailure(taskId, err, identifier, handler.platform, startTime);
        throw err;
      }

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await handler.execute({
            taskId, identifier, upstreamIdentifier, input,
            allocatedKey: economyKey,
            updateProgress,
          });

          const costTime = Date.now() - startTime;
          console.log(`[Task ${taskId}] Economy success via economyKey, cost=${costTime}ms`);

          await prisma.taskJob.update({
            where: { id: taskId },
            data: { state: "SUCCESS", resultJson: result as any, costTime, completeTime: new Date() },
          });

          await enqueueWebhook(taskId);
          return;
        } catch (err: any) {
          console.warn(`[Task ${taskId}] Economy attempt ${attempt}/${maxAttempts} failed: ${err.message}`);

          if (attempt === maxAttempts) {
            await handleFinalFailure(taskId, err, identifier, handler.platform, startTime);
            throw err;
          }

          const delay = Math.pow(2, attempt - 1) * 1000;
          console.log(`[Task ${taskId}] Economy retry ${attempt} → ${attempt + 1}, backoff ${delay}ms`);
          await new Promise(r => setTimeout(r, delay));
        }
      }
    }

    // ─── Standard 渠道：逐层重试 ───
    if (!strategyApiKeys || strategyApiKeys.length === 0) {
      const err = new Error("Standard channel not available for this model (no standardKeys configured)");
      await handleFinalFailure(taskId, err, identifier, handler.platform, startTime);
      throw err;
    }

    {
      const { shouldSkipKey, getCircuitState, recordAttempt, closeCircuit, tripAgain } = await import("../services/circuitBreaker.js");

      const lastErr: any[] = [];

      for (let ki = 0; ki < strategyApiKeys.length; ki++) {
        const key = strategyApiKeys[ki];
        const maxRetry = 3 - ki; // Key A=3, Key B=2, Key C=1

        // 检查熔断（open 状态跳过，half-open 允许尝试）
        const skip = await shouldSkipKey(identifier, ki);
        if (skip) {
          console.log(`[Task ${taskId}] Key${ki} circuit open, skipping`);
          continue;
        }

        const circuitState = await getCircuitState(identifier, ki);
        const isHalfOpen = circuitState === "half-open";
        if (isHalfOpen) {
          console.log(`[Task ${taskId}] Key${ki} circuit half-open, probing`);
        }

        console.log(`[Task ${taskId}] Trying Key${ki} (max ${maxRetry} attempts)`);

        for (let attempt = 1; attempt <= maxRetry; attempt++) {
          try {
            const result = await handler.execute({
              taskId, identifier, upstreamIdentifier, input,
              allocatedKey: key,
              updateProgress,
            });

            const costTime = Date.now() - startTime;
            console.log(`[Task ${taskId}] Success via Key${ki}, cost=${costTime}ms`);

            if (isHalfOpen) {
              await closeCircuit(identifier, ki);
            }

            await prisma.taskJob.update({
              where: { id: taskId },
              data: { state: "SUCCESS", resultJson: result as any, costTime, completeTime: new Date(), usedKeyIndex: ki },
            });

            await recordAttempt(identifier, ki, taskId, true);
            await enqueueWebhook(taskId);
            return;
          } catch (err: any) {
            lastErr.push(err);
            console.warn(`[Task ${taskId}] Key${ki} attempt ${attempt}/${maxRetry} failed: ${err.message}`);

            // 最后一个 key 的最后一次重试 → 最终失败
            if (ki === strategyApiKeys.length - 1 && attempt === maxRetry) {
              await recordAttempt(identifier, ki, taskId, false);
              if (isHalfOpen) await tripAgain(identifier, ki);
              await handleFinalFailure(taskId, err, identifier, handler.platform, startTime);
              throw err;
            }

            // 当前 key 的最后一次重试 → 记录失败，切下一个 key
            if (attempt === maxRetry) {
              await recordAttempt(identifier, ki, taskId, false);
              if (isHalfOpen) {
                await tripAgain(identifier, ki);
              } else {
                console.log(`[Task ${taskId}] Key${ki} exhausted, switching to Key${ki + 1}`);
              }
              break;
            }

            // 指数退避：1s, 2s, 4s...
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`[Task ${taskId}] Key${ki} retry ${attempt} → ${attempt + 1}, backoff ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
          }
        }
      }

      // 所有 key 都用完了（可能全部被熔断跳过）
      const finalErr = lastErr.length > 0 ? lastErr[lastErr.length - 1] : new Error("All keys circuit-broken");
      await handleFinalFailure(taskId, finalErr, identifier, handler.platform, startTime);
      throw finalErr;
    }
  }, {
    concurrency: env.workerConcurrency,
    lockDuration: 15 * 60 * 1000,
    maxStalledCount: 2,
  });

  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed: ${err.message}`);
  });

  console.log(`👷 Model worker started (concurrency: ${env.workerConcurrency})`);
  return worker;
}

// ─── App Worker: 低并发 = 上游 Key 总量，队列自然排队 ───

export function startAppWorker() {
  const worker = createWorker("task-processing-app", async (job: Job) => {
    const { taskId, identifier, input } = job.data;

    await prisma.taskJob.update({
      where: { id: taskId },
      data: { state: "RUNNING" },
    });

    const startTime = Date.now();

    let handler = await getTaskHandlerDynamic("app", identifier);
    if (!handler) {
      console.warn(`No specific handler found for ${identifier}, using fallback.`);
      handler = getFallbackHandler("app");
    }

    // 借用上游 Key
    let allocatedConfig: any = null;
    if (handler.platform) {
      allocatedConfig = await upstreamKeyService.borrowKey(handler.platform);
      if (!allocatedConfig && upstreamKeyService.hasConfigForPlatform(handler.platform)) {
        console.warn(`[Task ${taskId}] No available key for ${handler.platform}, retrying...`);
        throw new Error(`No available key for ${handler.platform}`);
      }
    }

    try {
      const strategy = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
      const upstreamIdentifier = strategy?.appId || identifier;

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
      console.log(`[Task ${taskId}] App task success, cost=${costTime}ms`);

      await prisma.taskJob.update({
        where: { id: taskId },
        data: {
          state: "SUCCESS",
          resultJson: result as any,
          costTime,
          completeTime: new Date(),
        },
      });

      await enqueueWebhook(taskId);
    } catch (err: any) {
      // 429 时冷却 Key
      const errLower = err.message?.toLowerCase() || "";
      if (allocatedConfig && (errLower.includes("429") || errLower.includes("too many requests") || errLower.includes("rate limit"))) {
        console.warn(`[Task ${taskId}] Upstream 429 for ${handler.platform}, cooling down key...`);
        await upstreamKeyService.cooldownKey(allocatedConfig, 15);
        allocatedConfig = null;
      }

      if (isFinalError(job, err)) {
        await handleFinalFailure(taskId, err, identifier, handler.platform, startTime);
      } else {
        console.warn(`[Task ${taskId}] Attempt ${job.attemptsMade + 1} failed, retrying: ${err.message}`);
      }
      throw err;
    } finally {
      if (allocatedConfig) {
        await upstreamKeyService.returnKey(allocatedConfig);
      }
    }
  }, {
    concurrency: env.appWorkerConcurrency,
    lockDuration: 10 * 60 * 1000,
    maxStalledCount: 2,
  });

  worker.on("completed", (job) => {
    console.log(`✅ App Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ App Job ${job?.id} failed: ${err.message}`);
  });

  console.log(`👷 App worker started (concurrency: ${env.appWorkerConcurrency})`);
  return worker;
}
