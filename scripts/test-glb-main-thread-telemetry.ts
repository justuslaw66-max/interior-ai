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
  createGLBMainThreadTimingEntry,
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
assert.deepEqual(
  [
    createGLBMainThreadTimingEntry("normalization", 110, 115, 100),
    createGLBMainThreadTimingEntry("bounds-computation", 125, 133, 100),
  ],
  [
    { startRelativeMs: 10, durationMs: 5, category: "normalization" },
    {
      startRelativeMs: 25,
      durationMs: 8,
      category: "bounds-computation",
    },
  ],
  "bootstrap timing hydration must preserve distinct monotonic start times",
);
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
const facadeSource = readFileSync(
  path.join(
    process.cwd(),
    "components/scene/glb-scaled-model/glbMainThreadTelemetryFacade.ts",
  ),
  "utf8",
);
const facadeControllerSource = readFileSync(
  path.join(
    process.cwd(),
    "components/scene/glb-scaled-model/glbMainThreadTelemetryFacadeController.ts",
  ),
  "utf8",
);
const coreSource = readFileSync(
  path.join(
    process.cwd(),
    "components/scene/glb-scaled-model/glbMainThreadTelemetryCore.ts",
  ),
  "utf8",
);
const runtimeSmokeSource = readFileSync(
  path.join(process.cwd(), "tests/e2e/00-runtime-smoke.spec.ts"),
  "utf8",
);
const productionImporters = [
  "components/editor/design-page/DesignSceneCanvas.tsx",
  "components/scene/glb-scaled-model/glbModelResourceResolution.ts",
  "components/scene/glb-scaled-model/glbModelResources.ts",
  "components/scene/glb-scaled-model/glbSceneAttachmentTelemetry.ts",
  "components/scene/glb-scaled-model/modelDiagnosticRuntime.ts",
  "components/scene/glb-scaled-model/useGLBLoadedResource.ts",
  "components/scene/glb-scaled-model/useGLBMaterials.ts",
  "components/scene/glb-scaled-model/useGLBModelLifecycle.ts",
];
assert.match(
  source,
  /process\.env\.NODE_ENV !== "production"[\s\S]*__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__/,
);
assert.match(source, /observer\.observe\(\{ type: "longtask", buffered: true \}\)/);
assert.doesNotMatch(
  source,
  /requestAnimationFrame|startFrameGapObserver/,
  "diagnostics must not install a continuous animation-frame observer",
);
assert.match(source, /entry\.startTime < state\.startedAtMs/);
assert.match(source, /Unsupported entry types must never affect model loading/);
assert.match(
  source,
  /timingAggregates: emptyGLBMainThreadTimingAggregates\(\)/,
);
assert.match(source, /aggregate\.maximumDurationMs = Math\.max/);
assert.doesNotMatch(source, /renderInvalidations/);
assert.doesNotMatch(source, /\b(?:url|path|geometry|material|texture|credential)\s*:/i);
assert.match(
  facadeSource,
  /loadTelemetry: \(\) => import\("\.\/glbMainThreadTelemetry"\)/,
  "the complete QA telemetry collector must remain behind a dynamic import",
);
assert.match(
  `${facadeSource}\n${facadeControllerSource}`,
  /__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__[\s\S]*loadTelemetryForDiagnostics/,
  "the lazy telemetry chunk must load only for the explicit diagnostics path",
);
assert.doesNotMatch(
  facadeControllerSource,
  /\.catch\([\s\S]*telemetryLoadStarted\s*=\s*false/,
  "a rejected diagnostics import must fail closed without retrying during lifecycle activity",
);
assert.match(
  coreSource,
  /GLB_MAIN_THREAD_TELEMETRY_CAPACITY = 96/,
  "bootstrap telemetry must use the same strict 96-entry capacity",
);
assert.match(
  facadeControllerSource,
  /bootstrapEvents\.length === GLB_MAIN_THREAD_TELEMETRY_CAPACITY[\s\S]*bootstrapEvents\.shift\(\)[\s\S]*bootstrapEvents\.push\(event\)/,
  "bootstrap events must evict at the fixed capacity",
);
assert.match(
  facadeControllerSource,
  /bootstrapCounters\[counter\] = Math\.min\([\s\S]*GLB_MAIN_THREAD_TELEMETRY_CAPACITY/,
  "fixed bootstrap counters must be capped",
);
assert.match(
  facadeSource,
  /const instrumentedRenderers = new WeakSet<THREE\.WebGLRenderer>\(\)/,
  "renderer instrumentation must not retain a renderer strongly",
);
assert.doesNotMatch(
  `${facadeSource}\n${facadeControllerSource}`,
  /pendingRenderer|THREE\.WebGLRenderer \| null/,
  "lazy initialization must not retain a renderer or raw WebGL graph",
);
assert.doesNotMatch(
  `${facadeSource}\n${facadeControllerSource}`,
  /BoundedMetadataRing|PerformanceObserver|timingAggregates|heartbeatGaps|frameGaps|longTasks/,
  "the facade must not duplicate collector implementation",
);
assert.doesNotMatch(
  `${facadeSource}\n${facadeControllerSource}`,
  /\b(?:url|path|geometry|material|texture|credential|payload|data)\s*:/i,
  "bootstrap telemetry must remain metadata-only",
);
assert.doesNotMatch(
  `${facadeSource}\n${facadeControllerSource}`,
  /setTimeout|setInterval|Promise\.race|AbortController/,
  "telemetry activation must not add retries or timeout behavior",
);
assert.match(
  facadeControllerSource,
  /if \(!this\.dependencies\.telemetryEnabled\(\) \|\| this\.telemetryLoadFailed\)[\s\S]*return operation\(\)/,
  "disabled or failed telemetry must execute lifecycle operations directly",
);
assert.match(
  source,
  /initializeGLBMainThreadTelemetry\(startedAtMs = nowMs\(\)\)[\s\S]*hydrateGLBMainThreadTelemetryBootstrap[\s\S]*state\.bootstrapEventsFlushed \+= queuedRecordCount/,
  "the collector must hydrate and report bounded bootstrap metadata",
);
assert.match(
  facadeControllerSource,
  /bootstrapStartedAtMs \?\?= this\.dependencies\.nowMs\(\)/,
  "lazy hydration must preserve the pre-import monotonic telemetry epoch",
);
assert.match(
  facadeControllerSource,
  /initializeGLBMainThreadTelemetry\(bootstrap\.startedAtMs\)/,
);
assert.match(
  coreSource,
  /type GLBMainThreadBootstrapEvent =[\s\S]*type: "timing"[\s\S]*type: "event-loop-gap"/,
  "bootstrap events must contain only fixed timing and event-loop metadata",
);
assert.match(
  runtimeSmokeSource,
  /recordTelemetryBootstrapEvidence[\s\S]*phaseName: "initial-document"[\s\S]*for \(let reloadIndex = 0; reloadIndex < 3; reloadIndex \+= 1\)[\s\S]*recordTelemetryBootstrapEvidence/,
  "required runtime evidence must prove one coherent activation path in every realm",
);
assert.doesNotMatch(
  runtimeSmokeSource,
  /bootstrapEventsFlushed\s*>\s*0/,
  "runtime smoke must not confuse empty bootstrap activation with event loss",
);
assert.match(
  source,
  /bootstrapRecordsQueuedAtActivation[\s\S]*bootstrapFlushCompleted[\s\S]*directModeActive[\s\S]*directTelemetryObserved/,
  "collector snapshots must retain explicit activation and direct-mode provenance",
);
for (const importerPath of productionImporters) {
  const importerSource = readFileSync(path.join(process.cwd(), importerPath), "utf8");
  assert.doesNotMatch(
    importerSource,
    /from ["'](?:@\/components\/scene\/glb-scaled-model\/|\.\/)?glbMainThreadTelemetry["']/,
    `${importerPath} must not eagerly import the complete telemetry collector`,
  );
}

console.log(
  `GLB main-thread telemetry checks passed (${overheadDurationMs.toFixed(1)} ms for 10,000 bounded ring writes).`,
);
