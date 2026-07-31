import { test, expect } from "../fixtures";
import { dismissBlockingPrompt, mockPlan } from "./helpers";

export function registerSelectionTests() {
  test.describe("Custom Millwork Studio selection", () => {
    test.setTimeout(600000);

    test("Detailed wardrobe selection stays coherent from module to shelf and back", async ({
      page,
    }) => {
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
      await page.getByTestId("cabinet-experience-detailed").click();
      await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute(
        "data-experience",
        "detailed"
      );

      const moduleButton = page.getByTestId("cabinet-module-1");
      const breadcrumb = page.getByTestId("cabinet-selection-breadcrumb");
      const moduleBreadcrumb = breadcrumb.getByRole("button", {
        name: "Module 1",
        exact: true,
      });
      const preview = page.getByTestId("cabinet-preview");
      const previewRenderer = preview
        .locator("[data-cabinet-preview-renderer]")
        .first();

      await page
        .locator('[data-testid="cabinet-preview-view-front"]:visible')
        .first()
        .click();
      await moduleButton.click();
      await expect(moduleButton).toHaveAttribute("data-module-id", "module-1");
      await expect(moduleButton).toHaveClass(/bg-neutral-900/);
      await expect(moduleBreadcrumb).toHaveClass(/bg-blue-600/);
      await expect(preview.getByText("Selected: Module 1", { exact: true })).toBeVisible();
      await expect(page.getByTestId("cabinet-dimension-width")).toBeVisible();
      await expect(previewRenderer).toHaveAttribute("data-preview-ready", "true");
      const modulePreviewKey = await previewRenderer.getAttribute(
        "data-preview-ready-key"
      );
      expect(modulePreviewKey).toBeTruthy();

      const previewCanvas = preview.locator("canvas").first();
      await expect(previewCanvas).toBeVisible();
      const previewBox = await previewCanvas.boundingBox();
      expect(previewBox).not.toBeNull();
      await page.mouse.click(
        previewBox!.x + previewBox!.width * 0.34,
        previewBox!.y + previewBox!.height * 0.18
      );

      const partInspector = page.getByTestId("cabinet-part-inspector");
      await expect(partInspector).toHaveAttribute("data-part-type", "shelf");
      await expect(
        preview.getByText("Selected: Shelf · Module 1", { exact: true })
      ).toBeVisible();
      await expect(breadcrumb.getByText("Shelf", { exact: true })).toBeVisible();
      await expect(page.getByTestId("cabinet-part-shelf-controls")).toBeVisible();
      await expect(page.getByTestId("cabinet-part-dimensions")).toBeVisible();
      await expect(
        page.getByTestId("cabinet-selected-part-fabrication")
      ).toBeVisible();
      await expect(page.getByTestId("cabinet-dimension-width")).toHaveCount(0);

      const previewSummary = preview.getByTestId("cabinet-preview-summary");
      const previewControls = preview.getByTestId("cabinet-preview-controls");
      const previewStatus = preview.getByTestId("cabinet-preview-status");
      const depthHandle = preview.getByTestId(
        "cabinet-dimension-handle-depth"
      );
      const previewSummaryBox = await previewSummary.boundingBox();
      const previewControlsBox = await previewControls.boundingBox();
      const previewStatusBox = await previewStatus.boundingBox();
      const depthHandleBox = await depthHandle.boundingBox();
      expect(previewSummaryBox).not.toBeNull();
      expect(previewControlsBox).not.toBeNull();
      expect(previewStatusBox).not.toBeNull();
      expect(depthHandleBox).not.toBeNull();
      expect(previewSummaryBox!.x + previewSummaryBox!.width).toBeLessThanOrEqual(
        previewControlsBox!.x
      );
      expect(
        previewControlsBox!.x + previewControlsBox!.width
      ).toBeLessThanOrEqual(previewStatusBox!.x);
      expect(
        previewStatusBox!.y + previewStatusBox!.height
      ).toBeLessThanOrEqual(depthHandleBox!.y);

      await expect
        .poll(() => previewRenderer.getAttribute("data-preview-ready-key"))
        .not.toBe(modulePreviewKey);

      const openParent = page.getByTestId("cabinet-part-open-parent-module");
      await expect(openParent).toHaveText("Open parent Module 1");
      await openParent.click();

      await expect(partInspector).toHaveCount(0);
      await expect(moduleButton).toHaveClass(/bg-neutral-900/);
      await expect(moduleBreadcrumb).toHaveClass(/bg-blue-600/);
      await expect(preview.getByText("Selected: Module 1", { exact: true })).toBeVisible();
      await expect(page.getByTestId("cabinet-dimension-width")).toBeVisible();
      await expect
        .poll(() => previewRenderer.getAttribute("data-preview-ready-key"))
        .toBe(modulePreviewKey);
    });

  });
}
