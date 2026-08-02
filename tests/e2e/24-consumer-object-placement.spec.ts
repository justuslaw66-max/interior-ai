import type { Locator, Page } from "@playwright/test";

import { expect, test } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
  selectEditorWorkspace,
} from "./variant-test-utils";

const TEST_ITEM_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

async function readFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/);
  const fingerprint = await marker.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Editor snapshot fingerprint is missing");
  return fingerprint;
}

async function expectTouchTarget(locator: Locator, label: string): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, `${label} should be measurable`).not.toBeNull();
  expect(box?.height ?? 0, `${label} should be at least 44px tall`).toBeGreaterThanOrEqual(44);
}

async function setupConsumerItem(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "free", source: "playwright" }),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("interior-ai:beta-start-dismissed", "1");
    window.localStorage.setItem("plan_measurement_unit", "mm");
  });

  const response = await page.goto("/design", { waitUntil: "domcontentloaded" });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
  const continueToFurnish = page.getByTestId("room-setup-continue-furnish");
  if (await continueToFurnish.isVisible().catch(() => false)) {
    await continueToFurnish.click();
  }

  const opened = await openCatalogPreview(page, TEST_ITEM_ID, "Hugg");
  expect(opened, "The deterministic Hugg fixture must be available").toBe(true);
  await addCatalogDrawerItemToRoom(page);

  const panel = getSelectedItemPanel(page);
  await expect(panel).toBeVisible({ timeout: 15_000 });
  const controls = panel.getByTestId("selected-item-advanced-controls-toggle");
  if ((await controls.getAttribute("aria-expanded")) !== "true") {
    await controls.click();
  }
  await expect(controls).toHaveAttribute("aria-expanded", "true");
  return panel;
}

test.describe("24. Consumer object placement", () => {
  test("tabs to a placed item in the 2D plan before running transform shortcuts", async ({ page }) => {
    test.setTimeout(150_000);
    await setupConsumerItem(page);

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selected-item-panel")).not.toBeVisible();
    await page.setViewportSize({ width: 1440, height: 900 });

    const planWorkflow = page.getByTestId("editor-workflow-plan").first();
    if ((await planWorkflow.getAttribute("data-active")) !== "true") {
      await selectEditorWorkspace(page, "editor-workflow-plan");
    }
    await expect(planWorkflow).toHaveAttribute("data-active", "true");
    const planView = page.getByTestId("editor-view-2d");
    if ((await planView.getAttribute("aria-pressed")) !== "true") {
      await planView.click();
    }
    await expect(planView).toHaveAttribute("aria-pressed", "true");

    const itemButton = page.getByTestId("plan-item-keyboard-target").filter({
      hasText: "Hugg",
    });
    await expect(itemButton).toBeVisible();
    await expect(itemButton).toHaveAttribute("aria-pressed", "false");

    await itemButton.focus();
    await expect(itemButton).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(itemButton).not.toBeFocused();
    await page.keyboard.press("Tab");
    await expect(itemButton).toBeFocused();
    await itemButton.press("Enter");
    await expect(page.getByTestId("selected-item-panel")).toBeVisible();
    await expect(itemButton).toHaveAttribute("aria-pressed", "true");

    const beforeNudge = await readFingerprint(page);
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => readFingerprint(page)).not.toBe(beforeNudge);
  });

  test("keeps transform controls touch friendly and every edit recoverable", async ({ page }) => {
    test.setTimeout(150_000);
    const panel = await setupConsumerItem(page);

    await expect(panel.getByTestId("selected-item-dimensions")).toBeVisible();
    await expect(panel.getByTestId("selected-item-size-guidance")).toContainText(
      "Catalog size is preserved"
    );
    for (const [locator, label] of [
      [panel.getByTestId("selected-item-advanced-controls-toggle"), "controls"],
      [panel.getByTestId("selected-item-center"), "center"],
      [panel.getByTestId("selected-item-snap-wall"), "snap to wall"],
      [panel.getByTestId("selected-item-duplicate"), "duplicate"],
      [panel.getByTestId("selected-item-delete"), "delete"],
      [panel.getByTestId("selected-item-position-x"), "position X"],
      [panel.getByTestId("selected-item-position-z"), "position Z"],
      [panel.getByTestId("selected-item-nudge-right"), "nudge right"],
      [page.getByTestId("command-undo"), "undo"],
      [page.getByTestId("command-redo"), "redo"],
    ] as const) {
      await expectTouchTarget(locator, label);
    }

    const beforeNudge = await readFingerprint(page);
    await panel.getByTestId("selected-item-nudge-right").click();
    await expect.poll(() => readFingerprint(page)).not.toBe(beforeNudge);
    const afterNudge = await readFingerprint(page);

    const undo = page.getByTestId("command-undo");
    const redo = page.getByTestId("command-redo");
    await expect(undo).toHaveAccessibleName(/Undo Nudge item/i);
    await undo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      beforeNudge
    );
    await expect(redo).toHaveAccessibleName(/Redo Nudge item/i);
    await redo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      afterNudge
    );

    await undo.click();
    await page.keyboard.press("R");
    await expect.poll(() => readFingerprint(page)).not.toBe(beforeNudge);
    await expect(undo).toHaveAccessibleName(/Undo Rotate \+90/i);
    await undo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      beforeNudge
    );

    await panel.getByTestId("selected-item-duplicate").click();
    await expect.poll(() => readFingerprint(page)).not.toBe(beforeNudge);
    await expect(undo).toHaveAccessibleName(/Undo Duplicate Hugg/i);
    await undo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      beforeNudge
    );
  });

  test("delete creates one undoable history entry", async ({ page }) => {
    test.setTimeout(150_000);
    const panel = await setupConsumerItem(page);
    const beforeDelete = await readFingerprint(page);

    await panel.getByTestId("selected-item-delete").click();
    await expect.poll(() => readFingerprint(page)).not.toBe(beforeDelete);
    const undo = page.getByTestId("command-undo");
    await expect(undo).toHaveAccessibleName(/Undo Delete Hugg/i);
    await undo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      beforeDelete
    );
  });
});
