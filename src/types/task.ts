export interface StandardTaskInput {
  prompt?: string;
  image_urls?: string[];
  video_urls?: string[];
  audio_urls?: string[];
  
  // 生成控制参数
  aspect_ratio?: string; // 例如 "1:1", "2:3", "3:2", "auto"
  resolution?: string;   // 例如 "1k", "2k", "4k"
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
