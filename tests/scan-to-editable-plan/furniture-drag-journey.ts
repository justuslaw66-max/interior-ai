import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { StoredDesign } from "../../lib/room-persistence";
import { renderedSceneObject } from "./rendered-scene-observer";

export async function exerciseFurnitureDrag(page: Page, saved: () => Promise<StoredDesign>, testInfo: TestInfo, view: "2d" | "3d") {
  const initial = await saved(), room = initial.rooms!.find((room) => room.items.length)!, before = room.items[0];
  // Span the removed wall while staying outside the replacement boundary's deliberate snap zone.
  const itemId = before.instanceId, grab = { x: 0.4, z: 0.2 }, delta = { x: -1.8, z: 1 };
  const item = async () => (await saved()).rooms!.flatMap((room) => room.items).find(({ instanceId }) => instanceId === itemId)!;
  const frame = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const read = (offset: { x: number; y?: number; z: number } = grab) => renderedSceneObject(page, { itemId, delta: offset });
  const gestures: unknown[] = [];
  const begin = async () => {
    await frame();
    let previousCamera = "";
    await expect.poll(async () => {
      const camera = JSON.stringify((await read())?.camera), stable = camera === previousCamera;
      previousCamera = camera; return stable;
    }).toBe(true);
    const start = (await read())!, end = (await read({ x: grab.x + delta.x, z: grab.z + delta.z }))!;
    expect(start).not.toBeNull();
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.tagName, start.target);
    expect(hit, "The grab point must hit the native canvas, without bypassing an overlaid control.").toBe("CANVAS");
    await page.mouse.move(start.target.x, start.target.y); await page.mouse.down();
    const surface = (await read())!;
    expect(surface.hitOffset).not.toBeNull();
    await page.mouse.move(end.target.x, end.target.y, { steps: 6 });
    const preview = await read();
    gestures.push({ start, surface, end, preview, saved: await saved() });
    await writeFile(testInfo.outputPath(`furniture-drag-${view}-diagnostic.json`), JSON.stringify(gestures, null, 2));
    expect((await item()).position, "A single-item preview must stay out of persistence.").toEqual(before.position);
    expect(preview).not.toBeNull();
    // Compare the actual projection; OrbitControls accumulates insignificant rounding in orthographic height.
    start.fixedProjection.forEach((point, index) => {
      expect(Math.hypot(preview!.fixedProjection[index].x - point.x, preview!.fixedProjection[index].y - point.y)).toBeLessThan(0.000001);
    });
    return { ...start, hitOffset: surface.hitOffset! };
  };
  await begin();
  await page.keyboard.press("Escape"); await page.mouse.up();
  await expect.poll(async () => (await item()).position).toEqual(before.position);
  await begin();
  await page.locator("canvas").first().dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true });
  await page.mouse.up();
  await expect.poll(async () => (await item()).position).toEqual(before.position);
  const start = await begin(); await page.mouse.up();
  await expect.poll(async () => (await item()).position).not.toEqual(before.position);
  const moved = await item(); await frame();
  const movedWorldX = moved.position[0] + room.planPosition!.x, halfWidth = moved.productSnapshot!.dimensionsMm.w / 2000;
  expect(movedWorldX - halfWidth).toBeLessThan(4);
  expect(movedWorldX + halfWidth).toBeGreaterThan(4);
  const released = (await read({ x: start.hitOffset[0], y: start.hitOffset[1], z: start.hitOffset[2] }))!;
  const up = released.pointerEvents!.filter(({ type }) => type === "pointerup").at(-1)!;
  expect(Math.hypot(released.target.x - up.x, released.target.y - up.y)).toBeLessThan(1.5);
  expect((await saved()).floorPlan).toEqual(initial.floorPlan);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => (await item()).position).toEqual(before.position);
  await page.getByRole("button", { name: /^Redo/ }).click();
  await expect.poll(async () => (await item()).position).toEqual(moved.position);
  await page.getByRole("button", { name: /^Undo/ }).click();
  await expect.poll(async () => (await item()).position).toEqual(before.position);
  await writeFile(testInfo.outputPath(`furniture-drag-${view}-evidence.json`), JSON.stringify({ before, moved, start, released,
    checks: ["native canvas pointer input", "removed wall has no drag barrier", "fixed camera", "grab point retained within 1.5 CSS pixels", "Escape rollback", "pointercancel rollback", "one undo/redo", "canonical geometry unchanged"] }, null, 2));
}
