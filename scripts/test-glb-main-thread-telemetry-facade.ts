import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";

import { createGLBMainThreadTelemetryFacadeController } from "../components/scene/glb-scaled-model/glbMainThreadTelemetryFacadeController";
import type { GLBMainThreadTelemetrySnapshot } from "../components/scene/glb-scaled-model/glbMainThreadTelemetry";

type TelemetryGlobal = typeof globalThis & {
  __INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__?: number;
  __INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__?: unknown;
  __INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?: () => GLBMainThreadTelemetrySnapshot;
};

const telemetryGlobal = globalThis as TelemetryGlobal;
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: globalThis,
});

function deferred<T>() {
  let resolvePromise: (value: T) => void = () => undefined;
  let rejectPromise: (reason: Error) => void = () => undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function resetCollector(generation: number) {
  delete telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_TELEMETRY__;
  delete telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__;
  telemetryGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__ = generation;
}

async function collectorModule() {
  return import(
    "../components/scene/glb-scaled-model/glbMainThreadTelemetry"
  );
}

async function emptyActivationOrdering() {
  resetCollector(1);
  const importCompletion = deferred<Awaited<ReturnType<typeof collectorModule>>>();
  let importRequests = 0;
  const controller = createGLBMainThreadTelemetryFacadeController({
    telemetryEnabled: () => true,
    loadTelemetry: () => {
      importRequests += 1;
      return importCompletion.promise;
    },
    nowMs: () => 100,
  });
  controller.initialize();
  assert.deepEqual(controller.inspect(), {
    collectorImportState: "pending",
    importRequestCount: 1,
    bufferedEventCount: 0,
    bufferedCounterTotal: 0,
  });
  importCompletion.resolve(await collectorModule());
  await controller.whenSettled();
  assert.equal(importRequests, 1);
  const activation = telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.();
  assert.equal(activation?.collectorImportState, "active");
  assert.equal(activation?.collectorActivationMode, "direct-empty-bootstrap");
  assert.equal(activation?.collectorActivationGeneration, 1);
  assert.equal(activation?.bootstrapRecordsQueuedAtActivation, 0);
  assert.equal(activation?.bootstrapEventsFlushed, 0);
  assert.equal(activation?.bootstrapFlushCompleted, true);
  assert.equal(activation?.directModeActive, true);
  assert.equal(activation?.directTelemetryObserved, false);

  controller.recordTiming("normalization", 110, 115);
  controller.recordCounter("lifecycleTransitions");
  controller.measure("r3f-render", () => undefined);
  const direct = telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.();
  assert.equal(direct?.directTelemetryObserved, true);
  assert.equal(direct?.timings.length, 2);
  assert.equal(direct?.counters.lifecycleTransitions, 1);
  assert.equal(direct?.bootstrapEventsFlushed, 0);
  assert.equal(
    telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.()
      .bootstrapEventsFlushed,
    0,
    "snapshots must not reset cumulative activation provenance",
  );
}

async function nonemptyActivationOrdering() {
  resetCollector(2);
  const importCompletion = deferred<Awaited<ReturnType<typeof collectorModule>>>();
  let now = 200;
  const controller = createGLBMainThreadTelemetryFacadeController({
    telemetryEnabled: () => true,
    loadTelemetry: () => importCompletion.promise,
    nowMs: () => ++now,
  });
  controller.initialize();
  controller.recordTiming("normalization", 205, 209);
  controller.recordEventLoopGap(210, 75);
  controller.recordCounter("lifecycleTransitions");
  controller.recordCounter("rendererCalls");
  assert.deepEqual(controller.inspect(), {
    collectorImportState: "pending",
    importRequestCount: 1,
    bufferedEventCount: 2,
    bufferedCounterTotal: 2,
  });
  importCompletion.resolve(await collectorModule());
  await controller.whenSettled();
  const activation = telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.();
  assert.equal(activation?.collectorActivationMode, "hydrated-bootstrap");
  assert.equal(activation?.collectorActivationGeneration, 2);
  assert.equal(activation?.bootstrapRecordsQueuedAtActivation, 4);
  assert.equal(activation?.bootstrapEventsFlushed, 4);
  assert.equal(activation?.timings.length, 1);
  assert.equal(activation?.heartbeatGaps.length, 1);
  assert.equal(activation?.counters.lifecycleTransitions, 1);
  assert.equal(activation?.directTelemetryObserved, false);
  controller.recordCounter("rendererCalls");
  assert.equal(
    telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.()
      .directTelemetryObserved,
    true,
  );
  assert.equal(
    telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.().counters
      .rendererCalls,
    2,
  );
}

async function importFailureAndDisabledBehavior() {
  resetCollector(3);
  const importCompletion = deferred<Awaited<ReturnType<typeof collectorModule>>>();
  let failureRequests = 0;
  const failed = createGLBMainThreadTelemetryFacadeController({
    telemetryEnabled: () => true,
    loadTelemetry: () => {
      failureRequests += 1;
      return importCompletion.promise;
    },
    nowMs: () => 300,
  });
  failed.initialize();
  failed.recordCounter("rendererCalls");
  importCompletion.reject(new Error("controlled import rejection"));
  await failed.whenSettled();
  failed.initialize();
  failed.recordCounter("rendererCalls");
  assert.equal(failureRequests, 1, "a rejected import must not retry");
  assert.equal(failed.inspect().collectorImportState, "failed");
  assert.equal(failed.inspect().bufferedCounterTotal, 0);
  assert.equal(telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__, undefined);

  let disabledRequests = 0;
  const disabled = createGLBMainThreadTelemetryFacadeController({
    telemetryEnabled: () => false,
    loadTelemetry: async () => {
      disabledRequests += 1;
      return collectorModule();
    },
    nowMs: () => 0,
  });
  disabled.initialize();
  disabled.recordCounter("rendererCalls");
  assert.equal(disabledRequests, 0);
  assert.equal(disabled.inspect().collectorImportState, "not-requested");
  assert.equal(telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__, undefined);
}

async function boundedBootstrapAndFreshRealm() {
  resetCollector(4);
  const importCompletion = deferred<Awaited<ReturnType<typeof collectorModule>>>();
  const controller = createGLBMainThreadTelemetryFacadeController({
    telemetryEnabled: () => true,
    loadTelemetry: () => importCompletion.promise,
    nowMs: () => 400,
  });
  controller.initialize();
  for (let index = 0; index < 150; index += 1) {
    controller.recordTiming("normalization", index, index + 1);
    controller.recordCounter("rendererCalls");
  }
  assert.equal(controller.inspect().bufferedEventCount, 96);
  assert.equal(controller.inspect().bufferedCounterTotal, 96);
  importCompletion.resolve(await collectorModule());
  await controller.whenSettled();
  const bounded = telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.();
  assert.equal(bounded?.bootstrapRecordsQueuedAtActivation, 192);
  assert.equal(bounded?.bootstrapEventsFlushed, 192);
  assert.equal(bounded?.timings.length, 96);
  assert.equal(bounded?.counters.rendererCalls, 96);

  resetCollector(5);
  const fresh = createGLBMainThreadTelemetryFacadeController({
    telemetryEnabled: () => true,
    loadTelemetry: collectorModule,
    nowMs: () => 500,
  });
  fresh.initialize();
  await fresh.whenSettled();
  const freshSnapshot = telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.();
  assert.equal(freshSnapshot?.collectorActivationGeneration, 5);
  assert.equal(freshSnapshot?.bootstrapRecordsQueuedAtActivation, 0);
  assert.equal(freshSnapshot?.bootstrapEventsFlushed, 0);
  const overheadStartedAtMs = performance.now();
  for (let index = 0; index < 10_000; index += 1) {
    fresh.recordTiming("normalization", index, index + 0.1);
  }
  const overheadDurationMs = performance.now() - overheadStartedAtMs;
  const overheadSnapshot =
    telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.();
  assert.equal(overheadSnapshot?.timings.length, 96);
  assert.equal(overheadSnapshot?.timingAggregates.normalization.count, 10_000);
  assert.ok(
    overheadDurationMs < 500,
    `10,000 direct bounded writes took ${overheadDurationMs.toFixed(1)} ms`,
  );
  return overheadDurationMs;
}

async function run() {
  await emptyActivationOrdering();
  await nonemptyActivationOrdering();
  await importFailureAndDisabledBehavior();
  const overheadDurationMs = await boundedBootstrapAndFreshRealm();
  console.log(
    "GLB main-thread telemetry facade behavioral tests passed " +
      `(${overheadDurationMs.toFixed(1)} ms for 10,000 direct bounded writes).`,
  );
}

void run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
