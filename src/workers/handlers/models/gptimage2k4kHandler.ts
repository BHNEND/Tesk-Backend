import { TaskHandler, TaskHandlerContext, HandlerPreview } from "../interface.js";
import { env } from "../../../config/env.js";
import { uploadToS3 } from "../../../config/s3.js";
import { fetchWithTimeout } from "../../../utils/fetchWithTimeout.js";

const ALLOWED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048", "3840x2160", "2160x3840", "auto"]);
const ALLOWED_RESOLUTIONS = new Set(["2k", "4k"]);

function resolveSize(aspectRatio: string, resolution: string) {
  if (aspectRatio === "auto") return "auto";

  if (resolution === "2k") {
    if (aspectRatio === "1:1") return "2048x2048";
    if (aspectRatio === "16:9") return "2048x1152";
    if (aspectRatio === "9:16") return "1152x2048";
    throw new Error("2k supports aspect_ratio: 1:1, 16:9, 9:16, auto");
  }

  if (resolution === "4k") {
    if (aspectRatio === "16:9") return "3840x2160";
    if (aspectRatio === "9:16") return "2160x3840";
    throw new Error("4k supports aspect_ratio: 16:9, 9:16, auto");
  }

  return "auto";
}

const UPSTREAM_URL = "https://yunwu.ai/v1/images/generations";

function buildRequestBody(input: any, identifier: string) {
  const extra = input.extra || {};
  const prompt = String(input.prompt || "").trim();
  const n = Number(extra.n ?? extra.count ?? 1);
  const aspectRatio = String(input.aspect_ratio || "auto").trim();
  const resolution = String(input.resolution || "2k").trim();
  const size = resolveSize(aspectRatio, resolution);

  if (!prompt) throw new Error("Missing required field: prompt");
  if (prompt.length > 32000) throw new Error("prompt must be at most 32000 characters");
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error("n must be an integer between 1 and 10");
  if (!ALLOWED_SIZES.has(size)) throw new Error("size must be one of 2048x2048, 2048x1152, 1152x2048, 3840x2160, 2160x3840, auto");

  return { model: identifier, prompt, n, size };
}

export const gptimage2k4kHandler: TaskHandler = {
  preview(input: any, identifier?: string, upstreamIdentifier?: string): HandlerPreview {
    const id = identifier || "gpt-image-2-2k4k";
    const upstreamId = upstreamIdentifier || id;
    const body = buildRequestBody(input, upstreamId);
    return {
      url: UPSTREAM_URL,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ***",
      },
      body,
      meta: { identifier: id, handler: "gptimage2k4k", platform: "yunwu" },
    };
  },

  async execute(ctx: TaskHandlerContext): Promise<any> {
    const input = ctx.input || {};
    const resolution = String(input.resolution || "2k").trim();
    const apiKey = env.gptImage2ApiKey;

    if (!apiKey) {
      throw new Error("Missing GPTIMAGE2_API_KEY in environment variables");
    }

    if (!ALLOWED_RESOLUTIONS.has(resolution)) {
      throw new Error("resolution must be one of 2k, 4k");
    }

    const upstreamId = ctx.upstreamIdentifier || ctx.identifier;
    const body = buildRequestBody(input, upstreamId);

    await ctx.updateProgress(10, "Submitting image generation request");

    const response = await fetchWithTimeout(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    }, 120_000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`gptimage2k4k request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const batch = Array.isArray(data) ? data[0] : data;
    const rawImages: any[] = Array.isArray(batch?.data) ? batch.data : [];

    await ctx.updateProgress(70, `Decoding ${rawImages.length} image(s)`);

    const dateDir = new Date().toISOString().slice(0, 10);
    const resultUrls: string[] = [];

    for (let i = 0; i < rawImages.length; i++) {
      const item = rawImages[i];

      if (item.b64_json) {
        const buffer = Buffer.from(item.b64_json, "base64");
        const key = `images/${dateDir}/${ctx.taskId}_${i}.png`;
        const url = await uploadToS3(buffer, key);
        resultUrls.push(url);
      } else if (item.url) {
        resultUrls.push(item.url);
      }

      await ctx.updateProgress(
        70 + Math.round(((i + 1) / rawImages.length) * 30),
        `Saved image ${i + 1}/${rawImages.length}`
      );
    }

    await ctx.updateProgress(100, "Image generation completed");

    return {
      resultUrls,
      metadata: {
        provider: "yunwu",
        model: body.model,
        prompt: body.prompt,
        n: body.n,
        size: body.size,
        resolution,
        created: batch?.created ?? null,
        images: rawImages.map((item: any) => ({
          url: item.url || null,
          b64_json: item.b64_json ? `[uploaded to S3]` : null,
          revised_prompt: item.revised_prompt || "",
        })),
      },
    };
  },
};
