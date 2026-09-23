import {
  GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
  GLB_MAIN_THREAD_TIMING_CATEGORIES,
  type GLBMainThreadCollectorActivationMode,
  type GLBMainThreadCollectorImportState,
  type GLBMainThreadCounter,
  type GLBMainThreadTimingCategory,
  type GLBMainThreadTimingEntry,
} from "./glbMainThreadTelemetryCore";

export const GLB_MAIN_THREAD_MODEL_STAGE_NAMES = [
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
export type GLBMainThreadModelStageName =
  (typeof GLB_MAIN_THREAD_MODEL_STAGE_NAMES)[number];
export type GLBMainThreadModelStageCounts = Record<
  GLBMainThreadModelStageName,
  number
>;
export type GLBMainThreadTimingAggregate = {
  count: number;
  totalDurationMs: number;
  maximumDurationMs: number;
};
export type GLBMainThreadTimingAggregates = Record<
  GLBMainThreadTimingCategory,
  GLBMainThreadTimingAggregate
>;
export type GLBMainThreadGapEntry = {
  startRelativeMs: number;
  durationMs: number;
};
export type GLBMainThreadLongTaskEntry = GLBMainThreadGapEntry & {
  reloadGeneration: number;
  activeRequiredCount: number;
  modelStageCounts: GLBMainThreadModelStageCounts;
  category: GLBMainThreadTimingCategory | "unattributed";
};

export type GLBMainThreadTelemetrySnapshot = {
  schema: "interior-ai.glb-main-thread-telemetry.v2";
  capacity: number;
  timings: GLBMainThreadTimingEntry[];
  timingAggregates: GLBMainThreadTimingAggregates;
  longTasks: GLBMainThreadLongTaskEntry[];
  heartbeatGaps: GLBMainThreadGapEntry[];
  frameGaps: GLBMainThreadGapEntry[];
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

export function emptyGLBMainThreadTimingAggregates(): GLBMainThreadTimingAggregates {
  return Object.fromEntries(
    GLB_MAIN_THREAD_TIMING_CATEGORIES.map((category) => [
      category,
      { count: 0, totalDurationMs: 0, maximumDurationMs: 0 },
    ]),
  ) as GLBMainThreadTimingAggregates;
}

export function copyGLBMainThreadTimingAggregates(
  timingAggregates: GLBMainThreadTimingAggregates,
): GLBMainThreadTimingAggregates {
  return Object.fromEntries(
    GLB_MAIN_THREAD_TIMING_CATEGORIES.map((category) => [
      category,
      { ...timingAggregates[category] },
    ]),
  ) as GLBMainThreadTimingAggregates;
}

export function copyGLBMainThreadLongTasks(
  longTasks: GLBMainThreadLongTaskEntry[],
) {
  return longTasks.map((entry) => ({
    ...entry,
    modelStageCounts: { ...entry.modelStageCounts },
  }));
}

export function createEmptyGLBMainThreadTelemetrySnapshot(
  collectorActivationGeneration: number,
): GLBMainThreadTelemetrySnapshot {
  return {
    schema: "interior-ai.glb-main-thread-telemetry.v2",
    capacity: GLB_MAIN_THREAD_TELEMETRY_CAPACITY,
    timings: [],
    timingAggregates: emptyGLBMainThreadTimingAggregates(),
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
    collectorImportState: "not-requested",
    collectorActivationMode: null,
    collectorActivationGeneration,
    bootstrapRecordsQueuedAtActivation: 0,
    bootstrapEventsFlushed: 0,
    bootstrapFlushCompleted: false,
    directModeActive: false,
    directTelemetryObserved: false,
    maximumTelemetryCallbackDurationMs: 0,
  };
}

export function createGLBMainThreadTelemetrySnapshot(
  snapshot: Omit<GLBMainThreadTelemetrySnapshot, "schema">,
): GLBMainThreadTelemetrySnapshot {
  return {
    schema: "interior-ai.glb-main-thread-telemetry.v2",
    ...snapshot,
  };
}
