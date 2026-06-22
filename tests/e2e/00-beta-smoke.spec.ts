import { expect, test } from "./fixtures";
import fs from "node:fs/promises";
import type { APIRequestContext, Download, Locator } from "@playwright/test";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import { legacyApiToSnapshot } from "../../lib/room-persistence";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const EDITOR_STORAGE_KEY = "interior-ai:v1:livingroom-design";

async function getFingerprint(locator: Locator) {
  await expect(locator).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/, { timeout: 20000 });
  const fingerprint = await locator.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Missing QA snapshot fingerprint");
  return fingerprint;
}

async function getStableFingerprint(locator: Locator) {
  let previous = "";
  let stableSamples = 0;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await getFingerprint(locator);
    if (current === previous) {
      stableSamples += 1;
      if (stableSamples >= 2) return current;
    } else {
      previous = current;
      stableSamples = 0;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return previous;
}

async function expectFingerprint(locator: Locator, expectedFingerprint: string) {
  await expect(locator).toHaveAttribute("data-fingerprint", expectedFingerprint, { timeout: 30000 });
  expect(await getFingerprint(locator)).toBe(expectedFingerprint);
}

async function expectNumericAttributeAtLeast(locator: Locator, name: string, minimum: number) {
  await expect
    .poll(
      async () => {
        const raw = await locator.getAttribute(name);
        return raw ? Number(raw) : Number.NaN;
      },
      { timeout: 30000 }
    )
    .toBeGreaterThanOrEqual(minimum);
}

async function getApiDesignFingerprint(
  request: APIRequestContext,
  designId: string,
  shareToken: string
) {
  const response = await request.get(`${BASE_URL}/api/designs/${designId}?shareToken=${shareToken}`);
  expect(response.status()).toBe(200);
  return fingerprintDesignSnapshot(legacyApiToSnapshot(await response.json()));
}

async function readDownloadText(download: Download) {
  const path = await download.path();
  if (!path) throw new Error(`Missing download path for ${download.suggestedFilename()}`);
  return fs.readFile(path, "utf8");
}

async function readDownloadBytes(download: Download) {
  const path = await download.path();
  if (!path) throw new Error(`Missing download path for ${download.suggestedFilename()}`);
  return fs.readFile(path);
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
      await addAuthCookies(page.context(), BASE_URL, seed.sessionToken);

      expect(await getApiDesignFingerprint(request, seed.designId, seed.shareToken)).toBe(
        expectedFingerprint
      );

      await page.goto("/design");
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
      await page.getByTestId("load-design").click();
      await expect(page.getByTestId("load-designs-modal")).toBeVisible();
      await page.getByTestId(`load-design-${seed.designId}`).click();
      await expect(page.getByTestId("load-designs-modal")).toBeHidden();
      const loadedEditorFingerprint = await getStableFingerprint(
        page.getByTestId("qa-editor-snapshot-fingerprint")
      );
      expect(loadedEditorFingerprint).toMatch(/[a-f0-9]{8}/);
      const editorPerformance = page.getByTestId("qa-scene-performance");
      await expect(editorPerformance).toHaveAttribute("data-room-count", "3");
      await expect(editorPerformance).toHaveAttribute("data-scene-ready", "true", {
        timeout: 30000,
      });
      await expect(editorPerformance).toHaveAttribute("data-mode", "auto");
      await expect(editorPerformance).toHaveAttribute("data-effective-mode", /^(quality|lite)$/);
      await expectNumericAttributeAtLeast(editorPerformance, "data-scene-item-count", 9);
      await expectNumericAttributeAtLeast(editorPerformance, "data-fps-samples", 1);
      await expectNumericAttributeAtLeast(editorPerformance, "data-last-fps", 1);
      await page.waitForFunction(
        ({ key, designId }) => {
          const raw = window.localStorage.getItem(key);
          if (!raw) return false;
          try {
            return JSON.parse(raw)?.designId === designId;
          } catch {
            return false;
          }
        },
        { key: EDITOR_STORAGE_KEY, designId: seed.designId },
        { timeout: 10000 }
      );

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
      const reloadedEditorFingerprint = await getStableFingerprint(
        page.getByTestId("qa-editor-snapshot-fingerprint")
      );
      expect(reloadedEditorFingerprint).toMatch(/[a-f0-9]{8}/);

      const cloudFingerprint = await getApiDesignFingerprint(request, seed.designId, seed.shareToken);
      expect(cloudFingerprint).toMatch(/[a-f0-9]{8}/);

      await page.goto(`/share/${seed.shareToken}`);
      await expect(page.getByTestId("share-viewer")).toBeVisible({ timeout: 30000 });
      await expect(page.getByTestId("share-room-list")).toContainText("Living Room");
      await expect(page.getByTestId("share-checkout-readiness")).toContainText(/Cart-ready|Retailer link/i);
      await expect(page.getByTestId("share-copy-link")).toBeVisible();
      await expect(page.getByTestId("share-export-pack")).toBeVisible();
      await expect(page.getByTestId("share-copy-to-edit")).toBeVisible();
      await expectFingerprint(page.getByTestId("qa-share-snapshot-fingerprint"), cloudFingerprint);
      await page.context().grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: BASE_URL,
      });
      await page.getByTestId("share-copy-link").click();
      await expect(page.getByRole("status")).toContainText("Link copied.");
      const copiedShareUrl = await page.evaluate(() => navigator.clipboard.readText());
      expect(copiedShareUrl).toContain(`/share/${seed.shareToken}`);

      await page.getByTestId("share-export-pack").click();
      await expect(page).toHaveURL(/\/export$/);
      await expect(page.getByText("Export Overview")).toBeVisible({ timeout: 30000 });
      await expectFingerprint(page.getByTestId("qa-export-snapshot-fingerprint"), cloudFingerprint);

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
      const csv = await readDownloadText(csvDownload);
      expect(csv.split("\n")[0]).toBe(
        "Room,Category,Item,Product ID,Variant ID,Variant,Purchase option,Qty,Status,Source,Retailer URL,Include in checkout,Unit price USD,Line total USD,Room subtotal USD,Review note"
      );
      expect(csv).toContain("Living Room");
      expect(csv).toContain("armchair-real-castlery-avery-performance-armchair");

      const svgDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-svg-download").first().click();
      const svgDownload = await svgDownloadPromise;
      expect(svgDownload.suggestedFilename()).toMatch(/2d-plan\.svg$/);
      const svg = await readDownloadText(svgDownload);
      expect(svg.length).toBeGreaterThan(500);
      expect(svg).toContain("<svg");
      expect(svg).toContain("</svg>");

      const pngDownloadPromise = page.waitForEvent("download");
      await page.getByTestId("share-export-plan-png-download").first().click();
      const pngDownload = await pngDownloadPromise;
      expect(pngDownload.suggestedFilename()).toMatch(/2d-plan\.png$/);
      const png = await readDownloadBytes(pngDownload);
      expect(png.length).toBeGreaterThan(1000);
      expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

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

      const mobileEditorContext = await browser.newContext({
        baseURL: BASE_URL,
        viewport: { width: 390, height: 844 },
        isMobile: true,
      });
      const mobileEditorPage = await mobileEditorContext.newPage();
      await mobileEditorPage.goto("/design");
      await expect(mobileEditorPage.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30000,
      });
      await expect(mobileEditorPage.getByTestId("editor-command-bar")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("save-design")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("design-controls-panel")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("design-controls-panel-handle")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("plan-measurements-panel")).toBeVisible();
      await expect(mobileEditorPage.getByTestId("room-plan-status")).toBeVisible();
      const mobileEditorOverflow = await mobileEditorPage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(mobileEditorOverflow).toBeLessThanOrEqual(4);
      await mobileEditorContext.close();

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
      await page.getByTestId("load-design").click();
      await expect(page.getByTestId("load-designs-modal")).toBeVisible();
      await page.getByTestId(`load-design-${seed.designId}`).click();
      await expect(page.getByTestId("load-designs-modal")).toBeHidden();
      await expect(page.getByTestId("scene-performance-control")).toBeVisible();
      const scenePerformance = page.getByTestId("qa-scene-performance");
      await expectNumericAttributeAtLeast(scenePerformance, "data-room-count", 3);
      await expectNumericAttributeAtLeast(scenePerformance, "data-scene-item-count", 9);
      await page.getByTestId("scene-performance-lite").click();
      await expect(page.getByTestId("scene-performance-lite")).toHaveAttribute("data-active", "true");
      await expect(scenePerformance).toHaveAttribute("data-mode", "lite");
      await expect(scenePerformance).toHaveAttribute("data-effective-mode", "lite");
      await expect(scenePerformance).toHaveAttribute("data-render-quality", "lite");

      let retailerClickPayload: Record<string, unknown> = {};
      await page.route("**/api/track/click", async (route) => {
        retailerClickPayload = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ clickKey: "beta-smoke-click" }),
        });
      });
      await page.getByTestId("editor-workflow-shop").click();
      await expect(page.getByTestId("cart-panel")).toBeVisible();
      await expect(page.getByTestId("cart-checkout-readiness")).toContainText(/included line/i);
      await expect(page.getByTestId("checkout-affiliate")).toContainText(/Open retailer links/);
      const firstRetailerOpen = page.getByRole("button", { name: /^Open$/ }).first();
      await firstRetailerOpen.scrollIntoViewIfNeeded();
      const retailerPopupPromise = page.waitForEvent("popup");
      await firstRetailerOpen.click();
      const retailerPopup = await retailerPopupPromise;
      await retailerPopup.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => undefined);
      expect(retailerClickPayload?.designId).toBe(seed.designId);
      expect(retailerClickPayload?.productId).toBe("armchair-real-castlery-avery-performance-armchair");
      expect(String(retailerClickPayload?.buyUrl ?? "")).toContain("castlery.com");
      expect(retailerPopup.url()).toContain("clickKey=beta-smoke-click");
      expect(retailerPopup.url()).toContain("utm_source=interior-ai");
      await retailerPopup.close();

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
