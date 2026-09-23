import { test, expect } from "./fixtures";
import { waitForCatalogReady } from "./variant-test-utils";

async function openCatalog(page: Parameters<typeof waitForCatalogReady>[0]) {
  const continueToFurnish = page.getByTestId("room-setup-continue-furnish");
  if (await continueToFurnish.isVisible().catch(() => false)) {
    await continueToFurnish.click();
  }
  expect(await waitForCatalogReady(page)).toBe(true);
}

async function selectCatalogCategory(
  page: Parameters<typeof waitForCatalogReady>[0],
  mainGroup: "seating" | "tables",
  category: "sofa" | "coffee_table" | "dining_table",
) {
  await page.getByTestId("catalog-category-trigger").click();
  await page.getByTestId(`catalog-main-group-${mainGroup}`).click();
  await page.getByTestId(`catalog-category-option-${category}`).click();
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

  test("compared product stays resolved after category, search, and price changes", async ({ page }) => {
    test.setTimeout(75_000);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);
    await selectCatalogCategory(page, "seating", "sofa");

    const productId = "sofa-real-castlery-hamilton-2-seater";
    const searchInput = page.getByRole("textbox", { name: "Search catalog products" });
    await searchInput.fill(productId);
    const compareToggle = page.getByTestId(`catalog-compare-toggle-${productId}`);
    await expect(compareToggle).toBeVisible({ timeout: 20_000 });
    await compareToggle.focus();
    await page.keyboard.press("Enter");

    const tray = page.getByTestId("catalog-compare-tray");
    const removeButton = page.getByTestId(`catalog-compare-remove-${productId}`);
    await expect(tray).toContainText("Quick compare (1/3)");
    await expect(removeButton).toBeVisible();
    const variantLabel = await tray.getByTestId("catalog-compare-variant-label").textContent();
    expect(variantLabel?.trim()).toBeTruthy();
    await expect(tray.getByTestId("catalog-compare-variant-label")).toContainText("Brilliant White");

    await searchInput.clear();
    await selectCatalogCategory(page, "tables", "coffee_table");
    await expect(compareToggle).toHaveCount(0);
    await expect(removeButton).toBeVisible();
    await expect(tray.getByTestId("catalog-compare-variant-label")).toHaveText(variantLabel ?? "");

    await searchInput.fill("coffee-real-castlery-peri-120");
    await expect(page.getByTestId("catalog-preview-coffee-real-castlery-peri-120")).toBeVisible({
      timeout: 20_000,
    });
    await expect(removeButton).toBeVisible();

    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Price min (SGD)").fill("99999");
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("catalog-empty-recovery")).toBeVisible({ timeout: 20_000 });
    await expect(tray).toContainText("Quick compare (1/3)");
    await expect(removeButton).toBeVisible();

    await removeButton.focus();
    await page.keyboard.press("Enter");
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
    await expect(page.getByLabel("Curated only")).toHaveCount(0);
    await expect(page.getByLabel("Wall-friendly")).toHaveCount(0);
    await page.getByLabel("Small-room friendly").check();
    await expect(page.getByLabel("Small-room friendly")).toBeChecked();
    await page.getByLabel("Small-room friendly").uncheck();
    await page.getByRole("button", { name: "Close" }).click();

    const previewButtons = page.getByRole("button", { name: "View details" });
    await expect(previewButtons.first()).toBeVisible();
    await previewButtons.first().click();

    await expect(page.getByText("Product details")).toBeVisible();
  });

  test("sofa capacity filters map 2, 3, and 4+ seat products", async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 768 });
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);
    await selectCatalogCategory(page, "seating", "sofa");

    const filtersButton = page.getByRole("button", { name: "Filters" });
    await filtersButton.click();

    const filterDrawer = page.getByTestId("catalog-filter-drawer");
    await expect(filterDrawer).toBeVisible();
    await expect(filterDrawer.getByText("Seat capacity")).toBeVisible();
    const drawerBounds = await filterDrawer.boundingBox();
    expect(drawerBounds).not.toBeNull();
    expect((drawerBounds?.y ?? 0) + (drawerBounds?.height ?? 0)).toBeLessThanOrEqual(768);

    const twoSeater = filterDrawer.getByLabel("2 seater");
    const threeSeater = filterDrawer.getByLabel("3 seater");
    const fourPlusSeater = filterDrawer.getByLabel("4+ seater");
    await expect(twoSeater).toBeEnabled({ timeout: 20_000 });
    await expect(threeSeater).toBeEnabled();
    await expect(fourPlusSeater).toBeEnabled();
    await expect(twoSeater.locator("..")).toContainText(/\d+ options?/);

    await twoSeater.check();
    await expect(page.getByRole("button", { name: "Seats: 2 x" })).toBeVisible();
    await expect(filtersButton).toContainText("1");
    await expect(
      page.getByTestId("catalog-preview-sofa-real-castlery-hamilton-2-seater")
    ).toBeVisible({ timeout: 20_000 });

    await threeSeater.check();
    await expect(page.getByRole("button", { name: "Seats: 2, 3 x" })).toBeVisible();

    await page.getByRole("button", { name: "Close" }).click();
    await page.getByRole("button", { name: "Seats: 2, 3 x" }).click();
    await filtersButton.click();
    await expect(twoSeater).not.toBeChecked();
    await expect(threeSeater).not.toBeChecked();

    await fourPlusSeater.check();
    await expect(page.getByRole("button", { name: "Seats: 4+ x" })).toBeVisible();
    await page.getByRole("button", { name: "Close" }).click();

    const searchInput = page.getByRole("textbox", { name: "Search catalog products" });
    await searchInput.fill("Dawson Pit");
    await expect(
      page.getByTestId("catalog-preview-sofa-real-castlery-dawson-pit-sectional")
    ).toBeVisible({ timeout: 20_000 });
    await searchInput.fill("Dawson 3 Seater");
    await expect(
      page.getByTestId("catalog-preview-sofa-real-castlery-dawson-3s")
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Seats: 4+ x" }).click();
    await expect(
      page.getByTestId("catalog-preview-sofa-real-castlery-dawson-3s")
    ).toBeVisible({ timeout: 20_000 });

    await searchInput.clear();
    await filtersButton.click();
    await twoSeater.check();
    await page.getByRole("button", { name: "Close" }).click();
    await selectCatalogCategory(page, "tables", "coffee_table");
    await expect(page.getByRole("button", { name: "Seats: 2 x" })).toHaveCount(0);
    await filtersButton.click();
    await expect(page.getByText("Seat capacity")).toHaveCount(0);
  });

  test("catalog width filter uses an inclusive centimetre range", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);
    await selectCatalogCategory(page, "tables", "dining_table");

    const filtersButton = page.getByRole("button", { name: "Filters" });
    await filtersButton.click();
    const filterDrawer = page.getByTestId("catalog-filter-drawer");
    const widthMin = filterDrawer.getByLabel("Width min (cm)");
    const widthMax = filterDrawer.getByLabel("Width max (cm)");

    await expect(widthMin).toBeVisible();
    await expect(widthMax).toBeVisible();
    await widthMin.fill("155");
    await widthMax.fill("165");
    await expect(widthMin).toHaveValue("155");
    await expect(widthMax).toHaveValue("165");
    await expect(
      page.getByRole("button", { name: "Width: 155–165 cm x" })
    ).toBeVisible();
    await expect(filtersButton).toContainText("1");

    await page.getByRole("button", { name: "Close" }).click();
    await expect(
      page.getByTestId("catalog-preview-dining-real-castlery-kelsey-marble-160")
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByTestId("catalog-preview-dining-real-castlery-forma-oval-150")
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Width: 155–165 cm x" }).click();
    await filtersButton.click();
    await expect(widthMin).toHaveValue("");
    await expect(widthMax).toHaveValue("");
  });

  test("product drawer receives, contains, and restores keyboard focus", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await openCatalog(page);

    const previewButton = page.locator('[data-testid^="catalog-preview-"]:visible').first();
    await expect(previewButton).toBeVisible();
    await previewButton.focus();
    await page.keyboard.press("Enter");

    const drawer = page.getByTestId("catalog-item-drawer");
    const closeButton = page.getByTestId("catalog-item-drawer-close");
    await expect(drawer).toHaveAttribute("role", "dialog");
    await expect(drawer).toHaveAttribute("aria-modal", "true");
    await expect(closeButton).toBeFocused();

    await page.keyboard.press("Shift+Tab");
    await expect
      .poll(() =>
        page.evaluate(() =>
          Boolean(document.activeElement?.closest('[data-testid="catalog-item-drawer"]'))
        )
      )
      .toBe(true);

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(previewButton).toBeFocused();
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
    await expect(async () => {
      const compareButton = page.getByTestId(compareId);
      await expect(compareButton).toBeVisible();
      await compareButton.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.getByTestId(compareId)).toHaveText("Compared");
    }).toPass({ timeout: 15_000 });

    const tray = page.locator('[data-testid="catalog-compare-tray"]');
    await expect(tray).toBeVisible();
    await expect(page.locator('[data-testid="catalog-compare-clear"]')).toBeVisible();
  });
});
