import { expect, test } from "./fixtures";
import { addCatalogDrawerItemToRoom, openCatalogPreview } from "./variant-test-utils";

const DAWSON_WIDE_CHAISE_ID = "sofa-real-castlery-dawson-wide-chaise-sectional";

test.describe("114. Dawson Wide Chaise Product Info", () => {
  test("renders Castlery SG product details and distinct seat-feel ratings", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await expect(page.getByTestId("scene-canvas").first()).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, DAWSON_WIDE_CHAISE_ID, "Dawson Wide Chaise", [/^Sofa \(/]);
    expect(opened).toBeTruthy();

    const comfortProfile = page.getByTestId("catalog-comfort-profile");
    await expect(comfortProfile).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[aria-label="Seat comfort: 1 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat depth: 5 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat height: 4 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat softness: 1 of 5"]')).toBeVisible();

    await addCatalogDrawerItemToRoom(page);
    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Dawson Wide Chaise Sectional Sofa/i).first()).toBeVisible();

    await page.getByRole("button", { name: /^Show details$/i }).click();
    const detailsPanel = page.getByTestId("selected-product-details-panel");
    await expect(detailsPanel).toContainText(/Frame: laminated veneer lumber with plywood/i);
    await expect(detailsPanel).toContainText(/93% Polyester, 7% Linen/i);
    await expect(detailsPanel).toContainText(/Removable cushion cover and frame cover/i);
    await expect(detailsPanel).toContainText(/Low formaldehyde/i);

    await page.getByRole("button", { name: /^Full dimensions$/i }).click();
    const dimensionsPanel = page.getByTestId("selected-product-dimensions-panel");
    await expect(dimensionsPanel).toContainText(/W207\/357 x D114\/166 x H81cm/i);
    await expect(dimensionsPanel).toContainText(/Seating depth/i);
    await expect(dimensionsPanel).toContainText(/112cm/i);
    await expect(dimensionsPanel).toContainText(/Seatable width/i);
    await expect(dimensionsPanel).toContainText(/316cm/i);
    await expect(dimensionsPanel).toContainText(/126\.6kg/i);
    await expect(dimensionsPanel).toContainText(/3 boxes/i);

    await page.getByRole("button", { name: /^Delivery & warranty$/i }).click();
    const deliveryPanel = page.getByTestId("selected-product-delivery-warranty-panel");
    await expect(deliveryPanel).toContainText(/Frame 10 years; Fabric 1 year; Foam 2 years/i);
    await expect(deliveryPanel).toContainText(/30-day returns/i);
    await expect(deliveryPanel).toContainText(/Fully assembled/i);
  });
});
