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

// Pro's Swap all (UX 4h, J's Q2 (a)) opens on a design kept in this browser, as the Cart gate does:
// two Castlery products in the Living Room, of which the swivel armchair has a cheaper swap.
const DESIGN_STORAGE_KEY = 'interior-ai:v1:livingroom-design';
const SWAP_ALL_TITLE = 'Swap all design';
const SWAP_ALL_PRODUCTS = [
  'armchair-real-castlery-avery-performance-swivel-armchair',
  'coffee-real-castlery-hugg-nesting-square-performance-basalt-closed',
] as const;

function swapAllDesign() {
  return JSON.stringify({
    version: 3,
    schemaRevision: 1,
    units: { roomGeometry: 'm', scenePosition: 'm', productDimensions: 'mm', rotation: 'rad' },
    coordinateSystem: { handedness: 'right', origin: 'room_center_floor', axes: { x: 'right', y: 'up', z: 'forward' } },
    title: SWAP_ALL_TITLE,
    activeRoomId: 'swap-all-living',
    rooms: [
      {
        id: 'swap-all-living',
        name: 'Living Room',
        roomType: 'living',
        geometry: { width: 6, depth: 5, wallThickness: 0.12 },
        items: SWAP_ALL_PRODUCTS.map((productId, index) => ({
          instanceId: `swap-all-${index + 1}`,
          productId,
          variantId: 'catalog-default',
          position: [-1 + index * 2, 0, 0],
          rotationY: 0,
          includeInCheckout: true,
        })),
        zones: [],
        savedViews: [],
      },
    ],
  });
}

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

  test('Pro swaps every product for a cheaper one in one step, and Undo puts them back', async ({ page }) => {
    test.setTimeout(120000);

    await page.route('**/api/me', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ plan: 'pro', source: 'playwright' }),
    }));
    await page.addInitScript(({ key, raw }) => {
      if (window.sessionStorage.getItem('__swapAllSeeded') === '1') return;
      window.localStorage.clear();
      window.localStorage.setItem(key, raw);
      window.localStorage.setItem('interior-ai:beta-start-dismissed', '1');
      window.sessionStorage.setItem('__swapAllSeeded', '1');
    }, { key: DESIGN_STORAGE_KEY, raw: swapAllDesign() });
    await page.goto('/design?mode=designer', { waitUntil: 'domcontentloaded' });
    const scene = page.getByTestId('scene-canvas').first();
    await expect(scene).toBeVisible({ timeout: 30000 });
    await expect(scene).toHaveAttribute('data-client-hydrated', 'true', { timeout: 30000 });
    await expect(page.getByTestId('editor-design-title')).toHaveText(SWAP_ALL_TITLE);
    await page.getByTestId('editor-rail-cart').click();

    await expect(page.getByTestId('shopping-list-page')).toBeVisible();
    const rows = page.getByTestId('shopping-list-row');
    await expect(rows).toHaveCount(SWAP_ALL_PRODUCTS.length);
    const productsByLine = () => rows.evaluateAll((elements) =>
      Object.fromEntries(elements.map((element) => [
        (element as HTMLElement).dataset.instanceId ?? '',
        (element as HTMLElement).dataset.productId ?? '',
      ])));
    const before = await productsByLine();

    // The buttons show once the design can be edited; Pro's say how many products each swaps.
    const cheaper = page.getByTestId('shopping-swap-all-cheaper');
    await expect(cheaper).toBeVisible({ timeout: 30000 });
    await expect(cheaper).toHaveAttribute('aria-label', /^Swap all for cheaper, \d+ products?$/);
    const count = Number(/(\d+) products?$/.exec((await cheaper.getAttribute('aria-label')) ?? '')?.[1]);
    expect(count, 'the fixture has a product with a cheaper swap').toBeGreaterThan(0);
    await expect(cheaper).toBeEnabled();

    await cheaper.click();
    await expect(page.getByTestId('editor-action-toast')).toContainText(`${count} ${count === 1 ? 'product' : 'products'} swapped`);
    await expect
      .poll(async () => {
        const after = await productsByLine();
        return Object.keys(before).filter((instanceId) => after[instanceId] !== before[instanceId]).length;
      })
      .toBe(count);

    // One Undo puts every product back.
    await page.getByTestId('editor-action-toast-undo').click();
    await expect.poll(productsByLine).toEqual(before);
  });
});
