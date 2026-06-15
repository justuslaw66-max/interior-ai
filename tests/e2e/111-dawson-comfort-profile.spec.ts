import { expect, test } from "./fixtures";
import { openCatalogPreview } from "./variant-test-utils";

const DAWSON_3S_ID = "sofa-real-castlery-dawson-3s";

test.describe("111. Dawson Comfort Profile", () => {
  test("renders Castlery Singapore seat-feel ratings in the catalog preview drawer", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    const opened = await openCatalogPreview(page, DAWSON_3S_ID, "Dawson 3 Seater", [/^Sofa \(/]);
    expect(opened).toBeTruthy();

    const comfortProfile = page.getByTestId("catalog-comfort-profile");
    await expect(comfortProfile).toBeVisible({ timeout: 10000 });
    await expect(comfortProfile).toContainText(/Seat feel/i);
    await expect(comfortProfile).toContainText(/Seat comfort/i);
    await expect(comfortProfile).toContainText(/Relaxed/i);
    await expect(comfortProfile).toContainText(/Upright/i);
    await expect(comfortProfile).toContainText(/Seat depth/i);
    await expect(comfortProfile).toContainText(/Shallow/i);
    await expect(comfortProfile).toContainText(/Deep/i);
    await expect(comfortProfile).toContainText(/Seat height/i);
    await expect(comfortProfile).toContainText(/Low/i);
    await expect(comfortProfile).toContainText(/High/i);
    await expect(comfortProfile).toContainText(/Seat softness/i);
    await expect(comfortProfile).toContainText(/Soft/i);
    await expect(comfortProfile).toContainText(/Firm/i);

    await expect(page.locator('[aria-label="Seat comfort: 1 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat depth: 4 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat height: 4 of 5"]')).toBeVisible();
    await expect(page.locator('[aria-label="Seat softness: 1 of 5"]')).toBeVisible();
  });
});
