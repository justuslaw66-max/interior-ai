import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
import {
  addImportedProductIfReady,
  getSelectedItemPanel,
  selectImportedFamilyByHint,
  selectImportedProductById,
  waitForCatalogReady,
} from "./variant-test-utils";

function getVisibleFinishSwatches(page: Page) {
  return getSelectedItemPanel(page).getByRole("button", { name: /^Select / });
}

async function captureSwatchStrip(page: Page): Promise<Buffer | null> {
  const swatches = getVisibleFinishSwatches(page);
  const count = await swatches.count();
  if (count === 0) return null;

  const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let i = 0; i < count && boxes.length < 8; i += 1) {
    const box = await swatches.nth(i).boundingBox();
    if (box) boxes.push(box);
  }
  if (boxes.length === 0) return null;

  const minX = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.x)) - 12));
  const minY = Math.max(0, Math.floor(Math.min(...boxes.map((b) => b.y)) - 12));
  const maxX = Math.ceil(Math.max(...boxes.map((b) => b.x + b.width)) + 12);
  const maxY = Math.ceil(Math.max(...boxes.map((b) => b.y + b.height)) + 12);

  const viewport = page.viewportSize();
  if (!viewport) return null;

  const width = Math.min(viewport.width - minX, maxX - minX);
  const height = Math.min(viewport.height - minY, maxY - minY);
  if (width <= 0 || height <= 0) return null;

  return page.screenshot({
    clip: {
      x: minX,
      y: minY,
      width,
      height,
    },
  });
}

async function compareSwatchStrip(image: Buffer, snapshotName: string): Promise<void> {
  await expect(image).toMatchSnapshot(snapshotName, { maxDiffPixelRatio: 0.03 });
}

test.describe("10. Visual Regression - Finish Swatches", () => {
  test("capture swatch strips for Kelsey, Jaron, and Madison", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/design");
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    const targets = [
      { family: "kelsey", id: "dining-real-castlery-kelsey-marble-160", snapshot: "kelsey-160-swatches.png" },
      { family: "jaron", id: "sofa-real-castlery-jaron-3s", snapshot: "jaron-3s-swatches.png" },
      { family: "madison", id: "sofa-real-castlery-madison-2s", snapshot: "madison-2s-swatches.png" },
    ];

    expect(await waitForCatalogReady(page)).toBe(true);

    for (const target of targets) {
      expect(await selectImportedFamilyByHint(page, target.family)).toBe(true);
      expect(await selectImportedProductById(page, target.id)).toBe(true);
      expect(await addImportedProductIfReady(page)).toBe(true);

      const swatches = getVisibleFinishSwatches(page);
      await expect(swatches.first()).toBeVisible({ timeout: 10000 });
      await swatches.first().scrollIntoViewIfNeeded();

      const image = await captureSwatchStrip(page);
      if (!image) {
        throw new Error(`Unable to compute a screenshot clip for ${target.id}`);
      }

      await compareSwatchStrip(image, target.snapshot);

      const removeSelected = page.getByRole("button", { name: "Remove", exact: true });
      await expect(removeSelected).toBeVisible();
      await removeSelected.click();
    }
  });
});
