import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import type { StoredDesign } from "../../lib/room-persistence";
import { compileCanonicalFloorPlanRenderModel } from "../../lib/floor-plan-render-model";
import { writeFile } from "node:fs/promises";

export async function exerciseWallGestures(page: Page, wallId: string, saved: () => Promise<StoredDesign>, testInfo: TestInfo) {
  const document = async () => (await saved()).floorPlan!.canonicalDocument!;
  const before = await document();
  const line = (doc: typeof before) => compileCanonicalFloorPlanRenderModel(doc).floors[0].walls.find(({ id }) => id === wallId)!.centerlineSegments[0];
  const handle = (mode: string) => page.getByTestId(`canonical-wall-drag-${mode}`);
  const center = async (locator: Locator) => {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    if (!box) throw new Error("Missing wall handle bounds");
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const startDrag = async (mode: string, dx: number, dy: number) => {
    const origin = await center(handle(mode));
    await page.mouse.move(origin.x, origin.y);
    await page.mouse.down();
    await page.mouse.move(origin.x + dx, origin.y + dy, { steps: 6 });
    return { x: origin.x + dx, y: origin.y + dy };
  };
  const undo = page.getByRole("button", { name: /^Undo/ });
  const redo = page.getByRole("button", { name: /^Redo/ });
  const panel = page.getByTestId("imported-wall-editor");
  const initialStart = await center(handle("start")), initialEnd = await center(handle("end"));
  await panel.getByLabel("Wall", { exact: true }).selectOption("north-east");
  await page.mouse.click(initialStart.x * 0.75 + initialEnd.x * 0.25, initialStart.y * 0.75 + initialEnd.y * 0.25);
  await expect(panel.getByLabel("Wall", { exact: true })).toHaveValue(wallId);
  await startDrag("wall", 18, 12);
  expect(await document()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath("wall-drag-preview.png") });
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await document()).toEqual(before);
  await startDrag("end", 12, -10);
  await handle("end").dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true });
  await page.mouse.up();
  expect(await document()).toEqual(before);

  const released = await startDrag("wall", 18, 12);
  expect(await document()).toEqual(before);
  await page.mouse.up();
  await expect.poll(async () => (await document()).revisionId).not.toBe(before.revisionId);
  const moved = await document(), first = line(before), translated = line(moved);
  const delta = { xMm: translated.start.xMm - first.start.xMm, zMm: translated.start.zMm - first.start.zMm };
  expect(delta).not.toEqual({ xMm: 0, zMm: 0 });
  expect(translated.end).toEqual({ xMm: first.end.xMm + delta.xMm, zMm: first.end.zMm + delta.zMm });
  await expect.poll(async () => {
    const point = await center(handle("wall")); return Math.hypot(point.x - released.x, point.y - released.y);
  }).toBeLessThan(1.5);
  await undo.click();
  await expect.poll(document).toEqual(before);
  await redo.click();
  await expect.poll(document).toEqual(moved);

  const endpointReleased = await startDrag("end", 12, -8);
  await page.mouse.up();
  await expect.poll(async () => (await document()).revisionId).not.toBe(moved.revisionId);
  const resized = await document();
  expect(line(resized).start).toEqual(translated.start);
  expect(line(resized).end).not.toEqual(translated.end);
  await expect.poll(async () => {
    const point = await center(handle("end")); return Math.hypot(point.x - endpointReleased.x, point.y - endpointReleased.y);
  }).toBeLessThan(1.5);
  await undo.click();
  await expect.poll(document).toEqual(moved);

  // A numeric correction during a preview changes its revision. Release must discard that stale draft.
  await startDrag("end", 10, -6);
  await panel.getByLabel("Wall height (mm)", { exact: true }).fill("1101");
  const applyHeight = panel.getByRole("button", { name: "Apply wall height", exact: true });
  await expect(applyHeight).toHaveAttribute("aria-disabled", "false");
  await applyHeight.focus();
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await document()).floors[0].walls.find(({ id }) => id === wallId)?.heightMm).toBe(1101);
  const corrected = await document();
  expect(line(corrected)).toEqual(translated);
  await page.mouse.up();
  expect(await document()).toEqual(corrected);
  await undo.click();
  await expect.poll(document).toEqual(moved);
  await handle("wall").focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => line(await document()).start.xMm).toBe(translated.start.xMm + 10);
  await page.keyboard.press("Shift+ArrowUp");
  await expect.poll(async () => line(await document()).start.zMm).toBe(translated.start.zMm - 100);
  for (let count = 0; count < 3; count += 1) await undo.click();
  await expect.poll(document).toEqual(before);
  await writeFile(testInfo.outputPath("wall-gesture-evidence.json"), JSON.stringify({ original: first, translated: line(moved), resized: line(resized), delta,
    checks: ["preview leaves document unchanged", "Escape", "pointercancel", "one undo per gesture", "redo", "endpoint retains other end", "screen release within 1.5 px", "stale preview discarded", "10/100 mm keyboard nudge"] }, null, 2));
}
