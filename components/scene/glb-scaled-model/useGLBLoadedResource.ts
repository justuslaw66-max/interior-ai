import { useEffect, useState, type RefObject } from "react";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import {
  acquireParsedGLB,
  acquirePreparedGLB,
  ensureGLBResourceCleanup,
  GLBSourceLoadError,
  type GLBLoadedResource,
  type GLBModelNormalizationConfig,
} from "./glbModelResources";
import {
  recordGLBModelPipelineStage,
  reportGLBModelLoadState,
} from "./modelDiagnostics";
import type {
  GLBModelCacheStatus,
  GLBModelLifecycleHandle,
} from "./modelLifecycleTypes";

type RenderAssets = CatalogItemSchema["variants"][number]["renderAssets"];
type LoadStateCallback = (state: "loading" | "ready" | "error") => void;
type LoadControl = {
  cancelled: boolean;
  release: (() => void) | null;
};

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

function recordResponse(
  handle: GLBModelLifecycleHandle,
  cacheStatus: GLBModelCacheStatus
) {
  recordGLBModelPipelineStage(handle, "response-complete", { cacheStatus });
}

async function loadPreparedForMount(
  key: string,
  config: GLBModelNormalizationConfig,
  handle: GLBModelLifecycleHandle,
  control: LoadControl,
  publish: (resource: GLBLoadedResource) => void
) {
  const lease = acquirePreparedGLB(key, config, (status) =>
    recordResponse(handle, status)
  );
  control.release = lease.release;
  const prepared = await lease.resource;
  if (control.cancelled) return;
  recordResponse(
    handle,
    lease.cacheStatus === "cache-hit"
      ? "cache-hit"
      : prepared.deliveryCacheStatus
  );
  recordGLBModelPipelineStage(handle, "parse-complete");
  recordGLBModelPipelineStage(handle, "normalization-complete");
  recordGLBModelPipelineStage(handle, "bounds-complete");
  publish({
    kind: "prepared",
    model: prepared.scene.clone(true),
    localRenderBounds: prepared.localRenderBounds,
  });
}

async function loadParsedForMount(
  url: string,
  handle: GLBModelLifecycleHandle,
  control: LoadControl,
  publish: (resource: GLBLoadedResource) => void
) {
  const lease = acquireParsedGLB(url, (status) => recordResponse(handle, status));
  control.release = lease.release;
  const source = await lease.resource;
  if (control.cancelled) return;
  recordResponse(
    handle,
    lease.cacheStatus === "cache-hit" ? "cache-hit" : source.deliveryCacheStatus
  );
  recordGLBModelPipelineStage(handle, "parse-complete");
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
      control.release?.();
    };
  }, [config, diagnosticKey, handleRef, identity, key, onLoadStateChangeRef]);
  return resourceState?.identity === identity ? resourceState.resource : null;
}
