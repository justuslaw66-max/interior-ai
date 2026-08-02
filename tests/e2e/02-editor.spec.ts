import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import {
  addCatalogDrawerItemToRoom,
  getSelectedItemPanel,
  openCatalogPreview,
} from "./variant-test-utils";

const EDITOR_ITEM_ID =
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed";

async function readFingerprint(page: Page): Promise<string> {
  const marker = page.getByTestId("qa-editor-snapshot-fingerprint");
  await expect(marker).toHaveAttribute("data-fingerprint", /[a-f0-9]{8}/);
  const fingerprint = await marker.getAttribute("data-fingerprint");
  if (!fingerprint) throw new Error("Editor snapshot fingerprint is missing");
  return fingerprint;
}

async function readModelMillimetres(input: Locator): Promise<number> {
  const raw = await input.getAttribute("data-model-value-mm");
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid model position: ${raw ?? "missing"}`);
  }
  return value;
}

async function setupSelectedItem(page: Page) {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan: "pro", source: "playwright" }),
    });
  });
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.localStorage.setItem("plan_measurement_unit", "mm");
  });

  const response = await page.goto("/design?mode=designer", {
    waitUntil: "domcontentloaded",
  });
  expect(response?.status()).toBe(200);
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
    timeout: 30_000,
  });

  const newPlan = page.getByTestId("editor-command-new-plan");
  await expect(newPlan).toBeVisible();
  const starterPicker = page.getByTestId("starter-floor-plan-picker");
  await expect(async () => {
    if (await starterPicker.isVisible().catch(() => false)) return;

    const replaceCurrent = page.getByTestId("new-plan-replace-current");
    if (await replaceCurrent.isVisible().catch(() => false)) {
      await replaceCurrent.click();
    } else {
      await newPlan.click();
    }

    await expect(starterPicker).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
  await page.getByTestId("apply-plan-template-studio").click();
  const planChoice = page.getByTestId("new-plan-choice-dialog");
  if (await planChoice.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await page.getByTestId("new-plan-replace-current").click();
  }
  await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
    "4 rooms",
  );

  const opened = await openCatalogPreview(page, EDITOR_ITEM_ID, "Hugg");
  expect(opened, "The deterministic Hugg editor fixture must be available").toBe(
    true,
  );
  await expect(page.getByTestId("catalog-item-drawer")).toContainText(
    "Hugg Nesting Square Coffee Table",
  );
  await addCatalogDrawerItemToRoom(page);

  const selectedPanel = getSelectedItemPanel(page);
  await expect(selectedPanel).toBeVisible({ timeout: 15_000 });
  await expect(selectedPanel).toContainText("Hugg Nesting Square Coffee Table");

  const controlsToggle = selectedPanel.getByTestId(
    "selected-item-advanced-controls-toggle",
  );
  await expect(controlsToggle).toBeVisible();
  await expect(controlsToggle).toBeEnabled();
  if ((await controlsToggle.getAttribute("aria-expanded")) !== "true") {
    await controlsToggle.evaluate((button) =>
      (button as HTMLButtonElement).click(),
    );
  }
  await expect(controlsToggle).toHaveAttribute("aria-expanded", "true");

  const xInput = selectedPanel.getByTestId("selected-item-position-x");
  const zInput = selectedPanel.getByTestId("selected-item-position-z");
  await expect(xInput).toBeVisible();
  await expect(zInput).toBeVisible();
  return { selectedPanel, xInput, zInput };
}

test.describe("2. Editor Correctness", () => {
  test("New plan moves focus into the picker and restores it when dismissed", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const newPlan = page.getByTestId("editor-command-new-plan");
    await expect(newPlan).toBeEnabled();
    await newPlan.focus();
    await page.keyboard.press("Enter");

    const picker = page.getByTestId("starter-floor-plan-picker");
    const pickerHeading = page.getByRole("heading", { name: "Choose a floor plan" });
    await expect(picker).toBeVisible();
    await expect(pickerHeading).toBeFocused();

    await page.keyboard.press("Tab");
    const skipToLayouts = page.getByTestId("skip-to-starter-layouts");
    await expect(skipToLayouts).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("apply-plan-template-studio")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();
    await expect(newPlan).toBeFocused();
  });

  test("New plan asks before replacing even when the saved room still has starter geometry", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.localStorage.clear();
      window.sessionStorage.clear();
    });
    await page.goto("/design", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30_000 });
    await page.waitForLoadState("networkidle");

    const newPlan = page.getByTestId("editor-command-new-plan");
    await expect(newPlan).toBeEnabled();
    await newPlan.click();
    await expect(page.getByTestId("starter-floor-plan-picker")).toBeVisible();
    await page.getByTestId("apply-plan-template-studio").click();

    const choice = page.getByTestId("new-plan-choice-dialog");
    await expect(choice).toBeVisible();
    await expect(choice).toContainText("Rectangular studio");
    await expect(page.getByTestId("new-plan-save-current")).toBeVisible();
    await expect(page.getByTestId("new-plan-replace-current")).toBeVisible();
    await page.getByTestId("new-plan-cancel").click();
    await expect(choice).toHaveCount(0);
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
  });

  test("collision detection rejects an overlapping precision move", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { selectedPanel, xInput, zInput } = await setupSelectedItem(page);
    const occupiedX = await readModelMillimetres(xInput);
    const occupiedZ = await readModelMillimetres(zInput);

    await selectedPanel.getByTestId("selected-item-duplicate").click();
    const duplicateFingerprint = await readFingerprint(page);
    const duplicateX = await readModelMillimetres(xInput);
    const duplicateZ = await readModelMillimetres(zInput);
    expect([duplicateX, duplicateZ]).not.toEqual([occupiedX, occupiedZ]);

    await xInput.fill(String(occupiedX));
    await xInput.press("Enter");
    await zInput.fill(String(occupiedZ));
    await zInput.press("Enter");

    await expect(page.getByTestId("collision-toast")).toContainText("Blocked by", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      duplicateFingerprint,
    );
    expect(await readModelMillimetres(xInput)).toBe(duplicateX);
    expect(await readModelMillimetres(zInput)).toBe(duplicateZ);
  });

  test("wall snap moves the selected item once and leaves it stable", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const { selectedPanel, xInput, zInput } = await setupSelectedItem(page);
    const beforeFingerprint = await readFingerprint(page);
    const before = [
      await readModelMillimetres(xInput),
      await readModelMillimetres(zInput),
    ];

    await selectedPanel.getByTestId("selected-item-snap-wall").click();
    await expect
      .poll(() => readFingerprint(page), { timeout: 10_000 })
      .not.toBe(beforeFingerprint);
    const snappedFingerprint = await readFingerprint(page);
    const snapped = [
      await readModelMillimetres(xInput),
      await readModelMillimetres(zInput),
    ];
    expect(snapped).not.toEqual(before);

    await selectedPanel.getByTestId("selected-item-snap-wall").click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      snappedFingerprint,
    );
    expect([
      await readModelMillimetres(xInput),
      await readModelMillimetres(zInput),
    ]).toEqual(snapped);
  });

  test("one duplicate is restored by one undo and one redo", async ({ page }) => {
    test.setTimeout(120_000);
    const { selectedPanel } = await setupSelectedItem(page);
    const beforeDuplicate = await readFingerprint(page);

    await selectedPanel.getByTestId("selected-item-duplicate").click();
    await expect
      .poll(() => readFingerprint(page), { timeout: 10_000 })
      .not.toBe(beforeDuplicate);
    const afterDuplicate = await readFingerprint(page);

    const undo = page.getByTestId("command-undo");
    await expect(undo).toBeEnabled();
    await expect(undo).toHaveAccessibleName(/Undo Duplicate Hugg/i);
    await undo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      beforeDuplicate,
    );

    const redo = page.getByTestId("command-redo");
    await expect(redo).toBeEnabled();
    await expect(redo).toHaveAccessibleName(/Redo Duplicate Hugg/i);
    await redo.click();
    await expect(page.getByTestId("qa-editor-snapshot-fingerprint")).toHaveAttribute(
      "data-fingerprint",
      afterDuplicate,
    );
  });
});
