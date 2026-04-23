import { TaskHandler, TaskHandlerContext, HandlerPreview } from "../interface.js";
import { env } from "../../../config/env.js";
import { prisma } from "../../../config/prisma.js";
import { StandardTaskInput } from "../../../types/task.js";
import { fetchWithTimeout } from "../../../utils/fetchWithTimeout.js";

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

    // 1. 基础字段精确映射（仅覆盖，不传则保留模板默认值）
    if (desc === "prompt" && input.prompt !== undefined) node.fieldValue = input.prompt;
    else if (desc === "aspect_ratio" && input.aspect_ratio !== undefined) node.fieldValue = input.aspect_ratio;
    else if (desc === "resolution" && input.resolution !== undefined) node.fieldValue = input.resolution;
    else if (desc === "duration" && input.duration !== undefined) node.fieldValue = input.duration;

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

  async preview(input: any, identifier: string): Promise<HandlerPreview> {
    const strategy = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
    if (!strategy) throw new Error(`RunningHub strategy not configured for appName: ${identifier}.`);

    const strategyConfig = (strategy.config as any) || {};
    let templateList = [];
    if (Array.isArray(strategyConfig)) templateList = strategyConfig;
    else if (strategyConfig.nodeInfoList && Array.isArray(strategyConfig.nodeInfoList)) templateList = strategyConfig.nodeInfoList;

    const nodeInfoList = fillNodeInfoList(templateList, input as StandardTaskInput);
    const upstreamAppId = strategy.appId || identifier;

    return {
      url: `${RUNNINGHUB_BASE_URL}/run/ai-app/${upstreamAppId}`,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ***",
      },
      body: {
        ...(typeof strategyConfig === 'object' && !Array.isArray(strategyConfig) ? strategyConfig : {}),
        nodeInfoList,
      },
      meta: { identifier, handler: "runningHubHandler", platform: "runninghub" },
    };
  },

  async execute(ctx: TaskHandlerContext): Promise<any> {
    const { identifier, input, allocatedKey } = ctx;

    const apiKey = allocatedKey || env.runningHubApiKey;
    if (!apiKey) {
      throw new Error("Missing RUNNINGHUB_API_KEY in environment variables and no allocatedKey");
    }

    const strategy = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
    if (!strategy) {
      throw new Error(`RunningHub strategy not configured for appName: ${identifier}.`);
    }

    const strategyConfig = (strategy.config as any) || {};
    let templateList = [];
    if (Array.isArray(strategyConfig)) templateList = strategyConfig;
    else if (strategyConfig.nodeInfoList && Array.isArray(strategyConfig.nodeInfoList)) templateList = strategyConfig.nodeInfoList;

    if (templateList.length === 0) {
      console.warn(`[RunningHub] Warning: No nodeInfoList found in config for App ${identifier}`);
    }

    const nodeInfoList = fillNodeInfoList(templateList, input as StandardTaskInput);
    const rhPayload = {
      ...(typeof strategyConfig === 'object' && !Array.isArray(strategyConfig) ? strategyConfig : {}),
      nodeInfoList,
    };

    const submitUrl = `${RUNNINGHUB_BASE_URL}/run/ai-app/${strategy.appId || identifier}`;

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

    const submitRes = await fetchWithTimeout(submitUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(rhPayload),
    }, 30_000);

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

    const queryUrl = `${RUNNINGHUB_BASE_URL}/query`;
    let attempts = 0;
    const maxAttempts = 120;

    while (attempts < maxAttempts) {
      attempts++;

      const queryRes = await fetchWithTimeout(queryUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ taskId: rhTaskId }),
      }, 15_000);

      if (!queryRes.ok) {
        console.error(`[RunningHub] Query error: ${queryRes.status}`);
      } else {
        const queryData = await queryRes.json();
        const status = queryData.status;

        if (status === "SUCCESS") {
          console.log(`[RunningHub] Task ${rhTaskId} SUCCESS`);
          return {
            resultUrls: (queryData.results || []).map((r: any) => r.url),
            metadata: {
              provider: "runninghub",
              rhTaskId: queryData.taskId,
              usage: queryData.usage,
              results: queryData.results,
            },
          };
        }

        if (status === "FAILED") {
          throw new Error(`RunningHub task failed: ${queryData.errorMessage || "Unknown error"}`);
        }

        await ctx.updateProgress(
          Math.min(15 + attempts * 2, 95),
          `Status: ${status} (Attempt ${attempts})`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("RunningHub task timed out after 10 minutes");
  },
};
