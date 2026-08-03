export const GLB_MAIN_THREAD_TIMING_CATEGORIES = [
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
] as const;

export type GLBMainThreadTimingCategory =
  (typeof GLB_MAIN_THREAD_TIMING_CATEGORIES)[number];
export type GLBMainThreadTimingEntry = {
  startRelativeMs: number;
  durationMs: number;
  category: GLBMainThreadTimingCategory;
};

export const GLB_MAIN_THREAD_COUNTERS = [
  "lifecycleTransitions",
  "diagnosticStoreUpdates",
  "reactRenders",
  "sceneAttachments",
  "rendererCalls",
] as const;
export type GLBMainThreadCounter = (typeof GLB_MAIN_THREAD_COUNTERS)[number];
export type GLBMainThreadBootstrapEvent =
  | {
      type: "timing";
      category: GLBMainThreadTimingCategory;
      startedAtMs: number;
      completedAtMs: number;
    }
  | {
      type: "event-loop-gap";
      startedAtMs: number;
      durationMs: number;
    };
export type GLBMainThreadTelemetryBootstrap = {
  startedAtMs: number;
  events: GLBMainThreadBootstrapEvent[];
  counters: Record<GLBMainThreadCounter, number>;
};

export const GLB_MAIN_THREAD_TELEMETRY_CAPACITY = 96;

export function createGLBMainThreadTimingEntry(
  category: GLBMainThreadTimingCategory,
  startedAtMs: number,
  completedAtMs: number,
  telemetryStartedAtMs: number,
): GLBMainThreadTimingEntry {
  return {
    startRelativeMs: Math.max(0, startedAtMs - telemetryStartedAtMs),
    durationMs: Math.max(0, completedAtMs - startedAtMs),
    category,
  };
}

export class BoundedMetadataRing<T> {
  private readonly values: T[] = [];

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("bounded metadata ring capacity must be a positive integer");
    }
  }

  push(value: T) {
    if (this.values.length === this.capacity) this.values.shift();
    this.values.push(value);
  }

  snapshot() {
    return this.values.slice();
  }
}

export function attributeGLBLongTaskCategory(
  timings: readonly GLBMainThreadTimingEntry[],
  startRelativeMs: number,
  durationMs: number,
) {
  const endRelativeMs = startRelativeMs + durationMs;
  let category: GLBMainThreadTimingCategory | "unattributed" = "unattributed";
  let maximumOverlapMs = 0;
  for (const timing of timings) {
    const overlapMs = Math.max(
      0,
      Math.min(endRelativeMs, timing.startRelativeMs + timing.durationMs) -
        Math.max(startRelativeMs, timing.startRelativeMs),
    );
    if (overlapMs > maximumOverlapMs) {
      maximumOverlapMs = overlapMs;
      category = timing.category;
    }
  }
  return maximumOverlapMs >= durationMs * 0.8 ? category : "unattributed";
}
