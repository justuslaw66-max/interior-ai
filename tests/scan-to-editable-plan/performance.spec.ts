import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { densePerformanceApartment } from "../../scripts/fixtures/scan-to-editable-plan/performance-apartment";
import { canonicalFloorPlanToDesignSnapshot } from "../../lib/floor-plan-legacy-adapters";
import { snapshotToStored, storedToSnapshot } from "../../lib/room-persistence";
import { compileCanonicalFloorPlanRenderModel } from "../../lib/floor-plan-render-model";
import { resolveCanonicalCameraCutawayWallKeys, canonicalWallCutawayKey } from "../../lib/floor-plan-camera-cutaway";
import { observeRenderedScene } from "./rendered-scene-observer";
import { observePointerPerformance, rendererPerformance, pointerAndRenderSamples } from "./performance-observer";

function statistics(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples: sorted.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1) };
}

test("Native pointer, renderer and memory observations on 100 walls and 50 openings", async ({ page, context }, info) => {
  await observeRenderedScene(page); await observePointerPerformance(page);
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  const key = "interior-ai:v1:livingroom-design";
  const initial = snapshotToStored(canonicalFloorPlanToDesignSnapshot(densePerformanceApartment()).snapshot);
  await page.addInitScript(({ key, initial }) => {
    if (window !== window.top) return;
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(initial));
    localStorage.setItem("interior-ai:beta-start-dismissed", "1");
  }, { key, initial });
  const saved = () => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), key);
  const started = Date.now();
  await page.goto("/design");
  await page.getByRole("button", { name: "Yes, it matches", exact: true }).click();
  await page.getByTestId("editor-view-2d").click();
  const panel = page.getByTestId("imported-wall-editor");
  await panel.getByTestId("request-edit-imported-walls").click();
  await panel.getByTestId("confirm-edit-local-floor-plan").click();
  await panel.getByLabel("Wall", { exact: true }).selectOption("north-west");
  await expect.poll(async () => Boolean(await rendererPerformance(page))).toBe(true);
  const readyMs = Date.now() - started;
  await rendererPerformance(page, true);
  const before = (await saved()).floorPlan.canonicalDocument;
  expect(before.floors[0].walls).toHaveLength(100); expect(before.floors[0].openings).toHaveLength(50);
  const handle = page.getByTestId("canonical-wall-drag-wall");
  await expect(handle).toBeVisible();
  const bounds = await handle.boundingBox(); if (!bounds) throw new Error("Native wall handle unavailable");
  const origin = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await page.evaluate(() => { (window as typeof window & { __scanPlanPerformance: { active: boolean } }).__scanPlanPerformance.active = true; });
  for (let index = 0; index < 5; index++) {
    await page.mouse.move(origin.x, origin.y); await page.mouse.down();
    for (let step = 1; step <= 20; step++) {
      await page.mouse.move(origin.x + 30 * step / 20, origin.y + step);
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    }
    await page.keyboard.press("Escape"); await page.mouse.up();
  }
  await page.evaluate(() => { (window as typeof window & { __scanPlanPerformance: { active: boolean } }).__scanPlanPerformance.active = false; });
  expect((await saved()).floorPlan.canonicalDocument).toEqual(before);
  const cdp = info.project.name === "chromium" ? await context.newCDPSession(page) : null;
  if (cdp) { await cdp.send("Performance.enable"); await cdp.send("HeapProfiler.collectGarbage"); }
  const heapBefore = cdp ? await cdp.send("Performance.getMetrics") : null;
  const renderStates: Array<Awaited<ReturnType<typeof rendererPerformance>>> = [];
  const snapshot = storedToSnapshot(await saved()), model = compileCanonicalFloorPlanRenderModel(before);
  const activeId = await page.getByTestId("qa-design-layout-debug").getAttribute("data-active-room-id");
  const room = snapshot.rooms.find(({ id }) => id === activeId)!;
  const target = { x: room.planPosition?.x ?? 0, z: room.planPosition?.z ?? 0, width: room.geometry.width, depth: room.geometry.depth };
  const heapCycles = [];
  for (let index = 0; index < 6; index++) {
    await page.getByTestId("editor-view-3d").click();
    await expect.poll(async () => {
      const rendered = await rendererPerformance(page); if (!rendered?.wallIds.length) return false;
      const excluded = resolveCanonicalCameraCutawayWallKeys(model, rendered.camera, target, { viewDirection: rendered.viewDirection, pinnedWallIds: new Set(["north-west"]) });
      const visibleWalls = model.floors[0].walls.filter((wall) => !excluded.has(canonicalWallCutawayKey(model.floors[0].id, wall.id)));
      const wallIds = visibleWalls.map(({ id }) => id).sort(), openingIds = visibleWalls.flatMap(({ openings }) => openings.map(({ id }) => id)).sort();
      return JSON.stringify(rendered.wallIds) === JSON.stringify(wallIds) && JSON.stringify(rendered.openingIds) === JSON.stringify(openingIds);
    }).toBe(true);
    renderStates.push(await rendererPerformance(page));
    await page.getByTestId("editor-view-2d").click();
    await expect.poll(async () => (await rendererPerformance(page))?.wallIds.length).toBe(0);
    if (cdp) { await cdp.send("HeapProfiler.collectGarbage"); heapCycles.push(await cdp.send("Performance.getMetrics")); }
  }
  if (cdp) await cdp.send("HeapProfiler.collectGarbage");
  const heapAfter = cdp ? await cdp.send("Performance.getMetrics") : null;
  const samples = await pointerAndRenderSamples(page);
  expect(samples.pointerHandlerMs.length).toBeGreaterThanOrEqual(50);
  expect(samples.renderCpuMs.length).toBeGreaterThan(0);
  const pointer = statistics(samples.pointerHandlerMs), render = statistics(samples.renderCpuMs);
  const result = { browser: info.project.name, userAgent: await page.evaluate(() => navigator.userAgent), viewport: page.viewportSize(), readyMs,
    walls: 100, openings: 50, rooms: 2, pointer, render, pointerCallbacks: samples.pointerCallbacks, renderStates, heapBefore, heapCycles, heapAfter,
    enforced: process.env.SCAN_PLAN_PERFORMANCE_ENFORCE === "1", pointerBudgetMs: 16,
    notes: ["Native trusted pointer callbacks aggregated per event; excludes subsequent frame rendering", "Renderer CPU duration excludes GPU completion", "100 canonical walls; visible IDs must match the existing camera cutaway policy", "Chromium heap measured after GC before first 3D and after each cycle; WebKit heap unavailable", "Six repeated 3D/2D cycles; no universal memory budget claimed", "Authored stress input, not independent recognition evidence"], errors };
  await writeFile(info.outputPath("browser-performance.json"), JSON.stringify(result, null, 2));
  await page.screenshot({ path: info.outputPath("dense-plan-2d.png") });
  expect((await saved()).floorPlan.canonicalDocument).toEqual(before); expect(errors).toEqual([]);
  if (process.env.SCAN_PLAN_PERFORMANCE_ENFORCE === "1") expect(pointer.p95Ms).toBeLessThanOrEqual(16);
});
