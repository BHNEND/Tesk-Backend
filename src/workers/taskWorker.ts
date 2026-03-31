import { prisma } from "../config/prisma.js";
import { createWorker } from "../config/bullmq.js";
import type { Job } from "bullmq";
import { sendWebhookWithRetry } from "../services/webhook.js";

async function mockAIProcessing(model: string, input: any): Promise<any> {
  // Mock AI: random delay 5-10s, random success/failure
  const delay = 5000 + Math.random() * 5000;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // 10% chance of failure for testing
  if (Math.random() < 0.1) {
    throw new Error("AI model inference failed");
  }

  return {
    output: {
      result_url: `https://example.com/results/${Date.now()}.png`,
      prompt: input.prompt || "test prompt",
    },
    usage: {
      input_tokens: 100,
      output_tokens: 50,
    },
  };
}

export function startWorker() {
  const worker = createWorker("task-processing", async (job: Job) => {
    const { taskId, model, input } = job.data;

    // Update state to RUNNING
    await prisma.taskJob.update({
      where: { taskNo: taskId },
      data: { state: "RUNNING" },
    });

    const startTime = Date.now();

    try {
      const result = await mockAIProcessing(model, input);
      const costTime = Date.now() - startTime;

      // Update state to SUCCESS
      await prisma.taskJob.update({
        where: { taskNo: taskId },
        data: {
          state: "SUCCESS",
          resultJson: result as any,
          costTime,
          completedAt: new Date(),
        },
      });

      // Send webhook callback
      await sendWebhookWithRetry(taskId);
    } catch (err: any) {
      const costTime = Date.now() - startTime;

      // Update state to FAILED
      await prisma.taskJob.update({
        where: { taskNo: taskId },
        data: {
          state: "FAILED",
          failCode: 500,
          failMsg: err.message || "Unknown error",
          costTime,
          completedAt: new Date(),
        },
      });

      // Send webhook callback for failure
      await sendWebhookWithRetry(taskId);
    }
  }, { concurrency: 3 } as any);

  worker.on("completed", (job) => {
    console.log(`✅ Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`❌ Job ${job?.id} failed: ${err.message}`);
  });

  return worker;
}
