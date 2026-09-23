import { createGLBRequiredSnapshot } from "./glbRequiredSnapshot";
import { getReloadGeneration } from "./modelDiagnosticRealm";
import {
  initializeGLBMainThreadTelemetry,
  recordGLBEventLoopGap,
  recordGLBMainThreadCounter,
} from "./glbMainThreadTelemetryFacade";
import type {
  GLBModelDiagnosticSnapshot,
  GLBModelStageTiming,
  GLBModelTransitionName,
} from "./modelLifecycleTypes";

const EVENT_LOOP_SAMPLE_INTERVAL_MS = 100;

type GLBDiagnosticsGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
  __INTERIOR_AI_GLB_DIAGNOSTICS__?: Record<
    string,
    GLBModelDiagnosticSnapshot
  >;
  __INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__?: number;
  __INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__?: number;
  __INTERIOR_AI_GLB_DIAGNOSTICS_VERSION__?: number;
  __INTERIOR_AI_GLB_REQUIRED_SNAPSHOT__?: () => ReturnType<
    typeof createGLBRequiredSnapshot
  >;
  __INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?: {
    lastDelayMs: number;
    maximumDelayMs: number;
  };
};

export function transitionTimestampMs() {
  return typeof performance !== "undefined" &&
    Number.isFinite(performance.now())
    ? Math.max(0, performance.now())
    : 0;
}

export { getReloadGeneration } from "./modelDiagnosticRealm";

function ensureEventLoopProbe(diagnosticsGlobal: GLBDiagnosticsGlobal) {
  if (diagnosticsGlobal.__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__) return;
  diagnosticsGlobal.__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__ = {
    lastDelayMs: 0,
    maximumDelayMs: 0,
  };
  if (typeof document === "undefined") return;
  let expectedAtMs = performance.now() + EVENT_LOOP_SAMPLE_INTERVAL_MS;
  window.setInterval(() => {
    const observedAtMs = performance.now();
    const delayMs = Math.max(0, observedAtMs - expectedAtMs);
    const probe = diagnosticsGlobal.__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__;
    if (probe) {
      probe.lastDelayMs = delayMs;
      probe.maximumDelayMs = Math.max(probe.maximumDelayMs, delayMs);
    }
    recordGLBEventLoopGap(expectedAtMs, delayMs);
    expectedAtMs = observedAtMs + EVENT_LOOP_SAMPLE_INTERVAL_MS;
  }, EVENT_LOOP_SAMPLE_INTERVAL_MS);
}

export function getDiagnosticStore() {
  const diagnosticsGlobal = globalThis as GLBDiagnosticsGlobal;
  const enabled =
    process.env.NODE_ENV !== "production" ||
    diagnosticsGlobal.__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ === true;
  if (!enabled || typeof window === "undefined") return null;

  const reloadGeneration = getReloadGeneration(diagnosticsGlobal);
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ??= {};
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_VERSION__ ??= 0;
  initializeGLBMainThreadTelemetry();
  ensureEventLoopProbe(diagnosticsGlobal);
  diagnosticsGlobal.__INTERIOR_AI_GLB_REQUIRED_SNAPSHOT__ = () =>
    createGLBRequiredSnapshot({
      registry: diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ?? {},
      reloadGeneration,
      readRegistryVersion: () =>
        diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_VERSION__ ?? 0,
      eventLoopProbe: {
        lastDelayMs:
          diagnosticsGlobal.__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?.lastDelayMs ??
          0,
        maximumDelayMs:
          diagnosticsGlobal.__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__
            ?.maximumDelayMs ?? 0,
      },
    });
  return diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__;
}

export function nextMountInstanceId(reloadGeneration: number) {
  const diagnosticsGlobal = globalThis as GLBDiagnosticsGlobal;
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__ =
    (diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__ ?? 0) + 1;
  return `g${reloadGeneration}:m${diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__}`;
}

export function bumpDiagnosticRegistryVersion() {
  const diagnosticsGlobal = globalThis as GLBDiagnosticsGlobal;
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_VERSION__ =
    (diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_VERSION__ ?? 0) + 1;
  recordGLBMainThreadCounter("diagnosticStoreUpdates");
}

export function markDiagnosticTransition(
  diagnostic: GLBModelDiagnosticSnapshot,
  transition: GLBModelTransitionName,
  atMs?: number,
  eventLoopDelayMs?: number | null,
) {
  recordGLBMainThreadCounter("lifecycleTransitions");
  const diagnosticsGlobal = globalThis as GLBDiagnosticsGlobal;
  const observedAtMs = transitionTimestampMs();
  const timing: GLBModelStageTiming = {
    atMs: atMs ?? observedAtMs,
    eventLoopDelayMs:
      eventLoopDelayMs !== undefined
        ? eventLoopDelayMs
        : diagnosticsGlobal.__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?.lastDelayMs ??
          null,
  };
  diagnostic.lastTransitionName = transition;
  diagnostic.lastTransitionAtMs = Math.max(
    diagnostic.lastTransitionAtMs,
    observedAtMs,
  );
  diagnostic.stageTimings[transition] ??= timing;
  bumpDiagnosticRegistryVersion();
}
