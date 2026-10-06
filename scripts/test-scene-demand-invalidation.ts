import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SceneActiveFpsSampler } from "../lib/scene-active-fps-sampler";
import { skipUnchangedCanvasSize } from "../components/editor/design-page/skipUnchangedCanvasSize";

import {
  DESIGN_SCENE_CONTROL_DAMPING_FACTOR,
  designSceneCameraMotionChanged,
  resolveDesignSceneControlDampingFactor,
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
assert.ok(
  Math.abs(
    resolveDesignSceneControlDampingFactor(1 / 60) -
      DESIGN_SCENE_CONTROL_DAMPING_FACTOR,
  ) < Number.EPSILON,
);
assert.ok(
  resolveDesignSceneControlDampingFactor(0.1) >
    DESIGN_SCENE_CONTROL_DAMPING_FACTOR,
  "slow rendered frames must consume proportionally more of the damping tail",
);
assert.equal(
  resolveDesignSceneControlDampingFactor(Number.NaN),
  DESIGN_SCENE_CONTROL_DAMPING_FACTOR,
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

const sampler = new SceneActiveFpsSampler();
for (const idle of [10_000, 1_000_000, 1_000_000_000]) {
  sampler.reset(); // the rendering root exhausted its requested frames
  assert.equal(sampler.recordFrame(idle), null);
  assert.equal(sampler.recordFrame(idle), null, "zero time cannot fabricate FPS");
  assert.equal(sampler.degraded, false);
}
for (let interaction = 0; interaction < 12; interaction += 1) {
  sampler.reset();
  const start = interaction * 100_000;
  for (let frame = 0; frame <= 30; frame += 1) {
    assert.equal(sampler.recordFrame(start + frame * 16), null);
  }
  assert.equal(sampler.degraded, false, "finite fast runs cannot accumulate idle");
}
sampler.reset();
assert.equal(sampler.recordFrame(0), null);
assert.equal(sampler.recordFrame(2000), null, "one interval is insufficient");
sampler.reset();
for (let frame = 0; frame <= 100; frame += 1) {
  const fps = sampler.recordFrame(frame * 50);
  if (fps !== null) assert.equal(fps, 20);
  assert.equal(sampler.degraded, frame === 100, "20 FPS degrades after 1s + 4s");
}
for (const boundary of ["idle", "resume", "mode change", "scene generation"]) {
  sampler.reset();
  assert.equal(sampler.degraded, false, boundary);
  assert.equal(sampler.recordFrame(1_000_000), null, boundary);
}
sampler.reset();
for (let frame = 0; frame <= 300; frame += 1) {
  sampler.recordFrame(frame * 40); // 25 FPS, including long ACTIVE intervals
}
assert.equal(sampler.degraded, true);
sampler.reset();
for (let frame = 0; frame <= 500; frame += 1) sampler.recordFrame(frame * 20);
assert.equal(sampler.degraded, false, "healthy sustained rendering stays Quality");

// R3F's Canvas sets its size on every render; an unchanged size must not store a
// new size object, or every size subscriber re-renders with the page.
type FakeSize = { width: number; height: number; top: number; left: number };
const sizeCalls: number[][] = [];
let canvasState: { size: FakeSize; setSize: (width: number, height: number, top?: number, left?: number) => void } = {
  size: { width: 1440, height: 900, top: 0, left: 0 },
  setSize: (width, height, top = 0, left = 0) => {
    sizeCalls.push([width, height, top, left]);
    canvasState = { ...canvasState, size: { width, height, top, left } };
  },
};
const canvasStore = {
  get setSize() { return canvasState.setSize; },
  set: (partial: Partial<typeof canvasState>) => { canvasState = { ...canvasState, ...partial }; },
  get: () => canvasState,
};
skipUnchangedCanvasSize(canvasStore as never);
const unchangedSize = canvasState.size;
canvasState.setSize(1440, 900, 0, 0);
canvasState.setSize(1440, 900);
assert.equal(canvasState.size, unchangedSize, "An unchanged size keeps the same size object.");
canvasState.setSize(1440, 860);
canvasState.setSize(1440, 860, 12, 0);
assert.deepEqual(sizeCalls, [[1440, 860, 0, 0], [1440, 860, 12, 0]], "A resize or a moved canvas still goes through.");
assert.match(
  readFileSync("components/editor/design-page/designSceneDemandPolicy.tsx", "utf8"),
  /export function initializeDesignSceneDemandRenderer\(state: RootState\) \{[\s\S]*?skipUnchangedCanvasSize\(state\);/,
  "The design canvas should skip unchanged sizes from its first render on."
);
console.log("Auto active-frame sampling controls passed (idle, finite, slow, reset).");
