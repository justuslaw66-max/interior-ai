import * as THREE from "three";
import { useEffect, useMemo, useRef, type RefObject } from "react";

import type { GLBCalibration } from "@/lib/design-page-calibration";
import type { ConfigurableNodeTransform } from "@/lib/design-page-types";
import type { PendantCableAdjustment } from "@/lib/pendant-light-adjustment";
import {
  categorizeGLBBoundsFailure,
  disposeObjectGeometryAndMaterials,
  measureGLBLocalRenderBounds,
  type GLBLoadedResource,
  type GLBModelNormalizationConfig,
} from "./glbModelResources";
import type { GLBLocalRenderBounds } from "./localRenderBounds";
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
  GLBModelTerminalErrorCategory,
} from "./modelLifecycleTypes";
import { normalizeGLBScene, type GLBUpholsteryTextures } from "./normalizeGLBScene";
import { useGLBLoadedResource } from "./useGLBLoadedResource";

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
type ModelResult = {
  model: THREE.Object3D | null;
  errorCode: GLBModelTerminalErrorCategory | null;
  ownsResources: boolean;
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
  useEffect(() => recordGLBModelRender(handleRef.current));
  return handleRef;
}

function normalizeResource(
  resource: GLBLoadedResource | null,
  config: GLBModelNormalizationConfig,
  upholsteryTextures: GLBUpholsteryTextures
): ModelResult {
  if (!resource) return { model: null, errorCode: null, ownsResources: false };
  if (resource.kind === "prepared") {
    return { model: resource.model, errorCode: null, ownsResources: false };
  }
  try {
    return {
      model: normalizeGLBScene({
        ...config,
        loadedScene: resource.scene,
        upholsteryTextures,
      }),
      errorCode: null,
      ownsResources: true,
    };
  } catch {
    return {
      model: null,
      errorCode: "glb-normalization-failed",
      ownsResources: false,
    };
  }
}

function boundsForResource(
  resource: GLBLoadedResource | null,
  model: THREE.Object3D | null
) {
  if (resource?.kind === "prepared") {
    return { bounds: resource.localRenderBounds, errorCode: null };
  }
  if (!model) return { bounds: null, errorCode: null };
  try {
    return { bounds: measureGLBLocalRenderBounds(model), errorCode: null };
  } catch (error) {
    const errorCode = categorizeGLBBoundsFailure(error).category;
    return { bounds: null, errorCode };
  }
}

function usePipelineCompletion(
  handleRef: RefObject<GLBModelLifecycleHandle | null>,
  onLoadStateChangeRef: RefObject<GLBModelLifecycleInput["onLoadStateChange"]>,
  resource: GLBLoadedResource | null,
  modelResult: ModelResult,
  boundsResult: {
    bounds: GLBLocalRenderBounds | null;
    errorCode: GLBModelTerminalErrorCategory | null;
  }
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
      recordGLBModelPipelineStage(handle, "normalization-complete");
    }
  }, [
    handleRef,
    modelResult.errorCode,
    modelResult.model,
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
      recordGLBModelPipelineStage(handle, "bounds-complete");
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
    return () => disposeObjectGeometryAndMaterials(modelResult.model!);
  }, [modelResult.model, modelResult.ownsResources]);
  return {
    model: modelResult.model,
    bounds: boundsResult.bounds,
    handleRef,
    lifecycleKey,
  };
}
