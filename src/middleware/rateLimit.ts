import { FastifyRequest, FastifyReply } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { FastifyInstance } from "fastify";

export async function setupRateLimit(app: FastifyInstance<any, any, any, any, any>) {
  await app.register(rateLimit, {
    max: 10,
    timeWindow: "1 second",
    keyGenerator: (request: FastifyRequest) => {
      // Use API key from Authorization header if available, otherwise use IP
      const authHeader = request.headers.authorization || "";
      const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
      return token || request.ip;
    },
    errorResponseBuilder: () => ({
      code: 429,
      msg: "Too many requests, max 10 per second per API key",
    }),
  });
}
