import { expect, test } from "./fixtures";

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

async function openTemplatePlan(page: import("@playwright/test").Page) {
  await page.goto("/design", { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 30000 });
  await page.waitForLoadState("networkidle");

  const newPlan = page.getByTestId("editor-command-new-plan");
  await expect(newPlan).toBeVisible();
  await expect(newPlan).toHaveAccessibleName("Start a new floor plan");
  const newPlanBox = await newPlan.boundingBox();
  expect(newPlanBox, "New plan should be measurable").not.toBeNull();
  expect(newPlanBox?.width ?? 0, "New plan should be finger-friendly").toBeGreaterThanOrEqual(36);
  expect(newPlanBox?.height ?? 0, "New plan should be finger-friendly").toBeGreaterThanOrEqual(36);
  expect((newPlanBox?.x ?? 0) + (newPlanBox?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? Number.POSITIVE_INFINITY
  );
  await newPlan.click();

  const starterPlanPicker = page.getByTestId("starter-floor-plan-picker");
  if (await starterPlanPicker.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.getByTestId("apply-plan-template-studio").click();
  }
  await expect(page.getByTestId("room-plan-status")).toHaveCount(1, { timeout: 20000 });
  await page.getByRole("button", { name: "2D Plan", exact: true }).click();
  await expect(page.getByTestId("plan-guided-actions-toggle")).toBeVisible();
}

test.describe("20. Mobile Plan Mode", () => {
  for (const viewport of VIEWPORTS) {
    test(`consumer plan controls stay usable on ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await clearEditorStorage(page);
      await openTemplatePlan(page);

      await expect(page.getByTestId("room-plan-status")).toHaveAttribute("data-compact", "true");
      await expect(page.getByTestId("room-plan-status-fit-view")).toHaveText("Fit");
      await expect(page.getByRole("button", { name: /^Fit (room|plan)$/ }).first()).toBeVisible();
      await expect(page.getByTestId("plan-guided-actions-toggle")).toBeVisible();
      await expect(page.getByTestId("plan-guided-actions-toggle")).toHaveAttribute("role", "switch");

      const choiceManual = page.getByTestId("plan-guided-actions-choice-manual");
      if (await choiceManual.isVisible().catch(() => false)) {
        await choiceManual.click();
      } else {
        await page.getByTestId("plan-guided-actions-toggle").click();
      }

      await expect(page.getByTestId("plan-guided-actions-toggle")).toHaveAttribute("data-enabled", "false");
      await expect(page.getByTestId("plan-manual-quick-actions")).toBeVisible();

      for (const testId of [
        "manual-plan-action-select",
        "manual-plan-action-draw",
        "manual-plan-action-door",
        "manual-plan-action-window",
        "manual-plan-action-fit",
      ]) {
        const box = await page.getByTestId(testId).boundingBox();
        expect(box, `${testId} should be measurable`).not.toBeNull();
        expect(box?.width ?? 0, `${testId} should be finger-friendly`).toBeGreaterThanOrEqual(36);
        expect(box?.height ?? 0, `${testId} should be finger-friendly`).toBeGreaterThanOrEqual(36);
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow).toBeLessThanOrEqual(4);
    });
  }
});
