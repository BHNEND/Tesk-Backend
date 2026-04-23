export interface TaskHandlerContext {
  taskId: string;
  identifier: string;          // 客户端传的 name (modelName / appName)
  upstreamIdentifier?: string; // 上游真实 ID (modelId / appId)
  input: any;
  allocatedKey?: string;       // 动态借用的上游 API Key
  updateProgress: (progress: number, message: string) => Promise<void>;
}

export interface HandlerPreview {
  url: string;
  method: string;
  body: any;
  headers?: Record<string, string>;
  meta?: {
    identifier: string;
    handler: string;
    platform?: string;
  };
}

export interface TaskHandler {
  platform?: string; // 处理器所属的平台名称 (如 "runninghub")
  execute(ctx: TaskHandlerContext): Promise<any>;
  preview?(input: any, identifier?: string, upstreamIdentifier?: string): HandlerPreview | Promise<HandlerPreview>;
}
