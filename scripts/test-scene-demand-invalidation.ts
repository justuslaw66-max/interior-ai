import assert from "node:assert/strict";

import {
  designSceneCameraMotionChanged,
  type CameraMotion,
} from "../components/editor/design-page/designSceneDemandPolicy";
import {
  instrumentSceneDemandRenderer,
  readSceneDemandSnapshot,
  recordSceneDemandRendererCall,
  requestSceneDemandFrame,
  setSceneFiniteAnimationActive,
} from "../components/scene/sceneDemandDiagnostics";

const still: CameraMotion = {
  position: [1, 2, 3],
  quaternion: [0, 0, 0, 1],
  target: [0, 0, 0],
  zoom: 1,
};
assert.equal(designSceneCameraMotionChanged(still, structuredClone(still)), false);
assert.equal(
  designSceneCameraMotionChanged(still, {
    ...structuredClone(still),
    position: [1.01, 2, 3],
  }),
  true,
);
assert.equal(
  designSceneCameraMotionChanged(still, {
    ...structuredClone(still),
    target: [0, 0, 0.01],
  }),
  true,
);

const renderer = {} as Parameters<typeof instrumentSceneDemandRenderer>[0];
instrumentSceneDemandRenderer(renderer);
const initial = readSceneDemandSnapshot();
assert.equal(initial.instrumentationGeneration, 1);
assert.equal(initial.pendingInvalidation, false);

const placementToken = {};
const controlToken = {};
setSceneFiniteAnimationActive(placementToken, "placement-scale", true);
setSceneFiniteAnimationActive(controlToken, "control-damping", true);
let invalidations = 0;
assert.equal(
  requestSceneDemandFrame(() => {
    invalidations += 1;
  }),
  true,
);
const active = readSceneDemandSnapshot();
assert.equal(invalidations, 1);
assert.equal(active.pendingInvalidation, true);
assert.equal(active.activeItemAnimationCount, 1);
assert.equal(active.activeControlTransitionCount, 1);
assert.equal(active.activeSupportedAnimationCount, 2);

recordSceneDemandRendererCall();
setSceneFiniteAnimationActive(placementToken, "placement-scale", false);
setSceneFiniteAnimationActive(controlToken, "control-damping", false);
const settled = readSceneDemandSnapshot();
assert.equal(settled.rendererCalls, 1);
assert.equal(settled.pendingInvalidation, false);
assert.equal(settled.activeSupportedAnimationCount, 0);

instrumentSceneDemandRenderer(renderer);
assert.equal(readSceneDemandSnapshot().instrumentationGeneration, 1);
instrumentSceneDemandRenderer(
  {} as Parameters<typeof instrumentSceneDemandRenderer>[0],
);
assert.equal(readSceneDemandSnapshot().instrumentationGeneration, 2);
assert.equal(readSceneDemandSnapshot().activeSupportedAnimationCount, 0);

console.log("Design-scene demand invalidation controller tests passed.");
