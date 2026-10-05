import { test, expect } from "../fixtures";
import type { Page } from "@playwright/test";
import {
  chooseTemplateStart,
  clearBrowserStorageBeforeNextLoad,
  clickWithFallback,
  getActiveRoomBodyProbe,
  getEmptyCanvasPoint,
} from "./helpers";
import { confirmCatalogPlacementIfVisible } from "../variant-test-utils";

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
    await expect(page.getByRole("heading", { name: "Shopping list", level: 1 })).toBeVisible({ timeout: 10000 });

    await selectWorkspace(page, "plan");
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    await selectWorkspace(page, "export");
    await expect(page.getByRole("heading", { name: "Present & Export" })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "false");
    await page.getByRole("button", { name: "Close export panel" }).click({ force: true });

    // Closing the panel ends presenting, so More offers Present & export again.
    await page.getByTestId("editor-command-overflow").click();
    const presentToggle = page.getByTestId("editor-workflow-export");
    await expect(presentToggle).toHaveAttribute("data-active", "false");
    await expect(presentToggle).toHaveText("Present & export");
    await page.keyboard.press("Escape");
    await expect(presentToggle).toHaveCount(0);

    // Saved views are on the 3D view's Views button (UX audit SX4, phase 4e).
    const toolbar = page.getByTestId("canvas-view-toolbar");
    await clickWithFallback(toolbar.getByTestId("editor-view-3d"));
    await clickWithFallback(toolbar.getByTestId("canvas-saved-views"));
    await page.getByTestId("camera-view-name-input").fill("Client hero angle");
    await clickWithFallback(page.getByTestId("save-named-camera-view"));
    await expect(page.getByTestId("saved-camera-view-list")).toContainText("Client hero angle");
    await clickWithFallback(page.getByRole("button", { name: "Client hero angle", exact: true }));
    await clickWithFallback(page.locator('[data-testid^="saved-camera-view-delete-"]'));
    await expect(page.getByTestId("saved-camera-view-list")).toHaveCount(0);
    await expect(page.getByText("Saved views appear on share links and export packs.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("canvas-saved-views-panel")).toHaveCount(0);

    await selectWorkspace(page, "plan");
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");
  });

  test("layout versions save, restore, and delete the active room", async ({ page }) => {
    test.setTimeout(45_000);

    // Layout versions are Pro's (UX audit SX4, phase 4e; J's Q5), above Furnish's own foot.
    await page.route("**/api/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", source: "playwright" }) })
    );
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("layout-versions-panel")).toHaveCount(0);
    await selectWorkspace(page, "furnish");

    await expect(page.getByTestId("layout-versions-panel")).toBeVisible({ timeout: 10_000 });
    expect(
      await page.getByTestId("layout-versions-panel").evaluate((section) => {
        const foot = document.querySelector('[data-testid="furnish-footer"]');
        return Boolean(foot && section.compareDocumentPosition(foot) & Node.DOCUMENT_POSITION_FOLLOWING);
      })
    ).toBe(true);
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

  test("Pro's AI notes sit at the foot of Suggest a layout", async ({ page }) => {
    test.setTimeout(60_000);

    // AI notes moved from Present & export to Suggest a layout, for Pro (J, 5 Oct). Free users have none.
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toHaveAttribute("data-client-hydrated", "true", { timeout: 30_000 });
    await selectWorkspace(page, "furnish");
    await clickWithFallback(page.getByTestId("editor-workflow-ai"));
    await expect(page.getByTestId("furnish-step-back-to-products")).toBeVisible();
    await expect(page.getByTestId("ai-notes-section")).toHaveCount(0);

    await page.route("**/api/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", source: "playwright" }) })
    );
    let notesRequests = 0;
    await page.route("**/api/ai/design-notes", (route) => {
      notesRequests += 1;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ summary: ["The sofa anchors the room."], rationale: "Seating faces the window.", suggestions: [] }),
      });
    });
    await page.reload();
    await expect(sceneCanvas).toHaveAttribute("data-client-hydrated", "true", { timeout: 30_000 });
    await selectWorkspace(page, "furnish");
    await expect(page.getByTestId("ai-notes-section")).toHaveCount(0);

    // An empty room has nothing to review.
    await clickWithFallback(page.getByTestId("editor-workflow-ai"));
    const section = page.getByTestId("ai-notes-section");
    await expect(section).toBeVisible({ timeout: 10_000 });
    await expect(section.getByRole("heading", { name: "AI notes" })).toBeVisible();
    const generate = section.getByTestId("ai-notes-generate");
    await expect(generate).toBeDisabled();
    await expect(section).toContainText("Add products to the room first.");

    // With a product in the room, the notes open in their dialog.
    await clickWithFallback(page.getByTestId("furnish-step-back-to-products"));
    const firstPreview = page.locator('[data-testid^="catalog-preview-"]').first();
    await expect(firstPreview).toBeVisible({ timeout: 20_000 });
    const productId = (await firstPreview.getAttribute("data-testid"))?.replace("catalog-preview-", "");
    expect(productId).toBeTruthy();
    await clickWithFallback(page.getByTestId(`catalog-add-${productId}`));
    expect(await confirmCatalogPlacementIfVisible(page)).toBe(true);
    await clickWithFallback(page.getByTestId("editor-workflow-ai"));
    await expect(generate).toBeEnabled({ timeout: 10_000 });
    await generate.click();
    const notes = page.getByRole("dialog", { name: "AI notes" });
    await expect(notes).toBeVisible({ timeout: 10_000 });
    await expect(notes).toContainText("The sofa anchors the room.");
    expect(notesRequests).toBe(1);
    await notes.getByRole("button", { name: "Close", exact: true }).click();
    await expect(notes).toHaveCount(0);
    await expect(section).toBeVisible();
  });

  test("Pro's plan display sits at the foot of Plan while the 2D plan shows", async ({ page }) => {
    test.setTimeout(45_000);

    // The plan display moved from Present & export to Plan, for Pro (UX audit SX4, phase 4e; J's Q5).
    await page.route("**/api/me", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plan: "pro", source: "playwright" }) })
    );
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toBeVisible({ timeout: 20_000 });
    await expect(sceneCanvas).toHaveAttribute("data-client-hydrated", "true", { timeout: 30_000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    const display = page.getByTestId("plan-display-section");
    await page.getByTestId("editor-view-2d").click();
    await expect(display).toBeVisible({ timeout: 10_000 });
    await expect(display.getByRole("heading", { name: "Plan display" })).toBeVisible();
    await expect(page.getByTestId("plan-notes-section")).toHaveCount(0);

    // Simple has one note tool; Detailed adds callouts, room tags and the export style.
    await expect(display.getByTestId("plan-add-note")).toBeVisible();
    await expect(display.getByTestId("plan-add-callout")).toHaveCount(0);
    const detailed = display.getByRole("button", { name: "Detailed", exact: true });
    await detailed.click();
    await expect(detailed).toHaveAttribute("aria-pressed", "true");
    await expect(display.getByTestId("plan-add-callout")).toBeVisible();
    await expect(display.getByTestId("plan-add-room-tag")).toBeVisible();
    await expect(display.getByRole("group", { name: "Export style" })).toBeVisible();

    // Only while the 2D plan shows, and only in Plan.
    await page.getByTestId("editor-view-3d").click();
    await expect(display).toHaveCount(0);
    await page.getByTestId("editor-view-2d").click();
    await expect(display).toBeVisible();
    await selectWorkspace(page, "furnish");
    await expect(page.getByTestId("editor-workflow-furnish")).toHaveAttribute("data-active", "true");
    await expect(display).toHaveCount(0);
  });

  test("Free users keep notes at the foot of Plan while the 2D plan shows", async ({ page }) => {
    test.setTimeout(45_000);

    // J, 1 Oct (option A): every plan adds notes, so Free users keep Add note and Delete selected.
    await clearBrowserStorageBeforeNextLoad(page);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    const sceneCanvas = page.getByTestId("scene-canvas").first();
    await expect(sceneCanvas).toBeVisible({ timeout: 20_000 });
    await expect(sceneCanvas).toHaveAttribute("data-client-hydrated", "true", { timeout: 30_000 });
    await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "true");

    const notes = page.getByTestId("plan-notes-section");
    await page.getByTestId("editor-view-2d").click();
    await expect(notes).toBeVisible({ timeout: 10_000 });
    await expect(notes.getByRole("heading", { name: "Notes on the plan" })).toBeVisible();
    await expect(notes.getByTestId("plan-add-note")).toBeVisible();
    await expect(notes.getByRole("button", { name: "Delete selected" })).toBeDisabled();
    await expect(page.getByTestId("plan-display-section")).toHaveCount(0);

    await page.getByTestId("editor-view-3d").click();
    await expect(notes).toHaveCount(0);
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

    await page.getByRole("button", { name: "Expand Levels" }).click();
    await expect(page.getByRole("button", { name: "Collapse Levels" })).toBeVisible();

    const expandedBoxes = await Promise.all([
      navigator.boundingBox(),
      floorPanel.boundingBox(),
      selection.boundingBox(),
    ]);
    expect(expandedBoxes.every(Boolean)).toBe(true);
    expect(expandedBoxes[0]!.y + expandedBoxes[0]!.height).toBeLessThanOrEqual(expandedBoxes[1]!.y);
    expect(expandedBoxes[1]!.y + expandedBoxes[1]!.height).toBeLessThanOrEqual(expandedBoxes[2]!.y);

    await page.getByRole("button", { name: "Collapse Levels" }).click();
    await page.getByRole("button", { name: "Collapse navigator" }).click();
    await expect(page.getByRole("button", { name: "Expand Levels" })).toBeVisible();
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
