import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../config/prisma.js";

declare module "fastify" {
  interface FastifyRequest {
    apiKey?: string;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return reply.status(401).send({
      code: 401,
      msg: "Missing or invalid Authorization header",
    });
  }

  const token = authHeader.slice(7);
  const apiKey = await prisma.apiKey.findUnique({ where: { key: token } });

  if (!apiKey || apiKey.status !== "active") {
    return reply.status(401).send({
      code: 401,
      msg: "Invalid or disabled API key",
    });
  }

  request.apiKey = token;
}
