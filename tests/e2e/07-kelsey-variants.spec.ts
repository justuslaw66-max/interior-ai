import { test, expect } from './fixtures';
import {
  addImportedProductIfReady,
  ensureItemSelectedForVariants,
  findImportedProductValue,
  getImportedProductSelect,
  selectImportedFamilyByHint,
  selectImportedProductById,
  waitForCatalogReady,
} from './variant-test-utils';

test.describe('7. Kelsey Marble Variant Integration', () => {
  test('Kelsey 160 appears in imported furniture dropdown', async ({ page }) => {
    await page.goto('/design');
    await page.waitForLoadState('domcontentloaded');
    const ready = await waitForCatalogReady(page);
    expect(ready, 'catalog controls must be available for the required Kelsey gate').toBeTruthy();

    // Select the Kelsey family first, then validate the product picker options.
    const hasKelseyFamily = await selectImportedFamilyByHint(page, 'kelsey');
    expect(hasKelseyFamily, 'Kelsey family must be present in the required catalog fixture').toBeTruthy();

    const select = await getImportedProductSelect(page);
    expect(select, 'imported product selector must be available').not.toBeNull();
    if (!select) throw new Error('imported product selector must be available');

    await expect
      .poll(async () => {
        const optionTexts = await select.locator('option').allTextContents().catch(() => [] as string[]);
        const has160 = optionTexts.some((t) => t.toLowerCase().includes('kelsey') && t.includes('160'));
        const has180 = optionTexts.some((t) => t.toLowerCase().includes('kelsey') && t.includes('180'));
        return has160 && has180;
      }, { timeout: 20000 })
      .toBeTruthy();
  });

  test('API returns White Wash and Dark Walnut variants for both Kelsey sizes', async ({ request }) => {
    // The imported-model route can briefly return non-200 while runtime services warm up in CI.
    await expect
      .poll(async () => {
        try {
          const response = await request.get('http://localhost:3000/api/models/imported');
          if (!response.ok()) return false;
          const body = (await response.json()) as { models?: unknown[] };
          return Array.isArray(body.models) && body.models.length > 0;
        } catch {
          return false;
        }
      }, { timeout: 45000 })
      .toBeTruthy();

    // Verify the live imported-model API exposes both Kelsey models and their variant lists.
    const response = await request.get('http://localhost:3000/api/models/imported');
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const models: Array<{ id: string; status: string; dims: string; catalog?: { variants?: Array<{ variant: string }> } }> = body.models ?? [];

    const kelsey160 = models.find(m => m.id === 'dining-real-castlery-kelsey-marble-160');
    const kelsey180 = models.find(m => m.id === 'dining-real-castlery-kelsey-marble-180');

    // Both models must be approved and present
    expect(kelsey160).toBeDefined();
    expect(kelsey180).toBeDefined();
    expect(kelsey160?.status).toBe('approved');
    expect(kelsey180?.status).toBe('approved');

    // Both must expose White Wash + Dark Walnut variants
    const variants160 = (kelsey160?.catalog?.variants ?? []).map(v => v.variant);
    const variants180 = (kelsey180?.catalog?.variants ?? []).map(v => v.variant);

    expect(variants160.some(v => v.toLowerCase().includes('white'))).toBeTruthy();
    expect(variants160.some(v => v.toLowerCase().includes('walnut') || v.toLowerCase().includes('dark'))).toBeTruthy();
    expect(variants180.some(v => v.toLowerCase().includes('white'))).toBeTruthy();
    expect(variants180.some(v => v.toLowerCase().includes('walnut') || v.toLowerCase().includes('dark'))).toBeTruthy();
  });

  test('Kelsey 160 Dark Walnut swatch is clickable when scene is ready', async ({ page }) => {
    await page.goto('/design');
    await page.waitForLoadState('domcontentloaded');
    const ready = await waitForCatalogReady(page);
    expect(ready, 'catalog controls must be available for the required Kelsey gate').toBeTruthy();

    // Select Kelsey family first so product options include Kelsey variants.
    const familySelected = await selectImportedFamilyByHint(page, 'kelsey');
    expect(familySelected, 'Kelsey family must be selectable').toBeTruthy();

    const kelsey160Value = await findImportedProductValue(
      page,
      (label) => label.toLowerCase().includes('kelsey') && label.includes('160'),
    );
    expect(kelsey160Value, 'Kelsey 160 must be present in the required catalog fixture').not.toBeNull();
    if (!kelsey160Value) throw new Error('Kelsey 160 must be present in the required catalog fixture');

    const selected = await selectImportedProductById(page, kelsey160Value);
    expect(selected, 'Kelsey 160 must be selectable').toBeTruthy();

    const added = await addImportedProductIfReady(page);
    expect(added, 'Kelsey 160 must be addable to the room').toBeTruthy();

    const selectedItem = await ensureItemSelectedForVariants(page);
    expect(selectedItem, 'the placed Kelsey item must be selectable').toBeTruthy();

    // Check for variant swatch panel; skip if item not selectable
    const swatches = page.locator('[data-testid^="variant-swatch-"]');
    const swatchCount = await swatches.count();
    expect(swatchCount, 'the selected Kelsey item must expose variant swatches').toBeGreaterThan(0);

    // Verify label presence
    const labels = await swatches.allTextContents();
    expect(labels.some(l => l.toLowerCase().includes('white'))).toBeTruthy();
    expect(labels.some(l => l.toLowerCase().includes('walnut') || l.toLowerCase().includes('dark'))).toBeTruthy();

    // Click Dark Walnut and verify it becomes active
    let darkWalnutSwatch: import('@playwright/test').Locator | null = null;
    for (let i = 0; i < swatchCount; i++) {
      const text = await swatches.nth(i).textContent();
      if (text?.toLowerCase().includes('walnut') || text?.toLowerCase().includes('dark')) {
        darkWalnutSwatch = swatches.nth(i);
        break;
      }
    }
    expect(darkWalnutSwatch, 'Dark Walnut swatch must be present').not.toBeNull();
    if (!darkWalnutSwatch) throw new Error('Dark Walnut swatch must be present');

    const beforeAttr = await darkWalnutSwatch.getAttribute('data-active');
    await darkWalnutSwatch.click();
    await page.waitForTimeout(500);

    const afterAttr = await darkWalnutSwatch.getAttribute('data-active');
    expect(afterAttr).toBe('true');
    expect(beforeAttr).not.toBe(afterAttr);
  });
});
