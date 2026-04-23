import { uploadToS3 } from "../../../config/s3.js";

const BASE_URL = "https://yunwu.ai/v1beta/models";

/**
 * 下载图片 URL → 转 base64 + mimeType
 */
export async function downloadAsBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image: ${url} - ${res.status}`);

  const contentType = res.headers.get("content-type") || "image/png";
  const arrayBuffer = await res.arrayBuffer();
  const data = Buffer.from(arrayBuffer).toString("base64");

  return { data, mimeType: contentType };
}

/**
 * 业务端小写 resolution → 上游大写格式
 * "512" → "512", "1k" → "1K", "2k" → "2K", "4k" → "4K"
 */
export function toUpstreamResolution(resolution: string): string {
  const lower = resolution.toLowerCase().trim();
  if (lower === "512") return "512";
  const match = lower.match(/^(\d+)k$/);
  if (match) return `${match[1]}K`;
  throw new Error(`Invalid resolution: ${resolution}. Expected: 512, 1k, 2k, 4k`);
}

/**
 * 构建 Gemini 上游请求体
 */
export function buildGeminiRequestBody(
  input: any,
  modelName: string,
  allowedAspectRatios: Set<string>,
  allowedResolutions: Set<string> | null,
  maxImages: number,
) {
  const prompt = String(input.prompt || "").trim();
  if (!prompt) throw new Error("Missing required field: prompt");

  const aspectRatio = String(input.aspect_ratio || "auto").trim();
  if (aspectRatio !== "auto" && !allowedAspectRatios.has(aspectRatio)) {
    throw new Error(`Unsupported aspect_ratio: ${aspectRatio}. Allowed: ${[...allowedAspectRatios].join(", ")}`);
  }

  // resolution handling
  const resolutionInput = String(input.resolution || "").trim();
  let upstreamResolution: string | null = null;
  if (resolutionInput) {
    if (!allowedResolutions) {
      throw new Error("This model does not support resolution configuration");
    }
    const normalized = resolutionInput.toLowerCase();
    if (!allowedResolutions.has(normalized)) {
      throw new Error(`Unsupported resolution: ${resolutionInput}. Allowed: ${[...allowedResolutions].join(", ")}`);
    }
    upstreamResolution = toUpstreamResolution(normalized);
  }

  // image_urls → will be filled by execute() with base64 data
  const imageUrls: string[] = input.image_urls || [];
  if (imageUrls.length > maxImages) {
    throw new Error(`Too many images: ${imageUrls.length}. Maximum: ${maxImages}`);
  }

  const extra = input.extra || {};
  const responseModalities = extra.responseModalities || ["TEXT", "IMAGE"];

  return {
    prompt,
    aspectRatio: aspectRatio === "auto" ? undefined : aspectRatio,
    resolution: upstreamResolution,
    imageUrls,
    responseModalities,
  };
}

/**
 * 构建最终发往上游的 JSON body
 */
export function buildUpstreamBody(
  prompt: string,
  base64Images: { data: string; mimeType: string }[],
  responseModalities: string[],
  aspectRatio?: string,
  resolution?: string | null,
) {
  const parts: any[] = [{ text: prompt }];

  for (const img of base64Images) {
    parts.push({
      inline_data: {
        mime_type: img.mimeType,
        data: img.data,
      },
    });
  }

  const generationConfig: any = {
    responseModalities,
  };

  if (aspectRatio || resolution) {
    const imageConfig: any = {};
    if (aspectRatio) imageConfig.aspectRatio = aspectRatio;
    if (resolution) imageConfig.imageSize = resolution;
    generationConfig.imageConfig = imageConfig;
  }

  return {
    contents: [{ parts }],
    generationConfig,
  };
}

/**
 * 构建上游请求 URL
 */
export function buildUpstreamUrl(modelName: string): string {
  return `${BASE_URL}/${modelName}:generateContent`;
}

/**
 * 解析上游响应 → 提取 base64 图片 → 上传 S3 → 返回 resultUrls
 */
export async function processGeminiResponse(
  data: any,
  taskId: string,
  onProgress?: (pct: number, msg: string) => Promise<void>,
): Promise<{ resultUrls: string[]; texts: string[] }> {
  const candidate = Array.isArray(data?.candidates) ? data.candidates[0] : null;
  const parts: any[] = candidate?.content?.parts || [];

  const resultUrls: string[] = [];
  const texts: string[] = [];
  const dateDir = new Date().toISOString().slice(0, 10);

  let imageIndex = 0;
  for (const part of parts) {
    if (part.text) {
      texts.push(part.text);
    } else {
      // 兼容驼峰 inlineData 和下划线 inline_data 两种格式
      const inlineData = part.inlineData || part.inline_data;
      if (inlineData?.data) {
        const buffer = Buffer.from(inlineData.data, "base64");
        const mime = inlineData.mimeType || inlineData.mime_type || "image/png";
        const ext = mime.includes("jpeg") || mime.includes("jpg") ? "jpg"
          : mime.includes("webp") ? "webp" : "png";

        const key = `images/${dateDir}/${taskId}_${imageIndex}.${ext}`;
        const url = await uploadToS3(buffer, key, mime);
        resultUrls.push(url);
        imageIndex++;

        if (onProgress) {
          await onProgress(80, `Uploaded image ${imageIndex}`);
        }
      }
    }
  }

  return { resultUrls, texts };
}
