import { prisma } from "../config/prisma.js";
import { sendWebhookWithRetry } from "./webhook.js";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

export function startTimeoutChecker() {
  setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - TIMEOUT_MS);
      const timedOutTasks = await prisma.taskJob.findMany({
        where: {
          state: "RUNNING",
          createdAt: { lt: threshold },
        },
      });

      for (const task of timedOutTasks) {
        console.warn(`⏰ Task ${task.taskNo} timed out (30 min), marking as FAILED`);

        await prisma.taskJob.update({
          where: { taskNo: task.taskNo },
          data: {
            state: "FAILED",
            failCode: 408,
            failMsg: "Timeout Exception",
            completedAt: new Date(),
          },
        });

        // Send webhook notification for timeout
        await sendWebhookWithRetry(task.taskNo);
      }
    } catch (err) {
      console.error("Timeout checker error:", err);
    }
  }, CHECK_INTERVAL_MS);

  console.log("⏰ Timeout checker started (30 min threshold, check every 60s)");
}
