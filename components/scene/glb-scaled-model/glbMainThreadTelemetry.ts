import type {
  GLBModelDiagnosticSnapshot,
  GLBModelPendingStage,
} from "./modelLifecycleTypes";
import type * as THREE from "three";
import {
  BoundedMetadataRing,
  GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
  GLB_MAIN_THREAD_TIMING_CATEGORIES,
  attributeGLBLongTaskCategory,
  type GLBMainThreadTimingCategory,
  type GLBMainThreadTimingEntry,
} from "./glbMainThreadTelemetryCore";

export {
  BoundedMetadataRing,
  GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
  GLB_MAIN_THREAD_TIMING_CATEGORIES,
  attributeGLBLongTaskCategory,
  type GLBMainThreadTimingCategory,
  type GLBMainThreadTimingEntry,
} from "./glbMainThreadTelemetryCore";

const MODEL_STAGE_NAMES = [
  "response",
  "parse-decode",
  "normalization",
  "materials",
  "bounds",
  "scene-attachment",
  "ready-commit",
  "ready",
  "error",
] as const;
type ModelStageName = (typeof MODEL_STAGE_NAMES)[number];

const RESPONSIVE_GAP_THRESHOLD_MS = 50;

type ModelStageCounts = Record<ModelStageName, number>;
type TelemetryContext = {
  reloadGeneration: number;
  activeRequiredCount: number;
  modelStageCounts: ModelStageCounts;
};
type TimingAggregate = {
  count: number;
  totalDurationMs: number;
  maximumDurationMs: number;
};
type TimingAggregates = Record<GLBMainThreadTimingCategory, TimingAggregate>;
type GapEntry = {
  startRelativeMs: number;
  durationMs: number;
};
type LongTaskEntry = GapEntry &
  TelemetryContext & {
    category: GLBMainThreadTimingCategory | "unattributed";
  };

type GLBMainThreadTelemetryState = {
  startedAtMs: number;
  timings: BoundedMetadataRing<GLBMainThreadTimingEntry>;
  timingAggregates: TimingAggregates;
  longTasks: BoundedMetadataRing<LongTaskEntry>;
  heartbeatGaps: BoundedMetadataRing<GapEntry>;
  frameGaps: BoundedMetadataRing<GapEntry>;
  readContext: () => TelemetryContext;
  synchronousOperationsActive: number;
  maximumSynchronousOperationsActive: number;
  counters: {
    lifecycleTransitions: number;
    diagnosticStoreUpdates: number;
    reactRenders: number;
    sceneAttachments: number;
    rendererCalls: number;
  };
  maximumTelemetryCallbackDurationMs: number;
  initialized: boolean;
};

type TelemetryGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
  __INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__?: GLBMainThreadTelemetryState;
  __INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?: () => GLBMainThreadTelemetrySnapshot;
};

export type GLBMainThreadTelemetrySnapshot = {
  schema: "interior-ai.glb-main-thread-telemetry.v1";
  capacity: number;
  timings: GLBMainThreadTimingEntry[];
  timingAggregates: TimingAggregates;
  longTasks: LongTaskEntry[];
  heartbeatGaps: GapEntry[];
  frameGaps: GapEntry[];
  synchronousOperationsActive: number;
  maximumSynchronousOperationsActive: number;
  counters: GLBMainThreadTelemetryState["counters"];
  maximumTelemetryCallbackDurationMs: number;
};

function nowMs() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function telemetryEnabled() {
  if (typeof window === "undefined") return false;
  const telemetryGlobal = globalThis as TelemetryGlobal;
  return (
    process.env.NODE_ENV !== "production" ||
    telemetryGlobal.__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ === true
  );
}

function currentState() {
  if (!telemetryEnabled()) return null;
  return (globalThis as TelemetryGlobal)
    .__INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__ ?? null;
}

function emptyStageCounts(): ModelStageCounts {
  return Object.fromEntries(
    MODEL_STAGE_NAMES.map((stage) => [stage, 0]),
  ) as ModelStageCounts;
}

function emptyTimingAggregates(): TimingAggregates {
  return Object.fromEntries(
    GLB_MAIN_THREAD_TIMING_CATEGORIES.map((category) => [
      category,
      { count: 0, totalDurationMs: 0, maximumDurationMs: 0 },
    ]),
  ) as TimingAggregates;
}

function copyTimingAggregates(
  timingAggregates: TimingAggregates,
): TimingAggregates {
  return Object.fromEntries(
    GLB_MAIN_THREAD_TIMING_CATEGORIES.map((category) => [
      category,
      { ...timingAggregates[category] },
    ]),
  ) as TimingAggregates;
}

export function copyGLBMainThreadLongTasks(longTasks: LongTaskEntry[]) {
  return longTasks.map((entry) => ({
    ...entry,
    modelStageCounts: { ...entry.modelStageCounts },
  }));
}

function pendingStageForTelemetry(
  pendingStage: GLBModelPendingStage | null,
): ModelStageName {
  if (pendingStage === "request-start") return "response";
  if (pendingStage === "terminal-error" || pendingStage === "cancelled") {
    return "error";
  }
  return pendingStage ?? "ready";
}

export function createGLBMainThreadTelemetryContext(
  registry: Record<string, GLBModelDiagnosticSnapshot>,
  reloadGeneration: number,
): TelemetryContext {
  const modelStageCounts = emptyStageCounts();
  let activeRequiredCount = 0;
  for (const diagnostic of Object.values(registry)) {
    if (
      !diagnostic.active ||
      !diagnostic.requiredForReadiness ||
      diagnostic.reloadGeneration !== reloadGeneration
    ) {
      continue;
    }
    activeRequiredCount += 1;
    if (diagnostic.loadState === "ready") modelStageCounts.ready += 1;
    else if (diagnostic.loadState === "error") modelStageCounts.error += 1;
    else modelStageCounts[pendingStageForTelemetry(diagnostic.pendingStage)] += 1;
  }
  return { reloadGeneration, activeRequiredCount, modelStageCounts };
}

function recordObserverCost(state: GLBMainThreadTelemetryState, startedAtMs: number) {
  state.maximumTelemetryCallbackDurationMs = Math.max(
    state.maximumTelemetryCallbackDurationMs,
    nowMs() - startedAtMs,
  );
}

function startLongTaskObserver(state: GLBMainThreadTelemetryState) {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const observer = new PerformanceObserver((list) => {
      const callbackStartedAtMs = nowMs();
      for (const entry of list.getEntries()) {
        if (entry.startTime < state.startedAtMs) continue;
        const context = state.readContext();
        const startRelativeMs = entry.startTime - state.startedAtMs;
        state.longTasks.push({
          startRelativeMs,
          durationMs: entry.duration,
          category: attributeGLBLongTaskCategory(
            state.timings.snapshot(),
            startRelativeMs,
            entry.duration,
          ),
          ...context,
        });
      }
      recordObserverCost(state, callbackStartedAtMs);
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    // Unsupported entry types must never affect model loading.
  }
}

function startFrameGapObserver(state: GLBMainThreadTelemetryState) {
  if (typeof requestAnimationFrame === "undefined") return;
  let previousFrameAtMs = nowMs();
  const observeFrame = (observedAtMs: number) => {
    const callbackStartedAtMs = nowMs();
    const durationMs = Math.max(0, observedAtMs - previousFrameAtMs);
    if (durationMs >= RESPONSIVE_GAP_THRESHOLD_MS) {
      state.frameGaps.push({
        startRelativeMs: Math.max(
          0,
          previousFrameAtMs - state.startedAtMs,
        ),
        durationMs,
      });
    }
    previousFrameAtMs = observedAtMs;
    recordObserverCost(state, callbackStartedAtMs);
    requestAnimationFrame(observeFrame);
  };
  requestAnimationFrame(observeFrame);
}

export function initializeGLBMainThreadTelemetry(
  readContext: () => TelemetryContext,
) {
  if (!telemetryEnabled()) return;
  const telemetryGlobal = globalThis as TelemetryGlobal;
  const existing = telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__;
  if (existing) {
    existing.readContext = readContext;
    return;
  }
  const state: GLBMainThreadTelemetryState = {
    startedAtMs: nowMs(),
    timings: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    timingAggregates: emptyTimingAggregates(),
    longTasks: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    heartbeatGaps: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    frameGaps: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    readContext,
    synchronousOperationsActive: 0,
    maximumSynchronousOperationsActive: 0,
    counters: {
      lifecycleTransitions: 0,
      diagnosticStoreUpdates: 0,
      reactRenders: 0,
      sceneAttachments: 0,
      rendererCalls: 0,
    },
    maximumTelemetryCallbackDurationMs: 0,
    initialized: true,
  };
  telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__ = state;
  telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__ = () =>
    snapshotGLBMainThreadTelemetry();
  startLongTaskObserver(state);
  startFrameGapObserver(state);
}

export function recordGLBMainThreadTiming(
  category: GLBMainThreadTimingCategory,
  startedAtMs: number,
  completedAtMs: number,
) {
  const state = currentState();
  if (!state) return;
  state.timings.push({
    startRelativeMs: Math.max(0, startedAtMs - state.startedAtMs),
    durationMs: Math.max(0, completedAtMs - startedAtMs),
    category,
  });
  const durationMs = Math.max(0, completedAtMs - startedAtMs);
  const aggregate = state.timingAggregates[category];
  aggregate.count += 1;
  aggregate.totalDurationMs += durationMs;
  aggregate.maximumDurationMs = Math.max(
    aggregate.maximumDurationMs,
    durationMs,
  );
}

export function measureGLBMainThreadWork<T>(
  category: GLBMainThreadTimingCategory,
  operation: () => T,
) {
  const state = currentState();
  if (!state) return operation();
  const startedAtMs = nowMs();
  state.synchronousOperationsActive += 1;
  state.maximumSynchronousOperationsActive = Math.max(
    state.maximumSynchronousOperationsActive,
    state.synchronousOperationsActive,
  );
  try {
    return operation();
  } finally {
    state.synchronousOperationsActive -= 1;
    recordGLBMainThreadTiming(category, startedAtMs, nowMs());
  }
}

const instrumentedRenderers = new WeakSet<THREE.WebGLRenderer>();

export function instrumentGLBMainThreadRenderer(
  renderer: THREE.WebGLRenderer,
) {
  if (!telemetryEnabled() || instrumentedRenderers.has(renderer)) return;
  instrumentedRenderers.add(renderer);
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    recordGLBMainThreadCounter("rendererCalls");
    return measureGLBMainThreadWork("r3f-render", () =>
      render(scene, camera),
    );
  };
}

export function recordGLBEventLoopGap(startedAtMs: number, durationMs: number) {
  const state = currentState();
  if (!state || durationMs < RESPONSIVE_GAP_THRESHOLD_MS) return;
  state.heartbeatGaps.push({
    startRelativeMs: Math.max(0, startedAtMs - state.startedAtMs),
    durationMs,
  });
}

export function recordGLBMainThreadCounter(
  counter: keyof GLBMainThreadTelemetryState["counters"],
) {
  const state = currentState();
  if (state) state.counters[counter] += 1;
}

export function snapshotGLBMainThreadTelemetry(): GLBMainThreadTelemetrySnapshot {
  const state = currentState();
  if (!state) {
    return {
      schema: "interior-ai.glb-main-thread-telemetry.v1",
      capacity: GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
      timings: [],
      timingAggregates: emptyTimingAggregates(),
      longTasks: [],
      heartbeatGaps: [],
      frameGaps: [],
      synchronousOperationsActive: 0,
      maximumSynchronousOperationsActive: 0,
      counters: {
        lifecycleTransitions: 0,
        diagnosticStoreUpdates: 0,
        reactRenders: 0,
        sceneAttachments: 0,
        rendererCalls: 0,
      },
      maximumTelemetryCallbackDurationMs: 0,
    };
  }
  return {
    schema: "interior-ai.glb-main-thread-telemetry.v1",
    capacity: GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
    timings: state.timings.snapshot(),
    timingAggregates: copyTimingAggregates(state.timingAggregates),
    longTasks: copyGLBMainThreadLongTasks(state.longTasks.snapshot()),
    heartbeatGaps: state.heartbeatGaps.snapshot(),
    frameGaps: state.frameGaps.snapshot(),
    synchronousOperationsActive: state.synchronousOperationsActive,
    maximumSynchronousOperationsActive:
      state.maximumSynchronousOperationsActive,
    counters: { ...state.counters },
    maximumTelemetryCallbackDurationMs: state.maximumTelemetryCallbackDurationMs,
  };
}
