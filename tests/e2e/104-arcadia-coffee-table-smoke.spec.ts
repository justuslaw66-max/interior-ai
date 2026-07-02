import { test, expect } from "./fixtures";
import { addCatalogDrawerItemToRoom, openCatalogPreview } from "./variant-test-utils";

const ARCADIA_COFFEE_TABLE_ID = "coffee-real-castlery-arcadia-coffee-table";

test.describe("104. Arcadia Coffee Table Catalog Smoke", () => {
  test("Arcadia Coffee Table appears with verified Caramel Oak identity", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, ARCADIA_COFFEE_TABLE_ID, "Arcadia");
    expect(opened).toBeTruthy();

    await expect(page.getByText("Product details")).toBeVisible({ timeout: 10000 });
    const drawer = page.getByRole("complementary");
    await expect(drawer.getByText(/^Arcadia Coffee Table$/i)).toBeVisible();
    await expect(page.getByTestId("catalog-detail-variant-label")).toContainText(/Caramel Oak/i);
    await expect(page.getByTestId("catalog-detail-add-to-room")).toBeEnabled();
    await expect(drawer.getByRole("link", { name: /retailer/i })).toHaveAttribute(
      "href",
      /castlery\.com\/sg\/products\/arcadia-coffee-table/i,
    );

    await addCatalogDrawerItemToRoom(page);

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("selected-single-finish-label")).toContainText(/Caramel Oak/i);
    await expect(page.getByTestId("selected-single-finish-swatch")).toBeVisible();
    await expect(page.getByTestId("selected-single-finish-swatch")).toHaveAttribute(
      "style",
      /Arcadia-Coffee-Table-Caramel-Oak-Square-Det_18/i,
    );

    await page.getByRole("button", { name: /^Show details$/i }).click();
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(
      /Engineered wood and oak veneer/i,
    );
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(
      /Low formaldehyde/i,
    );

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    await expect(page.getByTestId("selected-product-dimensions-panel")).toContainText(
      /W120 x D60 x H38cm/i,
    );
    await expect(page.getByTestId("selected-product-dimensions-panel")).toContainText(
      /Max bearing support/i,
    );
    await expect(page.getByTestId("selected-product-dimensions-image")).toHaveAttribute(
      "src",
      /Arcadia-Coffee-Table-Caramel-Oak-Dim/i,
    );

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /5-year limited warranty/i,
    );
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /Legs to be fitted/i,
    );
  });
});
