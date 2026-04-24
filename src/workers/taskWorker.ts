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

function isFinalError(job: Job, err: any): boolean {
  const maxAttempts = job.opts.attempts || 1;
  const currentAttempt = job.attemptsMade + 1;
  return currentAttempt >= maxAttempts;
}

async function handleFinalFailure(taskId: string, err: any, identifier: string, platform: string | undefined, memBefore: number, startTime: number) {
  const costTime = Date.now() - startTime;
  const memAfter = memMB();
  const memDelta = memAfter - memBefore;
  const errLower = err.message?.toLowerCase() || "";

  console.error(`[Task ${taskId}] Failed: ${err.message}`);
  console.log(
    `[MEM] task=${taskId} handler=${platform || 'mock'}/${identifier}` +
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
}

// ─── Model Worker: 高并发，报错重试几次就放弃 ───

export function startWorker() {
  setInterval(() => {
    const m = memSnapshot();
    console.log(`[MEM] pid=${process.pid} type=model rss=${m.rss}MB heap=${m.heapUsed}/${m.heapTotal}MB`);
  }, 30_000).unref();

  const worker = createWorker("task-processing", async (job: Job) => {
    const { taskId, taskType, identifier, input } = job.data;

    await prisma.taskJob.update({
      where: { id: taskId },
      data: { state: "RUNNING" },
    });

    const startTime = Date.now();
    const memBefore = memMB();

    let handler = await getTaskHandlerDynamic(taskType || "model", identifier);
    if (!handler) {
      console.warn(`No specific handler found for ${identifier}, using fallback.`);
      handler = getFallbackHandler(taskType || "model");
    }

    try {
      let upstreamIdentifier: string | undefined;
      if (taskType === 'app') {
        const strategy = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
        upstreamIdentifier = strategy?.appId || identifier;
      } else {
        const strategy = await prisma.modelStrategy.findUnique({ where: { modelName: identifier } });
        upstreamIdentifier = strategy?.modelId || identifier;
      }

      const result = await handler.execute({
        taskId,
        identifier,
        upstreamIdentifier,
        input,
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
      if (isFinalError(job, err)) {
        await handleFinalFailure(taskId, err, identifier, handler.platform, memBefore, startTime);
      } else {
        console.warn(`[Task ${taskId}] Attempt ${job.attemptsMade + 1} failed, retrying: ${err.message}`);
      }
      throw err;
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
  setInterval(() => {
    const m = memSnapshot();
    console.log(`[MEM] pid=${process.pid} type=app rss=${m.rss}MB heap=${m.heapUsed}/${m.heapTotal}MB`);
  }, 30_000).unref();

  const worker = createWorker("task-processing-app", async (job: Job) => {
    const { taskId, identifier, input } = job.data;

    await prisma.taskJob.update({
      where: { id: taskId },
      data: { state: "RUNNING" },
    });

    const startTime = Date.now();
    const memBefore = memMB();

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
      const memAfter = memMB();
      const memDelta = memAfter - memBefore;

      console.log(
        `[MEM] task=${taskId} handler=${handler.platform || 'mock'}/${identifier}` +
        ` time=${costTime}ms mem=${memBefore}→${memAfter}MB (${memDelta >= 0 ? '+' : ''}${memDelta}MB)`
      );

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
        await handleFinalFailure(taskId, err, identifier, handler.platform, memBefore, startTime);
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
