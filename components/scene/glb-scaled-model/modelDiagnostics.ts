import type { GLBLocalRenderBoundsObservation } from "./localRenderBounds";
import { createModelDiagnosticSnapshot } from "./createModelDiagnosticSnapshot";
import type {
  GLBModelCacheStatus,
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

type GLBDiagnosticsGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
  __INTERIOR_AI_GLB_DIAGNOSTICS__?: Record<
    string,
    GLBModelDiagnosticSnapshot
  >;
  __INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__?: number;
  __INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__?: number;
};

const RELOAD_GENERATION_SESSION_KEY =
  "interior-ai:glb-diagnostics-reload-generation";
let disabledDiagnosticsMountSequence = 0;

function transitionTimestampMs() {
  return typeof performance !== "undefined" &&
    Number.isFinite(performance.now())
    ? Math.max(0, Math.round(performance.now()))
    : 0;
}

function getReloadGeneration(diagnosticsGlobal: GLBDiagnosticsGlobal) {
  if (
    Number.isInteger(
      diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__
    )
  ) {
    return diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__ as number;
  }

  let generation = 1;
  try {
    const previous = Number.parseInt(
      window.sessionStorage.getItem(RELOAD_GENERATION_SESSION_KEY) ?? "0",
      10
    );
    generation = Number.isInteger(previous) && previous >= 0 ? previous + 1 : 1;
    window.sessionStorage.setItem(
      RELOAD_GENERATION_SESSION_KEY,
      String(generation)
    );
  } catch {
    // Sandboxed documents can deny session storage. The per-document default
    // still prevents identities from crossing a JavaScript global boundary.
  }
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_GENERATION__ = generation;
  return generation;
}

function getDiagnosticStore() {
  const diagnosticsGlobal = globalThis as GLBDiagnosticsGlobal;
  const enabled =
    process.env.NODE_ENV !== "production" ||
    diagnosticsGlobal.__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ === true;
  if (!enabled || typeof window === "undefined") return null;

  getReloadGeneration(diagnosticsGlobal);
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ??= {};
  return diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__;
}

function nextMountInstanceId(
  diagnosticsGlobal: GLBDiagnosticsGlobal,
  reloadGeneration: number
) {
  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__ =
    (diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__ ?? 0) + 1;
  return `g${reloadGeneration}:m${diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS_MOUNT_SEQUENCE__}`;
}

function currentDiagnostic(handle: GLBModelLifecycleHandle) {
  const store = getDiagnosticStore();
  if (!store) return { diagnosticsEnabled: false, diagnostic: null };
  const diagnostic = store[handle.key] ?? null;
  if (
    !diagnostic ||
    diagnostic.mountInstanceId !== handle.mountInstanceId ||
    diagnostic.reloadGeneration !== handle.reloadGeneration
  ) {
    if (diagnostic) diagnostic.ignoredStaleTransitionCount += 1;
    return { diagnosticsEnabled: true, diagnostic: null };
  }
  return { diagnosticsEnabled: true, diagnostic };
}

function markTransition(diagnostic: GLBModelDiagnosticSnapshot) {
  diagnostic.lastTransitionAtMs = transitionTimestampMs();
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
  const diagnosticsGlobal = globalThis as GLBDiagnosticsGlobal;
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

  const reloadGeneration = getReloadGeneration(diagnosticsGlobal);
  const mountInstanceId = nextMountInstanceId(
    diagnosticsGlobal,
    reloadGeneration
  );
  const previous = store[key];
  const previousWasActive = Boolean(previous?.active);
  if (previousWasActive && previous) {
    previous.active = false;
    previous.loadState = "cancelled";
    previous.pendingStage = "cancelled";
    previous.cancellationState = "superseded";
    markTransition(previous);
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
  markTransition(diagnostic);
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
}

export function recordGLBModelRender(handle: GLBModelLifecycleHandle | null) {
  if (!handle) return;
  const { diagnostic } = currentDiagnostic(handle);
  if (diagnostic) diagnostic.renderCount += 1;
}

type PipelineStageRecorder = (
  diagnostic: GLBModelDiagnosticSnapshot,
  options: { cacheStatus?: GLBModelCacheStatus }
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
  options: { cacheStatus?: GLBModelCacheStatus } = {}
) {
  const { diagnostic } = currentDiagnostic(handle);
  if (!diagnostic) return;
  if (hasTerminalLoadState(diagnostic)) return;

  PIPELINE_STAGE_RECORDERS[stage](diagnostic, options);
  markTransition(diagnostic);
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
}

export function recordGLBSelectionOutlineVisibility(
  handle: GLBModelLifecycleHandle | null,
  visible: boolean
) {
  if (!handle) return;
  const { diagnostic } = currentDiagnostic(handle);
  if (diagnostic) diagnostic.selectionOutlineVisible = visible;
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
  markTransition(diagnostic);
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
  if (diagnostic) diagnostic.excessiveBoundsWarningCount += 1;
}
