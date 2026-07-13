import fs from "node:fs";
import { test, expect } from "./fixtures";

const EDITOR_STORAGE_KEY = "interior-ai:v1:livingroom-design";

async function mockPlan(page: import("@playwright/test").Page, plan: "free" | "pro") {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ plan, source: "playwright" }),
    });
  });
}

async function dismissBlockingPrompt(page: import("@playwright/test").Page) {
  const overlay = page
    .locator(".fixed.inset-0.z-50")
    .filter({ hasText: /Upgrade to Pro|Save and sync this design/i })
    .last();
  if (!(await overlay.isVisible().catch(() => false))) return;

  const closeButton = overlay
    .getByRole("button", { name: /Maybe later|Close|Not now/i })
    .last();
  if ((await closeButton.count()) > 0) {
    await closeButton.evaluate((element) => (element as HTMLButtonElement).click());
    await expect(overlay).toBeHidden({ timeout: 5000 });
  }
}

async function openDetailedProStudio(page: import("@playwright/test").Page) {
  await mockPlan(page, "pro");
  await page.goto("/design?mode=designer");

  const openStudio = page.getByTestId("open-custom-millwork-studio");
  await expect(openStudio).toBeVisible({ timeout: 30000 });
  await dismissBlockingPrompt(page);
  await openStudio.click();
  await expect(page.getByTestId("custom-millwork-studio")).toBeVisible({ timeout: 15000 });
  await page.getByTestId("cabinet-experience-detailed").click();
  await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute(
    "data-experience",
    "detailed"
  );
  await page.getByTestId("cabinet-module-options-toggle").click();
  await expect(page.getByTestId("cabinet-module-options")).toBeVisible();
}

async function configureCabinetRunForExport(page: import("@playwright/test").Page) {
  await openDetailedProStudio(page);
  await page.getByTestId("cabinet-preset-cabinet_run").click();
  await expect(page.getByTestId("cabinet-module-3")).toBeVisible();
  await page.getByTestId("cabinet-module-3").click();
  await page.getByTestId("cabinet-module-move-left").click();
  await expect(page.getByTestId("cabinet-module-2")).toHaveAttribute(
    "data-module-id",
    "module-3"
  );
  await page.getByTestId("cabinet-output-tab-outputs").click();

  const sourceDownloadPromise = page.waitForEvent("download");
  await page.getByTestId("cabinet-download-source-definition").click();
  const sourceDownload = await sourceDownloadPromise;
  const sourceDownloadPath = await sourceDownload.path();
  expect(sourceDownloadPath).toBeTruthy();

  return JSON.parse(fs.readFileSync(sourceDownloadPath!, "utf8"));
}

async function placeCabinetRun(page: import("@playwright/test").Page) {
  const sourceJson = await configureCabinetRunForExport(page);
  await page.getByTestId("cabinet-place-in-plan").click();

  const placedCabinet = page.getByTestId("placed-millwork-asset").first();
  await expect(placedCabinet).toHaveCount(1, { timeout: 30000 });
  const beforePosition = await placedCabinet.getAttribute("data-position");
  const beforeRotation = await placedCabinet.getAttribute("data-rotation-y");
  const instanceId = await placedCabinet.getAttribute("data-instance-id");
  expect(beforePosition).toBeTruthy();
  expect(beforeRotation).toBeTruthy();
  expect(instanceId).toBeTruthy();
  await dismissBlockingPrompt(page);

  return {
    sourceJson,
    placedCabinet,
    beforePosition: beforePosition!,
    beforeRotation: beforeRotation!,
    instanceId: instanceId!,
  };
}

test.describe("Custom Millwork Studio MVP", () => {
  test.setTimeout(600000);

  test("new designer can configure a valid drawer cabinet in Guided setup", async ({ page }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer");

    const openStudio = page.getByTestId("open-custom-millwork-studio");
    await expect(openStudio).toBeVisible({ timeout: 30000 });
    await dismissBlockingPrompt(page);
    await openStudio.click();

    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-access-level", "pro");
    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-experience", "guided");
    const onboarding = page.getByTestId("cabinet-onboarding-hint");
    await expect(onboarding).toContainText("Choose a template");
    await page.getByTestId("cabinet-onboarding-dismiss").click();
    await expect(onboarding).toHaveCount(0);
    await page.getByTestId("cabinet-onboarding-show").click();
    await expect(onboarding).toBeVisible();

    const templateSearch = page.getByTestId("cabinet-template-search");
    await templateSearch.fill("murphy bed");
    const murphyBedTemplate = page.getByTestId("cabinet-preset-murphy_bed");
    await expect(murphyBedTemplate).toHaveAttribute(
      "data-safety-classification",
      "specialist_installation_required"
    );
    await expect(murphyBedTemplate).toHaveAttribute("data-applicable-room-types", /bedroom/);
    await expect(page.getByTestId("cabinet-template-thumbnail-murphy_bed")).toHaveAttribute(
      "data-thumbnail-kind",
      "wall_bed"
    );
    await templateSearch.fill("coffer grid specialist installation");
    await expect(page.getByTestId("cabinet-preset-coffered_ceiling")).toBeVisible();
    await expect(page.getByTestId("cabinet-preset-base")).toHaveCount(0);
    await templateSearch.fill("");
    await page.getByTestId("cabinet-preset-base").click();
    await page.getByTestId("cabinet-guided-step-size").click();

    const width = page.getByTestId("cabinet-guided-width");
    await width.fill("1000");
    await width.press("Enter");
    await expect(width).toHaveValue("1000");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");

    await page.getByTestId("cabinet-undo").click();
    await expect(width).toHaveValue("900");
    await page.getByTestId("cabinet-redo").click();
    await expect(width).toHaveValue("1000");
    await page.getByTestId("cabinet-restore-template").click();
    await expect(width).toHaveValue("900");
    await width.fill("1000");
    await width.press("Enter");

    await page.getByTestId("cabinet-guided-step-layout").click();
    await page.getByTestId("cabinet-guided-layout-double_door").click();
    await expect(page.getByTestId("cabinet-door-layout-recommended")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cabinet-guided-doors")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-guided-recommended-doors")).toContainText("sized automatically");
    await page.getByTestId("cabinet-door-layout-manual").click();
    await expect(page.getByTestId("cabinet-guided-doors")).toBeEnabled();
    await page.getByTestId("cabinet-guided-doors").fill("3");
    await page.getByTestId("cabinet-guided-doors").press("Enter");
    await page.getByTestId("cabinet-door-layout-recommended").click();
    await expect(page.getByTestId("cabinet-guided-doors")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-guided-recommended-doors")).toHaveAttribute(
      "data-door-count",
      "2"
    );
    await page.getByTestId("cabinet-guided-layout-drawer_stack").click();
    await page.getByTestId("cabinet-guided-drawers").fill("3");
    await page.getByTestId("cabinet-guided-drawers").press("Enter");
    await expect(page.getByTestId("cabinet-drawer-heights-recommended")).toHaveAttribute("aria-pressed", "true");
    await expect(
      page
        .getByTestId("cabinet-drawer-heights-recommended")
        .locator('[data-cabinet-drawer-configuration="recommended:3"]')
    ).toBeVisible();
    await page.getByTestId("cabinet-drawer-heights-custom").click();
    await expect(page.getByTestId("cabinet-drawer-proportion-1")).toBeVisible();
    await page.getByTestId("cabinet-drawer-proportion-1").fill("40");
    await page.getByTestId("cabinet-drawer-proportion-1").press("Enter");
    await page.getByTestId("cabinet-drawer-heights-equal").click();
    await expect(page.getByTestId("cabinet-drawer-proportion-1")).toBeHidden();

    await page.getByTestId("cabinet-guided-step-style").click();
    await page.getByTestId("cabinet-guided-material-oak_veneer").click();
    await page.getByTestId("cabinet-guided-hardware-brushed_steel_bar_pull").click();

    await page.getByTestId("cabinet-guided-step-review").click();
    await expect(page.getByTestId("cabinet-guided-review-panel")).toBeVisible();
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await expect(page.getByTestId("cabinet-place-in-plan")).toBeEnabled();

    await page.getByTestId("cabinet-save-definition").click();
    await expect(page.getByTestId("cabinet-action-success")).toContainText(/Reusable template saved/i);
    await page.getByTestId("cabinet-guided-step-type").click();
    await page.getByRole("button", { name: /Delete reusable template/i }).first().click();
    const templateDeleteUndo = page.getByTestId("cabinet-template-delete-undo");
    await expect(templateDeleteUndo).toBeVisible();
    await templateDeleteUndo.getByRole("button", { name: "Undo delete" }).click();
    await expect(page.getByRole("button", { name: /Delete reusable template/i }).first()).toBeVisible();
    await page.getByTestId("cabinet-preset-vanity").click();
    await page.getByTestId("cabinet-undo").click();
    await page.getByTestId("cabinet-redo").click();
    await page.getByTestId("cabinet-undo").click();
    await page.getByTestId("cabinet-restore-template").click();
    await page.getByTestId("cabinet-guided-step-size").click();
    await expect(page.getByTestId("cabinet-guided-width")).toHaveValue("1000");
  });

  test("returning Pro users keep their chosen entry workspace and dismissed help", async ({ page }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer");
    const openStudio = page.getByTestId("open-custom-millwork-studio");
    await expect(openStudio).toBeVisible({ timeout: 30000 });
    await dismissBlockingPrompt(page);
    await openStudio.click();

    await expect(page.getByTestId("cabinet-onboarding-hint")).toBeVisible();
    await page.getByTestId("cabinet-onboarding-dismiss").click();
    await page.getByTestId("cabinet-experience-detailed").click();
    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute(
      "data-experience",
      "detailed"
    );
    await page.getByTestId("cabinetry-studio-close").click();
    await openStudio.click();
    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute(
      "data-experience",
      "detailed"
    );

    await page.getByTestId("cabinet-experience-guided").click();
    await expect(page.getByTestId("cabinet-onboarding-hint")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-onboarding-show")).toBeVisible();
    await page.getByTestId("cabinetry-studio-close").click();
    await openStudio.click();
    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute(
      "data-experience",
      "guided"
    );
  });

  test("guided Fit, locks, and validation recovery stay reversible", async ({ page }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer");
    await expect(page.getByTestId("open-custom-millwork-studio")).toBeVisible({ timeout: 30000 });
    await dismissBlockingPrompt(page);
    await page.getByTestId("open-custom-millwork-studio").click();

    await page.getByTestId("cabinet-guided-step-space").click();
    const firstMeasuredWall = page.locator('[data-testid^="cabinet-space-"]').first();
    await expect(firstMeasuredWall).toBeVisible();
    await firstMeasuredWall.click();
    await expect(page.getByTestId("cabinet-fit-mode-fit_height")).toBeVisible();
    await expect(page.getByTestId("cabinet-fit-mode-between_boundaries")).toBeVisible();
    await page.getByTestId("cabinet-fit-mode-fit_width").click();
    await page.getByTestId("cabinet-fit-to-space").click();
    await expect(page.getByTestId("cabinet-fit-feedback")).toHaveAttribute("data-fit-status", "success");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");

    await page.getByTestId("cabinet-guided-step-size").click();
    const fittedWidth = await page.getByTestId("cabinet-guided-width").inputValue();
    await page.getByTestId("cabinet-overall-width-lock").click();
    await expect(page.getByTestId("cabinet-guided-width")).toBeDisabled();
    await page.getByTestId("cabinet-guided-step-layout").click();
    const guidedModules = page.getByTestId(/^cabinet-guided-module-\d+$/);
    const originalModuleCount = await guidedModules.count();
    const addModule = page.getByTestId("cabinet-guided-add-module");
    await expect(addModule).toBeEnabled();
    await expect(addModule).toHaveAttribute(
      "title",
      /Preserve the overall target and redistribute unlocked module widths/i
    );
    await addModule.click();
    await expect(guidedModules).toHaveCount(originalModuleCount + 1);
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");

    await page.getByTestId("cabinet-guided-step-size").click();
    await expect(page.getByTestId("cabinet-guided-width")).toHaveValue(fittedWidth);
    await page.getByTestId("cabinet-guided-step-layout").click();
    await page.getByTestId("cabinet-module-sizing-manual").click();
    await expect(page.getByTestId("cabinet-module-sizing-manual")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(addModule).toBeDisabled();
    await expect(addModule).toHaveAttribute(
      "title",
      /Manual sizing cannot change the module total while overall width is locked/i
    );

    await page.getByTestId("cabinet-guided-step-size").click();
    await page.getByTestId("cabinet-overall-width-lock").click();
    await expect(page.getByTestId("cabinet-guided-width")).toBeEnabled();

    await page.getByTestId("cabinet-guided-step-layout").click();
    await page.getByTestId("cabinet-module-sizing-automatic").click();
    await page.getByTestId("cabinet-equal-module-sizing").click();
    await expect(page.getByTestId("cabinet-equal-module-sizing")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("cabinet-guided-shelves").fill("2");
    await page.getByTestId("cabinet-guided-shelves").press("Enter");
    await page.getByTestId("cabinet-shelf-spacing-custom").click();
    await expect(page.getByTestId("cabinet-guided-shelf-position-1")).toBeVisible();
    await page.getByTestId("cabinet-shelf-spacing-lock").click();
    await expect(page.getByTestId("cabinet-shelf-spacing-even")).toBeDisabled();
    await page.getByTestId("cabinet-shelf-spacing-lock").click();
    await page.getByTestId("cabinet-shelf-spacing-even").click();
    await expect(page.getByTestId("cabinet-shelf-spacing-even")).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-guided-layout-drawer_stack").click();
    await page.getByTestId("cabinet-guided-drawers").fill("0");
    await page.getByTestId("cabinet-guided-drawers").press("Enter");
    await page.getByTestId("cabinet-guided-step-review").click();
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", /[1-9]\d*/);
    await page.getByRole("button", { name: "Use three drawers", exact: true }).click();
    await expect(page.getByTestId("cabinet-fix-preview")).toBeVisible();
    await page.getByTestId("cabinet-fix-preview-apply").click();
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
  });

  test("detailed numeric drafts keep the last valid model and preview until committed", async ({ page }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer");
    await expect(page.getByTestId("open-custom-millwork-studio")).toBeVisible({ timeout: 30000 });
    await dismissBlockingPrompt(page);
    await page.getByTestId("open-custom-millwork-studio").click();
    await page.getByTestId("cabinet-experience-detailed").click();

    const width = page.getByTestId("cabinet-dimension-width");
    const moduleSummary = page.getByTestId("cabinet-module-1");
    const preview = page.getByTestId("cabinet-preview");
    const committedWidth = await width.inputValue();
    const committedModuleSummary = await moduleSummary.textContent();
    const committedPreview = await preview.textContent();

    await width.fill("");
    await expect(width).toHaveAttribute("aria-invalid", "true");
    await expect(width).toHaveAttribute("data-draft-issue", "empty");
    expect(await moduleSummary.textContent()).toBe(committedModuleSummary);
    expect(await preview.textContent()).toBe(committedPreview);
    await width.press("Enter");
    await expect(width).toHaveValue("");
    expect(await moduleSummary.textContent()).toBe(committedModuleSummary);

    await width.press("Escape");
    await expect(width).toHaveValue(committedWidth);
    await expect(width).not.toHaveAttribute("aria-invalid", "true");

    await width.fill("1e309");
    await width.press("Enter");
    await expect(width).toHaveAttribute("data-draft-issue", "non_finite");
    expect(await moduleSummary.textContent()).toBe(committedModuleSummary);
    expect(await preview.textContent()).toBe(committedPreview);

    await width.press("Escape");
    const nextWidth = String(Number(committedWidth) + 10);
    await width.fill(nextWidth);
    await width.press("Enter");
    await expect(width).toHaveValue(nextWidth);
    await expect(moduleSummary).toContainText(`${nextWidth} mm`);
  });

  test("Guided wardrobe arrangements and illustrated choices expose semantic state", async ({ page }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer");
    await expect(page.getByTestId("open-custom-millwork-studio")).toBeVisible({ timeout: 30000 });
    await dismissBlockingPrompt(page);
    await page.getByTestId("open-custom-millwork-studio").click();

    await page.getByTestId("cabinet-guided-step-style").click();
    for (const doorStyle of ["flat_slab", "shaker", "glass", "fluted"] as const) {
      const choice = page.getByTestId(`cabinet-guided-door-style-${doorStyle}`);
      await expect(choice).toBeVisible();
      await expect(
        choice.locator(`[data-cabinet-door-style-preview="${doorStyle}"]`)
      ).toBeVisible();
    }
    for (const [hardwareId, handleType] of [
      ["brushed_steel_bar_pull", "bar_pull"],
      ["round_knob", "knob"],
      ["edge_pull", "edge_pull"],
      ["push_to_open", "push_to_open"],
    ] as const) {
      const choice = page.getByTestId(`cabinet-guided-hardware-${hardwareId}`);
      await expect(choice).toBeVisible();
      await expect(
        choice.locator(`[data-cabinet-handle-type-preview="${handleType}"]`)
      ).toBeVisible();
    }

    await page.getByTestId("cabinet-guided-step-type").click();
    await page.getByTestId("cabinet-preset-wardrobe").click();
    await page.getByTestId("cabinet-guided-step-layout").click();
    for (const arrangement of [
      "long_hanging",
      "double_hanging",
      "shelves",
      "drawer_bank",
      "mixed_storage",
    ] as const) {
      const card = page.getByTestId(`cabinet-guided-wardrobe-${arrangement}`);
      await expect(card).toBeVisible();
      await expect(card).toHaveAttribute("aria-label", /arrangement/i);
    }
    const mixedStorage = page.getByTestId("cabinet-guided-wardrobe-mixed_storage");
    await mixedStorage.click();
    await expect(mixedStorage).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");

    await page.getByTestId("cabinet-experience-detailed").click();
    await page.getByTestId("cabinet-preset-wall_paneling").click();
    await page.getByTestId("cabinet-module-options-toggle").click();
    await expect(page.getByTestId("cabinet-wall-panel-pattern-preview")).toBeVisible();
    await expect(page.locator('[data-cabinet-wall-panel-pattern="2x1"]')).toBeVisible();
    const panelPattern = page.getByTestId("cabinet-wall-panel-pattern-3x2");
    await expect(panelPattern.locator('[data-cabinet-wall-panel-pattern="3x2"]')).toBeVisible();
    await panelPattern.click();
    await expect(panelPattern).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("cabinet-preset-murphy_bed").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-wall-bed-controls")).toBeVisible();
    await expect(page.getByTestId("cabinet-wall-bed-controls").getByRole("img")).toBeVisible();
    await expect(
      page
        .getByTestId("cabinet-wall-bed-orientation-horizontal")
        .locator('[data-cabinet-wall-bed-preview*="horizontal"]')
    ).toBeVisible();
    const leftStorage = page.getByTestId("cabinet-wall-bed-side-storage-left");
    await expect(leftStorage.locator('[data-cabinet-wall-bed-preview$=":left"]')).toBeVisible();
    await leftStorage.click();
    await expect(leftStorage).toHaveAttribute("aria-pressed", "true");
  });

  test("preview controls remain keyboard-operable across responsive layouts", async ({ page }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer");
    await expect(page.getByTestId("open-custom-millwork-studio")).toBeVisible({ timeout: 30000 });
    await dismissBlockingPrompt(page);
    await page.getByTestId("open-custom-millwork-studio").click();

    const clearanceToggle = page.locator(
      '[data-testid="cabinet-preview-clearance-toggle"]:visible'
    );
    await expect(clearanceToggle).toContainText("Clearances");
    await expect(clearanceToggle).toHaveAttribute("aria-pressed", "true");
    await expect(clearanceToggle.locator("svg")).toHaveCount(1);
    await clearanceToggle.click();
    await expect(clearanceToggle).toHaveAttribute("aria-pressed", "false");
    await expect(clearanceToggle.locator("svg")).toHaveCount(0);
    await clearanceToggle.press("Space");
    await expect(clearanceToggle).toHaveAttribute("aria-pressed", "true");
    await expect(clearanceToggle.locator("svg")).toHaveCount(1);

    const perspectiveView = page.locator(
      '[data-testid="cabinet-preview-view-perspective"]:visible'
    ).first();
    const frontView = page.locator('[data-testid="cabinet-preview-view-front"]:visible').first();
    const topView = page.locator('[data-testid="cabinet-preview-view-top"]:visible').first();
    await perspectiveView.focus();
    await perspectiveView.press("ArrowRight");
    await expect(frontView).toBeFocused();
    await expect(frontView).toHaveAttribute("aria-pressed", "true");
    await expect(frontView).toContainText("✓");
    await frontView.press("End");
    await expect(topView).toBeFocused();
    await expect(topView).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("cabinet-experience-detailed").click();
    await expect(page.getByTestId("cabinet-preview")).toBeVisible();
    await expect(page.getByTestId("cabinet-detailed-compact-preview")).toBeHidden();
    const widthHandle = page.getByTestId("cabinet-dimension-handle-totalWidth");
    const originalWidth = Number(await widthHandle.getAttribute("aria-valuenow"));
    await widthHandle.focus();
    await widthHandle.press("ArrowRight");
    await expect(widthHandle).toHaveAttribute("aria-valuenow", String(originalWidth + 1));
    await expect(page.getByTestId("cabinet-dimension-width")).toHaveValue(
      String(originalWidth + 1)
    );
    await widthHandle.press("ArrowLeft");
    await expect(widthHandle).toHaveAttribute("aria-valuenow", String(originalWidth));

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("cabinet-detailed-compact-preview")).toBeVisible();
    await expect(page.getByTestId("cabinet-preview")).toBeHidden();
    await page.getByRole("button", { name: "Use guided setup", exact: true }).click();
    const mobilePreviewToggle = page.getByTestId("cabinet-mobile-preview-toggle");
    await expect(mobilePreviewToggle).toBeVisible();
    await expect(mobilePreviewToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("cabinet-mobile-preview")).toBeVisible();
    await mobilePreviewToggle.click();
    await expect(mobilePreviewToggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByTestId("cabinet-mobile-preview")).toHaveCount(0);

    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(mobilePreviewToggle).toBeHidden();
    await expect(
      page.locator('[data-testid="cabinet-preview-view-top"]:visible')
        .first()
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("Pro designer can enter Detailed mode and validate the template catalog", async ({
    page,
  }) => {
    await mockPlan(page, "pro");
    await page.goto("/design?mode=designer");

    const openStudio = page.getByTestId("open-custom-millwork-studio");
    await expect(openStudio).toBeVisible({ timeout: 30000 });
    await expect(openStudio).toContainText(/Custom Millwork Studio/i);
    await dismissBlockingPrompt(page);
    await openStudio.click();

    await expect(page.getByTestId("custom-millwork-studio")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("heading", { name: "Custom Millwork Studio" })).toBeVisible();
    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-experience", "guided");
    await expect(page.getByTestId("cabinet-template-search")).toBeVisible();
    await page.getByTestId("cabinet-template-search").fill("wardrobe");
    await expect(page.getByTestId("cabinet-preset-wardrobe")).toBeVisible();
    await page.getByTestId("cabinet-template-search").fill("");
    await page.getByTestId("cabinet-experience-detailed").click();
    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-experience", "detailed");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-validation-policy", "errors_block_warnings_allow");
    await page.getByTestId("cabinet-module-options-toggle").click();
    await expect(page.getByTestId("cabinet-module-options")).toBeVisible();
    await page.getByTestId("cabinet-property-search-input").fill("plinth recess");
    const toeKickSearchResult = page
      .getByTestId("cabinet-property-search-result")
      .filter({ hasText: "Floor-base setback" });
    await expect(toeKickSearchResult).toBeVisible();
    await toeKickSearchResult.click();
    await expect(page.getByTestId("cabinet-input-toe-kick-setback")).toBeFocused();
    await page.getByTestId("cabinet-property-search-input").fill("custom shelf heights");
    const shelfSpacingSearchResult = page.locator(
      '[data-testid="cabinet-property-search-result"][data-property-id="module.shelfPositionsMm"]'
    );
    await expect(shelfSpacingSearchResult).toBeVisible();
    await shelfSpacingSearchResult.click();
    await expect(page.getByTestId("cabinet-shelf-spacing-custom")).toBeFocused();
    await page.getByTestId("cabinet-property-search-input").fill("");
    await expect(page.getByTestId("cabinet-overall-dimension-handles")).toBeVisible();
    await expect(page.getByTestId("cabinet-output-tabs")).toBeVisible();
    for (const preset of [
      "base",
      "wall",
      "tall",
      "vanity",
      "cabinet_run",
      "media_wall",
      "murphy_bed",
      "fold_down_desk",
      "platform_storage_bed",
      "under_stair_storage",
      "room_divider_storage",
      "mudroom_storage",
      "laundry_room",
      "home_office_built_in",
      "library_wall",
      "window_seat",
      "banquette",
      "home_bar",
      "kitchen_island",
      "pantry_system",
      "wine_storage",
      "pet_built_in",
      "kids_storage",
      "hobby_storage",
      "wall_paneling",
      "ceiling_beams",
      "coffered_ceiling",
      "fireplace_surround",
      "trim_package",
    ]) {
      await page.getByTestId(`cabinet-preset-${preset}`).click();
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    }
  });

  test("Pro designer can configure core and architectural construction controls", async ({
    page,
  }) => {
    await openDetailedProStudio(page);
    await page.getByTestId("cabinet-preset-base").click();
    await expect(page.getByTestId("cabinet-input-drawer-box-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-drawer-box-side-thickness")).toHaveValue("12");
    await expect(page.getByTestId("cabinet-input-drawer-box-bottom-thickness")).toHaveValue("6");
    await expect(page.getByTestId("cabinet-input-drawer-box-height-clearance")).toHaveValue("45");
    await expect(page.getByTestId("cabinet-input-drawer-box-back-clearance")).toHaveValue("20");
    await page.getByTestId("cabinet-input-drawer-box-side-thickness").fill("13");
    await page.getByTestId("cabinet-input-drawer-box-bottom-thickness").fill("9");
    await page.getByTestId("cabinet-input-drawer-box-height-clearance").fill("50");
    await page.getByTestId("cabinet-input-drawer-box-back-clearance").fill("25");
    await expect(page.getByTestId("cabinet-input-drawer-box-side-thickness")).toHaveValue("13");
    await expect(page.getByTestId("cabinet-input-drawer-slide-hardware-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-drawer-slide-length")).toHaveValue("500");
    await expect(page.getByTestId("cabinet-input-drawer-slide-clearance")).toHaveValue("13");
    await page.getByTestId("cabinet-input-drawer-slide-length").fill("480");
    await page.getByTestId("cabinet-input-drawer-slide-clearance").fill("15");
    await expect(page.getByTestId("cabinet-input-drawer-slide-length")).toHaveValue("480");
    await expect(page.getByTestId("cabinet-input-drawer-slide-clearance")).toHaveValue("15");
    await expect(page.getByTestId("cabinet-handle-placement-automatic")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("cabinet-handle-placement-custom").click();
    await page.getByTestId("cabinet-input-handle-offset-x").fill("25");
    await page.getByTestId("cabinet-input-handle-offset-x").press("Enter");
    await page.getByTestId("cabinet-input-handle-offset-y").fill("-15");
    await page.getByTestId("cabinet-input-handle-offset-y").press("Enter");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-handle-placement-automatic").click();
    await expect(page.getByTestId("cabinet-input-handle-offset-x")).toBeHidden();
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-wall").click();
    await expect(page.getByTestId("cabinet-input-installation-cleat-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-installation-cleat-height")).toHaveValue("80");
    await expect(page.getByTestId("cabinet-input-installation-cleat-thickness")).toHaveValue("18");
    await expect(page.getByTestId("cabinet-input-installation-cleat-inset")).toHaveValue("70");
    await page.getByTestId("cabinet-input-installation-cleat-height").fill("90");
    await page.getByTestId("cabinet-input-installation-cleat-thickness").fill("20");
    await page.getByTestId("cabinet-input-installation-cleat-inset").fill("75");
    await expect(page.getByTestId("cabinet-input-installation-cleat-height")).toHaveValue("90");
    await expect(page.getByTestId("cabinet-input-door-hinge-hardware-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-door-hinge-count")).toHaveValue("2");
    await expect(page.getByTestId("cabinet-input-door-hinge-inset")).toHaveValue("90");
    await page.getByTestId("cabinet-input-door-hinge-count").fill("3");
    await page.getByTestId("cabinet-input-door-hinge-inset").fill("110");
    await expect(page.getByTestId("cabinet-input-door-hinge-count")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-door-hinge-inset")).toHaveValue("110");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-tall").click();
    await expect(page.getByTestId("cabinet-input-anti-tip-anchor-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-anti-tip-anchor-count")).toHaveValue("2");
    await expect(page.getByTestId("cabinet-input-anti-tip-anchor-height")).toHaveValue("2020");
    await expect(page.getByTestId("cabinet-input-anti-tip-anchor-inset")).toHaveValue("90");
    await page.getByTestId("cabinet-input-anti-tip-anchor-count").fill("1");
    await page.getByTestId("cabinet-input-anti-tip-anchor-height").fill("2000");
    await page.getByTestId("cabinet-input-anti-tip-anchor-inset").fill("100");
    await expect(page.getByTestId("cabinet-input-anti-tip-anchor-count")).toHaveValue("1");
    await expect(page.getByTestId("cabinet-input-anti-tip-anchor-height")).toHaveValue("2000");
    await expect(page.getByTestId("cabinet-input-anti-tip-anchor-inset")).toHaveValue("100");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-vanity").click();
    await expect(page.getByTestId("cabinet-input-sink-cutout-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-sink-cutout-width")).toHaveValue("480");
    await expect(page.getByTestId("cabinet-input-sink-cutout-depth")).toHaveValue("340");
    await expect(page.getByTestId("cabinet-input-sink-cutout-offset-x")).toHaveValue("0");
    await expect(page.getByTestId("cabinet-input-sink-cutout-offset-z")).toHaveValue("250");
    await expect(page.getByTestId("cabinet-input-plumbing-chase-width")).toHaveValue("360");
    await expect(page.getByTestId("cabinet-input-plumbing-chase-height")).toHaveValue("420");
    await expect(page.getByTestId("cabinet-input-plumbing-chase-depth")).toHaveValue("90");
    await page.getByTestId("cabinet-input-sink-cutout-width").fill("460");
    await page.getByTestId("cabinet-input-sink-cutout-depth").fill("320");
    await page.getByTestId("cabinet-input-sink-cutout-offset-z").fill("240");
    await page.getByTestId("cabinet-input-plumbing-chase-width").fill("340");
    await page.getByTestId("cabinet-input-plumbing-chase-height").fill("400");
    await page.getByTestId("cabinet-input-plumbing-chase-depth").fill("100");
    await expect(page.getByTestId("cabinet-input-sink-cutout-width")).toHaveValue("460");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-slat_wall").click();
    await page.getByTestId("cabinet-input-slats").fill("3");
    await page.getByTestId("cabinet-input-slat-width").fill("32");
    await page.getByTestId("cabinet-input-slat-depth").fill("38");
    await page.getByTestId("cabinet-input-slat-spacing").fill("24");
    await expect(page.getByTestId("cabinet-input-slats")).toHaveValue("3");
    await page.getByTestId("cabinet-preset-wall_paneling").click();
    await page.getByTestId("cabinet-input-panel-columns").fill("2");
    await page.getByTestId("cabinet-input-panel-rows").fill("1");
    await page.getByTestId("cabinet-input-panel-frame-width").fill("55");
    await page.getByTestId("cabinet-input-panel-frame-depth").fill("18");
    await expect(page.getByTestId("cabinet-input-panel-columns")).toHaveValue("2");
    await page.getByTestId("cabinet-preset-ceiling_beams").click();
    await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("ceiling_beam_array");
    await expect(page.getByTestId("cabinet-input-ceiling-beams")).toHaveValue("4");
    await page.getByTestId("cabinet-input-ceiling-beams").fill("3");
    await page.getByTestId("cabinet-input-ceiling-beam-width").fill("150");
    await page.getByTestId("cabinet-input-ceiling-beam-depth").fill("180");
    await page.getByTestId("cabinet-input-ceiling-beam-orientation").selectOption("z");
    await expect(page.getByTestId("cabinet-input-ceiling-beams")).toHaveValue("3");
    await page.getByTestId("cabinet-preset-coffered_ceiling").click();
    await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("coffered_ceiling_grid");
    await page.getByTestId("cabinet-input-ceiling-grid-columns").fill("3");
    await page.getByTestId("cabinet-input-ceiling-grid-rows").fill("3");
    await expect(page.getByTestId("cabinet-input-ceiling-grid-columns")).toHaveValue("3");
    await page.getByTestId("cabinet-preset-trim_package").click();
    await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("trim_run");
    await page.getByTestId("cabinet-input-trim-members").fill("4");
    await page.getByTestId("cabinet-input-trim-profile-width").fill("160");
    await page.getByTestId("cabinet-input-trim-profile-depth").fill("24");
    await page.getByTestId("cabinet-input-trim-orientation").selectOption("x");
    await expect(page.getByTestId("cabinet-input-trim-placement")).toHaveValue("baseboard");
    await page.getByTestId("cabinet-input-trim-placement").selectOption("baseboard");
    await page.getByTestId("cabinet-input-trim-setout-height").fill("0");
    await expect(page.getByTestId("cabinet-input-trim-left-end-treatment")).toHaveValue("butt");
    await expect(page.getByTestId("cabinet-input-trim-right-end-treatment")).toHaveValue("butt");
    await page.getByTestId("cabinet-input-trim-left-end-treatment").selectOption("mitered_return");
    await page.getByTestId("cabinet-input-trim-right-end-treatment").selectOption("mitered_return");
    await page.getByTestId("cabinet-input-trim-return-depth").fill("120");
    await page.getByTestId("cabinet-input-trim-miter-angle").fill("45");
    await page.getByTestId("cabinet-input-trim-reveal-strip-enabled").check();
    await page.getByTestId("cabinet-input-trim-reveal-strip-height").fill("22");
    await page.getByTestId("cabinet-input-trim-reveal-strip-depth").fill("14");
    await page.getByTestId("cabinet-input-trim-reveal-strip-inset").fill("8");
    await expect(page.getByTestId("cabinet-input-trim-members")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-trim-setout-height")).toHaveValue("0");
    await expect(page.getByTestId("cabinet-input-trim-return-depth")).toHaveValue("120");
    await expect(page.getByTestId("cabinet-input-trim-miter-angle")).toHaveValue("45");
    await expect(page.getByTestId("cabinet-input-trim-reveal-strip-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-trim-reveal-strip-depth")).toHaveValue("14");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-fireplace_surround").click();
    await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("fireplace_surround_frame");
    await page.getByTestId("cabinet-input-fireplace-opening-width").fill("1100");
    await page.getByTestId("cabinet-input-fireplace-opening-height").fill("900");
    await page.getByTestId("cabinet-input-fireplace-leg-width").fill("180");
    await page.getByTestId("cabinet-input-fireplace-header-height").fill("220");
    await page.getByTestId("cabinet-input-fireplace-mantel-height").fill("120");
    await page.getByTestId("cabinet-input-fireplace-mantel-depth").fill("300");
    await expect(page.getByTestId("cabinet-input-fireplace-mantel-depth")).toHaveValue("300");
    await page.getByTestId("cabinet-preset-murphy_bed").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("wall_bed_panel");
    await page.getByTestId("cabinet-input-convertible-panel-thickness").fill("42");
    await page.getByTestId("cabinet-input-convertible-panel-height").fill("2200");
    await page.getByTestId("cabinet-input-convertible-open-depth").fill("2050");
    await page.getByTestId("cabinet-input-convertible-hinge-height").fill("90");
    await page.getByTestId("cabinet-input-convertible-support-legs").fill("2");
    await page.getByTestId("cabinet-input-convertible-support-leg-width").fill("45");
    await page.getByTestId("cabinet-input-convertible-support-leg-depth").fill("45");
    await expect(page.getByTestId("cabinet-input-convertible-open-depth")).toHaveValue("2050");
    await expect(page.getByTestId("cabinet-wall-bed-mattress-double")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cabinet-wall-bed-orientation-vertical")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cabinet-wall-bed-state-closed")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("cabinet-wall-bed-clearance-visible")).toBeChecked();
    await expect(page.getByTestId("cabinet-wall-bed-side-storage")).toHaveValue("both");
    for (const [query, label] of [
      ["mattress size", "Wall-bed mattress size"],
      ["bed orientation", "Wall-bed orientation"],
      ["preview state", "Wall-bed preview state"],
      ["floor clearance", "Wall-bed clearance display"],
      ["side storage", "Wall-bed side storage"],
    ] as const) {
      await page.getByTestId("cabinet-property-search-input").fill(query);
      await expect(
        page.getByTestId("cabinet-property-search-result").filter({ hasText: label })
      ).toBeVisible();
    }
    await page.getByTestId("cabinet-property-search-input").fill("mattress size");
    await page
      .getByTestId("cabinet-property-search-result")
      .filter({ hasText: "Wall-bed mattress size" })
      .click();
    await expect(page.getByTestId("cabinet-wall-bed-mattress-double")).toBeFocused();
    await page.getByTestId("cabinet-wall-bed-state-open").click();
    await expect(page.getByTestId("cabinet-wall-bed-state-open")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("cabinet-preset-fold_down_desk").click();
    await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("fold_down_worksurface");
    await page.getByTestId("cabinet-property-search-input").fill("mattress size");
    await expect(page.getByTestId("cabinet-property-search-result")).toHaveCount(0);
    await page.getByTestId("cabinet-property-search-input").fill("");
    await page.getByTestId("cabinet-input-convertible-panel-thickness").fill("30");
    await page.getByTestId("cabinet-input-convertible-panel-height").fill("720");
    await page.getByTestId("cabinet-input-convertible-open-depth").fill("650");
    await page.getByTestId("cabinet-input-convertible-hinge-height").fill("740");
    await expect(page.getByTestId("cabinet-input-convertible-hinge-height")).toHaveValue("740");
  });

  test("Pro designer can configure built-in storage and room-system controls", async ({
    page,
  }) => {
    await openDetailedProStudio(page);
    await page.getByTestId("cabinet-preset-platform_storage_bed").click();
    await expect(page.getByTestId("cabinet-input-module-type")).toHaveValue("base");
    await expect(page.getByTestId("cabinet-input-front-type")).toHaveValue("drawer_stack");
    await expect(page.getByTestId("cabinet-input-platform-deck-thickness")).toHaveValue("24");
    await expect(page.getByTestId("cabinet-input-platform-support-ribs")).toHaveValue("3");
    await page.getByTestId("cabinet-input-platform-deck-thickness").fill("30");
    await page.getByTestId("cabinet-input-platform-deck-overhang-front").fill("30");
    await page.getByTestId("cabinet-input-platform-deck-overhang-back").fill("25");
    await page.getByTestId("cabinet-input-platform-support-ribs").fill("4");
    await page.getByTestId("cabinet-input-platform-support-rib-width").fill("75");
    await page.getByTestId("cabinet-input-platform-support-rib-height").fill("100");
    await expect(page.getByTestId("cabinet-input-platform-support-ribs")).toHaveValue("4");
    await page.getByTestId("cabinet-preset-under_stair_storage").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-stair-scribe-steps")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-stair-scribe-high-height")).toHaveValue("1800");
    await expect(page.getByTestId("cabinet-input-stair-scribe-low-height")).toHaveValue("1500");
    await page.getByTestId("cabinet-input-stair-scribe-steps").fill("4");
    await page.getByTestId("cabinet-input-stair-scribe-high-height").fill("1750");
    await page.getByTestId("cabinet-input-stair-scribe-low-height").fill("1450");
    await page.getByTestId("cabinet-input-stair-scribe-depth").fill("30");
    await page.getByTestId("cabinet-input-stair-scribe-direction").selectOption("rises_right");
    await expect(page.getByTestId("cabinet-input-stair-scribe-direction")).toHaveValue("rises_right");
    await page.getByTestId("cabinet-preset-room_divider_storage").click();
    await expect(page.getByTestId("cabinet-input-room-divider-finished-back")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-room-divider-back-panels")).toHaveValue("2");
    await expect(page.getByTestId("cabinet-input-room-divider-stabilizer-feet")).toHaveValue("2");
    await page.getByTestId("cabinet-input-room-divider-back-panels").fill("3");
    await page.getByTestId("cabinet-input-room-divider-back-panel-thickness").fill("20");
    await page.getByTestId("cabinet-input-room-divider-stabilizer-feet").fill("3");
    await page.getByTestId("cabinet-input-room-divider-stabilizer-foot-width").fill("80");
    await page.getByTestId("cabinet-input-room-divider-stabilizer-foot-height").fill("50");
    await page.getByTestId("cabinet-input-room-divider-stabilizer-foot-depth").fill("340");
    await expect(page.getByTestId("cabinet-input-room-divider-stabilizer-feet")).toHaveValue("3");
    await page.getByTestId("cabinet-preset-mudroom_storage").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-mudroom-hooks")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-mudroom-hook-rail-height")).toHaveValue("1450");
    await expect(page.getByTestId("cabinet-input-mudroom-hook-projection")).toHaveValue("55");
    await expect(page.getByTestId("cabinet-input-shoe-cubbies")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-shoe-cubby-height")).toHaveValue("170");
    await expect(page.getByTestId("cabinet-input-shoe-cubby-depth")).toHaveValue("360");
    await expect(page.getByTestId("cabinet-input-shoe-cubby-divider-thickness")).toHaveValue("18");
    await page.getByTestId("cabinet-input-mudroom-hooks").fill("5");
    await page.getByTestId("cabinet-input-mudroom-hook-rail-height").fill("1500");
    await page.getByTestId("cabinet-input-mudroom-hook-projection").fill("60");
    await page.getByTestId("cabinet-input-shoe-cubbies").fill("5");
    await page.getByTestId("cabinet-input-shoe-cubby-height").fill("180");
    await page.getByTestId("cabinet-input-shoe-cubby-depth").fill("370");
    await page.getByTestId("cabinet-input-shoe-cubby-divider-thickness").fill("20");
    await expect(page.getByTestId("cabinet-input-mudroom-hooks")).toHaveValue("5");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-laundry_room").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-laundry-appliance-bay-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-laundry-appliance-kind")).toHaveValue("washer_dryer");
    await expect(page.getByTestId("cabinet-input-laundry-appliances")).toHaveValue("2");
    await expect(page.getByTestId("cabinet-input-laundry-appliance-width")).toHaveValue("570");
    await expect(page.getByTestId("cabinet-input-laundry-appliance-height")).toHaveValue("850");
    await expect(page.getByTestId("cabinet-input-laundry-appliance-depth")).toHaveValue("560");
    await expect(page.getByTestId("cabinet-input-laundry-appliance-side-clearance")).toHaveValue("20");
    await expect(page.getByTestId("cabinet-input-laundry-appliance-top-clearance")).toHaveValue("40");
    await expect(page.getByTestId("cabinet-input-laundry-appliance-back-clearance")).toHaveValue("40");
    await expect(page.getByTestId("cabinet-input-laundry-utility-chase-height")).toHaveValue("180");
    await expect(page.getByTestId("cabinet-input-laundry-utility-chase-depth")).toHaveValue("80");
    await page.getByTestId("cabinet-input-laundry-appliance-width").fill("560");
    await page.getByTestId("cabinet-input-laundry-appliance-height").fill("840");
    await page.getByTestId("cabinet-input-laundry-appliance-depth").fill("550");
    await page.getByTestId("cabinet-input-laundry-appliance-side-clearance").fill("25");
    await page.getByTestId("cabinet-input-laundry-appliance-top-clearance").fill("45");
    await page.getByTestId("cabinet-input-laundry-appliance-back-clearance").fill("45");
    await page.getByTestId("cabinet-input-laundry-utility-chase-height").fill("200");
    await page.getByTestId("cabinet-input-laundry-utility-chase-depth").fill("90");
    await expect(page.getByTestId("cabinet-input-laundry-appliance-width")).toHaveValue("560");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-home_office_built_in").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-office-worksurface-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-office-worksurface-thickness")).toHaveValue("36");
    await expect(page.getByTestId("cabinet-input-office-worksurface-depth")).toHaveValue("650");
    await expect(page.getByTestId("cabinet-input-office-worksurface-overhang-front")).toHaveValue("100");
    await expect(page.getByTestId("cabinet-input-cable-grommets")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-cable-grommet-diameter")).toHaveValue("80");
    await expect(page.getByTestId("cabinet-input-cable-grommet-offset-from-back")).toHaveValue("110");
    await expect(page.getByTestId("cabinet-input-desk-power-chase-height")).toHaveValue("120");
    await expect(page.getByTestId("cabinet-input-desk-power-chase-depth")).toHaveValue("60");
    await page.getByTestId("cabinet-input-office-worksurface-thickness").fill("38");
    await page.getByTestId("cabinet-input-office-worksurface-depth").fill("660");
    await page.getByTestId("cabinet-input-office-worksurface-overhang-front").fill("110");
    await page.getByTestId("cabinet-input-cable-grommets").fill("2");
    await page.getByTestId("cabinet-input-cable-grommet-diameter").fill("90");
    await page.getByTestId("cabinet-input-cable-grommet-offset-from-back").fill("120");
    await page.getByTestId("cabinet-input-desk-power-chase-height").fill("130");
    await page.getByTestId("cabinet-input-desk-power-chase-depth").fill("70");
    await expect(page.getByTestId("cabinet-input-office-worksurface-thickness")).toHaveValue("38");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-media_wall").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-media-wall-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-media-tv-opening-width")).toHaveValue("1400");
    await expect(page.getByTestId("cabinet-input-media-tv-opening-height")).toHaveValue("850");
    await expect(page.getByTestId("cabinet-input-media-tv-mount-height")).toHaveValue("1200");
    await expect(page.getByTestId("cabinet-input-media-tv-blocking-thickness")).toHaveValue("18");
    await expect(page.getByTestId("cabinet-input-media-cable-chase-width")).toHaveValue("120");
    await expect(page.getByTestId("cabinet-input-media-cable-chase-height")).toHaveValue("700");
    await expect(page.getByTestId("cabinet-input-media-cable-chase-depth")).toHaveValue("60");
    await expect(page.getByTestId("cabinet-input-media-vent-slots")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-media-vent-slot-width")).toHaveValue("220");
    await expect(page.getByTestId("cabinet-input-media-vent-slot-height")).toHaveValue("24");
    await expect(page.getByTestId("cabinet-input-media-vent-slot-spacing")).toHaveValue("24");
    await page.getByTestId("cabinet-input-media-tv-opening-width").fill("1500");
    await page.getByTestId("cabinet-input-media-tv-opening-height").fill("820");
    await page.getByTestId("cabinet-input-media-tv-mount-height").fill("1250");
    await page.getByTestId("cabinet-input-media-cable-chase-width").fill("140");
    await page.getByTestId("cabinet-input-media-cable-chase-height").fill("680");
    await page.getByTestId("cabinet-input-media-cable-chase-depth").fill("70");
    await page.getByTestId("cabinet-input-media-vent-slots").fill("3");
    await page.getByTestId("cabinet-input-media-vent-slot-width").fill("240");
    await page.getByTestId("cabinet-input-media-vent-slot-height").fill("26");
    await page.getByTestId("cabinet-input-media-vent-slot-spacing").fill("30");
    await expect(page.getByTestId("cabinet-input-media-tv-opening-width")).toHaveValue("1500");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-library_wall").click();
    await page.getByTestId("cabinet-module-1").click();
    await expect(page.getByTestId("cabinet-input-library-ladder-rail-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-library-ladder-rail-height")).toHaveValue("2140");
    await expect(page.getByTestId("cabinet-input-library-ladder-rail-diameter")).toHaveValue("32");
    await expect(page.getByTestId("cabinet-input-library-ladder-rail-projection")).toHaveValue("55");
    await expect(page.getByTestId("cabinet-input-library-ladder-standoffs")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-library-ladder-standoff-diameter")).toHaveValue("28");
    await expect(page.getByTestId("cabinet-input-lighting-channel-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-lighting-channel-count")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-lighting-channel-depth")).toHaveValue("18");
    await expect(page.getByTestId("cabinet-input-lighting-channel-height")).toHaveValue("8");
    await expect(page.getByTestId("cabinet-input-lighting-channel-inset")).toHaveValue("45");
    await expect(page.getByTestId("cabinet-input-shelf-pin-rows-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-shelf-pin-row-pairs")).toHaveValue("2");
    await expect(page.getByTestId("cabinet-input-shelf-pin-holes")).toHaveValue("12");
    await expect(page.getByTestId("cabinet-input-shelf-pin-spacing")).toHaveValue("32");
    await expect(page.getByTestId("cabinet-input-shelf-pin-inset")).toHaveValue("55");
    await expect(page.getByTestId("cabinet-input-shelf-pin-start-height")).toHaveValue("300");
    await page.getByTestId("cabinet-input-library-ladder-rail-height").fill("2160");
    await page.getByTestId("cabinet-input-library-ladder-rail-diameter").fill("34");
    await page.getByTestId("cabinet-input-library-ladder-rail-projection").fill("60");
    await page.getByTestId("cabinet-input-library-ladder-standoffs").fill("4");
    await page.getByTestId("cabinet-input-library-ladder-standoff-diameter").fill("30");
    await page.getByTestId("cabinet-input-lighting-channel-count").fill("4");
    await page.getByTestId("cabinet-input-lighting-channel-depth").fill("20");
    await page.getByTestId("cabinet-input-lighting-channel-height").fill("10");
    await page.getByTestId("cabinet-input-lighting-channel-inset").fill("50");
    await page.getByTestId("cabinet-input-shelf-pin-row-pairs").fill("2");
    await page.getByTestId("cabinet-input-shelf-pin-holes").fill("10");
    await page.getByTestId("cabinet-input-shelf-pin-spacing").fill("40");
    await page.getByTestId("cabinet-input-shelf-pin-inset").fill("60");
    await page.getByTestId("cabinet-input-shelf-pin-start-height").fill("320");
    await expect(page.getByTestId("cabinet-input-library-ladder-standoffs")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-lighting-channel-count")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-shelf-pin-spacing")).toHaveValue("40");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
  });

  test("Pro designer can configure lifestyle, hospitality, and seating controls", async ({
    page,
  }) => {
    await openDetailedProStudio(page);
    await page.getByTestId("cabinet-preset-pet_built_in").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-lifestyle-insert-kind")).toHaveValue("pet_bed");
    await expect(page.getByTestId("cabinet-input-lifestyle-insert-count")).toHaveValue("1");
    await page.getByTestId("cabinet-input-lifestyle-insert-depth").fill("430");
    await page.getByTestId("cabinet-input-lifestyle-insert-deck-height").fill("30");
    await page.getByTestId("cabinet-input-lifestyle-insert-lip-height").fill("90");
    await expect(page.getByTestId("cabinet-input-lifestyle-insert-depth")).toHaveValue("430");
    await page.getByTestId("cabinet-preset-kids_storage").click();
    await expect(page.getByTestId("cabinet-input-lifestyle-insert-kind")).toHaveValue("toy_bin");
    await page.getByTestId("cabinet-input-lifestyle-insert-count").fill("3");
    await expect(page.getByTestId("cabinet-input-lifestyle-insert-count")).toHaveValue("3");
    await page.getByTestId("cabinet-preset-hobby_storage").click();
    await page.getByTestId("cabinet-module-3").click();
    await expect(page.getByTestId("cabinet-input-lifestyle-insert-kind")).toHaveValue("hobby_tray");
    await page.getByTestId("cabinet-input-lifestyle-insert-lip-height").fill("75");
    await expect(page.getByTestId("cabinet-input-lifestyle-insert-lip-height")).toHaveValue("75");
    await page.getByTestId("cabinet-preset-wine_storage").click();
    await page.getByTestId("cabinet-module-2").click();
    await expect(page.getByTestId("cabinet-input-wine-rack-columns")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-wine-rack-rows")).toHaveValue("6");
    await expect(page.getByTestId("cabinet-input-wine-rack-depth")).toHaveValue("420");
    await expect(page.getByTestId("cabinet-input-wine-rack-divider-thickness")).toHaveValue("18");
    await page.getByTestId("cabinet-input-wine-rack-columns").fill("4");
    await page.getByTestId("cabinet-input-wine-rack-rows").fill("5");
    await page.getByTestId("cabinet-input-wine-rack-depth").fill("410");
    await page.getByTestId("cabinet-input-wine-rack-divider-thickness").fill("20");
    await expect(page.getByTestId("cabinet-input-wine-rack-columns")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-home_bar").click();
    await page.getByTestId("cabinet-module-1").click();
    await expect(page.getByTestId("cabinet-input-stemware-rack-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-stemware-rack-lanes")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-stemware-rack-depth")).toHaveValue("360");
    await expect(page.getByTestId("cabinet-input-stemware-rack-rail-width")).toHaveValue("14");
    await expect(page.getByTestId("cabinet-input-stemware-rack-lane-spacing")).toHaveValue("70");
    await expect(page.getByTestId("cabinet-input-stemware-rack-mount-height")).toHaveValue("1760");
    await page.getByTestId("cabinet-input-stemware-rack-lanes").fill("4");
    await page.getByTestId("cabinet-input-stemware-rack-depth").fill("340");
    await page.getByTestId("cabinet-input-stemware-rack-rail-width").fill("16");
    await page.getByTestId("cabinet-input-stemware-rack-lane-spacing").fill("75");
    await page.getByTestId("cabinet-input-stemware-rack-mount-height").fill("1740");
    await expect(page.getByTestId("cabinet-input-stemware-rack-lanes")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-module-3").click();
    await expect(page.getByTestId("cabinet-input-wine-rack-columns")).toHaveValue("2");
    await expect(page.getByTestId("cabinet-input-wine-rack-rows")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-wine-rack-depth")).toHaveValue("460");
    await page.getByTestId("cabinet-preset-kitchen_island").click();
    await page.getByRole("button", { name: /Advanced/i }).click();
    await expect(page.getByTestId("cabinet-input-countertop-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-countertop-thickness")).toHaveValue("38");
    await expect(page.getByTestId("cabinet-input-countertop-overhang-back")).toHaveValue("320");
    await expect(page.getByTestId("cabinet-input-island-seating-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-island-seating-overhang-depth")).toHaveValue("320");
    await expect(page.getByTestId("cabinet-input-island-support-panels")).toHaveValue("3");
    await expect(page.getByTestId("cabinet-input-island-support-panel-thickness")).toHaveValue("36");
    await expect(page.getByTestId("cabinet-input-island-support-panel-depth")).toHaveValue("260");
    await expect(page.getByTestId("cabinet-input-island-support-panel-end-inset")).toHaveValue("180");
    await page.getByTestId("cabinet-input-island-seating-overhang-depth").fill("330");
    await page.getByTestId("cabinet-input-island-support-panels").fill("4");
    await page.getByTestId("cabinet-input-island-support-panel-thickness").fill("40");
    await page.getByTestId("cabinet-input-island-support-panel-depth").fill("250");
    await page.getByTestId("cabinet-input-island-support-panel-end-inset").fill("190");
    await expect(page.getByTestId("cabinet-input-island-support-panels")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByRole("button", { name: /Advanced/i }).click();
    await page.getByTestId("cabinet-preset-pantry_system").click();
    await page.getByTestId("cabinet-module-1").click();
    await expect(page.getByTestId("cabinet-input-pantry-pullouts-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-pantry-pullout-trays")).toHaveValue("4");
    await expect(page.getByTestId("cabinet-input-pantry-pullout-tray-depth")).toHaveValue("520");
    await expect(page.getByTestId("cabinet-input-pantry-pullout-front-height")).toHaveValue("70");
    await expect(page.getByTestId("cabinet-input-pantry-pullout-slide-clearance")).toHaveValue("35");
    await page.getByTestId("cabinet-input-pantry-pullout-trays").fill("5");
    await page.getByTestId("cabinet-input-pantry-pullout-tray-depth").fill("500");
    await page.getByTestId("cabinet-input-pantry-pullout-front-height").fill("80");
    await page.getByTestId("cabinet-input-pantry-pullout-slide-clearance").fill("40");
    await expect(page.getByTestId("cabinet-input-pantry-pullout-trays")).toHaveValue("5");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-window_seat").click();
    await expect(page.getByTestId("cabinet-input-seat-deck-thickness")).toHaveValue("24");
    await expect(page.getByTestId("cabinet-input-seat-cushion-thickness")).toHaveValue("75");
    await expect(page.getByTestId("cabinet-input-seat-cushion-depth")).toHaveValue("540");
    await expect(page.getByTestId("cabinet-input-seat-cushion-overhang-front")).toHaveValue("20");
    await page.getByTestId("cabinet-input-seat-cushion-thickness").fill("80");
    await page.getByTestId("cabinet-input-seat-cushion-depth").fill("550");
    await expect(page.getByTestId("cabinet-input-seat-cushion-thickness")).toHaveValue("80");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByTestId("cabinet-preset-banquette").click();
    await expect(page.getByTestId("cabinet-input-seat-back-height")).toHaveValue("420");
    await expect(page.getByTestId("cabinet-input-seat-back-thickness")).toHaveValue("24");
    await page.getByTestId("cabinet-input-seat-back-height").fill("440");
    await page.getByTestId("cabinet-input-seat-back-thickness").fill("26");
    await expect(page.getByTestId("cabinet-input-seat-back-height")).toHaveValue("440");
    await page.getByTestId("cabinet-preset-wardrobe").click();
    await page.getByTestId("cabinet-input-hanging-rods").fill("1");
    await page.getByTestId("cabinet-input-hanging-rod-height").fill("1500");
    await page.getByTestId("cabinet-input-hanging-rod-spacing").fill("800");
    await expect(page.getByTestId("cabinet-input-hanging-rods")).toHaveValue("1");
    await expect(page.getByTestId("cabinet-input-hamper-pullout-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-hamper-baskets")).toHaveValue("2");
    await expect(page.getByTestId("cabinet-input-hamper-basket-depth")).toHaveValue("520");
    await expect(page.getByTestId("cabinet-input-hamper-basket-height")).toHaveValue("360");
    await expect(page.getByTestId("cabinet-input-hamper-slide-clearance")).toHaveValue("35");
    await page.getByTestId("cabinet-input-hamper-baskets").fill("1");
    await page.getByTestId("cabinet-input-hamper-basket-depth").fill("500");
    await page.getByTestId("cabinet-input-hamper-basket-height").fill("340");
    await page.getByTestId("cabinet-input-hamper-slide-clearance").fill("40");
    await expect(page.getByTestId("cabinet-input-hamper-baskets")).toHaveValue("1");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-warning-count", /[1-9]\d*/);
  });

  test("Pro designer can configure detailed base-cabinet construction options", async ({
    page,
  }) => {
    await openDetailedProStudio(page);
    await page.getByTestId("cabinet-preset-base").click();
    await expect(page.getByTestId("cabinet-input-module-type")).toHaveValue("base");
    await page.getByTestId("cabinet-input-module-type").selectOption("wall");
    await expect(page.getByTestId("cabinet-input-module-type")).toHaveValue("wall");
    await page.getByTestId("cabinet-input-module-type").selectOption("base");
    await page.getByTestId("cabinet-input-dividers").fill("2");
    await expect(page.getByTestId("cabinet-input-dividers")).toHaveValue("2");
    await page.getByTestId("cabinet-input-front-type").selectOption("single_door");
    await page.getByTestId("cabinet-door-layout-manual").click();
    await page.getByTestId("cabinet-input-doors").fill("1");
    await page.getByTestId("cabinet-input-hinge-side").selectOption("right");
    await expect(page.getByTestId("cabinet-input-hinge-side")).toHaveValue("right");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await page.getByRole("button", { name: /Advanced/i }).click();
    await page.getByTestId("cabinet-input-toe-kick-setback").fill("75");
    const toeKickDepth = page.getByTestId("cabinet-input-toe-kick-depth");
    await toeKickDepth.focus();
    await toeKickDepth.press("ControlOrMeta+A");
    await toeKickDepth.pressSequentially("360");
    await toeKickDepth.press("Enter");
    await expect(page.getByTestId("cabinet-input-toe-kick-setback")).toHaveValue("75");
    await expect(page.getByTestId("cabinet-input-toe-kick-depth")).toHaveValue("360");
    await page.getByTestId("cabinet-input-leveling-feet-enabled").check();
    await page.getByTestId("cabinet-input-leveling-foot-count").fill("4");
    await page.getByTestId("cabinet-input-leveling-foot-height").fill("90");
    await page.getByTestId("cabinet-input-leveling-foot-diameter").fill("35");
    await page.getByTestId("cabinet-input-leveling-foot-side-inset").fill("80");
    await page.getByTestId("cabinet-input-leveling-foot-front-back-inset").fill("70");
    await expect(page.getByTestId("cabinet-input-leveling-feet-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-leveling-foot-height")).toHaveValue("90");
    await page.getByTestId("cabinet-input-face-frame-enabled").check();
    await page.getByTestId("cabinet-input-face-frame-stile-width").fill("42");
    await page.getByTestId("cabinet-input-face-frame-rail-height").fill("50");
    await page.getByTestId("cabinet-input-face-frame-depth").fill("20");
    await page.getByTestId("cabinet-input-face-frame-material").selectOption("walnut_veneer");
    await expect(page.getByTestId("cabinet-input-face-frame-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-face-frame-stile-width")).toHaveValue("42");
    await page.getByTestId("cabinet-input-left-filler").fill("50");
    await page.getByTestId("cabinet-input-right-filler").fill("75");
    await expect(page.getByTestId("cabinet-parameter-source-leftFillerWidth")).toContainText("User Overridden");
    await page.getByTestId("cabinet-reset-parameter-leftFillerWidth").click();
    await expect(page.getByTestId("cabinet-parameter-source-leftFillerWidth")).toContainText("Automatic");
    await page.getByTestId("cabinet-input-left-filler-scribe-allowance").fill("12");
    await page.getByTestId("cabinet-input-right-filler-scribe-allowance").fill("18");
    await expect(page.getByTestId("cabinet-input-left-filler-scribe-allowance")).toHaveValue("12");
    await expect(page.getByTestId("cabinet-input-right-filler-scribe-allowance")).toHaveValue("18");
    await page.getByTestId("cabinet-input-left-end-panel").check();
    await page.getByTestId("cabinet-input-right-end-panel").check();
    await page.getByTestId("cabinet-input-left-end-panel-thickness").fill("24");
    await page.getByTestId("cabinet-input-right-end-panel-thickness").fill("30");
    await expect(page.getByTestId("cabinet-input-left-end-panel-thickness")).toHaveValue("24");
    await expect(page.getByTestId("cabinet-input-right-end-panel-thickness")).toHaveValue("30");
    await page.getByTestId("cabinet-input-countertop-enabled").check();
    await page.getByTestId("cabinet-input-countertop-thickness").fill("40");
    await page.getByTestId("cabinet-input-countertop-overhang-left").fill("30");
    await page.getByTestId("cabinet-input-countertop-overhang-right").fill("30");
    await page.getByTestId("cabinet-input-countertop-overhang-front").fill("35");
    await page.getByTestId("cabinet-input-countertop-overhang-back").fill("5");
    await page.getByTestId("cabinet-input-countertop-material").selectOption("walnut_veneer");
    await page.getByTestId("cabinet-input-backsplash-enabled").check();
    await page.getByTestId("cabinet-input-backsplash-height").fill("120");
    await page.getByTestId("cabinet-input-backsplash-thickness").fill("16");
    await page.getByTestId("cabinet-input-backsplash-material").selectOption("painted_shaker_white");
    await expect(page.getByTestId("cabinet-input-backsplash-enabled")).toBeChecked();
    await expect(page.getByTestId("cabinet-input-backsplash-height")).toHaveValue("120");
    await expect(page.getByTestId("cabinet-input-backsplash-thickness")).toHaveValue("16");
    await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    await expect(page.getByTestId("cabinet-bom")).toHaveAttribute("data-bom-count", /\d+/);
  });

  test("Pro designer can export a cabinet-run fabrication package", async ({ page }) => {
    await openDetailedProStudio(page);
    await page.getByTestId("cabinet-preset-cabinet_run").click();
    await expect(page.getByTestId("cabinet-module-3")).toBeVisible();
    await expect(page.getByTestId("cabinet-module-move-left")).toBeDisabled();
    await page.getByTestId("cabinet-module-3").click();
    await expect(page.getByTestId("cabinet-module-move-right")).toBeDisabled();
    await page.getByTestId("cabinet-module-move-left").click();
    await expect(page.getByTestId("cabinet-module-2")).toHaveAttribute("data-module-id", "module-3");
    await expect(page.getByTestId("cabinet-bom")).toHaveAttribute("data-bom-count", /\d+/);
    await expect(page.getByTestId("cabinet-assembly-profile")).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
    await expect(page.getByTestId("cabinet-assembly-profile")).toHaveAttribute("data-assembly-profile-label", "Cabinet run");
    await expect(page.getByTestId("cabinet-assembly-profile")).toHaveAttribute("data-assembly-profile-phase", "mvp");
    await expect(page.getByTestId("cabinet-assembly-profile")).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
    await expect(page.getByTestId("cabinet-assembly-profile")).toHaveAttribute("data-assembly-profile-complexity", "moderate");
    await expect(page.getByTestId("cabinet-quote-summary")).toHaveAttribute("data-quote-total", /\d+/);
    await expect(page.getByTestId("cabinet-quote-summary")).toHaveAttribute("data-quote-line-count", /\d+/);
    await expect(page.getByTestId("cabinet-supplier-readiness")).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
    await expect(page.getByTestId("cabinet-supplier-readiness")).toHaveAttribute("data-supplier-sku-mapping-count", "10");
    await expect(page.getByTestId("cabinet-supplier-readiness")).toHaveAttribute("data-mapped-sku-count", "7");
    await expect(page.getByTestId("cabinet-supplier-readiness")).toHaveAttribute("data-missing-sku-count", "0");
    await expect(page.getByTestId("cabinet-supplier-readiness")).toHaveAttribute("data-custom-quote-required-count", "3");
    await expect(page.getByTestId("cabinet-supplier-sku-row")).toHaveCount(10);
    await expect(page.getByTestId("cabinet-fabrication-release-readiness")).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(page.getByTestId("cabinet-fabrication-release-readiness")).toHaveAttribute("data-fabrication-release-required-count", "7");
    await expect(page.getByTestId("cabinet-fabrication-release-readiness")).toHaveAttribute("data-fabrication-release-blocker-count", "0");
    await expect(page.getByTestId("cabinet-fabrication-release-readiness")).toHaveAttribute("data-fabrication-release-gate-count", "5");
    await expect(page.getByTestId("cabinet-fabrication-release-readiness")).toHaveAttribute("data-installation-gate-count", "1");
    await expect(page.getByTestId("cabinet-dimension-schedule")).toHaveAttribute("data-dimension-schedule-count", "4");
    await expect(page.getByTestId("cabinet-drawing-view-schedule")).toHaveAttribute("data-drawing-view-schedule-count", "9");
    await expect(page.getByTestId("cabinet-material-schedule")).toHaveAttribute("data-material-schedule-count", "4");
    await expect(page.getByTestId("cabinet-hardware-schedule")).toHaveAttribute("data-hardware-schedule-count", "3");
    await expect(page.getByTestId("cabinet-edge-banding-schedule")).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(page.getByTestId("cabinet-edge-banding-schedule")).toHaveAttribute("data-edge-banding-total-m", "28.23");
    await expect(page.getByTestId("cabinet-edge-banding-row")).toHaveCount(4);
    await expect(page.getByTestId("cabinet-cut-list")).toHaveAttribute("data-cut-list-count", "30");
    await expect(page.getByTestId("cabinet-installer-notes")).toHaveAttribute("data-installer-note-count", /\d+/);
    await expect(page.getByTestId("cabinet-release-checklist")).toHaveAttribute("data-release-checklist-count", "7");
    await expect(page.getByTestId("cabinet-release-checklist")).toHaveAttribute("data-release-blocker-count", "0");

    await page.getByTestId("cabinet-output-tab-outputs").click();
    const sourceDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("cabinet-download-source-definition").click();
    const sourceDownload = await sourceDownloadPromise;
    const sourceDownloadPath = await sourceDownload.path();
    expect(sourceDownloadPath).toBeTruthy();
    expect(sourceDownload.suggestedFilename()).toMatch(/source-definition\.json$/);
    const sourceJson = JSON.parse(fs.readFileSync(sourceDownloadPath!, "utf8"));
    expect(sourceJson.schema).toBe("custom_millwork.source_definition.v1");
    expect(sourceJson.sourceType).toBe("cabinet_definition");
    expect(sourceJson.cabinetDefinition.modules).toHaveLength(3);
    expect(sourceJson.cabinetDefinition.modules.map((module: { id: string }) => module.id)).toEqual([
      "module-1",
      "module-3",
      "module-2",
    ]);
    expect(sourceJson.millworkDefinition.schema).toBe("custom_millwork.definition.v1");
    expect(sourceJson.millworkDefinition.assemblyProfile.schema).toBe("custom_millwork.assembly_profile.v1");
    expect(sourceJson.millworkDefinition.assemblyProfile.assemblyType).toBe("cabinet_run");
    expect(sourceJson.millworkDefinition.assemblyProfile.projectPhase).toBe("mvp");
    expect(sourceJson.millworkDefinition.sourceDefinition.id).toBe(sourceJson.cabinetDefinition.id);
    expect(sourceJson.sourceDefinitionFingerprint).toMatch(/^cabdef-v1-/);
    expect(sourceJson.notes.some((note: string) => note.includes("source of truth"))).toBe(true);

    await expect(page.getByTestId("cabinet-import-source-definition")).toBeVisible();
    await page.getByTestId("cabinet-preset-base").click();
    await expect(page.getByTestId("cabinet-module-3")).toHaveCount(0);
    await page.getByTestId("cabinet-import-source-definition-input").setInputFiles(sourceDownloadPath!);
    await expect(page.getByTestId("cabinet-action-success")).toContainText(/Source definition imported/i);
    await expect(page.getByTestId("cabinet-module-3")).toBeVisible();
    await expect(page.getByTestId("cabinet-dimension-schedule")).toHaveAttribute("data-dimension-schedule-count", "4");
    await expect(page.getByTestId("cabinet-edge-banding-schedule")).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(page.getByTestId("cabinet-cut-list")).toHaveAttribute("data-cut-list-count", "30");

    const docsDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("cabinet-download-documentation").click();
    const docsDownload = await docsDownloadPromise;
    const docsDownloadPath = await docsDownload.path();
    expect(docsDownloadPath).toBeTruthy();
    expect(docsDownload.suggestedFilename()).toMatch(/documentation\.csv$/);
    const docsText = fs.readFileSync(docsDownloadPath!, "utf8");
    expect(docsText).toContain("Custom Millwork Documentation");
    expect(docsText).toContain("Assembly Profile");
    expect(docsText).toContain("Cabinet run");
    expect(docsText).toContain("Preliminary Quote Summary");
    expect(docsText).toContain("Quote Line Items");
    expect(docsText).toContain("Edge Banding Schedule");
    expect(docsText).toContain("Dimension Schedule");
    expect(docsText).toContain("Drawing Views");
    expect(docsText).toContain("BOM");
    expect(docsText).toContain("Material Schedule");
    expect(docsText).toContain("Hardware Schedule");
    expect(docsText).toContain("Supplier Readiness");
    expect(docsText).toContain("Supplier SKU Mappings");
    expect(docsText).toContain("Cut List");
    expect(docsText).toContain("Installer Notes");
    expect(docsText).toContain("Release Checklist");

    const shopDrawingDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("cabinet-download-shop-drawing-svg").click();
    const shopDrawingDownload = await shopDrawingDownloadPromise;
    const shopDrawingDownloadPath = await shopDrawingDownload.path();
    expect(shopDrawingDownloadPath).toBeTruthy();
    expect(shopDrawingDownload.suggestedFilename()).toMatch(/shop-drawing\.svg$/);
    const shopDrawingSvg = fs.readFileSync(shopDrawingDownloadPath!, "utf8");
    expect(shopDrawingSvg).toContain("<svg");
    expect(shopDrawingSvg).toContain("A-601 Overall Front Elevation");
    expect(shopDrawingSvg).toContain("A-602 Typical Side Section");
    expect(shopDrawingSvg).toContain("A-603 Plan Footprint");

    const dxfDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("cabinet-download-fabrication-dxf").click();
    const dxfDownload = await dxfDownloadPromise;
    const dxfDownloadPath = await dxfDownload.path();
    expect(dxfDownloadPath).toBeTruthy();
    expect(dxfDownload.suggestedFilename()).toMatch(/cut-layout\.dxf$/);
    const dxfText = fs.readFileSync(dxfDownloadPath!, "utf8");
    expect(dxfText).toContain("$INSUNITS");
    expect(dxfText).toContain("SECTION\n2\nENTITIES");
    expect(dxfText).toContain("CUT");
    expect(dxfText).toContain("module-1:left_side_panel:0");

    const rfqDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("cabinet-download-fabrication-rfq").click();
    const rfqDownload = await rfqDownloadPromise;
    const rfqDownloadPath = await rfqDownload.path();
    expect(rfqDownloadPath).toBeTruthy();
    expect(rfqDownload.suggestedFilename()).toMatch(/rfq\.json$/);
    const rfqJson = JSON.parse(fs.readFileSync(rfqDownloadPath!, "utf8"));
    expect(rfqJson.schema).toBe("custom_millwork.rfq.v1");
    expect(rfqJson.sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(rfqJson.readiness.status).toBe("ready_for_fabricator_review");
    expect(rfqJson.readiness.mappedSkuCount).toBeGreaterThan(0);
    expect(rfqJson.readiness.customQuoteRequiredCount).toBeGreaterThan(0);
    expect(rfqJson.readiness.releaseChecklistCount).toBe(7);
    expect(rfqJson.readiness.releaseBlockerCount).toBe(0);
    expect(rfqJson.supplierSkuMappings.some((item: { sourceType: string; status: string }) => item.sourceType === "material" && item.status === "mapped")).toBe(true);
    expect(rfqJson.supplierSkuMappings.some((item: { sourceType: string; status: string }) => item.sourceType === "fabrication_service" && item.status === "custom_quote_required")).toBe(true);
    expect(rfqJson.artifacts.some((item: { type: string; fileName: string }) => item.type === "source_definition" && item.fileName.endsWith("source-definition.json"))).toBe(true);
    expect(rfqJson.artifacts.some((item: { type: string; fileName: string }) => item.type === "fabrication_dxf" && item.fileName.endsWith("cut-layout.dxf"))).toBe(true);
    expect(rfqJson.artifacts.some((item: { type: string; fileName: string }) => item.type === "shop_drawing_svg" && item.fileName.endsWith("shop-drawing.svg"))).toBe(true);
    expect(rfqJson.documentation.cutList).toHaveLength(30);
    expect(rfqJson.documentation.edgeBandingSchedule).toHaveLength(4);
    expect(rfqJson.documentation.releaseChecklist).toHaveLength(7);

    const packageDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("cabinet-download-package-json").click();
    const packageDownload = await packageDownloadPromise;
    const packageDownloadPath = await packageDownload.path();
    expect(packageDownloadPath).toBeTruthy();
    expect(packageDownload.suggestedFilename()).toMatch(/package\.json$/);
    const packageJson = JSON.parse(fs.readFileSync(packageDownloadPath!, "utf8"));
    expect(packageJson.schema).toBe("custom_millwork.package.v1");
    expect(packageJson.sourceType).toBe("cabinet_definition");
    expect(packageJson.sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(packageJson.cabinetDefinition.modules).toHaveLength(3);
    expect(packageJson.millworkDefinition.schema).toBe("custom_millwork.definition.v1");
    expect(packageJson.millworkDefinition.assemblyProfile.assemblyType).toBe("cabinet_run");
    expect(packageJson.millworkDefinition.sourceDefinition.id).toBe(packageJson.cabinetDefinition.id);
    expect(packageJson.documentation.assemblyProfile.schema).toBe("custom_millwork.assembly_profile.v1");
    expect(packageJson.documentation.assemblyProfile.placementKind).toBe("built_in_wall");
    expect(packageJson.documentation.drawingViewSchedule).toHaveLength(9);
    expect(packageJson.documentation.drawingViewSchedule.some((item: { viewType: string }) => item.viewType === "front_elevation")).toBe(true);
    expect(packageJson.documentation.drawingViewSchedule.some((item: { viewType: string }) => item.viewType === "side_section")).toBe(true);
    expect(packageJson.documentation.drawingViewSchedule.some((item: { viewType: string }) => item.viewType === "plan_footprint")).toBe(true);
    expect(packageJson.documentation.edgeBandingSchedule).toHaveLength(4);
    expect(packageJson.documentation.edgeBandingSchedule.reduce((sum: number, item: { totalLengthM: number }) => sum + item.totalLengthM, 0)).toBeCloseTo(28.23, 2);
    expect(packageJson.documentation.supplierSkuMappings).toHaveLength(10);
    expect(packageJson.documentation.supplierReadiness.status).toBe("ready_for_fabricator_review");
    expect(packageJson.documentation.supplierReadiness.mappedSkuCount).toBe(7);
    expect(packageJson.documentation.supplierReadiness.customQuoteRequiredCount).toBe(3);
    expect(packageJson.documentation.fabricationReleaseReadiness.status).toBe("needs_review");
    expect(packageJson.documentation.fabricationReleaseReadiness.requiredGateCount).toBe(7);
    expect(packageJson.quoteRequest.schema).toBe("custom_millwork.rfq.v1");
    expect(packageJson.quoteRequest.artifacts.some((item: { type: string }) => item.type === "source_definition")).toBe(true);
    expect(packageJson.quoteRequest.artifacts.some((item: { type: string }) => item.type === "fabrication_dxf")).toBe(true);
    expect(packageJson.quoteRequest.artifacts.some((item: { type: string }) => item.type === "shop_drawing_svg")).toBe(true);
    expect(packageJson.quoteRequest.documentation.releaseChecklist).toHaveLength(7);
    expect(packageJson.documentation.quoteSummary.estimatedTotal).toBeGreaterThan(0);

    const downloadPromise = page.waitForEvent("download");
    await page.getByTestId("cabinet-download-glb").click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();
    const bytes = fs.readFileSync(downloadPath!);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(bytes.subarray(0, 4).toString("utf8")).toBe("glTF");
  });

  test("Pro designer can place a cabinet run with complete project metadata", async ({
    page,
  }) => {
    const { placedCabinet, beforePosition, beforeRotation } = await placeCabinetRun(page);

    await expect(placedCabinet).toHaveAttribute("data-family", "cabinetry");
    await expect(placedCabinet).toHaveAttribute("data-assembly-type", "cabinet_run");
    await expect(placedCabinet).toHaveAttribute("data-definition-schema", "custom_millwork.definition.v1");
    await expect(placedCabinet).toHaveAttribute("data-source-type", "cabinet_definition");
    await expect(placedCabinet).toHaveAttribute("data-source-definition-id", /cabinet-/);
    await expect(placedCabinet).toHaveAttribute("data-definition-version", "1");
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-version", "1");
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-source-definition-version", "1");
    await expect(placedCabinet).toHaveAttribute("data-generated-output-kind", "glb");
    await expect(placedCabinet).toHaveAttribute("data-generated-output-durable", "false");
    await expect(placedCabinet).toHaveAttribute("data-material-count", /\d+/);
    await expect(placedCabinet).toHaveAttribute("data-hardware-count", /\d+/);
    await expect(placedCabinet).toHaveAttribute("data-module-count", "3");
    await expect(placedCabinet).toHaveAttribute("data-material-schedule-count", "4");
    await expect(placedCabinet).toHaveAttribute("data-hardware-schedule-count", "3");
    await expect(placedCabinet).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(placedCabinet).toHaveAttribute("data-edge-banding-total-m", "28.23");
    await expect(placedCabinet).toHaveAttribute("data-cut-list-count", "30");
    await expect(placedCabinet).toHaveAttribute("data-dimension-schedule-count", "4");
    await expect(placedCabinet).toHaveAttribute("data-drawing-view-schedule-count", "9");
    await expect(placedCabinet).toHaveAttribute("data-installer-note-count", /\d+/);
    await expect(placedCabinet).toHaveAttribute("data-release-checklist-count", "7");
    await expect(placedCabinet).toHaveAttribute("data-release-blocker-count", "0");
    await expect(placedCabinet).toHaveAttribute("data-quote-total", /\d+/);
    await expect(placedCabinet).toHaveAttribute("data-quote-line-count", /\d+/);
    await expect(placedCabinet).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
    await expect(placedCabinet).toHaveAttribute("data-supplier-sku-mapping-count", "10");
    await expect(placedCabinet).toHaveAttribute("data-mapped-sku-count", "7");
    await expect(placedCabinet).toHaveAttribute("data-missing-sku-count", "0");
    await expect(placedCabinet).toHaveAttribute("data-custom-quote-required-count", "3");
    await expect(placedCabinet).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(placedCabinet).toHaveAttribute("data-fabrication-release-required-count", "7");
    await expect(placedCabinet).toHaveAttribute("data-fabrication-release-blocker-count", "0");
    await expect(placedCabinet).toHaveAttribute("data-transform-position", beforePosition!);
    await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation!);
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", beforePosition!);
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", beforeRotation!);
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-label", "Cabinet run");
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-phase", "mvp");
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-complexity", "moderate");
    const projectSchedule = page.getByTestId("project-millwork-schedule");
    await expect(projectSchedule).toHaveAttribute("data-schema", "custom_millwork.project_schedule.v1");
    await expect(projectSchedule).toHaveAttribute("data-source-type", "placed_parametric_cabinet_project");
    await expect(projectSchedule).toHaveAttribute("data-room-count", "1");
    await expect(projectSchedule).toHaveAttribute("data-asset-count", "1");
    await expect(projectSchedule).toHaveAttribute("data-module-count", "3");
    await expect(projectSchedule).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(projectSchedule).toHaveAttribute("data-edge-banding-total-m", "28.23");
    await expect(projectSchedule).toHaveAttribute("data-cut-list-count", "30");
    const projectReadiness = page.getByTestId("project-millwork-readiness");
    await expect(projectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
    await expect(projectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
    await expect(projectReadiness).toHaveAttribute("data-asset-count", "1");
    await expect(projectReadiness).toHaveAttribute("data-package-count", "15");
    await expect(projectReadiness).toHaveAttribute("data-scope-schema", "custom_millwork.project_scope.v1");
    await expect(projectReadiness).toHaveAttribute("data-scope-family-count", "1");
    await expect(projectReadiness).toHaveAttribute("data-scope-assembly-type-count", "1");
    await expect(projectReadiness).toHaveAttribute("data-scope-phase-represented-count", "3");
    await expect(projectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
    await expect(projectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
    await expect(projectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(projectReadiness).toHaveAttribute("data-field-verification-status", "field_verification_required");
    await expect(projectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
    await expect(projectReadiness).toHaveAttribute("data-approval-status", "needs_review");
    await expect(projectReadiness).toHaveAttribute("data-release-blocker-count", "0");
    await expect(projectReadiness).toHaveAttribute("data-required-approval-count", "7");
    await expect(projectReadiness).toHaveAttribute("data-custom-quote-required-count", "3");
    await expect(projectReadiness).toHaveAttribute("data-can-issue-client", "true");
    await expect(projectReadiness).toHaveAttribute("data-can-issue-fabricator", "true");
    await expect(projectReadiness).toHaveAttribute("data-can-issue-installer", "true");
    await expect(projectReadiness).toHaveAttribute("data-can-issue-purchase-review", "true");

    await dismissBlockingPrompt(page);
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-bom-count", /\d+/);
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-material-schedule-count", "4");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-hardware-schedule-count", "3");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-total-m", "28.23");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-cut-list-count", "30");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-dimension-schedule-count", "4");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-drawing-view-schedule-count", "9");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-release-checklist-count", "7");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-release-blocker-count", "0");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-supplier-sku-mapping-count", "10");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-required-count", "7");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-blocker-count", "0");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-complexity", "moderate");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-asset-manifest-version", "1");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-generated-output-kind", "glb");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-generated-output-durable", "false");
    const selectedProjectReadiness = page.getByTestId("selected-cabinet-project-readiness");
    await expect(selectedProjectReadiness).toBeVisible({ timeout: 15000 });
    await expect(selectedProjectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
    await expect(selectedProjectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
    await expect(selectedProjectReadiness).toHaveAttribute("data-scope-schema", "custom_millwork.project_scope.v1");
    await expect(selectedProjectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
    await expect(selectedProjectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
    await expect(selectedProjectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(selectedProjectReadiness).toHaveAttribute("data-field-verification-status", "field_verification_required");
    await expect(selectedProjectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
    await expect(selectedProjectReadiness).toHaveAttribute("data-approval-status", "needs_review");
    await expect(selectedProjectReadiness).toHaveAttribute("data-can-issue-purchase-review", "true");
    await expect(page.getByTestId("selected-cabinet-material-row")).toHaveCount(4);
    await expect(page.getByTestId("selected-cabinet-hardware-row")).toHaveCount(3);
  });

  test("Pro designer can export placed, installer, and field-finish packages", async ({
    page,
  }) => {
    const { sourceJson, instanceId } = await placeCabinetRun(page);
    const placedPackageDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-placed-package").click();
    const placedPackageDownload = await placedPackageDownloadPromise;
    const placedPackagePath = await placedPackageDownload.path();
    expect(placedPackagePath).toBeTruthy();
    expect(placedPackageDownload.suggestedFilename()).toMatch(/placed-package\.json$/);
    const placedPackageJson = JSON.parse(fs.readFileSync(placedPackagePath!, "utf8"));
    expect(placedPackageJson.schema).toBe("custom_millwork.placed_asset_package.v1");
    expect(placedPackageJson.sourceType).toBe("placed_parametric_cabinet");
    expect(placedPackageJson.sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(placedPackageJson.assetManifest.schema).toBe("custom_millwork.asset_manifest.v1");
    expect(placedPackageJson.assetManifest.assetId).toBe(instanceId);
    expect(placedPackageJson.assetManifest.sourceDefinitionVersion).toBe(1);
    expect(placedPackageJson.assetManifest.generatedOutput.kind).toBe("glb");
    expect(placedPackageJson.assetManifest.generatedOutput.durable).toBe(false);
    expect(placedPackageJson.placedAsset.id).toBe(instanceId);
    expect(placedPackageJson.placedAsset.assetType).toBe("parametric_cabinet");
    expect(placedPackageJson.placedAsset.assetManifest.schema).toBe("custom_millwork.asset_manifest.v1");
    expect(placedPackageJson.placedAsset.roomId).toBeTruthy();
    expect(placedPackageJson.placedAsset.transform.position).toHaveLength(3);
    expect(placedPackageJson.placedAsset.transform.rotation).toHaveLength(3);
    expect(placedPackageJson.placedAsset.glbAssetUrl).toContain("blob:");
    expect(placedPackageJson.cabinetDefinition.id).toBe(placedPackageJson.placedAsset.cabinetDefinition.id);
    expect(placedPackageJson.millworkDefinition.sourceDefinition.id).toBe(placedPackageJson.cabinetDefinition.id);
    expect(placedPackageJson.documentation.supplierSkuMappings).toHaveLength(10);
    expect(placedPackageJson.documentation.edgeBandingSchedule).toHaveLength(4);
    expect(placedPackageJson.documentation.supplierReadiness.status).toBe("ready_for_fabricator_review");
    expect(placedPackageJson.documentation.fabricationReleaseReadiness.status).toBe("needs_review");
    expect(placedPackageJson.documentation.fabricationReleaseReadiness.requiredGateCount).toBe(7);
    expect(placedPackageJson.quoteRequest.schema).toBe("custom_millwork.rfq.v1");
    expect(placedPackageJson.quoteRequest.sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(placedPackageJson.installerWorkOrder.schema).toBe("custom_millwork.installer_work_order.v1");
    expect(placedPackageJson.installerWorkOrder.sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(placedPackageJson.installerWorkOrder.placedAsset.id).toBe(instanceId);
    expect(placedPackageJson.installerWorkOrder.siteTransform.position).toHaveLength(3);
    const installerWorkOrderDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-installer-work-order").click();
    const installerWorkOrderDownload = await installerWorkOrderDownloadPromise;
    const installerWorkOrderPath = await installerWorkOrderDownload.path();
    expect(installerWorkOrderPath).toBeTruthy();
    expect(installerWorkOrderDownload.suggestedFilename()).toMatch(/installer-work-order\.json$/);
    const installerWorkOrderJson = JSON.parse(fs.readFileSync(installerWorkOrderPath!, "utf8"));
    expect(installerWorkOrderJson.schema).toBe("custom_millwork.installer_work_order.v1");
    expect(installerWorkOrderJson.sourceType).toBe("placed_parametric_cabinet");
    expect(installerWorkOrderJson.sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(installerWorkOrderJson.placedAsset.id).toBe(instanceId);
    expect(installerWorkOrderJson.roomName).toBeTruthy();
    expect(installerWorkOrderJson.siteTransform.position).toEqual(placedPackageJson.placedAsset.transform.position);
    expect(installerWorkOrderJson.siteTransform.rotation).toEqual(placedPackageJson.placedAsset.transform.rotation);
    expect(installerWorkOrderJson.installationScope.releaseStatus).toBe("needs_review");
    expect(installerWorkOrderJson.documentation.installerNotes.length).toBeGreaterThan(0);
    expect(installerWorkOrderJson.artifacts.some((item: { type: string }) => item.type === "installer_work_order_json")).toBe(true);
    expect(installerWorkOrderJson.artifacts.some((item: { type: string }) => item.type === "package_json")).toBe(true);
    const projectFieldVerificationDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-field-verification").click();
    const projectFieldVerificationDownload = await projectFieldVerificationDownloadPromise;
    const projectFieldVerificationPath = await projectFieldVerificationDownload.path();
    expect(projectFieldVerificationPath).toBeTruthy();
    expect(projectFieldVerificationDownload.suggestedFilename()).toMatch(/field-verification\.json$/);
    const projectFieldVerificationJson = JSON.parse(fs.readFileSync(projectFieldVerificationPath!, "utf8"));
    expect(projectFieldVerificationJson.schema).toBe("custom_millwork.project_field_verification.v1");
    expect(projectFieldVerificationJson.verificationStatus).toBe("field_verification_required");
    expect(projectFieldVerificationJson.canReleaseWithoutFieldVerification).toBe(false);
    expect(projectFieldVerificationJson.fabricationReleasePackage.schema).toBe("custom_millwork.project_fabrication_release.v1");
    expect(projectFieldVerificationJson.installationPlanPackage.schema).toBe("custom_millwork.project_installation_plan.v1");
    expect(projectFieldVerificationJson.totals.assetCount).toBe(1);
    expect(projectFieldVerificationJson.totals.roomCount).toBe(1);
    expect(projectFieldVerificationJson.totals.requiredCheckCount).toBeGreaterThan(0);
    expect(projectFieldVerificationJson.totals.fieldVerifyNoteCount).toBeGreaterThan(0);
    expect(projectFieldVerificationJson.assets[0].id).toBe(instanceId);
    expect(projectFieldVerificationJson.assets[0].siteTransform.position).toEqual(placedPackageJson.placedAsset.transform.position);
    expect(projectFieldVerificationJson.rooms[0].assetIds).toContain(instanceId);
    expect(projectFieldVerificationJson.checklist.some((item: { scope: string }) => item.scope === "site_measurement")).toBe(true);
    expect(projectFieldVerificationJson.checklist.some((item: { scope: string }) => item.scope === "placement")).toBe(true);
    expect(projectFieldVerificationJson.fieldVerificationPolicy.requiresHumanVerification).toBe(true);
    expect(projectFieldVerificationJson.artifacts.some((item: { type: string }) => item.type === "project_field_verification_json")).toBe(true);
    expect(projectFieldVerificationJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectFieldVerificationJson.artifacts.some((item: { type: string }) => item.type === "project_installation_plan_json")).toBe(true);
    expect(projectFieldVerificationJson.artifacts.some((item: { type: string }) => item.type === "installer_work_order_json")).toBe(true);
    const projectFinishScheduleDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-finish-schedule").click();
    const projectFinishScheduleDownload = await projectFinishScheduleDownloadPromise;
    const projectFinishSchedulePath = await projectFinishScheduleDownload.path();
    expect(projectFinishSchedulePath).toBeTruthy();
    expect(projectFinishScheduleDownload.suggestedFilename()).toMatch(/finish-schedule\.json$/);
    const projectFinishScheduleJson = JSON.parse(fs.readFileSync(projectFinishSchedulePath!, "utf8"));
    expect(projectFinishScheduleJson.schema).toBe("custom_millwork.project_finish_schedule.v1");
    expect(projectFinishScheduleJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectFinishScheduleJson.procurementPackage.schema).toBe("custom_millwork.project_procurement.v1");
    expect(projectFinishScheduleJson.totals.assetCount).toBe(1);
    expect(projectFinishScheduleJson.totals.roomCount).toBe(1);
    expect(projectFinishScheduleJson.totals.materialCount).toBeGreaterThan(0);
    expect(projectFinishScheduleJson.totals.hardwareCount).toBeGreaterThan(0);
    expect(projectFinishScheduleJson.totals.edgeBandingCount).toBe(4);
    expect(projectFinishScheduleJson.totals.edgeBandingTotalM).toBe(28.23);
    expect(projectFinishScheduleJson.totals.mappedSkuCount).toBe(7);
    expect(projectFinishScheduleJson.totals.customQuoteRequiredCount).toBe(3);
    expect(projectFinishScheduleJson.materials.every((item: { assetIds: string[] }) => item.assetIds.includes(instanceId!))).toBe(true);
    expect(projectFinishScheduleJson.hardware.every((item: { assetIds: string[] }) => item.assetIds.includes(instanceId!))).toBe(true);
    expect(projectFinishScheduleJson.edgeBanding.every((item: { assetIds: string[] }) => item.assetIds.includes(instanceId!))).toBe(true);
    expect(projectFinishScheduleJson.materials.some((item: { supplierStatus?: string }) => item.supplierStatus === "mapped")).toBe(true);
    expect(projectFinishScheduleJson.finishReviewPolicy.requiresDesignerApproval).toBe(true);
    expect(projectFinishScheduleJson.finishReviewPolicy.requiresClientApproval).toBe(true);
    expect(projectFinishScheduleJson.finishReviewPolicy.requiresSupplierConfirmation).toBe(true);
    expect(projectFinishScheduleJson.assets[0].id).toBe(instanceId);
    expect(projectFinishScheduleJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectFinishScheduleJson.artifacts.some((item: { type: string }) => item.type === "project_procurement_json")).toBe(true);
    expect(projectFinishScheduleJson.artifacts.some((item: { type: string }) => item.type === "project_rfq_json")).toBe(true);
  });

  test("Pro designer can export project commercial and release-readiness packages", async ({
    page,
  }) => {
    const { sourceJson, instanceId } = await placeCabinetRun(page);
    const projectScheduleDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-schedule").click();
    const projectScheduleDownload = await projectScheduleDownloadPromise;
    const projectSchedulePath = await projectScheduleDownload.path();
    expect(projectSchedulePath).toBeTruthy();
    expect(projectScheduleDownload.suggestedFilename()).toMatch(/millwork-schedule\.json$/);
    const projectScheduleJson = JSON.parse(fs.readFileSync(projectSchedulePath!, "utf8"));
    expect(projectScheduleJson.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectScheduleJson.totals.assetCount).toBe(1);
    expect(projectScheduleJson.totals.roomCount).toBe(1);
    expect(projectScheduleJson.totals.edgeBandingTotalM).toBe(28.23);
    expect(projectScheduleJson.assets[0].id).toBe(instanceId);
    expect(projectScheduleJson.assets[0].sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(projectScheduleJson.assetManifests[0].schema).toBe("custom_millwork.asset_manifest.v1");
    expect(projectScheduleJson.placedAssets[0].cabinetDefinition.id).toBe(projectScheduleJson.assets[0].sourceDefinitionId);
    const projectScheduleCsvDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-schedule-csv").click();
    const projectScheduleCsvDownload = await projectScheduleCsvDownloadPromise;
    const projectScheduleCsvPath = await projectScheduleCsvDownload.path();
    expect(projectScheduleCsvPath).toBeTruthy();
    expect(projectScheduleCsvDownload.suggestedFilename()).toMatch(/millwork-schedule\.csv$/);
    const projectScheduleCsv = fs.readFileSync(projectScheduleCsvPath!, "utf8");
    expect(projectScheduleCsv).toContain("Custom Millwork Project Schedule");
    expect(projectScheduleCsv).toContain("Project Totals");
    expect(projectScheduleCsv).toContain("Rooms");
    expect(projectScheduleCsv).toContain("Placed Millwork Assets");
    expect(projectScheduleCsv).toContain(instanceId!);
    expect(projectScheduleCsv).toContain("28.23");
    const projectScopeDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-scope").click();
    const projectScopeDownload = await projectScopeDownloadPromise;
    const projectScopePath = await projectScopeDownload.path();
    expect(projectScopePath).toBeTruthy();
    expect(projectScopeDownload.suggestedFilename()).toMatch(/scope\.json$/);
    const projectScopeJson = JSON.parse(fs.readFileSync(projectScopePath!, "utf8"));
    expect(projectScopeJson.schema).toBe("custom_millwork.project_scope.v1");
    expect(projectScopeJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectScopeJson.totals.assetCount).toBe(1);
    expect(projectScopeJson.totals.familyCount).toBe(1);
    expect(projectScopeJson.totals.assemblyTypeCount).toBe(1);
    expect(projectScopeJson.totals.sourceDefinitionFingerprintCount).toBe(1);
    expect(projectScopeJson.families.some((item: { family: string; sourceDefinitionFingerprints: string[] }) => item.family === "cabinetry" && item.sourceDefinitionFingerprints.includes(sourceJson.sourceDefinitionFingerprint))).toBe(true);
    expect(projectScopeJson.assemblies.some((item: { assemblyType: string; sourceDefinitionFingerprints: string[] }) => item.assemblyType === "cabinet_run" && item.sourceDefinitionFingerprints.includes(sourceJson.sourceDefinitionFingerprint))).toBe(true);
    expect(projectScopeJson.coverage.some((item: { scopeId: string; status: string }) => item.scopeId === "mvp" && item.status === "partially_represented")).toBe(true);
    expect(projectScopeJson.coverage.some((item: { scopeId: string; status: string }) => item.scopeId === "phase_5" && item.status === "represented")).toBe(true);
    expect(projectScopeJson.coverage.some((item: { scopeId: string; status: string }) => item.scopeId === "phase_6" && item.status === "represented")).toBe(true);
    expect(projectScopeJson.artifacts.some((item: { type: string }) => item.type === "project_scope_json")).toBe(true);
    expect(projectScopeJson.artifacts.some((item: { type: string }) => item.type === "project_schedule_json")).toBe(true);
    expect(projectScopeJson.artifacts.some((item: { type: string }) => item.type === "project_handoff_package_json")).toBe(true);
    expect(projectScopeJson.artifacts.some((item: { type: string }) => item.type === "package_json")).toBe(true);
    const projectProcurementDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-procurement").click();
    const projectProcurementDownload = await projectProcurementDownloadPromise;
    const projectProcurementPath = await projectProcurementDownload.path();
    expect(projectProcurementPath).toBeTruthy();
    expect(projectProcurementDownload.suggestedFilename()).toMatch(/procurement\.json$/);
    const projectProcurementJson = JSON.parse(fs.readFileSync(projectProcurementPath!, "utf8"));
    expect(projectProcurementJson.schema).toBe("custom_millwork.project_procurement.v1");
    expect(projectProcurementJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectProcurementJson.checkoutPolicy.includeInCheckout).toBe(false);
    expect(projectProcurementJson.totals.lineCount).toBe(10);
    expect(projectProcurementJson.totals.mappedSkuCount).toBe(7);
    expect(projectProcurementJson.totals.customQuoteRequiredCount).toBe(3);
    expect(projectProcurementJson.totals.estimatedTotal).toBeGreaterThan(0);
    expect(projectProcurementJson.lineItems.some((item: { sourceType: string; status: string }) => item.sourceType === "material" && item.status === "mapped")).toBe(true);
    expect(projectProcurementJson.lineItems.some((item: { sourceType: string; status: string }) => item.sourceType === "fabrication_service" && item.status === "custom_quote_required")).toBe(true);
    expect(projectProcurementJson.lineItems.every((item: { assetIds: string[] }) => item.assetIds.includes(instanceId!))).toBe(true);
    expect(projectProcurementJson.artifacts.some((item: { type: string }) => item.type === "project_procurement_json")).toBe(true);
    expect(projectProcurementJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    const projectQuoteDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-quote").click();
    const projectQuoteDownload = await projectQuoteDownloadPromise;
    const projectQuotePath = await projectQuoteDownload.path();
    expect(projectQuotePath).toBeTruthy();
    expect(projectQuoteDownload.suggestedFilename()).toMatch(/project-quote\.json$/);
    const projectQuoteJson = JSON.parse(fs.readFileSync(projectQuotePath!, "utf8"));
    expect(projectQuoteJson.schema).toBe("custom_millwork.project_quote.v1");
    expect(projectQuoteJson.quoteStatus).toBe("needs_supplier_quote");
    expect(projectQuoteJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectQuoteJson.procurementPackage.schema).toBe("custom_millwork.project_procurement.v1");
    expect(projectQuoteJson.approvalPackage.schema).toBe("custom_millwork.project_approval_package.v1");
    expect(projectQuoteJson.fabricationReleasePackage.schema).toBe("custom_millwork.project_fabrication_release.v1");
    expect(projectQuoteJson.totals.assetCount).toBe(1);
    expect(projectQuoteJson.totals.estimatedTotal).toBeGreaterThan(0);
    expect(projectQuoteJson.totals.customQuoteRequiredCount).toBe(3);
    expect(projectQuoteJson.categoryTotals.some((item: { category: string }) => item.category === "materials")).toBe(true);
    expect(projectQuoteJson.categoryTotals.some((item: { category: string }) => item.category === "fabrication")).toBe(true);
    expect(projectQuoteJson.categoryTotals.some((item: { category: string }) => item.category === "contingency")).toBe(true);
    expect(projectQuoteJson.assets[0].id).toBe(instanceId);
    expect(projectQuoteJson.rooms[0].assetCount).toBe(1);
    expect(projectQuoteJson.artifacts.some((item: { type: string }) => item.type === "project_quote_package_json")).toBe(true);
    expect(projectQuoteJson.artifacts.some((item: { type: string }) => item.type === "project_procurement_json")).toBe(true);
    expect(projectQuoteJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectQuoteJson.artifacts.some((item: { type: string }) => item.type === "project_drawing_set_json")).toBe(true);
    expect(projectQuoteJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    expect(projectQuoteJson.artifacts.some((item: { type: string }) => item.type === "project_approval_package_json")).toBe(true);
    expect(projectQuoteJson.artifacts.some((item: { type: string }) => item.type === "project_rfq_json")).toBe(true);
    const projectPurchaseReadinessDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-purchase-readiness").click();
    const projectPurchaseReadinessDownload = await projectPurchaseReadinessDownloadPromise;
    const projectPurchaseReadinessPath = await projectPurchaseReadinessDownload.path();
    expect(projectPurchaseReadinessPath).toBeTruthy();
    expect(projectPurchaseReadinessDownload.suggestedFilename()).toMatch(/purchase-readiness\.json$/);
    const projectPurchaseReadinessJson = JSON.parse(fs.readFileSync(projectPurchaseReadinessPath!, "utf8"));
    expect(projectPurchaseReadinessJson.schema).toBe("custom_millwork.project_purchase_readiness.v1");
    expect(projectPurchaseReadinessJson.purchaseReadiness).toBe("needs_quote");
    expect(projectPurchaseReadinessJson.canCreateCheckout).toBe(false);
    expect(projectPurchaseReadinessJson.canIssuePurchaseOrder).toBe(false);
    expect(projectPurchaseReadinessJson.procurementPackage.schema).toBe("custom_millwork.project_procurement.v1");
    expect(projectPurchaseReadinessJson.quotePackage.schema).toBe("custom_millwork.project_quote.v1");
    expect(projectPurchaseReadinessJson.checkoutPolicy.includeInCheckout).toBe(false);
    expect(projectPurchaseReadinessJson.totals.checkoutCandidateCount).toBe(7);
    expect(projectPurchaseReadinessJson.totals.customQuoteRequiredCount).toBe(3);
    expect(projectPurchaseReadinessJson.totals.estimatedProjectQuoteTotal).toBe(projectQuoteJson.totals.estimatedTotal);
    expect(projectPurchaseReadinessJson.lineItems.some((item: { purchaseAction: string; checkoutEligible: boolean }) => item.purchaseAction === "supplier_catalog_candidate" && item.checkoutEligible === false)).toBe(true);
    expect(projectPurchaseReadinessJson.lineItems.some((item: { purchaseAction: string }) => item.purchaseAction === "requires_custom_quote")).toBe(true);
    expect(projectPurchaseReadinessJson.assets[0].id).toBe(instanceId);
    expect(projectPurchaseReadinessJson.nextActions.some((item: string) => item.toLowerCase().includes("custom"))).toBe(true);
    expect(projectPurchaseReadinessJson.artifacts.some((item: { type: string }) => item.type === "project_purchase_readiness_json")).toBe(true);
    expect(projectPurchaseReadinessJson.artifacts.some((item: { type: string }) => item.type === "project_procurement_json")).toBe(true);
    expect(projectPurchaseReadinessJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectPurchaseReadinessJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    expect(projectPurchaseReadinessJson.artifacts.some((item: { type: string }) => item.type === "project_quote_package_json")).toBe(true);
    const projectFabricationReleaseDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-fabrication-release").click();
    const projectFabricationReleaseDownload = await projectFabricationReleaseDownloadPromise;
    const projectFabricationReleasePath = await projectFabricationReleaseDownload.path();
    expect(projectFabricationReleasePath).toBeTruthy();
    expect(projectFabricationReleaseDownload.suggestedFilename()).toMatch(/fabrication-release\.json$/);
    const projectFabricationReleaseJson = JSON.parse(fs.readFileSync(projectFabricationReleasePath!, "utf8"));
    expect(projectFabricationReleaseJson.schema).toBe("custom_millwork.project_fabrication_release.v1");
    expect(projectFabricationReleaseJson.status).toBe("needs_review");
    expect(projectFabricationReleaseJson.canReleaseToFabrication).toBe(false);
    expect(projectFabricationReleaseJson.canIssuePurchaseOrder).toBe(false);
    expect(projectFabricationReleaseJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectFabricationReleaseJson.procurementPackage.schema).toBe("custom_millwork.project_procurement.v1");
    expect(projectFabricationReleaseJson.quoteRequest.schema).toBe("custom_millwork.project_rfq.v1");
    expect(projectFabricationReleaseJson.totals.assetCount).toBe(1);
    expect(projectFabricationReleaseJson.totals.needsReviewCount).toBe(1);
    expect(projectFabricationReleaseJson.assets[0].id).toBe(instanceId);
    expect(projectFabricationReleaseJson.assets[0].fabricationDxfFileName).toMatch(/cut-layout\.dxf$/);
    expect(projectFabricationReleaseJson.assets[0].installerWorkOrderFileName).toMatch(/installer-work-order\.json$/);
    expect(projectFabricationReleaseJson.releaseDecision.requiresHumanApproval).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_fabrication_release_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_drawing_set_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_installation_plan_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_field_verification_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_cnc_batch_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string }) => item.type === "project_approval_package_json")).toBe(true);
    expect(projectFabricationReleaseJson.artifacts.some((item: { type: string; durable: boolean }) => item.type === "fabrication_dxf" && item.durable === false)).toBe(true);
  });

  test("Pro designer can export project approval, production, and handoff packages", async ({
    page,
  }) => {
    const { sourceJson, instanceId } = await placeCabinetRun(page);

    const placedPackagePrerequisite = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-placed-package").click();
    const placedPackagePath = await (await placedPackagePrerequisite).path();
    expect(placedPackagePath).toBeTruthy();
    const placedPackageJson = JSON.parse(fs.readFileSync(placedPackagePath!, "utf8"));

    const projectQuotePrerequisite = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-quote").click();
    const projectQuotePath = await (await projectQuotePrerequisite).path();
    expect(projectQuotePath).toBeTruthy();
    const projectQuoteJson = JSON.parse(fs.readFileSync(projectQuotePath!, "utf8"));

    const projectApprovalDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-approval-package").click();
    const projectApprovalDownload = await projectApprovalDownloadPromise;
    const projectApprovalPath = await projectApprovalDownload.path();
    expect(projectApprovalPath).toBeTruthy();
    expect(projectApprovalDownload.suggestedFilename()).toMatch(/approval-package\.json$/);
    const projectApprovalJson = JSON.parse(fs.readFileSync(projectApprovalPath!, "utf8"));
    expect(projectApprovalJson.schema).toBe("custom_millwork.project_approval_package.v1");
    expect(projectApprovalJson.approvalStatus).toBe("needs_review");
    expect(projectApprovalJson.canSubmitForClientApproval).toBe(true);
    expect(projectApprovalJson.canSubmitForFabricatorReview).toBe(true);
    expect(projectApprovalJson.canReleaseAfterSignoff).toBe(false);
    expect(projectApprovalJson.fabricationReleasePackage.schema).toBe("custom_millwork.project_fabrication_release.v1");
    expect(projectApprovalJson.procurementPackage.schema).toBe("custom_millwork.project_procurement.v1");
    expect(projectApprovalJson.totals.approvalItemCount).toBe(7);
    expect(projectApprovalJson.totals.clientApprovalCount).toBe(2);
    expect(projectApprovalJson.totals.fabricatorApprovalCount).toBe(2);
    expect(projectApprovalJson.approvalItems.every((item: { assetId: string }) => item.assetId === instanceId)).toBe(true);
    expect(projectApprovalJson.signoffPolicy.requiresClientApproval).toBe(true);
    expect(projectApprovalJson.artifacts.some((item: { type: string }) => item.type === "project_approval_package_json")).toBe(true);
    expect(projectApprovalJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectApprovalJson.artifacts.some((item: { type: string }) => item.type === "project_revision_package_json")).toBe(true);
    expect(projectApprovalJson.artifacts.some((item: { type: string }) => item.type === "project_drawing_set_json")).toBe(true);
    expect(projectApprovalJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    const projectRevisionDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-revision-package").click();
    const projectRevisionDownload = await projectRevisionDownloadPromise;
    const projectRevisionPath = await projectRevisionDownload.path();
    expect(projectRevisionPath).toBeTruthy();
    expect(projectRevisionDownload.suggestedFilename()).toMatch(/revision-package\.json$/);
    const projectRevisionJson = JSON.parse(fs.readFileSync(projectRevisionPath!, "utf8"));
    expect(projectRevisionJson.schema).toBe("custom_millwork.project_revision_package.v1");
    expect(projectRevisionJson.currentSchedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectRevisionJson.previousSchedule).toBeUndefined();
    expect(projectRevisionJson.revisionPolicy.baselineComparisonAvailable).toBe(false);
    expect(projectRevisionJson.totals.currentAssetCount).toBe(1);
    expect(projectRevisionJson.totals.previousAssetCount).toBe(0);
    expect(projectRevisionJson.totals.changeItemCount).toBe(0);
    expect(projectRevisionJson.assets[0].id).toBe(instanceId);
    expect(projectRevisionJson.assets[0].revisionStatus).toBe("baseline");
    expect(projectRevisionJson.assets[0].sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(projectRevisionJson.artifacts.some((item: { type: string }) => item.type === "project_revision_package_json")).toBe(true);
    expect(projectRevisionJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectRevisionJson.artifacts.some((item: { type: string }) => item.type === "project_approval_package_json")).toBe(true);
    const projectDrawingSetDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-drawing-set").click();
    const projectDrawingSetDownload = await projectDrawingSetDownloadPromise;
    const projectDrawingSetPath = await projectDrawingSetDownload.path();
    expect(projectDrawingSetPath).toBeTruthy();
    expect(projectDrawingSetDownload.suggestedFilename()).toMatch(/drawing-set\.json$/);
    const projectDrawingSetJson = JSON.parse(fs.readFileSync(projectDrawingSetPath!, "utf8"));
    expect(projectDrawingSetJson.schema).toBe("custom_millwork.project_drawing_set.v1");
    expect(projectDrawingSetJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectDrawingSetJson.revisionPackage.schema).toBe("custom_millwork.project_revision_package.v1");
    expect(projectDrawingSetJson.approvalPackage.schema).toBe("custom_millwork.project_approval_package.v1");
    expect(projectDrawingSetJson.totals.assetCount).toBe(1);
    expect(projectDrawingSetJson.totals.sheetCount).toBe(5);
    expect(projectDrawingSetJson.totals.drawingViewCount).toBe(9);
    expect(projectDrawingSetJson.totals.dimensionRowCount).toBe(4);
    expect(projectDrawingSetJson.totals.frontElevationCount).toBe(4);
    expect(projectDrawingSetJson.totals.sideSectionCount).toBe(4);
    expect(projectDrawingSetJson.totals.planFootprintCount).toBe(1);
    expect(projectDrawingSetJson.assets[0].id).toBe(instanceId);
    expect(projectDrawingSetJson.assets[0].shopDrawingFileName).toMatch(/shop-drawing\.svg$/);
    expect(projectDrawingSetJson.sheets.every((item: { assetId: string }) => item.assetId === instanceId)).toBe(true);
    expect(projectDrawingSetJson.sheets.some((item: { viewTypes: string[] }) => item.viewTypes.includes("front_elevation"))).toBe(true);
    expect(projectDrawingSetJson.sheets.some((item: { viewTypes: string[] }) => item.viewTypes.includes("side_section"))).toBe(true);
    expect(projectDrawingSetJson.sheets.some((item: { viewTypes: string[] }) => item.viewTypes.includes("plan_footprint"))).toBe(true);
    expect(projectDrawingSetJson.drawingReviewPolicy.requiresFabricatorReview).toBe(true);
    expect(projectDrawingSetJson.artifacts.some((item: { type: string }) => item.type === "project_drawing_set_json")).toBe(true);
    expect(projectDrawingSetJson.artifacts.some((item: { type: string }) => item.type === "shop_drawing_svg")).toBe(true);
    expect(projectDrawingSetJson.artifacts.some((item: { type: string }) => item.type === "project_revision_package_json")).toBe(true);
    expect(projectDrawingSetJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    const projectCutListDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-cut-list").click();
    const projectCutListDownload = await projectCutListDownloadPromise;
    const projectCutListPath = await projectCutListDownload.path();
    expect(projectCutListPath).toBeTruthy();
    expect(projectCutListDownload.suggestedFilename()).toMatch(/cut-list\.json$/);
    const projectCutListJson = JSON.parse(fs.readFileSync(projectCutListPath!, "utf8"));
    expect(projectCutListJson.schema).toBe("custom_millwork.project_cut_list.v1");
    expect(projectCutListJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectCutListJson.drawingSetPackage.schema).toBe("custom_millwork.project_drawing_set.v1");
    expect(projectCutListJson.revisionPackage.schema).toBe("custom_millwork.project_revision_package.v1");
    expect(projectCutListJson.totals.assetCount).toBe(1);
    expect(projectCutListJson.totals.partRowCount).toBe(30);
    expect(projectCutListJson.totals.totalQuantity).toBe(30);
    expect(projectCutListJson.totals.edgeBandingTotalM).toBe(28.23);
    expect(projectCutListJson.assets[0].id).toBe(instanceId);
    expect(projectCutListJson.assets[0].fabricationDxfFileName).toMatch(/cut-layout\.dxf$/);
    expect(projectCutListJson.assets[0].shopDrawingFileName).toMatch(/shop-drawing\.svg$/);
    expect(projectCutListJson.parts).toHaveLength(30);
    expect(projectCutListJson.parts.every((item: { assetId: string }) => item.assetId === instanceId)).toBe(true);
    expect(projectCutListJson.parts.some((item: { edgeBandingM: number }) => item.edgeBandingM > 0)).toBe(true);
    expect(projectCutListJson.materials.length).toBeGreaterThan(0);
    expect(projectCutListJson.materials.every((item: { assetIds: string[] }) => item.assetIds.includes(instanceId!))).toBe(true);
    expect(projectCutListJson.cutListReviewPolicy.requiresCncReview).toBe(true);
    expect(projectCutListJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    expect(projectCutListJson.artifacts.some((item: { type: string }) => item.type === "project_cnc_batch_json")).toBe(true);
    expect(projectCutListJson.artifacts.some((item: { type: string; durable: boolean }) => item.type === "fabrication_dxf" && item.durable === false)).toBe(true);
    expect(projectCutListJson.artifacts.some((item: { type: string }) => item.type === "shop_drawing_svg")).toBe(true);
    const projectCncBatchDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-cnc-batch").click();
    const projectCncBatchDownload = await projectCncBatchDownloadPromise;
    const projectCncBatchPath = await projectCncBatchDownload.path();
    expect(projectCncBatchPath).toBeTruthy();
    expect(projectCncBatchDownload.suggestedFilename()).toMatch(/cnc-batch\.json$/);
    const projectCncBatchJson = JSON.parse(fs.readFileSync(projectCncBatchPath!, "utf8"));
    expect(projectCncBatchJson.schema).toBe("custom_millwork.project_cnc_batch.v1");
    expect(projectCncBatchJson.cncReadiness).toBe("needs_review");
    expect(projectCncBatchJson.fabricationReleasePackage.schema).toBe("custom_millwork.project_fabrication_release.v1");
    expect(projectCncBatchJson.totals.assetCount).toBe(1);
    expect(projectCncBatchJson.totals.dxfFileCount).toBe(1);
    expect(projectCncBatchJson.totals.cutListCount).toBeGreaterThan(0);
    expect(projectCncBatchJson.materials.length).toBeGreaterThan(0);
    expect(projectCncBatchJson.assets[0].id).toBe(instanceId);
    expect(projectCncBatchJson.assets[0].dxfFileName).toMatch(/cut-layout\.dxf$/);
    expect(projectCncBatchJson.assets[0].machiningReviewRequired).toBe(true);
    expect(projectCncBatchJson.materials.every((item: { assetIds: string[] }) => item.assetIds.includes(instanceId!))).toBe(true);
    expect(projectCncBatchJson.artifacts.some((item: { type: string }) => item.type === "project_cnc_batch_json")).toBe(true);
    expect(projectCncBatchJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectCncBatchJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    expect(projectCncBatchJson.artifacts.some((item: { type: string; durable: boolean }) => item.type === "fabrication_dxf" && item.durable === false)).toBe(true);
    const projectInstallationPlanDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-installation-plan").click();
    const projectInstallationPlanDownload = await projectInstallationPlanDownloadPromise;
    const projectInstallationPlanPath = await projectInstallationPlanDownload.path();
    expect(projectInstallationPlanPath).toBeTruthy();
    expect(projectInstallationPlanDownload.suggestedFilename()).toMatch(/installation-plan\.json$/);
    const projectInstallationPlanJson = JSON.parse(fs.readFileSync(projectInstallationPlanPath!, "utf8"));
    expect(projectInstallationPlanJson.schema).toBe("custom_millwork.project_installation_plan.v1");
    expect(projectInstallationPlanJson.installationReadiness).toBe("needs_review");
    expect(projectInstallationPlanJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectInstallationPlanJson.fabricationReleasePackage.schema).toBe("custom_millwork.project_fabrication_release.v1");
    expect(projectInstallationPlanJson.totals.assetCount).toBe(1);
    expect(projectInstallationPlanJson.totals.roomCount).toBe(1);
    expect(projectInstallationPlanJson.totals.installerWorkOrderCount).toBe(1);
    expect(projectInstallationPlanJson.assets[0].id).toBe(instanceId);
    expect(projectInstallationPlanJson.assets[0].installSequence).toBe(1);
    expect(projectInstallationPlanJson.assets[0].siteTransform.position).toEqual(placedPackageJson.placedAsset.transform.position);
    expect(projectInstallationPlanJson.assets[0].installerWorkOrderFileName).toMatch(/installer-work-order\.json$/);
    expect(projectInstallationPlanJson.assets[0].estimatedInstallHours).toBeGreaterThan(0);
    expect(projectInstallationPlanJson.rooms[0].assetIds).toContain(instanceId);
    expect(projectInstallationPlanJson.artifacts.some((item: { type: string }) => item.type === "project_installation_plan_json")).toBe(true);
    expect(projectInstallationPlanJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectInstallationPlanJson.artifacts.some((item: { type: string }) => item.type === "project_field_verification_json")).toBe(true);
    expect(projectInstallationPlanJson.artifacts.some((item: { type: string }) => item.type === "installer_work_order_json")).toBe(true);
    const projectRfqDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-rfq").click();
    const projectRfqDownload = await projectRfqDownloadPromise;
    const projectRfqPath = await projectRfqDownload.path();
    expect(projectRfqPath).toBeTruthy();
    expect(projectRfqDownload.suggestedFilename()).toMatch(/project-rfq\.json$/);
    const projectRfqJson = JSON.parse(fs.readFileSync(projectRfqPath!, "utf8"));
    expect(projectRfqJson.schema).toBe("custom_millwork.project_rfq.v1");
    expect(projectRfqJson.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectRfqJson.totals.assetCount).toBe(1);
    expect(projectRfqJson.totals.edgeBandingTotalM).toBe(28.23);
    expect(projectRfqJson.assets[0].id).toBe(instanceId);
    expect(projectRfqJson.assetQuoteRequests).toHaveLength(1);
    expect(projectRfqJson.assetQuoteRequests[0].schema).toBe("custom_millwork.rfq.v1");
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_schedule_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_schedule_csv")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_procurement_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_finish_schedule_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_drawing_set_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_quote_package_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_purchase_readiness_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_field_verification_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_fabrication_release_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_installation_plan_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_cnc_batch_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "project_approval_package_json")).toBe(true);
    expect(projectRfqJson.artifacts.some((item: { type: string }) => item.type === "installer_work_order_json")).toBe(true);
    expect(projectRfqJson.requestedDeliverables.some((item: string) => item.includes("project-level"))).toBe(true);
    const projectHandoffDownloadPromise = page.waitForEvent("download");
    await page.getByTestId("selected-cabinet-download-project-handoff").click();
    const projectHandoffDownload = await projectHandoffDownloadPromise;
    const projectHandoffPath = await projectHandoffDownload.path();
    expect(projectHandoffPath).toBeTruthy();
    expect(projectHandoffDownload.suggestedFilename()).toMatch(/project-handoff\.json$/);
    const projectHandoffJson = JSON.parse(fs.readFileSync(projectHandoffPath!, "utf8"));
    expect(projectHandoffJson.schema).toBe("custom_millwork.project_handoff_package.v1");
    expect(projectHandoffJson.handoffStatus).toBe("needs_review");
    expect(projectHandoffJson.canIssueToClient).toBe(true);
    expect(projectHandoffJson.canIssueToFabricator).toBe(true);
    expect(projectHandoffJson.canIssueToInstaller).toBe(true);
    expect(projectHandoffJson.canIssueForPurchaseReview).toBe(true);
    expect(projectHandoffJson.packages.schedule.schema).toBe("custom_millwork.project_schedule.v1");
    expect(projectHandoffJson.packages.scopePackage.schema).toBe("custom_millwork.project_scope.v1");
    expect(projectHandoffJson.packages.procurementPackage.schema).toBe("custom_millwork.project_procurement.v1");
    expect(projectHandoffJson.packages.drawingSetPackage.schema).toBe("custom_millwork.project_drawing_set.v1");
    expect(projectHandoffJson.packages.cutListPackage.schema).toBe("custom_millwork.project_cut_list.v1");
    expect(projectHandoffJson.packages.cncBatchPackage.schema).toBe("custom_millwork.project_cnc_batch.v1");
    expect(projectHandoffJson.packages.rfqPackage.schema).toBe("custom_millwork.project_rfq.v1");
    expect(projectHandoffJson.totals.assetCount).toBe(1);
    expect(projectHandoffJson.totals.packageCount).toBe(15);
    expect(projectHandoffJson.totals.cutListCount).toBe(30);
    expect(projectHandoffJson.totals.edgeBandingTotalM).toBe(28.23);
    expect(projectHandoffJson.totals.estimatedTotal).toBe(projectQuoteJson.totals.estimatedTotal);
    expect(projectHandoffJson.assets[0].id).toBe(instanceId);
    expect(projectHandoffJson.assets[0].sourceDefinitionFingerprint).toBe(sourceJson.sourceDefinitionFingerprint);
    expect(projectHandoffJson.handoffChecklist.some((item: { id: string; status: string }) => item.id === "handoff:fabrication-release" && item.status === "required")).toBe(true);
    expect(projectHandoffJson.handoffChecklist.some((item: { id: string; status: string }) => item.id === "handoff:checkout-exclusion" && item.status === "ready")).toBe(true);
    expect(projectHandoffJson.artifacts.some((item: { type: string }) => item.type === "project_handoff_package_json")).toBe(true);
    expect(projectHandoffJson.artifacts.some((item: { type: string }) => item.type === "project_scope_json")).toBe(true);
    expect(projectHandoffJson.artifacts.some((item: { type: string }) => item.type === "project_cut_list_json")).toBe(true);
    expect(projectHandoffJson.artifacts.some((item: { type: string }) => item.type === "project_cnc_batch_json")).toBe(true);
    expect(projectHandoffJson.artifacts.some((item: { type: string }) => item.type === "project_rfq_json")).toBe(true);
    expect(projectHandoffJson.artifacts.some((item: { type: string }) => item.type === "installer_work_order_json")).toBe(true);
  });

  test("Pro designer can transform, edit, persist, and restore a placed cabinet run", async ({
    page,
  }) => {
    const placed = await placeCabinetRun(page);
    const { placedCabinet, instanceId } = placed;
    let { beforePosition, beforeRotation } = placed;
    const projectSchedule = page.getByTestId("project-millwork-schedule");
    const projectReadiness = page.getByTestId("project-millwork-readiness");

    await expect(page.getByTestId("selected-cabinet-placement-controls")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("selected-cabinet-nudge-right").click();
    await expect(placedCabinet).not.toHaveAttribute("data-position", beforePosition!);
    const movedPosition = await placedCabinet.getAttribute("data-position");
    expect(movedPosition).toBeTruthy();
    await expect(placedCabinet).toHaveAttribute("data-transform-position", movedPosition!);
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", movedPosition!);
    beforePosition = movedPosition;

    await page.getByTestId("selected-cabinet-rotate-quarter").click();
    await expect(placedCabinet).not.toHaveAttribute("data-rotation-y", beforeRotation!);
    const movedRotation = await placedCabinet.getAttribute("data-rotation-y");
    expect(movedRotation).toBeTruthy();
    await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", movedRotation!);
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", movedRotation!);
    beforeRotation = movedRotation;

    await page.getByTestId("selected-cabinet-snap-wall").click();
    const snappedPosition = await placedCabinet.getAttribute("data-position");
    expect(snappedPosition).toBeTruthy();
    await expect(placedCabinet).toHaveAttribute("data-transform-position", snappedPosition!);
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", snappedPosition!);
    beforePosition = snappedPosition;

    await expect(page.getByTestId("edit-placed-millwork")).toBeVisible({ timeout: 15000 });
    await page.getByTestId("edit-placed-millwork").click();
    await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-mode", "edit");
    await page.getByTestId("cabinet-dimension-width").fill("1200");
    await page.getByTestId("cabinet-input-front-material").selectOption("matte_black_laminate");
    const updatePlacedMillwork = page.getByRole("button", {
      name: "Update Placed Millwork",
      exact: true,
    });
    await expect(updatePlacedMillwork).toBeEnabled();
    await updatePlacedMillwork.focus();
    await updatePlacedMillwork.press("Enter");

    await expect(page.getByTestId("custom-millwork-studio"))
      .toBeHidden({ timeout: 30000 })
      .catch(async (error) => {
        const actionErrors = await page.getByTestId("cabinet-action-error").allTextContents();
        const actionSuccesses = await page.getByTestId("cabinet-action-success").allTextContents();
        throw new Error(
          `Updated Studio did not close. Action errors: ${actionErrors.join(" | ") || "none"}. ` +
            `Action successes: ${actionSuccesses.join(" | ") || "none"}\n${String(error)}`
        );
      });
    await expect(placedCabinet).toHaveAttribute("data-instance-id", instanceId!);
    await expect(placedCabinet).toHaveAttribute("data-width-mm", "2800");
    await expect(placedCabinet).toHaveAttribute("data-module-count", "3");
    await expect(placedCabinet).toHaveAttribute("data-cut-list-count", "30");
    await expect(placedCabinet).toHaveAttribute("data-dimension-schedule-count", "4");
    await expect(placedCabinet).toHaveAttribute("data-drawing-view-schedule-count", "9");
    await expect(placedCabinet).toHaveAttribute("data-release-checklist-count", "7");
    await expect(placedCabinet).toHaveAttribute("data-release-blocker-count", "0");
    await expect(placedCabinet).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
    await expect(placedCabinet).toHaveAttribute("data-supplier-sku-mapping-count", "10");
    await expect(placedCabinet).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(placedCabinet).toHaveAttribute("data-edge-banding-total-m", "32.23");
    await expect(placedCabinet).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
    await expect(placedCabinet).toHaveAttribute("data-assembly-profile-complexity", "moderate");
    await expect(projectSchedule).toHaveAttribute("data-asset-count", "1");
    await expect(projectSchedule).toHaveAttribute("data-module-count", "3");
    await expect(projectSchedule).toHaveAttribute("data-edge-banding-total-m", "32.23");
    await expect(projectSchedule).toHaveAttribute("data-cut-list-count", "30");
    await expect(projectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
    await expect(projectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
    await expect(projectReadiness).toHaveAttribute("data-asset-count", "1");
    await expect(projectReadiness).toHaveAttribute("data-scope-family-count", "1");
    await expect(projectReadiness).toHaveAttribute("data-scope-assembly-type-count", "1");
    await expect(projectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
    await expect(projectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
    await expect(projectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(projectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
    await expect(projectReadiness).toHaveAttribute("data-custom-quote-required-count", "3");
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-source-definition-version", "1");
    await expect(placedCabinet).toHaveAttribute("data-generated-output-kind", "glb");
    await expect(placedCabinet).toHaveAttribute("data-generated-output-durable", "false");
    await expect(placedCabinet).toHaveAttribute("data-position", beforePosition!);
    await expect(placedCabinet).toHaveAttribute("data-rotation-y", beforeRotation!);
    await expect(placedCabinet).toHaveAttribute("data-transform-position", beforePosition!);
    await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation!);
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", beforePosition!);
    await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", beforeRotation!);
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-cut-list-count", "30");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-total-m", "32.23");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-complexity", "moderate");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
    await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-generated-output-kind", "glb");
    const saveStatus = page.getByTestId("save-status");
    await expect(saveStatus).toHaveAttribute("data-status", "saved", { timeout: 30000 });
    await expect(saveStatus).toHaveAttribute("data-source", "local");
    await page.waitForFunction(
      ({ key, instanceId: expectedInstanceId }) => {
        if (!expectedInstanceId) return false;
        const raw = window.localStorage.getItem(key);
        if (!raw) return false;
        try {
          const stored = JSON.parse(raw);
          const cabinets = (stored.rooms ?? []).flatMap((room: { items?: unknown[] }) => room.items ?? []);
          const cabinet = cabinets.find(
            (item: { instanceId?: string; assetType?: string }) =>
              item.instanceId === expectedInstanceId && item.assetType === "parametric_cabinet"
          ) as
            | {
                cabinetDefinition?: { totalWidth?: number; modules?: unknown[] };
                bomSnapshot?: unknown[];
                cutListSnapshot?: unknown[];
                transform?: { position?: unknown[]; rotationY?: number };
                glbAssetUrl?: string;
                millworkAssetManifest?: { generatedOutput?: { url?: string; kind?: string; durable?: boolean } };
                includeInCheckout?: boolean;
              }
            | undefined;

          return Boolean(
              cabinet &&
              cabinet.cabinetDefinition?.totalWidth === 2800 &&
              cabinet.cabinetDefinition.modules?.length === 3 &&
              (cabinet.bomSnapshot?.length ?? 0) > 0 &&
              cabinet.cutListSnapshot?.length === 30 &&
              Array.isArray(cabinet.transform?.position) &&
              cabinet.glbAssetUrl === undefined &&
              !cabinet.millworkAssetManifest?.generatedOutput?.url?.startsWith("blob:") &&
              cabinet.millworkAssetManifest?.generatedOutput?.kind === "glb" &&
              cabinet.millworkAssetManifest?.generatedOutput?.durable === false &&
              cabinet.includeInCheckout === false
          );
        } catch {
          return false;
        }
      },
      { key: EDITOR_STORAGE_KEY, instanceId },
      { timeout: 15000 }
    );
    const storedCabinetSnapshot = await page.evaluate(
      ({ key, instanceId: expectedInstanceId }) => {
        const stored = JSON.parse(window.localStorage.getItem(key) || "{}");
        const cabinets = (stored.rooms ?? []).flatMap((room: { items?: unknown[] }) => room.items ?? []);
        const cabinet = cabinets.find(
          (item: { instanceId?: string; assetType?: string }) =>
            item.instanceId === expectedInstanceId && item.assetType === "parametric_cabinet"
        ) as {
          assetType?: string;
          cabinetDefinition?: { totalWidth?: number; id?: string };
          bomSnapshot?: unknown[];
          cutListSnapshot?: unknown[];
          transform?: { position?: unknown[]; rotationY?: number };
          glbAssetUrl?: string;
          millworkDefinition?: {
            assemblyProfile?: { schema?: string; assemblyType?: string; placementKind?: string };
          };
          millworkAssetManifest?: { schema?: string; generatedOutput?: { kind?: string; url?: string; durable?: boolean } };
          includeInCheckout?: boolean;
        };

        return {
          assetType: cabinet?.assetType,
          widthMm: cabinet?.cabinetDefinition?.totalWidth,
          definitionId: cabinet?.cabinetDefinition?.id,
          bomCount: cabinet?.bomSnapshot?.length ?? 0,
          cutListCount: cabinet?.cutListSnapshot?.length ?? 0,
          transformPosition: cabinet?.transform?.position?.join(",") ?? "",
          transformRotationY: String(cabinet?.transform?.rotationY ?? ""),
          glbAssetUrl: cabinet?.glbAssetUrl ?? null,
          assemblyProfileSchema: cabinet?.millworkDefinition?.assemblyProfile?.schema,
          assemblyProfileAssemblyType: cabinet?.millworkDefinition?.assemblyProfile?.assemblyType,
          assemblyProfilePlacementKind: cabinet?.millworkDefinition?.assemblyProfile?.placementKind,
          manifestSchema: cabinet?.millworkAssetManifest?.schema,
          generatedOutputKind: cabinet?.millworkAssetManifest?.generatedOutput?.kind,
          generatedOutputUrl: cabinet?.millworkAssetManifest?.generatedOutput?.url ?? null,
          generatedOutputDurable: cabinet?.millworkAssetManifest?.generatedOutput?.durable,
          includeInCheckout: cabinet?.includeInCheckout,
        };
      },
      { key: EDITOR_STORAGE_KEY, instanceId }
    );
    expect(storedCabinetSnapshot).toMatchObject({
      assetType: "parametric_cabinet",
      widthMm: 2800,
      cutListCount: 30,
      transformPosition: beforePosition,
      transformRotationY: beforeRotation,
      glbAssetUrl: null,
      assemblyProfileSchema: "custom_millwork.assembly_profile.v1",
      assemblyProfileAssemblyType: "cabinet_run",
      assemblyProfilePlacementKind: "built_in_wall",
      manifestSchema: "custom_millwork.asset_manifest.v1",
      generatedOutputKind: "glb",
      generatedOutputUrl: null,
      generatedOutputDurable: false,
      includeInCheckout: false,
    });
    expect(storedCabinetSnapshot.bomCount).toBeGreaterThan(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("open-custom-millwork-studio")).toBeVisible({ timeout: 30000 });
    const restoredCabinet = page.getByTestId("placed-millwork-asset").first();
    await expect(restoredCabinet).toHaveCount(1, { timeout: 30000 });

    await expect(restoredCabinet).toHaveAttribute("data-width-mm", "2800");
    await expect(restoredCabinet).toHaveAttribute("data-module-count", "3");
    await expect(restoredCabinet).toHaveAttribute("data-cut-list-count", "30");
    await expect(restoredCabinet).toHaveAttribute("data-dimension-schedule-count", "4");
    await expect(restoredCabinet).toHaveAttribute("data-drawing-view-schedule-count", "9");
    await expect(restoredCabinet).toHaveAttribute("data-release-checklist-count", "7");
    await expect(restoredCabinet).toHaveAttribute("data-release-blocker-count", "0");
    await expect(restoredCabinet).toHaveAttribute("data-edge-banding-schedule-count", "4");
    await expect(restoredCabinet).toHaveAttribute("data-edge-banding-total-m", "32.23");
    await expect(restoredCabinet).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(restoredCabinet).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
    await expect(restoredCabinet).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
    await expect(restoredCabinet).toHaveAttribute("data-assembly-profile-complexity", "moderate");
    const restoredProjectSchedule = page.getByTestId("project-millwork-schedule");
    await expect(restoredProjectSchedule).toHaveAttribute("data-schema", "custom_millwork.project_schedule.v1");
    await expect(restoredProjectSchedule).toHaveAttribute("data-asset-count", "1");
    await expect(restoredProjectSchedule).toHaveAttribute("data-edge-banding-total-m", "32.23");
    const restoredProjectReadiness = page.getByTestId("project-millwork-readiness");
    await expect(restoredProjectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
    await expect(restoredProjectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
    await expect(restoredProjectReadiness).toHaveAttribute("data-scope-schema", "custom_millwork.project_scope.v1");
    await expect(restoredProjectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
    await expect(restoredProjectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
    await expect(restoredProjectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
    await expect(restoredProjectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
    await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
    await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-source-definition-version", "1");
    await expect(restoredCabinet).toHaveAttribute("data-generated-output-kind", "glb");
    await expect(restoredCabinet).toHaveAttribute("data-position", beforePosition!);
    await expect(restoredCabinet).toHaveAttribute("data-rotation-y", beforeRotation!);
    await expect(restoredCabinet).toHaveAttribute("data-transform-position", beforePosition!);
    await expect(restoredCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation!);
    await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-transform-position", beforePosition!);
    await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", beforeRotation!);
  });

  test("homeowner/free mode gets Guided millwork, an estimate, and no Pro controls", async ({ page }) => {
    await mockPlan(page, "free");
    await page.addInitScript(() => {
      window.localStorage.setItem("plan_measurement_unit", "cm");
    });
    await page.goto("/design");

    const openStudio = page.getByTestId("open-custom-millwork-studio");
    await expect(openStudio).toBeVisible({ timeout: 30000 });
    await dismissBlockingPrompt(page);
    await openStudio.click();

    const studio = page.getByTestId("custom-millwork-studio");
    await expect(studio).toBeVisible({ timeout: 15000 });
    await expect(studio).toHaveAttribute("data-access-level", "consumer");
    await expect(studio).toHaveAttribute("data-experience", "guided");
    await expect(studio).toHaveAttribute("data-measurement-unit", "cm");
    await expect(page.getByTestId("cabinet-experience-detailed")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-preview-clearance-toggle")).toHaveCount(0);

    await page.getByTestId("cabinet-guided-step-space").click();
    await expect(page.getByTestId("cabinet-custom-space-toggle")).toHaveCount(0);

    await page.getByTestId("cabinet-guided-step-size").click();
    await expect(page.getByTestId("cabinet-overall-width-lock")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-guided-width")).toHaveAttribute(
      "data-model-value-mm",
      "900"
    );
    await expect(page.getByTestId("cabinet-guided-width")).toHaveValue("90");

    await page.getByTestId("cabinet-guided-step-layout").click();
    await page.getByTestId("cabinet-guided-layout-double_door").click();
    await expect(page.getByTestId("cabinet-module-sizing-manual")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-guided-add-module")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-guided-module-width-lock")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-shelf-spacing-lock")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-shelf-spacing-custom")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-door-layout-manual")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-drawer-heights-custom")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-guided-doors")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-guided-recommended-doors")).toContainText(
      /sized automatically/i
    );

    await page.getByTestId("cabinet-guided-step-style").click();
    await expect(page.getByTestId("cabinet-material-lock")).toHaveCount(0);

    await page.getByTestId("cabinet-guided-step-review").click();
    const estimate = page.getByTestId("cabinet-consumer-estimate");
    await expect(estimate).toBeVisible();
    await expect(estimate).toHaveAttribute("data-currency", "USD");
    const estimatedTotal = Number(await estimate.getAttribute("data-estimated-total"));
    expect(estimatedTotal).toBeGreaterThan(0);
    await expect(page.getByTestId("cabinet-consumer-estimate-total")).toContainText("$");
    await expect(page.getByTestId("cabinet-open-outputs")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-bom")).toHaveCount(0);
    await expect(page.getByTestId("cabinet-place-in-plan")).toBeEnabled();
  });
});
