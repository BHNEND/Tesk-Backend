export interface CreateTaskInput {
  prompt: string;
  image_urls?: string[];
  aspect_ratio?: string;
  resolution?: string;
  n_frames?: number;
}

export interface CreateTaskBody {
  model: string;
  callBackUrl: string;
  progressCallBackUrl?: string;
  input: CreateTaskInput;
}

export type TaskState = "PENDING" | "RUNNING" | "SUCCESS" | "FAILED";
