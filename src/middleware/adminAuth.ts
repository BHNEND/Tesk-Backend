import { FastifyRequest, FastifyReply } from "fastify";
import { env } from "../config/env.js";

export async function adminAuthMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  // 1. 跳过 OPTIONS 请求和登录接口
  if (request.method === "OPTIONS" || request.url.includes("/admin/login")) {
    return;
  }

  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      code: 401,
      msg: "Missing or invalid Authorization header",
    });
  }

  const token = authHeader.slice(7);
  if (token !== env.adminApiKey) {
    return reply.status(403).send({
      code: 403,
      msg: "Invalid admin API key",
    });
  }
}
