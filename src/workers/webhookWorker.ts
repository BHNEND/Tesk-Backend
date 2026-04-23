import { createWorker, createQueue } from "../config/bullmq.js";
import { sendWebhookWithRetry } from "../services/webhook.js";
import type { Job } from "bullmq";

const webhookQueue = createQueue("webhook-delivery");

export async function enqueueWebhook(taskId: string) {
  await webhookQueue.add(`webhook-${taskId}`, { taskId }, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  });
}

export function startWebhookWorker() {
  return createWorker("webhook-delivery", async (job: Job) => {
    const { taskId } = job.data;
    await sendWebhookWithRetry(taskId);
  }, { concurrency: 10 });
}
