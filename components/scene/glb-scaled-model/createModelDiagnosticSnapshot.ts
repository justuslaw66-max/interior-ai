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

function safeUrlHash(url: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < url.length; index += 1) {
    hash ^= url.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
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
    urlHash: safeUrlHash(url),
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
    cacheStatus: "unknown",
    parseDecodeState: "not-started",
    normalizationState: "not-started",
    materialState: "not-started",
    boundsState: "not-started",
    sceneAttachmentState: "not-started",
    cancellationState: "active",
    lastTransitionAtMs: transitionAtMs,
    terminalErrorCategory: null,
    loadErrorCode: null,
  };
}
