import { FastifyInstance } from "fastify";
import { createTask, getTaskInfo, previewTask } from "../services/taskService.js";
import { CreateTaskBody } from "../types/task.js";

export async function jobRoutes(app: FastifyInstance) {
  app.post<{ Body: CreateTaskBody }>("/api/v1/jobs/createTask", async (request, reply) => {
    const body = request.body;
    
    if (!body.callBackUrl || !body.input) {
      return reply.status(400).send({
        code: 400,
        msg: "Missing required fields: callBackUrl, input",
      });
    }
    
    if (body.type === 'app' && !body.appid) {
      return reply.status(400).send({
        code: 400,
        msg: "Missing required fields for app task: appid",
      });
    }
    
    if ((body.type === 'model' || !body.type) && !(body as any).model) {
      return reply.status(400).send({
        code: 400,
        msg: "Missing required fields for model task: model",
      });
    }

    try {
      // 传递完整的 apiKeyData 供并发检查使用
      const { taskId } = await createTask(body, (request as any).apiKeyData);

      return reply.send({ code: 200, msg: "success", data: { taskId } });
    } catch (err: any) {
      return reply.status(err.status || 500).send({
        code: err.status || 500,
        msg: err.message || "Internal server error",
      });
    }
  });

  app.post<{ Body: CreateTaskBody }>("/api/v1/jobs/previewTask", async (request, reply) => {
    try {
      const data = await previewTask(request.body);
      return reply.send({ code: 200, msg: "success", data });
    } catch (err: any) {
      return reply.status(400).send({ code: 400, msg: err.message });
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
