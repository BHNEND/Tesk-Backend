import Fastify from "fastify";
import { env } from "./config/env.js";

const app = Fastify({ logger: true });

app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    console.log(`🚀 Server running on http://localhost:${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
