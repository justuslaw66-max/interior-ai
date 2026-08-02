export type GLBModelLoadState = "loading" | "ready" | "error" | "cancelled";
export type GLBModelCacheStatus = "unknown" | "network" | "cache-hit";
export type GLBModelCacheAcquisitionStatus = "hit" | "miss";
export type GLBModelPipelineState =
  | "not-started"
  | "pending"
  | "complete"
  | "error";
export type GLBModelTerminalErrorCategory =
  | "gltf-load-failed"
  | "gltf-loader-import-failed"
  | "gltf-parse-decode-failed"
  | "glb-normalization-failed"
  | "glb-material-setup-failed"
  | "glb-bounds-failed"
  | "glb-empty-bounds"
  | "glb-scene-attachment-failed";

export type GLBModelPipelineStage =
  | "request-started"
  | "response-complete"
  | "parse-complete"
  | "normalization-started"
  | "normalization-complete"
  | "material-cloning-started"
  | "material-cloning-complete"
  | "materials-started"
  | "materials-complete"
  | "bounds-started"
  | "bounds-complete"
  | "scene-attached";

export type GLBModelTransitionName =
  | GLBModelPipelineStage
  | "mounted"
  | "metadata-updated"
  | "resource-acquired"
  | "resource-released"
  | "loading"
  | "ready"
  | "error"
  | "cancelled";

export type GLBModelStageTiming = {
  atMs: number;
  eventLoopDelayMs: number | null;
};

export type GLBModelMountMetadata = {
  sceneItemId: string;
  productId: string | null;
  variantId: string | null;
  readinessKey: string | null;
  requiredForReadiness: boolean;
};

export type GLBModelLifecycleHandle = {
  key: string;
  url: string;
  mountInstanceId: string;
  reloadGeneration: number;
  terminalState: "ready" | "error" | null;
};

export type GLBModelDiagnosticSnapshot = {
  key: string;
  sceneItemId: string;
  productId: string | null;
  variantId: string | null;
  readinessKey: string | null;
  requiredForReadiness: boolean;
  url: string;
  urlHash: string;
  mountInstanceId: string;
  reloadGeneration: number;
  active: boolean;
  mountCount: number;
  unmountCount: number;
  supersededMountCount: number;
  ignoredStaleTransitionCount: number;
  renderCount: number;
  boundsMaterialChangeCount: number;
  boundsEquivalentCount: number;
  boundsResetCount: number;
  boundsInvalidCount: number;
  boundsPublicationCount: number;
  excessiveBoundsWarningCount: number;
  selectionOutlineVisible: boolean;
  loadState: GLBModelLoadState;
  pendingStage: string | null;
  requestStarted: boolean;
  responseCompleted: boolean;
  cacheStatus: GLBModelCacheStatus;
  parsedCacheStatus: GLBModelCacheAcquisitionStatus | null;
  preparedCacheStatus: GLBModelCacheAcquisitionStatus | null;
  parseDecodeState: GLBModelPipelineState;
  normalizationState: GLBModelPipelineState;
  materialState: GLBModelPipelineState;
  boundsState: GLBModelPipelineState;
  sceneAttachmentState: GLBModelPipelineState;
  cancellationState: "active" | "unmounted" | "superseded";
  resourceKind: "parsed" | "prepared" | null;
  resourceKeyHash: string | null;
  resourceAcquiredAtMs: number | null;
  resourceReleasedAtMs: number | null;
  lastTransitionName: GLBModelTransitionName;
  lastTransitionAtMs: number;
  stageTimings: Partial<Record<GLBModelTransitionName, GLBModelStageTiming>>;
  terminalErrorCategory: GLBModelTerminalErrorCategory | null;
  loadErrorCode: GLBModelTerminalErrorCategory | null;
};

export type GLBRequiredModelIdentity = Pick<
  GLBModelDiagnosticSnapshot,
  "key" | "mountInstanceId" | "reloadGeneration"
>;

export type GLBRequiredModelReadiness = {
  state: "loading" | "ready" | "error";
  pending: Array<{ key: string; pendingStage: string }>;
  errors: Array<{ key: string; category: GLBModelTerminalErrorCategory }>;
};
