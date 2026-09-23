import type {
  GLBModelDiagnosticSnapshot,
  GLBModelMountMetadata,
} from "./modelLifecycleTypes";

type DiagnosticCounter =
  | "mountCount"
  | "unmountCount"
  | "supersededMountCount"
  | "ignoredStaleTransitionCount"
  | "renderCount"
  | "boundsMaterialChangeCount"
  | "boundsEquivalentCount"
  | "boundsResetCount"
  | "boundsInvalidCount"
  | "boundsPublicationCount"
  | "excessiveBoundsWarningCount";

function priorCount(
  previous: GLBModelDiagnosticSnapshot | undefined,
  counter: DiagnosticCounter
) {
  return previous?.[counter] ?? 0;
}

export function safeGLBResourceHash(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function initialLifecycleTiming(transitionAtMs: number) {
  return {
    lastTransitionName: "mounted" as const,
    lastTransitionAtMs: transitionAtMs,
    stageTimings: {
      mounted: { atMs: transitionAtMs, eventLoopDelayMs: null },
    },
  };
}

function initialResourceState() {
  return {
    cacheStatus: "unknown" as const,
    parsedCacheStatus: null,
    preparedCacheStatus: null,
    resourceKind: null,
    resourceKeyHash: null,
    resourceAcquiredAtMs: null,
    resourceReleasedAtMs: null,
  };
}

export function createModelDiagnosticSnapshot({
  key,
  url,
  metadata,
  previous,
  mountInstanceId,
  reloadGeneration,
  previousWasActive,
  transitionAtMs,
}: {
  key: string;
  url: string;
  metadata: GLBModelMountMetadata;
  previous: GLBModelDiagnosticSnapshot | undefined;
  mountInstanceId: string;
  reloadGeneration: number;
  previousWasActive: boolean;
  transitionAtMs: number;
}): GLBModelDiagnosticSnapshot {
  return {
    key,
    ...metadata,
    url,
    urlHash: safeGLBResourceHash(url),
    mountInstanceId,
    reloadGeneration,
    active: true,
    mountCount: priorCount(previous, "mountCount") + 1,
    unmountCount: priorCount(previous, "unmountCount"),
    supersededMountCount:
      priorCount(previous, "supersededMountCount") + Number(previousWasActive),
    ignoredStaleTransitionCount: priorCount(previous, "ignoredStaleTransitionCount"),
    renderCount: priorCount(previous, "renderCount"),
    boundsMaterialChangeCount: priorCount(previous, "boundsMaterialChangeCount"),
    boundsEquivalentCount: priorCount(previous, "boundsEquivalentCount"),
    boundsResetCount: priorCount(previous, "boundsResetCount"),
    boundsInvalidCount: priorCount(previous, "boundsInvalidCount"),
    boundsPublicationCount: priorCount(previous, "boundsPublicationCount"),
    excessiveBoundsWarningCount: priorCount(previous, "excessiveBoundsWarningCount"),
    selectionOutlineVisible: false,
    loadState: "loading",
    pendingStage: "request-start",
    requestStarted: false,
    responseCompleted: false,
    ...initialResourceState(),
    parseDecodeState: "not-started",
    normalizationState: "not-started",
    materialState: "not-started",
    boundsState: "not-started",
    sceneAttachmentState: "not-started",
    cancellationState: "active",
    ...initialLifecycleTiming(transitionAtMs),
    terminalErrorCategory: null,
    loadErrorCode: null,
  };
}
