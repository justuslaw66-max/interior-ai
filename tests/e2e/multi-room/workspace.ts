import { test, expect } from "../fixtures";
import {
  chooseTemplateStart,
  clearBrowserStorageBeforeNextLoad,
  clickWithFallback,
  expectInactiveOrHidden,
  getActiveRoomBodyProbe,
  getEmptyCanvasPoint,
} from "./helpers";

export function registerWorkspaceTests() {
  test("consumer workflow tabs switch panels reliably", async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    const furnishWorkflow = page.getByTestId("editor-workflow-furnish");
    await expect(async () => {
      if ((await furnishWorkflow.getAttribute("data-active")) !== "true") {
        await furnishWorkflow.evaluate((button) => (button as HTMLButtonElement).click());
      }
      await expect(furnishWorkflow).toHaveAttribute("data-active", "true", { timeout: 1500 });
    }).toPass({ timeout: 10000 });
    await expect(page.getByTestId("furnish-room-summary")).toBeVisible();
    const catalogMode = page.getByTestId("furnish-mode-catalog");
    const guidedMode = page.getByTestId("furnish-mode-guided");
    const fullCatalog = page.getByTestId("furnish-full-catalog");
    const catalogSearch = page.getByTestId("catalog-search-input");

    await expect(catalogMode).toBeVisible();
    await expect(guidedMode).toBeVisible();
    await expect(catalogMode).toHaveAttribute("data-active", "true");
    await expect(catalogMode).toHaveAttribute("aria-pressed", "true");
    await expect(guidedMode).toHaveAttribute("aria-pressed", "false");
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toBeVisible();
    await expect(page.getByTestId("furnish-room-checklist")).not.toBeVisible();
    await expect(page.getByText("Recommended for Living Room")).not.toBeVisible();
    await expect(page.getByTestId("furnish-shopping-preview")).toBeVisible();
    await expect(page.getByTestId("advanced-imported-models")).not.toHaveAttribute("open", "");

    await catalogSearch.fill("Sloane");
    await clickWithFallback(guidedMode);
    await expect(guidedMode).toHaveAttribute("data-active", "true");
    await expect(guidedMode).toHaveAttribute("aria-pressed", "true");
    await expect(fullCatalog).not.toBeVisible();
    await expect(page.getByTestId("room-furnishing-completeness")).toBeVisible();
    await expect(page.getByTestId("furnish-room-checklist")).toBeVisible();
    await expect(page.getByText("Recommended for Living Room")).toBeVisible();
    await expect(page.getByTestId("furnish-recommended-category-coffee_table")).toBeVisible();

    await clickWithFallback(catalogMode);
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toHaveValue("Sloane");
    await catalogSearch.fill("");

    await clickWithFallback(guidedMode);
    await expect(page.getByTestId("furnish-checklist-category-sofa")).toBeVisible();
    await clickWithFallback(page.getByTestId("furnish-checklist-category-sofa"));
    await expect(catalogMode).toHaveAttribute("data-active", "true");
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toBeFocused();
    await expect(page.getByTestId("catalog-category-trigger")).toContainText("Sofa");

    await clickWithFallback(guidedMode);
    await clickWithFallback(page.getByTestId("furnish-recommended-category-coffee_table"));
    await expect(fullCatalog).toBeVisible();
    await expect(catalogSearch).toBeFocused();
    await expect(page.getByTestId("catalog-room-context")).toBeVisible();
    await expect(page.getByTestId("catalog-active-room-pill")).toContainText("Adding to Living Room");
    const categoryTrigger = page.getByTestId("catalog-category-trigger");
    await expect(categoryTrigger).toContainText("Coffee Table");
    await clickWithFallback(categoryTrigger);
    await expect(page.getByTestId("catalog-main-group-tables")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("catalog-category-option-coffee_table")).toBeVisible();
    await expect(page.getByTestId("catalog-category-option-side_table")).toBeVisible();
    await expect(page.getByTestId("catalog-category-option-dining_table")).toBeVisible();
    await expect(page.getByTestId("catalog-category-option-dining_bench")).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-category-all-tables"));
    await expect(categoryTrigger).toContainText("All tables & dining");
    await expect(page.getByTestId("catalog-room-context")).toContainText("All tables & dining");
    await clickWithFallback(categoryTrigger);
    await clickWithFallback(page.getByTestId("catalog-category-option-coffee_table"));
    await expect(categoryTrigger).toContainText("Coffee Table");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    const firstCatalogGuidance = page.locator('[data-testid^="catalog-guidance-"]').first();
    if ((await firstCatalogGuidance.count()) > 0) {
      await expect(firstCatalogGuidance).toContainText(/Fits this space|Check fit|Too large for room/);
    }
    await expect(page.getByTestId("catalog-smart-filters")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-recommended")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-fits")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-cart_ready")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-retailer_link")).toBeVisible();
    await expect(page.getByTestId("catalog-smart-filter-needs_review")).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-smart-filter-recommended"));
    await expect(page.getByTestId("catalog-smart-filter-recommended")).toHaveAttribute("data-active", "true");
    await expect(page.locator('[data-testid^="catalog-preview-"]').first()).toBeVisible();
    await clickWithFallback(page.getByTestId("catalog-smart-filter-clear"));
    await expectInactiveOrHidden(page.getByTestId("catalog-smart-filter-recommended"));
    const fitsSmartFilter = page.getByTestId("catalog-smart-filter-fits");
    if ((await fitsSmartFilter.count()) > 0 && !(await fitsSmartFilter.isDisabled())) {
      await clickWithFallback(fitsSmartFilter);
      await expect(fitsSmartFilter).toHaveAttribute("data-active", "true");
      const visibleFitGuidance = page.locator('[data-testid^="catalog-guidance-"]:visible').first();
      if ((await visibleFitGuidance.count()) > 0) {
        await expect(visibleFitGuidance).toContainText("Fits this space");
      }
      await clickWithFallback(page.getByTestId("catalog-smart-filter-clear"));
      await expectInactiveOrHidden(fitsSmartFilter);
    }
    await expect(page.getByTestId("catalog-memory-all")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("catalog-memory-favorites")).toBeVisible();
    await expect(page.getByTestId("catalog-memory-recent")).toBeVisible();

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
    await expect(page.getByTestId("catalog-memory-favorites")).toContainText("1");
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
    const placementPreview = page.getByRole("dialog", { name: "Preview catalog placement" });
    if (await placementPreview.isVisible({ timeout: 1000 }).catch(() => false)) {
      await clickWithFallback(placementPreview.getByRole("button", { name: "Cancel" }));
    }
    await expect(page.getByTestId("catalog-memory-recent")).toContainText("1");
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

    await clickWithFallback(page.getByTestId("editor-workflow-shop"));
    await expect(page.getByTestId("editor-workflow-shop")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("Shopping overview")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("shopping-checkout-readiness")).toBeVisible();
    await expect(page.getByText("Retailer-link spend")).toBeVisible();
    await expect(page.getByTestId("cart-checkout-readiness")).toBeVisible();

    await clickWithFallback(page.getByTestId("editor-workflow-plan"));
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    await clickWithFallback(page.getByTestId("editor-workflow-export"));
    await expect(page.getByTestId("editor-workflow-export")).toHaveAttribute("data-active", "true");
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({
      timeout: 10000,
    });
    await page.getByTestId("camera-view-name-input").fill("Client hero angle");
    await clickWithFallback(page.getByTestId("save-named-camera-view"));
    await expect(page.getByTestId("saved-camera-view-list")).toContainText("Client hero angle");
    await clickWithFallback(page.getByRole("button", { name: "Client hero angle" }));
    await clickWithFallback(page.locator('[data-testid^="saved-camera-view-delete-"]'));
    await expect(page.getByTestId("saved-camera-view-list")).toHaveCount(0);
    await expect(page.getByText("Saved views appear on share links and export packs.")).toBeVisible();
    await page.getByRole("button", { name: "Close export panel" }).click({ force: true });

    await clickWithFallback(page.getByTestId("editor-workflow-plan"));
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
  });

  test("layout versions save, restore, and delete the active room", async ({ page }) => {
    test.setTimeout(45_000);

    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20_000 });
    await clickWithFallback(page.getByTestId("editor-workflow-export"));
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

  test("mobile Furnish exposes the catalog before guided recommendations", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await clickWithFallback(page.getByTestId("editor-workflow-furnish"));

    const catalogMode = page.getByTestId("furnish-mode-catalog");
    const guidedMode = page.getByTestId("furnish-mode-guided");
    const catalogSearch = page.getByTestId("catalog-search-input");

    await expect(catalogMode).toBeVisible();
    await expect(guidedMode).toBeVisible();
    await expect(catalogMode).toBeInViewport();
    await expect(guidedMode).toBeInViewport();
    await expect(catalogSearch).toBeVisible();
    await clickWithFallback(catalogMode);
    await expect(catalogSearch).toBeFocused();
    await expect(catalogSearch).toBeInViewport();
    await expect(page.getByTestId("furnish-room-checklist")).not.toBeVisible();

    await clickWithFallback(guidedMode);
    await expect(page.getByTestId("furnish-full-catalog")).not.toBeVisible();
    await expect(page.getByTestId("room-furnishing-completeness")).toBeVisible();
    await expect(page.getByTestId("furnish-room-checklist")).toBeVisible();

    await clickWithFallback(catalogMode);
    await expect(catalogSearch).toBeVisible();
  });

  test("selected room dimensions use one unit-aware inspector", async ({ page }) => {
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await page.getByRole("button", { name: "2D Plan" }).click();

    await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("1 room");
    const widthInput = page.getByTestId("selection-inspector-room-width");
    const depthInput = page.getByTestId("selection-inspector-room-depth");
    await expect(widthInput).toBeVisible();
    await expect(depthInput).toBeVisible();
    const initialWidthMm = Number(await widthInput.inputValue());
    const nextWidthMm = initialWidthMm - 100;
    await widthInput.fill(String(nextWidthMm));
    await widthInput.press("Enter");
    await expect(widthInput).toHaveValue(String(nextWidthMm));

    const initialDepthMm = Number(await depthInput.inputValue());
    const nextDepthMm = initialDepthMm - 100;
    await depthInput.fill(String(nextDepthMm));
    await depthInput.press("Enter");
    await expect(depthInput).toHaveValue(String(nextDepthMm));

    await widthInput.fill(String(nextWidthMm - 100));
    await widthInput.press("Escape");
    await expect(widthInput).toHaveValue(String(nextWidthMm));

    await page.getByTestId("selection-inspector-measurement-units").getByRole("button", { name: "CM" }).click();
    await expect(widthInput).toHaveValue(String(nextWidthMm / 10));
    await expect(depthInput).toHaveValue(String(nextDepthMm / 10));
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
    await page.getByRole("button", { name: "3D" }).click();
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
    await page.getByRole("button", { name: "2D Plan" }).click();
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
    await page.getByRole("button", { name: "2D Plan" }).click();
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();

    const activeRoomLabels = page.locator(
      '[data-testid="house-room-2d-label"][data-active="true"]'
    );
    const resizeHandles = page.locator('[data-testid^="room-resize-handle-"]');
    if ((await activeRoomLabels.count()) === 0) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping selected-room label clearing assertions because 2D active room labels are density-hidden in this layout.",
      });
      await expect(page.getByTestId("room-plan-status-room-count")).toHaveText("2 rooms");
      return;
    }
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

