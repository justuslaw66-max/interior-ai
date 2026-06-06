import { expect, test } from "./fixtures";
import { openCatalogPreview } from "./variant-test-utils";

const OLLIE_ID = "sofa-real-castlery-ollie-storage-ottoman";

test.describe("101. Ollie Swatch Textures", () => {
  test("Ollie stocked fabrics render real Castlery swatch textures", async ({ page }) => {
    test.setTimeout(120000);

    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");

    await expect(page.getByTestId("scene-canvas")).toBeVisible({ timeout: 20000 });

    const opened = await openCatalogPreview(page, OLLIE_ID, "Ollie");
    expect(opened).toBeTruthy();

    await expect(page.getByTestId("catalog-detail-add-to-room")).toBeVisible({ timeout: 10000 });
    await page.getByTestId("catalog-detail-add-to-room").click();

    await expect(page.getByText("Selected Item")).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/Ollie Storage Ottoman/i).first()).toBeVisible();

    const expectedSwatches = [
      { label: "Washed Chenille, Cream", urlPart: "GR4001-Greta-Ivory" },
      { label: "Washed Chenille, Caramel", urlPart: "GR4003-Greta-Mustard-Brown" },
      { label: "Washed Chenille, Moss", urlPart: "GR4004-Greta-Moss" },
    ];

    for (const swatch of expectedSwatches) {
      const button = page.getByRole("button", { name: `Select ${swatch.label}` });
      await expect(button).toBeVisible({ timeout: 10000 });
      await expect
        .poll(async () => button.evaluate((node) => getComputedStyle(node).backgroundImage), {
          message: `${swatch.label} should use the Castlery fabric swatch image`,
        })
        .toContain(swatch.urlPart);
    }
  });
});
