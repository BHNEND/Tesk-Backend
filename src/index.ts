import Fastify from "fastify";
import { authMiddleware } from "./middleware/auth.js";
import { adminAuthMiddleware } from "./middleware/adminAuth.js";
import { setupRateLimit } from "./middleware/rateLimit.js";
import { jobRoutes } from "./routes/jobs.js";
import { adminRoutes } from "./routes/admin.js";
import { startWorker } from "./workers/taskWorker.js";
import { startTimeoutChecker } from "./services/timeoutChecker.js";
import { env } from "./config/env.js";

const app = Fastify({ logger: true });

// Health check (no auth)
app.get("/health", async () => {
  return { status: "ok", timestamp: new Date().toISOString() };
});

// Setup rate limiting
await setupRateLimit(app);

// Public API routes (Bearer Token auth from ApiKey table)
app.register(
  async (instance) => {
    instance.addHook("onRequest", authMiddleware);
    await jobRoutes(instance);
  },
  { prefix: "" }
);

// Admin routes (Admin API Key auth)
app.register(
  async (instance) => {
    instance.addHook("onRequest", adminAuthMiddleware);
    await adminRoutes(instance);
  },
  { prefix: "" }
);

// Start BullMQ worker
const worker = startWorker();

// Start timeout checker
startTimeoutChecker();

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
