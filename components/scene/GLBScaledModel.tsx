"use client";

import { memo, useCallback, useEffect, useRef } from "react";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { GLBCalibration } from "@/lib/design-page-calibration";
import type { ConfigurableNodeTransform } from "@/lib/design-page-types";
import type { PendantCableAdjustment } from "@/lib/pendant-light-adjustment";
import { FurnitureSelectionOutline } from "./furniture/FurnitureSelectionOutline";
import {
  areGLBLocalRenderBoundsEquivalent,
  createGLBLocalRenderBoundsTracker,
  GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS,
  observeGLBLocalRenderBounds,
  type GLBLocalRenderBounds,
} from "./glb-scaled-model/localRenderBounds";
import { GLBModelAttachmentBoundary } from "./glb-scaled-model/GLBModelAttachmentBoundary";
import {
  GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD,
  recordGLBBoundsObservation,
  recordGLBExcessiveBoundsWarning,
  recordGLBModelPipelineStage,
  recordGLBSelectionOutlineVisibility,
  reportGLBModelLoadState,
} from "./glb-scaled-model/modelDiagnostics";
import { useGLBModelLifecycle } from "./glb-scaled-model/useGLBModelLifecycle";
import { useGLBMaterials } from "./glb-scaled-model/useGLBMaterials";
import { reportGLBSceneAttachmentReady } from "./glb-scaled-model/glbSceneAttachmentTelemetry";

export {
  areGLBLocalRenderBoundsEquivalent,
  GLB_LOCAL_RENDER_BOUNDS_EPSILON_METERS,
};
export type { GLBLocalRenderBounds };

export type GLBScaledModelProps = {
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
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  pendantCableAdjustment?: PendantCableAdjustment | null;
  castShadow?: boolean;
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
  onLocalBoundsChange?: (bounds: GLBLocalRenderBounds) => void;
  diagnosticKey?: string;
  readinessKey?: string;
  requiredForReadiness?: boolean;
  showSelectionOutline?: boolean;
};

export const GLBScaledModel = memo(function GLBScaledModel({
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
  castShadow = true,
  onLoadStateChange,
  onLocalBoundsChange,
  diagnosticKey,
  readinessKey,
  requiredForReadiness = false,
  showSelectionOutline = false,
}: GLBScaledModelProps) {
  const onLocalBoundsChangeRef = useRef(onLocalBoundsChange);
  const onLoadStateChangeRef = useRef(onLoadStateChange);
  const localBoundsTrackerRef = useRef(createGLBLocalRenderBoundsTracker());
  const excessiveBoundsWarningIssuedRef = useRef(false);
  const invalidBoundsWarningIssuedRef = useRef(false);
  const resolvedDiagnosticKey =
    diagnosticKey ?? `${productId ?? "unidentified-product"}:${url}`;
  const materialKey = JSON.stringify([
    resolvedDiagnosticKey,
    variantRenderAssets ?? null,
  ]);
  const { materialError, materialsReady, upholsteryTextures } =
    useGLBMaterials({
      renderAssets: variantRenderAssets,
      materialKey,
      diagnosticKey: resolvedDiagnosticKey,
    });
  const { model, bounds, handleRef, lifecycleKey } = useGLBModelLifecycle({
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
    resolvedDiagnosticKey,
    readinessKey,
    requiredForReadiness,
    upholsteryTextures,
    onLoadStateChange,
  });

  useEffect(() => {
    onLocalBoundsChangeRef.current = onLocalBoundsChange;
  }, [onLocalBoundsChange]);
  useEffect(() => {
    onLoadStateChangeRef.current = onLoadStateChange;
  }, [onLoadStateChange]);

  useEffect(() => {
    const handle = handleRef.current;
    if (!handle) return;
    recordGLBModelPipelineStage(handle, "materials-started");
    if (materialError) {
      reportGLBModelLoadState(
        handle,
        "error",
        onLoadStateChangeRef.current,
        "glb-material-setup-failed"
      );
    } else if (materialsReady) {
      recordGLBModelPipelineStage(handle, "materials-complete");
    }
  }, [handleRef, lifecycleKey, materialError, materialsReady]);

  const handleAttachmentReady = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    reportGLBSceneAttachmentReady(handle, onLoadStateChangeRef.current);
  }, [handleRef]);
  const handleAttachmentError = useCallback(() => {
    const handle = handleRef.current;
    if (!handle) return;
    reportGLBModelLoadState(
      handle,
      "error",
      onLoadStateChangeRef.current,
      "glb-scene-attachment-failed"
    );
  }, [handleRef]);

  useEffect(() => {
    const observation = observeGLBLocalRenderBounds(
      localBoundsTrackerRef.current,
      bounds
    );
    const shouldPublish =
      observation.outcome === "changed" &&
      Boolean(onLocalBoundsChangeRef.current);
    recordGLBBoundsObservation(handleRef.current, observation, shouldPublish);
    if (observation.outcome === "invalid") {
      if (!invalidBoundsWarningIssuedRef.current) {
        invalidBoundsWarningIssuedRef.current = true;
        console.warn("[GLBScaledModel] Ignoring invalid local render bounds", {
          diagnosticKey: resolvedDiagnosticKey,
          url,
          localRenderBounds: bounds,
        });
      }
      return;
    }
    if (observation.outcome !== "changed") return;
    if (
      localBoundsTrackerRef.current.materialChangeCount >
        GLB_MATERIAL_BOUNDS_CHANGE_WARNING_THRESHOLD &&
      !excessiveBoundsWarningIssuedRef.current
    ) {
      excessiveBoundsWarningIssuedRef.current = true;
      recordGLBExcessiveBoundsWarning(handleRef.current);
      console.warn("[GLBScaledModel] Excessive material bounds changes", {
        diagnosticKey: resolvedDiagnosticKey,
        url,
        materialChangeCount: localBoundsTrackerRef.current.materialChangeCount,
      });
    }
    onLocalBoundsChangeRef.current?.(observation.bounds);
  }, [bounds, handleRef, resolvedDiagnosticKey, url]);

  const selectionOutlineVisible = Boolean(
    showSelectionOutline && bounds && model && materialsReady
  );
  useEffect(() => {
    recordGLBSelectionOutlineVisibility(
      handleRef.current,
      selectionOutlineVisible
    );
  }, [handleRef, resolvedDiagnosticKey, selectionOutlineVisible, url]);

  if (!model || !materialsReady) return null;
  return (
    <GLBModelAttachmentBoundary
      onAttached={handleAttachmentReady}
      onAttachmentError={handleAttachmentError}
      resetKey={`${lifecycleKey}:${model.uuid}`}
    >
      <primitive object={model} />
      {selectionOutlineVisible && bounds ? (
        <FurnitureSelectionOutline localRenderBounds={bounds} />
      ) : null}
    </GLBModelAttachmentBoundary>
  );
}, areGLBScaledModelPropsEquivalent);

function areGLBScaledModelPropsEquivalent(
  left: GLBScaledModelProps,
  right: GLBScaledModelProps
) {
  return (
    left.url === right.url &&
    left.productId === right.productId &&
    left.variantId === right.variantId &&
    left.width === right.width &&
    left.height === right.height &&
    left.depth === right.depth &&
    left.variantColorHex === right.variantColorHex &&
    left.variantName === right.variantName &&
    left.castShadow === right.castShadow &&
    left.onLoadStateChange === right.onLoadStateChange &&
    left.onLocalBoundsChange === right.onLocalBoundsChange &&
    areReadinessPropsEquivalent(left, right) &&
    left.showSelectionOutline === right.showSelectionOutline &&
    JSON.stringify(left.nodeTransforms ?? null) ===
      JSON.stringify(right.nodeTransforms ?? null) &&
    JSON.stringify(left.calibration ?? null) ===
      JSON.stringify(right.calibration ?? null) &&
    JSON.stringify(left.variantRenderAssets ?? null) ===
      JSON.stringify(right.variantRenderAssets ?? null) &&
    JSON.stringify(left.pendantCableAdjustment ?? null) ===
      JSON.stringify(right.pendantCableAdjustment ?? null)
  );
}

function areReadinessPropsEquivalent(
  left: GLBScaledModelProps,
  right: GLBScaledModelProps
) {
  return (
    left.diagnosticKey === right.diagnosticKey &&
    left.readinessKey === right.readinessKey &&
    left.requiredForReadiness === right.requiredForReadiness
  );
}
