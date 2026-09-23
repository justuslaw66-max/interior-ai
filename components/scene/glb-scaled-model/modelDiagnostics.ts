import type { GLBLocalRenderBoundsObservation } from "./localRenderBounds";
import { createModelDiagnosticSnapshot } from "./createModelDiagnosticSnapshot";
import {
  bumpDiagnosticRegistryVersion,
  getDiagnosticStore,
  getReloadGeneration,
  markDiagnosticTransition,
  nextMountInstanceId,
  transitionTimestampMs,
} from "./modelDiagnosticRuntime";
import type {
  GLBModelCacheStatus,
  GLBModelCacheAcquisitionStatus,
  GLBModelDiagnosticSnapshot,
  GLBModelLifecycleHandle,
  GLBModelLoadState,
  GLBModelMountMetadata,
  GLBModelPipelineStage,
  GLBModelTerminalErrorCategory,
} from "./modelLifecycleTypes";

export type * from "./modelLifecycleTypes";
export { evaluateRequiredGLBModelReadiness } from "./modelReadiness";

export const GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD = 6;
const MAX_INACTIVE_GLB_DIAGNOSTICS = 128;

let disabledDiagnosticsMountSequence = 0;

function currentDiagnostic(handle: GLBModelLifecycleHandle) {
  const store = getDiagnosticStore();
  if (!store) return { diagnosticsEnabled: false, diagnostic: null };
  const diagnostic = store[handle.key] ?? null;
  if (
    !diagnostic ||
    diagnostic.mountInstanceId !== handle.mountInstanceId ||
    diagnostic.reloadGeneration !== handle.reloadGeneration
  ) {
    if (diagnostic) {
      diagnostic.ignoredStaleTransitionCount += 1;
      bumpDiagnosticRegistryVersion();
    }
    return { diagnosticsEnabled: true, diagnostic: null };
  }
  return { diagnosticsEnabled: true, diagnostic };
}

function hasTerminalLoadState(diagnostic: GLBModelDiagnosticSnapshot) {
  return diagnostic.loadState !== "loading";
}

function hasCompleteReadyPipeline(diagnostic: GLBModelDiagnosticSnapshot) {
  return (
    diagnostic.requestStarted &&
    diagnostic.responseCompleted &&
    diagnostic.parseDecodeState === "complete" &&
    diagnostic.normalizationState === "complete" &&
    diagnostic.materialState === "complete" &&
    diagnostic.boundsState === "complete" &&
    diagnostic.sceneAttachmentState === "complete"
  );
}

function pruneInactiveDiagnostics(
  store: Record<string, GLBModelDiagnosticSnapshot>
) {
  const inactive = Object.values(store)
    .filter((diagnostic) => !diagnostic.active)
    .sort((left, right) => left.lastTransitionAtMs - right.lastTransitionAtMs);
  for (const diagnostic of inactive.slice(0, -MAX_INACTIVE_GLB_DIAGNOSTICS)) {
    delete store[diagnostic.key];
    bumpDiagnosticRegistryVersion();
  }
}

export function recordGLBModelMount(
  key: string,
  url: string,
  metadata: GLBModelMountMetadata = {
    sceneItemId: key,
    productId: null,
    variantId: null,
    readinessKey: null,
    requiredForReadiness: true,
  }
): GLBModelLifecycleHandle {
  const store = getDiagnosticStore();
  if (!store) {
    disabledDiagnosticsMountSequence += 1;
    return {
      key,
      url,
      mountInstanceId: `disabled:m${disabledDiagnosticsMountSequence}`,
      reloadGeneration: 0,
      terminalState: null,
    };
  }

  const reloadGeneration = getReloadGeneration(globalThis);
  const mountInstanceId = nextMountInstanceId(reloadGeneration);
  const previous = store[key];
  const previousWasActive = Boolean(previous?.active);
  if (previousWasActive && previous) {
    previous.active = false;
    previous.loadState = "cancelled";
    previous.pendingStage = "cancelled";
    previous.cancellationState = "superseded";
    markDiagnosticTransition(previous, "cancelled");
  }

  store[key] = createModelDiagnosticSnapshot({
    key,
    url,
    metadata,
    previous,
    mountInstanceId,
    reloadGeneration,
    previousWasActive,
    transitionAtMs: transitionTimestampMs(),
  });
  bumpDiagnosticRegistryVersion();

  return { key, url, mountInstanceId, reloadGeneration, terminalState: null };
}

export function recordGLBModelUnmount(handle: GLBModelLifecycleHandle) {
  const store = getDiagnosticStore();
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;
  diagnostic.unmountCount += 1;
  diagnostic.active = false;
  diagnostic.selectionOutlineVisible = false;
  diagnostic.loadState = "cancelled";
  diagnostic.pendingStage = "cancelled";
  diagnostic.cancellationState = "unmounted";
  markDiagnosticTransition(diagnostic, "cancelled");
  if (store) pruneInactiveDiagnostics(store);
}

export function recordGLBModelMetadata(
  handle: GLBModelLifecycleHandle | null,
  metadata: GLBModelMountMetadata
) {
  if (!handle) return;
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;
  diagnostic.sceneItemId = metadata.sceneItemId;
  diagnostic.productId = metadata.productId;
  diagnostic.variantId = metadata.variantId;
  diagnostic.readinessKey = metadata.readinessKey;
  diagnostic.requiredForReadiness = metadata.requiredForReadiness;
  markDiagnosticTransition(diagnostic, "metadata-updated");
}

export function recordGLBModelRender(handle: GLBModelLifecycleHandle | null) {
  if (!handle) return;
  const { diagnostic } = currentDiagnostic(handle);
  if (diagnostic) {
    diagnostic.renderCount += 1;
    bumpDiagnosticRegistryVersion();
  }
}

export function recordGLBModelResourceAcquired(
  handle: GLBModelLifecycleHandle,
  resourceKind: "parsed" | "prepared",
  resourceKeyHash: string,
  cacheAcquisition: {
    parsed: GLBModelCacheAcquisitionStatus | null;
    prepared: GLBModelCacheAcquisitionStatus | null;
  },
) {
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;
  diagnostic.resourceKind = resourceKind;
  diagnostic.resourceKeyHash = resourceKeyHash;
  diagnostic.resourceAcquiredAtMs = transitionTimestampMs();
  diagnostic.resourceReleasedAtMs = null;
  diagnostic.parsedCacheStatus = cacheAcquisition.parsed;
  diagnostic.preparedCacheStatus = cacheAcquisition.prepared;
  markDiagnosticTransition(diagnostic, "resource-acquired");
}

export function recordGLBModelParsedCacheStatus(
  handle: GLBModelLifecycleHandle,
  parsedCacheStatus: GLBModelCacheAcquisitionStatus | null,
) {
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;
  diagnostic.parsedCacheStatus = parsedCacheStatus;
  bumpDiagnosticRegistryVersion();
}

export function recordGLBModelResourceReleased(
  handle: GLBModelLifecycleHandle
) {
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;
  diagnostic.resourceReleasedAtMs = transitionTimestampMs();
  markDiagnosticTransition(diagnostic, "resource-released");
}

type PipelineStageRecorder = (
  diagnostic: GLBModelDiagnosticSnapshot,
  options: {
    cacheStatus?: GLBModelCacheStatus;
    atMs?: number;
    eventLoopDelayMs?: number | null;
  }
) => void;
const PIPELINE_STAGE_RECORDERS: Record<
  GLBModelPipelineStage,
  PipelineStageRecorder
> = {
  "request-started": (diagnostic) => {
    diagnostic.requestStarted = true;
    diagnostic.parseDecodeState = "pending";
    diagnostic.pendingStage = "response";
  },
  "response-complete": (diagnostic, options) => {
    diagnostic.requestStarted = true;
    diagnostic.responseCompleted = true;
    diagnostic.cacheStatus = options.cacheStatus ?? diagnostic.cacheStatus;
    diagnostic.parseDecodeState = "pending";
    diagnostic.pendingStage = "parse-decode";
  },
  "parse-complete": (diagnostic) => {
    diagnostic.responseCompleted = true;
    diagnostic.parseDecodeState = "complete";
    diagnostic.normalizationState = "pending";
    diagnostic.pendingStage = "normalization";
  },
  "normalization-started": (diagnostic) => {
    diagnostic.normalizationState = "pending";
    diagnostic.pendingStage = "normalization";
  },
  "normalization-complete": (diagnostic) => {
    diagnostic.normalizationState = "complete";
    diagnostic.pendingStage = "materials";
  },
  "material-cloning-started": () => {},
  "material-cloning-complete": () => {},
  "materials-started": (diagnostic) => {
    diagnostic.materialState = "pending";
    diagnostic.pendingStage = "materials";
  },
  "materials-complete": (diagnostic) => {
    diagnostic.materialState = "complete";
    diagnostic.pendingStage = "bounds";
  },
  "bounds-started": (diagnostic) => {
    diagnostic.boundsState = "pending";
    diagnostic.pendingStage = "bounds";
  },
  "bounds-complete": (diagnostic) => {
    diagnostic.boundsState = "complete";
    diagnostic.pendingStage = "scene-attachment";
  },
  "scene-attached": (diagnostic) => {
    diagnostic.sceneAttachmentState = "complete";
    diagnostic.pendingStage = "ready-commit";
  },
};

export function recordGLBModelPipelineStage(
  handle: GLBModelLifecycleHandle,
  stage: GLBModelPipelineStage,
  options: {
    cacheStatus?: GLBModelCacheStatus;
    atMs?: number;
    eventLoopDelayMs?: number | null;
  } = {}
) {
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;
  if (hasTerminalLoadState(diagnostic)) return;

  PIPELINE_STAGE_RECORDERS[stage](diagnostic, options);
  markDiagnosticTransition(
    diagnostic,
    stage,
    options.atMs,
    options.eventLoopDelayMs,
  );
}

export function recordGLBBoundsObservation(
  handle: GLBModelLifecycleHandle | null,
  observation: GLBLocalRenderBoundsObservation,
  published: boolean
) {
  if (!handle) return;
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;

  if (observation.outcome === "changed") {
    diagnostic.boundsMaterialChangeCount += 1;
  } else if (observation.outcome === "equivalent") {
    diagnostic.boundsEquivalentCount += 1;
  } else if (observation.outcome === "reset") {
    diagnostic.boundsResetCount += 1;
  } else if (observation.outcome === "invalid") {
    diagnostic.boundsInvalidCount += 1;
  }
  if (published) diagnostic.boundsPublicationCount += 1;
  bumpDiagnosticRegistryVersion();
}

export function recordGLBSelectionOutlineVisibility(
  handle: GLBModelLifecycleHandle | null,
  visible: boolean
) {
  if (!handle) return;
  const { diagnostic } = currentDiagnostic(handle);
  if (diagnostic) {
    diagnostic.selectionOutlineVisible = visible;
    bumpDiagnosticRegistryVersion();
  }
}

function markTerminalStage(
  diagnostic: GLBModelDiagnosticSnapshot,
  errorCode: GLBModelTerminalErrorCategory
) {
  switch (errorCode) {
    case "gltf-load-failed":
    case "gltf-loader-import-failed":
    case "gltf-parse-decode-failed":
      diagnostic.parseDecodeState = "error";
      break;
    case "glb-normalization-failed":
      diagnostic.normalizationState = "error";
      break;
    case "glb-material-setup-failed":
      diagnostic.materialState = "error";
      break;
    case "glb-bounds-failed":
    case "glb-empty-bounds":
      diagnostic.boundsState = "error";
      break;
    case "glb-scene-attachment-failed":
      diagnostic.sceneAttachmentState = "error";
      break;
  }
}

function applyDiagnosticLoadState(
  diagnostic: GLBModelDiagnosticSnapshot,
  state: Exclude<GLBModelLoadState, "cancelled">,
  errorCode: GLBModelTerminalErrorCategory | null
) {
  if (hasTerminalLoadState(diagnostic)) return false;
  if (state === "ready" && !hasCompleteReadyPipeline(diagnostic)) return false;
  if (state === "error" && errorCode) {
    diagnostic.loadState = "error";
    diagnostic.terminalErrorCategory = errorCode;
    diagnostic.loadErrorCode = errorCode;
    diagnostic.pendingStage = "terminal-error";
    markTerminalStage(diagnostic, errorCode);
  } else {
    diagnostic.loadState = state;
    diagnostic.terminalErrorCategory = null;
    diagnostic.loadErrorCode = null;
    if (state === "ready") diagnostic.pendingStage = null;
  }
  markDiagnosticTransition(
    diagnostic,
    state === "ready" ? "ready" : state === "error" ? "error" : "loading"
  );
  return true;
}

export function reportGLBModelLoadState(
  handle: GLBModelLifecycleHandle,
  state: Exclude<GLBModelLoadState, "cancelled">,
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void,
  errorCode: GLBModelTerminalErrorCategory | null = null
) {
  if (state === "error" && !errorCode) return false;
  const { diagnosticsEnabled, diagnostic } = currentDiagnostic(handle);
  if (diagnosticsEnabled && !diagnostic) return false;
  if (handle.terminalState) return false;
  if (diagnostic && !applyDiagnosticLoadState(diagnostic, state, errorCode)) {
    return false;
  }
  if (state === "ready" || state === "error") handle.terminalState = state;
  onLoadStateChange?.(state);
  return true;
}

export function recordGLBExcessiveBoundsWarning(
  handle: GLBModelLifecycleHandle | null
) {
  if (!handle) return;
  const { diagnostic } = currentDiagnostic(handle);
  if (diagnostic) {
    diagnostic.excessiveBoundsWarningCount += 1;
    bumpDiagnosticRegistryVersion();
  }
}
