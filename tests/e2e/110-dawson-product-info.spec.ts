import { expect, test } from "./fixtures";
import {
  addImportedProductIfReady,
  addCatalogDrawerItemToRoom,
  openCatalogPreview,
  selectImportedFamilyByHint,
  selectImportedProductById,
} from "./variant-test-utils";

const DAWSON_3S_ID = "sofa-real-castlery-dawson-3s";

test.describe("110. Dawson Product Info", () => {
  test("Dawson 3 Seater Sofa renders Castlery SG product details in selected item panel", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, DAWSON_3S_ID, "Dawson 3 Seater", [/^Sofa \(/]);
    if (opened) {
      await addCatalogDrawerItemToRoom(page);
    } else {
      await expect(selectImportedFamilyByHint(page, "Dawson")).resolves.toBeTruthy();
      await expect(selectImportedProductById(page, DAWSON_3S_ID)).resolves.toBeTruthy();
      await expect(addImportedProductIfReady(page)).resolves.toBeTruthy();
    }

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Dawson 3 Seater Sofa|Dawson/i).first()).toBeVisible();
    const availability = page.getByTestId("selected-item-availability");
    await expect(availability).toBeVisible();
    await expect(availability).toContainText("External retailer");
    await expect(availability).toContainText("Check stock");
    const liveAvailabilityButton = availability.getByRole("button", {
      name: /Check current stock and delivery at Castlery/i,
    });
    await expect(liveAvailabilityButton).toBeVisible();
    await page.context().route(/^https:\/\/www\.castlery\.com\/sg\/products\//, (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<title>Castlery availability</title>",
      }),
    );
    const retailerPopupPromise = page.waitForEvent("popup", { timeout: 15000 });
    await liveAvailabilityButton.click();
    const retailerPopup = await retailerPopupPromise;
    await expect.poll(() => retailerPopup.url(), { timeout: 15000 }).toContain("castlery.com/sg/products");
    await retailerPopup.close().catch(() => null);

    await page.getByRole("button", { name: /^Show details$/i }).click();
    const detailsPanel = page.getByTestId("selected-product-details-panel");
    await expect(detailsPanel).toContainText(/Fabric composition/i);
    await expect(detailsPanel).toContainText(/93% Polyester, 7% Linen/i);
    await expect(detailsPanel).toContainText(/Fully removable covers/i);
    await expect(detailsPanel).toContainText(/Low formaldehyde/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    const dimensionsPanel = page.getByTestId("selected-product-dimensions-panel");
    await expect(dimensionsPanel).toContainText(/W228 x D114 x H81cm/i);
    await expect(dimensionsPanel).toContainText(/Seatable width/i);
    await expect(dimensionsPanel).toContainText(/186cm/i);
    await expect(dimensionsPanel).toContainText(/2 x 150kg/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    const deliveryPanel = page.getByTestId("selected-product-delivery-warranty-panel");
    await expect(deliveryPanel).toContainText(/Frame 10 years; Fabric 1 year; Foam 2 years/i);
    await expect(deliveryPanel).toContainText(/30-day returns/i);
    await expect(deliveryPanel).toContainText(/Fully assembled/i);
  });
});
