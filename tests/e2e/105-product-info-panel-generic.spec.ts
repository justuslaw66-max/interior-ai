import { test, expect } from "./fixtures";
import { openCatalogPreview } from "./variant-test-utils";

const SLOANE_TV_CONSOLE_ID = "tv-real-castlery-sloane-tv-console-150";

test.describe("105. Product Info Panel Generic YAML Details", () => {
  test("imported YAML material and delivery fields render in selected item panel", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, SLOANE_TV_CONSOLE_ID, "Sloane TV Console", [
      /TV Console/i,
      /Sideboard/i,
      /Coffee Table/i,
    ]);
    expect(opened).toBeTruthy();

    await page.getByTestId("catalog-detail-add-to-room").click();
    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });

    await page.getByRole("button", { name: /^Show details$/i }).click();
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(/Body/i);
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(/Engineered Wood/i);
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(/Oak Veneer/i);
    await expect(page.getByTestId("selected-product-details-panel")).toContainText(/Surface finish/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /5-Year Limited Warranty/i,
    );
    await expect(page.getByTestId("selected-product-delivery-warranty-panel")).toContainText(
      /30-day returns/i,
    );
  });
});
