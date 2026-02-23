import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Resolve DATABASE_URL synchronously BEFORE Prisma initializes
const resolvedDatabaseUrl = (() => {
  const fs = require("fs");
  const path = require("path");
  const appEnv = (process.env.APP_ENV || process.env.NODE_ENV || "development").toLowerCase();

  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const possiblePaths = [
    path.resolve(process.cwd(), `.env.${appEnv}`),
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "interior-ai", ".env.local"),
    path.resolve(process.cwd(), "interior-ai", `.env.${appEnv}`),
    path.join(__dirname, "..", ".env.local"),
    path.join(__dirname, "..", `.env.${appEnv}`),
    path.join(__dirname, "..", ".env"),
    path.join(__dirname, "..", "..", "interior-ai", ".env.local"),
    path.join(__dirname, "..", "..", "interior-ai", `.env.${appEnv}`),
  ];

  for (const envPath of possiblePaths) {
    try {
      if (!fs.existsSync(envPath)) continue;
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split("\n");
      for (const line of lines) {
        if (!line.trim() || line.trim().startsWith("#")) continue;
        if (!line.includes("DATABASE_URL=")) continue;
        let value = line.split("DATABASE_URL=")[1].trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (value) {
          process.env.DATABASE_URL = value;
          return value;
        }
      }
    } catch (e) {
      console.warn(`[Prisma] Error reading ${envPath}:`, e instanceof Error ? e.message : e);
    }
  }

  return undefined;
})();

const connectionString = resolvedDatabaseUrl || process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL not set. Check your .env.local file or DATABASE_URL environment variable.");
}

const globalForPrisma = global as unknown as {
  prisma?: PrismaClient;
  prismaUrl?: string;
};

const shouldReuse =
  globalForPrisma.prisma && globalForPrisma.prismaUrl === connectionString;

export const prisma = shouldReuse
  ? globalForPrisma.prisma!
  : new PrismaClient({
      adapter: new PrismaPg(new Pool({ connectionString })),
    });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaUrl = connectionString;
}
