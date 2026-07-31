import { test, expect } from "../fixtures";
import { dismissBlockingPrompt, mockPlan, openDetailedProStudio } from "./helpers";

export function registerGuidedTests() {
  test.describe("Custom Millwork Studio guided", () => {
    test.setTimeout(600000);

    test("Guided preview chrome does not overlap selection or dimension controls", async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1692, height: 1000 });
      await mockPlan(page, "pro");
      await page.goto("/design?mode=designer");

      const workspaceMenu = page.getByTestId("editor-command-workspace");
      await expect(workspaceMenu).toBeVisible({ timeout: 30000 });
      await page.waitForLoadState("networkidle");
      await dismissBlockingPrompt(page);
      await workspaceMenu.click();
      const openStudio = page.getByTestId("editor-workflow-millwork");
      await expect(openStudio).toBeVisible();
      await openStudio.click();
      await expect(page.getByTestId("custom-millwork-studio")).toBeVisible({
        timeout: 15000,
      });

      await page.getByTestId("cabinet-guided-step-type").click();
      await page.getByTestId("cabinet-preset-wardrobe").click();
      await page.getByTestId("cabinet-guided-step-layout").click();
      await page.getByTestId("cabinet-guided-wardrobe-shelves").click();

      const preview = page.getByTestId("cabinet-guided-preview");
      const controls = preview.getByTestId("cabinet-guided-preview-controls");
      const summary = preview.getByTestId("cabinet-guided-preview-summary");
      const depthHandle = preview.getByTestId("cabinet-dimension-handle-depth");
      const validation = preview.getByTestId("cabinet-validation");
      const widthHandle = preview.getByTestId(
        "cabinet-dimension-handle-totalWidth"
      );

      await expect(controls).toBeVisible();
      await expect(summary).toBeVisible();
      await expect(depthHandle).toBeVisible();
      await expect(validation).toBeVisible();
      await expect(widthHandle).toBeVisible();

      const controlsBox = await controls.boundingBox();
      const summaryBox = await summary.boundingBox();
      const depthHandleBox = await depthHandle.boundingBox();
      const validationBox = await validation.boundingBox();
      const widthHandleBox = await widthHandle.boundingBox();
      expect(controlsBox).not.toBeNull();
      expect(summaryBox).not.toBeNull();
      expect(depthHandleBox).not.toBeNull();
      expect(validationBox).not.toBeNull();
      expect(widthHandleBox).not.toBeNull();

      expect(controlsBox!.y + controlsBox!.height).toBeLessThanOrEqual(
        summaryBox!.y
      );
      expect(summaryBox!.y + summaryBox!.height).toBeLessThanOrEqual(
        depthHandleBox!.y
      );
      expect(validationBox!.y + validationBox!.height).toBeLessThanOrEqual(
        widthHandleBox!.y
      );
    });

    test("new designer can configure a valid drawer cabinet in Guided setup", async ({ page }) => {
      await mockPlan(page, "pro");
      await page.goto("/design?mode=designer");

      const openStudio = page.getByTestId("open-custom-millwork-studio");
      await expect(openStudio).toBeVisible({ timeout: 30000 });
      await dismissBlockingPrompt(page);
      await openStudio.click();

      const studio = page.getByTestId("custom-millwork-studio");
      await expect(studio).toBeVisible({ timeout: 15000 });
      await expect(studio).toHaveAttribute("data-access-level", "pro");
      await expect(studio).toHaveAttribute("data-experience", "guided");
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

    test("module drag reordering is committed once and remains undoable", async ({ page }) => {
      await openDetailedProStudio(page);
      await page.getByTestId("cabinet-preset-cabinet_run").click();

      const firstModule = page.getByTestId("cabinet-module-1");
      const thirdModule = page.getByTestId("cabinet-module-3");
      await expect(firstModule).toHaveAttribute("data-module-id", "module-1");
      await expect(thirdModule).toHaveAttribute("data-module-id", "module-3");

      await thirdModule.dragTo(firstModule);
      await expect(firstModule).toHaveAttribute("data-module-id", "module-3");
      await expect(page.getByTestId("cabinet-module-2")).toHaveAttribute(
        "data-module-id",
        "module-1"
      );

      await page.getByTestId("cabinet-undo").click();
      await expect(firstModule).toHaveAttribute("data-module-id", "module-1");
      await expect(thirdModule).toHaveAttribute("data-module-id", "module-3");
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
      await expect(page.getByTestId("custom-millwork-studio")).toBeVisible({ timeout: 15000 });

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
}
