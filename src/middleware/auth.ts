import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/prisma.js";
import { redis } from "../config/redis.js";
import { ApiKey } from "@prisma/client";

declare module "fastify" {
  interface FastifyRequest {
    apiKeyData?: ApiKey;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  if (request.method === "OPTIONS") return;

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({ code: 401, msg: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  const apiKey = await prisma.apiKey.findUnique({ where: { key: token } });

  if (!apiKey || apiKey.status !== "active") {
    return reply.status(401).send({ code: 401, msg: "Invalid or disabled API key" });
  }

  // 1. IP 白名单限制 (IP Restriction)
  if (apiKey.ipWhitelist) {
    const whitelist = apiKey.ipWhitelist.split(',').map(ip => ip.trim());
    const clientIp = request.ip;
    
    // 如果白名单不包含当前 IP，则拦截
    if (!whitelist.includes(clientIp)) {
      request.log.warn(`Unauthorized IP access attempt: ${clientIp} for Key: ${apiKey.name}`);
      return reply.status(403).send({
        code: 403,
        msg: `Forbidden: Your IP (${clientIp}) is not in the whitelist. Please contact admin.`
      });
    }
  }

  // 2. 每分钟并发/请求限制 (RPM - Requests Per Minute)
  const rpmLimit = apiKey.rpmLimit || 60;
  // 生成分级 Redis Key (格式: rate_limit:keyId:YYYYMMDDHHmm)
  const now = new Date();
  const minuteKey = `rate_limit:${apiKey.id}:${now.getFullYear()}${now.getMonth()+1}${now.getDate()}${now.getHours()}${now.getMinutes()}`;
  
  const currentRequests = await redis.incr(minuteKey);
  if (currentRequests === 1) {
    await redis.expire(minuteKey, 120); // 120 秒过期，足以覆盖当前分钟
  }

  if (currentRequests > rpmLimit) {
    return reply.status(429).send({
      code: 429,
      msg: `API Key rate limit exceeded: max ${rpmLimit} per minute.`,
    });
  }

  // 挂载数据用于后续并发数 (Concurrency) 检查
  request.apiKeyData = apiKey;
}
