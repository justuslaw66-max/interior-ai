import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import sharp from "sharp";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { densePerformanceApartment } from "./fixtures/scan-to-editable-plan/performance-apartment";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { applyConfirmedConsumerWallEditV2 } from "@/lib/floor-plan-consumer-wall-edit";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { buildWallGestureDraft } from "@/lib/floor-plan-wall-gesture";
import { normalizeRasterForLinework, extractRasterLinework } from "@/lib/floor-plan-imports/raster-linework";

function statistics(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return { samples: samples.length, medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.ceil(sorted.length * .95) - 1], maxMs: sorted.at(-1)! };
}
function measure(operation: () => unknown, samples = 40, warmup = 5) {
  for (let index = 0; index < warmup; index++) operation();
  const durations: number[] = [];
  for (let index = 0; index < samples; index++) { const start = performance.now(); operation(); durations.push(performance.now() - start); }
  return statistics(durations);
}
async function main() {
  assert.equal(process.env.FLOOR_PLAN_VISION_DISABLED, "1", "No external inference permitted by this benchmark");
  const output = process.env.SCAN_PLAN_PERFORMANCE_OUTPUT;
  assert.ok(output, "Explicit private output path required");
  const results: Array<Record<string, unknown>> = [];
  const failures: string[] = [];
  for (const [label, document] of [["authored apartment", authoredApartment()], ["dense authored stress variant", densePerformanceApartment()]] as const) {
    const floor = document.floors[0], before = JSON.stringify(document);
    const snapshot = canonicalFloorPlanToDesignSnapshot(document).snapshot;
    global.gc?.(); const memoryBefore = process.memoryUsage();
    const compile = measure(() => compileFloorPlanDocumentV2(structuredClone(document)));
    const mutation = measure(() => {
      const result = applyConfirmedConsumerWallEditV2({ snapshot, sourceEditConfirmed: true,
        operation: { kind: "update_wall", floorId: floor.id, wallId: "north-west", changes: { thicknessMm: 201 } },
        context: { actorId: "authored-performance", mutationId: "timed-edit", nextRevisionId: "timed-revision", mutatedAt: "2026-09-15T00:00:00Z" } });
      assert.equal(result.snapshot.floorPlan?.canonicalDocument?.floors[0].walls.find(({ id }) => id === "north-west")?.thicknessMm, 201);
    });
    const renderProjection = measure(() => compileCanonicalFloorPlanRenderModel(structuredClone(document)));
    const pointerGeometry = measure(() => buildWallGestureDraft({ floorId: floor.id, wallId: "north-west", path: floor.walls[0].path,
      start: { xMm: 0, zMm: 0 }, end: { xMm: 4000, zMm: 2500 }, mode: "wall", delta: { xMm: 37, zMm: -14 } }), 1000, 100);
    global.gc?.(); const memoryAfter = process.memoryUsage();
    assert.equal(JSON.stringify(document), before);
    if (compile.p95Ms > 50 || mutation.p95Ms > 50) failures.push(`${label}: compile or accepted mutation p95 exceeds frozen50ms`);
    if (pointerGeometry.p95Ms > 16) failures.push(`${label}: pointer geometry p95 exceeds16ms`);
    results.push({ label, walls: floor.walls.length, openings: floor.openings.length, rooms: floor.rooms.length,
      compile, acceptedConsumerMutation: mutation, renderProjection, pointerGeometry, memoryBefore, memoryAfter });
  }
  const drawing = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="white"/>' +
    Array.from({ length: 4 }, (_, index) => `<rect x="${60 + index * 220}" y="80" width="180" height="800" fill="none" stroke="${index % 2 ? "#777" : "black"}" stroke-width="${index % 2 ? 2 : 7}"/>`).join("") + '</svg>';
  const raster = await sharp(Buffer.from(drawing)).png().toBuffer();
  const extractionTimes: number[] = []; let segmentCount = 0;
  for (let index = 0; index < 5; index++) {
    const start = performance.now(), normalized = await normalizeRasterForLinework(raster);
    const extracted = await extractRasterLinework(normalized.bytes, { pageNumber: 1, expectedWidthPx: normalized.widthPx, expectedHeightPx: normalized.heightPx, normalization: normalized.normalization });
    extractionTimes.push(performance.now() - start); segmentCount = extracted.vectorSegments.length;
  }
  const rasterExtraction = { ...statistics(extractionTimes), inputPixels: 1_000_000, segmentCount, ocr: "Excluded; no external model", dataset: "Authored geometric stress input, not recognition-quality evidence" };
  if (rasterExtraction.maxMs > 30_000) failures.push("1MP extraction exceeds frozen30s budget");
  const result = { environment: { node: process.version, platform: `${process.platform}-${process.arch}`, cpu: os.cpus()[0].model, cpuCount: os.cpus().length, memoryBytes: os.totalmem(), gcExposed: Boolean(global.gc) },
    frozenBudgets: { compileAndMutationP95Ms: 50, pointerComputationP95Ms: 16, oneMegapixelExtractionMaxMs: 30000 },
    limits: ["Local Node measurements; native browser pointer/render and memory require separate coverage", "Stress variant is not an independent recognition plan", "Memory is observed, not a newly invented universal device budget"], results, rasterExtraction, failures };
  await writeFile(output, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  assert.deepEqual(failures, []);
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
