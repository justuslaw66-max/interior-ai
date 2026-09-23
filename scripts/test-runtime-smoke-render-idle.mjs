import assert from "node:assert/strict";

import {
  RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT,
  evaluateRuntimeSmokeRendererIdle,
} from "./runtime-smoke-render-idle.mjs";

const models = [
  { key: "model-1", renderCount: 3, boundsMaterialChangeCount: 1 },
  { key: "model-2", renderCount: 4, boundsMaterialChangeCount: 1 },
];

function idleSamples() {
  return Array.from(
    { length: RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT.requiredSampleCount },
    (_, index) => ({
      schema: "interior-ai.runtime-smoke-render-idle-sample.v1",
      version: 1,
      capturedAtMs: 1_000 + index * 500,
      callbackRequestId: 16,
      callbackEnteredAtMs: 1_000,
      callbackEntryObserved: true,
      documentGenerationId: "document-1",
      reloadGeneration: 3,
      rendererInstrumentationGeneration: 2,
      rendererCalls: 180,
      invalidationCalls: 24,
      lastRendererCallAtMs: 500,
      lastInvalidationAtMs: 500,
      visibilityState: "visible",
      lifecycleState: "active",
      webglContextState: "active",
      webglGeneration: 0,
      activeControlTransitionCount: 0,
      activeItemAnimationCount: 0,
      activeSupportedAnimationCount: 0,
      pendingInvalidation: false,
      requiredModelRegistryIdentity: "g3:v14:model-1,model-2",
      requiredActiveModelCount: 2,
      models: structuredClone(models),
      sampleFreshnessMs: 0,
    }),
  );
}

function rejectedReason(mutate, reason) {
  const samples = idleSamples();
  mutate(samples);
  const verdict = evaluateRuntimeSmokeRendererIdle({ samples });
  assert.equal(verdict.settled, false);
  assert.ok(verdict.reasons.includes(reason));
}

const staticVerdict = evaluateRuntimeSmokeRendererIdle({ samples: idleSamples() });
assert.equal(staticVerdict.settled, true, "static scene becomes renderer-idle");
assert.equal(staticVerdict.observationDurationMs, 2_500);

for (const [name, rendererCalls, invalidationCalls] of [
  ["one-shot state update", 181, 25],
  ["finite placement animation", 192, 36],
  ["finite camera damping", 205, 49],
  ["finite lighting/exposure update", 206, 50],
  ["finite resize update", 207, 51],
]) {
  const samples = idleSamples();
  samples.forEach((sample) => {
    sample.rendererCalls = rendererCalls;
    sample.invalidationCalls = invalidationCalls;
    sample.lastRendererCallAtMs = 500;
    sample.lastInvalidationAtMs = 500;
  });
  const verdict = evaluateRuntimeSmokeRendererIdle({ samples });
  assert.equal(verdict.settled, true, `${name} final state must plateau`);
}

rejectedReason((samples) => {
  samples.forEach((sample, index) => {
    sample.rendererCalls += index * 30;
    sample.lastRendererCallAtMs = sample.capturedAtMs;
  });
}, "renderer-calls-observed");
assert.ok(true, "permanent 60-Hz render loop negative control executed");

rejectedReason((samples) => {
  for (let index = 3; index < samples.length; index += 1) {
    samples[index].rendererCalls += 1;
    samples[index].invalidationCalls += 1;
    samples[index].lastRendererCallAtMs = samples[3].capturedAtMs;
    samples[index].lastInvalidationAtMs = samples[3].capturedAtMs;
  }
}, "invalidations-observed");
assert.ok(true, "low-frequency recurring invalidation negative control executed");

for (const [reason, mutate] of [
  ["stale-sample", (samples) => {
    samples[2].capturedAtMs = samples[1].capturedAtMs;
  }],
  ["cross-document-observation", (samples) => {
    samples[4].documentGenerationId = "document-2";
  }],
  ["cross-reload-observation", (samples) => {
    samples[4].reloadGeneration = 4;
  }],
  ["cross-instrumentation-observation", (samples) => {
    samples[4].rendererInstrumentationGeneration = 3;
  }],
  ["document-not-visible", (samples) => {
    samples[2].visibilityState = "hidden";
  }],
  ["document-not-active", (samples) => {
    samples[2].lifecycleState = "frozen";
  }],
  ["webgl-context-lost", (samples) => {
    samples[2].webglContextState = "lost";
  }],
  ["webgl-generation-changed", (samples) => {
    samples[4].webglGeneration = 2;
  }],
  ["renderer-counter-reset", (samples) => {
    samples[3].rendererCalls = 179;
  }],
  ["invalidation-counter-reset", (samples) => {
    samples[3].invalidationCalls = 23;
  }],
  ["active-item-animation", (samples) => {
    samples[2].activeItemAnimationCount = 1;
    samples[2].activeSupportedAnimationCount = 1;
  }],
  ["active-control-transition", (samples) => {
    samples[2].activeControlTransitionCount = 1;
    samples[2].activeSupportedAnimationCount = 1;
  }],
  ["pending-invalidation", (samples) => {
    samples[2].pendingInvalidation = true;
  }],
]) {
  rejectedReason(mutate, reason);
}
assert.ok(
  true,
  "stale cross-generation hidden WebGL counter-reset active-animation controls executed",
);

for (const mutate of [
  (samples) => {
    samples[0].rendererInstrumentationGeneration = 0;
  },
  (samples) => {
    samples[0].callbackEntryObserved = false;
  },
]) {
  const samples = idleSamples();
  mutate(samples);
  assert.throws(
    () => evaluateRuntimeSmokeRendererIdle({ samples }),
    /observation is malformed/,
  );
}
assert.ok(true, "missing instrumentation and callback-entry controls executed");

console.log("Runtime-smoke renderer-idle observation controls passed.");
