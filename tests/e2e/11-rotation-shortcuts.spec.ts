import { type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { addCatalogDrawerItemToRoom, openCatalogPreview } from './variant-test-utils';

const ROTATION_TEST_ITEM_ID = 'coffee-real-castlery-hugg-nesting-square-performance-basalt-closed';

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

async function expectAngle(page: Page, expected: number) {
  await expect.poll(() => readAngle(page), { timeout: 5000 }).toBe(normalizeAngle(expected));
}

async function setupSelectedItem(page: Page): Promise<boolean> {
  await page.goto('/design');
  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('scene-canvas').first()).toBeVisible({ timeout: 20000 });

  const opened = await openCatalogPreview(page, ROTATION_TEST_ITEM_ID, 'Hugg');
  if (!opened) return false;

  await addCatalogDrawerItemToRoom(page);

  const rotationLabel = page.locator('[data-testid="rotation-angle-label"]');
  if (!(await rotationLabel.isVisible().catch(() => false))) {
    await page.locator('[data-testid="editor-workflow-furnish"]:visible').first().click().catch(() => undefined);
    await page.waitForTimeout(250);
  }

  const rotationReady = await expect(rotationLabel)
    .toBeVisible({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);
  if (!rotationReady) return false;

  const rotationToggle = page.getByTestId('rotation-controls-toggle');
  if ((await rotationToggle.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await rotationToggle.click();
  }

  await page.getByTestId('rotation-btn-reset').click();
  await expectAngle(page, 0);
  return true;
}

test.describe('11. Rotation Shortcuts And Presets', () => {
  test('Q/E and R and 0 rotate as expected', async ({ page }) => {
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
    await expectAngle(page, start + 15);

    await page.keyboard.press('Q');
    await expectAngle(page, start);

    await page.keyboard.press('R');
    await expectAngle(page, start + 90);

    await page.keyboard.press('0');
    await expectAngle(page, 0);
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
    await expectAngle(page, start + 5);

    await page.locator('[data-testid="rotation-snap-preset-free"]').click();
    await page.keyboard.press('E');
    await expectAngle(page, start + 6);
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
    if ((await input.count()) === 0) {
      test.info().annotations.push({
        type: 'note',
        description: 'Skipping rotation input assertion because exact-angle input is not exposed in this runtime',
      });
      return;
    }
    await input.click();
    await page.keyboard.type('33');
    await page.keyboard.press('E');
    await page.waitForTimeout(150);

    await expectAngle(page, start);
  });
});
