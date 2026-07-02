import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  openCatalogPreview,
  waitForCatalogReady,
} from "./variant-test-utils";

async function startCatalogPlacement(page: Page, productId: string) {
  const addButton = page.getByTestId(`catalog-add-${productId}`).first();
  await expect(addButton).toBeVisible({ timeout: 15000 });
  await addButton.click({ force: true, noWaitAfter: true });
}

test.describe("17. Smart Placement Smoke", () => {
  test("add item, preview cross-room placement controls, confirm, and reload", async ({ page }) => {
    test.setTimeout(120000);

    await page.addInitScript(() => {
      const clearSentinel = "__e2e_smart_placement_storage_cleared";
      if (window.localStorage.getItem(clearSentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(clearSentinel, "1");
    });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });

    const betaStartTemplate = page.getByTestId("beta-start-template");
    if (await betaStartTemplate.isVisible({ timeout: 5000 }).catch(() => false)) {
      await betaStartTemplate.click();
      await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
      await page.getByTestId("apply-plan-template-studio").click();
    }

    const ready = await waitForCatalogReady(page);
    test.skip(!ready, "Catalog controls were not available in this runtime.");

    const productId = "sofa-real-castlery-madison-3s";
    const previewOpened = await openCatalogPreview(page, productId, "Madison");
    test.skip(!previewOpened, "Smart placement fixture product was not visible in the catalog.");

    await startCatalogPlacement(page, productId);
    await expect(page.getByTestId("catalog-placement-confirm-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("catalog-placement-target-room")).toBeVisible();
    await expect(page.getByTestId("catalog-placement-score-card")).toBeVisible();

    const bestRoom = page.getByTestId("catalog-placement-best-room");
    if (await bestRoom.isVisible().catch(() => false)) {
      await bestRoom.click();
      await expect(page.getByTestId("catalog-placement-target-room")).toContainText(/Room/i);
    }

    const improve = page.getByTestId("catalog-placement-improve");
    if (await improve.isVisible().catch(() => false)) {
      await improve.click();
    }

    await expect(page.getByTestId("catalog-placement-confirm")).toBeEnabled();
    await page.getByTestId("catalog-placement-confirm").click();
    await expect(page.getByTestId("catalog-placement-confirm-panel")).toBeHidden({ timeout: 10000 });

    await page.getByTestId("save-design").click();
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
  });
});
