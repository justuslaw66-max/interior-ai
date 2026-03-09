import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { test, expect } from "./fixtures";

const baseURL = "http://localhost:3000";
const sessionCookieName = "authjs.session-token";

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
  test("free user upgrades to pro in export flow", async ({ page, request, context }) => {
    const prisma = getPrismaClient();
    const runId = Date.now();
    const email = `flowcheck+${runId}@local.test`;
    const sessionToken = `${crypto.randomUUID().replace(/-/g, "")}${crypto
      .randomUUID()
      .replace(/-/g, "")}`;
    const shareToken = crypto.randomBytes(16).toString("hex");

    try {
      const user = await prisma.user.create({
        data: {
          email,
          name: "Playwright Flow Check",
          plan: "free",
        },
      });

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
          userId: user.id,
        },
      });

      await prisma.session.create({
        data: {
          userId: user.id,
          sessionToken,
          expires: new Date(Date.now() + 1000 * 60 * 60),
        },
      });

      await context.addCookies([
        {
          name: sessionCookieName,
          value: sessionToken,
          domain: "localhost",
          path: "/",
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ]);

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

      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: "pro",
          stripeCustomerId: `test_customer_${user.id}`,
          stripeSubscriptionId: `test_subscription_${user.id}`,
        },
      });

      const meResponse = await request.get(`${baseURL}/api/me`, {
        headers: {
          Cookie: `${sessionCookieName}=${sessionToken}`,
        },
      });
      expect(meResponse.status()).toBe(200);
      const meData = await meResponse.json();
      expect(meData?.plan).toBe("pro");

      await page.goto(`${baseURL}/share/${shareToken}/export`);

      await expect(page.getByTestId("export-watermark")).toBeHidden();
      await expect(downloadButton).toHaveText("Download PDF");
      await expect(page.getByRole("button", { name: /Upgrade to Pro/ })).toBeHidden();

      await prisma.design.delete({ where: { id: design.id } });
    } finally {
      await prisma.session.deleteMany({ where: { sessionToken } });
      await prisma.user.deleteMany({ where: { email } });
      await prisma.$disconnect();
    }
  });
});
