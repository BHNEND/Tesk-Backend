import { TaskHandler } from "./handlers/interface.js";
import { defaultModelHandler } from "./handlers/models/defaultModelHandler.js";
import { gptimage2Handler } from "./handlers/models/gptimage2Handler.js";
import { gptimageEditHandler } from "./handlers/models/gptimageEditHandler.js";
import { gptimage2k4kHandler } from "./handlers/models/gptimage2k4kHandler.js";
import { yunwubananaHandler } from "./handlers/models/yunwubananaHandler.js";
import { yunwubananaproHandler } from "./handlers/models/yunwubananaproHandler.js";
import { yunwubanana2Handler } from "./handlers/models/yunwubanana2Handler.js";
import { defaultAppHandler } from "./handlers/apps/defaultAppHandler.js";
import { runningHubHandler } from "./handlers/apps/runningHubHandler.js";
import { prisma } from "../config/prisma.js";

// Manually register available static handlers here
export const availableHandlers: Record<string, TaskHandler> = {
  "defaultModelHandler": defaultModelHandler,
  "gptimage2": gptimage2Handler,
  "gptimageEdit": gptimageEditHandler,
  "gptimage2k4k": gptimage2k4kHandler,
  "yunwubanana": yunwubananaHandler,
  "yunwubananapro": yunwubananaproHandler,
  "yunwubanana2": yunwubanana2Handler,
  "defaultAppHandler": defaultAppHandler,
  "runningHubHandler": runningHubHandler,
};

export async function getTaskHandlerDynamic(taskType: "model" | "app" | string, identifier: string): Promise<TaskHandler | undefined> {
  let handlerName: string | undefined;

  if (taskType === "app") {
    const route = await prisma.appStrategy.findUnique({ where: { appName: identifier } });
    if (route && route.status === "active") {
      handlerName = route.handler;
    }
  } else {
    // Default to 'model'
    const route = await prisma.modelStrategy.findUnique({ where: { modelName: identifier } });
    if (route && route.status === "active") {
      handlerName = route.handler;
    }
  }

  // Fallback for hardcoded routing (backward compatibility before everything is in DB)
  if (!handlerName && identifier.startsWith("rh-")) {
    return runningHubHandler;
  }

  if (handlerName && availableHandlers[handlerName]) {
    return availableHandlers[handlerName];
  }

  return undefined;
}

// Fallback logic for unmatched identifiers (useful during transition)
export function getFallbackHandler(taskType: "model" | "app"): TaskHandler {
  return taskType === "app" ? defaultAppHandler : defaultModelHandler;
}
