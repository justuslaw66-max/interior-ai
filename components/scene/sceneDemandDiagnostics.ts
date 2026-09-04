import * as THREE from "three";

export type SceneFiniteAnimationKind =
  | "placement-scale"
  | "snap-bump"
  | "locked-shake"
  | "control-damping";

type SceneDemandGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
  __INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__?: () => SceneDemandSnapshot;
};

export type SceneDemandSnapshot = Readonly<{
  schema: "interior-ai.scene-demand-diagnostics.v1";
  version: 1;
  instrumentationGeneration: number;
  rendererCalls: number;
  invalidationCalls: number;
  lastRendererCallAtMs: number | null;
  lastInvalidationAtMs: number | null;
  pendingInvalidation: boolean;
  activeItemAnimationCount: number;
  activeControlTransitionCount: number;
  activeSupportedAnimationCount: number;
  animationEvents: readonly SceneFiniteAnimationEvent[];
  mutationEvents: readonly SceneDemandMutationEvent[];
  itemFrames: readonly SceneDemandItemFrame[];
}>;

type SceneFiniteAnimationEvent = Readonly<{
  kind: SceneFiniteAnimationKind;
  phase: "started" | "frame" | "settled";
  recordedAtMs: number;
  rendererCalls: number;
  invalidationCalls: number;
  value: number | null;
}>;

type SceneDemandMutationEvent = Readonly<{
  kind: "exposure" | "resize";
  recordedAtMs: number;
  rendererCalls: number;
  invalidationCalls: number;
  value: number;
}>;

type SceneDemandItemFrame = Readonly<{
  itemId: string;
  rendererCalls: number;
  position: readonly [number, number, number];
  scale: readonly [number, number, number];
  canvasPoint: readonly [number, number];
}>;

type ActiveAnimation = {
  kind: SceneFiniteAnimationKind;
  itemAnimation: boolean;
};

const instrumentedRenderers = new WeakSet<THREE.WebGLRenderer>();
const activeAnimations = new Map<object, ActiveAnimation>();
let instrumentationGeneration = 0;
let rendererCalls = 0;
let invalidationCalls = 0;
let lastRendererCallAtMs: number | null = null;
let lastInvalidationAtMs: number | null = null;
let pendingInvalidation = false;
let animationEvents: SceneFiniteAnimationEvent[] = [];
let mutationEvents: SceneDemandMutationEvent[] = [];
let itemFrames: SceneDemandItemFrame[] = [];

function nowMs() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function diagnosticsEnabled() {
  return (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV !== "production" ||
      (globalThis as SceneDemandGlobal)
        .__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ === true)
  );
}

function visibleDocument() {
  return (
    typeof document === "undefined" || document.visibilityState === "visible"
  );
}

export function readSceneDemandSnapshot(): SceneDemandSnapshot {
  let activeItemAnimationCount = 0;
  let activeControlTransitionCount = 0;
  for (const animation of activeAnimations.values()) {
    if (animation.itemAnimation) activeItemAnimationCount += 1;
    if (animation.kind === "control-damping") {
      activeControlTransitionCount += 1;
    }
  }
  return Object.freeze({
    schema: "interior-ai.scene-demand-diagnostics.v1",
    version: 1,
    instrumentationGeneration,
    rendererCalls,
    invalidationCalls,
    lastRendererCallAtMs,
    lastInvalidationAtMs,
    pendingInvalidation,
    activeItemAnimationCount,
    activeControlTransitionCount,
    activeSupportedAnimationCount: activeAnimations.size,
    animationEvents: Object.freeze(animationEvents.map((event) => ({ ...event }))),
    mutationEvents: Object.freeze(mutationEvents.map((event) => ({ ...event }))),
    itemFrames: Object.freeze(itemFrames.map((frame) => ({ ...frame }))),
  });
}

function publishSnapshotHook() {
  if (!diagnosticsEnabled()) return;
  (globalThis as SceneDemandGlobal).__INTERIOR_AI_SCENE_DEMAND_SNAPSHOT__ =
    readSceneDemandSnapshot;
}

export function instrumentSceneDemandRenderer(
  renderer: THREE.WebGLRenderer,
) {
  if (instrumentedRenderers.has(renderer)) return;
  instrumentedRenderers.add(renderer);
  instrumentationGeneration += 1;
  pendingInvalidation = false;
  activeAnimations.clear();
  animationEvents = [];
  mutationEvents = [];
  itemFrames = [];
  publishSnapshotHook();
}

export function recordSceneDemandRendererCall() {
  rendererCalls += 1;
  lastRendererCallAtMs = nowMs();
  pendingInvalidation = false;
}

export function requestSceneDemandFrame(invalidate: () => void) {
  if (!visibleDocument()) return false;
  invalidationCalls += 1;
  lastInvalidationAtMs = nowMs();
  pendingInvalidation = true;
  invalidate();
  return true;
}

export function setSceneFiniteAnimationActive(
  token: object,
  kind: SceneFiniteAnimationKind,
  active: boolean,
) {
  if (active) {
    if (!activeAnimations.has(token) && diagnosticsEnabled()) {
      animationEvents = [
        ...animationEvents.slice(-127),
        Object.freeze({
          kind,
          phase: "started",
          recordedAtMs: nowMs(),
          rendererCalls,
          invalidationCalls,
          value: null,
        }),
      ];
    }
    activeAnimations.set(token, {
      kind,
      itemAnimation: kind !== "control-damping",
    });
  } else {
    if (activeAnimations.has(token) && diagnosticsEnabled()) {
      animationEvents = [
        ...animationEvents.slice(-127),
        Object.freeze({
          kind,
          phase: "settled",
          recordedAtMs: nowMs(),
          rendererCalls,
          invalidationCalls,
          value: null,
        }),
      ];
    }
    activeAnimations.delete(token);
  }
}

export function recordSceneFiniteAnimationFrame(
  kind: SceneFiniteAnimationKind,
  value: number,
) {
  if (!diagnosticsEnabled()) return;
  animationEvents = [
    ...animationEvents.slice(-127),
    Object.freeze({
      kind,
      phase: "frame",
      recordedAtMs: nowMs(),
      rendererCalls,
      invalidationCalls,
      value,
    }),
  ];
}

export function recordSceneDemandMutation(
  kind: SceneDemandMutationEvent["kind"],
  value: number,
) {
  if (!diagnosticsEnabled()) return;
  mutationEvents = [
    ...mutationEvents.slice(-63),
    Object.freeze({
      kind,
      recordedAtMs: nowMs(),
      rendererCalls,
      invalidationCalls,
      value,
    }),
  ];
}

export function recordSceneDemandItemFrames(
  scene: THREE.Object3D,
  camera: THREE.Camera,
  renderer: THREE.WebGLRenderer,
) {
  if (!diagnosticsEnabled()) return;
  const nextFrames: SceneDemandItemFrame[] = [];
  const worldPosition = new THREE.Vector3();
  const projected = new THREE.Vector3();
  const bounds = new THREE.Box3();
  scene.traverse((object) => {
    const itemId = object.userData.sceneDemandItemId;
    if (typeof itemId !== "string" || itemId.length === 0) return;
    object.getWorldPosition(worldPosition);
    bounds.setFromObject(object).getCenter(projected);
    projected.project(camera);
    nextFrames.push(
      Object.freeze({
        itemId,
        rendererCalls,
        position: Object.freeze(worldPosition.toArray()),
        scale: Object.freeze(object.scale.toArray()),
        canvasPoint: Object.freeze([
          ((projected.x + 1) / 2) * renderer.domElement.clientWidth,
          ((1 - projected.y) / 2) * renderer.domElement.clientHeight,
        ] as [number, number]),
      }),
    );
  });
  itemFrames = nextFrames;
}

export function cancelSceneFiniteAnimations(tokens: readonly object[]) {
  for (const token of tokens) activeAnimations.delete(token);
}
