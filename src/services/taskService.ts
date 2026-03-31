import { createQueue } from "../config/bullmq.js";
import { prisma } from "../config/prisma.js";
import { CreateTaskBody } from "../types/task.js";

const taskQueue = createQueue("task-processing");

export async function createTask(body: CreateTaskBody) {
  const taskId = `task_${Date.now()}`;

  await prisma.taskJob.create({
    data: {
      taskNo: taskId,
      model: body.model,
      state: "PENDING",
      param: body.input as any,
      callBackUrl: body.callBackUrl,
      progressCallBackUrl: body.progressCallBackUrl,
    },
  });

  await taskQueue.add(taskId, {
    taskId,
    model: body.model,
    input: body.input,
  });

  return { taskId };
}

export async function getTaskInfo(taskId: string) {
  const task = await prisma.taskJob.findUnique({
    where: { taskNo: taskId },
  });

  if (!task) {
    return null;
  }

  return {
    taskNo: task.taskNo,
    model: task.model,
    state: task.state,
    param: task.param,
    resultJson: task.resultJson,
    callBackUrl: task.callBackUrl,
    progressCallBackUrl: task.progressCallBackUrl,
    failCode: task.failCode,
    failMsg: task.failMsg,
    costTime: task.costTime,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
  };
}
