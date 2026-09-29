import { expect, test } from "./fixtures";
import { chooseStartTemplate, selectEditorWorkspace } from "./variant-test-utils";

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
] as const;

async function clearEditorStorage(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

// UX 4d (AX1): the visible buttons, selects and text fields in a phone's sheet or Menu that are
// under 44px tall (a product card's name is exempt: the card's height is fixed).
async function smallTouchTargets(scope: import("@playwright/test").Locator) {
  return scope.evaluate((root) =>
    [...root.querySelectorAll<HTMLElement>(
      'button, select, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="file"]):not([type="hidden"])'
    )]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && !element.closest("[hidden]") && !element.hasAttribute("data-touch-exempt") &&
          getComputedStyle(element).visibility !== "hidden" && box.height < 43.5;
      })
      .map((element) => `${element.dataset.testid ?? element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 24)}: ${Math.round(element.getBoundingClientRect().height)}px`)
  );
}

async function openTemplatePlan(page: import("@playwright/test").Page) {
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState("networkidle");

  // New design sits in the More menu.
  await page.getByTestId("editor-command-overflow").click();
  const newPlan = page.getByTestId("editor-command-new-plan");
  await expect(newPlan).toBeVisible();
  await expect(newPlan).toHaveAccessibleName("Start a new design");
  const newPlanBox = await newPlan.boundingBox();
  expect(newPlanBox, "New plan should be measurable").not.toBeNull();
  expect(newPlanBox?.width ?? 0, "New plan should be finger-friendly").toBeGreaterThanOrEqual(36);
  expect(newPlanBox?.height ?? 0, "New plan should be finger-friendly").toBeGreaterThanOrEqual(36);
  expect((newPlanBox?.x ?? 0) + (newPlanBox?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? Number.POSITIVE_INFINITY
  );
  await newPlan.click();

  // New design opens Start a new design, and asks before replacing the current design.
  await chooseStartTemplate(page, "studio");
  await expect(page.getByTestId("new-plan-choice-dialog")).toBeVisible();
  await page.getByTestId("new-plan-replace-current").click();
  await expect(page.getByTestId("room-plan-status")).toHaveCount(1, { timeout: 20000 });
  await page.getByRole("button", { name: "2D", exact: true }).click();
  await expect(page.getByTestId("plan-guided-actions-toggle")).toBeVisible();
}

// UX 4d: on phones the step panel is a sheet over the canvas, sitting on the step bar. Its handle is
// a 44px button that expands it to full (8px under the canvas pills) and back to half; Ctrl/⌘ B or
// a drag down leaves just its title (peek).
test("the phone's step sheet expands, peeks and comes back", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearEditorStorage(page);
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
  const sheet = page.getByTestId("design-controls-panel");
  const handle = page.getByTestId("design-controls-panel-handle");
  const body = page.locator("#design-controls-sheet-body");
  await expect(page.getByTestId("editor-design-sidebar-toggle")).toHaveCount(0);
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");
  await expect(handle).toHaveAccessibleName("Expand panel");
  await expect(handle).toHaveAttribute("aria-expanded", "false");
  expect((await handle.boundingBox())?.height).toBe(44);
  const half = await sheet.boundingBox();
  expect(Math.round(half!.y + half!.height), "The sheet sits on the step bar").toBe(844 - 64);
  expect(Math.round(half!.height)).toBe(388);

  await handle.click();
  await expect(sheet).toHaveAttribute("data-sheet-snap", "full");
  await expect(handle).toHaveAccessibleName("Collapse panel");
  await expect(handle).toHaveAttribute("aria-expanded", "true");
  await expect.poll(async () => Math.round((await sheet.boundingBox())?.y ?? 0)).toBe(128);
  const pills = await page.getByTestId("canvas-history-pill").boundingBox();
  expect(pills!.y + pills!.height).toBeLessThanOrEqual(128);
  await handle.click();
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");

  await handle.focus();
  await page.keyboard.press("Control+b");
  await expect(sheet).toHaveAttribute("data-sheet-snap", "peek");
  await expect(body).toBeHidden();
  await expect.poll(async () => Math.round((await sheet.boundingBox())?.height ?? 0)).toBe(92);
  await handle.click();
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");
  await expect(body).toBeVisible();

  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 320, { steps: 8 });
  await page.mouse.up();
  await expect(sheet).toHaveAttribute("data-sheet-snap", "peek");
});

// UX 4d (audit AX2): a door or window picked on a phone's plan shows its inspector in the sheet,
// opening a peeking sheet, with Done to put the step's panel back.
test("a phone shows the picked window's inspector in the step sheet", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearEditorStorage(page);
  await openTemplatePlan(page);
  await page.getByTestId("plan-guided-actions-toggle").click();
  const sheet = page.getByTestId("design-controls-panel");
  const slot = page.getByTestId("phone-sheet-inspector");
  await page.getByTestId("design-controls-panel-handle").focus();
  await page.keyboard.press("Control+b");
  await expect(sheet).toHaveAttribute("data-sheet-snap", "peek");
  await expect(slot).toBeHidden();

  await page.locator('[data-testid="plan-opening-kind-label"][data-opening-kind="window"]').first().click();
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");
  await expect(slot.getByTestId("selection-inspector")).toBeVisible();
  await expect(slot.getByTestId("selection-inspector-opening-dimensions")).toBeVisible();
  await expect(sheet.locator("h2")).toBeHidden();
  await expect(page.getByTestId("selected-plan-opening-actions")).toBeHidden();
  expect(await smallTouchTargets(sheet), "The inspector's controls are 44px targets.").toEqual([]);
  const done = slot.getByTestId("selection-inspector-clear");
  await expect(done).toHaveText("Done");
  expect((await done.boundingBox())?.height).toBeGreaterThanOrEqual(44);

  await done.click();
  await expect(page.getByTestId("selection-inspector")).toHaveCount(0);
  await expect(slot).toBeHidden();
  await expect(sheet.locator("h2")).toBeVisible();
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");
});

// UX 4d (AX1): on a phone the sheet's and the Menu's controls are 44px targets, and fields use 16px
// text, so iOS doesn't zoom in when one takes focus.
test("a phone's sheet and Menu are made of 44px targets", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await clearEditorStorage(page);
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
  const sheet = page.getByTestId("design-controls-panel");
  await expect(sheet).toHaveAttribute("data-sheet-snap", "half");
  expect(await smallTouchTargets(sheet), "Plan").toEqual([]);

  await page.getByTestId("editor-command-overflow").click();
  const menu = page.getByTestId("editor-command-overflow-menu");
  await expect(menu).toBeVisible();
  expect(await smallTouchTargets(menu), "Menu").toEqual([]);
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await selectEditorWorkspace(page, "editor-workflow-furnish");
  const search = page.getByTestId("catalog-search-input");
  await expect(search).toBeVisible({ timeout: 20000 });
  await expect(search).toHaveCSS("font-size", "16px");
  expect(await smallTouchTargets(sheet), "Furnish").toEqual([]);
});

test.describe("20. Mobile Plan Mode", () => {
  for (const viewport of VIEWPORTS) {
    test(`consumer plan controls stay usable on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await clearEditorStorage(page);
      await openTemplatePlan(page);

      await expect(page.getByTestId("room-plan-status")).toHaveAttribute("data-compact", "true");
      await expect(page.getByTestId("room-plan-status-fit-view")).toHaveText("Fit");
      await expect(page.getByRole("button", { name: /^Fit (room|to screen)$/ }).first()).toBeVisible();
      await expect(page.getByTestId("plan-guided-actions-toggle")).toBeVisible();
      await expect(page.getByTestId("plan-guided-actions-toggle")).toHaveAttribute("role", "switch");

      // Tips is on by default and is the one switch (UX audit ED6): no "Plan mode" choice first.
      await expect(page.getByTestId("plan-guided-actions-toggle")).toHaveAttribute("data-enabled", "true");
      await expect(page.getByRole("switch", { name: "Tips" })).toBeVisible();
      if (viewport.name === "phone") {
        // On a phone the tip sits above the open Plan sheet, so its buttons never cover the sheet's.
        const tip = page.getByTestId("plan-canvas-guidance");
        const sheet = page.getByTestId("design-controls-panel");
        await expect(tip).toBeVisible();
        await expect(sheet).toBeVisible();
        const [tipBox, sheetBox] = await Promise.all([tip.boundingBox(), sheet.boundingBox()]);
        expect((tipBox?.y ?? Infinity) + (tipBox?.height ?? 0)).toBeLessThanOrEqual(sheetBox?.y ?? 0);
      }
      await page.getByTestId("plan-guided-actions-toggle").click();

      await expect(page.getByTestId("plan-guided-actions-toggle")).toHaveAttribute("data-enabled", "false");
      await expect(page.getByTestId("plan-manual-quick-actions")).toBeVisible();
      // Tips sits under the quick actions (UX 4d), and on a phone every one is a 44px target.
      const [quickBox, tipsBox] = await Promise.all([
        page.getByTestId("plan-manual-quick-actions").boundingBox(),
        page.getByTestId("plan-guided-actions-toggle").boundingBox(),
      ]);
      expect(tipsBox!.y).toBeGreaterThanOrEqual(quickBox!.y + quickBox!.height);
      const minTarget = viewport.name === "phone" ? 44 : 36;

      for (const testId of [
        "manual-plan-action-select",
        "manual-plan-action-draw",
        "manual-plan-action-door",
        "manual-plan-action-window",
        "manual-plan-action-fit",
      ]) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box, `${testId} should be measurable`).not.toBeNull();
        expect(box?.width ?? 0, `${testId} should be finger-friendly`).toBeGreaterThanOrEqual(minTarget);
        expect(box?.height ?? 0, `${testId} should be finger-friendly`).toBeGreaterThanOrEqual(minTarget);
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(4);
    });
  }
});
