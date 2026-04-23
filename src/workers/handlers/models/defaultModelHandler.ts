import { TaskHandler, TaskHandlerContext } from "../interface.js";

export const defaultModelHandler: TaskHandler = {
  async execute(ctx: TaskHandlerContext): Promise<any> {
    const { identifier } = ctx;
    // Mock AI Processing logic moved from taskWorker.ts
    const delay = 5000 + Math.random() * 5000;
    
    // Simulate progress updates
    await ctx.updateProgress(10, `Starting model inference for ${identifier}`);
    await new Promise((resolve) => setTimeout(resolve, delay / 2));
    await ctx.updateProgress(50, "Generating results");
    await new Promise((resolve) => setTimeout(resolve, delay / 2));

    if (Math.random() < 0.1) {
      throw new Error(`AI model inference failed for ${identifier} (Mock Error)`);
    }

    return {
      resultUrls: [`https://example.com/results/${Date.now()}.png`],
      metadata: {
        prompt: ctx.input?.prompt || "test prompt",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
        },
      },
    };
  },
};
