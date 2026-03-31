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

export async function sendWebhookWithRetry(taskNo: string) {
  const task = await prisma.taskJob.findUnique({ where: { taskNo } });
  if (!task || !task.callBackUrl) return;

  const payload = {
    taskNo: task.taskNo,
    model: task.model,
    state: task.state,
    param: task.param,
    resultJson: task.resultJson,
    failCode: task.failCode,
    failMsg: task.failMsg,
    costTime: task.costTime,
    createdAt: task.createdAt,
    completedAt: task.completedAt,
  };

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`🔄 Webhook retry ${attempt + 1}/${MAX_RETRIES} for ${taskNo}, waiting ${RETRY_DELAYS[attempt - 1]}ms`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[attempt - 1]));
    }

    const success = await sendWebhook(task.callBackUrl, payload, WEBHOOK_TIMEOUT);
    if (success) {
      console.log(`✅ Webhook delivered for ${taskNo} (attempt ${attempt + 1})`);
      return;
    }
  }

  console.error(`❌ Webhook failed after ${MAX_RETRIES} retries for ${taskNo}`);
}
