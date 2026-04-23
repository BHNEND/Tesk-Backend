import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  databaseUrl: process.env.DATABASE_URL || "mysql://root:your_password@localhost:3306/tesk_backend",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  adminApiKey: process.env.ADMIN_API_KEY || "admin-secret-key-change-in-production",
  adminUser: process.env.ADMIN_USER || "admin",
  adminPass: process.env.ADMIN_PASS || "admin123",
  runningHubApiKey: process.env.RUNNINGHUB_API_KEY || "",
  gptImage2ApiKey: process.env.GPTIMAGE2_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  publicUrl: process.env.PUBLIC_URL || "",
  upstreamConfig: process.env.UPSTREAM_CONFIG || "[]",
  s3Endpoint: process.env.S3_ENDPOINT || "",
  s3Region: process.env.S3_REGION || "auto",
  s3AccessKey: process.env.S3_ACCESS_KEY || "",
  s3SecretKey: process.env.S3_SECRET_KEY || "",
  s3Bucket: process.env.S3_BUCKET || "",
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || "20", 10),
  appWorkerConcurrency: parseInt(process.env.APP_WORKER_CONCURRENCY || "8", 10),
  processType: (process.env.PROCESS_TYPE || "all") as "all" | "api" | "worker" | "timeout",
  databasePoolLimit: parseInt(process.env.DATABASE_POOL_LIMIT || "30", 10),
};
