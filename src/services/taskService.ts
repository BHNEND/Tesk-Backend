import { v4 as uuidv4 } from "uuid";
import { createQueue } from "../config/bullmq.js";
import { prisma } from "../config/prisma.js";
import { CreateTaskBody, StandardTaskInput } from "../types/task.js";
import { availableHandlers } from "../workers/registry.js";
import { ApiKey } from "@prisma/client";

const taskQueue = createQueue("task-processing");

/**
 * 预览任务转换结果（模拟映射，不执行）
 */
export async function previewTask(body: CreateTaskBody) {
  const taskType = body.type || 'model';
  const identifier = taskType === 'app' ? (body as any).appid : (body as any).model;

  // 从数据库查找策略，获取 handler 名称和上游标识
  let handlerName: string | undefined;
  let upstreamIdentifier: string = identifier;
  if (taskType === 'app') {
    const strategy = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
    if (!strategy) throw new Error(`App Strategy not found for: ${identifier}`);
    handlerName = strategy.handler;
    upstreamIdentifier = strategy.appId || identifier;
  } else {
    const strategy = await prisma.modelStrategy.findUnique({ where: { modelName: identifier } });
    if (!strategy) throw new Error(`Model Strategy not found for: ${identifier}`);
    handlerName = strategy.handler;
    upstreamIdentifier = strategy.modelId || identifier;
  }

  const handler = availableHandlers[handlerName];
  if (!handler?.preview) {
    return { msg: `Handler '${handlerName}' does not support preview.` };
  }

  return (handler as any).preview(body.input, identifier, upstreamIdentifier);
}

export async function createTask(body: CreateTaskBody, apiKeyData?: ApiKey) {
  // 1. 行业标准：并发限制 (Concurrency Limit Control)
  if (apiKeyData) {
    const runningCount = await prisma.taskJob.count({
      where: {
        apiKeyId: apiKeyData.id,
        state: { in: ["PENDING", "RUNNING"] }
      }
    });

    if (runningCount >= apiKeyData.concurrencyLimit) {
      const err = new Error(`Concurrency limit reached: max ${apiKeyData.concurrencyLimit} active tasks allowed.`);
      (err as any).status = 429;
      throw err;
    }
  }

  const taskId = `task_${uuidv4()}`;
  const taskType = body.type || 'model';
  const identifier = taskType === 'app' ? (body as any).appid : (body as any).model;

  // 2. 创建持久化记录 (并关联 API Key ID)
  await prisma.taskJob.create({
    data: {
      id: taskId,
      apiKeyId: apiKeyData?.id,
      taskType: taskType,
      model: taskType === 'model' ? identifier : null,
      appid: taskType === 'app' ? identifier : null,
      param: body.input as any,
      callBackUrl: body.callBackUrl,
      progressCallBackUrl: body.progressCallBackUrl,
    },
  });

  // 3. 加入 BullMQ 异步队列
  await taskQueue.add(taskId, {
    taskId,
    taskType: taskType,
    identifier: identifier,
    callBackUrl: body.callBackUrl,
    input: body.input,
  }, {
    attempts: 10,
    backoff: { type: 'exponential', delay: 5000 },
  });

  return { taskId };
}

export async function getTaskInfo(taskId: string) {
  const task = await prisma.taskJob.findUnique({
    where: { id: taskId },
  });

  if (!task) return null;

  return {
    taskId: task.id,
    apiKeyId: task.apiKeyId,
    upstreamTaskId: task.upstreamTaskId,
    taskType: task.taskType,
    model: task.model,
    appid: task.appid,
    state: task.state,
    param: task.param,
    resultJson: task.resultJson,
    upstreamRequest: task.upstreamRequest,
    rawError: task.rawError,
    callBackUrl: task.callBackUrl,
    progressCallBackUrl: task.progressCallBackUrl,
    failCode: task.failCode,
    failMsg: task.failMsg,
    costTime: task.costTime,
    createTime: task.createTime.getTime(),
    updateTime: task.updateTime.getTime(),
    completeTime: task.completeTime ? task.completeTime.getTime() : null,
  };
}

export async function getPublicTaskInfo(taskId: string) {
  const info = await getTaskInfo(taskId);
  if (!info) return null;

  return {
    taskId: info.taskId,
    taskType: info.taskType,
    model: info.model,
    appid: info.appid,
    state: info.state,
    param: info.param,
    resultJson: info.resultJson,
    failCode: info.failCode || "",
    failMsg: info.failMsg || "",
    costTime: info.costTime,
    createTime: info.createTime,
    updateTime: info.updateTime,
    completeTime: info.completeTime,
  };
}
