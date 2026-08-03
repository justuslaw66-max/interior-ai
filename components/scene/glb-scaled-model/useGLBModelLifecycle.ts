import { useEffect, useMemo, useRef, type RefObject } from "react";

import type { GLBCalibration } from "@/lib/design-page-calibration";
import type { ConfigurableNodeTransform } from "@/lib/design-page-types";
import type { PendantCableAdjustment } from "@/lib/pendant-light-adjustment";
import {
  disposeObjectGeometryAndMaterials,
  type GLBLoadedResource,
  type GLBModelNormalizationConfig,
} from "./glbModelResources";
import {
  boundsForResource,
  normalizeResource,
  type GLBBoundsResult,
  type GLBModelResult,
} from "./glbModelResourceResolution";
import {
  recordGLBModelMount,
  recordGLBModelMetadata,
  recordGLBModelPipelineStage,
  recordGLBModelRender,
  recordGLBModelUnmount,
  reportGLBModelLoadState,
} from "./modelDiagnostics";
import type {
  GLBModelLifecycleHandle,
} from "./modelLifecycleTypes";
import type { GLBUpholsteryTextures } from "./normalizeGLBScene";
import { useGLBLoadedResource } from "./useGLBLoadedResource";
import {
  measureGLBMainThreadWork,
  recordGLBMainThreadCounter,
} from "./glbMainThreadTelemetry";

type GLBModelLifecycleInput = {
  url: string;
  productId?: string;
  variantId?: string;
  width: number;
  height: number;
  depth: number;
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  calibration?: GLBCalibration;
  variantColorHex?: string;
  variantName?: string;
  variantRenderAssets?: import("@/lib/catalog-schema").CatalogItemSchema["variants"][number]["renderAssets"];
  pendantCableAdjustment?: PendantCableAdjustment | null;
  castShadow: boolean;
  resolvedDiagnosticKey: string;
  readinessKey?: string;
  requiredForReadiness: boolean;
  upholsteryTextures: GLBUpholsteryTextures;
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
};
function useLifecycleHandle(
  input: GLBModelLifecycleInput,
  lifecycleKey: string
) {
  const handleRef = useRef<GLBModelLifecycleHandle | null>(null);
  const metadata = useMemo(
    () => ({
      sceneItemId: input.resolvedDiagnosticKey,
      productId: input.productId ?? null,
      variantId: input.variantId ?? null,
      readinessKey: input.readinessKey ?? null,
      requiredForReadiness: input.requiredForReadiness,
    }),
    [
      input.productId,
      input.readinessKey,
      input.requiredForReadiness,
      input.resolvedDiagnosticKey,
      input.variantId,
    ]
  );
  const metadataRef = useRef(metadata);
  useEffect(() => {
    metadataRef.current = metadata;
    recordGLBModelMetadata(handleRef.current, metadata);
  }, [metadata]);
  useEffect(() => {
    const handle = recordGLBModelMount(
      input.resolvedDiagnosticKey,
      input.url,
      metadataRef.current
    );
    handleRef.current = handle;
    return () => {
      recordGLBModelUnmount(handle);
      if (handleRef.current === handle) handleRef.current = null;
    };
  }, [lifecycleKey, input.resolvedDiagnosticKey, input.url]);
  useEffect(() => {
    recordGLBMainThreadCounter("reactRenders");
    recordGLBModelRender(handleRef.current);
  });
  return handleRef;
}

function recordNormalizationStages(
  handle: GLBModelLifecycleHandle,
  timing: NonNullable<GLBModelResult["normalizationTiming"]>
) {
  recordGLBModelPipelineStage(handle, "normalization-started", {
    atMs: timing.startedAtMs,
    eventLoopDelayMs: timing.eventLoopDelayMs.started,
  });
  recordGLBModelPipelineStage(handle, "material-cloning-started", {
    atMs: timing.materialCloningStartedAtMs,
    eventLoopDelayMs: timing.eventLoopDelayMs.materialCloningStarted,
  });
  recordGLBModelPipelineStage(handle, "material-cloning-complete", {
    atMs: timing.materialCloningCompletedAtMs,
    eventLoopDelayMs: timing.eventLoopDelayMs.materialCloningCompleted,
  });
  recordGLBModelPipelineStage(handle, "normalization-complete", {
    atMs: timing.completedAtMs,
    eventLoopDelayMs: timing.eventLoopDelayMs.completed,
  });
}

function recordBoundsStages(
  handle: GLBModelLifecycleHandle,
  timing: {
    startedAtMs: number;
    completedAtMs: number;
    startedEventLoopDelayMs: number | null;
    completedEventLoopDelayMs: number | null;
  }
) {
  recordGLBModelPipelineStage(handle, "bounds-started", {
    atMs: timing.startedAtMs,
    eventLoopDelayMs: timing.startedEventLoopDelayMs,
  });
  recordGLBModelPipelineStage(handle, "bounds-complete", {
    atMs: timing.completedAtMs,
    eventLoopDelayMs: timing.completedEventLoopDelayMs,
  });
}

function usePipelineCompletion(
  handleRef: RefObject<GLBModelLifecycleHandle | null>,
  onLoadStateChangeRef: RefObject<GLBModelLifecycleInput["onLoadStateChange"]>,
  resource: GLBLoadedResource | null,
  modelResult: GLBModelResult,
  boundsResult: GLBBoundsResult,
) {
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !resource) return;
    if (modelResult.errorCode) {
      reportGLBModelLoadState(
        handle,
        "error",
        onLoadStateChangeRef.current,
        modelResult.errorCode
      );
    } else if (modelResult.model) {
      const timing = modelResult.normalizationTiming;
      if (timing) recordNormalizationStages(handle, timing);
    }
  }, [
    handleRef,
    modelResult.errorCode,
    modelResult.model,
    modelResult.normalizationTiming,
    onLoadStateChangeRef,
    resource,
  ]);
  useEffect(() => {
    const handle = handleRef.current;
    if (!handle || !modelResult.model) return;
    if (boundsResult.errorCode) {
      reportGLBModelLoadState(
        handle,
        "error",
        onLoadStateChangeRef.current,
        boundsResult.errorCode
      );
    } else if (boundsResult.bounds) {
      if (boundsResult.timing) recordBoundsStages(handle, boundsResult.timing);
    }
  }, [boundsResult, handleRef, modelResult.model, onLoadStateChangeRef]);
}

function useNormalizationConfig({
  url,
  productId,
  variantId,
  width,
  height,
  depth,
  nodeTransforms,
  calibration,
  variantColorHex,
  variantName,
  variantRenderAssets,
  pendantCableAdjustment,
  castShadow,
}: GLBModelLifecycleInput): GLBModelNormalizationConfig {
  return useMemo(
    () => ({
      url,
      productId,
      variantId,
      width,
      height,
      depth,
      nodeTransforms,
      calibration,
      variantColorHex,
      variantName,
      variantRenderAssets,
      pendantCableAdjustment,
      castShadow,
    }),
    [
      calibration,
      castShadow,
      depth,
      height,
      nodeTransforms,
      pendantCableAdjustment,
      productId,
      url,
      variantColorHex,
      variantId,
      variantName,
      variantRenderAssets,
      width,
    ]
  );
}

export function useGLBModelLifecycle(input: GLBModelLifecycleInput) {
  const onLoadStateChangeRef = useRef(input.onLoadStateChange);
  useEffect(() => {
    onLoadStateChangeRef.current = input.onLoadStateChange;
  }, [input.onLoadStateChange]);
  const config = useNormalizationConfig(input);
  const lifecycleKey = useMemo(
    () => JSON.stringify([input.resolvedDiagnosticKey, config]),
    [config, input.resolvedDiagnosticKey]
  );
  const handleRef = useLifecycleHandle(input, lifecycleKey);
  const resource = useGLBLoadedResource({
    config,
    renderAssets: input.variantRenderAssets,
    handleRef,
    onLoadStateChangeRef,
    diagnosticKey: input.resolvedDiagnosticKey,
  });
  const modelResult = useMemo(
    () => normalizeResource(resource, config, input.upholsteryTextures),
    [config, input.upholsteryTextures, resource]
  );
  const boundsResult = useMemo(
    () => boundsForResource(resource, modelResult.model),
    [modelResult.model, resource]
  );
  usePipelineCompletion(
    handleRef,
    onLoadStateChangeRef,
    resource,
    modelResult,
    boundsResult
  );
  useEffect(() => {
    if (!modelResult.model || !modelResult.ownsResources) return;
    return () =>
      measureGLBMainThreadWork("resource-disposal", () =>
        disposeObjectGeometryAndMaterials(modelResult.model!),
      );
  }, [modelResult.model, modelResult.ownsResources]);
  return {
    model: modelResult.model,
    bounds: boundsResult.bounds,
    handleRef,
    lifecycleKey,
  };
}
