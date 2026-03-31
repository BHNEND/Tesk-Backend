import dotenv from "dotenv";
dotenv.config();

export const env = {
  port: parseInt(process.env.PORT || "4000", 10),
  databaseUrl: process.env.DATABASE_URL || "mysql://root:your_password@localhost:3306/tesk",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
};
