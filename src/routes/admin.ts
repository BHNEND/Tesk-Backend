import { FastifyInstance } from "fastify";
import { prisma } from "../config/prisma.js";
import { randomUUID } from "crypto";

interface TaskListQuery {
  page?: string;
  pageSize?: string;
  state?: string;
  startTime?: string;
  endTime?: string;
}

export async function adminRoutes(app: FastifyInstance) {
  // === Task Management ===

  app.get<{ Querystring: TaskListQuery }>("/api/v1/admin/tasks", async (request, reply) => {
    const { page = "1", pageSize = "20", state, startTime, endTime } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const where: any = {};
    if (state) where.state = state;
    if (startTime || endTime) {
      where.createdAt = {};
      if (startTime) where.createdAt.gte = new Date(startTime);
      if (endTime) where.createdAt.lte = new Date(endTime);
    }

    const [tasks, total] = await Promise.all([
      prisma.taskJob.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.taskJob.count({ where }),
    ]);

    return reply.send({
      code: 200,
      msg: "success",
      data: {
        list: tasks,
        pagination: {
          page: parseInt(page),
          pageSize: take,
          total,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  });

  app.get<{ Params: { taskId: string } }>("/api/v1/admin/tasks/:taskId", async (request, reply) => {
    const { taskId } = request.params;
    const task = await prisma.taskJob.findUnique({ where: { taskNo: taskId } });

    if (!task) {
      return reply.status(404).send({ code: 404, msg: "Task not found" });
    }

    return reply.send({ code: 200, msg: "success", data: task });
  });

  app.get("/api/v1/admin/stats", async (request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      total,
      pending,
      running,
      success,
      failed,
      todayCount,
      avgTime,
    ] = await Promise.all([
      prisma.taskJob.count(),
      prisma.taskJob.count({ where: { state: "PENDING" } }),
      prisma.taskJob.count({ where: { state: "RUNNING" } }),
      prisma.taskJob.count({ where: { state: "SUCCESS" } }),
      prisma.taskJob.count({ where: { state: "FAILED" } }),
      prisma.taskJob.count({ where: { createdAt: { gte: today } } }),
      prisma.taskJob.aggregate({
        _avg: { costTime: true },
        where: { state: "SUCCESS", costTime: { not: null } },
      }),
    ]);

    return reply.send({
      code: 200,
      msg: "success",
      data: {
        total,
        byState: { PENDING: pending, RUNNING: running, SUCCESS: success, FAILED: failed },
        todayNew: todayCount,
        avgCostTime: avgTime._avg.costTime ? Math.round(avgTime._avg.costTime) : 0,
      },
    });
  });

  // === API Key Management ===

  app.post("/api/v1/admin/apikeys", async (request, reply) => {
    const { name } = request.body as any;
    if (!name) {
      return reply.status(400).send({ code: 400, msg: "Missing required field: name" });
    }

    const key = randomUUID().replace(/-/g, "");
    const apiKey = await prisma.apiKey.create({
      data: { key, name },
    });

    return reply.send({ code: 200, msg: "success", data: apiKey });
  });

  app.get("/api/v1/admin/apikeys", async (request, reply) => {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ code: 200, msg: "success", data: keys });
  });

  app.patch<{
    Params: { id: string };
    Body: { status?: string; name?: string };
  }>("/api/v1/admin/apikeys/:id", async (request, reply) => {
    const { id } = request.params;
    const { status, name } = request.body;

    if (status && !["active", "disabled"].includes(status)) {
      return reply.status(400).send({ code: 400, msg: "Invalid status, must be active or disabled" });
    }

    const data: any = {};
    if (status) data.status = status;
    if (name) data.name = name;

    try {
      const updated = await prisma.apiKey.update({
        where: { id },
        data,
      });
      return reply.send({ code: 200, msg: "success", data: updated });
    } catch {
      return reply.status(404).send({ code: 404, msg: "API Key not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/apikeys/:id", async (request, reply) => {
    try {
      await prisma.apiKey.delete({ where: { id: request.params.id } });
      return reply.send({ code: 200, msg: "success" });
    } catch {
      return reply.status(404).send({ code: 404, msg: "API Key not found" });
    }
  });
}
