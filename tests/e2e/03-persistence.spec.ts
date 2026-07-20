import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { fingerprintDesignSnapshot } from "../../lib/snapshot-fingerprint";
import {
  addAuthCookies,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
} from "./beta-seed";

async function readStableFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/, {
    timeout: 30_000,
  });
  let previous = "";
  let stableSamples = 0;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = (await marker.getAttribute("data-fingerprint")) ?? "";
    if (current === previous) {
      stableSamples += 1;
      if (stableSamples >= 2) return current;
    } else {
      previous = current;
      stableSamples = 0;
    }
    await page.waitForTimeout(250);
  }
  throw new Error("Editor snapshot fingerprint did not stabilize");
}

async function openMyDesigns(page: Page) {
  const accountButton = page.getByTestId("editor-command-account");
  const accountMenu = page.getByTestId("editor-command-account-menu");
  await expect(async () => {
    if (!(await accountMenu.isVisible())) {
      await accountButton.click();
    }
    await expect(accountMenu).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("editor-command-sign-out")).toBeVisible({
    timeout: 30_000,
  });
  await accountButton.click();

  await page.getByTestId("editor-command-overflow").click();
  const loadDesigns = page.getByTestId("editor-command-overflow-load");
  await expect(loadDesigns).toBeVisible();
  await loadDesigns.click();
  await expect(page.getByTestId("load-designs-modal")).toBeVisible();
}

async function loadSeedDesign(
  page: Page,
  seed: Awaited<ReturnType<typeof createBetaSeedDesign>>,
) {
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await addAuthCookies(page.context(), new URL(page.url()).origin, seed.sessionToken);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });
  await openMyDesigns(page);
  await page.getByTestId(`load-design-${seed.designId}`).click();
  await expect(page.getByTestId("load-designs-modal")).toBeHidden({
    timeout: 30_000,
  });
  await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
    "3 rooms",
  );
}

async function openFurnishPanel(page: Page) {
  const furnishButton = page
    .locator('[data-testid="editor-workflow-furnish"]:visible')
    .first();
  await expect(furnishButton).toBeVisible();
  await furnishButton.click();
  await expect(page.getByTestId("furnish-room-target-select")).toBeVisible();
}

async function openPresentExport(page: Page) {
  const exportButton = page
    .locator('[data-testid="editor-workflow-export"]:visible')
    .first();
  await expect(exportButton).toBeVisible();
  await exportButton.click();
  await page.getByTestId("editor-command-overflow").click();
  await page.getByTestId("editor-command-overflow-present-export").click();
  await expect(page.getByTestId("camera-view-name-input")).toBeVisible();
}

test.describe("3. Save + Reload Persistence", () => {
  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("cloud save preserves items, zones, and named views after reload", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      expect(await readStableFingerprint(page)).toBe(
        fingerprintDesignSnapshot(seed.snapshot),
      );
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-zone-count",
        "1",
      );

      await openFurnishPanel(page);
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(4);

      await openPresentExport(page);
      await expect(page.getByTestId("saved-camera-view-list")).toContainText(
        "Client Preview",
      );
      await page.getByTestId("camera-view-name-input").fill("Persistence E2E View");
      await page.getByTestId("save-named-camera-view").click();
      await expect(page.getByTestId("saved-camera-view-list")).toContainText(
        "Persistence E2E View",
      );
      await page.getByRole("button", { name: "Close export panel" }).click();

      const saveButton = page.getByTestId("save-design");
      await expect(saveButton).toBeVisible();
      await saveButton.click();
      const saveStatus = page.getByTestId("save-status");
      await expect(saveStatus).toHaveAttribute("data-status", "saved", {
        timeout: 30_000,
      });
      await expect(saveStatus).toHaveAttribute("data-source", "cloud");
      await expect(saveStatus).toContainText("Cloud saved");
      const savedFingerprint = await readStableFingerprint(page);
      expect(savedFingerprint).not.toBe(fingerprintDesignSnapshot(seed.snapshot));

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30_000,
      });
      expect(await readStableFingerprint(page)).toBe(savedFingerprint);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-zone-count",
        "1",
      );
      await openFurnishPanel(page);
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(4);
      await openPresentExport(page);
      await expect(page.getByTestId("saved-camera-view-list")).toContainText(
        "Persistence E2E View",
      );
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("cloud save failure stays visible and recovers through retry", async ({ page }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      let rejectedWrite = false;
      const designRoute = `**/api/designs/${seed.designId}`;
      await page.route(designRoute, async (route) => {
        if (route.request().method() === "PUT" && !rejectedWrite) {
          rejectedWrite = true;
          await route.fulfill({
            status: 503,
            contentType: "application/json",
            headers: { "x-operation-id": "phase7-save-failure" },
            body: JSON.stringify({
              error: "Cloud save is temporarily unavailable.",
              code: "INTERNAL_ERROR",
              operationId: "phase7-save-failure",
            }),
          });
          return;
        }
        await route.continue();
      });

      const widthInput = page.getByRole("spinbutton", { name: "Width mm" }).first();
      await widthInput.fill("5900");
      await widthInput.press("Enter");
      await expect(widthInput).toHaveValue("5900");

      const saveStatus = page.getByTestId("save-status");
      await expect(saveStatus).toHaveAttribute("data-status", "failed", {
        timeout: 30_000,
      });
      await expect(saveStatus).toContainText("Cloud save failed");
      await expect(page.getByTestId("save-status-retry")).toBeVisible();
      expect(rejectedWrite).toBe(true);

      await page.unroute(designRoute);
      await page.getByTestId("save-status-retry").click();
      await expect(saveStatus).toHaveAttribute("data-status", "saved", {
        timeout: 30_000,
      });
      await expect(saveStatus).toContainText("Cloud saved");
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });

  test("switching rooms restores each room's isolated items and zones", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const seed = await createBetaSeedDesign();
    try {
      await loadSeedDesign(page, seed);
      const expectedFingerprint = fingerprintDesignSnapshot(seed.snapshot);
      await openFurnishPanel(page);
      const roomSelect = page.getByTestId("furnish-room-target-select");

      await roomSelect.selectOption("beta-dining");
      await expect(page.getByTestId("furnish-active-room-name")).toContainText(
        "Dining Room",
      );
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(3);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-manual-zone-items",
        "beta-sloane-table-1",
      );

      await roomSelect.selectOption("beta-bedroom");
      await expect(page.getByTestId("furnish-active-room-name")).toContainText(
        "Bedroom",
      );
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(2);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-manual-zone-items",
        "beta-bedroom-chair-1,beta-bedroom-hugg-table-1",
      );

      await roomSelect.selectOption("beta-living");
      await expect(page.getByTestId("furnish-active-room-name")).toContainText(
        "Living Room",
      );
      await expect(page.getByTestId("furnish-room-bom-item")).toHaveCount(4);
      await expect(page.getByTestId("qa-editor-zone-state")).toHaveAttribute(
        "data-manual-zone-items",
        "beta-avery-chair-2,beta-dawson-chair-1,beta-hugg-side-table-1,beta-hugg-table-1",
      );
      expect(await readStableFingerprint(page)).toBe(expectedFingerprint);
    } finally {
      await cleanupBetaSeed(seed.userId);
    }
  });
});
