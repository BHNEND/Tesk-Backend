import { prisma } from "../config/prisma.js";
import { enqueueWebhook } from "../workers/webhookWorker.js";

const TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

export function startTimeoutChecker() {
  setInterval(async () => {
    try {
      const threshold = new Date(Date.now() - TIMEOUT_MS);
      const timedOutTasks = await prisma.taskJob.findMany({
        where: {
          state: "RUNNING",
          updateTime: { lt: threshold },
        },
      });

      for (const task of timedOutTasks) {
        console.warn(`Task ${task.id} timed out (30 min), marking as FAILED`);

        await prisma.taskJob.update({
          where: { id: task.id },
          data: {
            state: "FAILED",
            failCode: "TIMEOUT",
            failMsg: "Timeout Exception",
            completeTime: new Date(),
          },
        });

        // Send webhook notification for timeout (async via queue)
        await enqueueWebhook(task.id);
      }
    } catch (err) {
      console.error("Timeout checker error:", err);
    }
  }, CHECK_INTERVAL_MS);

  console.log("Timeout checker started (30 min threshold, check every 60s)");
}
