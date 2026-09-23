import { test, expect } from "./fixtures";
import type { Locator } from "@playwright/test";

async function clickWithFallback(locator: Locator, timeout = 5000) {
  try {
    await locator.click({ timeout });
  } catch {
    await locator.evaluate((node) => {
      node.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
  }
}

test("catalog group names remain readable in the narrow Furnish rail", async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/design");
  await page.waitForLoadState("domcontentloaded");

  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20_000 });
  await clickWithFallback(page.getByTestId("editor-workflow-furnish"));

  const categoryTrigger = page.getByTestId("catalog-category-trigger");
  await expect(categoryTrigger).toBeVisible();
  await clickWithFallback(categoryTrigger);

  const categoryPanel = page.getByTestId("catalog-category-panel");
  await expect(categoryPanel).toBeVisible();

  const labels = page.locator('[data-testid^="catalog-main-group-label-"]');
  await expect(labels.first()).toBeVisible();
  const clippedLabels = await labels.evaluateAll((nodes) =>
    nodes
      .filter(
        (node) =>
          node.scrollWidth > node.clientWidth + 1 ||
          node.scrollHeight > node.clientHeight + 1
      )
      .map((node) => node.textContent?.trim())
  );

  expect(clippedLabels).toEqual([]);
});
