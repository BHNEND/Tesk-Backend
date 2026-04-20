import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  databaseUrl: process.env.DATABASE_URL || "mysql://root:your_password@localhost:3306/tesk",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  adminApiKey: process.env.ADMIN_API_KEY || "admin-secret-key-change-in-production",
  adminUser: process.env.ADMIN_USER || "admin",
  adminPass: process.env.ADMIN_PASS || "admin123",
  runningHubApiKey: process.env.RUNNINGHUB_API_KEY || "",
  upstreamConfig: process.env.UPSTREAM_CONFIG || "[]",
};
