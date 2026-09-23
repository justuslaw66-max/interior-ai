export const RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT = Object.freeze({
  schema: "interior-ai.runtime-smoke-render-idle-observation-contract.v1",
  version: 1,
  sampleIntervalMs: 500,
  requiredSampleCount: 6,
  observationDurationMs: 2_500,
  rendererIdleWindowMs: 2_000,
  maximumSampleFreshnessMs: 750,
  maximumSampleGapMs: 1_250,
});

const SAMPLE_SCHEMA = "interior-ai.runtime-smoke-render-idle-sample.v1";
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._,:-]{0,511}$/;
const SAMPLE_KEYS = Object.freeze([
  "schema",
  "version",
  "capturedAtMs",
  "callbackRequestId",
  "callbackEnteredAtMs",
  "callbackEntryObserved",
  "documentGenerationId",
  "reloadGeneration",
  "rendererInstrumentationGeneration",
  "rendererCalls",
  "invalidationCalls",
  "lastRendererCallAtMs",
  "lastInvalidationAtMs",
  "visibilityState",
  "lifecycleState",
  "webglContextState",
  "webglGeneration",
  "activeControlTransitionCount",
  "activeItemAnimationCount",
  "activeSupportedAnimationCount",
  "pendingInvalidation",
  "requiredModelRegistryIdentity",
  "requiredActiveModelCount",
  "models",
  "sampleFreshnessMs",
]);

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nullableMonotonicTime(value, capturedAtMs) {
  return value === null || (nonNegativeInteger(value) && value <= capturedAtMs);
}

function validModelSample(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === 3 &&
      typeof value.key === "string" &&
      SAFE_ID.test(value.key) &&
      nonNegativeInteger(value.renderCount) &&
      nonNegativeInteger(value.boundsMaterialChangeCount),
  );
}

function validSample(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === SAMPLE_KEYS.length &&
      SAMPLE_KEYS.every((key) => Object.hasOwn(value, key)) &&
      value.schema === SAMPLE_SCHEMA &&
      value.version === 1 &&
      nonNegativeInteger(value.capturedAtMs) &&
      positiveInteger(value.callbackRequestId) &&
      nonNegativeInteger(value.callbackEnteredAtMs) &&
      value.callbackEnteredAtMs <= value.capturedAtMs &&
      value.callbackEntryObserved === true &&
      typeof value.documentGenerationId === "string" &&
      SAFE_ID.test(value.documentGenerationId) &&
      positiveInteger(value.reloadGeneration) &&
      positiveInteger(value.rendererInstrumentationGeneration) &&
      nonNegativeInteger(value.rendererCalls) &&
      nonNegativeInteger(value.invalidationCalls) &&
      nullableMonotonicTime(value.lastRendererCallAtMs, value.capturedAtMs) &&
      nullableMonotonicTime(value.lastInvalidationAtMs, value.capturedAtMs) &&
      (value.rendererCalls === 0 || value.lastRendererCallAtMs !== null) &&
      (value.invalidationCalls === 0 || value.lastInvalidationAtMs !== null) &&
      new Set(["visible", "hidden", "prerender"]).has(value.visibilityState) &&
      new Set(["active", "pagehide", "frozen", "terminating"]).has(
        value.lifecycleState,
      ) &&
      new Set(["active", "lost"]).has(value.webglContextState) &&
      nonNegativeInteger(value.webglGeneration) &&
      nonNegativeInteger(value.activeControlTransitionCount) &&
      nonNegativeInteger(value.activeItemAnimationCount) &&
      nonNegativeInteger(value.activeSupportedAnimationCount) &&
      value.activeSupportedAnimationCount >=
        value.activeControlTransitionCount + value.activeItemAnimationCount &&
      typeof value.pendingInvalidation === "boolean" &&
      typeof value.requiredModelRegistryIdentity === "string" &&
      SAFE_ID.test(value.requiredModelRegistryIdentity) &&
      positiveInteger(value.requiredActiveModelCount) &&
      Array.isArray(value.models) &&
      value.models.length === value.requiredActiveModelCount &&
      value.models.every(validModelSample) &&
      nonNegativeInteger(value.sampleFreshnessMs),
  );
}

function stableModels(samples) {
  const baseline = samples[0].models;
  return (
    baseline.length > 0 &&
    baseline.every((entry) => entry.boundsMaterialChangeCount >= 1) &&
    samples.every(
      (sample) =>
        sample.models.length === baseline.length &&
        sample.models.every((entry, index) => {
          const prior = baseline[index];
          return (
            entry.key === prior.key &&
            entry.renderCount === prior.renderCount &&
            entry.boundsMaterialChangeCount === prior.boundsMaterialChangeCount
          );
        }),
    )
  );
}

export function evaluateRuntimeSmokeRendererIdle({
  samples,
  contract = RUNTIME_SMOKE_RENDER_IDLE_OBSERVATION_CONTRACT,
}) {
  if (
    !Array.isArray(samples) ||
    samples.length !== contract.requiredSampleCount ||
    samples.some((sample) => !validSample(sample))
  ) {
    throw new Error("Runtime-smoke renderer-idle observation is malformed");
  }

  const first = samples[0];
  const last = samples.at(-1);
  const reasons = [];
  const observationDurationMs = last.capturedAtMs - first.capturedAtMs;
  if (observationDurationMs < contract.observationDurationMs) {
    reasons.push("observation-window-too-short");
  }
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample.sampleFreshnessMs > contract.maximumSampleFreshnessMs) {
      reasons.push("stale-sample");
    }
    if (index === 0) continue;
    const previous = samples[index - 1];
    const gap = sample.capturedAtMs - previous.capturedAtMs;
    if (gap <= 0 || gap > contract.maximumSampleGapMs) {
      reasons.push(gap <= 0 ? "stale-sample" : "sample-gap-too-large");
    }
    if (sample.rendererCalls < previous.rendererCalls) {
      reasons.push("renderer-counter-reset");
    }
    if (sample.invalidationCalls < previous.invalidationCalls) {
      reasons.push("invalidation-counter-reset");
    }
  }

  const sameDocument = samples.every(
    (sample) => sample.documentGenerationId === first.documentGenerationId,
  );
  const sameCallback = samples.every(
    (sample) =>
      sample.callbackRequestId === first.callbackRequestId &&
      sample.callbackEnteredAtMs === first.callbackEnteredAtMs,
  );
  const sameReload = samples.every(
    (sample) => sample.reloadGeneration === first.reloadGeneration,
  );
  const sameInstrumentation = samples.every(
    (sample) =>
      sample.rendererInstrumentationGeneration ===
      first.rendererInstrumentationGeneration,
  );
  const sameWebglGeneration = samples.every(
    (sample) => sample.webglGeneration === first.webglGeneration,
  );
  const sameRegistry = samples.every(
    (sample) =>
      sample.requiredModelRegistryIdentity ===
        first.requiredModelRegistryIdentity &&
      sample.requiredActiveModelCount === first.requiredActiveModelCount,
  );
  if (!sameCallback) reasons.push("cross-callback-observation");
  if (!sameDocument) reasons.push("cross-document-observation");
  if (!sameReload) reasons.push("cross-reload-observation");
  if (!sameInstrumentation) reasons.push("cross-instrumentation-observation");
  if (!sameWebglGeneration) reasons.push("webgl-generation-changed");
  if (!sameRegistry) reasons.push("required-model-registry-changed");
  if (samples.some((sample) => sample.visibilityState !== "visible")) {
    reasons.push("document-not-visible");
  }
  if (samples.some((sample) => sample.lifecycleState !== "active")) {
    reasons.push("document-not-active");
  }
  if (samples.some((sample) => sample.webglContextState !== "active")) {
    reasons.push("webgl-context-lost");
  }
  if (samples.some((sample) => sample.activeItemAnimationCount > 0)) {
    reasons.push("active-item-animation");
  }
  if (samples.some((sample) => sample.activeControlTransitionCount > 0)) {
    reasons.push("active-control-transition");
  }
  if (samples.some((sample) => sample.activeSupportedAnimationCount > 0)) {
    reasons.push("active-supported-animation");
  }
  if (samples.some((sample) => sample.pendingInvalidation)) {
    reasons.push("pending-invalidation");
  }

  const modelsStable = stableModels(samples);
  if (!modelsStable) reasons.push("model-counters-changed");
  const rendererCallDelta = last.rendererCalls - first.rendererCalls;
  const invalidationCallDelta = last.invalidationCalls - first.invalidationCalls;
  if (rendererCallDelta !== 0) reasons.push("renderer-calls-observed");
  if (invalidationCallDelta !== 0) reasons.push("invalidations-observed");
  if (
    last.lastRendererCallAtMs === null ||
    last.capturedAtMs - last.lastRendererCallAtMs < contract.rendererIdleWindowMs
  ) {
    reasons.push("renderer-idle-window-not-met");
  }
  if (
    last.lastInvalidationAtMs !== null &&
    last.capturedAtMs - last.lastInvalidationAtMs < contract.rendererIdleWindowMs
  ) {
    reasons.push("invalidation-idle-window-not-met");
  }

  const uniqueReasons = [...new Set(reasons)];
  return Object.freeze({
    settled: uniqueReasons.length === 0,
    modelsStable,
    rendererIdle: rendererCallDelta === 0,
    rendererCallDelta,
    invalidationCallDelta,
    observationDurationMs,
    reasons: Object.freeze(uniqueReasons),
  });
}
