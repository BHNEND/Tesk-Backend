import { FastifyRequest, FastifyReply } from "fastify";
import rateLimit from "@fastify/rate-limit";
import { FastifyInstance } from "fastify";

export async function setupRateLimit(app: FastifyInstance) {
  await app.register(rateLimit, {
    max: 10,
    timeWindow: "1 second",
    keyGenerator: (request: FastifyRequest) => {
      return request.apiKey || request.ip;
    },
    errorResponseBuilder: () => ({
      code: 429,
      msg: "Too many requests, max 10 per second per API key",
    }),
  });
}
