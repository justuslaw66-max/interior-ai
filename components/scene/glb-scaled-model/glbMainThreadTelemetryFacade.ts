import type * as THREE from "three";

import { createGLBMainThreadTelemetryFacadeController } from "./glbMainThreadTelemetryFacadeController";
import type {
  GLBMainThreadCounter,
  GLBMainThreadTimingCategory,
} from "./glbMainThreadTelemetryCore";

type TelemetryGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
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

function nowMs() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

const telemetryFacade = createGLBMainThreadTelemetryFacadeController({
  telemetryEnabled,
  loadTelemetry: () => import("./glbMainThreadTelemetry"),
  nowMs,
});

export function initializeGLBMainThreadTelemetry() {
  telemetryFacade.initialize();
}

export function measureGLBMainThreadWork<T>(
  category: GLBMainThreadTimingCategory,
  operation: () => T,
) {
  return telemetryFacade.measure(category, operation);
}

export function recordGLBMainThreadTiming(
  category: GLBMainThreadTimingCategory,
  startedAtMs: number,
  completedAtMs: number,
) {
  telemetryFacade.recordTiming(category, startedAtMs, completedAtMs);
}

export function recordGLBEventLoopGap(startedAtMs: number, durationMs: number) {
  telemetryFacade.recordEventLoopGap(startedAtMs, durationMs);
}

export function recordGLBMainThreadCounter(counter: GLBMainThreadCounter) {
  telemetryFacade.recordCounter(counter);
}

export function instrumentGLBMainThreadRenderer(renderer: THREE.WebGLRenderer) {
  if (!telemetryEnabled() || instrumentedRenderers.has(renderer)) return;
  instrumentedRenderers.add(renderer);
  const render = renderer.render.bind(renderer);
  renderer.render = (scene, camera) => {
    recordGLBMainThreadCounter("rendererCalls");
    return measureGLBMainThreadWork("r3f-render", () => render(scene, camera));
  };
  telemetryFacade.requestTelemetry();
}
