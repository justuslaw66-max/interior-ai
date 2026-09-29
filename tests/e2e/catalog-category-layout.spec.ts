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

test("category chips stay readable in the narrow Furnish rail", async ({ page }) => {
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

  // One row of chips that scrolls sideways (FU1): no label is cut, and none wraps to a second line.
  const chipRow = page.getByTestId("catalog-category-chips");
  await expect(chipRow).toBeVisible();
  const chips = chipRow.getByRole("button");
  await expect(chips.first()).toBeVisible();
  const clippedLabels = await chips.evaluateAll((nodes) =>
    nodes
      .filter(
        (node) =>
          node.scrollWidth > node.clientWidth + 1 ||
          node.scrollHeight > node.clientHeight + 1
      )
      .map((node) => node.textContent?.trim())
  );
  expect(clippedLabels).toEqual([]);
  const rowTops = await chips.evaluateAll(
    (nodes) => new Set(nodes.map((node) => Math.round(node.getBoundingClientRect().top))).size
  );
  expect(rowTops).toBe(1);

  const sofas = chipRow.getByRole("button", { name: "Sofas", exact: true });
  await clickWithFallback(sofas);
  await expect(sofas).toHaveAttribute("aria-pressed", "true");
  await expect(chipRow.getByRole("button", { name: "All", exact: true })).toHaveAttribute("aria-pressed", "false");
});
