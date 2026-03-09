import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const baseURL = "http://localhost:3000";

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
      const design = await prisma.design.create({
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
      });
      designId = design.id;

      await page.goto(`${baseURL}/share/${shareToken}/export`);

      await expect(page.getByRole("heading", { name: "Playwright Export Pack" })).toBeVisible();
      await expect(page.getByRole("button", { name: /Print \/ Save as PDF/i })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Practical Checks" })).toBeVisible();
      await expect(page.getByText("Walkways: Clear and accessible")).toBeVisible();
    } finally {
      if (designId) {
        await prisma.design.deleteMany({ where: { id: designId } });
      }
      await prisma.$disconnect();
    }
  });
});
