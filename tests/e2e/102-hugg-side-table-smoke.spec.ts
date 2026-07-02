import { test, expect } from "./fixtures";
import { openCatalogPreview } from "./variant-test-utils";

const HUGG_SIDE_TABLE_BASALT_CLOSED_ID =
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed";

test.describe("102. Hugg Side Table Catalog Smoke", () => {
  test("side-table Hugg preserves catalog fabric, wood, and retailer identity", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, HUGG_SIDE_TABLE_BASALT_CLOSED_ID, "Hugg");
    expect(opened).toBeTruthy();

    await expect(page.getByText("Product details")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Hugg Nesting Side Table/i).first()).toBeVisible();
    await expect(page.getByTestId("catalog-detail-add-to-room")).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole("button", { name: /Performance Dune/i }).first()).toBeVisible();

    await page.getByRole("button", { name: /Performance Dune/i }).first().click();
    await page.getByRole("button", { name: /^Black$/i }).first().click();
    await expect(page.getByTestId("catalog-detail-variant-label")).toContainText(/Black/i);
    await expect(page.getByTestId("catalog-detail-add-to-room")).toBeEnabled();
    await expect(page.getByRole("link", { name: /retailer/i })).toBeVisible({ timeout: 10000 });
  });
});
