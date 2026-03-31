import { FastifyInstance } from "fastify";
import { createTask, getTaskInfo } from "../services/taskService.js";
import { CreateTaskBody } from "../types/task.js";

export async function jobRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateTaskBody }>("/api/v1/jobs/createTask", async (request, reply) => {
    const { model, callBackUrl, progressCallBackUrl, input } = request.body;

    if (!model || !callBackUrl || !input?.prompt) {
      return reply.status(400).send({
        code: 400,
        msg: "Missing required fields: model, callBackUrl, input.prompt",
      });
    }

    try {
      const { taskId } = await createTask({
        model,
        callBackUrl,
        progressCallBackUrl,
        input,
      });

      return reply.send({ code: 200, msg: "success", data: { taskId } });
    } catch (err: any) {
      return reply.status(500).send({
        code: 500,
        msg: err.message || "Internal server error",
      });
    }
  });

  app.get<{
    Querystring: { taskId: string };
  }>("/api/v1/jobs/recordInfo", async (request, reply) => {
    const { taskId } = request.query;

    if (!taskId) {
      return reply.status(400).send({
        code: 400,
        msg: "Missing required query parameter: taskId",
      });
    }

    const taskInfo = await getTaskInfo(taskId);

    if (!taskInfo) {
      return reply.status(404).send({
        code: 404,
        msg: "Task not found",
      });
    }

    return reply.send({ code: 200, msg: "success", data: taskInfo });
  });
}
