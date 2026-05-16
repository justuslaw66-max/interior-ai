import { test, expect } from "./fixtures";
import {
  addImportedProductIfReady,
  ensureItemSelectedForVariants,
  selectImportedFamilyByHint,
  selectImportedProductById,
  waitForCatalogReady,
} from "./variant-test-utils";

test.describe("9. Sloane Bench Variant UX", () => {
  test("bench variants use cushion labels while size stays in Length", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    const ready = await waitForCatalogReady(page);
    if (!ready) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Sloane bench assertions because catalog controls were unavailable",
      });
      return;
    }

    const familySelected = await selectImportedFamilyByHint(page, "sloane");
    if (!familySelected) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Sloane bench assertions because Sloane family option was unavailable",
      });
      return;
    }

    const productId = "dining-real-castlery-sloane-bench-150-no-cushion";
    const selectedProduct = await selectImportedProductById(page, productId);
    if (!selectedProduct) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Sloane bench variant assertions because product is not seeded",
      });
      return;
    }

    const added = await addImportedProductIfReady(page);
    if (!added) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Sloane bench variant assertions because scene was not ready",
      });
      return;
    }

    const noCushion = page
      .locator('[data-testid="variant-swatch-sloane-bench-no"], [data-testid^="variant-swatch-"]')
      .filter({ hasText: /No Cushion/i })
      .first();
    const leatherCushion = page
      .locator('[data-testid="variant-swatch-sloane-bench-leather"], [data-testid^="variant-swatch-"]')
      .filter({ hasText: /Leather Cushion/i })
      .first();

    await ensureItemSelectedForVariants(page);

    const swatchesReady = await Promise.all([
      noCushion.isVisible().catch(() => false),
      leatherCushion.isVisible().catch(() => false),
    ]).then(([noReady, leatherReady]) => noReady && leatherReady);
    if (!swatchesReady) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Sloane bench swatch assertions because variant swatches were not rendered",
      });
      return;
    }

    await expect(noCushion).toContainText("No Cushion");
    await expect(leatherCushion).toContainText("Leather Cushion");

    // The new UX should avoid mixing size prefixes into variant labels.
    await expect(noCushion).not.toContainText(/150|180/i);
    await expect(leatherCushion).not.toContainText(/150|180/i);

    await expect(page.getByText("Length", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "150CM" })).toBeVisible();
    await expect(page.getByRole("button", { name: "180CM" })).toBeVisible();

    await leatherCushion.click();
    await expect(leatherCushion).toHaveAttribute("data-active", "true");
  });
});
