import { expect, type Page, type TestInfo } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import type { StoredDesign } from "../../lib/room-persistence";
import { compileCanonicalFloorPlanRenderModel } from "../../lib/floor-plan-render-model";
import { renderedOpening } from "./rendered-scene-observer";

export async function exerciseOpening3D(page: Page, wallId: string, saved: () => Promise<StoredDesign>, testInfo: TestInfo) {
  const document = async () => (await saved()).floorPlan!.canonicalDocument!;
  const before = await document(), openingId = before.floors[0].openings.find((opening) => opening.wallId === wallId)!.id;
  const opening = (doc: typeof before) => doc.floors[0].openings.find(({ id }) => id === openingId)!;
  const model = compileCanonicalFloorPlanRenderModel(before), line = model.floors[0].walls.find(({ id }) => id === wallId)!.centerlineSegments[0];
  const length = Math.hypot(line.end.xMm - line.start.xMm, line.end.zMm - line.start.zMm);
  const delta = { x: (line.end.xMm - line.start.xMm) / length * 0.2, z: (line.end.zMm - line.start.zMm) / length * 0.2 };
  await page.getByTestId("editor-view-3d").click();
  await expect(page.getByTestId("selection-inspector")).toContainText("Window on selected wall");
  const read = (edge?: string) => renderedOpening(page, { testId: edge ? "canonical-opening-resize-handle-3d" : "canonical-opening-3d", openingId, edge, delta });
  await expect.poll(async () => Boolean(await read())).toBe(true);
  let priorCamera = "";
  await expect.poll(async () => {
    const camera = JSON.stringify((await read())?.camera), stable = camera === priorCamera;
    priorCamera = camera; return stable;
  }).toBe(true);
  const actual = (await read())!;
  await writeFile(testInfo.outputPath("opening-3d-initial-scene.json"), JSON.stringify(actual, null, 2));
  expect(actual.userData.canonicalGeometryHash).toBe(model.geometryHash);
  expect(actual.symbols).toHaveLength(1);
  expect(actual.symbols[0]).toMatchObject({ canonicalOpeningKind: "window", canonicalWidthMm: 601, canonicalBottomMm: 500, canonicalTopMm: 1000 });
  expect(actual.wallSolids.length).toBe(model.floors[0].walls.find(({ id }) => id === wallId)!.solids.length);
  expect(Math.min(...actual.wallSolids.map((solid) => solid!.min[1]))).toBeCloseTo(0.2, 5);
  expect(Math.max(...actual.wallSolids.map((solid) => solid!.max[1]))).toBeCloseTo(1.3, 5);
  expect(actual.wallBodies.length).toBeGreaterThan(0);
  for (const body of actual.wallBodies) {
    expect(body!.userData.canonicalGeometryHash).toBe(model.geometryHash);
    expect(body!.min[1] * 1000).toBeCloseTo(body!.userData.canonicalWallBandBottomMm, 2);
    expect(body!.max[1] * 1000).toBeCloseTo(body!.userData.canonicalWallBandTopMm, 2);
  }
  const frame = () => page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const requests: unknown[] = [];
  const begin = async (edge?: string) => {
    await frame();
    const target = await read(edge);
    if (!target) throw new Error("Expected an actual visible opening mesh and camera");
    requests.push({ edge, screen: target.screen, target: target.target, camera: target.camera });
    await page.mouse.move(target.screen.x, target.screen.y); await page.mouse.down();
    await page.mouse.move(target.target.x, target.target.y, { steps: 6 });
    const after = await read();
    await writeFile(testInfo.outputPath("opening-3d-camera-diagnostic.json"), JSON.stringify({ requested: target, after }, null, 2));
    expect(after?.camera.position).toEqual(target.camera.position);
    expect(after?.camera.quaternion).toEqual(target.camera.quaternion);
    return target;
  };
  await begin(); expect(await document()).toEqual(before);
  await page.screenshot({ path: testInfo.outputPath("opening-3d-preview.png") });
  await page.keyboard.press("Escape"); await page.mouse.up();
  expect(await document()).toEqual(before);
  await begin();
  await page.locator("canvas").first().dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true });
  await page.mouse.up(); expect(await document()).toEqual(before);
  const moveStart = await begin(); expect(await document()).toEqual(before); await page.mouse.up();
  await expect.poll(async () => opening(await document()).offsetMm).not.toBe(opening(before).offsetMm);
  const moved = await document();
  expect(opening(moved).widthMm).toBe(601);
  expect(Number.isSafeInteger(opening(moved).offsetMm)).toBe(true);
  expect(opening(moved).offsetMm).toBeGreaterThan(opening(before).offsetMm);
  await expect.poll(async () => (await read())?.userData.canonicalGeometryHash).toBe(compileCanonicalFloorPlanRenderModel(moved).geometryHash);
  const movedScene = (await read())!;
  const moveDown = movedScene.pointerEvents!.filter(({ type }) => type === "pointerdown").at(-1)!;
  const moveUp = movedScene.pointerEvents!.filter(({ type }) => type === "pointerup").at(-1)!;
  expect(Math.hypot(movedScene.screen.x - (moveUp.x + moveStart.screen.x - moveDown.x),
    movedScene.screen.y - (moveUp.y + moveStart.screen.y - moveDown.y))).toBeLessThan(1.5);
  await begin("end"); expect(await document()).toEqual(moved); await page.mouse.up();
  await expect.poll(async () => opening(await document()).widthMm).toBeGreaterThan(601);
  const resized = await document();
  await writeFile(testInfo.outputPath("opening-3d-resized-scene.json"), JSON.stringify({ requests, resized: opening(resized), nativeEvents: await page.evaluate(() => Reflect.get(window, "__scanPlanPointerEvents")), scene: await read("end"), body: await read() }, null, 2));
  expect(opening(resized).offsetMm).toBe(opening(moved).offsetMm);
  expect(Number.isSafeInteger(opening(resized).widthMm)).toBe(true);
  await frame();
  await expect.poll(async () => Boolean(await read("end"))).toBe(true);
  const finalHandle = (await read("end"))!;
  const released = finalHandle.pointerEvents!.filter(({ type }) => type === "pointerup").at(-1)!;
  // Native WebKit rounds CSS pointer positions. Compare the rendered endpoint with that actual input,
  // using the same 1.5px visual gesture budget as wall dragging; numeric edits remain exact millimetres.
  expect(Math.hypot(finalHandle.screen.x - released.x, finalHandle.screen.y - released.y)).toBeLessThan(1.5);
  const undo = page.getByRole("button", { name: /^Undo/ });
  await undo.click(); await expect.poll(document).toEqual(moved);
  await undo.click(); await expect.poll(document).toEqual(before);
  await page.getByRole("button", { name: /^Redo/ }).click(); await expect.poll(document).toEqual(moved);
  await undo.click(); await expect.poll(document).toEqual(before);
  await page.getByTestId("editor-view-2d").click();
  expect(await document()).toEqual(before);
  await writeFile(testInfo.outputPath("opening-3d-evidence.json"), JSON.stringify({ actual, movedScene, finalHandle, before: opening(before), moved: opening(moved), resized: opening(resized),
    checks: ["actual R3F mesh hash and dimensions", "real extruded solid and body-band vertex heights", "pointercancel", "redo", "real camera projection", "camera fixed during gestures", "actual native pointer alignment below1.5px", "selection retained after release", "3D preview immutability", "Escape", "perspective drag follows host", "odd width unchanged", "resize holds opposite endpoint", "complete undo", "2D returns same document"] }, null, 2));
}
