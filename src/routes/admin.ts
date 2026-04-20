import { FastifyInstance } from "fastify";
import { prisma } from "../config/prisma.js";
import { randomUUID } from "crypto";

import { env } from "../config/env.js";

// ... (TaskListQuery 接口定义)

export async function adminRoutes(app: FastifyInstance) {
  // === Authentication ===
  
  app.post("/api/v1/admin/login", async (request, reply) => {
    const { username, password } = request.body as any;
    
    if (username === env.adminUser && password === env.adminPass) {
      return reply.send({ 
        code: 200, 
        msg: "success", 
        data: { token: env.adminApiKey } 
      });
    }

    return reply.status(401).send({ code: 401, msg: "Invalid username or password" });
  });

  // === Task Management ===

  app.get<{ Querystring: TaskListQuery }>("/api/v1/admin/tasks", async (request, reply) => {
    const { page = "1", pageSize = "20", state, startTime, endTime } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const where: any = {};
    if (state) where.state = state;
    if (startTime || endTime) {
      where.createTime = {};
      if (startTime) where.createTime.gte = new Date(startTime);
      if (endTime) where.createTime.lte = new Date(endTime);
    }

    const [tasks, total] = await Promise.all([
      prisma.taskJob.findMany({
        where,
        orderBy: { createTime: "desc" },
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
    const task = await prisma.taskJob.findUnique({ where: { id: taskId } });

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
      prisma.taskJob.count({ where: { createTime: { gte: today } } }),
      prisma.taskJob.aggregate({
        _avg: { costTime: true },
        where: { state: "SUCCESS", costTime: { gt: 0 } },
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
    Body: { status?: string; name?: string; rpmLimit?: number; concurrencyLimit?: number; ipWhitelist?: string };
  }>("/api/v1/admin/apikeys/:id", async (request, reply) => {
    const { id } = request.params;
    const { status, name, rpmLimit, concurrencyLimit, ipWhitelist } = request.body;

    if (status && !["active", "disabled"].includes(status)) {
      return reply.status(400).send({ code: 400, msg: "Invalid status, must be active or disabled" });
    }

    const data: any = {};
    if (status) data.status = status;
    if (name) data.name = name;
    if (rpmLimit !== undefined) data.rpmLimit = rpmLimit;
    if (concurrencyLimit !== undefined) data.concurrencyLimit = concurrencyLimit;
    if (ipWhitelist !== undefined) data.ipWhitelist = ipWhitelist;

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

  // === Strategy Management (Models) ===
  app.get("/api/v1/admin/strategies/models", async (request, reply) => {
    const models = await prisma.modelStrategy.findMany({ orderBy: { createdAt: "desc" } });
    return reply.send({ code: 200, msg: "success", data: models });
  });

  app.post("/api/v1/admin/strategies/models", async (request, reply) => {
    const { modelName, handler, name, description, config } = request.body as any;
    if (!modelName || !handler) {
      return reply.status(400).send({ code: 400, msg: "Missing required fields" });
    }
    try {
      const created = await prisma.modelStrategy.create({
        data: { modelName, handler, name, description, config },
      });
      return reply.send({ code: 200, msg: "success", data: created });
    } catch (err: any) {
      if (err.code === "P2002") return reply.status(400).send({ code: 400, msg: "Model Name already exists" });
      throw err;
    }
  });

  app.patch<{ Params: { id: string }, Body: any }>("/api/v1/admin/strategies/models/:id", async (request, reply) => {
    const { id } = request.params;
    try {
      const updated = await prisma.modelStrategy.update({
        where: { id },
        data: request.body as any,
      });
      return reply.send({ code: 200, msg: "success", data: updated });
    } catch {
      return reply.status(404).send({ code: 404, msg: "Strategy not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/strategies/models/:id", async (request, reply) => {
    try {
      await prisma.modelStrategy.delete({ where: { id: request.params.id } });
      return reply.send({ code: 200, msg: "success" });
    } catch {
      return reply.status(404).send({ code: 404, msg: "Strategy not found" });
    }
  });

  // === Strategy Management (Apps) ===
  app.get("/api/v1/admin/strategies/apps", async (request, reply) => {
    const apps = await prisma.appStrategy.findMany({ orderBy: { createdAt: "desc" } });
    return reply.send({ code: 200, msg: "success", data: apps });
  });

  app.post("/api/v1/admin/strategies/apps", async (request, reply) => {
    const { appId, handler, name, description, config } = request.body as any;
    if (!appId || !handler) {
      return reply.status(400).send({ code: 400, msg: "Missing required fields" });
    }
    try {
      const created = await prisma.appStrategy.create({
        data: { appId, handler, name, description, config },
      });
      return reply.send({ code: 200, msg: "success", data: created });
    } catch (err: any) {
      if (err.code === "P2002") return reply.status(400).send({ code: 400, msg: "App ID already exists" });
      throw err;
    }
  });

  app.patch<{ Params: { id: string }, Body: any }>("/api/v1/admin/strategies/apps/:id", async (request, reply) => {
    const { id } = request.params;
    try {
      const updated = await prisma.appStrategy.update({
        where: { id },
        data: request.body as any,
      });
      return reply.send({ code: 200, msg: "success", data: updated });
    } catch {
      return reply.status(404).send({ code: 404, msg: "Strategy not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/strategies/apps/:id", async (request, reply) => {
    try {
      await prisma.appStrategy.delete({ where: { id: request.params.id } });
      return reply.send({ code: 200, msg: "success" });
    } catch {
      return reply.status(404).send({ code: 404, msg: "Strategy not found" });
    }
  });
}
