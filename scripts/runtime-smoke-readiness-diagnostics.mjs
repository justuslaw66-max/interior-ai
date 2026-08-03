const SAFE_ID = /^[a-z0-9][a-z0-9-]{0,95}$/;

function safeCheckpointValue(value) {
  return value === null || value === undefined
    ? "na"
    : String(value).toLowerCase().replace(/[^a-z0-9-]/g, "-");
}

function entryState(entry) {
  return entry ? `${entry.state}-${entry.referenceCount}` : "none-0";
}

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

function projectEntry(value) {
  if (value === null) return null;
  if (
    !exactKeys(value, ["state", "referenceCount"]) ||
    (value.state !== "pending" && value.state !== "ready") ||
    !nonNegativeInteger(value.referenceCount)
  ) {
    throw new Error("Runtime-smoke safe cache entry is malformed");
  }
  return { state: value.state, referenceCount: value.referenceCount };
}

function projectStageAtMs(value) {
  const keys = [
    "mounted",
    "requestStarted",
    "responseCompleted",
    "parseCompleted",
    "normalizationStarted",
    "normalizationCompleted",
    "materialsStarted",
    "materialsCompleted",
    "boundsStarted",
    "boundsCompleted",
    "sceneAttached",
    "ready",
    "error",
    "cancelled",
  ];
  if (
    !exactKeys(value, keys) ||
    keys.some(
      (key) => value[key] !== null && !nonNegativeInteger(value[key]),
    )
  ) {
    throw new Error("Runtime-smoke safe stage timing is malformed");
  }
  return Object.fromEntries(keys.map((key) => [key, value[key]]));
}

function projectModel(model, expectedOrdinal) {
  if (
    !exactKeys(model, [
      "ordinal",
      "identityHash",
      "active",
      "requiredForReadiness",
      "reloadGeneration",
      "generationState",
      "loadState",
      "pendingStage",
      "lastTransitionName",
      "lastTransitionAtMs",
      "stageAtMs",
      "cache",
      "counters",
    ]) ||
    model.ordinal !== expectedOrdinal ||
    !/^fnv1a-[a-f0-9]{8}$/.test(model.identityHash) ||
    typeof model.active !== "boolean" ||
    typeof model.requiredForReadiness !== "boolean" ||
    !nonNegativeInteger(model.reloadGeneration) ||
    !["current", "stale"].includes(model.generationState) ||
    !["loading", "ready", "error", "cancelled"].includes(model.loadState) ||
    ![
      null,
      "request-start",
      "response",
      "parse-decode",
      "normalization",
      "materials",
      "bounds",
      "scene-attachment",
      "ready-commit",
      "terminal-error",
      "cancelled",
    ].includes(model.pendingStage) ||
    ![
      "request-started",
      "response-complete",
      "parse-complete",
      "normalization-started",
      "normalization-complete",
      "material-cloning-started",
      "material-cloning-complete",
      "materials-started",
      "materials-complete",
      "bounds-started",
      "bounds-complete",
      "scene-attached",
      "mounted",
      "metadata-updated",
      "resource-acquired",
      "resource-released",
      "loading",
      "ready",
      "error",
      "cancelled",
    ].includes(model.lastTransitionName) ||
    !nonNegativeInteger(model.lastTransitionAtMs)
  ) {
    throw new Error("Runtime-smoke safe readiness model is malformed");
  }
  if (
    !exactKeys(model.cache, [
      "delivery",
      "parsedAcquisition",
      "preparedAcquisition",
      "resourceKind",
      "selectedEntry",
      "parsedEntry",
      "preparedEntry",
      "acquiredAtMs",
      "releasedAtMs",
    ]) ||
    !["unknown", "network", "cache-hit"].includes(model.cache.delivery) ||
    ![null, "hit", "miss"].includes(model.cache.parsedAcquisition) ||
    ![null, "hit", "miss"].includes(model.cache.preparedAcquisition) ||
    ![null, "parsed", "prepared"].includes(model.cache.resourceKind) ||
    (model.cache.acquiredAtMs !== null &&
      !nonNegativeInteger(model.cache.acquiredAtMs)) ||
    (model.cache.releasedAtMs !== null &&
      !nonNegativeInteger(model.cache.releasedAtMs)) ||
    !exactKeys(model.counters, [
      "mounts",
      "unmounts",
      "supersededMounts",
      "ignoredStaleTransitions",
    ]) ||
    Object.values(model.counters).some((value) => !nonNegativeInteger(value))
  ) {
    throw new Error("Runtime-smoke safe model metadata is malformed");
  }
  return {
    ordinal: model.ordinal,
    identityHash: model.identityHash,
    active: model.active,
    requiredForReadiness: model.requiredForReadiness,
    reloadGeneration: model.reloadGeneration,
    generationState: model.generationState,
    loadState: model.loadState,
    pendingStage: model.pendingStage,
    lastTransitionName: model.lastTransitionName,
    lastTransitionAtMs: model.lastTransitionAtMs,
    stageAtMs: projectStageAtMs(model.stageAtMs),
    cache: {
      delivery: model.cache.delivery,
      parsedAcquisition: model.cache.parsedAcquisition,
      preparedAcquisition: model.cache.preparedAcquisition,
      resourceKind: model.cache.resourceKind,
      selectedEntry: projectEntry(model.cache.selectedEntry),
      parsedEntry: projectEntry(model.cache.parsedEntry),
      preparedEntry: projectEntry(model.cache.preparedEntry),
      acquiredAtMs: model.cache.acquiredAtMs,
      releasedAtMs: model.cache.releasedAtMs,
    },
    counters: {
      mounts: model.counters.mounts,
      unmounts: model.counters.unmounts,
      supersededMounts: model.counters.supersededMounts,
      ignoredStaleTransitions: model.counters.ignoredStaleTransitions,
    },
  };
}

function projectSummary(summary) {
  if (
    !exactKeys(summary, [
      "schema",
      "reloadGeneration",
      "registryVersion",
      "activeSetHash",
      "activeRequiredCount",
      "includedModelCount",
      "omittedModelCount",
      "eventLoopDelayMs",
      "cacheTotals",
      "models",
    ]) ||
    summary?.schema !== "interior-ai.glb-safe-readiness-summary.v1" ||
    !Array.isArray(summary.models) ||
    !Number.isSafeInteger(summary.activeRequiredCount) ||
    !Number.isSafeInteger(summary.includedModelCount) ||
    !Number.isSafeInteger(summary.omittedModelCount) ||
    summary.models.length !== summary.includedModelCount ||
    summary.models.length > 16 ||
    !/^fnv1a-[a-f0-9]{8}$/.test(summary.activeSetHash) ||
    !nonNegativeInteger(summary.reloadGeneration) ||
    !nonNegativeInteger(summary.registryVersion) ||
    summary.activeRequiredCount !==
      summary.includedModelCount + summary.omittedModelCount ||
    !exactKeys(summary.eventLoopDelayMs, ["last", "maximum"]) ||
    !nonNegativeInteger(summary.eventLoopDelayMs.last) ||
    !nonNegativeInteger(summary.eventLoopDelayMs.maximum) ||
    summary.eventLoopDelayMs.last > summary.eventLoopDelayMs.maximum ||
    !exactKeys(summary.cacheTotals, [
      "parsedEntries",
      "parsedReferences",
      "preparedEntries",
      "preparedReferences",
    ]) ||
    Object.values(summary.cacheTotals).some(
      (value) => !nonNegativeInteger(value),
    )
  ) {
    throw new Error("Runtime-smoke safe readiness summary is malformed");
  }
  return {
    schema: "interior-ai.glb-safe-readiness-summary.v1",
    reloadGeneration: summary.reloadGeneration,
    registryVersion: summary.registryVersion,
    activeSetHash: summary.activeSetHash,
    activeRequiredCount: summary.activeRequiredCount,
    includedModelCount: summary.includedModelCount,
    omittedModelCount: summary.omittedModelCount,
    eventLoopDelayMs: {
      last: summary.eventLoopDelayMs.last,
      maximum: summary.eventLoopDelayMs.maximum,
    },
    cacheTotals: {
      parsedEntries: summary.cacheTotals.parsedEntries,
      parsedReferences: summary.cacheTotals.parsedReferences,
      preparedEntries: summary.cacheTotals.preparedEntries,
      preparedReferences: summary.cacheTotals.preparedReferences,
    },
    models: summary.models.map((model, index) =>
      projectModel(model, index + 1),
    ),
  };
}

function modelSignature(model) {
  return [
    model.identityHash,
    model.active,
    model.requiredForReadiness,
    model.reloadGeneration,
    model.generationState,
    model.loadState,
    model.pendingStage,
    model.lastTransitionName,
    model.lastTransitionAtMs,
    model.cache.delivery,
    model.cache.parsedAcquisition,
    model.cache.preparedAcquisition,
    entryState(model.cache.selectedEntry),
    entryState(model.cache.parsedEntry),
    entryState(model.cache.preparedEntry),
  ].join(":");
}

function modelCheckpoints(model) {
  const stage = safeCheckpointValue(model.pendingStage ?? model.loadState);
  const transition = safeCheckpointValue(model.lastTransitionName);
  const at = model.stageAtMs;
  const cache = model.cache;
  return [
    `model-${model.ordinal}-g${model.reloadGeneration}-${model.loadState}-${stage}` +
      `-last-${transition}-at-${model.lastTransitionAtMs}`,
    `model-${model.ordinal}-cache-${cache.delivery}` +
      `-parsed-${safeCheckpointValue(cache.parsedAcquisition)}` +
      `-prepared-${safeCheckpointValue(cache.preparedAcquisition)}` +
      `-selected-${entryState(cache.selectedEntry)}`,
    `model-${model.ordinal}-time-request-${safeCheckpointValue(at.requestStarted)}` +
      `-response-${safeCheckpointValue(at.responseCompleted)}` +
      `-parse-${safeCheckpointValue(at.parseCompleted)}` +
      `-normalized-${safeCheckpointValue(at.normalizationCompleted)}`,
    `model-${model.ordinal}-time-materials-${safeCheckpointValue(at.materialsCompleted)}` +
      `-bounds-${safeCheckpointValue(at.boundsCompleted)}` +
      `-attached-${safeCheckpointValue(at.sceneAttached)}` +
      `-ready-${safeCheckpointValue(at.ready)}`,
  ];
}

export function createRuntimeSmokeReadinessObservation({
  phaseName,
  snapshot,
  responseTotal,
  responseRequired,
  requestTotal,
  browserErrorCount,
}) {
  if (!SAFE_ID.test(phaseName)) {
    throw new Error("Runtime-smoke readiness phase name is unsafe");
  }
  const summary = projectSummary(snapshot?.safeReadinessSummary);
  for (const value of [
    responseTotal,
    responseRequired,
    requestTotal,
    browserErrorCount,
  ]) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("Runtime-smoke readiness network count is invalid");
    }
  }
  const counts = summary.models.reduce(
    (result, model) => {
      result[model.loadState] += 1;
      return result;
    },
    { loading: 0, ready: 0, error: 0, cancelled: 0 },
  );
  const signature = [
    summary.reloadGeneration,
    summary.activeSetHash,
    responseTotal,
    requestTotal,
    browserErrorCount,
    ...summary.models.map(modelSignature),
  ].join("|");
  const aggregateCheckpoints = [
    `models-loading-${counts.loading}-ready-${counts.ready}` +
      `-error-${counts.error}-responses-${responseTotal}` +
      `-required-${responseRequired}-outstanding-${Math.max(0, requestTotal - responseTotal)}`,
    `browser-errors-${browserErrorCount}`,
    `registry-g${summary.reloadGeneration}-active-${summary.activeRequiredCount}` +
      `-included-${summary.includedModelCount}-omitted-${summary.omittedModelCount}` +
      `-version-${summary.registryVersion}`,
    `event-loop-delay-${summary.eventLoopDelayMs.last}` +
      `-maximum-${summary.eventLoopDelayMs.maximum}`,
  ];
  const modelCheckpointGroups = summary.models.map((model) => ({
    ordinal: model.ordinal,
    signature: modelSignature(model),
    checkpoints: modelCheckpoints(model),
  }));
  const checkpoints = [
    ...aggregateCheckpoints,
    ...modelCheckpointGroups.flatMap((group) => group.checkpoints),
  ];
  if (checkpoints.some((name) => !SAFE_ID.test(name))) {
    throw new Error("Runtime-smoke readiness checkpoint is unsafe");
  }
  return {
    signature,
    checkpoints,
    aggregateCheckpoints,
    modelCheckpointGroups,
    diagnostic: {
      schema: "interior-ai.runtime-smoke-readiness-observation.v1",
      phaseName,
      responseTotal,
      responseRequired,
      requestTotal,
      browserErrorCount,
      safeReadinessSummary: summary,
    },
  };
}
