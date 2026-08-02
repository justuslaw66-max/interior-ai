import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

type DiagnosticsGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
  __INTERIOR_AI_GLB_DIAGNOSTICS__?: Record<string, unknown>;
  __INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__?: number;
};

const diagnosticsGlobal = globalThis as DiagnosticsGlobal;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: globalThis,
});
diagnosticsGlobal.__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ = true;

const sessionValues = new Map<string, string>();
Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: {
    getItem: (key: string) => sessionValues.get(key) ?? null,
    setItem: (key: string, value: string) => sessionValues.set(key, value),
  },
});

async function main() {
const diagnostics = await import(
  "../components/scene/glb-scaled-model/modelDiagnostics"
);

function resetDocumentGeneration() {
  delete diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__;
  delete diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__;
}

function snapshot(key: string) {
  const value = diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__?.[key];
  assert.ok(value, `${key} should have a diagnostic snapshot`);
  return value as import("../components/scene/glb-scaled-model/modelDiagnostics").GLBModelDiagnosticSnapshot;
}

const first = diagnostics.recordGLBModelMount(
  "scene-item-1",
  "/assets/models/shared.glb",
  {
    sceneItemId: "scene-item-1",
    productId: "product-1",
    variantId: "variant-1",
    readinessKey: "room-1:scene-item-1:product-1:variant-1:standard",
    requiredForReadiness: true,
  }
);
diagnostics.recordGLBModelPipelineStage(first, "request-started");
diagnostics.recordGLBModelPipelineStage(first, "response-complete", {
  cacheStatus: "network",
});
diagnostics.recordGLBModelPipelineStage(first, "parse-complete");
diagnostics.recordGLBModelPipelineStage(first, "normalization-complete");
diagnostics.recordGLBModelPipelineStage(first, "materials-complete");
diagnostics.recordGLBModelPipelineStage(first, "bounds-complete");
diagnostics.recordGLBModelPipelineStage(first, "scene-attached");
diagnostics.reportGLBModelLoadState(first, "ready");

const initial = snapshot("scene-item-1");
assert.equal(initial.active, true);
assert.equal(initial.loadState, "ready");
assert.equal(initial.requiredForReadiness, true);
assert.equal(initial.responseCompleted, true);
assert.equal(initial.cacheStatus, "network");
assert.equal(initial.parseDecodeState, "complete");
assert.equal(initial.normalizationState, "complete");
assert.equal(initial.materialState, "complete");
assert.equal(initial.boundsState, "complete");
assert.equal(initial.sceneAttachmentState, "complete");
assert.equal(initial.terminalErrorCategory, null);

const initialReadiness = diagnostics.evaluateRequiredGLBModelReadiness(
  [initial],
  [
    {
      key: initial.key,
      mountInstanceId: initial.mountInstanceId,
      reloadGeneration: initial.reloadGeneration,
    },
  ]
);
assert.equal(initialReadiness.state, "ready");
assert.deepEqual(initialReadiness.pending, []);
diagnostics.recordGLBModelMetadata(first, {
  sceneItemId: "scene-item-1",
  productId: "product-1",
  variantId: "variant-1",
  readinessKey: "room-2:scene-item-1:product-1:variant-1:standard",
  requiredForReadiness: true,
});
assert.equal(
  snapshot("scene-item-1").readinessKey,
  "room-2:scene-item-1:product-1:variant-1:standard",
  "readiness metadata must update without recreating a completed lifecycle"
);

diagnostics.recordGLBModelUnmount(first);
const unmounted = snapshot("scene-item-1");
assert.equal(unmounted.active, false);
assert.equal(unmounted.loadState, "cancelled");
assert.equal(unmounted.cancellationState, "unmounted");
assert.equal(unmounted.pendingStage, "cancelled");

const cached = diagnostics.recordGLBModelMount(
  "scene-item-1",
  "/assets/models/shared.glb",
  {
    sceneItemId: "scene-item-1",
    productId: "product-1",
    variantId: "variant-1",
    readinessKey: "room-1:scene-item-1:product-1:variant-1:standard",
    requiredForReadiness: true,
  }
);
diagnostics.recordGLBModelPipelineStage(cached, "request-started");
diagnostics.recordGLBModelPipelineStage(cached, "response-complete", {
  cacheStatus: "cache-hit",
});
diagnostics.recordGLBModelPipelineStage(cached, "parse-complete");
diagnostics.recordGLBModelPipelineStage(cached, "normalization-complete");
diagnostics.recordGLBModelPipelineStage(cached, "materials-complete");
diagnostics.recordGLBModelPipelineStage(cached, "bounds-complete");
diagnostics.recordGLBModelPipelineStage(cached, "scene-attached");
diagnostics.reportGLBModelLoadState(cached, "ready");
assert.equal(snapshot("scene-item-1").cacheStatus, "cache-hit");

const superseded = diagnostics.recordGLBModelMount(
  "scene-item-1",
  "/assets/models/shared.glb",
  {
    sceneItemId: "scene-item-1",
    productId: "product-1",
    variantId: "variant-1",
    readinessKey: "room-1:scene-item-1:product-1:variant-1:standard",
    requiredForReadiness: true,
  }
);
assert.notEqual(superseded.mountInstanceId, cached.mountInstanceId);
diagnostics.reportGLBModelLoadState(cached, "ready");
assert.equal(snapshot("scene-item-1").mountInstanceId, superseded.mountInstanceId);
assert.equal(snapshot("scene-item-1").loadState, "loading");
assert.equal(snapshot("scene-item-1").ignoredStaleTransitionCount, 1);
diagnostics.recordGLBModelPipelineStage(superseded, "response-complete", {
  cacheStatus: "cache-hit",
});
diagnostics.recordGLBModelPipelineStage(superseded, "parse-complete");
assert.equal(
  diagnostics.reportGLBModelLoadState(superseded, "ready"),
  false,
  "ready must not publish before every required pipeline stage completes"
);
diagnostics.recordGLBModelPipelineStage(superseded, "normalization-complete");
diagnostics.recordGLBModelPipelineStage(superseded, "materials-complete");
diagnostics.recordGLBModelPipelineStage(superseded, "bounds-complete");
diagnostics.recordGLBModelPipelineStage(superseded, "scene-attached");
assert.equal(diagnostics.reportGLBModelLoadState(superseded, "ready"), true);
assert.equal(snapshot("scene-item-1").loadState, "ready");

const duplicateUrl = diagnostics.recordGLBModelMount(
  "scene-item-2",
  "/assets/models/shared.glb",
  {
    sceneItemId: "scene-item-2",
    productId: "product-1",
    variantId: "variant-1",
    readinessKey: "room-1:scene-item-2:product-1:variant-1:standard",
    requiredForReadiness: true,
  }
);
assert.notEqual(duplicateUrl.mountInstanceId, superseded.mountInstanceId);
assert.equal(snapshot("scene-item-2").urlHash, snapshot("scene-item-1").urlHash);
diagnostics.recordGLBModelPipelineStage(duplicateUrl, "response-complete", {
  cacheStatus: "network",
});
assert.equal(
  snapshot("scene-item-2").pendingStage,
  "parse-decode",
  "a response-complete record must identify its exact pending post-response stage"
);

const optional = diagnostics.recordGLBModelMount(
  "background-model",
  "/assets/models/background.glb",
  {
    sceneItemId: "background-model",
    productId: "background",
    variantId: null,
    readinessKey: null,
    requiredForReadiness: false,
  }
);
diagnostics.recordGLBModelPipelineStage(optional, "request-started");
const requiredOnly = diagnostics.evaluateRequiredGLBModelReadiness(
  [snapshot("scene-item-1"), snapshot("background-model")],
  [
    {
      key: snapshot("scene-item-1").key,
      mountInstanceId: snapshot("scene-item-1").mountInstanceId,
      reloadGeneration: snapshot("scene-item-1").reloadGeneration,
    },
  ]
);
assert.equal(requiredOnly.state, "ready");

diagnostics.reportGLBModelLoadState(
  duplicateUrl,
  "error",
  undefined,
  "gltf-parse-decode-failed"
);
assert.equal(snapshot("scene-item-2").loadState, "error");
assert.equal(
  snapshot("scene-item-2").terminalErrorCategory,
  "gltf-parse-decode-failed"
);

const boundsFailure = diagnostics.recordGLBModelMount(
  "scene-item-3",
  "/assets/models/bounds.glb",
  {
    sceneItemId: "scene-item-3",
    productId: "product-3",
    variantId: null,
    readinessKey: "room-1:scene-item-3:product-3::standard",
    requiredForReadiness: true,
  }
);
diagnostics.recordGLBModelPipelineStage(boundsFailure, "response-complete", {
  cacheStatus: "network",
});
diagnostics.recordGLBModelPipelineStage(boundsFailure, "parse-complete");
diagnostics.recordGLBModelPipelineStage(boundsFailure, "normalization-complete");
diagnostics.reportGLBModelLoadState(
  boundsFailure,
  "error",
  undefined,
  "glb-bounds-failed"
);
assert.equal(snapshot("scene-item-3").loadState, "error");
assert.equal(snapshot("scene-item-3").boundsState, "error");

const terminalStageCases = [
  ["normalization", "glb-normalization-failed", "normalizationState"],
  ["material", "glb-material-setup-failed", "materialState"],
  ["attachment", "glb-scene-attachment-failed", "sceneAttachmentState"],
] as const;
for (const [keySuffix, category, stateField] of terminalStageCases) {
  const key = `terminal-${keySuffix}`;
  const handle = diagnostics.recordGLBModelMount(key, `/models/${key}.glb`, {
    sceneItemId: key,
    productId: key,
    variantId: null,
    readinessKey: `room-1:${key}:${key}::standard`,
    requiredForReadiness: true,
  });
  diagnostics.reportGLBModelLoadState(handle, "error", undefined, category);
  assert.equal(snapshot(key).loadState, "error");
  assert.equal(snapshot(key)[stateField], "error");
  diagnostics.recordGLBModelPipelineStage(handle, "scene-attached");
  diagnostics.reportGLBModelLoadState(handle, "ready");
  assert.equal(
    snapshot(key).loadState,
    "error",
    "terminal errors must absorb later stage and ready transitions"
  );
  assert.equal(snapshot(key)[stateField], "error");
}

for (let index = 0; index < 140; index += 1) {
  const key = `inactive-${index}`;
  const handle = diagnostics.recordGLBModelMount(key, `/models/${key}.glb`, {
    sceneItemId: key,
    productId: key,
    variantId: null,
    readinessKey: null,
    requiredForReadiness: false,
  });
  diagnostics.recordGLBModelUnmount(handle);
}
const boundedStore = Object.values(
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ?? {}
) as import("../components/scene/glb-scaled-model/modelDiagnostics").GLBModelDiagnosticSnapshot[];
const boundedInactive = boundedStore.filter((diagnostic) => !diagnostic.active);
assert.ok(boundedInactive.length <= 128);
assert.equal(
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__?.["inactive-0"],
  undefined,
  "old inactive tombstones must be pruned"
);

const firstGeneration = snapshot("scene-item-1").reloadGeneration;
resetDocumentGeneration();
const nextGeneration = diagnostics.recordGLBModelMount(
  "scene-item-1",
  "/assets/models/shared.glb",
  {
    sceneItemId: "scene-item-1",
    productId: "product-1",
    variantId: "variant-1",
    readinessKey: "room-1:scene-item-1:product-1:variant-1:standard",
    requiredForReadiness: true,
  }
);
assert.ok(nextGeneration.reloadGeneration > firstGeneration);
assert.deepEqual(
  Object.keys(diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ?? {}),
  ["scene-item-1"],
  "a new document generation must not retain stale registry entries"
);

for (let reload = 0; reload < 2; reload += 1) {
  resetDocumentGeneration();
  const handle = diagnostics.recordGLBModelMount(
    "scene-item-1",
    "/assets/models/shared.glb",
    {
      sceneItemId: "scene-item-1",
      productId: "product-1",
      variantId: "variant-1",
      readinessKey: "room-1:scene-item-1:product-1:variant-1:standard",
      requiredForReadiness: true,
    }
  );
  diagnostics.recordGLBModelPipelineStage(handle, "response-complete", {
    cacheStatus: "cache-hit",
  });
  diagnostics.recordGLBModelPipelineStage(handle, "parse-complete");
  diagnostics.recordGLBModelPipelineStage(handle, "normalization-complete");
  diagnostics.recordGLBModelPipelineStage(handle, "materials-complete");
  diagnostics.recordGLBModelPipelineStage(handle, "bounds-complete");
  diagnostics.recordGLBModelPipelineStage(handle, "scene-attached");
  diagnostics.reportGLBModelLoadState(handle, "ready");
  assert.equal(
    Object.keys(diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ?? {}).length,
    1
  );
}

const componentSource = readFileSync(
  join(process.cwd(), "components/scene/GLBScaledModel.tsx"),
  "utf8"
);
const attachmentSource = readFileSync(
  join(
    process.cwd(),
    "components/scene/glb-scaled-model/GLBModelAttachmentBoundary.tsx"
  ),
  "utf8"
);
const materialsSource = readFileSync(
  join(
    process.cwd(),
    "components/scene/glb-scaled-model/useGLBMaterials.ts"
  ),
  "utf8"
);
assert.match(materialsSource, /Promise\.allSettled/);
assert.match(materialsSource, /glb-material-setup-failed/);
assert.match(componentSource, /glb-material-setup-failed/);
assert.match(componentSource, /GLBModelAttachmentBoundary/);
assert.match(attachmentSource, /componentDidCatch/);
assert.match(componentSource, /glb-scene-attachment-failed/);

console.log(
  "GLB model lifecycle tests passed: network/cache readiness, metadata-only changes, monotonic terminal states, bounded inactive records, wired material/attachment failures, and three reload generations converge."
);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
