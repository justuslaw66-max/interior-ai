import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { GLTFLoader } from "three-stdlib";

import {
  areGLBLocalRenderBoundsEquivalent,
  copyGLBLocalRenderBounds,
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
  measureGLBLocalRenderBounds,
  type GLBLoadedResource,
  type GLBModelNormalizationConfig,
} from "../components/scene/glb-scaled-model/glbModelResources";
import {
  boundsForResource,
  normalizeResource,
} from "../components/scene/glb-scaled-model/glbModelResourceResolution";
import { createGLBResourceCache } from "../components/scene/glb-scaled-model/glbResourceCache";
import { normalizeGLBScene } from "../components/scene/glb-scaled-model/normalizeGLBScene";

function expectTupleClose(
  actual: readonly number[],
  expected: readonly number[],
) {
  assert.equal(actual.length, expected.length);
  actual.forEach((value, index) =>
    assert.ok(
      Math.abs(value - expected[index]) <=
        GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS,
      `Expected ${value} to be within the local-bounds tolerance of ${expected[index]}`,
    ),
  );
}

function boxFromLocalBounds(bounds: GLBLocalRenderBounds) {
  const center = new THREE.Vector3(...bounds.center);
  const halfSize = new THREE.Vector3(...bounds.size).multiplyScalar(0.5);
  return new THREE.Box3(
    center.clone().sub(halfSize),
    center.clone().add(halfSize),
  );
}

async function loadCheckedInGLB(relativePath: string) {
  const loaderRuntime = globalThis as typeof globalThis & {
    self: typeof globalThis;
    createImageBitmap: (
      image: Blob,
      options?: ImageBitmapOptions,
    ) => Promise<ImageBitmap>;
  };
  loaderRuntime.self = globalThis as unknown as Window & typeof globalThis;
  loaderRuntime.createImageBitmap ??= async () =>
    ({ width: 1, height: 1, close() {} }) as ImageBitmap;

  const bytes = readFileSync(join(process.cwd(), relativePath));
  const arrayBuffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  return new Promise<THREE.Object3D>((resolve, reject) => {
    new GLTFLoader().parse(
      arrayBuffer,
      "",
      (gltf) => resolve(gltf.scene),
      reject,
    );
  });
}

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

const rawModel = new THREE.Group();
rawModel.add(
  new THREE.Mesh(
    new THREE.BoxGeometry(2, 4, 6),
    new THREE.MeshStandardMaterial({ color: 0x996633 }),
  ),
);
const normalizedModel = normalizeGLBScene({
  loadedScene: rawModel,
  width: 1,
  height: 2,
  depth: 3,
  upholsteryTextures: {},
  url: "/assets/models/local-bounds-contract.glb",
  castShadow: true,
});
assert.ok(normalizedModel);
const normalizedBounds = measureGLBLocalRenderBounds(normalizedModel);
expectTupleClose(normalizedBounds.center, [0, 0, 0]);
expectTupleClose(normalizedBounds.size, [1, 2, 3]);

const localBoundsSnapshot = {
  center: [...normalizedBounds.center],
  size: [...normalizedBounds.size],
};
const translatedWorldBounds = boxFromLocalBounds(normalizedBounds).applyMatrix4(
  new THREE.Matrix4().makeTranslation(4, 0, -2),
);
const translatedWorldCenter = new THREE.Vector3();
translatedWorldBounds.getCenter(translatedWorldCenter);
expectTupleClose(translatedWorldCenter.toArray(), [4, 0, -2]);
assert.deepEqual(normalizedBounds, localBoundsSnapshot);

const rotatedWorldBounds = boxFromLocalBounds(normalizedBounds).applyMatrix4(
  new THREE.Matrix4().makeRotationY(Math.PI / 2),
);
const rotatedWorldSize = new THREE.Vector3();
rotatedWorldBounds.getSize(rotatedWorldSize);
expectTupleClose(rotatedWorldSize.toArray(), [3, 2, 1]);
assert.deepEqual(normalizedBounds, localBoundsSnapshot);

const preparationTimings = {
  parseCompletedAtMs: 1,
  normalizationStartedAtMs: 2,
  normalizationCompletedAtMs: 3,
  materialCloningStartedAtMs: 4,
  materialCloningCompletedAtMs: 5,
  boundsStartedAtMs: 6,
  boundsCompletedAtMs: 7,
  eventLoopDelayMs: {
    parseCompleted: null,
    normalizationStarted: null,
    normalizationCompleted: null,
    materialCloningStarted: null,
    materialCloningCompleted: null,
    boundsStarted: null,
    boundsCompleted: null,
  },
};
assert.throws(
  () => measureGLBLocalRenderBounds(new THREE.Group()),
  (error: unknown) =>
    error instanceof GLBSourceLoadError && error.category === "glb-empty-bounds",
);
assert.equal(
  boundsForResource(
    { kind: "parsed", scene: new THREE.Group() },
    new THREE.Group(),
  ).errorCode,
  "glb-empty-bounds",
);

const planarBounds = measureGLBLocalRenderBounds(
  new THREE.Mesh(new THREE.PlaneGeometry(1, 1)),
);
expectTupleClose(planarBounds.size, [1, 1, 0]);
assert.equal(isValidGLBLocalRenderBounds(planarBounds), true);

const nonFiniteGeometry = new THREE.BufferGeometry();
nonFiniteGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute([Number.NaN, 0, 0], 3),
);
const nonFiniteModel = new THREE.Mesh(nonFiniteGeometry);
assert.throws(
  () => measureGLBLocalRenderBounds(nonFiniteModel),
  (error: unknown) =>
    error instanceof GLBSourceLoadError && error.category === "glb-bounds-failed",
);
assert.equal(
  boundsForResource(
    { kind: "parsed", scene: nonFiniteModel },
    nonFiniteModel,
  ).errorCode,
  "glb-bounds-failed",
);

const pointGeometry = new THREE.BufferGeometry();
pointGeometry.setAttribute(
  "position",
  new THREE.Float32BufferAttribute([0, 0, 0], 3),
);
assert.throws(
  () => measureGLBLocalRenderBounds(new THREE.Mesh(pointGeometry)),
  (error: unknown) =>
    error instanceof GLBSourceLoadError && error.category === "glb-bounds-failed",
);

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
assert.equal(
  isValidGLBLocalRenderBounds({ center: [0, 0, 0], size: [0, 0, 0] }),
  false,
);

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
const measurementSource = readSource(
  "components/scene/glb-scaled-model/measureGLBLocalRenderBounds.ts"
);
const resourceResolutionSource = readSource(
  "components/scene/glb-scaled-model/glbModelResourceResolution.ts"
);
const lifecycleSource = readSource(
  "components/scene/glb-scaled-model/useGLBModelLifecycle.ts"
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
  measurementSource,
  /export function measureGLBLocalRenderBounds[\s\S]*normalizedModel\.clone\(true\)[\s\S]*updateWorldMatrix\(true, true\)[\s\S]*new THREE\.Box3\(\)\.setFromObject\(detachedModel, true\)[\s\S]*glb-empty-bounds[\s\S]*isValidGLBLocalRenderBounds\(localRenderBounds\)[\s\S]*glb-bounds-failed/,
  "The canonical owner must measure normalized scene-item-local bounds and reject invalid results."
);
assert.match(
  resourcesSource,
  /measureGLBLocalRenderBounds\(scene\)[\s\S]*localRenderBounds: bounds\.bounds/,
  "The prepared-resource pipeline must retain canonical measured bounds."
);
assert.match(
  resourceResolutionSource,
  /export function boundsForResource[\s\S]*resource\?\.kind === "prepared"[\s\S]*resource\.localRenderBounds[\s\S]*measureGLBLocalRenderBounds\(model\)/,
  "Prepared cache hits and fresh normalized models must resolve through one local-bounds API."
);
assert.match(
  lifecycleSource,
  /const boundsResult = useMemo\([\s\S]*boundsForResource\(resource, modelResult\.model\)[\s\S]*bounds: boundsResult\.bounds/,
  "The model lifecycle must expose the canonical resolved local bounds without remeasuring in the renderer."
);
assert.match(
  resourcesSource,
  /pagehide[\s\S]*event\.persisted[\s\S]*preparedCache\.clear\(\)[\s\S]*parsedCache\.clear\(\)/,
  "BFCache pagehide must preserve live resources; terminal pagehide clears prepared before parsed."
);
assert.match(
  loadedResourceSource,
  /function clonePreparedModel[\s\S]*clonePreparedGLBForMount\(scene\)[\s\S]*const model = clonePreparedModel\(prepared\.scene\)[\s\S]*localRenderBounds: copyGLBLocalRenderBounds\(prepared\.localRenderBounds\)/,
  "each scene item must receive isolated prepared scene resources and primitive bounds."
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

async function verifyCheckedInGLBBoundsContract() {
  const checkedInPath =
    "public/assets/models/armchair-real-castlery-arden-performance-swivel-armchair.glb";
  const loadedScene = await loadCheckedInGLB(checkedInPath);
  const config: GLBModelNormalizationConfig = {
    width: 1,
    height: 2,
    depth: 3,
    url: `/${checkedInPath.replace(/^public\//, "")}`,
    castShadow: true,
  };
  const firstFreshResult = normalizeResource(
    { kind: "parsed", scene: loadedScene },
    config,
    {},
  );
  const secondFreshResult = normalizeResource(
    { kind: "parsed", scene: loadedScene },
    config,
    {},
  );
  const firstFreshModel = firstFreshResult.model;
  const secondFreshModel = secondFreshResult.model;
  assert.ok(firstFreshModel);
  assert.ok(secondFreshModel);
  assert.notEqual(firstFreshModel, secondFreshModel);

  const firstFreshBounds = boundsForResource(
    { kind: "parsed", scene: loadedScene },
    firstFreshModel,
  );
  const secondFreshBounds = boundsForResource(
    { kind: "parsed", scene: loadedScene },
    secondFreshModel,
  );
  assert.equal(firstFreshBounds.errorCode, null);
  assert.equal(secondFreshBounds.errorCode, null);
  const firstFreshLocalBounds = firstFreshBounds.bounds;
  const secondFreshLocalBounds = secondFreshBounds.bounds;
  assert.ok(firstFreshLocalBounds);
  assert.ok(secondFreshLocalBounds);
  expectTupleClose(firstFreshLocalBounds.center, [0, 0, 0]);
  expectTupleClose(firstFreshLocalBounds.size, [1, 2, 3]);
  assert.deepEqual(firstFreshLocalBounds, secondFreshLocalBounds);

  const preparedCache = createGLBResourceCache<{
    model: THREE.Object3D;
    localRenderBounds: GLBLocalRenderBounds;
  }>({
    maximumEntries: 1,
    dispose: () => {},
  });
  let preparedLoadCount = 0;
  const firstPreparedLease = preparedCache.acquire(config.url, async () => {
    preparedLoadCount += 1;
    return {
      model: firstFreshModel,
      localRenderBounds: copyGLBLocalRenderBounds(firstFreshLocalBounds),
    };
  });
  const cachedPreparedLease = preparedCache.acquire(config.url, async () => {
    preparedLoadCount += 1;
    throw new Error("A prepared cache hit must not normalize another model");
  });
  assert.equal(firstPreparedLease.cacheStatus, "network");
  assert.equal(cachedPreparedLease.cacheStatus, "cache-hit");
  assert.equal(preparedLoadCount, 1);
  const firstCachedPrepared = await firstPreparedLease.resource;
  const secondCachedPrepared = await cachedPreparedLease.resource;
  assert.equal(firstCachedPrepared, secondCachedPrepared);
  const preparedCacheBounds = firstCachedPrepared.localRenderBounds;
  const firstPreparedMount: GLBLoadedResource = {
    kind: "prepared",
    model: clonePreparedGLBForMount(firstCachedPrepared.model),
    localRenderBounds: copyGLBLocalRenderBounds(preparedCacheBounds),
    preparationTimings,
  };
  const secondPreparedMount: GLBLoadedResource = {
    kind: "prepared",
    model: clonePreparedGLBForMount(secondCachedPrepared.model),
    localRenderBounds: copyGLBLocalRenderBounds(
      secondCachedPrepared.localRenderBounds,
    ),
    preparationTimings,
  };
  const firstPreparedResult = normalizeResource(firstPreparedMount, config, {});
  const secondPreparedResult = normalizeResource(secondPreparedMount, config, {});
  const firstPreparedBounds = boundsForResource(
    firstPreparedMount,
    firstPreparedResult.model,
  );
  const secondPreparedBounds = boundsForResource(
    secondPreparedMount,
    secondPreparedResult.model,
  );
  assert.ok(firstPreparedBounds.bounds);
  assert.ok(secondPreparedBounds.bounds);
  assert.deepEqual(firstPreparedBounds.bounds, secondFreshLocalBounds);
  assert.notEqual(firstPreparedBounds.bounds, secondPreparedBounds.bounds);
  assert.notEqual(
    firstPreparedBounds.bounds.center,
    secondPreparedBounds.bounds.center,
  );
  const firstSceneItem = new THREE.Group();
  const secondSceneItem = new THREE.Group();
  firstSceneItem.add(firstPreparedMount.model);
  secondSceneItem.add(secondPreparedMount.model);
  firstPreparedBounds.bounds.center[0] = 99;
  firstSceneItem.position.set(4, 0, -2);
  assert.equal(secondPreparedBounds.bounds.center[0], 0);
  assert.equal(preparedCacheBounds.center[0], 0);
  assert.deepEqual(secondSceneItem.position.toArray(), [0, 0, 0]);

  firstPreparedLease.release();
  cachedPreparedLease.release();
  const remountLease = preparedCache.acquire(config.url, async () => {
    throw new Error("A prepared remount must retain the cached bounds");
  });
  assert.equal(remountLease.cacheStatus, "cache-hit");
  const remountedPrepared = await remountLease.resource;
  const remountedBounds = copyGLBLocalRenderBounds(
    remountedPrepared.localRenderBounds,
  );
  assert.deepEqual(remountedBounds, secondFreshLocalBounds);
  remountLease.release();

  preparedCache.clear();
  const reloadLease = preparedCache.acquire(config.url, async () => ({
    model: secondFreshModel,
    localRenderBounds: copyGLBLocalRenderBounds(secondFreshLocalBounds),
  }));
  assert.equal(reloadLease.cacheStatus, "network");
  assert.deepEqual(
    (await reloadLease.resource).localRenderBounds,
    secondFreshLocalBounds,
  );
  reloadLease.release();
  preparedCache.clear();
}

void verifyCheckedInGLBBoundsContract()
  .then(() => {
    console.log("GLB local render bounds synchronization checks passed.");
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
