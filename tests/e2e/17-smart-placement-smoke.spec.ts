import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { storedToSnapshot, type StoredDesign } from "../../lib/room-persistence";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import {
  getSelectedItemPanel,
  openCatalogPreview,
  waitForCatalogReady,
} from "./variant-test-utils";

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";

async function readFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/);
  const fingerprint = await marker.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Editor snapshot fingerprint is missing");
  return fingerprint;
}

async function readPersistedFingerprint(page: Page): Promise<string> {
  const rawBackup = await page.evaluate(
    (storageKey) => window.localStorage.getItem(storageKey),
    DESIGN_STORAGE_KEY,
  );
  if (!rawBackup) throw new Error("Local design backup is missing");
  return fingerprintDesignSnapshot(
    storedToSnapshot(JSON.parse(rawBackup) as StoredDesign),
  );
}

async function startCatalogPlacement(page: Page, productId: string) {
  const previewAddButton = page.getByTestId("catalog-detail-add-to-room");
  if (await previewAddButton.isVisible().catch(() => false)) {
    await previewAddButton.click({ force: true, noWaitAfter: true });
    return;
  }

  const exactAddButton = page.getByTestId(`catalog-add-${productId}`);
  const addButton =
    (await exactAddButton.count()) > 0
      ? exactAddButton.first()
      : page.locator('[data-testid^="catalog-add-"]').first();
  await addButton.scrollIntoViewIfNeeded();
  await expect(addButton).toBeVisible({ timeout: 15000 });
  await addButton.click({ force: true, noWaitAfter: true });
}

test.describe("17. Smart Placement Smoke", () => {
  test("add item, preview cross-room placement controls, confirm, and reload", async ({ page }) => {
    test.setTimeout(180_000);

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
    } else {
      const planStartTemplate = page.getByTestId("plan-start-template");
      await expect(planStartTemplate).toBeVisible({ timeout: 5000 });
      await planStartTemplate.click();
    }
    await expect(page.getByTestId("apply-furnished-template-studio")).toBeVisible();
    await page.getByTestId("apply-furnished-template-studio").click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
      "4 rooms",
    );

    const ready = await waitForCatalogReady(page);
    expect(ready, "Catalog controls must be available for smart placement").toBe(
      true,
    );
    const roomSelect = page.getByTestId("furnish-room-target-select");
    await expect(roomSelect).toBeVisible();
    await roomSelect.selectOption({ label: "Bathroom" });
    await expect(page.getByTestId("room-plan-status-room-name")).toContainText(
      "Bathroom",
    );
    const baselineFingerprint = await readFingerprint(page);

    const productId = "sofa-real-castlery-madison-2s";
    const previewOpened = await openCatalogPreview(page, productId, "Madison");
    expect(
      previewOpened,
      "The Madison smart-placement fixture must be visible in the catalog",
    ).toBe(true);
    await expect(page.getByTestId("catalog-item-drawer")).toContainText(
      "Madison Sofa",
    );

    await startCatalogPlacement(page, productId);
    await expect(page.getByTestId("catalog-placement-confirm-panel")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("catalog-placement-target-room")).toBeVisible();
    await expect(page.getByTestId("catalog-placement-score-card")).toBeVisible();

    const bestRoomHint = page.getByTestId("catalog-placement-best-room-hint");
    await expect(bestRoomHint).toBeVisible();
    const bestRoomHintText = (await bestRoomHint.textContent())?.trim() ?? "";
    const bestRoomName = /^Best room:\s*(.+?)\s*·/.exec(bestRoomHintText)?.[1];
    expect(bestRoomName, "The best-room hint must identify its target room").toBeTruthy();
    if (!bestRoomName) throw new Error("Best-room hint is missing its target room");
    expect(bestRoomName).not.toBe("Bathroom");

    const bestRoom = page.getByTestId("catalog-placement-best-room");
    await expect(bestRoom).toBeVisible();
    await bestRoom.click();
    await expect(page.getByTestId("catalog-placement-target-room")).toContainText(
      bestRoomName,
    );

    await expect(page.getByTestId("catalog-placement-confirm")).toBeEnabled();
    await page.getByTestId("catalog-placement-confirm").click();
    await expect(page.getByTestId("catalog-placement-confirm-panel")).toBeHidden({ timeout: 10000 });
    await expect
      .poll(() => readFingerprint(page), { timeout: 10_000 })
      .not.toBe(baselineFingerprint);
    await expect(getSelectedItemPanel(page)).toContainText("Madison Sofa");

    await page.getByTestId("save-design").click();
    await expect(page.getByTestId("save-status")).toHaveAttribute(
      "data-status",
      "saved",
      { timeout: 30_000 },
    );
    await readPersistedFingerprint(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
      "4 rooms",
      { timeout: 30_000 },
    );
    await expect(page.getByTestId("save-status")).toHaveAttribute(
      "data-status",
      "saved",
      { timeout: 30_000 },
    );
    const hydratedPersistedFingerprint = await readPersistedFingerprint(page);
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      hydratedPersistedFingerprint,
      { timeout: 30_000 },
    );
    const reloadedReady = await waitForCatalogReady(page);
    expect(reloadedReady, "Catalog must remain available after reload").toBe(true);
    await page.getByTestId("furnish-room-target-select").selectOption({
      label: bestRoomName,
    });
    const restoredCatalogReady = await waitForCatalogReady(page);
    expect(
      restoredCatalogReady,
      "Catalog controls must reopen for the restored target room",
    ).toBe(true);
    await expect(page.getByTestId("furnish-shopping-preview")).toContainText(
      "Madison Sofa",
      { timeout: 30_000 },
    );
  });
});
