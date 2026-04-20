import { v4 as uuidv4 } from "uuid";
import { createQueue } from "../config/bullmq.js";
import { prisma } from "../config/prisma.js";
import { CreateTaskBody, StandardTaskInput } from "../types/task.js";
import { fillNodeInfoList } from "../workers/handlers/apps/runningHubHandler.js";
import { ApiKey } from "@prisma/client";

const taskQueue = createQueue("task-processing");

/**
 * 预览任务转换结果（模拟映射，不执行）
 */
export async function previewTask(body: CreateTaskBody) {
  const taskType = body.type || 'model';
  const identifier = taskType === 'app' ? (body as any).appid : (body as any).model;

  if (taskType === 'app') {
    const strategy = await prisma.appStrategy.findUnique({ where: { appId: identifier } });
    if (!strategy) throw new Error(`App Strategy not found for: ${identifier}`);

    const strategyConfig = (strategy.config as any) || {};
    let templateList = [];
    if (Array.isArray(strategyConfig)) {
      templateList = strategyConfig;
    } else if (strategyConfig.nodeInfoList && Array.isArray(strategyConfig.nodeInfoList)) {
      templateList = strategyConfig.nodeInfoList;
    }

    const nodeInfoList = fillNodeInfoList(templateList, body.input as StandardTaskInput);

    return {
      url: `https://www.runninghub.cn/openapi/v2/run/ai-app/${strategy.appId}`,
      method: "POST",
      body: {
        ...(typeof strategyConfig === 'object' && !Array.isArray(strategyConfig) ? strategyConfig : {}),
        nodeInfoList
      }
    };
  }

  return { msg: "Currently only App (RunningHub) tasks support preview mapping." };
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
    attempts: 3,
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
    rawError: task.rawError, // 新增：供后台展示的原始错误
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
