import { Queue, Worker, WorkerOptions } from "bullmq";
import { env } from "./env.js";

const connection = {
  connection: {
    host: new URL(env.redisUrl).hostname,
    port: parseInt(new URL(env.redisUrl).port || "6379", 10),
    maxRetriesPerRequest: null,
  },
};

export function createQueue(name: string) {
  return new Queue(name, connection);
}

export function createWorker(name: string, handler: Function, opts?: WorkerOptions) {
  return new Worker(name, handler as any, { ...connection, ...opts });
}
