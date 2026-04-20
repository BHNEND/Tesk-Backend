export interface StandardTaskInput {
  prompt?: string;
  image_urls?: string[];
  video_urls?: string[];
  audio_urls?: string[];
  
  // 生成控制参数
  aspect_ratio?: string; // 例如 "1:1", "16:9", "9:16", "3:2", "2:3"
  resolution?: string;   // 例如 "720p", "1080p", "2k", "4k" 或 "1024x1024"
  duration?: number;     // 视频/音频时长（秒）
  
  // 扩展参数：用于处理特定策略特有的非标准参数
  extra?: Record<string, any>;
}

export interface BaseTaskConfig {
  callBackUrl: string;
  progressCallBackUrl?: string;
}

export interface ModelTaskBody extends BaseTaskConfig {
  type: 'model';
  model: string;
  input: StandardTaskInput;
}

export interface AppTaskBody extends BaseTaskConfig {
  type: 'app';
  appid: string;
  input: StandardTaskInput;
}

export type CreateTaskBody = ModelTaskBody | AppTaskBody;

export type TaskState = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";

