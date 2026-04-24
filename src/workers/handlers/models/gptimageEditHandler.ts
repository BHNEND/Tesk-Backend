import { TaskHandler, TaskHandlerContext, HandlerPreview } from "../interface.js";
import { env } from "../../../config/env.js";
import { fetchWithTimeout } from "../../../utils/fetchWithTimeout.js";

const UPSTREAM_URL = "https://yunwu.ai/v1/images/edits";

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

async function downloadAsBlob(url: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetchWithTimeout(url, {}, 60_000);
  if (!res.ok) throw new Error(`Failed to download image: ${url} - ${res.status}`);

  const contentType = res.headers.get("content-type") || "image/png";
  const blob = await res.blob();

  const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
    : contentType.includes("webp") ? "webp"
    : "png";
  const filename = `image.${ext}`;

  return { blob, filename };
}

export const gptimageEditHandler: TaskHandler = {
  preview(input: any, identifier?: string, upstreamIdentifier?: string): HandlerPreview {
    const id = identifier || "gpt-image-edit";
    const upstreamId = upstreamIdentifier || id;
    const prompt = String(input.prompt || "").trim();
    const imageUrls: string[] = input.image_urls || [];
    const aspectRatio = String(input.aspect_ratio || "auto").trim();
    const resolution = String(input.resolution || "1k").trim();
    const size = resolveSize(aspectRatio, resolution);
    const extra = input.extra || {};
    const n = Number(extra.n ?? 1);

    return {
      url: UPSTREAM_URL,
      method: "POST",
      headers: {
        "Content-Type": "multipart/form-data",
        "Authorization": "Bearer ***",
      },
      body: {
        model: upstreamId,
        prompt,
        n,
        size,
        image: `${imageUrls.length} file(s) [downloaded from image_urls]`,
        ...(extra.mask_url ? { mask: "[file downloaded from mask_url]" } : {}),
        ...(extra.quality ? { quality: extra.quality } : {}),
        ...(extra.background ? { background: extra.background } : {}),
        ...(extra.moderation ? { moderation: extra.moderation } : {}),
      },
      meta: { identifier: id, handler: "gptimageEdit", platform: "yunwu" },
    };
  },

  async execute(ctx: TaskHandlerContext): Promise<any> {
    const input = ctx.input || {};
    const apiKey = ctx.allocatedKey || env.gptImage2ApiKey;

    if (!apiKey) {
      throw new Error("Missing GPTIMAGE2_API_KEY in environment variables");
    }

    // 固定参数
    const prompt = String(input.prompt || "").trim();
    if (!prompt) throw new Error("Missing required field: prompt");
    if (prompt.length > 32000) throw new Error("prompt must be at most 32000 characters");

    const imageUrls: string[] = input.image_urls || [];
    if (imageUrls.length === 0) throw new Error("At least one image_url is required");

    const resolution = String(input.resolution || "1k").trim();
    if (!ALLOWED_RESOLUTIONS.has(resolution)) throw new Error("resolution must be one of 1k, 2k, 4k");

    const aspectRatio = String(input.aspect_ratio || "auto").trim();
    const size = resolveSize(aspectRatio, resolution);

    // 自定义参数 (extra)
    const extra = input.extra || {};
    const n = Math.max(1, Math.min(10, Number(extra.n ?? 1)));
    const maskUrl = extra.mask_url || undefined;
    const quality = extra.quality || undefined;
    const background = extra.background || undefined;
    const moderation = extra.moderation || undefined;

    const upstreamId = ctx.upstreamIdentifier || ctx.identifier;

    // 1. Download images
    await ctx.updateProgress(10, `Downloading ${imageUrls.length} image(s)`);

    const imageBlobs: { blob: Blob; filename: string }[] = [];
    for (let i = 0; i < imageUrls.length; i++) {
      const result = await downloadAsBlob(imageUrls[i]);
      imageBlobs.push(result);
      await ctx.updateProgress(10 + Math.round((i + 1) / imageUrls.length * 20), `Downloaded image ${i + 1}/${imageUrls.length}`);
    }

    // 2. Download mask if provided
    let maskBlob: { blob: Blob; filename: string } | undefined;
    if (maskUrl) {
      await ctx.updateProgress(30, "Downloading mask image");
      maskBlob = await downloadAsBlob(maskUrl);
    }

    // 3. Build multipart form
    await ctx.updateProgress(35, "Submitting image edit request");
    const fd = new FormData();
    fd.append("prompt", prompt);
    fd.append("model", upstreamId);
    fd.append("n", String(n));
    fd.append("size", size);
    if (quality) fd.append("quality", quality);
    if (background) fd.append("background", background);
    if (moderation) fd.append("moderation", moderation);

    for (const img of imageBlobs) {
      fd.append("image", img.blob, img.filename);
    }
    if (maskBlob) {
      fd.append("mask", maskBlob.blob, maskBlob.filename);
    }

    // 4. Send request
    const response = await fetchWithTimeout(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: fd,
    }, 120_000);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Image edit request failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const batch = Array.isArray(data) ? data[0] : data;
    const images = Array.isArray(batch?.data)
      ? batch.data.map((item: any) => ({
          url: item.url || null,
          b64_json: item.b64_json || null,
          revised_prompt: item.revised_prompt || "",
        }))
      : [];

    await ctx.updateProgress(100, "Image edit completed");

    const resultUrls = images
      .map((img: any) => img.url)
      .filter(Boolean) as string[];

    return {
      resultUrls,
      metadata: {
        provider: "yunwu",
        model: upstreamId,
        prompt,
        n,
        size,
        resolution,
        created: batch?.created ?? null,
        images,
      },
    };
  },
};
