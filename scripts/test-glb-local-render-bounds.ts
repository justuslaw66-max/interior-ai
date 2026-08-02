import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";

import {
  areGLBLocalRenderBoundsEquivalent,
  createGLBLocalRenderBoundsTracker,
  GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS,
  isValidGLBLocalRenderBounds,
  observeGLBLocalRenderBounds,
  type GLBLocalRenderBounds,
} from "../components/scene/glb-scaled-model/localRenderBounds";
import {
  categorizeGLBBoundsFailure,
  clonePreparedGLBForMount,
  GLBSourceLoadError,
} from "../components/scene/glb-scaled-model/glbModelResources";

const preparedSource = new THREE.Group();
const preparedSourceMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x336699 }),
);
preparedSource.add(preparedSourceMesh);
const preparedFirst = clonePreparedGLBForMount(preparedSource);
const preparedSecond = clonePreparedGLBForMount(preparedSource);
const preparedFirstMesh = preparedFirst.children[0] as THREE.Mesh;
const preparedSecondMesh = preparedSecond.children[0] as THREE.Mesh;
assert.notEqual(preparedFirstMesh, preparedSecondMesh);
assert.notEqual(preparedFirstMesh.geometry, preparedSecondMesh.geometry);
assert.notEqual(preparedFirstMesh.material, preparedSecondMesh.material);
preparedFirst.position.x = 4;
const preparedSecondFirstVertexX = preparedSecondMesh.geometry
  .getAttribute("position")
  .getX(0);
preparedFirstMesh.geometry.translate(2, 0, 0);
(preparedFirstMesh.material as THREE.Material).opacity = 0.25;
assert.equal(preparedSecond.position.x, 0);
assert.equal(
  preparedSecondMesh.geometry.getAttribute("position").getX(0),
  preparedSecondFirstVertexX,
);
assert.equal((preparedSecondMesh.material as THREE.Material).opacity, 1);
assert.equal(preparedSource.position.x, 0);
assert.equal((preparedSourceMesh.material as THREE.Material).opacity, 1);

const baseBounds: GLBLocalRenderBounds = {
  center: [0.25, 0.5, -0.75],
  size: [1.2, 0.8, 2.4],
};
const equalBounds: GLBLocalRenderBounds = {
  center: [...baseBounds.center],
  size: [...baseBounds.size],
};
const subToleranceBounds: GLBLocalRenderBounds = {
  center: [
    baseBounds.center[0] + GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS / 2,
    baseBounds.center[1],
    baseBounds.center[2],
  ],
  size: [
    baseBounds.size[0],
    baseBounds.size[1] - GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS / 2,
    baseBounds.size[2],
  ],
};
const changedBounds: GLBLocalRenderBounds = {
  center: [
    baseBounds.center[0] + GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS * 2,
    baseBounds.center[1],
    baseBounds.center[2],
  ],
  size: [...baseBounds.size],
};
const changedSizeBounds: GLBLocalRenderBounds = {
  center: [...baseBounds.center],
  size: [
    baseBounds.size[0],
    baseBounds.size[1],
    baseBounds.size[2] + GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS * 2,
  ],
};

assert.equal(areGLBLocalRenderBoundsEquivalent(baseBounds, equalBounds), true);
assert.equal(
  areGLBLocalRenderBoundsEquivalent(baseBounds, subToleranceBounds),
  true
);
assert.equal(areGLBLocalRenderBoundsEquivalent(baseBounds, changedBounds), false);
assert.equal(
  areGLBLocalRenderBoundsEquivalent(baseBounds, changedSizeBounds),
  false
);
assert.equal(areGLBLocalRenderBoundsEquivalent(null, null), true);
assert.equal(areGLBLocalRenderBoundsEquivalent(null, baseBounds), false);

const invalidBounds: GLBLocalRenderBounds = {
  center: [Number.NaN, 0, 0],
  size: [1, 1, 1],
};
assert.equal(isValidGLBLocalRenderBounds(invalidBounds), false);
assert.equal(areGLBLocalRenderBoundsEquivalent(invalidBounds, invalidBounds), false);

const tracker = createGLBLocalRenderBoundsTracker();
const firstObservation = observeGLBLocalRenderBounds(tracker, baseBounds);
assert.equal(firstObservation.outcome, "changed");
if (firstObservation.outcome !== "changed") {
  throw new Error("Expected the first valid bounds to be reported");
}
assert.notEqual(firstObservation.bounds, baseBounds);
assert.deepEqual(firstObservation.bounds, baseBounds);

assert.equal(
  observeGLBLocalRenderBounds(tracker, equalBounds).outcome,
  "equivalent"
);
assert.equal(
  observeGLBLocalRenderBounds(tracker, subToleranceBounds).outcome,
  "equivalent"
);
assert.equal(
  observeGLBLocalRenderBounds(tracker, changedBounds).outcome,
  "changed"
);
assert.equal(tracker.materialChangeCount, 2);

assert.equal(observeGLBLocalRenderBounds(tracker, null).outcome, "reset");
assert.equal(observeGLBLocalRenderBounds(tracker, null).outcome, "empty");
assert.equal(
  observeGLBLocalRenderBounds(tracker, changedBounds).outcome,
  "changed"
);
assert.equal(tracker.materialChangeCount, 3);

const strictModeRemountTracker = createGLBLocalRenderBoundsTracker();
assert.equal(
  observeGLBLocalRenderBounds(strictModeRemountTracker, baseBounds).outcome,
  "changed"
);
assert.equal(
  observeGLBLocalRenderBounds(strictModeRemountTracker, null).outcome,
  "reset"
);
assert.equal(
  observeGLBLocalRenderBounds(strictModeRemountTracker, equalBounds).outcome,
  "changed"
);
assert.equal(
  observeGLBLocalRenderBounds(strictModeRemountTracker, equalBounds).outcome,
  "equivalent"
);
assert.equal(
  observeGLBLocalRenderBounds(strictModeRemountTracker, invalidBounds).outcome,
  "invalid"
);
assert.equal(strictModeRemountTracker.materialChangeCount, 2);
assert.equal(
  categorizeGLBBoundsFailure(new Error("unexpected bounds failure")).category,
  "glb-bounds-failed"
);
assert.equal(
  categorizeGLBBoundsFailure(
    new GLBSourceLoadError("glb-empty-bounds")
  ).category,
  "glb-empty-bounds"
);

const readSource = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");
const furnitureSource = readSource("components/scene/FurnitureItem.tsx");
const scaledModelSource = readSource("components/scene/GLBScaledModel.tsx");
const selectionOutlineSource = readSource(
  "components/scene/furniture/FurnitureSelectionOutline.tsx"
);
const diagnosticsSource = [
  readSource("components/scene/glb-scaled-model/modelDiagnostics.ts"),
  readSource("components/scene/glb-scaled-model/modelLifecycleTypes.ts"),
].join("\n");
const resourcesSource = readSource(
  "components/scene/glb-scaled-model/glbModelResources.ts"
);
const loadedResourceSource = readSource(
  "components/scene/glb-scaled-model/useGLBLoadedResource.ts"
);
const requiredSnapshotSource = readSource(
  "components/scene/glb-scaled-model/glbRequiredSnapshot.ts"
);
const runtimeSmokeSource = readSource("tests/e2e/00-runtime-smoke.spec.ts");

assert.doesNotMatch(
  furnitureSource,
  /modelLocalRenderBounds|setModelLocalRenderBounds|onLocalBoundsChange=/,
  "Furniture must not mirror model-derived bounds into parent React state."
);
assert.match(
  scaledModelSource,
  /createGLBLocalRenderBoundsTracker[\s\S]*memo\(function GLBScaledModel[\s\S]*observeGLBLocalRenderBounds\([\s\S]*observation\.outcome !== "changed"[\s\S]*showSelectionOutline[\s\S]*FurnitureSelectionOutline/,
  "The GLB renderer must be memoized, semantically track bounds, and own its precise outline."
);
assert.match(
  resourcesSource,
  /pagehide[\s\S]*event\.persisted[\s\S]*preparedCache\.clear\(\)[\s\S]*parsedCache\.clear\(\)/,
  "BFCache pagehide must preserve live resources; terminal pagehide clears prepared before parsed."
);
assert.match(
  loadedResourceSource,
  /clonePreparedGLBForMount\(prepared\.scene\)/,
  "each scene item must receive an isolated prepared scene, geometry, and material clone."
);
assert.match(
  loadedResourceSource,
  /function reportLoadFailure[\s\S]*releaseControl\(control\)[\s\S]*reportGLBModelLoadState\(handle, "error"/,
  "failed loads must release their cache lease before terminal lifecycle publication."
);
assert.doesNotMatch(
  requiredSnapshotSource,
  /\.traverse\(|\.clone\(|measureGLBLocalRenderBounds|normalizeGLBScene|setState/,
  "the required snapshot must remain metadata-only and side-effect free."
);
assert.match(runtimeSmokeSource, /__INTERIOR_AI_GLB_REQUIRED_SNAPSHOT__/);
assert.doesNotMatch(
  runtimeSmokeSource,
  /__INTERIOR_AI_GLB_DIAGNOSTICS__/,
  "required reload proof must not depend on the optional rich diagnostics object."
);
assert.match(
  selectionOutlineSource,
  /const centerX = localRenderBounds\.center\[0\][\s\S]*useMemo[\s\S]*userData=\{\{ testId: "selected-furniture-outline" \}\}/,
  "The selection outline must depend on primitive bounds coordinates."
);
assert.match(
  diagnosticsSource,
  /GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD = 6[\s\S]*boundsMaterialChangeCount[\s\S]*boundsPublicationCount[\s\S]*excessiveBoundsWarningCount[\s\S]*loadState[\s\S]*loadErrorCode/,
  "Development diagnostics must track bounds churn and publications."
);

console.log("GLB local render bounds synchronization checks passed.");
