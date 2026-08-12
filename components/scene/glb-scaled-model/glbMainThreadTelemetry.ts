import type {
  GLBModelDiagnosticSnapshot,
  GLBModelPendingStage,
} from "./modelLifecycleTypes";
import {
  BoundedMetadataRing,
  GLB_MAIN_THREAD_COUNTERS,
  GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
  attributeGLBLongTaskCategory,
  countGLBMainThreadBootstrapRecords,
  createGLBMainThreadTimingEntry,
  type GLBMainThreadCollectorActivationMode,
  type GLBMainThreadCollectorImportState,
  type GLBMainThreadCounter,
  type GLBMainThreadTelemetryBootstrap,
  type GLBMainThreadTimingCategory,
  type GLBMainThreadTimingEntry,
} from "./glbMainThreadTelemetryCore";
import {
  GLB_MAIN_THREAD_MODEL_STAGE_NAMES,
  copyGLBMainThreadLongTasks,
  copyGLBMainThreadTimingAggregates,
  createEmptyGLBMainThreadTelemetrySnapshot,
  createGLBMainThreadTelemetrySnapshot,
  emptyGLBMainThreadTimingAggregates,
  type GLBMainThreadGapEntry,
  type GLBMainThreadLongTaskEntry,
  type GLBMainThreadModelStageCounts,
  type GLBMainThreadModelStageName,
  type GLBMainThreadTelemetrySnapshot,
  type GLBMainThreadTimingAggregates,
} from "./glbMainThreadTelemetrySnapshot";

export {
  BoundedMetadataRing,
  GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
  GLB_MAIN_THREAD_TIMING_CATEGORIES,
  attributeGLBLongTaskCategory,
  createGLBMainThreadTimingEntry,
  type GLBMainThreadTimingCategory,
  type GLBMainThreadTimingEntry,
} from "./glbMainThreadTelemetryCore";
export {
  copyGLBMainThreadLongTasks,
  type GLBMainThreadTelemetrySnapshot,
} from "./glbMainThreadTelemetrySnapshot";

const RESPONSIVE_GAP_THRESHOLD_MS = 50;

type TelemetryContext = {
  reloadGeneration: number;
  activeRequiredCount: number;
  modelStageCounts: GLBMainThreadModelStageCounts;
};
type GLBMainThreadTelemetryState = {
  startedAtMs: number;
  timings: BoundedMetadataRing<GLBMainThreadTimingEntry>;
  timingAggregates: GLBMainThreadTimingAggregates;
  longTasks: BoundedMetadataRing<GLBMainThreadLongTaskEntry>;
  heartbeatGaps: BoundedMetadataRing<GLBMainThreadGapEntry>;
  frameGaps: BoundedMetadataRing<GLBMainThreadGapEntry>;
  readContext: () => TelemetryContext;
  synchronousOperationsActive: number;
  maximumSynchronousOperationsActive: number;
  counters: Record<GLBMainThreadCounter, number>;
  collectorImportState: GLBMainThreadCollectorImportState;
  collectorActivationMode: GLBMainThreadCollectorActivationMode | null;
  collectorActivationGeneration: number;
  bootstrapRecordsQueuedAtActivation: number;
  bootstrapEventsFlushed: number;
  bootstrapFlushCompleted: boolean;
  directModeActive: boolean;
  directTelemetryObserved: boolean;
  maximumTelemetryCallbackDurationMs: number;
};
type TelemetryGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
  __INTERIOR_AI_GLB_DIAGNOSTICS__?: Record<
    string,
    GLBModelDiagnosticSnapshot
  >;
  __INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__?: number;
  __INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__?: GLBMainThreadTelemetryState;
  __INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?: () => GLBMainThreadTelemetrySnapshot;
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

function currentReloadGeneration() {
  const generation = (globalThis as TelemetryGlobal)
    .__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__;
  return Number.isInteger(generation) && (generation ?? 0) > 0
    ? (generation as number)
    : 1;
}

function emptyStageCounts(): GLBMainThreadModelStageCounts {
  return Object.fromEntries(
    GLB_MAIN_THREAD_MODEL_STAGE_NAMES.map((stage) => [stage, 0]),
  ) as GLBMainThreadModelStageCounts;
}

function pendingStageForTelemetry(
  pendingStage: GLBModelPendingStage | null,
): GLBMainThreadModelStageName {
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

function readCurrentTelemetryContext() {
  const telemetryGlobal = globalThis as TelemetryGlobal;
  return createGLBMainThreadTelemetryContext(
    telemetryGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ?? {},
    telemetryGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__ ?? 1,
  );
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

export function initializeGLBMainThreadTelemetry(startedAtMs = nowMs()) {
  if (!telemetryEnabled()) return;
  const telemetryGlobal = globalThis as TelemetryGlobal;
  const existing = telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__;
  if (existing) return;
  const state: GLBMainThreadTelemetryState = {
    startedAtMs,
    timings: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    timingAggregates: emptyGLBMainThreadTimingAggregates(),
    longTasks: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    heartbeatGaps: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    frameGaps: new BoundedMetadataRing(GLB_MAIN_THREAD_TELEMETRY_CAPACITY),
    readContext: readCurrentTelemetryContext,
    synchronousOperationsActive: 0,
    maximumSynchronousOperationsActive: 0,
    counters: {
      lifecycleTransitions: 0,
      diagnosticStoreUpdates: 0,
      reactRenders: 0,
      sceneAttachments: 0,
      rendererCalls: 0,
    },
    collectorImportState: "pending",
    collectorActivationMode: null,
    collectorActivationGeneration: currentReloadGeneration(),
    bootstrapRecordsQueuedAtActivation: 0,
    bootstrapEventsFlushed: 0,
    bootstrapFlushCompleted: false,
    directModeActive: false,
    directTelemetryObserved: false,
    maximumTelemetryCallbackDurationMs: 0,
  };
  telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__ = state;
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
  if (state.directModeActive) state.directTelemetryObserved = true;
  state.timings.push(
    createGLBMainThreadTimingEntry(
      category,
      startedAtMs,
      completedAtMs,
      state.startedAtMs,
    ),
  );
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

export function recordGLBEventLoopGap(startedAtMs: number, durationMs: number) {
  const state = currentState();
  if (!state || durationMs < RESPONSIVE_GAP_THRESHOLD_MS) return;
  if (state.directModeActive) state.directTelemetryObserved = true;
  state.heartbeatGaps.push({
    startRelativeMs: Math.max(0, startedAtMs - state.startedAtMs),
    durationMs,
  });
}

export function recordGLBMainThreadCounter(counter: GLBMainThreadCounter) {
  const state = currentState();
  if (state) {
    if (state.directModeActive) state.directTelemetryObserved = true;
    state.counters[counter] += 1;
  }
}

export function hydrateGLBMainThreadTelemetryBootstrap(
  bootstrap: GLBMainThreadTelemetryBootstrap,
) {
  const state = currentState();
  if (!state) return;
  if (state.bootstrapFlushCompleted) {
    throw new Error("GLB main-thread telemetry bootstrap already hydrated");
  }
  const queuedRecordCount = countGLBMainThreadBootstrapRecords(bootstrap);
  for (const event of bootstrap.events) {
    if (event.type === "timing") {
      recordGLBMainThreadTiming(event.category, event.startedAtMs, event.completedAtMs);
    } else recordGLBEventLoopGap(event.startedAtMs, event.durationMs);
  }
  for (const counter of GLB_MAIN_THREAD_COUNTERS) {
    state.counters[counter] += bootstrap.counters[counter];
  }
  state.bootstrapRecordsQueuedAtActivation = queuedRecordCount;
  state.bootstrapEventsFlushed += queuedRecordCount;
  state.collectorActivationMode = queuedRecordCount > 0
    ? "hydrated-bootstrap"
    : "direct-empty-bootstrap";
  state.bootstrapFlushCompleted = true;
  state.directModeActive = true;
  state.collectorImportState = "active";
  (globalThis as TelemetryGlobal).__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__ = () =>
    snapshotGLBMainThreadTelemetry();
}

export function snapshotGLBMainThreadTelemetry(): GLBMainThreadTelemetrySnapshot {
  const state = currentState();
  if (!state) {
    return createEmptyGLBMainThreadTelemetrySnapshot(
      currentReloadGeneration(),
    );
  }
  return createGLBMainThreadTelemetrySnapshot({
    capacity: GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
    timings: state.timings.snapshot(),
    timingAggregates: copyGLBMainThreadTimingAggregates(
      state.timingAggregates,
    ),
    longTasks: copyGLBMainThreadLongTasks(state.longTasks.snapshot()),
    heartbeatGaps: state.heartbeatGaps.snapshot(),
    frameGaps: state.frameGaps.snapshot(),
    synchronousOperationsActive: state.synchronousOperationsActive,
    maximumSynchronousOperationsActive:
      state.maximumSynchronousOperationsActive,
    counters: { ...state.counters },
    collectorImportState: state.collectorImportState,
    collectorActivationMode: state.collectorActivationMode,
    collectorActivationGeneration: state.collectorActivationGeneration,
    bootstrapRecordsQueuedAtActivation:
      state.bootstrapRecordsQueuedAtActivation,
    bootstrapEventsFlushed: state.bootstrapEventsFlushed,
    bootstrapFlushCompleted: state.bootstrapFlushCompleted,
    directModeActive: state.directModeActive,
    directTelemetryObserved: state.directTelemetryObserved,
    maximumTelemetryCallbackDurationMs: state.maximumTelemetryCallbackDurationMs,
  });
}
