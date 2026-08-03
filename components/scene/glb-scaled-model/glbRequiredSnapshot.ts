import { snapshotGLBResourceCaches } from "./glbModelResources";
import type { GLBResourceCacheMetadataSnapshot } from "./glbResourceCacheMetadata";
import {
  createGLBSafeReadinessSummary,
  type GLBSafeReadinessSummary,
} from "./glbSafeReadinessSummary";
import type {
  GLBModelDiagnosticSnapshot,
  GLBModelStageTiming,
  GLBModelTransitionName,
} from "./modelLifecycleTypes";

export type { GLBSafeReadinessSummary, GLBSafeRequiredModelSummary } from "./glbSafeReadinessSummary";

type RequiredCacheEntryState = {
  state: "pending" | "ready";
  referenceCount: number;
} | null;

type GLBRequiredStageDurations = {
  response: number | null;
  parseDecode: number | null;
  normalization: number | null;
  materialCloning: number | null;
  materialSetup: number | null;
  bounds: number | null;
  sceneAttachment: number | null;
  readyPublication: number | null;
};

export type GLBRequiredModelSnapshot = Pick<
  GLBModelDiagnosticSnapshot,
  | "key"
  | "sceneItemId"
  | "productId"
  | "variantId"
  | "readinessKey"
  | "requiredForReadiness"
  | "urlHash"
  | "mountInstanceId"
  | "reloadGeneration"
  | "active"
  | "mountCount"
  | "unmountCount"
  | "supersededMountCount"
  | "ignoredStaleTransitionCount"
  | "renderCount"
  | "boundsMaterialChangeCount"
  | "boundsPublicationCount"
  | "boundsInvalidCount"
  | "excessiveBoundsWarningCount"
  | "selectionOutlineVisible"
  | "loadState"
  | "pendingStage"
  | "requestStarted"
  | "responseCompleted"
  | "cacheStatus"
  | "parsedCacheStatus"
  | "preparedCacheStatus"
  | "parseDecodeState"
  | "normalizationState"
  | "materialState"
  | "boundsState"
  | "sceneAttachmentState"
  | "cancellationState"
  | "resourceKind"
  | "resourceKeyHash"
  | "resourceAcquiredAtMs"
  | "resourceReleasedAtMs"
  | "lastTransitionName"
  | "lastTransitionAtMs"
  | "terminalErrorCategory"
  | "loadErrorCode"
> & {
  generationState: "current" | "stale";
  cacheEntry: RequiredCacheEntryState;
  parsedCacheEntry: RequiredCacheEntryState;
  preparedCacheEntry: RequiredCacheEntryState;
  stageTimings: Partial<Record<GLBModelTransitionName, GLBModelStageTiming>>;
  stageDurationsMs: GLBRequiredStageDurations;
  longestSynchronousStage: {
    category: keyof Pick<
      GLBRequiredStageDurations,
      | "parseDecode"
      | "normalization"
      | "materialCloning"
      | "materialSetup"
      | "bounds"
      | "readyPublication"
    >;
    durationMs: number;
  } | null;
};

export type GLBRequiredSnapshot = {
  schema: "interior-ai.glb-required-snapshot.v1";
  capturedAtMs: number;
  computationDurationMs: number;
  reloadGeneration: number;
  registryVersionStart: number;
  registryVersionEnd: number;
  registryCoherent: boolean;
  registryEntryCount: number;
  activeRequiredModelIds: string[];
  activeRequiredCount: number;
  eventLoopProbe: { lastDelayMs: number; maximumDelayMs: number };
  safeReadinessSummary: GLBSafeReadinessSummary;
  models: GLBRequiredModelSnapshot[];
  caches: ReturnType<typeof snapshotGLBResourceCaches>;
  consistency: {
    cacheSnapshotsCoherent: boolean;
    cacheReferenceTotalsAgree: boolean;
    cacheOwnershipMatchesLifecycle: boolean;
    referenceCountsNonNegative: boolean;
    zeroReferenceRetentionWithinPolicy: boolean;
    activeRequiredModelsAreCurrent: boolean;
    activeRequiredModelsConverged: boolean;
  };
};

function nowMs() {
  return typeof performance !== "undefined" && Number.isFinite(performance.now())
    ? Math.max(0, performance.now())
    : Date.now();
}

function cacheEntryForHash(
  resourceHash: string | null,
  cache: GLBResourceCacheMetadataSnapshot
): RequiredCacheEntryState {
  if (!resourceHash) return null;
  const entry = cache.entries.find(
    (candidate) => candidate.resourceHash === resourceHash
  );
  return entry
    ? { state: entry.state, referenceCount: entry.referenceCount }
    : null;
}

function cacheReferenceTotalAgrees(cache: GLBResourceCacheMetadataSnapshot) {
  return (
    cache.activeReferenceCount ===
    cache.entries.reduce((total, entry) => total + entry.referenceCount, 0)
  );
}

function zeroReferenceRetentionWithinPolicy(
  cache: GLBResourceCacheMetadataSnapshot
) {
  return (
    cache.entryCount <= cache.maximumEntries &&
    cache.entries.every(
      (entry) => entry.referenceCount !== 0 || entry.retainedAfterRelease
    )
  );
}

function stageDuration(
  diagnostic: GLBModelDiagnosticSnapshot,
  started: GLBModelTransitionName,
  completed: GLBModelTransitionName
) {
  const startedAtMs = diagnostic.stageTimings[started]?.atMs;
  const completedAtMs = diagnostic.stageTimings[completed]?.atMs;
  return startedAtMs === undefined || completedAtMs === undefined
    ? null
    : Math.max(0, completedAtMs - startedAtMs);
}

function stageDurations(
  diagnostic: GLBModelDiagnosticSnapshot
): GLBRequiredStageDurations {
  const attachmentPrerequisiteAtMs = Math.max(
    diagnostic.stageTimings["bounds-complete"]?.atMs ?? 0,
    diagnostic.stageTimings["materials-complete"]?.atMs ?? 0,
    diagnostic.stageTimings["normalization-complete"]?.atMs ?? 0,
  );
  const sceneAttachedAtMs = diagnostic.stageTimings["scene-attached"]?.atMs;
  return {
    response: stageDuration(diagnostic, "request-started", "response-complete"),
    parseDecode: stageDuration(diagnostic, "response-complete", "parse-complete"),
    normalization: stageDuration(
      diagnostic,
      "normalization-started",
      "normalization-complete"
    ),
    materialCloning: stageDuration(
      diagnostic,
      "material-cloning-started",
      "material-cloning-complete"
    ),
    materialSetup: stageDuration(
      diagnostic,
      "materials-started",
      "materials-complete"
    ),
    bounds: stageDuration(diagnostic, "bounds-started", "bounds-complete"),
    sceneAttachment:
      attachmentPrerequisiteAtMs > 0 && sceneAttachedAtMs !== undefined
        ? Math.max(0, sceneAttachedAtMs - attachmentPrerequisiteAtMs)
        : null,
    readyPublication: stageDuration(diagnostic, "scene-attached", "ready"),
  };
}

function longestSynchronousStage(durations: GLBRequiredStageDurations) {
  const synchronousCategories = [
    "parseDecode",
    "normalization",
    "materialCloning",
    "materialSetup",
    "bounds",
    "readyPublication",
  ] as const;
  const candidates = synchronousCategories.flatMap((category) => {
    const duration = durations[category];
    return duration === null ? [] : [[category, duration] as const];
  });
  const longest = candidates.sort((left, right) => right[1] - left[1])[0];
  return longest ? { category: longest[0], durationMs: longest[1] } : null;
}

function modelIdentityFields(diagnostic: GLBModelDiagnosticSnapshot) {
  return {
    key: diagnostic.key,
    sceneItemId: diagnostic.sceneItemId,
    productId: diagnostic.productId,
    variantId: diagnostic.variantId,
    readinessKey: diagnostic.readinessKey,
    requiredForReadiness: diagnostic.requiredForReadiness,
    urlHash: diagnostic.urlHash,
    mountInstanceId: diagnostic.mountInstanceId,
    reloadGeneration: diagnostic.reloadGeneration,
    active: diagnostic.active,
  };
}

function modelCounterFields(diagnostic: GLBModelDiagnosticSnapshot) {
  return {
    mountCount: diagnostic.mountCount,
    unmountCount: diagnostic.unmountCount,
    supersededMountCount: diagnostic.supersededMountCount,
    ignoredStaleTransitionCount: diagnostic.ignoredStaleTransitionCount,
    renderCount: diagnostic.renderCount,
    boundsMaterialChangeCount: diagnostic.boundsMaterialChangeCount,
    boundsPublicationCount: diagnostic.boundsPublicationCount,
    boundsInvalidCount: diagnostic.boundsInvalidCount,
    excessiveBoundsWarningCount: diagnostic.excessiveBoundsWarningCount,
    selectionOutlineVisible: diagnostic.selectionOutlineVisible,
  };
}

function modelLifecycleFields(diagnostic: GLBModelDiagnosticSnapshot) {
  return {
    loadState: diagnostic.loadState,
    pendingStage: diagnostic.pendingStage,
    requestStarted: diagnostic.requestStarted,
    responseCompleted: diagnostic.responseCompleted,
    cacheStatus: diagnostic.cacheStatus,
    parsedCacheStatus: diagnostic.parsedCacheStatus,
    preparedCacheStatus: diagnostic.preparedCacheStatus,
    parseDecodeState: diagnostic.parseDecodeState,
    normalizationState: diagnostic.normalizationState,
    materialState: diagnostic.materialState,
    boundsState: diagnostic.boundsState,
    sceneAttachmentState: diagnostic.sceneAttachmentState,
    cancellationState: diagnostic.cancellationState,
    resourceKind: diagnostic.resourceKind,
    resourceKeyHash: diagnostic.resourceKeyHash,
    resourceAcquiredAtMs: diagnostic.resourceAcquiredAtMs,
    resourceReleasedAtMs: diagnostic.resourceReleasedAtMs,
    lastTransitionName: diagnostic.lastTransitionName,
    lastTransitionAtMs: diagnostic.lastTransitionAtMs,
    terminalErrorCategory: diagnostic.terminalErrorCategory,
    loadErrorCode: diagnostic.loadErrorCode,
  };
}

function requiredModelSnapshot(
  diagnostic: GLBModelDiagnosticSnapshot,
  reloadGeneration: number,
  caches: ReturnType<typeof snapshotGLBResourceCaches>
): GLBRequiredModelSnapshot {
  const selectedCache =
    diagnostic.resourceKind === "prepared" ? caches.prepared : caches.parsed;
  const durations = stageDurations(diagnostic);
  return {
    ...modelIdentityFields(diagnostic),
    ...modelCounterFields(diagnostic),
    ...modelLifecycleFields(diagnostic),
    generationState:
      diagnostic.active && diagnostic.reloadGeneration === reloadGeneration
        ? "current"
        : "stale",
    cacheEntry: cacheEntryForHash(diagnostic.resourceKeyHash, selectedCache),
    parsedCacheEntry: cacheEntryForHash(diagnostic.urlHash, caches.parsed),
    preparedCacheEntry:
      diagnostic.resourceKind === "prepared"
        ? cacheEntryForHash(diagnostic.resourceKeyHash, caches.prepared)
        : null,
    stageTimings: Object.fromEntries(
      Object.entries(diagnostic.stageTimings).map(([name, timing]) => [
        name,
        timing ? { ...timing } : timing,
      ]),
    ),
    stageDurationsMs: durations,
    longestSynchronousStage: longestSynchronousStage(durations),
  };
}

function snapshotConsistency(
  models: GLBRequiredModelSnapshot[],
  caches: ReturnType<typeof snapshotGLBResourceCaches>
) {
  const activeRequiredModels = models.filter(
    (model) => model.active && model.requiredForReadiness
  );
  const activeModels = models.filter((model) => model.active);
  const activePreparedModels = activeModels.filter(
    (model) =>
      model.resourceKind === "prepared" && model.resourceReleasedAtMs === null
  ).length;
  const activeParsedModels = activeModels.filter(
    (model) =>
      model.resourceKind === "parsed" && model.resourceReleasedAtMs === null
  ).length;
  const entries = [...caches.parsed.entries, ...caches.prepared.entries];
  return {
    cacheSnapshotsCoherent: caches.parsed.coherent && caches.prepared.coherent,
    cacheReferenceTotalsAgree:
      cacheReferenceTotalAgrees(caches.parsed) &&
      cacheReferenceTotalAgrees(caches.prepared),
    cacheOwnershipMatchesLifecycle:
      caches.prepared.activeReferenceCount === activePreparedModels &&
      caches.parsed.activeReferenceCount ===
        activeParsedModels + caches.prepared.entryCount,
    referenceCountsNonNegative: entries.every(
      (entry) => entry.referenceCount >= 0
    ),
    zeroReferenceRetentionWithinPolicy:
      zeroReferenceRetentionWithinPolicy(caches.parsed) &&
      zeroReferenceRetentionWithinPolicy(caches.prepared),
    activeRequiredModelsAreCurrent: activeRequiredModels.every(
      (model) => model.generationState === "current"
    ),
    activeRequiredModelsConverged: activeRequiredModels.every(
      (model) => model.loadState === "ready" || model.loadState === "error"
    ),
  };
}

export function createGLBRequiredSnapshot({
  registry,
  reloadGeneration,
  readRegistryVersion,
  eventLoopProbe,
}: {
  registry: Record<string, GLBModelDiagnosticSnapshot>;
  reloadGeneration: number;
  readRegistryVersion: () => number;
  eventLoopProbe: { lastDelayMs: number; maximumDelayMs: number };
}): GLBRequiredSnapshot {
  const computationStartedAtMs = nowMs();
  const registryVersionStart = readRegistryVersion();
  const caches = snapshotGLBResourceCaches();
  const models = Object.values(registry)
    .sort((left, right) => left.key.localeCompare(right.key))
    .map((diagnostic) =>
      requiredModelSnapshot(diagnostic, reloadGeneration, caches)
    );
  const registryVersionEnd = readRegistryVersion();
  const activeRequiredModels = models.filter(
    (model) => model.active && model.requiredForReadiness
  );
  return {
    schema: "interior-ai.glb-required-snapshot.v1",
    capturedAtMs: Math.round(computationStartedAtMs),
    computationDurationMs: Math.max(0, nowMs() - computationStartedAtMs),
    reloadGeneration,
    registryVersionStart,
    registryVersionEnd,
    registryCoherent: registryVersionStart === registryVersionEnd,
    registryEntryCount: models.length,
    activeRequiredModelIds: activeRequiredModels.map((model) => model.key),
    activeRequiredCount: activeRequiredModels.length,
    eventLoopProbe: { ...eventLoopProbe },
    safeReadinessSummary: createGLBSafeReadinessSummary({
      activeRequiredModels,
      caches,
      eventLoopProbe,
      registryVersion: registryVersionEnd,
      reloadGeneration,
    }),
    models,
    caches,
    consistency: snapshotConsistency(models, caches),
  };
}
