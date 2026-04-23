import Redis from "ioredis";
import { env } from "./env.js";

export const redis = new Redis(env.redisUrl);

export const redisBullMQ = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null,
});
