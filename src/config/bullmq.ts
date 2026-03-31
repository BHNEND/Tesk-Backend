import { Queue, Worker } from "bullmq";
import { redis } from "./redis.js";

export const connection = {
  connection: redis,
};

export function createQueue(name: string) {
  return new Queue(name, connection);
}

export function createWorker(name: string, handler: Function) {
  return new Worker(name, handler as any, connection);
}
