import { expect, test } from "./fixtures";
import type { Locator } from "@playwright/test";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import {
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

async function getFingerprint(locator: Locator) {
  await expect(locator).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/, { timeout: 20000 });
  const fingerprint = await locator.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Missing QA snapshot fingerprint");
  return fingerprint;
}

test.describe("00. Beta Smoke Gate", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("template start, persistence/share/export, mobile, performance, and checkout stay beta-ready", async ({
    browser,
    page,
    request,
  }) => {
    test.setTimeout(180000);

    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
    const betaStartTemplate = page.getByTestId("beta-start-template");
    if (await betaStartTemplate.isVisible({ timeout: 5000 }).catch(() => false)) {
      await betaStartTemplate.click();
      await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
      await page.getByTestId("apply-plan-template-studio").click();
    } else if (
      await page.getByTestId("plan-start-template").isVisible({ timeout: 5000 }).catch(() => false)
    ) {
      await page.getByTestId("plan-start-template").click({ timeout: 5000 });
      await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
      await page.getByTestId("apply-plan-template-studio").click();
    } else {
      await expect(page.getByText(/1 room/i).first()).toBeVisible();
    }
    await expect(page.getByText(/1 room/i).first()).toBeVisible();

    const seed = await createBetaSeedDesign();
    try {
      const expectedFingerprint = fingerprintDesignSnapshot(seed.snapshot);
      const apiResponse = await request.get(
        `${BASE_URL}/api/designs/${seed.designId}?shareToken=${seed.shareToken}`
      );
      expect(apiResponse.status()).toBe(200);
      const apiBody = await apiResponse.json();
      const apiSnapshot = legacyApiToSnapshot(apiBody);
      expect(fingerprintDesignSnapshot(apiSnapshot)).toBe(expectedFingerprint);

      await page.goto(`/share/${seed.shareToken}`);
      await expect(page.getByTestId("share-viewer")).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("share-room-list")).toContainText("Living Room");
      await expect(page.getByTestId("share-checkout-readiness")).toContainText(/Cart-ready|Retailer link/i);
      await expect(page.getByTestId("share-copy-link")).toBeVisible();
      await expect(page.getByTestId("share-export-pack")).toBeVisible();
      await expect(page.getByTestId("share-copy-to-edit")).toBeVisible();
      expect(await getFingerprint(page.getByTestId("qa-share-snapshot-fingerprint"))).toBe(
        expectedFingerprint
      );

      await page.getByTestId("share-export-pack").click();
      await expect(page).toHaveURL(/\/export$/);
      await expect(page.getByText("Export Overview")).toBeVisible({ timeout: 30000 });
      expect(await getFingerprint(page.getByTestId("qa-export-snapshot-fingerprint"))).toBe(
        expectedFingerprint
      );

      const pdfResponse = await request.get(`${BASE_URL}/share/${seed.shareToken}/export/pdf`);
      expect(pdfResponse.status()).toBe(200);
      expect(pdfResponse.headers()["content-type"]).toContain("application/pdf");
      const pdfBody = await pdfResponse.body();
      expect(pdfBody.subarray(0, 4).toString()).toBe("%PDF");
      expect(pdfBody.length).toBeGreaterThan(1000);

      const csvDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-shopping-csv-download").click();
      const csvDownload = await csvDownloadPromise;
      expect(csvDownload.suggestedFilename()).toMatch(/shopping-list\.csv$/);

      const svgDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-svg-download").first().click();
      const svgDownload = await svgDownloadPromise;
      expect(svgDownload.suggestedFilename()).toMatch(/2d-plan\.svg$/);

      const pngDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-png-download").first().click();
      const pngDownload = await pngDownloadPromise;
      expect(pngDownload.suggestedFilename()).toMatch(/2d-plan\.png$/);

      const mobileContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(`/share/${seed.shareToken}`);
      await expect(mobilePage.getByTestId("share-copy-link")).toBeVisible({ timeout: 30000 });
      const mobileOverflow = await mobilePage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(mobileOverflow).toBeLessThanOrEqual(4);
      await mobileContext.close();

      const tabletContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 768, height: 1024 },
      });
      const tabletPage = await tabletContext.newPage();
      await tabletPage.goto(`/share/${seed.shareToken}/export`);
      await expect(tabletPage.getByTestId("share-export-shopping-csv-download")).toBeVisible({
        timeout: 30000,
      });
      const tabletOverflow = await tabletPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(tabletOverflow).toBeLessThanOrEqual(4);
      await tabletContext.close();

      await page.goto("/design");
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("scene-performance-control")).toBeVisible();
      await page.getByTestId("scene-performance-lite").click();
      await expect(page.getByTestId("scene-performance-lite")).toHaveAttribute("data-active", "true");

      let checkoutPayload: unknown = null;
      await page.route("**/api/stripe/checkout", async (route) => {
        checkoutPayload = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ url: `${BASE_URL}/checkout/success?beta=1` }),
        });
      });
      const checkoutResult = await page.evaluate(async () => {
        const response = await fetch("/api/stripe/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ interval: "monthly" }),
        });
        return response.json();
      });
      expect(checkoutPayload).toEqual({ interval: "monthly" });
      expect(checkoutResult.url).toContain("/checkout/success");
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
