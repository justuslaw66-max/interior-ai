import { test, expect } from './fixtures';
import {
  addCatalogDrawerItemToRoom,
  openCatalogPreview as openCatalogPreviewShared,
  openShopPanel,
} from './variant-test-utils';

test.describe('5. Buy Flow (Shopify + Affiliate)', () => {
  test('add Shopify-mapped item to cart and checkout link works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    // A required commerce smoke must fail when its runtime prerequisite is absent.
    const sceneCanvas = page.locator('[data-testid="scene-canvas"]');
    await expect(sceneCanvas).toBeVisible({ timeout: 15000 });
    
    // Close UI panels
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Place an item
    const box = await sceneCanvas.boundingBox();
    
    expect(box, 'scene canvas must expose clickable bounds').not.toBeNull();
    await sceneCanvas.click({ position: { x: box!.width * 0.5, y: box!.height * 0.5 } });
    await page.waitForTimeout(1500);
    
    // Canvas readiness alone is not commerce evidence.
    const cartPanel = await page.locator('[data-testid="cart-panel"]').isVisible().catch(() => false);
    const checkoutBtn = await page.locator('[data-testid="checkout-shopify"]').isVisible().catch(() => false);

    expect(cartPanel || checkoutBtn, 'Shopify-mapped flow must reach buyer controls').toBeTruthy();
  });

  test('affiliate checkout works', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    
    // A required affiliate smoke must fail when its runtime prerequisite is absent.
    const sceneCanvas = page.locator('[data-testid="scene-canvas"]');
    await expect(sceneCanvas).toBeVisible({ timeout: 15000 });
    
    // Close UI panels
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Place item
    const box = await sceneCanvas.boundingBox();
    
    expect(box, 'scene canvas must expose clickable bounds').not.toBeNull();
    await sceneCanvas.click({ position: { x: box!.width * 0.5, y: box!.height * 0.5 } });
    await page.waitForTimeout(1500);
    
    // Find affiliate checkout button
    const affiliateCheckout = await page.locator('[data-testid="checkout-affiliate"]').isVisible().catch(() => false);
    
    expect(affiliateCheckout, 'affiliate flow must expose its checkout control').toBeTruthy();
  });

  test('imported catalog item can be added and reaches buyer controls', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/design');
    await page.waitForLoadState('domcontentloaded');

    const opened = await openCatalogPreviewShared(
      page,
      'sofa-real-castlery-dawson-swivel-armchair',
      'Dawson'
    );

    expect(opened, 'Dawson imported card must be available to the required buy flow').toBeTruthy();

    const addToRoom = page.getByTestId('catalog-detail-add-to-room');
    await expect(addToRoom).toBeVisible({ timeout: 10000 });
    await addCatalogDrawerItemToRoom(page);

    await openShopPanel(page);

    await expect(page.getByTestId('cart-panel')).toBeVisible({ timeout: 10000 });

    const autoFillButton = page.getByRole('button', { name: 'Auto-fill cart from room' });
    if (await autoFillButton.isVisible().catch(() => false)) {
      await autoFillButton.click();
    }

    const importedRow = page
      .locator('[data-testid="cart-item"]')
      .filter({ hasText: /Dawson Swivel Armchair/i })
      .first();

    await expect(importedRow).toBeVisible({ timeout: 10000 });

    const shopifyCheckout = page.getByTestId('checkout-shopify');
    const affiliateCheckout = page.getByTestId('checkout-affiliate');

    const hasShopifyCheckout = await shopifyCheckout.isVisible().catch(() => false);
    const hasAffiliateCheckout = await affiliateCheckout.isVisible().catch(() => false);

    expect(hasShopifyCheckout || hasAffiliateCheckout).toBeTruthy();
  });
});
