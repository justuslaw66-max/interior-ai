import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { StoredDesign } from "../../lib/room-persistence";
import { compileCanonicalFloorPlanRenderModel } from "../../lib/floor-plan-render-model";

export async function exerciseOpeningGestures(page: Page, wallId: string, saved: () => Promise<StoredDesign>, testInfo: TestInfo) {
  const document = async () => (await saved()).floorPlan!.canonicalDocument!;
  const before = await document();
  const openingId = before.floors[0].openings.find((opening) => opening.wallId === wallId)!.id;
  const opening = (doc: typeof before) => doc.floors[0].openings.find(({ id }) => id === openingId)!;
  const compiled = compileCanonicalFloorPlanRenderModel(before).floors[0].walls.find(({ id }) => id === wallId)!;
  const line = compiled.centerlineSegments[0];
  const startBox = await page.getByTestId("canonical-wall-drag-start").boundingBox();
  const endBox = await page.getByTestId("canonical-wall-drag-end").boundingBox();
  if (!startBox || !endBox) throw new Error("Expected selected wall handles before opening selection");
  const a = { x: startBox.x + startBox.width / 2, y: startBox.y + startBox.height / 2 };
  const b = { x: endBox.x + endBox.width / 2, y: endBox.y + endBox.height / 2 };
  const wallLength = line.endOffsetMm;
  const screenAt = (offsetMm: number) => ({ x: a.x + (b.x - a.x) * offsetMm / wallLength, y: a.y + (b.y - a.y) * offsetMm / wallLength });
  const begin = async (doc: typeof before, edge: "centre" | "end", deltaMm: number) => {
    const current = opening(doc), offset = current.offsetMm + current.widthMm * (edge === "centre" ? 0.5 : 1);
    const origin = screenAt(offset), target = screenAt(offset + deltaMm);
    await page.mouse.move(origin.x, origin.y); await page.mouse.down();
    await page.mouse.move(target.x, target.y, { steps: 6 });
  };
  const undo = page.getByRole("button", { name: /^Undo/ }), redo = page.getByRole("button", { name: /^Redo/ });
  await begin(before, "centre", 200);
  expect(await document()).toEqual(before);
  await expect(page.getByTestId("selected-plan-opening-actions")).toContainText("Selected wall");
  await page.screenshot({ path: testInfo.outputPath("opening-drag-preview.png") });
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect(await document()).toEqual(before);
  await begin(before, "centre", 200);
  await page.locator("canvas").first().dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true });
  await page.mouse.up();
  expect(await document()).toEqual(before);

  await begin(before, "centre", 100);
  await page.locator("canvas").first().evaluate((canvas) => canvas.releasePointerCapture(1));
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await page.mouse.up();
  expect(await document()).toEqual(before);

  await begin(before, "centre", 200);
  expect(await document()).toEqual(before);
  await page.mouse.up();
  await expect.poll(async () => opening(await document()).offsetMm).not.toBe(opening(before).offsetMm);
  const moved = await document();
  expect(opening(moved).widthMm).toBe(601);
  expect(opening(moved).offsetMm).toBeGreaterThan(opening(before).offsetMm);
  expect(Math.abs(opening(moved).offsetMm - opening(before).offsetMm - 200)).toBeLessThan(20);
  await undo.click(); await expect.poll(document).toEqual(before);
  await redo.click(); await expect.poll(document).toEqual(moved);
  await begin(moved, "end", 200);
  expect(await document()).toEqual(moved);
  await page.mouse.up();
  await expect.poll(async () => opening(await document()).widthMm).toBeGreaterThan(601);
  const resized = await document();
  expect(opening(resized).offsetMm).toBe(opening(moved).offsetMm);
  await undo.click(); await expect.poll(document).toEqual(moved);

  await begin(moved, "centre", 100);
  const panel = page.getByTestId("imported-wall-editor");
  await panel.getByLabel("Wall height (mm)", { exact: true }).fill("1101");
  const apply = panel.getByRole("button", { name: "Apply wall height", exact: true });
  await expect(apply).toHaveAttribute("aria-disabled", "false");
  await apply.focus(); await page.keyboard.press("Enter");
  await expect.poll(async () => (await document()).floors[0].walls.find(({ id }) => id === wallId)?.heightMm).toBe(1101);
  const corrected = await document();
  await page.mouse.up();
  expect(await document()).toEqual(corrected);
  expect(opening(corrected)).toEqual(opening(moved));
  await undo.click(); await expect.poll(document).toEqual(moved);
  await undo.click(); await expect.poll(document).toEqual(before);
  await writeFile(testInfo.outputPath("opening-gesture-evidence.json"), JSON.stringify({ before: opening(before), moved: opening(moved), resized: opening(resized),
    checks: ["preview immutability", "Escape", "pointercancel", "one undo per gesture", "exact odd width", "resize keeps fixed edge", "stale preview discarded"] }, null, 2));
}
