const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;
const CALLBACK_STAGES = new Set([
  "entered-browser",
  "snapshot-complete",
  "callback-exited",
  "serialization-complete",
]);

function exactKeys(value, expected) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      Object.keys(value).length === expected.length &&
      expected.every((key) => Object.hasOwn(value, key)),
  );
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

export function projectRuntimeSmokeBrowserCallbackMilestone(value) {
  if (
    !exactKeys(value, [
      "schema",
      "phaseName",
      "operationName",
      "requestId",
      "stage",
      "observedAtMs",
    ]) ||
    value.schema !== "interior-ai.runtime-smoke-browser-callback.v2" ||
    !SAFE_ID.test(value.phaseName) ||
    !SAFE_ID.test(value.operationName) ||
    !Number.isSafeInteger(value.requestId) ||
    value.requestId <= 0 ||
    !CALLBACK_STAGES.has(value.stage) ||
    !nonNegativeInteger(value.observedAtMs)
  ) {
    throw new Error("Runtime-smoke browser callback milestone is unsafe");
  }
  return {
    schema: "interior-ai.runtime-smoke-browser-callback.v2",
    phaseName: value.phaseName,
    operationName: value.operationName,
    requestId: value.requestId,
    stage: value.stage,
    observedAtMs: value.observedAtMs,
  };
}

function safeCallbackRequest(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !SAFE_ID.test(value.phaseName) ||
    !SAFE_ID.test(value.operationName) ||
    !Number.isSafeInteger(value.requestId) ||
    value.requestId <= 0
  ) {
    throw new Error("Runtime-smoke browser callback request is unsafe");
  }
  return value;
}

export function runtimeSmokeBrowserCallbackMilestoneMatchesRequest(
  request,
  milestone,
) {
  safeCallbackRequest(request);
  const projected = projectRuntimeSmokeBrowserCallbackMilestone(milestone);
  return (
    request.phaseName === projected.phaseName &&
    request.operationName === projected.operationName &&
    request.requestId === projected.requestId
  );
}

export function classifyRuntimeSmokeBrowserCallbackProgress({
  request,
  milestones,
}) {
  safeCallbackRequest(request);
  if (!Array.isArray(milestones)) {
    throw new Error("Runtime-smoke browser callback progress is unsafe");
  }
  const stages = [...CALLBACK_STAGES];
  if (
    milestones.some(
      (stage, index) => !CALLBACK_STAGES.has(stage) || stage !== stages[index],
    )
  ) {
    throw new Error("Runtime-smoke browser callback progress is unsafe");
  }
  const observed = milestones;
  const latestStage = observed.at(-1) ?? "not-entered";
  const nextStage = stages.find(
    (stage) => !observed.includes(stage),
  ) ?? "host-result";
  return Object.freeze({ latestStage, nextStage });
}

export function projectRuntimeSmokeBrowserHeartbeat(value) {
  if (
    !exactKeys(value, [
      "schema",
      "kind",
      "sequence",
      "observedAtMs",
      "eventLoopDelayMs",
      "maximumEventLoopDelayMs",
      "lastAnimationFrameDelayMs",
      "maximumAnimationFrameDelayMs",
      "lastAnimationFrameCadenceMs",
      "visibilityState",
      "documentReadyState",
      "lifecycleState",
      "rendererCalls",
      "rendererCallDelta",
      "rendererCallRateHz",
      "activeAnimationCount",
      "controlActivity",
      "controlEventCount",
      "webglContextLostCount",
      "webglContextRestoredCount",
    ]) ||
    value.schema !== "interior-ai.runtime-smoke-browser-heartbeat.v2" ||
    (value.kind !== "started" && value.kind !== "interval") ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence <= 0 ||
    !nonNegativeInteger(value.observedAtMs) ||
    !nonNegativeInteger(value.eventLoopDelayMs) ||
    !nonNegativeInteger(value.maximumEventLoopDelayMs) ||
    value.eventLoopDelayMs > value.maximumEventLoopDelayMs ||
    (value.lastAnimationFrameDelayMs !== null &&
      !nonNegativeInteger(value.lastAnimationFrameDelayMs)) ||
    !nonNegativeInteger(value.maximumAnimationFrameDelayMs) ||
    (value.lastAnimationFrameDelayMs !== null &&
      value.lastAnimationFrameDelayMs > value.maximumAnimationFrameDelayMs) ||
    (value.lastAnimationFrameCadenceMs !== null &&
      !nonNegativeInteger(value.lastAnimationFrameCadenceMs)) ||
    !new Set(["hidden", "visible", "prerender"]).has(value.visibilityState) ||
    !new Set(["loading", "interactive", "complete"]).has(
      value.documentReadyState,
    ) ||
    !new Set(["active", "pagehide", "frozen"]).has(value.lifecycleState) ||
    !nonNegativeInteger(value.rendererCalls) ||
    !nonNegativeInteger(value.rendererCallDelta) ||
    value.rendererCallDelta > value.rendererCalls ||
    !nonNegativeInteger(value.rendererCallRateHz) ||
    !nonNegativeInteger(value.activeAnimationCount) ||
    !new Set(["idle", "pointer-active"]).has(value.controlActivity) ||
    !nonNegativeInteger(value.controlEventCount) ||
    !nonNegativeInteger(value.webglContextLostCount) ||
    !nonNegativeInteger(value.webglContextRestoredCount)
  ) {
    throw new Error("Runtime-smoke browser heartbeat is unsafe");
  }
  return {
    schema: "interior-ai.runtime-smoke-browser-heartbeat.v2",
    kind: value.kind,
    sequence: value.sequence,
    observedAtMs: value.observedAtMs,
    eventLoopDelayMs: value.eventLoopDelayMs,
    maximumEventLoopDelayMs: value.maximumEventLoopDelayMs,
    lastAnimationFrameDelayMs: value.lastAnimationFrameDelayMs,
    maximumAnimationFrameDelayMs: value.maximumAnimationFrameDelayMs,
    lastAnimationFrameCadenceMs: value.lastAnimationFrameCadenceMs,
    visibilityState: value.visibilityState,
    documentReadyState: value.documentReadyState,
    lifecycleState: value.lifecycleState,
    rendererCalls: value.rendererCalls,
    rendererCallDelta: value.rendererCallDelta,
    rendererCallRateHz: value.rendererCallRateHz,
    activeAnimationCount: value.activeAnimationCount,
    controlActivity: value.controlActivity,
    controlEventCount: value.controlEventCount,
    webglContextLostCount: value.webglContextLostCount,
    webglContextRestoredCount: value.webglContextRestoredCount,
  };
}
