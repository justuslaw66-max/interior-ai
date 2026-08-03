import { useEffect, useState, type RefObject } from "react";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { safeGLBResourceHash } from "./createModelDiagnosticSnapshot";
import {
  acquireParsedGLB,
  acquirePreparedGLB,
  clonePreparedGLBForMount,
  ensureGLBResourceCleanup,
  GLBSourceLoadError,
  type GLBLoadedResource,
  type GLBModelNormalizationConfig,
} from "./glbModelResources";
import {
  recordGLBModelPipelineStage,
  recordGLBModelParsedCacheStatus,
  recordGLBModelResourceAcquired,
  recordGLBModelResourceReleased,
  reportGLBModelLoadState,
} from "./modelDiagnostics";
import type {
  GLBModelCacheStatus,
  GLBModelLifecycleHandle,
} from "./modelLifecycleTypes";
import type { GLBResourceCacheStatus } from "./glbResourceCache";
import { measureGLBMainThreadWork } from "./glbMainThreadTelemetry";

type RenderAssets = CatalogItemSchema["variants"][number]["renderAssets"];
type LoadStateCallback = (state: "loading" | "ready" | "error") => void;
type LoadControl = {
  cancelled: boolean;
  release: (() => void) | null;
};

function observedEventLoopDelayMs() {
  return (
    globalThis as typeof globalThis & {
      __INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?: { lastDelayMs: number };
    }
  ).__INTERIOR_AI_GLB_EVENT_LOOP_PROBE__?.lastDelayMs ?? null;
}

function clonePreparedModel(scene: Parameters<typeof clonePreparedGLBForMount>[0]) {
  return measureGLBMainThreadWork("prepared-model-clone", () =>
    clonePreparedGLBForMount(scene),
  );
}

function attachLeaseRelease(
  control: LoadControl,
  handle: GLBModelLifecycleHandle,
  releaseLease: () => void,
) {
  let released = false;
  control.release = () => {
    if (released) return;
    released = true;
    recordGLBModelResourceReleased(handle);
    releaseLease();
  };
}

function releaseControl(control: LoadControl) {
  const release = control.release;
  control.release = null;
  release?.();
}

function preparedResourceKey(
  config: GLBModelNormalizationConfig,
  renderAssets: RenderAssets | undefined
) {
  if (
    renderAssets?.baseColorMap ||
    renderAssets?.normalMap ||
    renderAssets?.roughnessMap
  ) {
    return null;
  }
  return JSON.stringify(config);
}

function cacheAcquisitionStatus(status: GLBResourceCacheStatus) {
  return status === "cache-hit" ? ("hit" as const) : ("miss" as const);
}

function recordResponse(
  handle: GLBModelLifecycleHandle,
  cacheStatus: GLBModelCacheStatus,
  atMs?: number
) {
  recordGLBModelPipelineStage(handle, "response-complete", {
    cacheStatus,
    atMs,
    eventLoopDelayMs: atMs === undefined ? undefined : null,
  });
}

async function loadPreparedForMount(
  key: string,
  config: GLBModelNormalizationConfig,
  handle: GLBModelLifecycleHandle,
  control: LoadControl,
  publish: (resource: GLBLoadedResource) => void
) {
  const lease = acquirePreparedGLB(key, config, (status, completedAtMs) =>
    recordResponse(handle, status, completedAtMs)
  );
  recordGLBModelResourceAcquired(
    handle,
    "prepared",
    safeGLBResourceHash(key),
    {
      parsed: null,
      prepared: cacheAcquisitionStatus(lease.cacheStatus),
    },
  );
  attachLeaseRelease(control, handle, lease.release);
  const prepared = await lease.resource;
  if (control.cancelled) return;
  recordGLBModelParsedCacheStatus(
    handle,
    lease.cacheStatus === "cache-hit"
      ? null
      : cacheAcquisitionStatus(prepared.parsedCacheStatus),
  );
  recordResponse(
    handle,
    lease.cacheStatus === "cache-hit"
      ? "cache-hit"
      : prepared.deliveryCacheStatus
  );
  recordGLBModelPipelineStage(handle, "parse-complete", {
    atMs: prepared.preparationTimings.parseCompletedAtMs,
    eventLoopDelayMs:
      prepared.preparationTimings.eventLoopDelayMs.parseCompleted,
  });
  const materialCloningStartedAtMs = performance.now();
  const materialCloningStartedEventLoopDelayMs = observedEventLoopDelayMs();
  const model = clonePreparedModel(prepared.scene);
  const materialCloningCompletedAtMs = performance.now();
  const materialCloningCompletedEventLoopDelayMs = observedEventLoopDelayMs();
  publish({
    kind: "prepared",
    model,
    localRenderBounds: prepared.localRenderBounds,
    preparationTimings: {
      ...prepared.preparationTimings,
      materialCloningStartedAtMs,
      materialCloningCompletedAtMs,
      eventLoopDelayMs: {
        ...prepared.preparationTimings.eventLoopDelayMs,
        materialCloningStarted: materialCloningStartedEventLoopDelayMs,
        materialCloningCompleted: materialCloningCompletedEventLoopDelayMs,
      },
    },
  });
}

async function loadParsedForMount(
  url: string,
  handle: GLBModelLifecycleHandle,
  control: LoadControl,
  publish: (resource: GLBLoadedResource) => void
) {
  const lease = acquireParsedGLB(url, (status, completedAtMs) =>
    recordResponse(handle, status, completedAtMs)
  );
  recordGLBModelResourceAcquired(handle, "parsed", safeGLBResourceHash(url), {
    parsed: cacheAcquisitionStatus(lease.cacheStatus),
    prepared: null,
  });
  attachLeaseRelease(control, handle, lease.release);
  const source = await lease.resource;
  if (control.cancelled) return;
  recordResponse(
    handle,
    lease.cacheStatus === "cache-hit" ? "cache-hit" : source.deliveryCacheStatus
  );
  const parseCompletedAtMs = performance.now();
  recordGLBModelPipelineStage(handle, "parse-complete", { atMs: parseCompletedAtMs });
  publish({ kind: "parsed", scene: source.scene });
}

function reportLoadFailure({
  error,
  control,
  diagnosticKey,
  handle,
  identity,
  onLoadStateChange,
  clear,
}: {
  error: unknown;
  control: LoadControl;
  diagnosticKey: string;
  handle: GLBModelLifecycleHandle;
  identity: string;
  onLoadStateChange?: LoadStateCallback;
  clear: (identity: string) => void;
}) {
  if (control.cancelled) return;
  const category =
    error instanceof GLBSourceLoadError
      ? error.category
      : "gltf-parse-decode-failed";
  releaseControl(control);
  console.warn("[GLBScaledModel] Failed to load", {
    diagnosticKey,
    errorCode: category,
  });
  clear(identity);
  reportGLBModelLoadState(handle, "error", onLoadStateChange, category);
}

export function useGLBLoadedResource({
  config,
  renderAssets,
  handleRef,
  onLoadStateChangeRef,
  diagnosticKey,
}: {
  config: GLBModelNormalizationConfig;
  renderAssets: RenderAssets | undefined;
  handleRef: RefObject<GLBModelLifecycleHandle | null>;
  onLoadStateChangeRef: RefObject<LoadStateCallback | undefined>;
  diagnosticKey: string;
}) {
  const [resourceState, setResourceState] = useState<{
    identity: string;
    resource: GLBLoadedResource;
  } | null>(null);
  const key = preparedResourceKey(config, renderAssets);
  const identity = key
    ? `prepared:${key}`
    : `parsed:${JSON.stringify(config)}`;
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    const control: LoadControl = { cancelled: false, release: null };
    const publish = (resource: GLBLoadedResource) => {
      if (!control.cancelled) setResourceState({ identity, resource });
    };
    const clear = (failedIdentity: string) =>
      setResourceState((current) =>
        current?.identity === failedIdentity ? null : current
      );
    reportGLBModelLoadState(handle, "loading", onLoadStateChangeRef.current);
    recordGLBModelPipelineStage(handle, "request-started");
    ensureGLBResourceCleanup();
    const loading = key
      ? loadPreparedForMount(key, config, handle, control, publish)
      : loadParsedForMount(config.url, handle, control, publish);
    loading.catch((error) =>
      reportLoadFailure({
        error,
        control,
        diagnosticKey,
        handle,
        identity,
        onLoadStateChange: onLoadStateChangeRef.current,
        clear,
      })
    );
    return () => {
      control.cancelled = true;
      releaseControl(control);
    };
  }, [config, diagnosticKey, handleRef, identity, key, onLoadStateChangeRef]);
  return resourceState?.identity === identity ? resourceState.resource : null;
}
