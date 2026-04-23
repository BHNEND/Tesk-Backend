import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";

const poolLimit = env.databasePoolLimit;
const separator = env.databaseUrl.includes("?") ? "&" : "?";
const poolUrl = `${env.databaseUrl}${separator}connection_limit=${poolLimit}`;

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: poolUrl,
    },
  },
});
