import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const baseURL = "http://localhost:3000";

async function prismaWithRetry<T>(operation: () => Promise<T>, attempts = 20): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (i === attempts - 1) {
        throw error;
      }
      const delayMs = Math.min(1500, 200 + i * 100);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Prisma operation failed");
}

async function isDatabaseReachable(prisma: PrismaClient): Promise<boolean> {
  try {
    await prismaWithRetry(() => prisma.$queryRaw`SELECT 1`, 3);
    return true;
  } catch {
    return false;
  }
}

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const candidates = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
  ];

  for (const envPath of candidates) {
    if (!fs.existsSync(envPath)) continue;
    const content = fs.readFileSync(envPath, "utf8");
    const match = content.match(/^DATABASE_URL=(.*)$/m);
    if (!match?.[1]) continue;
    const value = match[1].trim().replace(/^"|"$/g, "").replace(/^'|'$/g, "");
    if (value) {
      process.env.DATABASE_URL = value;
      return value;
    }
  }

  return undefined;
}

function getPrismaClient() {
  const url = resolveDatabaseUrl();
  if (!url) {
    throw new Error("DATABASE_URL is required for e2e authenticated flow tests");
  }

  return new PrismaClient({
    adapter: new PrismaPg(new Pool({ connectionString: url })),
  });
}

test.describe("Pro Upgrade Flow", () => {
  test("share export page renders printable pack", async ({ page }) => {
    const prisma = getPrismaClient();
    const shareToken = crypto.randomBytes(16).toString("hex");
    let designId: string | null = null;

    try {
      const dbReachable = await isDatabaseReachable(prisma);
      test.skip(!dbReachable, "Skipping DB-backed pro-upgrade test because database is unavailable");

      const design = await prismaWithRetry(() => prisma.design.create({
        data: {
          title: "Playwright Export Pack",
          roomWidth: 4,
          roomDepth: 3,
          items: [],
          zones: [],
          savedViews: [],
          shareEnabled: true,
          shareToken,
        },
      }));
      designId = design.id;

      await page.goto(`${baseURL}/share/${shareToken}/export`);

      await expect(page.getByRole("heading", { name: "Playwright Export Pack" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Download PDF( \(Pro\))?|Print \/ Save as PDF/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Practical Checks" })).toBeVisible();
      await expect(page.getByText("Walkways: Clear and accessible")).toBeVisible();
    } finally {
      if (designId) {
        const cleanupId = designId;
        await prismaWithRetry(() => prisma.design.deleteMany({ where: { id: cleanupId } }));
      }
      await prisma.$disconnect();
    }
  });
});
