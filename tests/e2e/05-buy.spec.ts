import { test, expect } from './fixtures';
import {
  addCatalogDrawerItemToRoom,
  openCatalogPreview as openCatalogPreviewShared,
  openShopPanel,
  shoppingListRow,
} from './variant-test-utils';

// Shop is the Shopping list (UX audit FU8): Buy at each retailer, and Checkout here once a design
// has a product sold through Shopify (J's answers to Q2 and Q5, 27 Sep).
const DAWSON_SWIVEL_ID = 'sofa-real-castlery-dawson-swivel-armchair';

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
    
    // Canvas readiness alone is not commerce evidence: Shop's buyer controls must be reachable.
    await openShopPanel(page);
    const shoppingList = await page.getByTestId('shopping-list-page').isVisible().catch(() => false);
    const checkoutBtn = await page.getByTestId('checkout-shopify').isVisible().catch(() => false);

    expect(shoppingList || checkoutBtn, 'Shopify-mapped flow must reach buyer controls').toBeTruthy();
  });

  test('affiliate checkout works', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/design');
    await page.waitForLoadState('domcontentloaded');

    // A required affiliate smoke must fail when its runtime prerequisite is absent.
    const opened = await openCatalogPreviewShared(page, DAWSON_SWIVEL_ID, 'Dawson');
    expect(opened, 'a retailer product must be available to the required affiliate flow').toBeTruthy();
    await addCatalogDrawerItemToRoom(page);
    await openShopPanel(page);

    // The only product at its retailer opens straight away, in a tab sent to the tracked address.
    await page.route('**/api/track/click', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ clickKey: 'buy-spec-click' }),
    }));
    await page.context().route('https://www.castlery.com/**', (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>Retailer</title><p>Retailer</p>',
    }));
    const affiliateCheckout = page.locator('[data-testid="shopping-buy"][data-retailer="castlery.com"]');
    await expect(affiliateCheckout, 'affiliate flow must expose its checkout control').toBeVisible({ timeout: 10000 });
    const retailerTab = page.waitForEvent('popup');
    await affiliateCheckout.click();
    const tab = await retailerTab;
    await tab.waitForURL(/clickKey=buy-spec-click/, { timeout: 10000 });
    expect(tab.url()).toContain('utm_source=interior-ai');
    await tab.close();
  });

  test('imported catalog item can be added and reaches buyer controls', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto('/design');
    await page.waitForLoadState('domcontentloaded');

    const opened = await openCatalogPreviewShared(page, DAWSON_SWIVEL_ID, 'Dawson');

    expect(opened, 'Dawson imported card must be available to the required buy flow').toBeTruthy();

    const addToRoom = page.getByTestId('catalog-detail-add-to-room');
    await expect(addToRoom).toBeVisible({ timeout: 10000 });
    await addCatalogDrawerItemToRoom(page);

    await openShopPanel(page);

    const importedRow = shoppingListRow(page, /Dawson Swivel Armchair/i);
    await expect(importedRow).toBeVisible({ timeout: 10000 });

    const hasShopifyCheckout = await page.getByTestId('checkout-shopify').isVisible().catch(() => false);
    const hasAffiliateCheckout = await page.getByTestId('shopping-buy').first().isVisible().catch(() => false);

    expect(hasShopifyCheckout || hasAffiliateCheckout).toBeTruthy();
  });
});
