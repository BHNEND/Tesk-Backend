import { TaskHandler, TaskHandlerContext, HandlerPreview } from "../interface.js";
import { env } from "../../../config/env.js";
import { fetchWithTimeout } from "../../../utils/fetchWithTimeout.js";

const ALLOWED_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "2048x2048", "2048x1152", "1152x2048", "3840x2160", "2160x3840", "auto"]);
const ALLOWED_RESOLUTIONS = new Set(["1k", "2k", "4k"]);

function resolveSize(aspectRatio: string, resolution: string) {
  if (aspectRatio === "auto") return "auto";

  if (resolution === "1k") {
    if (aspectRatio === "1:1") return "1024x1024";
    if (aspectRatio === "2:3") return "1024x1536";
    if (aspectRatio === "3:2") return "1536x1024";
    throw new Error("1k supports aspect_ratio: 1:1, 2:3, 3:2, auto");
  }

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
  const resolution = String(input.resolution || "1k").trim();
  const size = resolveSize(aspectRatio, resolution);

  if (!prompt) throw new Error("Missing required field: prompt");
  if (prompt.length > 1000) throw new Error("prompt must be at most 1000 characters");
  if (!Number.isInteger(n) || n < 1 || n > 10) throw new Error("n must be an integer between 1 and 10");
  if (!ALLOWED_SIZES.has(size)) throw new Error("size must be one of 1024x1024, 1536x1024, 1024x1536, auto");

  return { model: identifier, prompt, n, size };
}

export const gptimage2Handler: TaskHandler = {
  preview(input: any, identifier?: string, upstreamIdentifier?: string): HandlerPreview {
    const id = identifier || "gpt-image-2";
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
      meta: { identifier: id, handler: "gptimage2", platform: "yunwu" },
    };
  },

  async execute(ctx: TaskHandlerContext): Promise<any> {
    const input = ctx.input || {};
    const resolution = String(input.resolution || "1k").trim();
    const apiKey = ctx.allocatedKey || env.gptImage2ApiKey;

    if (!apiKey) {
      throw new Error("Missing GPTIMAGE2_API_KEY in environment variables");
    }

    if (!ALLOWED_RESOLUTIONS.has(resolution)) {
      throw new Error("resolution must be one of 1k, 2k, 4k");
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
      throw new Error(`gptimage2 request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const batch = Array.isArray(data) ? data[0] : data;
    const images = Array.isArray(batch?.data)
      ? batch.data.map((item: any) => ({
          url: item.url,
          revised_prompt: item.revised_prompt || "",
        }))
      : [];

    await ctx.updateProgress(100, "Image generation completed");

    return {
      resultUrls: images.map((img: any) => img.url),
      metadata: {
        provider: "yunwu",
        model: body.model,
        prompt: body.prompt,
        n: body.n,
        size: body.size,
        resolution,
        created: batch?.created ?? null,
        images,
      },
    };
  },
};
