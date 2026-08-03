import type * as THREE from "three";

import type {
  GLBMainThreadBootstrapEvent,
  GLBMainThreadCounter,
  GLBMainThreadTelemetryBootstrap,
  GLBMainThreadTimingCategory,
} from "./glbMainThreadTelemetryCore";

type TelemetryModule = typeof import("./glbMainThreadTelemetry");

type TelemetryGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
};

const BOOTSTRAP_EVENT_CAPACITY = 96;
const RESPONSIVE_GAP_THRESHOLD_MS = 50;

let loadedTelemetry: TelemetryModule | null = null;
let telemetryLoadStarted = false;
let telemetryLoadFailed = false;
let bootstrapStartedAtMs: number | null = null;
const bootstrapEvents: GLBMainThreadBootstrapEvent[] = [];
const bootstrapCounters: Record<GLBMainThreadCounter, number> = {
  lifecycleTransitions: 0,
  diagnosticStoreUpdates: 0,
  reactRenders: 0,
  sceneAttachments: 0,
  rendererCalls: 0,
};
const instrumentedRenderers = new WeakSet<THREE.WebGLRenderer>();

function telemetryEnabled() {
  return (
    typeof window !== "undefined" &&
    (process.env.NODE_ENV !== "production" ||
      (globalThis as TelemetryGlobal)
        .__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ === true)
  );
}

function loadTelemetryForDiagnostics() {
  if (
    !telemetryEnabled() ||
    loadedTelemetry ||
    telemetryLoadStarted ||
    telemetryLoadFailed
  ) {
    return;
  }
  bootstrapStartedAtMs ??= nowMs();
  telemetryLoadStarted = true;
  void import("./glbMainThreadTelemetry")
    .then((telemetry) => {
      const bootstrap: GLBMainThreadTelemetryBootstrap = {
        startedAtMs: bootstrapStartedAtMs ?? nowMs(),
        events: bootstrapEvents.splice(0),
        counters: { ...bootstrapCounters },
      };
      telemetry.initializeGLBMainThreadTelemetry(bootstrap.startedAtMs);
      clearBootstrapCounters();
      telemetry.hydrateGLBMainThreadTelemetryBootstrap(bootstrap);
      loadedTelemetry = telemetry;
    })
    .catch(() => {
      telemetryLoadFailed = true;
      bootstrapEvents.length = 0;
      clearBootstrapCounters();
    });
}

function clearBootstrapCounters() {
  for (const counter of Object.keys(bootstrapCounters) as GLBMainThreadCounter[]) {
    bootstrapCounters[counter] = 0;
  }
  bootstrapStartedAtMs = null;
}

function retainBootstrapEvent(event: GLBMainThreadBootstrapEvent) {
  if (bootstrapEvents.length === BOOTSTRAP_EVENT_CAPACITY) {
    bootstrapEvents.shift();
  }
  bootstrapEvents.push(event);
}

function nowMs() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

export function initializeGLBMainThreadTelemetry() {
  if (!telemetryEnabled()) return;
  if (loadedTelemetry) loadedTelemetry.initializeGLBMainThreadTelemetry();
  else loadTelemetryForDiagnostics();
}

export function measureGLBMainThreadWork<T>(
  category: GLBMainThreadTimingCategory,
  operation: () => T,
) {
  if (loadedTelemetry) {
    return loadedTelemetry.measureGLBMainThreadWork(category, operation);
  }
  if (!telemetryEnabled() || telemetryLoadFailed) return operation();
  loadTelemetryForDiagnostics();
  const startedAtMs = nowMs();
  try {
    return operation();
  } finally {
    retainBootstrapEvent({
      type: "timing",
      category,
      startedAtMs,
      completedAtMs: nowMs(),
    });
  }
}

export function recordGLBMainThreadTiming(
  category: GLBMainThreadTimingCategory,
  startedAtMs: number,
  completedAtMs: number,
) {
  if (loadedTelemetry) {
    loadedTelemetry.recordGLBMainThreadTiming(
      category,
      startedAtMs,
      completedAtMs,
    );
  } else if (telemetryEnabled() && !telemetryLoadFailed) {
    retainBootstrapEvent({
      type: "timing",
      category,
      startedAtMs,
      completedAtMs,
    });
    loadTelemetryForDiagnostics();
  }
}

export function recordGLBEventLoopGap(startedAtMs: number, durationMs: number) {
  if (loadedTelemetry) {
    loadedTelemetry.recordGLBEventLoopGap(startedAtMs, durationMs);
  } else if (
    telemetryEnabled() &&
    !telemetryLoadFailed &&
    durationMs >= RESPONSIVE_GAP_THRESHOLD_MS
  ) {
    retainBootstrapEvent({ type: "event-loop-gap", startedAtMs, durationMs });
    loadTelemetryForDiagnostics();
  }
}

export function recordGLBMainThreadCounter(counter: GLBMainThreadCounter) {
  if (loadedTelemetry) {
    loadedTelemetry.recordGLBMainThreadCounter(counter);
  } else if (telemetryEnabled() && !telemetryLoadFailed) {
    bootstrapCounters[counter] = Math.min(
      BOOTSTRAP_EVENT_CAPACITY,
      bootstrapCounters[counter] + 1,
    );
    loadTelemetryForDiagnostics();
  }
}

export function instrumentGLBMainThreadRenderer(renderer: THREE.WebGLRenderer) {
  if (!telemetryEnabled() || instrumentedRenderers.has(renderer)) return;
  instrumentedRenderers.add(renderer);
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    recordGLBMainThreadCounter("rendererCalls");
    return measureGLBMainThreadWork("r3f-render", () => render(scene, camera));
  };
  loadTelemetryForDiagnostics();
}
