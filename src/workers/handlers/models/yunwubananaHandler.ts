import { TaskHandler, TaskHandlerContext, HandlerPreview } from "../interface.js";
import { env } from "../../../config/env.js";
import {
  buildGeminiRequestBody,
  buildUpstreamBody,
  buildUpstreamUrl,
  downloadAsBase64,
  processGeminiResponse,
} from "./geminiImageUtils.js";
import { fetchWithTimeout } from "../../../utils/fetchWithTimeout.js";

const DEFAULT_MODEL = "gemini-2.5-flash-image";
const ALLOWED_ASPECTS = new Set(["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9", "auto"]);
const ALLOWED_RESOLUTIONS = null; // 2.5-flash does not support imageSize
const MAX_IMAGES = 3;

export const yunwubananaHandler: TaskHandler = {
  preview(input: any, identifier?: string, upstreamIdentifier?: string): HandlerPreview {
    const id = identifier || "yunwubanana";
    const upstreamId = upstreamIdentifier || DEFAULT_MODEL;
    const parsed = buildGeminiRequestBody(input, upstreamId, ALLOWED_ASPECTS, ALLOWED_RESOLUTIONS, MAX_IMAGES);

    const body = buildUpstreamBody(
      parsed.prompt, [], parsed.responseModalities,
      parsed.aspectRatio, parsed.resolution,
    );

    return {
      url: buildUpstreamUrl(upstreamId),
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer ***" },
      body,
      meta: { identifier: id, handler: "yunwubanana", platform: "yunwu-gemini" },
    };
  },

  async execute(ctx: TaskHandlerContext): Promise<any> {
    const input = ctx.input || {};
    const apiKey = ctx.allocatedKey || env.geminiApiKey;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY in environment variables");

    const upstreamId = ctx.upstreamIdentifier || ctx.identifier || DEFAULT_MODEL;
    const parsed = buildGeminiRequestBody(input, upstreamId, ALLOWED_ASPECTS, ALLOWED_RESOLUTIONS, MAX_IMAGES);

    // 1. Download images to base64
    await ctx.updateProgress(10, `Downloading ${parsed.imageUrls.length} image(s)`);
    const base64Images: { data: string; mimeType: string }[] = [];
    for (let i = 0; i < parsed.imageUrls.length; i++) {
      const result = await downloadAsBase64(parsed.imageUrls[i]);
      base64Images.push(result);
      await ctx.updateProgress(10 + Math.round(((i + 1) / parsed.imageUrls.length) * 30), `Downloaded image ${i + 1}/${parsed.imageUrls.length}`);
    }

    // 2. Build and send request
    await ctx.updateProgress(40, "Submitting Gemini request");
    const body = buildUpstreamBody(parsed.prompt, base64Images, parsed.responseModalities, parsed.aspectRatio, parsed.resolution);

    const response = await fetchWithTimeout(buildUpstreamUrl(upstreamId), {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    }, 120_000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`yunwubanana request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    // 3. Process response → upload to S3
    await ctx.updateProgress(60, "Processing response");
    const { resultUrls, texts } = await processGeminiResponse(data, ctx.taskId, ctx.updateProgress);

    await ctx.updateProgress(100, "Image generation completed");

    return {
      resultUrls,
      metadata: {
        provider: "yunwu-gemini",
        model: upstreamId,
        prompt: parsed.prompt,
        aspectRatio: parsed.aspectRatio || "auto",
        imageCount: parsed.imageUrls.length,
        texts,
      },
    };
  },
};
