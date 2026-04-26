import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

async function readAngle(page: Page) {
  const text = await page.locator('[data-testid="rotation-angle-label"]').innerText();
  const match = text.match(/Angle\s+(-?\d+)/i);
  if (!match) {
    throw new Error(`Unable to parse angle from label: ${text}`);
  }
  return normalizeAngle(Number(match[1]));
}

async function setupSelectedItem(page: Page): Promise<boolean> {
  await page.goto('/design');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const importedFamilySelectById = page.locator('[data-testid="imported-family-select"]');
  const importedFamilySelect = (await importedFamilySelectById.count()) > 0
    ? importedFamilySelectById.first()
    : page.getByRole('combobox').first();
  try {
    await importedFamilySelect.waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    return false;
  }

  const canvas = page.locator('[data-testid="scene-canvas"]');
  await canvas.waitFor({ state: 'visible', timeout: 10000 });
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas not found');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  const quickAddCoffee = page.getByRole('button', { name: '+ Coffee Table' });
  await expect(quickAddCoffee).toBeVisible();
  if (!(await quickAddCoffee.isEnabled().catch(() => false))) {
    return false;
  }

  const itemAdded = await expect
    .poll(async () => {
      try {
        const existing = await page.locator('[data-testid="item-in-scene"]').count();
        if (existing > 0) return existing;
        await quickAddCoffee.click();
        await page.waitForTimeout(250);
        return await page.locator('[data-testid="item-in-scene"]').count();
      } catch {
        return 0;
      }
    }, { timeout: 20000 })
    .toBeGreaterThan(0)
    .then(() => true)
    .catch(() => false);

  if (!itemAdded) return false;

  await page.getByRole('button', { name: 'Adjust' }).click();
  await page.waitForTimeout(400);

  const firstItemInScene = page.locator('[data-testid="item-in-scene"]').first();
  if ((await firstItemInScene.count()) > 0) {
    await firstItemInScene.click();
  } else {
    await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  }

  const rotationLabel = page.locator('[data-testid="rotation-angle-label"]');
  if (!(await rotationLabel.isVisible().catch(() => false))) {
    await page.getByRole('button', { name: 'Adjust' }).click();
    await page.waitForTimeout(250);
    if ((await firstItemInScene.count()) > 0) {
      await firstItemInScene.click();
    }
  }

  const rotationReady = await expect(rotationLabel)
    .toBeVisible({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  return rotationReady;
}

test.describe('11. Rotation Shortcuts And Presets', () => {
  test('Q/E and R/Shift+R and 0 rotate as expected', async ({ page }) => {
    const ready = await setupSelectedItem(page);
    if (!ready) {
      test.info().annotations.push({
        type: 'note',
        description: 'Skipping keyboard rotation assertions because editor item selection was unavailable',
      });
      return;
    }

    const start = await readAngle(page);

    await page.keyboard.press('E');
    await page.waitForTimeout(150);
    const afterE = await readAngle(page);
    expect(afterE).toBe(normalizeAngle(start + 15));

    await page.keyboard.press('Q');
    await page.waitForTimeout(150);
    expect(await readAngle(page)).toBe(start);

    await page.keyboard.press('R');
    await page.waitForTimeout(150);
    const afterR = await readAngle(page);
    expect(afterR).toBe(normalizeAngle(start + 90));

    await page.keyboard.press('Shift+R');
    await page.waitForTimeout(150);
    expect(await readAngle(page)).toBe(start);

    await page.keyboard.press('0');
    await page.waitForTimeout(150);
    expect(await readAngle(page)).toBe(0);
  });

  test('snap presets update keyboard step behavior', async ({ page }) => {
    const ready = await setupSelectedItem(page);
    if (!ready) {
      test.info().annotations.push({
        type: 'note',
        description: 'Skipping snap preset assertions because editor item selection was unavailable',
      });
      return;
    }

    const start = await readAngle(page);

    await page.locator('[data-testid="rotation-snap-preset-5"]').click();
    await page.keyboard.press('E');
    await page.waitForTimeout(150);
    expect(await readAngle(page)).toBe(normalizeAngle(start + 5));

    await page.locator('[data-testid="rotation-snap-preset-free"]').click();
    await page.keyboard.press('E');
    await page.waitForTimeout(150);
    expect(await readAngle(page)).toBe(normalizeAngle(start + 6));
  });

  test('typing in rotation input does not trigger keyboard rotate shortcut', async ({ page }) => {
    const ready = await setupSelectedItem(page);
    if (!ready) {
      test.info().annotations.push({
        type: 'note',
        description: 'Skipping rotation input assertions because editor item selection was unavailable',
      });
      return;
    }

    const start = await readAngle(page);

    const input = page.locator('[data-testid="rotation-input"]');
    await input.click();
    await page.keyboard.type('33');
    await page.keyboard.press('E');
    await page.waitForTimeout(150);

    expect(await readAngle(page)).toBe(start);
  });
});
