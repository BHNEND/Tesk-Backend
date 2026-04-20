export interface TaskHandlerContext {
  taskId: string;
  identifier: string; // The model name or appid
  input: any;
  allocatedKey?: string; // 动态借用的上游 API Key
  updateProgress: (progress: number, message: string) => Promise<void>;
}

export interface TaskHandler {
  platform?: string; // 处理器所属的平台名称 (如 "runninghub")
  execute(ctx: TaskHandlerContext): Promise<any>;
}
