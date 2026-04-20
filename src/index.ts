import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import path from "path";
import { fileURLToPath } from "url";
import { authMiddleware } from "./middleware/auth.js";
import { adminAuthMiddleware } from "./middleware/adminAuth.js";
import { setupRateLimit } from "./middleware/rateLimit.js";
import { jobRoutes } from "./routes/jobs.js";
import { adminRoutes } from "./routes/admin.js";
import { startWorker } from "./workers/taskWorker.js";
import { startTimeoutChecker } from "./services/timeoutChecker.js";
import { env } from "./config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = Fastify({ 
  logger: true,
  trustProxy: true // 开启以获取真实客户端 IP (尤其是在 Nginx/CDN 之后)
});

// 注册 CORS 插件 (兼容性最强的配置)
await app.register(cors, {
  origin: (origin, cb) => {
    // 允许所有来源，并专门处理浏览器的 null (file://) 来源
    if (!origin || origin === "null") {
      cb(null, true);
      return;
    }
    cb(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  preflight: true,
  strictPreflight: false, // 关闭严格预检，对本地测试更友好
});

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
  { prefix: "/admin" }
);

// Serve admin frontend static files (must be registered last)
const publicPath = path.join(__dirname, "..", "public");
await app.register(fastifyStatic, {
  root: publicPath,
  prefix: "/admin/",
  redirect: true,
});

// SPA fallback: serve index.html for all /admin/* paths not matched by static files
app.setNotFoundHandler((request, reply) => {
  if (request.url.startsWith("/admin")) {
    return reply.sendFile("index.html", publicPath);
  }
  reply.status(404).send({ code: 404, msg: "Not Found" });
});

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
