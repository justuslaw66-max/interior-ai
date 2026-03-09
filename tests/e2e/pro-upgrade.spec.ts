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
  test("free user upgrades to pro in export flow", async ({ page }) => {
    const prisma = getPrismaClient();
    const runId = Date.now();
    const shareToken = crypto.randomBytes(16).toString("hex");
    let currentPlan: "free" | "pro" = "free";

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

      await page.route("**/api/me", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ plan: currentPlan }),
        });
      });

      await page.route("**/api/stripe/checkout-pro", async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            sessionId: "cs_test_mock",
            url: "/__test/checkout",
          }),
        });
      });

      await page.goto(`${baseURL}/share/${shareToken}/export`);

      const downloadButton = page.getByRole("button", { name: /Download PDF/ });
      await expect(page.getByTestId("export-watermark")).toBeVisible();
      await expect(downloadButton).toHaveText("Download PDF (Pro)");
      await expect(page.getByText("Upgrade to Pro")).toBeHidden();

      await downloadButton.click();
      await expect(page.getByRole("button", { name: /Upgrade to Pro/ })).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/share/${shareToken}/export`));

      await Promise.all([
        page.waitForRequest("**/api/stripe/checkout-pro"),
        page.getByRole("button", { name: /Upgrade to Pro/ }).click(),
      ]);
      await page.waitForURL(/__test\/checkout/);

      currentPlan = "pro";

      await page.goto(`${baseURL}/share/${shareToken}/export`);

      await expect(page.getByTestId("export-watermark")).toBeHidden();
      await expect(downloadButton).toHaveText("Download PDF");
      await expect(page.getByRole("button", { name: /Upgrade to Pro/ })).toBeHidden();

      await prisma.design.delete({ where: { id: design.id } });
    } finally {
      await prisma.$disconnect();
    }
  });
});
