import type { snapshotGLBResourceCaches } from "./glbModelResources";
import type { GLBRequiredModelSnapshot } from "./glbRequiredSnapshot";
import type {
  GLBModelCacheAcquisitionStatus,
  GLBModelCacheStatus,
  GLBModelLoadState,
  GLBModelPendingStage,
  GLBModelTransitionName,
} from "./modelLifecycleTypes";

const MAX_SAFE_READINESS_MODELS = 16;

type GLBSafeCacheEntryState = {
  state: "pending" | "ready";
  referenceCount: number;
} | null;

export type GLBSafeRequiredModelSummary = {
  ordinal: number;
  identityHash: string;
  active: boolean;
  requiredForReadiness: boolean;
  reloadGeneration: number;
  generationState: "current" | "stale";
  loadState: GLBModelLoadState;
  pendingStage: GLBModelPendingStage | null;
  lastTransitionName: GLBModelTransitionName;
  lastTransitionAtMs: number;
  stageAtMs: {
    mounted: number | null;
    requestStarted: number | null;
    responseCompleted: number | null;
    parseCompleted: number | null;
    normalizationStarted: number | null;
    normalizationCompleted: number | null;
    materialsStarted: number | null;
    materialsCompleted: number | null;
    boundsStarted: number | null;
    boundsCompleted: number | null;
    sceneAttached: number | null;
    ready: number | null;
    error: number | null;
    cancelled: number | null;
  };
  cache: {
    delivery: GLBModelCacheStatus;
    parsedAcquisition: GLBModelCacheAcquisitionStatus | null;
    preparedAcquisition: GLBModelCacheAcquisitionStatus | null;
    resourceKind: "parsed" | "prepared" | null;
    selectedEntry: GLBSafeCacheEntryState;
    parsedEntry: GLBSafeCacheEntryState;
    preparedEntry: GLBSafeCacheEntryState;
    acquiredAtMs: number | null;
    releasedAtMs: number | null;
  };
  counters: {
    mounts: number;
    unmounts: number;
    supersededMounts: number;
    ignoredStaleTransitions: number;
  };
};

export type GLBSafeReadinessSummary = {
  schema: "interior-ai.glb-safe-readiness-summary.v1";
  reloadGeneration: number;
  registryVersion: number;
  activeSetHash: string;
  activeRequiredCount: number;
  includedModelCount: number;
  omittedModelCount: number;
  eventLoopDelayMs: { last: number; maximum: number };
  cacheTotals: {
    parsedEntries: number;
    parsedReferences: number;
    preparedEntries: number;
    preparedReferences: number;
  };
  models: GLBSafeRequiredModelSummary[];
};

function boundedMs(value: number | null | undefined) {
  return value === null || value === undefined || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.round(value));
}

function safeIdentityHash(values: string[]) {
  let hash = 0x811c9dc5;
  for (const value of values) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function safeEntry(
  entry: GLBRequiredModelSnapshot["cacheEntry"],
): GLBSafeCacheEntryState {
  return entry
    ? { state: entry.state, referenceCount: entry.referenceCount }
    : null;
}

function safeRequiredModelSummary(
  model: GLBRequiredModelSnapshot,
  ordinal: number,
): GLBSafeRequiredModelSummary {
  const at = (transition: GLBModelTransitionName) =>
    boundedMs(model.stageTimings[transition]?.atMs);
  return {
    ordinal,
    identityHash: safeIdentityHash([model.key]),
    active: model.active,
    requiredForReadiness: model.requiredForReadiness,
    reloadGeneration: model.reloadGeneration,
    generationState: model.generationState,
    loadState: model.loadState,
    pendingStage: model.pendingStage,
    lastTransitionName: model.lastTransitionName,
    lastTransitionAtMs: boundedMs(model.lastTransitionAtMs) ?? 0,
    stageAtMs: {
      mounted: at("mounted"),
      requestStarted: at("request-started"),
      responseCompleted: at("response-complete"),
      parseCompleted: at("parse-complete"),
      normalizationStarted: at("normalization-started"),
      normalizationCompleted: at("normalization-complete"),
      materialsStarted: at("materials-started"),
      materialsCompleted: at("materials-complete"),
      boundsStarted: at("bounds-started"),
      boundsCompleted: at("bounds-complete"),
      sceneAttached: at("scene-attached"),
      ready: at("ready"),
      error: at("error"),
      cancelled: at("cancelled"),
    },
    cache: {
      delivery: model.cacheStatus,
      parsedAcquisition: model.parsedCacheStatus,
      preparedAcquisition: model.preparedCacheStatus,
      resourceKind: model.resourceKind,
      selectedEntry: safeEntry(model.cacheEntry),
      parsedEntry: safeEntry(model.parsedCacheEntry),
      preparedEntry: safeEntry(model.preparedCacheEntry),
      acquiredAtMs: boundedMs(model.resourceAcquiredAtMs),
      releasedAtMs: boundedMs(model.resourceReleasedAtMs),
    },
    counters: {
      mounts: model.mountCount,
      unmounts: model.unmountCount,
      supersededMounts: model.supersededMountCount,
      ignoredStaleTransitions: model.ignoredStaleTransitionCount,
    },
  };
}

export function createGLBSafeReadinessSummary({
  activeRequiredModels,
  caches,
  eventLoopProbe,
  registryVersion,
  reloadGeneration,
}: {
  activeRequiredModels: GLBRequiredModelSnapshot[];
  caches: ReturnType<typeof snapshotGLBResourceCaches>;
  eventLoopProbe: { lastDelayMs: number; maximumDelayMs: number };
  registryVersion: number;
  reloadGeneration: number;
}): GLBSafeReadinessSummary {
  const included = activeRequiredModels.slice(0, MAX_SAFE_READINESS_MODELS);
  return {
    schema: "interior-ai.glb-safe-readiness-summary.v1",
    reloadGeneration,
    registryVersion,
    activeSetHash: safeIdentityHash(
      activeRequiredModels.map((model) => model.key).sort(),
    ),
    activeRequiredCount: activeRequiredModels.length,
    includedModelCount: included.length,
    omittedModelCount: activeRequiredModels.length - included.length,
    eventLoopDelayMs: {
      last: boundedMs(eventLoopProbe.lastDelayMs) ?? 0,
      maximum: boundedMs(eventLoopProbe.maximumDelayMs) ?? 0,
    },
    cacheTotals: {
      parsedEntries: caches.parsed.entryCount,
      parsedReferences: caches.parsed.activeReferenceCount,
      preparedEntries: caches.prepared.entryCount,
      preparedReferences: caches.prepared.activeReferenceCount,
    },
    models: included.map((model, index) =>
      safeRequiredModelSummary(model, index + 1),
    ),
  };
}
