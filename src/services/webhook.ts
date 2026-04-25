import { getTaskInfo, getPublicTaskInfo } from "./taskService.js";
import { prisma } from "../config/prisma.js";

const WEBHOOK_TIMEOUT = 5000;
const RETRY_DELAYS = [10000, 30000, 60000];
const MAX_RETRIES = 3;

async function sendWebhook(url: string, payload: any, timeout: number): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timer);
    return response.ok;
  } catch {
    clearTimeout(timer);
    return false;
  }
}

export async function sendWebhookWithRetry(taskId: string) {
  const taskInfo = await getTaskInfo(taskId);
  if (!taskInfo || !taskInfo.callBackUrl) return;

  const publicInfo = await getPublicTaskInfo(taskId);

  const payload = {
    code: 200,
    msg: "success",
    data: publicInfo,
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`Webhook retry ${attempt + 1}/${MAX_RETRIES} for ${taskId}, waiting ${RETRY_DELAYS[attempt - 1]}ms`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }

    const success = await sendWebhook(taskInfo.callBackUrl, payload, WEBHOOK_TIMEOUT);

    if (success) {
      console.log(`Webhook delivered for ${taskId} (attempt ${attempt + 1})`);
      await prisma.taskJob.update({
        where: { id: taskId },
        data: { webhookStatus: "delivered", webhookAttempts: attempt + 1, webhookLastTime: new Date() },
      });
      return;
    }

    // 记录每次失败的尝试
    await prisma.taskJob.update({
      where: { id: taskId },
      data: { webhookAttempts: attempt + 1, webhookLastTime: new Date() },
    }).catch(() => {});
  }

  // 全部失败
  await prisma.taskJob.update({
    where: { id: taskId },
    data: { webhookStatus: "failed", webhookAttempts: MAX_RETRIES, webhookLastTime: new Date() },
  }).catch(() => {});

  console.error(`Webhook dead letter: failed after ${MAX_RETRIES} retries for ${taskId}`);
}
