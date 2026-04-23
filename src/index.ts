import path from "path";
import { fileURLToPath } from "url";
import { env } from "./config/env.js";
import { setupGlobalHttpAgent } from "./config/httpAgent.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Setup global HTTP connection pool for all fetch calls
setupGlobalHttpAgent();

async function createApp() {
  const { default: Fastify } = await import("fastify");
  const { default: cors } = await import("@fastify/cors");
  const { default: fastifyStatic } = await import("@fastify/static");
  const { default: swagger } = await import("@fastify/swagger");
  const { default: scalar } = await import("@scalar/fastify-api-reference");
  const { authMiddleware } = await import("./middleware/auth.js");
  const { adminAuthMiddleware } = await import("./middleware/adminAuth.js");
  const { setupRateLimit } = await import("./middleware/rateLimit.js");
  const { jobRoutes } = await import("./routes/jobs.js");
  const { adminRoutes } = await import("./routes/admin.js");

  const storagePath = path.join(__dirname, "..", "storage");

  const app = Fastify({
    logger: true,
    trustProxy: true,
    ajv: {
      customOptions: {
        removeAdditional: "all",
        useDefaults: true,
      },
      plugins: [
        ((ajv: any) => {
          ajv.addKeyword("example");
        }) as any,
      ],
    } as any,
  });

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin || origin === "null") {
        cb(null, true);
        return;
      }
      cb(null, true);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    preflight: true,
    strictPreflight: false,
  });

  await app.register(swagger, {
    openapi: {
      openapi: "3.0.0",
      info: { title: "Tesk Backend API", version: "1.0.0" },
      servers: [{ url: `http://localhost:${env.port}` }],
      components: {
        securitySchemes: {
          BearerAuth: { type: "http", scheme: "bearer" },
        },
      },
    },
  });
  await app.register(scalar, {
    routePrefix: "/api-docs",
    configuration: {
      theme: "purple",
      layout: "modern",
    },
  });

  app.get("/health", { schema: { hide: true } }, async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  await setupRateLimit(app);

  app.register(
    async (instance) => {
      instance.addHook("onRequest", authMiddleware);
      await jobRoutes(instance);
    },
    { prefix: "" }
  );

  app.register(
    async (instance) => {
      instance.addHook("onRequest", adminAuthMiddleware);
      await adminRoutes(instance);
    },
    { prefix: "" }
  );

  const publicPath = path.join(__dirname, "..", "admin", "dist");

  await app.register(fastifyStatic, {
    root: storagePath,
    prefix: "/storage/",
    decorateReply: false,
  });

  await app.register(fastifyStatic, {
    root: publicPath,
    prefix: "/admin/",
    redirect: true,
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/admin")) {
      return reply.sendFile("index.html", publicPath);
    }
    reply.status(404).send({ code: 404, msg: "Not Found" });
  });

  return app;
}

async function startApiServer() {
  const app = await createApp();

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    console.log(`🚀 API server running on http://localhost:${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  return app;
}

async function startAll() {
  const app = await createApp();

  const { startWorker } = await import("./workers/taskWorker.js");
  const { startTimeoutChecker } = await import("./services/timeoutChecker.js");

  const worker = startWorker();

  const { startWebhookWorker } = await import("./workers/webhookWorker.js");
  startWebhookWorker();

  startTimeoutChecker();

  try {
    await app.listen({ port: env.port, host: "0.0.0.0" });
    console.log(`🚀 Server running on http://localhost:${env.port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  return { app, worker };
}

let shutdownInProgress = false;
async function gracefulShutdown(worker?: any, app?: any) {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  console.log("Shutting down gracefully...");
  try {
    if (worker) await worker.close();
    if (app) await app.close();
  } catch (err) {
    console.error("Error during shutdown:", err);
  }
  process.exit(0);
}

const processType = env.processType;

if (processType === "api") {
  startApiServer().then((app) => {
    process.on("SIGTERM", () => gracefulShutdown(undefined, app));
    process.on("SIGINT", () => gracefulShutdown(undefined, app));
  });
} else if (processType === "worker") {
  import("./workers/taskWorker.js").then(({ startWorker }) => {
    import("./workers/webhookWorker.js").then(({ startWebhookWorker }) => {
      const worker = startWorker();
      const webhookWorker = startWebhookWorker();
      process.on("SIGTERM", () => gracefulShutdown(worker));
      process.on("SIGINT", () => gracefulShutdown(worker));
      console.log(`👷 Worker started (concurrency: ${env.workerConcurrency})`);
    });
  });
} else if (processType === "timeout") {
  import("./services/timeoutChecker.js").then(({ startTimeoutChecker }) => {
    startTimeoutChecker();
    console.log("⏱️  Timeout checker started");
  });
} else {
  startAll().then(({ app, worker }) => {
    process.on("SIGTERM", () => gracefulShutdown(worker, app));
    process.on("SIGINT", () => gracefulShutdown(worker, app));
  });
}
