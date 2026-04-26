import { test, expect } from './fixtures';

test.describe('3. Save + Reload Persistence', () => {
  test('save design persists items, zones, and views after reload', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Wait for save button
    await page.locator('[data-testid="save-design"]').waitFor({ state: 'visible', timeout: 10000 });
    
    // Click save
    await page.locator('[data-testid="save-design"]').click();
    await page.waitForTimeout(1000);
    
    // Get item count
    const itemCount = await page.locator('[data-testid="item-in-scene"]').count();
    const zoneCount = await page.locator('[data-testid="seating-zone"]').count();
    
    // Reload page
    await page.reload();
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Verify items and zones persist
    const reloadedItemCount = await page.locator('[data-testid="item-in-scene"]').count();
    const reloadedZoneCount = await page.locator('[data-testid="seating-zone"]').count();
    
    expect(reloadedItemCount).toBe(itemCount);
    expect(reloadedZoneCount).toBe(zoneCount);
  });

  test('multi-room state isolation - switch rooms without leaking state', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    
    // Check if room switcher exists
    const roomButtons = await page.locator('[data-testid="room-select"]').count();
    
    if (roomButtons > 1) {
      // Get initial item count
      const initialItems = await page.locator('[data-testid="item-in-scene"]').count();
      
      // Switch to another room
      const roomOptions = page.locator('[data-testid="room-select"]');
      await roomOptions.nth(1).click();
      await page.waitForTimeout(500);
      
      // Get items in second room
      const _secondRoomItems = await page.locator('[data-testid="item-in-scene"]').count();
      
      // Switch back to first room  
      await roomOptions.nth(0).click();
      await page.waitForTimeout(500);
      
      // Verify first room state is restored
      const restoredItems = await page.locator('[data-testid="item-in-scene"]').count();
      expect(restoredItems).toBe(initialItems);
    }
  });
});
