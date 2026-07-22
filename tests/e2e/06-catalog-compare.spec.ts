import { test, expect } from "./fixtures";
import { waitForCatalogReady } from "./variant-test-utils";

async function openCatalog(page: Parameters<typeof waitForCatalogReady>[0]) {
  const continueToFurnish = page.getByTestId("room-setup-continue-furnish");
  if (await continueToFurnish.isVisible().catch(() => false)) {
    await continueToFurnish.click();
  }
  expect(await waitForCatalogReady(page)).toBe(true);
}

async function visibleCompareIds(page: Parameters<typeof waitForCatalogReady>[0], count: number) {
  const compareButtons = page.locator('[data-testid^="catalog-compare-toggle-"]');
  await expect(compareButtons.nth(count - 1)).toBeVisible({ timeout: 20000 });
  const ids = await compareButtons.evaluateAll((buttons, requestedCount) =>
    buttons
      .slice(0, requestedCount)
      .map((button) => button.getAttribute("data-testid"))
      .filter((id): id is string => Boolean(id)),
  count);
  expect(ids).toHaveLength(count);
  return ids;
}

test.describe("6. Catalog Compare", () => {
  test("quick compare tray supports add and clear", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);

    const compareIds = await visibleCompareIds(page, 2);
    await page.getByTestId(compareIds[0]).click();
    await page.getByTestId(compareIds[1]).click();

    const tray = page.locator('[data-testid="catalog-compare-tray"]');
    await expect(tray).toBeVisible();
    await expect(tray).toContainText("Quick compare (2/3)");

    await page.locator('[data-testid="catalog-compare-clear"]').click();
    await expect(tray).toHaveCount(0);
  });

  test("catalog panel search, filters, and drawer open", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);

    const filtersButton = page.getByRole("button", { name: "Filters" });
    await expect(filtersButton).toBeVisible({ timeout: 20000 });

    const searchInput = page.getByRole("textbox", { name: "Search catalog products" });
    await searchInput.fill("sofa");
    await searchInput.clear();

    await filtersButton.click();
    await expect(page.getByText("Structured Filters")).toBeVisible();
    await page.getByLabel("Small-room friendly").check();
    await expect(page.getByLabel("Small-room friendly")).toBeChecked();
    await page.getByLabel("Small-room friendly").uncheck();
    await page.getByRole("button", { name: "Close" }).click();

    const previewButtons = page.getByRole("button", { name: "View details" });
    await expect(previewButtons.first()).toBeVisible();
    await previewButtons.first().click();

    await expect(page.getByText("Product details")).toBeVisible();
  });

  test("compare keeps max 3 and replaces oldest", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);

    const [firstId, secondId, thirdId, fourthId] = await visibleCompareIds(page, 4);

    for (const id of [firstId, secondId, thirdId, fourthId]) {
      await page.getByTestId(id).click();
    }

    const tray = page.locator('[data-testid="catalog-compare-tray"]');
    await expect(tray).toContainText("Quick compare (3/3)");

    const firstRemove = page.locator(`[data-testid="catalog-compare-remove-${firstId.replace("catalog-compare-toggle-", "")}"]`);
    await expect(firstRemove).toHaveCount(0);

    for (const id of [secondId, thirdId, fourthId]) {
      const remove = page.locator(`[data-testid="catalog-compare-remove-${id.replace("catalog-compare-toggle-", "")}"]`);
      await expect(remove).toHaveCount(1);
    }
  });

  test("mobile compare tray remains accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);

    const [compareId] = await visibleCompareIds(page, 1);
    await page.getByTestId(compareId).click();

    const tray = page.locator('[data-testid="catalog-compare-tray"]');
    await expect(tray).toBeVisible();
    await expect(page.locator('[data-testid="catalog-compare-clear"]')).toBeVisible();
  });
});
