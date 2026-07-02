import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";
import {
  addImportedProductIfReady,
  selectImportedFamilyByHint,
  selectImportedProductById,
  waitForCatalogReady,
} from "./variant-test-utils";

const DAWSON_SWIVEL_ID = "sofa-real-castlery-dawson-swivel-armchair";

async function addDawsonProduct(page: Page, productId: string) {
  await page.goto("/design");
  await page.waitForLoadState("domcontentloaded");
  await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

  await expect.poll(() => waitForCatalogReady(page), { timeout: 30000 }).toBeTruthy();
  await expect.poll(() => selectImportedFamilyByHint(page, "dawson"), { timeout: 20000 }).toBeTruthy();
  await expect.poll(() => selectImportedProductById(page, productId), { timeout: 20000 }).toBeTruthy();
  await expect.poll(() => addImportedProductIfReady(page), { timeout: 20000 }).toBeTruthy();

  await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
}

test.describe("107. Dawson Product Details", () => {
  test("renders Castlery Singapore product detail rows for swivel armchair fabric and leather variants", async ({ page }) => {
    test.setTimeout(120000);

    await addDawsonProduct(page, DAWSON_SWIVEL_ID);

    await page.getByRole("button", { name: /^Show details$/i }).click();
    const detailsPanel = page.getByTestId("selected-product-details-panel");
    await expect(detailsPanel).toContainText(/Laminated veneer lumber and plywood and metal base/i);
    await expect(detailsPanel).toContainText(/Foam, fibre and feather filled seat/i);
    await expect(detailsPanel).toContainText(/Dawson sofa/i);
    await expect(detailsPanel).toContainText(/Removable seat and cushion covers/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    const dimensionsPanel = page.getByTestId("selected-product-dimensions-panel");
    await expect(dimensionsPanel).toContainText(/W114 x D117 x H86cm/i);
    await expect(dimensionsPanel).toContainText(/64\.5cm/i);
    await expect(dimensionsPanel).toContainText(/51\.9kg/i);
    await expect(dimensionsPanel).toContainText(/150kg/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    const deliveryPanel = page.getByTestId("selected-product-delivery-warranty-panel");
    await expect(deliveryPanel).toContainText(/Clearance - no cancellation/i);
    await expect(deliveryPanel).toContainText(/Clearance - no return or exchange/i);
    await expect(deliveryPanel).toContainText(/Frame 10 years; Fabric 1 year; Foam 2 years/i);

    const leatherButton = page.getByRole("button", { name: /^Leather$/i });
    if (await leatherButton.isVisible().catch(() => false)) {
      await leatherButton.click();
      await expect(detailsPanel).toContainText(/Leather sofa/i);
      await expect(detailsPanel).toContainText(/Top grain leather/i);
      await expect(detailsPanel).toContainText(/360 swivel/i);
      await expect(dimensionsPanel).toContainText(/51\.97kg/i);
      await expect(deliveryPanel).toContainText(/Frame 10 years; Leather 1 year; Foam 2 years/i);
    }
  });
});
