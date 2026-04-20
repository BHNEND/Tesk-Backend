import { TaskHandler } from "./handlers/interface.js";
import { defaultModelHandler } from "./handlers/models/defaultModelHandler.js";
import { defaultAppHandler } from "./handlers/apps/defaultAppHandler.js";
import { runningHubHandler } from "./handlers/apps/runningHubHandler.js";
import { prisma } from "../config/prisma.js";

// Manually register available static handlers here
export const availableHandlers: Record<string, TaskHandler> = {
  "defaultModelHandler": defaultModelHandler,
  "defaultAppHandler": defaultAppHandler,
  "runningHubHandler": runningHubHandler,
};

export async function getTaskHandlerDynamic(taskType: "model" | "app" | string, identifier: string): Promise<TaskHandler | undefined> {
  let handlerName: string | undefined;

  if (taskType === "app") {
    const route = await prisma.appStrategy.findUnique({ where: { appId: identifier } });
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
