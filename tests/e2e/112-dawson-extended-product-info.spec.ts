import { expect, test } from "./fixtures";
import { addCatalogDrawerItemToRoom, openCatalogPreview } from "./variant-test-utils";

const DAWSON_EXTENDED_ID = "sofa-real-castlery-dawson-extended-sofa";

test.describe("112. Dawson Extended Sofa Product Info", () => {
  test("renders Castlery SG product details and seat-feel ratings", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, DAWSON_EXTENDED_ID, "Dawson Extended", [/^Sofa \(/]);
    expect(opened).toBeTruthy();

    const comfortProfile = page.getByTestId("catalog-comfort-profile");
    await expect(comfortProfile).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[aria-label="Seat comfort: 1 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat depth: 4 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat height: 4 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat softness: 1 of 5"]')).toBeVisible();

    await addCatalogDrawerItemToRoom(page);
    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Dawson Extended Sofa|Dawson/i).first()).toBeVisible();

    await page.getByRole("button", { name: /^Show details$/i }).click();
    const detailsPanel = page.getByTestId("selected-product-details-panel");
    await expect(detailsPanel).toContainText(/Fabric composition/i);
    await expect(detailsPanel).toContainText(/93% Polyester, 7% Linen/i);
    await expect(detailsPanel).toContainText(/Fully removable covers/i);
    await expect(detailsPanel).toContainText(/Safer Indoor Air, Formaldehyde Safe/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    const dimensionsPanel = page.getByTestId("selected-product-dimensions-panel");
    await expect(dimensionsPanel).toContainText(/W321 x D114 x H81cm/i);
    await expect(dimensionsPanel).toContainText(/Seatable width/i);
    await expect(dimensionsPanel).toContainText(/279cm/i);
    await expect(dimensionsPanel).toContainText(/98\.8kg/i);
    await expect(dimensionsPanel).toContainText(/3 boxes/i);
    await expect(dimensionsPanel).toContainText(/3 x 150kg/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    const deliveryPanel = page.getByTestId("selected-product-delivery-warranty-panel");
    await expect(deliveryPanel).toContainText(/Frame 10 years; Fabric 1 year; Foam 2 years/i);
    await expect(deliveryPanel).toContainText(/30-day returns/i);
    await expect(deliveryPanel).toContainText(/Fully assembled/i);
  });

});
