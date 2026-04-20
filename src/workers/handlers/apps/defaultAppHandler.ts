import { TaskHandler, TaskHandlerContext } from "../interface.js";

export const defaultAppHandler: TaskHandler = {
  async execute(ctx: TaskHandlerContext): Promise<any> {
    const { identifier, input } = ctx;
    const { fileUrl, language } = input || {};
    
    await ctx.updateProgress(10, `Downloading document for ${identifier}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    
    await ctx.updateProgress(50, "Analyzing content");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    
    return {
      summary: `This is a mock summary for ${fileUrl || "the document"} in ${language || "default language"}. [App: ${identifier}]`,
      wordCount: 500,
    };
  },
};
