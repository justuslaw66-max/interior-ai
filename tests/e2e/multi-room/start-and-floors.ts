import { test, expect } from "../fixtures";
import {
  boxesOverlap,
  chooseTemplateStart,
  clickWithFallback,
} from "./helpers";

export function registerStartAndFloorTests() {
  test("public beta fast start opens the chosen plan workflow", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    const betaStartPanel = page.getByTestId("beta-start-panel");
    if (await betaStartPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await clickWithFallback(page.getByTestId("beta-start-template"));
    } else {
      await chooseTemplateStart(page);
    }

    await expect(page.getByRole("button", { name: "2D Plan" })).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-studio")).toBeVisible();
    await expect(page.getByTestId("apply-plan-template-compact_two_bed")).toBeVisible();

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("beta-start-panel")).toHaveCount(0);
  });

  test("public beta AI fast start opens the AI design brief", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    const betaStartPanel = page.getByTestId("beta-start-panel");
    if (await betaStartPanel.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.getByTestId("beta-start-ai-layout").click();
    } else {
      await clickWithFallback(page.getByTestId("editor-workflow-ai"));
    }

    await expect(page.getByTestId("editor-workflow-ai")).toHaveAttribute("data-active", "true");
    await expect(page.getByText("AI Design Brief")).toBeVisible();
    await expect(page.getByText("Step 1 · Room goal")).toBeVisible();
    await expect(page.getByText("Step 2 · Style")).toBeVisible();
    await expect(page.getByText("Step 3 · Budget")).toBeVisible();
    await expect(page.getByText("Step 4 · Must-have items")).toBeVisible();
    await expect(page.getByRole("button", { name: "Generate layout" })).toBeEnabled();
    await expect(page.getByText("Review the result before saving, exporting, or shopping.")).toBeVisible();
  });

  test("3D scene quality control switches and persists lite mode", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    const commandOverflow = page.getByTestId("editor-command-overflow");
    await expect(commandOverflow).toBeVisible();
    await commandOverflow.click();
    await expect(page.getByTestId("editor-command-overflow-menu")).toBeVisible();
    await expect(page.getByTestId("editor-overflow-scene-quality")).toBeVisible();
    await expect(page.getByTestId("scene-performance-auto")).toHaveAttribute("data-active", "true");

    await page.getByTestId("scene-performance-lite").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByTestId("scene-performance-lite")).toHaveAttribute("data-active", "true");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("scene_performance_mode")))
      .toBe("lite");

    await page.getByTestId("scene-performance-quality").evaluate((button) => {
      (button as HTMLButtonElement).click();
    });
    await expect(page.getByTestId("scene-performance-quality")).toHaveAttribute("data-active", "true");
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("scene_performance_mode")))
      .toBe("quality");
  });

  test("intermediate-width plan keeps floating room and floor overlays off the details card", async ({
    page,
  }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 900, height: 900 });

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("coohom-floor-panel")).toHaveCount(0);
    await expect(page.getByTestId("floor-summary-panel")).toBeVisible();

    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "3D" }).click();

    await expect(page.getByTestId("room-pan-navigator")).toHaveCount(0);
    await expect(page.getByTestId("coohom-floor-panel")).toHaveCount(0);
    await expect(page.getByTestId("floor-summary-panel")).toBeVisible();
  });

  test("shop mode uses the left work panel and keeps the canvas clear", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await chooseTemplateStart(page);
    await page.getByTestId("add-room-template-bedroom").click();
    await page.getByRole("button", { name: "3D" }).click();
    await clickWithFallback(page.getByTestId("editor-workflow-shop"));

    await expect(page.getByTestId("editor-workflow-shop")).toHaveAttribute("data-active", "true");
    await expect(page.getByTestId("shopping-dock")).toBeVisible();
    await expect(page.getByTestId("shopping-overview-panel")).toBeVisible();
    await expect(page.getByTestId("editor-command-bar")).toBeVisible();
    await expect(page.getByTestId("room-pan-navigator")).toBeVisible();
    await expect(page.getByTestId("coohom-floor-panel")).toHaveCount(0);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(4);

    const shoppingDockBox = await page.getByTestId("shopping-dock").boundingBox();
    const trayTriggerBox = await page.getByTestId("selection-tray-trigger").boundingBox();
    expect(shoppingDockBox).not.toBeNull();
    expect(trayTriggerBox).not.toBeNull();
    if (!shoppingDockBox || !trayTriggerBox) {
      throw new Error("Shop dock and tray trigger should be measurable");
    }
    expect(shoppingDockBox.x).toBeLessThan(120);
    expect(boxesOverlap(shoppingDockBox, trayTriggerBox)).toBe(false);

    const roomNavigatorBox = await page.getByTestId("room-pan-navigator").boundingBox();
    expect(roomNavigatorBox).not.toBeNull();
    if (!roomNavigatorBox) {
      throw new Error("Room navigator should be measurable");
    }
    expect(boxesOverlap(shoppingDockBox, roomNavigatorBox)).toBe(false);
  });

  test("floor panel creates floors with modes and toggles inactive floor visibility", async ({
    page,
  }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId("coohom-floor-panel")).toBeVisible();
    await expect(page.getByTestId("plan-right-rail")).toBeVisible();
    await expect(page.getByTestId("floating-panel-presets-design-floor-properties")).toHaveCount(0);

    const expandFloorPanel = page.getByRole("button", { name: "Expand floor panel" });
    if (await expandFloorPanel.isVisible().catch(() => false)) {
      await expandFloorPanel.click();
    }
    await page.locator("summary").filter({ hasText: "Add floor" }).click();
    await expect(page.getByTestId("floor-add-upper")).toBeVisible();
    await page.getByTestId("floor-add-upper").click();
    await expect(page.getByTestId("floor-add-mode-menu")).toBeVisible();
    await expect(page.getByText("Choose what to copy into the new level.")).toBeVisible();
    await page.getByLabel("Close floor creation menu").click();
    await expect(page.getByTestId("floor-add-mode-menu")).toHaveCount(0);
    await page.getByTestId("floor-add-upper").click();
    await page.getByTestId("floor-add-mode-blank").click();
    await expect(page.getByTestId("floor-row-2")).toContainText("2F");
    await expect(page.getByTestId("floor-row-1")).toContainText("1F");

    const secondFloorButton = page.getByTestId("floor-row-2").getByRole("button", { name: /2F/ }).first();
    if (await secondFloorButton.isEnabled()) {
      await secondFloorButton.click();
    }
    await page.getByTestId("floor-row-1").getByRole("button", { name: "Hide 1F" }).click();
    await expect(page.getByRole("button", { name: "Show 1F" })).toBeVisible();

    await page.getByTestId("floor-row-1").getByRole("button", { name: /1F/ }).first().click();
    await expect(page.getByTestId("floor-row-1").getByRole("button", { name: "Hide 1F" })).toBeDisabled();

    await page.getByTestId("floor-add-lower").click();
    await expect(page.getByTestId("floor-add-mode-menu")).toBeVisible();
    await page.getByTestId("floor-add-mode-walls").click();
    await expect(page.getByTestId("floor-row-0")).toContainText("B1");

    await page.getByText("Advanced").click();
    await page.getByTestId("floor-rename-open").click();
    await expect(page.getByTestId("floor-rename-dialog")).toBeVisible();
    await page.getByTestId("floor-rename-input").fill("Basement");
    await page.getByTestId("floor-rename-save").click();
    await expect(page.getByTestId("floor-row-0")).toContainText("Basement");

    await page.getByTestId("floor-delete-open").click();
    await expect(page.getByTestId("floor-delete-dialog")).toBeVisible();
    await page.getByTestId("floor-delete-dialog").getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByTestId("floor-delete-dialog")).toHaveCount(0);

    await page.getByLabel("Stacked 3D floors").check();
    await expect(page.getByTestId("floor-stack-control")).toBeVisible();
  });

}

