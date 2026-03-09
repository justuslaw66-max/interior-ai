import { test, expect } from "./fixtures";

test.describe.skip("6. Catalog Compare", () => {
  test("quick compare tray supports add and clear", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    const compareButtons = page.locator('[data-testid^="catalog-compare-toggle-"]');
    await expect(compareButtons.first()).toBeVisible({ timeout: 20000 });

    await compareButtons.nth(0).click();
    await compareButtons.nth(1).click();

    const tray = page.locator('[data-testid="catalog-compare-tray"]');
    await expect(tray).toBeVisible();
    await expect(tray).toContainText("Quick compare (2/3)");

    await page.locator('[data-testid="catalog-compare-clear"]').click();
    await expect(tray).toHaveCount(0);
  });

  test("catalog panel search, filters, and drawer open", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    const filtersButton = page.getByRole("button", { name: "Filters" });
    await expect(filtersButton).toBeVisible({ timeout: 20000 });

    await page.getByRole("button", { name: /Accent Chair/ }).click();

    const searchInput = page.getByPlaceholder("Search title, brand, style, finish, SKU...");
    await searchInput.fill("sofa");
    await searchInput.clear();

    await filtersButton.click();
    await expect(page.getByText("Structured Filters")).toBeVisible();
    await page.getByLabel("Small-room friendly").check();
    await page.getByRole("button", { name: "Close" }).click();

    const previewButtons = page.getByRole("button", { name: "Preview" });
    await expect(previewButtons.first()).toBeVisible();
    await previewButtons.first().click();

    await expect(page.getByText("Product details")).toBeVisible();
  });

  test("compare keeps max 3 and replaces oldest", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    const compareButtons = page.locator('[data-testid^="catalog-compare-toggle-"]');
    await expect(compareButtons.nth(0)).toBeVisible({ timeout: 20000 });

    const firstId = await compareButtons.nth(0).getAttribute("data-testid");
    const secondId = await compareButtons.nth(1).getAttribute("data-testid");
    const thirdId = await compareButtons.nth(2).getAttribute("data-testid");
    const fourthId = await compareButtons.nth(3).getAttribute("data-testid");

    await compareButtons.nth(0).click();
    await compareButtons.nth(1).click();
    await compareButtons.nth(2).click();
    await compareButtons.nth(3).click();

    const tray = page.locator('[data-testid="catalog-compare-tray"]');
    await expect(tray).toContainText("Quick compare (3/3)");

    if (firstId) {
      const firstRemove = page.locator(`[data-testid="catalog-compare-remove-${firstId.replace("catalog-compare-toggle-", "")}"]`);
      await expect(firstRemove).toHaveCount(0);
    }

    for (const id of [secondId, thirdId, fourthId]) {
      if (!id) continue;
      const remove = page.locator(`[data-testid="catalog-compare-remove-${id.replace("catalog-compare-toggle-", "")}"]`);
      await expect(remove).toHaveCount(1);
    }
  });

  test("mobile compare tray remains accessible", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    const compareButtons = page.locator('[data-testid^="catalog-compare-toggle-"]');
    await expect(compareButtons.first()).toBeVisible({ timeout: 20000 });
    await compareButtons.first().click();

    const tray = page.locator('[data-testid="catalog-compare-tray"]');
    await expect(tray).toBeVisible();
    await expect(page.locator('[data-testid="catalog-compare-clear"]')).toBeVisible();
  });
});
