import { Queue, Worker, WorkerOptions } from "bullmq";
import { redisBullMQ } from "./redis.js";

const baseConnection = {
  connection: redisBullMQ,
};

export function createQueue(name: string) {
  return new Queue(name, baseConnection);
}

export function createWorker(name: string, handler: Function, opts?: Partial<WorkerOptions>) {
  return new Worker(name, handler as any, { ...baseConnection, ...opts });
}
