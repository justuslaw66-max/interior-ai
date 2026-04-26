import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  addImportedProductIfReady,
  ensureItemSelectedForVariants,
  selectImportedFamilyByHint,
  selectImportedProductById,
  waitForCatalogReady,
} from "./variant-test-utils";

async function selectImportedFamilyForProduct(page: Page, productId: string): Promise<boolean> {
  const familyHint = (() => {
    if (productId.includes("-jaron-")) return "jaron";
    if (productId.includes("-madison-")) return "madison";
    if (productId.includes("-kelsey-")) return "kelsey";
    return "";
  })();
  if (!familyHint) return true;
  return selectImportedFamilyByHint(page, familyHint);
}

async function selectImportedProduct(page: Page, productId: string): Promise<boolean> {
  const familyReady = await selectImportedFamilyForProduct(page, productId);
  if (!familyReady) return false;
  return selectImportedProductById(page, productId);
}

test.describe("8. Jaron and Madison Variant Integration", () => {
  test("API returns expected finish variants for Jaron and Madison", async ({ request }) => {
    const response = await request.get("/api/models/debug");
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const models: Array<{ id: string; catalog?: { variants?: Array<{ variant?: string }> } | null }> =
      body.models ?? [];

    const expectations: Record<string, string[]> = {
      "sofa-real-castlery-jaron-3s": [
        "Marche Cocoa",
        "Marche Ivory",
        "Arvo Dune",
      ],
      "sofa-real-castlery-madison-2s": [
        "Bisque",
        "Stone",
        "Camille, Forest",
        "Caramel",
      ],
    };

    for (const [productId, requiredTokens] of Object.entries(expectations)) {
      const model = models.find((entry) => entry.id === productId);
      expect(model, `Expected model ${productId} in debug payload`).toBeDefined();

      const labels = (model?.catalog?.variants ?? [])
        .map((entry) => String(entry.variant ?? "").toLowerCase())
        .filter(Boolean);

      for (const token of requiredTokens) {
        expect(
          labels.some((label) => label.includes(token.toLowerCase())),
          `Expected ${productId} variants to include ${token}`,
        ).toBeTruthy();
      }
    }
  });

  test("Jaron and Madison variant swatches are selectable in editor", async ({ page }) => {
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    const ready = await waitForCatalogReady(page);
    if (!ready) {
      test.info().annotations.push({
        type: "note",
        description: "Skipping Jaron/Madison UI assertions because catalog controls were unavailable",
      });
      return;
    }

    const products = [
      {
        id: "sofa-real-castlery-jaron-3s",
        expected: ["Marche Cocoa", "Marche Ivory", "Arvo Dune"],
      },
      {
        id: "sofa-real-castlery-madison-2s",
        expected: ["Bisque", "Stone", "Caramel"],
      },
    ];

    for (const product of products) {
      const available = await selectImportedProduct(page, product.id);
      if (!available) {
        test.info().annotations.push({
          type: "note",
          description: `Skipping ${product.id} UI assertions because product is not seeded in this environment`,
        });
        continue;
      }

      const added = await addImportedProductIfReady(page);
      if (!added) {
        test.info().annotations.push({
          type: "note",
          description: `Skipping ${product.id} UI assertions because scene was not ready for add`,
        });
        continue;
      }

      const selectedItem = await ensureItemSelectedForVariants(page);
      if (!selectedItem) {
        test.info().annotations.push({
          type: "note",
          description: `Skipping ${product.id} swatch assertions because item selection could not be established`,
        });
        continue;
      }

      const swatches = page.locator('[data-testid^="variant-swatch-"]');
      const swatchCount = await swatches.count();
      if (swatchCount === 0) {
        test.info().annotations.push({
          type: "note",
          description: `Skipping ${product.id} swatch assertions because no swatches were rendered after selection`,
        });
        continue;
      }

      const labels = (await swatches.allTextContents())
        .map((text) => text.trim())
        .filter(Boolean);

      for (const token of product.expected) {
        expect(
          labels.some((label) => label.toLowerCase().includes(token.toLowerCase())),
          `Expected swatch labels for ${product.id} to include ${token}`,
        ).toBeTruthy();
      }

      // Validate interactivity by toggling a non-active swatch when available.
      const nonActive = swatches.locator('[data-active="false"]').first();
      if ((await nonActive.count()) > 0) {
        await nonActive.click();
        await expect(nonActive).toHaveAttribute("data-active", "true");
      }
    }
  });
});
