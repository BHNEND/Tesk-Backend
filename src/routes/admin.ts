import { FastifyInstance } from "fastify";
import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";
import { randomUUID } from "crypto";
import { createQueue } from "../config/bullmq.js";
import os from "os";

import { env } from "../config/env.js";

interface TaskListQuery {
  page?: string;
  pageSize?: string;
  state?: string;
  taskId?: string;
  startTime?: string;
  endTime?: string;
}

const hidden = { schema: { hide: true } };

export async function adminRoutes(app: FastifyInstance) {
  // === Authentication ===

  app.post("/api/v1/admin/login", hidden, async (request, reply) => {
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

  app.get<{ Querystring: TaskListQuery }>("/api/v1/admin/tasks", hidden, async (request, reply) => {
    const { page = "1", pageSize = "20", state, taskId, startTime, endTime } = request.query;
    const skip = (parseInt(page) - 1) * parseInt(pageSize);
    const take = parseInt(pageSize);

    const where: any = {};
    if (state) where.state = state;
    if (taskId) where.id = { contains: taskId };
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

  app.get<{ Params: { taskId: string } }>("/api/v1/admin/tasks/:taskId", hidden, async (request, reply) => {
    const { taskId } = request.params;
    const task = await prisma.taskJob.findUnique({ where: { id: taskId } });

    if (!task) {
      return reply.status(404).send({ code: 404, msg: "Task not found" });
    }

    return reply.send({ code: 200, msg: "success", data: task });
  });

  app.get("/api/v1/admin/stats", hidden, async (request, reply) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      total,
      pending,
      running,
      success,
      failed,
      todayCount,
      todaySuccess,
      todayFailed,
      avgTime,
    ] = await Promise.all([
      prisma.taskJob.count(),
      prisma.taskJob.count({ where: { state: "PENDING" } }),
      prisma.taskJob.count({ where: { state: "RUNNING" } }),
      prisma.taskJob.count({ where: { state: "SUCCESS" } }),
      prisma.taskJob.count({ where: { state: "FAILED" } }),
      prisma.taskJob.count({ where: { createTime: { gte: today } } }),
      prisma.taskJob.count({ where: { state: "SUCCESS", createTime: { gte: today } } }),
      prisma.taskJob.count({ where: { state: "FAILED", createTime: { gte: today } } }),
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
        todaySuccess,
        todayFailed,
        avgCostTime: avgTime._avg.costTime ? Math.round(avgTime._avg.costTime) : 0,
      },
    });
  });

  // === Analytics ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;

    const where: any = {};
    if (startDate || endDate) {
      where.createTime = {};
      if (startDate) where.createTime.gte = new Date(startDate);
      if (endDate) where.createTime.lte = new Date(endDate);
    }

    const modelTasks = await prisma.taskJob.findMany({
      where: { ...where, taskType: "model" },
      select: { model: true, channel: true, state: true, usedKeyIndex: true },
    });

    // 按 model 分组
    const byModel: Record<string, {
      economy: { total: number; success: number },
      standard: { total: number; success: number; byTier: Record<number, number> },
    }> = {};

    for (const t of modelTasks) {
      const name = t.model || "unknown";
      if (!byModel[name]) {
        byModel[name] = {
          economy: { total: 0, success: 0 },
          standard: { total: 0, success: 0, byTier: {} },
        };
      }
      const m = byModel[name];
      if (t.channel === "economy") {
        m.economy.total++;
        if (t.state === "SUCCESS") m.economy.success++;
      } else {
        m.standard.total++;
        if (t.state === "SUCCESS") {
          m.standard.success++;
          if (t.usedKeyIndex != null) {
            m.standard.byTier[t.usedKeyIndex] = (m.standard.byTier[t.usedKeyIndex] || 0) + 1;
          }
        }
      }
    }

    const data = Object.entries(byModel).map(([model, m]) => ({
      model,
      economy: {
        ...m.economy,
        successRate: m.economy.total > 0 ? Math.round(m.economy.success / m.economy.total * 10000) / 100 : null,
      },
      standard: {
        ...m.standard,
        successRate: m.standard.total > 0 ? Math.round(m.standard.success / m.standard.total * 10000) / 100 : null,
      },
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Timeline ===

  app.get<{ Querystring: { startDate?: string; endDate?: string; interval?: string } }>("/api/v1/admin/analytics/timeline", hidden, async (request, reply) => {
    const { startDate, endDate, interval } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 3600 * 1000);
    const intervalMinutes = interval === "day" ? 1440 : interval === "hour" ? 60 : 60;

    const tasks = await prisma.taskJob.findMany({
      where: { createTime: { gte: start, lte: end } },
      select: { createTime: true, state: true, costTime: true },
    });

    // Group by interval
    const buckets: Record<string, { total: number; success: number; totalTime: number }> = {};
    for (const t of tasks) {
      const d = new Date(t.createTime);
      const key = interval === "day"
        ? d.toISOString().slice(0, 10)
        : `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, "0")}:00`;
      if (!buckets[key]) buckets[key] = { total: 0, success: 0, totalTime: 0 };
      buckets[key].total++;
      if (t.state === "SUCCESS") {
        buckets[key].success++;
        buckets[key].totalTime += t.costTime || 0;
      }
    }

    const data = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([time, b]) => ({
      time,
      total: b.total,
      success: b.success,
      successRate: b.total > 0 ? Math.round(b.success / b.total * 10000) / 100 : null,
      avgCostTime: b.success > 0 ? Math.round(b.totalTime / b.success) : null,
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Cost by Tier ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/cost-by-tier", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const where: any = { state: "SUCCESS", costTime: { gt: 0 }, taskType: "model" };
    if (startDate || endDate) {
      where.createTime = {};
      if (startDate) where.createTime.gte = new Date(startDate);
      if (endDate) where.createTime.lte = new Date(endDate);
    }

    const tasks = await prisma.taskJob.findMany({
      where,
      select: { model: true, channel: true, usedKeyIndex: true, costTime: true },
    });

    // Group by model → tier
    const grouped: Record<string, Record<string, { total: number; totalTime: number }>> = {};
    for (const t of tasks) {
      const name = t.model || "unknown";
      const tier = t.channel === "economy" ? "Economy" : `Key ${String.fromCharCode(65 + (t.usedKeyIndex ?? 0))}`;
      if (!grouped[name]) grouped[name] = {};
      if (!grouped[name][tier]) grouped[name][tier] = { total: 0, totalTime: 0 };
      grouped[name][tier].total++;
      grouped[name][tier].totalTime += t.costTime;
    }

    const data = Object.entries(grouped).map(([model, tiers]) => ({
      model,
      tiers: Object.entries(tiers).map(([tier, t]) => ({
        tier,
        count: t.total,
        avgCostTime: Math.round(t.totalTime / t.total),
      })),
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Cost Timeline per Model ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/cost-timeline", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 3600 * 1000);

    const tasks = await prisma.taskJob.findMany({
      where: { createTime: { gte: start, lte: end }, state: "SUCCESS", costTime: { gt: 0 }, taskType: "model" },
      select: { model: true, costTime: true, createTime: true },
    });

    // Group by hour → model
    const buckets: Record<string, Record<string, { total: number; totalTime: number }>> = {};
    for (const t of tasks) {
      const d = new Date(t.createTime);
      const key = `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, "0")}:00`;
      const model = t.model || "unknown";
      if (!buckets[key]) buckets[key] = {};
      if (!buckets[key][model]) buckets[key][model] = { total: 0, totalTime: 0 };
      buckets[key][model].total++;
      buckets[key][model].totalTime += t.costTime;
    }

    const data = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([time, models]) => {
      const entry: any = { time };
      for (const [model, t] of Object.entries(models)) {
        entry[model] = Math.round(t.totalTime / t.total / 100) / 10; // seconds, 1 decimal
      }
      return entry;
    });

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Errors ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/errors", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const where: any = { state: "FAILED" };
    if (startDate || endDate) {
      where.createTime = {};
      if (startDate) where.createTime.gte = new Date(startDate);
      if (endDate) where.createTime.lte = new Date(endDate);
    }

    const tasks = await prisma.taskJob.findMany({
      where,
      select: { failCode: true, model: true, appid: true },
    });

    // By failCode
    const byCode: Record<string, number> = {};
    const byModel: Record<string, Record<string, number>> = {};
    for (const t of tasks) {
      const code = t.failCode || "UNKNOWN";
      byCode[code] = (byCode[code] || 0) + 1;
      const name = t.model || t.appid || "unknown";
      if (!byModel[name]) byModel[name] = {};
      byModel[name][code] = (byModel[name][code] || 0) + 1;
    }

    return reply.send({
      code: 200,
      msg: "success",
      data: {
        total: tasks.length,
        byCode,
        byModel,
      },
    });
  });

  // === Analytics: Performance ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/performance", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const where: any = { state: "SUCCESS", costTime: { gt: 0 } };
    if (startDate || endDate) {
      where.createTime = {};
      if (startDate) where.createTime.gte = new Date(startDate);
      if (endDate) where.createTime.lte = new Date(endDate);
    }

    const tasks = await prisma.taskJob.findMany({
      where,
      select: { model: true, appid: true, costTime: true },
    });

    // Group by model
    const grouped: Record<string, number[]> = {};
    for (const t of tasks) {
      const name = t.model || t.appid || "unknown";
      if (!grouped[name]) grouped[name] = [];
      grouped[name].push(t.costTime);
    }

    const percentile = (arr: number[], p: number) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.ceil(p / 100 * sorted.length) - 1;
      return sorted[Math.max(0, idx)];
    };

    const data = Object.entries(grouped).map(([model, times]) => ({
      model,
      count: times.length,
      avg: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      p50: percentile(times, 50),
      p90: percentile(times, 90),
      p95: percentile(times, 95),
      p99: percentile(times, 99),
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Queue Stats ===

  app.get("/api/v1/admin/queue-stats", hidden, async (request, reply) => {
    const queues = [
      { name: "task-processing", label: "Model Worker" },
      { name: "task-processing-app", label: "App Worker" },
      { name: "webhook-delivery", label: "Webhook" },
    ];

    const data = await Promise.all(queues.map(async (q) => {
      const queue = createQueue(q.name);
      const counts = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      return { name: q.name, label: q.label, ...counts };
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: App Tasks ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/apps", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const where: any = { taskType: "app" };
    if (startDate || endDate) {
      where.createTime = {};
      if (startDate) where.createTime.gte = new Date(startDate);
      if (endDate) where.createTime.lte = new Date(endDate);
    }

    const tasks = await prisma.taskJob.findMany({
      where,
      select: { appid: true, state: true, costTime: true },
    });

    const grouped: Record<string, { total: number; success: number; totalTime: number }> = {};
    for (const t of tasks) {
      const name = t.appid || "unknown";
      if (!grouped[name]) grouped[name] = { total: 0, success: 0, totalTime: 0 };
      grouped[name].total++;
      if (t.state === "SUCCESS") {
        grouped[name].success++;
        grouped[name].totalTime += t.costTime || 0;
      }
    }

    const data = Object.entries(grouped).map(([app, g]) => ({
      app,
      total: g.total,
      success: g.success,
      successRate: g.total > 0 ? Math.round(g.success / g.total * 10000) / 100 : null,
      avgCostTime: g.success > 0 ? Math.round(g.totalTime / g.success) : null,
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Cost Time Distribution ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/duration", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const where: any = { state: "SUCCESS", costTime: { gt: 0 } };
    if (startDate || endDate) {
      where.createTime = {};
      if (startDate) where.createTime.gte = new Date(startDate);
      if (endDate) where.createTime.lte = new Date(endDate);
    }

    const tasks = await prisma.taskJob.findMany({
      where,
      select: { costTime: true },
    });

    const buckets = [
      { label: "<5s", max: 5000 },
      { label: "5-15s", max: 15000 },
      { label: "15-30s", max: 30000 },
      { label: "30-60s", max: 60000 },
      { label: "1-5min", max: 300000 },
      { label: ">5min", max: Infinity },
    ];

    let prev = 0;
    const data = buckets.map((b, i) => {
      const count = tasks.filter(t => t.costTime >= prev && t.costTime < b.max).length;
      prev = b.max;
      return { label: b.label, count };
    });

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Model Detail (per-model channel timeline + errors) ===

  app.get<{ Querystring: { model?: string; startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/model-detail", hidden, async (request, reply) => {
    const { model, startDate, endDate } = request.query;
    if (!model) return reply.status(400).send({ code: 400, msg: "Missing model" });

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 3600 * 1000);

    // Timeline by channel
    const tasks = await prisma.taskJob.findMany({
      where: { model, taskType: "model", createTime: { gte: start, lte: end } },
      select: { channel: true, state: true, costTime: true, createTime: true },
    });

    const buckets: Record<string, { economy: { total: number; success: number; totalTime: number }; standard: { total: number; success: number; totalTime: number } }> = {};
    for (const t of tasks) {
      const d = new Date(t.createTime);
      const key = `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, "0")}:00`;
      if (!buckets[key]) buckets[key] = { economy: { total: 0, success: 0, totalTime: 0 }, standard: { total: 0, success: 0, totalTime: 0 } };
      const ch = t.channel === "economy" ? "economy" : "standard";
      buckets[key][ch].total++;
      if (t.state === "SUCCESS") {
        buckets[key][ch].success++;
        buckets[key][ch].totalTime += t.costTime || 0;
      }
    }

    const timeline = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([time, ch]) => ({
      time,
      economy: {
        total: ch.economy.total,
        successRate: ch.economy.total > 0 ? Math.round(ch.economy.success / ch.economy.total * 10000) / 100 : null,
        avgCostTime: ch.economy.success > 0 ? Math.round(ch.economy.totalTime / ch.economy.success / 100) / 10 : null,
      },
      standard: {
        total: ch.standard.total,
        successRate: ch.standard.total > 0 ? Math.round(ch.standard.success / ch.standard.total * 10000) / 100 : null,
        avgCostTime: ch.standard.success > 0 ? Math.round(ch.standard.totalTime / ch.standard.success / 100) / 10 : null,
      },
    }));

    // Errors
    const failedTasks = await prisma.taskJob.findMany({
      where: { model, taskType: "model", state: "FAILED", createTime: { gte: start, lte: end } },
      select: { failCode: true, channel: true },
    });

    const errorsByCode: Record<string, number> = {};
    const errorsByChannel: Record<string, Record<string, number>> = {};
    for (const t of failedTasks) {
      const code = t.failCode || "UNKNOWN";
      errorsByCode[code] = (errorsByCode[code] || 0) + 1;
      const ch = t.channel === "economy" ? "economy" : "standard";
      if (!errorsByChannel[ch]) errorsByChannel[ch] = {};
      errorsByChannel[ch][code] = (errorsByChannel[ch][code] || 0) + 1;
    }

    return reply.send({
      code: 200, msg: "success",
      data: { timeline, errors: { total: failedTasks.length, byCode: errorsByCode, byChannel: errorsByChannel } },
    });
  });

  // === API Key Management ===

  app.post("/api/v1/admin/apikeys", hidden, async (request, reply) => {
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

  app.get("/api/v1/admin/apikeys", hidden, async (request, reply) => {
    const keys = await prisma.apiKey.findMany({
      orderBy: { createdAt: "desc" },
    });

    return reply.send({ code: 200, msg: "success", data: keys });
  });

  app.patch<{
    Params: { id: string };
    Body: { status?: string; name?: string; rpmLimit?: number; concurrencyLimit?: number; ipWhitelist?: string };
  }>("/api/v1/admin/apikeys/:id", hidden, async (request, reply) => {
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

  app.delete<{ Params: { id: string } }>("/api/v1/admin/apikeys/:id", hidden, async (request, reply) => {
    try {
      await prisma.apiKey.delete({ where: { id: request.params.id } });
      return reply.send({ code: 200, msg: "success" });
    } catch {
      return reply.status(404).send({ code: 404, msg: "API Key not found" });
    }
  });

  // === Strategy Management (Models) ===
  app.get("/api/v1/admin/strategies/models", hidden, async (request, reply) => {
    const models = await prisma.modelStrategy.findMany({ orderBy: { createdAt: "desc" } });
    return reply.send({ code: 200, msg: "success", data: models });
  });

  app.post("/api/v1/admin/strategies/models", hidden, async (request, reply) => {
    const { modelName, modelId, handler, remark, standardKeys, economyKey } = request.body as any;
    if (!modelName || !handler) {
      return reply.status(400).send({ code: 400, msg: "Missing required fields" });
    }
    let validKeys: string[] | undefined;
    if (Array.isArray(standardKeys) && standardKeys.length > 0) {
      validKeys = standardKeys.filter((k: string) => typeof k === "string" && k.trim()).map((k: string) => k.trim());
      if (validKeys.length === 0) validKeys = undefined;
      if (validKeys! && validKeys!.length > 3) return reply.status(400).send({ code: 400, msg: "standardKeys max 3 keys" });
    }
    try {
      const created = await prisma.modelStrategy.create({
        data: { modelName, modelId: modelId || null, handler, remark: remark || null, standardKeys: validKeys || undefined, economyKey: economyKey || null },
      });
      return reply.send({ code: 200, msg: "success", data: created });
    } catch (err: any) {
      if (err.code === "P2002") return reply.status(400).send({ code: 400, msg: "Model Name already exists" });
      throw err;
    }
  });

  app.patch<{ Params: { id: string }, Body: any }>("/api/v1/admin/strategies/models/:id", hidden, async (request, reply) => {
    const { id } = request.params;
    const { config, standardKeys, economyKey, ...data } = request.body as any;

    // 验证 standardKeys
    if (standardKeys !== undefined) {
      if (standardKeys === null || (Array.isArray(standardKeys) && standardKeys.length === 0)) {
        data.standardKeys = null;
      } else if (Array.isArray(standardKeys)) {
        const validKeys = standardKeys.filter((k: string) => typeof k === "string" && k.trim()).map((k: string) => k.trim());
        if (validKeys! && validKeys!.length > 3) return reply.status(400).send({ code: 400, msg: "standardKeys max 3 keys" });
        data.standardKeys = validKeys.length > 0 ? validKeys : null;
      }
    }

    // 验证 economyKey
    if (economyKey !== undefined) {
      data.economyKey = typeof economyKey === "string" && economyKey.trim() ? economyKey.trim() : null;
    }

    try {
      const updated = await prisma.modelStrategy.update({
        where: { id },
        data,
      });
      return reply.send({ code: 200, msg: "success", data: updated });
    } catch {
      return reply.status(404).send({ code: 404, msg: "Strategy not found" });
    }
  });

  app.delete<{ Params: { id: string } }>("/api/v1/admin/strategies/models/:id", hidden, async (request, reply) => {
    try {
      await prisma.modelStrategy.delete({ where: { id: request.params.id } });
      return reply.send({ code: 200, msg: "success" });
    } catch {
      return reply.status(404).send({ code: 404, msg: "Strategy not found" });
    }
  });

  // === Strategy Management (Apps) ===
  app.get("/api/v1/admin/strategies/apps", hidden, async (request, reply) => {
    const apps = await prisma.appStrategy.findMany({ orderBy: { createdAt: "desc" } });
    return reply.send({ code: 200, msg: "success", data: apps });
  });

  app.post("/api/v1/admin/strategies/apps", hidden, async (request, reply) => {
    const { appName, appId, handler, remark, config } = request.body as any;
    if (!appName || !handler) {
      return reply.status(400).send({ code: 400, msg: "Missing required fields: appName, handler" });
    }
    try {
      const created = await prisma.appStrategy.create({
        data: { appName, appId: appId || null, handler, remark: remark || null, config },
      });
      return reply.send({ code: 200, msg: "success", data: created });
    } catch (err: any) {
      if (err.code === "P2002") return reply.status(400).send({ code: 400, msg: "App Name already exists" });
      throw err;
    }
  });

  app.patch<{ Params: { id: string }, Body: any }>("/api/v1/admin/strategies/apps/:id", hidden, async (request, reply) => {
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

  app.delete<{ Params: { id: string } }>("/api/v1/admin/strategies/apps/:id", hidden, async (request, reply) => {
    try {
      await prisma.appStrategy.delete({ where: { id: request.params.id } });
      return reply.send({ code: 200, msg: "success" });
    } catch {
      return reply.status(404).send({ code: 404, msg: "Strategy not found" });
    }
  });

  // ─── 熔断器管理 ───

  app.get("/api/v1/admin/circuit-breaker", hidden, async (request, reply) => {
    const { getAllCircuitStates } = await import("../services/circuitBreaker.js");
    const states = await getAllCircuitStates();
    return reply.send({ code: 200, msg: "success", data: states });
  });

  app.post<{ Body: { modelName: string; keyIndex: number } }>("/api/v1/admin/circuit-breaker/reset", hidden, async (request, reply) => {
    const { modelName, keyIndex } = request.body as any;
    if (!modelName || keyIndex === undefined) {
      return reply.status(400).send({ code: 400, msg: "Missing modelName or keyIndex" });
    }
    const { resetCircuit } = await import("../services/circuitBreaker.js");
    await resetCircuit(modelName, Number(keyIndex));
    return reply.send({ code: 200, msg: "success" });
  });

  // === System Stats ===
  app.get("/api/v1/admin/system-stats", hidden, async (_request, reply) => {
    const mem = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const uptimeSec = process.uptime();

    // Redis info
    let redisInfo: any = { status: "disconnected" };
    try {
      const redisStatus = redis.status;
      const redisMemStr = await redis.info("memory").catch(() => "");
      const usedMemoryMatch = redisMemStr.match(/used_memory_human:(\S+)/);
      const maxMemoryMatch = redisMemStr.match(/maxmemory_human:(\S+)/);
      const connectedClientsMatch = redisMemStr.match(/connected_clients:(\d+)/);
      redisInfo = {
        status: redisStatus,
        usedMemory: usedMemoryMatch?.[1] || "unknown",
        maxMemory: maxMemoryMatch?.[1] || "unlimited",
        connectedClients: connectedClientsMatch ? parseInt(connectedClientsMatch?.[1] || "0") : 0,
      };
    } catch {}

    // MySQL pool (Prisma doesn't expose pool directly, use a raw query to verify connectivity)
    let mysqlStatus = "unknown";
    try {
      await prisma.$queryRaw`SELECT 1`;
      mysqlStatus = "connected";
    } catch {
      mysqlStatus = "error";
    }

    // System-level
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpuCount = os.cpus().length;
    const loadAvg = os.loadavg();

    // HTTP server connections
    let httpConnections = 0;
    const server = app.server;
    if (server && typeof (server as any).getConnections === "function") {
      httpConnections = await new Promise<number>((resolve) => {
        (server as any).getConnections((err: any, count: number) => resolve(err ? 0 : count));
      });
    }

    return reply.send({
      code: 200,
      data: {
        process: {
          pid: process.pid,
          uptime: Math.round(uptimeSec),
          memory: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
          },
          cpu: {
            user: Math.round(cpuUsage.user / 1000),
            system: Math.round(cpuUsage.system / 1000),
          },
          nodeVersion: process.version,
        },
        system: {
          hostname: os.hostname(),
          platform: os.platform(),
          cpuCount,
          loadAvg: loadAvg.map(v => Math.round(v * 100) / 100),
          memory: {
            total: Math.round(totalMem / 1024 / 1024 / 1024 * 100) / 100,
            used: Math.round((totalMem - freeMem) / 1024 / 1024 / 1024 * 100) / 100,
            free: Math.round(freeMem / 1024 / 1024 / 1024 * 100) / 100,
            usagePercent: Math.round((1 - freeMem / totalMem) * 1000) / 10,
          },
        },
        connections: {
          http: httpConnections,
          redis: redisInfo,
          mysql: mysqlStatus,
        },
      },
    });
  });
}
