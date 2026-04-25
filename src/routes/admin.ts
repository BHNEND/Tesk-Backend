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
    const cacheKey = "admin:stats";
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) {
      return reply.send(JSON.parse(cached));
    }

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

    const result = {
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
    };

    await redis.set(cacheKey, JSON.stringify(result), "EX", 30).catch(() => {});
    return reply.send(result);
  });

  // === Analytics ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : undefined;
    const timeFilter = start ? `AND createTime >= '${start.toISOString().slice(0, 19)}'` : "";
    const endTimeFilter = `AND createTime <= '${end.toISOString().slice(0, 19)}'`;

    // 1) 按 model + channel 聚合 total/success
    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT IFNULL(model, 'unknown') AS model, channel,
             COUNT(*) AS total,
             SUM(CASE WHEN state = 'SUCCESS' THEN 1 ELSE 0 END) AS success
      FROM TaskJob
      WHERE taskType = 'model' ${timeFilter} ${endTimeFilter}
      GROUP BY model, channel
    `);

    // 2) 按 model + usedKeyIndex 聚合 standard 成功的 tier 分布
    const tierRows: any[] = await prisma.$queryRawUnsafe(`
      SELECT IFNULL(model, 'unknown') AS model, usedKeyIndex AS usedKeyIndex, COUNT(*) AS cnt
      FROM TaskJob
      WHERE taskType = 'model' AND state = 'SUCCESS' AND channel = 'standard' AND usedKeyIndex IS NOT NULL
        ${timeFilter} ${endTimeFilter}
      GROUP BY model, usedKeyIndex
    `);

    // 组装
    const byModel: Record<string, any> = {};
    for (const r of rows) {
      const model = String(r.model);
      if (!byModel[model]) byModel[model] = { economy: { total: 0, success: 0 }, standard: { total: 0, success: 0, byTier: {} } };
      const ch = r.channel === "economy" ? "economy" : "standard";
      byModel[model][ch].total = Number(r.total);
      byModel[model][ch].success = Number(r.success);
    }
    for (const r of tierRows) {
      const model = String(r.model);
      if (!byModel[model]) byModel[model] = { economy: { total: 0, success: 0 }, standard: { total: 0, success: 0, byTier: {} } };
      byModel[model].standard.byTier[Number(r.usedKeyIndex)] = Number(r.cnt);
    }

    const data = Object.entries(byModel).map(([model, m]: [string, any]) => ({
      model,
      economy: { ...m.economy, successRate: m.economy.total > 0 ? Math.round(m.economy.success / m.economy.total * 10000) / 100 : null },
      standard: { ...m.standard, successRate: m.standard.total > 0 ? Math.round(m.standard.success / m.standard.total * 10000) / 100 : null },
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Timeline ===

  app.get<{ Querystring: { startDate?: string; endDate?: string; interval?: string } }>("/api/v1/admin/analytics/timeline", hidden, async (request, reply) => {
    const { startDate, endDate, interval } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 3600 * 1000);
    const trunc = interval === "day" ? "%Y-%m-%d" : "%Y-%m-%d %H:00";

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT DATE_FORMAT(createTime, '${trunc}') AS time,
             COUNT(*) AS total,
             SUM(CASE WHEN state = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
             SUM(CASE WHEN state = 'SUCCESS' AND costTime > 0 THEN costTime ELSE 0 END) AS totalTime
      FROM TaskJob
      WHERE createTime >= '${start.toISOString().slice(0, 19)}' AND createTime <= '${end.toISOString().slice(0, 19)}'
      GROUP BY time ORDER BY time
    `);

    const data = rows.map((r: any) => {
      const total = Number(r.total);
      const success = Number(r.success);
      const totalTime = Number(r.totalTime);
      return {
        time: String(r.time),
        total,
        success,
        successRate: total > 0 ? Math.round(success / total * 10000) / 100 : null,
        avgCostTime: success > 0 ? Math.round(totalTime / success) : null,
      };
    });

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Cost by Tier ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/cost-by-tier", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 3600 * 1000);

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT IFNULL(model, 'unknown') AS model, channel, usedKeyIndex AS usedKeyIndex,
             COUNT(*) AS cnt, AVG(costTime) AS avgCostTime
      FROM TaskJob
      WHERE state = 'SUCCESS' AND costTime > 0 AND taskType = 'model'
        AND createTime >= '${start.toISOString().slice(0, 19)}' AND createTime <= '${end.toISOString().slice(0, 19)}'
      GROUP BY model, channel, usedKeyIndex
    `);

    const grouped: Record<string, Record<string, { total: number; totalTime: number }>> = {};
    for (const r of rows) {
      const model = String(r.model);
      const tier = r.channel === "economy" ? "Economy" : `Key ${String.fromCharCode(65 + (Number(r.usedKeyIndex) || 0))}`;
      if (!grouped[model]) grouped[model] = {};
      if (!grouped[model][tier]) grouped[model][tier] = { total: 0, totalTime: 0 };
      grouped[model][tier].total += Number(r.cnt);
      grouped[model][tier].totalTime += Number(r.avgCostTime) * Number(r.cnt);
    }

    const data = Object.entries(grouped).map(([model, tiers]) => ({
      model,
      tiers: Object.entries(tiers).map(([tier, t]) => ({ tier, count: t.total, avgCostTime: Math.round(t.totalTime / t.total) })),
    }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Cost Timeline per Model ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/cost-timeline", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 3600 * 1000);

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT DATE_FORMAT(createTime, '%Y-%m-%d %H:00') AS time,
             IFNULL(model, 'unknown') AS model,
             AVG(costTime / 1000) AS avgCostTimeSec
      FROM TaskJob
      WHERE createTime >= '${start.toISOString().slice(0, 19)}' AND createTime <= '${end.toISOString().slice(0, 19)}'
        AND state = 'SUCCESS' AND costTime > 0 AND taskType = 'model'
      GROUP BY time, model ORDER BY time
    `);

    // pivot
    const buckets: Record<string, Record<string, number>> = {};
    for (const r of rows) {
      const time = String(r.time);
      const model = String(r.model);
      if (!buckets[time]) buckets[time] = {};
      buckets[time][model] = Math.round(Number(r.avgCostTimeSec) * 10) / 10;
    }

    const data = Object.entries(buckets).sort(([a], [b]) => a.localeCompare(b)).map(([time, models]) => ({ time, ...models }));

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Errors ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/errors", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : undefined;
    const timeFilter = start ? `AND createTime >= '${start.toISOString().slice(0, 19)}'` : "";
    const endTimeFilter = `AND createTime <= '${end.toISOString().slice(0, 19)}'`;

    const [codeRows, modelRows] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT IFNULL(failCode, 'UNKNOWN') AS code, COUNT(*) AS cnt FROM TaskJob WHERE state = 'FAILED' ${timeFilter} ${endTimeFilter} GROUP BY code`) as Promise<any[]>,
      prisma.$queryRawUnsafe(`SELECT IFNULL(model, IFNULL(appid, 'unknown')) AS name, IFNULL(failCode, 'UNKNOWN') AS code, COUNT(*) AS cnt FROM TaskJob WHERE state = 'FAILED' ${timeFilter} ${endTimeFilter} GROUP BY name, code`) as Promise<any[]>,
    ]);

    const byCode: Record<string, number> = {};
    for (const r of codeRows) byCode[String(r.code)] = Number(r.cnt);

    const byModel: Record<string, Record<string, number>> = {};
    for (const r of modelRows) {
      const name = String(r.name);
      const code = String(r.code);
      if (!byModel[name]) byModel[name] = {};
      byModel[name][code] = Number(r.cnt);
    }

    return reply.send({ code: 200, msg: "success", data: { total: Object.values(byCode).reduce((a, b) => a + b, 0), byCode, byModel } });
  });

  // === Analytics: Performance ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/performance", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : undefined;
    const timeFilter = start ? `AND createTime >= '${start.toISOString().slice(0, 19)}'` : "";
    const endTimeFilter = `AND createTime <= '${end.toISOString().slice(0, 19)}'`;

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT IFNULL(model, IFNULL(appid, 'unknown')) AS model,
             COUNT(*) AS cnt, AVG(costTime) AS avg_time
      FROM TaskJob WHERE state = 'SUCCESS' AND costTime > 0 ${timeFilter} ${endTimeFilter}
      GROUP BY model
    `);

    const data = rows.map((r: any) => ({
      model: String(r.model),
      count: Number(r.cnt),
      avg: Math.round(Number(r.avg_time)),
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
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : undefined;
    const timeFilter = start ? `AND createTime >= '${start.toISOString().slice(0, 19)}'` : "";
    const endTimeFilter = `AND createTime <= '${end.toISOString().slice(0, 19)}'`;

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT IFNULL(appid, 'unknown') AS app,
             COUNT(*) AS total,
             SUM(CASE WHEN state = 'SUCCESS' THEN 1 ELSE 0 END) AS success,
             SUM(CASE WHEN state = 'SUCCESS' AND costTime > 0 THEN costTime ELSE 0 END) AS totalTime
      FROM TaskJob WHERE taskType = 'app' ${timeFilter} ${endTimeFilter}
      GROUP BY app
    `);

    const data = rows.map((r: any) => {
      const total = Number(r.total);
      const success = Number(r.success);
      return {
        app: String(r.app),
        total,
        success,
        successRate: total > 0 ? Math.round(success / total * 10000) / 100 : null,
        avgCostTime: success > 0 ? Math.round(Number(r.totalTime) / success) : null,
      };
    });

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Cost Time Distribution ===

  app.get<{ Querystring: { startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/duration", hidden, async (request, reply) => {
    const { startDate, endDate } = request.query;
    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : undefined;
    const timeFilter = start ? `AND createTime >= '${start.toISOString().slice(0, 19)}'` : "";
    const endTimeFilter = `AND createTime <= '${end.toISOString().slice(0, 19)}'`;

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        SUM(CASE WHEN costTime < 5000 THEN 1 ELSE 0 END) AS b1,
        SUM(CASE WHEN costTime >= 5000 AND costTime < 15000 THEN 1 ELSE 0 END) AS b2,
        SUM(CASE WHEN costTime >= 15000 AND costTime < 30000 THEN 1 ELSE 0 END) AS b3,
        SUM(CASE WHEN costTime >= 30000 AND costTime < 60000 THEN 1 ELSE 0 END) AS b4,
        SUM(CASE WHEN costTime >= 60000 AND costTime < 300000 THEN 1 ELSE 0 END) AS b5,
        SUM(CASE WHEN costTime >= 300000 THEN 1 ELSE 0 END) AS b6
      FROM TaskJob WHERE state = 'SUCCESS' AND costTime > 0 ${timeFilter} ${endTimeFilter}
    `);

    const r = rows[0] || {};
    const data = [
      { label: "<5s", count: Number(r.b1 || 0) },
      { label: "5-15s", count: Number(r.b2 || 0) },
      { label: "15-30s", count: Number(r.b3 || 0) },
      { label: "30-60s", count: Number(r.b4 || 0) },
      { label: "1-5min", count: Number(r.b5 || 0) },
      { label: ">5min", count: Number(r.b6 || 0) },
    ];

    return reply.send({ code: 200, msg: "success", data });
  });

  // === Analytics: Model Detail (per-model channel timeline + errors) ===

  app.get<{ Querystring: { model?: string; startDate?: string; endDate?: string } }>("/api/v1/admin/analytics/model-detail", hidden, async (request, reply) => {
    const { model, startDate, endDate } = request.query;
    if (!model) return reply.status(400).send({ code: 400, msg: "Missing model" });

    const end = endDate ? new Date(endDate) : new Date();
    const start = startDate ? new Date(startDate) : new Date(end.getTime() - 24 * 3600 * 1000);
    const escapedModel = model.replace(/'/g, "\\'");

    const [tlRows, errRows] = await Promise.all([
      prisma.$queryRawUnsafe(`SELECT DATE_FORMAT(createTime, '%Y-%m-%d %H:00') AS time, channel, COUNT(*) AS total, SUM(CASE WHEN state = 'SUCCESS' THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN state = 'SUCCESS' AND costTime > 0 THEN costTime ELSE 0 END) AS totalTime FROM TaskJob WHERE model = '${escapedModel}' AND taskType = 'model' AND createTime >= '${start.toISOString().slice(0, 19)}' AND createTime <= '${end.toISOString().slice(0, 19)}' GROUP BY time, channel ORDER BY time`) as Promise<any[]>,
      prisma.$queryRawUnsafe(`SELECT channel, IFNULL(failCode, 'UNKNOWN') AS code, COUNT(*) AS cnt FROM TaskJob WHERE model = '${escapedModel}' AND taskType = 'model' AND state = 'FAILED' AND createTime >= '${start.toISOString().slice(0, 19)}' AND createTime <= '${end.toISOString().slice(0, 19)}' GROUP BY channel, code`) as Promise<any[]>,
    ]);

    // Assemble timeline
    const timeBuckets: Record<string, { economy: { total: number; success: number; totalTime: number }; standard: { total: number; success: number; totalTime: number } }> = {};
    for (const r of tlRows) {
      const time = String(r.time);
      if (!timeBuckets[time]) timeBuckets[time] = { economy: { total: 0, success: 0, totalTime: 0 }, standard: { total: 0, success: 0, totalTime: 0 } };
      const ch = r.channel === "economy" ? "economy" : "standard";
      timeBuckets[time][ch].total = Number(r.total);
      timeBuckets[time][ch].success = Number(r.success);
      timeBuckets[time][ch].totalTime = Number(r.totalTime);
    }

    const timeline = Object.entries(timeBuckets).sort(([a], [b]) => a.localeCompare(b)).map(([time, ch]) => ({
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

    // Assemble errors
    const errorsByCode: Record<string, number> = {};
    const errorsByChannel: Record<string, Record<string, number>> = { economy: {}, standard: {} };
    let errorTotal = 0;
    for (const r of errRows) {
      const code = String(r.code);
      const ch = r.channel === "economy" ? "economy" : "standard";
      const cnt = Number(r.cnt);
      errorsByCode[code] = (errorsByCode[code] || 0) + cnt;
      errorsByChannel[ch][code] = (errorsByChannel[ch][code] || 0) + cnt;
      errorTotal += cnt;
    }

    return reply.send({
      code: 200, msg: "success",
      data: { timeline, errors: { total: errorTotal, byCode: errorsByCode, byChannel: errorsByChannel } },
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
