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
    ]) ||
    value.schema !== "interior-ai.runtime-smoke-browser-callback.v1" ||
    !SAFE_ID.test(value.phaseName) ||
    !SAFE_ID.test(value.operationName) ||
    !Number.isSafeInteger(value.requestId) ||
    value.requestId <= 0 ||
    !CALLBACK_STAGES.has(value.stage)
  ) {
    throw new Error("Runtime-smoke browser callback milestone is unsafe");
  }
  return {
    schema: "interior-ai.runtime-smoke-browser-callback.v1",
    phaseName: value.phaseName,
    operationName: value.operationName,
    requestId: value.requestId,
    stage: value.stage,
  };
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
    ]) ||
    value.schema !== "interior-ai.runtime-smoke-browser-heartbeat.v1" ||
    (value.kind !== "started" && value.kind !== "interval") ||
    !Number.isSafeInteger(value.sequence) ||
    value.sequence <= 0 ||
    !nonNegativeInteger(value.observedAtMs) ||
    !nonNegativeInteger(value.eventLoopDelayMs) ||
    !nonNegativeInteger(value.maximumEventLoopDelayMs) ||
    value.eventLoopDelayMs > value.maximumEventLoopDelayMs
  ) {
    throw new Error("Runtime-smoke browser heartbeat is unsafe");
  }
  return {
    schema: "interior-ai.runtime-smoke-browser-heartbeat.v1",
    kind: value.kind,
    sequence: value.sequence,
    observedAtMs: value.observedAtMs,
    eventLoopDelayMs: value.eventLoopDelayMs,
    maximumEventLoopDelayMs: value.maximumEventLoopDelayMs,
  };
}
