import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  BoundedMetadataRing,
  GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
  GLB_MAIN_THREAD_TIMING_CATEGORIES,
  attributeGLBLongTaskCategory,
  copyGLBMainThreadLongTasks,
} from "../components/scene/glb-scaled-model/glbMainThreadTelemetry";

const ring = new BoundedMetadataRing<number>(3);
ring.push(1);
ring.push(2);
ring.push(3);
ring.push(4);
assert.deepEqual(ring.snapshot(), [2, 3, 4]);
assert.notEqual(ring.snapshot(), ring.snapshot());

assert.deepEqual(GLB_MAIN_THREAD_TIMING_CATEGORIES, [
  "gltf-callback",
  "parsed-cache-acquisition",
  "prepared-cache-acquisition",
  "prepared-model-clone",
  "normalization",
  "bounds-computation",
  "material-texture-setup",
  "scene-attachment",
  "r3f-render",
  "resource-disposal",
]);
assert.equal(new Set(GLB_MAIN_THREAD_TIMING_CATEGORIES).size, 10);
assert.equal(GLB_MAIN_THREAD_TELEMETRY_CAPACITY, 96);
const sourceLongTasks = [{
  startRelativeMs: 1,
  durationMs: 2,
  category: "unattributed" as const,
  reloadGeneration: 3,
  activeRequiredCount: 8,
  modelStageCounts: {
    response: 0,
    "parse-decode": 0,
    normalization: 0,
    materials: 0,
    bounds: 8,
    "scene-attachment": 0,
    "ready-commit": 0,
    ready: 0,
    error: 0,
  },
}];
const copiedLongTasks = copyGLBMainThreadLongTasks(sourceLongTasks);
copiedLongTasks[0].modelStageCounts.bounds = 0;
assert.equal(sourceLongTasks[0].modelStageCounts.bounds, 8);
assert.equal(
  attributeGLBLongTaskCategory(
    [{ startRelativeMs: 100, durationMs: 148, category: "r3f-render" }],
    100,
    10_736,
  ),
  "unattributed",
);
assert.equal(
  attributeGLBLongTaskCategory(
    [{ startRelativeMs: 100, durationMs: 90, category: "normalization" }],
    100,
    100,
  ),
  "normalization",
);

const overheadRing = new BoundedMetadataRing<{
  startRelativeMs: number;
  durationMs: number;
  category: string;
}>(GLB_MAIN_THREAD_TELEMETRY_CAPACITY);
const overheadStartedAtMs = performance.now();
for (let index = 0; index < 10_000; index += 1) {
  overheadRing.push({
    startRelativeMs: index,
    durationMs: 0.1,
    category: "normalization",
  });
}
const overheadDurationMs = performance.now() - overheadStartedAtMs;
assert.equal(overheadRing.snapshot().length, GLB_MAIN_THREAD_TELEMETRY_CAPACITY);
assert.ok(
  overheadDurationMs < 500,
  `bounded telemetry recording took ${overheadDurationMs.toFixed(1)} ms`,
);

const source = readFileSync(
  path.join(
    process.cwd(),
    "components/scene/glb-scaled-model/glbMainThreadTelemetry.ts",
  ),
  "utf8",
);
assert.match(
  source,
  /process\.env\.NODE_ENV !== "production"[\s\S]*__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__/,
);
assert.match(source, /observer\.observe\(\{ type: "longtask", buffered: true \}\)/);
assert.match(source, /entry\.startTime < state\.startedAtMs/);
assert.match(source, /Unsupported entry types must never affect model loading/);
assert.match(source, /timingAggregates: emptyTimingAggregates\(\)/);
assert.match(source, /aggregate\.maximumDurationMs = Math\.max/);
assert.doesNotMatch(source, /renderInvalidations/);
assert.doesNotMatch(source, /\b(?:url|path|geometry|material|texture|credential)\s*:/i);

console.log(
  `GLB main-thread telemetry checks passed (${overheadDurationMs.toFixed(1)} ms for 10,000 bounded ring writes).`,
);
