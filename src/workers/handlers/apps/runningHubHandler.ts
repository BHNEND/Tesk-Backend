import { TaskHandler, TaskHandlerContext } from "../interface.js";
import { env } from "../../../config/env.js";
import { prisma } from "../../../config/prisma.js";
import { StandardTaskInput } from "../../../types/task.js";

const RUNNINGHUB_BASE_URL = "https://www.runninghub.cn/openapi/v2";
/**
 * 将标准输入转换为 RunningHub 定制化的 nodeInfoList 格式
 * 采用固定映射逻辑：基于 description 的精确匹配
 */
export function fillNodeInfoList(templateList: any[], input: StandardTaskInput): any[] {
  console.log(`[Mapping] Starting fixed mapping with ${templateList?.length || 0} nodes.`);
  if (!Array.isArray(templateList)) return [];

  const newList = JSON.parse(JSON.stringify(templateList));

  return newList.map((node: any) => {
    const desc = (node.description || "").trim().toLowerCase();
    
    // 1. 基础字段精确映射
    if (desc === "prompt") node.fieldValue = input.prompt;
    else if (desc === "aspect_ratio") node.fieldValue = input.aspect_ratio;
    else if (desc === "resolution") node.fieldValue = input.resolution;
    else if (desc === "duration") node.fieldValue = input.duration;

    // 2. 媒体数组索引映射 (如 image1, image2...)
    else if (desc.startsWith("image")) {
      const index = parseInt(desc.replace("image", "")) - 1;
      if (!isNaN(index) && input.image_urls && input.image_urls[index]) {
        node.fieldValue = input.image_urls[index];
      }
    }
    else if (desc.startsWith("video")) {
      const index = parseInt(desc.replace("video", "")) - 1;
      if (!isNaN(index) && input.video_urls && input.video_urls[index]) {
        node.fieldValue = input.video_urls[index];
      }
    }
    else if (desc.startsWith("audio")) {
      const index = parseInt(desc.replace("audio", "")) - 1;
      if (!isNaN(index) && input.audio_urls && input.audio_urls[index]) {
        node.fieldValue = input.audio_urls[index];
      }
    }

    // 3. 自定义参数映射 (extra 里的精确匹配)
    else if (input.extra) {
      // 这里的 extra key 匹配时不强制转小写，保持灵活性
      const originalDesc = (node.description || "").trim();
      if (input.extra[originalDesc] !== undefined) {
        node.fieldValue = input.extra[originalDesc];
      }
    }

    return node;
  });
}

export const runningHubHandler: TaskHandler = {
  platform: "runninghub",
  async execute(ctx: TaskHandlerContext): Promise<any> {
    const { identifier, input, allocatedKey } = ctx;
    
    // 优先使用动态借用的 Key，如果没有则回退到默认的环境变量
    const apiKey = allocatedKey || env.runningHubApiKey;

    if (!apiKey) {
      throw new Error("Missing RUNNINGHUB_API_KEY in environment variables and no allocatedKey");
    }

    // 1. 从数据库读取该应用的定制配置 (appId 即为 RunningHub 真实的数字 ID)
    const strategy = await prisma.appStrategy.findUnique({
      where: { appId: identifier }
    });

    if (!strategy) {
      throw new Error(`RunningHub strategy not configured for appId: ${identifier}.`);
    }

    // 2. 获取配置并构造最终发送给 RunningHub 的 Payload
    const strategyConfig = (strategy.config as any) || {};
    
    // 兼容性处理：尝试从 config 或 config.nodeInfoList 获取列表
    let templateList = [];
    if (Array.isArray(strategyConfig)) {
      templateList = strategyConfig;
    } else if (strategyConfig.nodeInfoList && Array.isArray(strategyConfig.nodeInfoList)) {
      templateList = strategyConfig.nodeInfoList;
    }

    if (templateList.length === 0) {
      console.warn(`[RunningHub] Warning: No nodeInfoList found in config for App ${identifier}`);
    }
    
    // 映射并填充节点列表
    const nodeInfoList = fillNodeInfoList(templateList, input as StandardTaskInput);

    // 构造最终 Payload
    const rhPayload = {
      ...(typeof strategyConfig === 'object' && !Array.isArray(strategyConfig) ? strategyConfig : {}),
      nodeInfoList
    };

    // 3. 构建提交 URL (使用真实的 appId)
    const submitUrl = `${RUNNINGHUB_BASE_URL}/run/ai-app/${strategy.appId}`;

    // 记录发送给上游的真实请求，用于测试页面调试
    await prisma.taskJob.update({
      where: { id: ctx.taskId },
      data: {
        upstreamRequest: {
          url: submitUrl,
          method: "POST",
          body: rhPayload
        } as any
      }
    });

    console.log(`[RunningHub] DEBUG - Final Payload for App ${strategy.appId}:`, JSON.stringify(rhPayload, null, 2));
    
    // 4. 提交任务
    const submitRes = await fetch(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(rhPayload),
    });

    if (!submitRes.ok) {
      const errorText = await submitRes.text();
      throw new Error(`RunningHub submission failed: ${submitRes.status} - ${errorText}`);
    }

    const submitData = await submitRes.json();
    const rhTaskId = submitData.taskId;

    if (!rhTaskId) {
      throw new Error(`RunningHub did not return a taskId: ${JSON.stringify(submitData)}`);
    }

    console.log(`[RunningHub] Task submitted. RH TaskId: ${rhTaskId}`);
    await ctx.updateProgress(10, `Task submitted to RunningHub: ${rhTaskId}`);

    // 3. Polling Loop
    const queryUrl = `${RUNNINGHUB_BASE_URL}/query`;
    let attempts = 0;
    const maxAttempts = 120; // 10 minutes (120 * 5s)

    while (attempts < maxAttempts) {
      attempts++;
      
      const queryRes = await fetch(queryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ taskId: rhTaskId }),
      });

      if (!queryRes.ok) {
        console.error(`[RunningHub] Query error: ${queryRes.status}`);
      } else {
        const queryData = await queryRes.json();
        const status = queryData.status;

        if (status === "SUCCESS") {
          console.log(`[RunningHub] Task ${rhTaskId} SUCCESS`);
          return queryData; // Return the whole response as resultJson
        }

        if (status === "FAILED") {
          throw new Error(`RunningHub task failed: ${queryData.errorMessage || "Unknown error"}`);
        }

        // Still running or queued
        await ctx.updateProgress(
          Math.min(15 + attempts * 2, 95), 
          `Status: ${status} (Attempt ${attempts})`
        );
      }

      // Wait 5 seconds before next poll
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("RunningHub task timed out after 10 minutes");
  },
};
