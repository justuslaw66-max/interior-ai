import type { GLBLocalRenderBoundsObservation } from "./localRenderBounds";

export const GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD = 6;

export type GLBModelDiagnosticSnapshot = {
  key: string;
  url: string;
  mountCount: number;
  unmountCount: number;
  renderCount: number;
  boundsMaterialChangeCount: number;
  boundsEquivalentCount: number;
  boundsResetCount: number;
  boundsInvalidCount: number;
  boundsPublicationCount: number;
  excessiveBoundsWarningCount: number;
  selectionOutlineVisible: boolean;
  loadState: "loading" | "ready" | "error";
  loadErrorCode: "gltf-load-failed" | "gltf-loader-import-failed" | null;
};

type GLBDiagnosticsGlobal = typeof globalThis & {
  __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
  __INTERIOR_AI_GLB_DIAGNOSTICS__?: Record<
    string,
    GLBModelDiagnosticSnapshot
  >;
};

function getDiagnosticStore() {
  const diagnosticsGlobal = globalThis as GLBDiagnosticsGlobal;
  const enabled =
    process.env.NODE_ENV !== "production" ||
    diagnosticsGlobal.__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ === true;
  if (!enabled || typeof window === "undefined") return null;

  diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__ ??= {};
  return diagnosticsGlobal.__INTERIOR_AI_GLB_DIAGNOSTICS__;
}

function getDiagnostic(key: string, url: string) {
  const store = getDiagnosticStore();
  if (!store) return null;
  store[key] ??= {
    key,
    url,
    mountCount: 0,
    unmountCount: 0,
    renderCount: 0,
    boundsMaterialChangeCount: 0,
    boundsEquivalentCount: 0,
    boundsResetCount: 0,
    boundsInvalidCount: 0,
    boundsPublicationCount: 0,
    excessiveBoundsWarningCount: 0,
    selectionOutlineVisible: false,
    loadState: "loading",
    loadErrorCode: null,
  };
  store[key].url = url;
  return store[key];
}

export function recordGLBModelMount(key: string, url: string) {
  const diagnostic = getDiagnostic(key, url);
  if (diagnostic) diagnostic.mountCount += 1;
}

export function recordGLBModelUnmount(key: string, url: string) {
  const diagnostic = getDiagnostic(key, url);
  if (diagnostic) {
    diagnostic.unmountCount += 1;
    diagnostic.selectionOutlineVisible = false;
  }
}

export function recordGLBModelRender(key: string, url: string) {
  const diagnostic = getDiagnostic(key, url);
  if (diagnostic) diagnostic.renderCount += 1;
}

export function recordGLBBoundsObservation(
  key: string,
  url: string,
  observation: GLBLocalRenderBoundsObservation,
  published: boolean
) {
  const diagnostic = getDiagnostic(key, url);
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
  key: string,
  url: string,
  visible: boolean
) {
  const diagnostic = getDiagnostic(key, url);
  if (diagnostic) diagnostic.selectionOutlineVisible = visible;
}

export function reportGLBModelLoadState(
  key: string,
  url: string,
  state: GLBModelDiagnosticSnapshot["loadState"],
  onLoadStateChange?: (state: GLBModelDiagnosticSnapshot["loadState"]) => void,
  errorCode: GLBModelDiagnosticSnapshot["loadErrorCode"] = null
) {
  const diagnostic = getDiagnostic(key, url);
  if (diagnostic) {
    diagnostic.loadState = state;
    diagnostic.loadErrorCode = state === "error" ? errorCode : null;
  }
  onLoadStateChange?.(state);
}

export function recordGLBExcessiveBoundsWarning(key: string, url: string) {
  const diagnostic = getDiagnostic(key, url);
  if (diagnostic) diagnostic.excessiveBoundsWarningCount += 1;
}
