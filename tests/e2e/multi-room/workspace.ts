import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import {
  chooseTemplateStart,
  clearBrowserStorageBeforeNextLoad,
  clickWithFallback,
  getActiveRoomBodyProbe,
  getEmptyCanvasPoint,
  selectFirstPlanRoom,
} from "./helpers";

// Plan, Furnish and Shop are steps in the command bar; Present & export sits in the More menu.
async function selectWorkspace(page: Page, workspace: "plan" | "furnish" | "shop" | "export") {
  if (workspace === "export") {
    const more = page.getByTestId("editor-command-overflow");
    if ((await more.getAttribute("aria-expanded")) !== "true") {
      await more.click({ timeout: 10_000 });
    }
  }
  const item = page.getByTestId(`editor-workflow-${workspace}`);
  await expect(item).toBeVisible();
  await expect(item).toBeEnabled();
  await item.click({ timeout: 5_000, noWaitAfter: true });
}

export function registerWorkspaceTests() {
  test("consumer workflow tabs switch panels reliably", async ({ page }) => {
    test.setTimeout(90_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    await selectWorkspace(page, "furnish");
    await expect(page.getByTestId("editor-workflow-furnish")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("furnish-room-summary")).toBeVisible();
    const fullCatalog = page.getByTestId("furnish-full-catalog");
    const catalogSearch = page.getByTestId("catalog-search-input");

    // Products first (FU1): the search with Suggest a layout beside it, the chips with All
    // pressed, the products, and the room's foot. No guided mode, quick filters or room banner.
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toBeVisible();
    await expect(page.getByTestId("editor-workflow-ai")).toBeVisible();
    await expect(page.getByTestId("furnish-mode-guided")).toHaveCount(0);
    await expect(page.getByTestId("catalog-smart-filters")).toHaveCount(0);
    await expect(page.getByTestId("furnish-footer")).toContainText("Living Room");
    // "All 3D models" is Pro's (FU5).
    await expect(page.getByTestId("advanced-imported-models")).toHaveCount(0);
    await expect(page.getByTestId("catalog-memory-all")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();

    // A category chip narrows the list, and search still finds products in every category.
    const resultCount = page.getByTestId("catalog-focused-category-pill");
    const allCount = await resultCount.textContent();
    const coffeeTables = page.getByTestId("catalog-category-chip-coffee_table");
    await clickWithFallback(coffeeTables);
    await expect(coffeeTables).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("catalog-memory-all")).toHaveAttribute("aria-pressed", "false");
    await expect(resultCount).not.toHaveText(allCount ?? "");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    await catalogSearch.fill("Sloane");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    await catalogSearch.fill("");

    await clickWithFallback(page.getByTestId("catalog-memory-all"));
    await expect(page.getByTestId("catalog-memory-all")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("catalog-memory-favorites")).toHaveText("Favourites (0)");
    // Recent shows once a product was added.
    await expect(page.getByTestId("catalog-memory-recent")).toHaveCount(0);

    const firstPreview = page.locator('[data-testid^="catalog-preview-"]').first();
    const firstPreviewTestId = await firstPreview.getAttribute("data-testid");
    const firstCatalogItemId = firstPreviewTestId?.replace("catalog-preview-", "");
    expect(firstCatalogItemId).toBeTruthy();
    if (!firstCatalogItemId) {
      throw new Error("Catalog preview did not expose a product id");
    }

    const favoriteToggle = page.getByTestId(`catalog-favorite-toggle-${firstCatalogItemId}`);
    await favoriteToggle.evaluate((node) => {
      (node as HTMLElement).click();
    });
    await expect(favoriteToggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("catalog-memory-favorites")).toHaveText("Favourites (1)");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("interior-ai:catalog-favorites")))
      .toContain(firstCatalogItemId);

    await clickWithFallback(page.getByTestId("catalog-memory-favorites"));
    await expect(page.getByTestId("catalog-memory-favorites")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId(`catalog-preview-${firstCatalogItemId}`)).toBeVisible();

    await clickWithFallback(page.getByTestId("catalog-memory-all"));
    await clickWithFallback(page.getByTestId(`catalog-add-${firstCatalogItemId}`));
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("interior-ai:catalog-recents")))
      .toContain(firstCatalogItemId);
    const placementPreview = page.getByRole("dialog", { name: "Preview catalogue placement" });
    if (await placementPreview.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clickWithFallback(placementPreview.getByRole("button", { name: "Cancel" }));
    }
    await expect(page.getByTestId("catalog-memory-recent")).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-memory-recent"));
    await expect(page.getByTestId("catalog-memory-recent")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId(`catalog-preview-${firstCatalogItemId}`)).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-memory-all"));

    await page.getByTestId("catalog-search-input").fill("zz-no-product-match");
    await expect(page.getByTestId("catalog-empty-recovery")).toBeVisible();
    await expect(page.getByRole("button", { name: "Clear search" })).toBeVisible();
    await clickWithFallback(page.getByRole("button", { name: "Clear search" }));
    await expect(page.getByTestId("catalog-empty-recovery")).toBeHidden();
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    await clickWithFallback(page.locator('[data-testid^="catalog-preview-"]').first());
    await expect(page.getByTestId("catalog-detail-add-context")).toContainText("Adding to Living Room");
    await expect(page.getByTestId("catalog-detail-add-to-room")).toContainText("Add to Living Room");
    await clickWithFallback(page.getByRole("button", { name: "Close" }));

    await selectWorkspace(page, "shop");
    await expect(page.getByTestId("editor-workflow-shop")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Shopping overview")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("shopping-checkout-readiness")).toBeVisible();
    await expect(page.getByText("Retailer-link spend")).toBeVisible();
    await expect(page.getByTestId("cart-checkout-readiness")).toBeVisible();

    await selectWorkspace(page, "plan");
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    await selectWorkspace(page, "export");
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "false");
    await page.getByTestId("camera-view-name-input").fill("Client hero angle");
    await clickWithFallback(page.getByTestId("save-named-camera-view"));
    await expect(page.getByTestId("saved-camera-view-list")).toContainText("Client hero angle");
    await clickWithFallback(page.getByRole("button", { name: "Client hero angle" }));
    await clickWithFallback(page.locator('[data-testid^="saved-camera-view-delete-"]'));
    await expect(page.getByTestId("saved-camera-view-list")).toHaveCount(0);
    await expect(page.getByText("Saved views appear on share links and export packs.")).toBeVisible();
    await page.getByRole("button", { name: "Close export panel" }).click({ force: true });

    // Closing the panel ends presenting, so More offers Present & export again.
    await page.getByTestId("editor-command-overflow").click();
    const presentToggle = page.getByTestId("editor-workflow-export");
    await expect(presentToggle).toHaveAttribute("data-active", "false");
    await expect(presentToggle).toHaveText("Present & export");
    await page.keyboard.press("Escape");
    await expect(presentToggle).toHaveCount(0);

    await selectWorkspace(page, "plan");
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
  });

  test("layout versions save, restore, and delete the active room", async ({ page }) => {
    test.setTimeout(45_000);

    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20_000 });
    await selectWorkspace(page, "export");
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({
      timeout: 10_000,
    });

    const versionName = "E2E active room layout";
    const versionList = page.getByTestId("layout-version-list");
    const comparison = page.getByTestId("layout-version-comparison");
    const deleteButtons = page.locator('[data-testid^="layout-version-delete-"]');

    await page.getByTestId("layout-version-name-input").fill(versionName);
    await clickWithFallback(page.getByTestId("save-layout-version"));
    await expect(versionList).toContainText(versionName);
    await expect(comparison).toHaveCount(1);
    await expect(comparison).toContainText("Saved");
    await expect(comparison).toContainText("Current");

    await clickWithFallback(page.getByTestId("layout-version-restore-latest-manual"));
    await expect(versionList).toContainText(`Before ${versionName}`);
    await expect(deleteButtons).toHaveCount(2);

    await clickWithFallback(deleteButtons.first());
    await expect(deleteButtons).toHaveCount(1);
  });

  test("mobile Furnish shows the products first", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await selectWorkspace(page, "furnish");

    const catalogSearch = page.getByTestId("catalog-search-input");
    await expect(catalogSearch).toBeVisible();
    await expect(catalogSearch).toBeInViewport();
    await expect(page.getByTestId("catalog-category-chips")).toBeInViewport();
    await expect(page.getByTestId("furnish-mode-guided")).toHaveCount(0);
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    const chipHeights = await page
      .getByTestId("catalog-category-chips")
      .getByRole("button")
      .evaluateAll((chips) => chips.map((chip) => chip.getBoundingClientRect().height));
    expect(Math.min(...chipHeights)).toBeGreaterThanOrEqual(40);
    await catalogSearch.fill("Sloane");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
  });

  test("selected room dimensions use one unit-aware inspector", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D", exact: true }).click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    const widthInput = page.getByTestId("selection-inspector-room-width");
    const depthInput = page.getByTestId("selection-inspector-room-depth");
    // The first visit's room isn't selected on arrival; its size is in Plan's room card (FR5).
    await expect(page.getByTestId("room-setup-width-input")).toBeVisible();
    await expect(widthInput).toHaveCount(0);
    await selectFirstPlanRoom(page);
    await expect(widthInput).toBeVisible();
    await expect(depthInput).toBeVisible();
    const displayUnits = page.getByTestId("selection-inspector-measurement-units");
    await expect(displayUnits).toHaveValue("cm");
    const initialWidthMm = Number(await widthInput.getAttribute("data-model-value-mm"));
    const initialDepthMm = Number(await depthInput.getAttribute("data-model-value-mm"));
    await expect(widthInput).toHaveValue(String(initialWidthMm / 10));
    await expect(depthInput).toHaveValue(String(initialDepthMm / 10));
    await displayUnits.selectOption("mm");
    await expect(displayUnits).toHaveValue("mm");
    await expect(widthInput).toHaveValue(String(initialWidthMm));
    await expect(depthInput).toHaveValue(String(initialDepthMm));
    const nextWidthMm = initialWidthMm - 100;
    await widthInput.fill(String(nextWidthMm));
    await widthInput.press("Enter");
    await expect(widthInput).toHaveValue(String(nextWidthMm));
    await expect(widthInput).toHaveAttribute("data-model-value-mm", String(nextWidthMm));

    const nextDepthMm = initialDepthMm - 100;
    await depthInput.fill(String(nextDepthMm));
    await depthInput.press("Enter");
    await expect(depthInput).toHaveValue(String(nextDepthMm));
    await expect(depthInput).toHaveAttribute("data-model-value-mm", String(nextDepthMm));

    await widthInput.fill(String(nextWidthMm - 100));
    await widthInput.press("Escape");
    await expect(widthInput).toHaveValue(String(nextWidthMm));

    await displayUnits.selectOption("cm");
    await expect(displayUnits).toHaveValue("cm");
    await expect(widthInput).toHaveValue(String(nextWidthMm / 10));
    await expect(depthInput).toHaveValue(String(nextDepthMm / 10));
    await expect(widthInput).toHaveAttribute("data-model-value-mm", String(nextWidthMm));
    await expect(depthInput).toHaveAttribute("data-model-value-mm", String(nextDepthMm));
  });

  test("right plan rail reflows map, floor, and selection without overlap", async ({ page }) => {
    test.setTimeout(60_000);
    await clearBrowserStorageBeforeNextLoad(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await chooseTemplateStart(page);
    await page.getByTestId("apply-plan-template-compact_two_bed").click();
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("6 rooms");
    await page.getByRole("button", { name: "3D", exact: true }).click();
    const rail = page.getByTestId("plan-right-rail");
    const navigator = page.getByTestId("room-pan-navigator");
    const floorPanel = page.getByTestId("coohom-floor-panel");
    const selection = page.getByTestId("selection-inspector");
    await expect(rail).toBeVisible();
    await expect(navigator).toBeVisible();
    await expect(floorPanel).toBeVisible();
    await expect(selection).toBeVisible();

    await page.getByRole("button", { name: "Expand floor panel" }).click();
    await expect(page.getByRole("button", { name: "Collapse floor panel" })).toBeVisible();

    const expandedBoxes = await Promise.all([
      navigator.boundingBox(),
      floorPanel.boundingBox(),
      selection.boundingBox(),
    ]);
    expect(expandedBoxes.every(Boolean)).toBe(true);
    expect(expandedBoxes[0]!.y + expandedBoxes[0]!.height).toBeLessThanOrEqual(expandedBoxes[1]!.y);
    expect(expandedBoxes[1]!.y + expandedBoxes[1]!.height).toBeLessThanOrEqual(expandedBoxes[2]!.y);

    await page.getByRole("button", { name: "Collapse floor panel" }).click();
    await page.getByRole("button", { name: "Collapse navigator" }).click();
    await expect(page.getByRole("button", { name: "Expand floor panel" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Expand navigator" })).toBeVisible();

    const collapsedBoxes = await Promise.all([
      navigator.boundingBox(),
      floorPanel.boundingBox(),
      selection.boundingBox(),
    ]);
    expect(collapsedBoxes.every(Boolean)).toBe(true);
    const navigatorFloorGap = collapsedBoxes[1]!.y - (collapsedBoxes[0]!.y + collapsedBoxes[0]!.height);
    const floorSelectionGap = collapsedBoxes[2]!.y - (collapsedBoxes[1]!.y + collapsedBoxes[1]!.height);
    expect(navigatorFloorGap).toBeGreaterThanOrEqual(0);
    expect(navigatorFloorGap).toBeLessThanOrEqual(12);
    expect(floorSelectionGap).toBeGreaterThanOrEqual(0);
    expect(floorSelectionGap).toBeLessThanOrEqual(12);
    expect(collapsedBoxes[2]!.y).toBeLessThan(expandedBoxes[2]!.y);
  });

  test("mobile exposes the same selected-room dimension fields without the desktop inspector", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D", exact: true }).click();
    const selectedRoomSectionToggle = page.getByTestId("plan-section-toggle-selectedRoom");
    await selectedRoomSectionToggle.scrollIntoViewIfNeeded();
    if ((await selectedRoomSectionToggle.getAttribute("aria-expanded")) !== "true") {
      await selectedRoomSectionToggle.click();
    }
    await expect(page.getByTestId("mobile-selected-room-dimensions")).toBeVisible();
    await expect(page.getByTestId("mobile-room-width-input")).toBeVisible();
    await expect(page.getByTestId("mobile-room-depth-input")).toBeVisible();
    await expect(page.getByTestId("selection-inspector")).toBeHidden();

    const dimensionsBox = await page.getByTestId("mobile-selected-room-dimensions").boundingBox();
    expect(dimensionsBox).not.toBeNull();
    expect(dimensionsBox!.x).toBeGreaterThanOrEqual(0);
    expect(dimensionsBox!.x + dimensionsBox!.width).toBeLessThanOrEqual(390);
  });

  test("selected 2D room can be cleared from empty plan space and Escape", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D", exact: true }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    const activeRoomLabels = page.locator(
      '[data-testid="house-room-2d-label"][data-active="true"]'
    );
    const resizeHandles = page.locator('[data-testid^="room-resize-handle-"]');
    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
    await expect(activeRoomLabels).toHaveCount(1);
    await expect(resizeHandles.first()).toBeVisible();

    const selectedRoomProbe = await getActiveRoomBodyProbe(page);
    const selectedRoomId = await selectedRoomProbe.getAttribute("data-room-id");
    expect(selectedRoomId).toBeTruthy();
    if (!selectedRoomId) throw new Error("Selected room probe is missing its room id");
    const emptyCanvasPoint = await getEmptyCanvasPoint(page);

    await page.mouse.click(emptyCanvasPoint.x, emptyCanvasPoint.y);
    await expect(activeRoomLabels).toHaveCount(0);
    await expect(resizeHandles).toHaveCount(0);

    const selectedRoomLabelBox = await page
      .locator(`[data-testid="house-room-2d-label"][data-room-id="${selectedRoomId}"]`)
      .boundingBox();
    expect(selectedRoomLabelBox).not.toBeNull();
    if (!selectedRoomLabelBox) throw new Error("Cleared room label is missing a bounding box");
    await page.mouse.click(
      selectedRoomLabelBox.x + selectedRoomLabelBox.width / 2,
      selectedRoomLabelBox.y + selectedRoomLabelBox.height + 48
    );
    await expect(activeRoomLabels).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(activeRoomLabels).toHaveCount(0);
    await expect(resizeHandles).toHaveCount(0);
  });

}
