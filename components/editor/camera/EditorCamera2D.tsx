"use client";

import { OrthographicCamera } from "@react-three/drei/core/OrthographicCamera";
import { useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import type { OrthographicCamera as ThreeOrthographicCamera } from "three";
import { resolvePlanFitZoom } from "@/lib/design-page-house-plan";
import { applyPlan2DCameraInvariant } from "@/lib/plan-camera-2d";

const WHOLE_HOME_FIT_PADDING_MIN_METERS = 3.2;
const WHOLE_HOME_FIT_PADDING_RATIO = 0.24;
export const WHOLE_HOME_FIT_ZOOM_SCALE = 1.1;
export type Plan2DViewOrientation = "normal" | "rotated";
export type Plan2DViewFitOrientation = Plan2DViewOrientation | "auto";

type Plan2DViewFit = {
  fitPlanDepthMeters: number;
  fitPlanWidthMeters: number;
  offsetX: number;
  offsetZ: number;
  orientation: Plan2DViewOrientation;
  up: [number, number, number];
  zoom: number;
};

export function resolvePlan2DViewFit(params: {
  centerX: number;
  centerZ: number;
  fitOrientation?: Plan2DViewFitOrientation;
  paddingMeters: number;
  planDepthMeters: number;
  planWidthMeters: number;
  safeAreaBottomPx: number;
  safeAreaLeftPx: number;
  safeAreaRightPx: number;
  viewportHeightPx: number;
  viewportWidthPx: number;
  zoomScale?: number;
}): Plan2DViewFit {
  const fitOrientation = params.fitOrientation ?? "auto";
  const zoomScale = params.zoomScale ?? 1;
  const fitWidthPx = Math.max(
    320,
    params.viewportWidthPx - params.safeAreaLeftPx - params.safeAreaRightPx
  );
  const fitHeightPx = Math.max(260, params.viewportHeightPx - params.safeAreaBottomPx);
  const normalZoom = resolvePlanFitZoom({
    viewportWidthPx: fitWidthPx,
    viewportHeightPx: fitHeightPx,
    planWidthMeters: params.planWidthMeters,
    planDepthMeters: params.planDepthMeters,
    paddingMeters: params.paddingMeters,
  });
  const rotatedZoom = resolvePlanFitZoom({
    viewportWidthPx: fitWidthPx,
    viewportHeightPx: fitHeightPx,
    planWidthMeters: params.planDepthMeters,
    planDepthMeters: params.planWidthMeters,
    paddingMeters: params.paddingMeters,
  });
  const orientation: Plan2DViewOrientation =
    fitOrientation === "auto"
      ? rotatedZoom > normalZoom * 1.04
        ? "rotated"
        : "normal"
      : fitOrientation;
  const zoom = (orientation === "rotated" ? rotatedZoom : normalZoom) * zoomScale;
  const screenOffsetX = (params.safeAreaRightPx - params.safeAreaLeftPx) / zoom / 2;
  const screenOffsetY =
    params.safeAreaBottomPx > 0 ? -params.safeAreaBottomPx / zoom / 2 : 0;

  if (orientation === "rotated") {
    return {
      fitPlanDepthMeters: params.planWidthMeters,
      fitPlanWidthMeters: params.planDepthMeters,
      offsetX: params.centerX + screenOffsetY,
      offsetZ: params.centerZ + screenOffsetX,
      orientation,
      up: [1, 0, 0],
      zoom,
    };
  }

  return {
    fitPlanDepthMeters: params.planDepthMeters,
    fitPlanWidthMeters: params.planWidthMeters,
    offsetX: params.centerX + screenOffsetX,
    offsetZ: params.centerZ + screenOffsetY,
    orientation,
    up: [0, 0, -1],
    zoom,
  };
}

type EditorCamera2DProps = {
  active: boolean;
  fitOrientation?: Plan2DViewFitOrientation;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
  centerX?: number;
  centerZ?: number;
  safeAreaLeftPx?: number;
  safeAreaRightPx?: number;
  safeAreaBottomPx?: number;
  zoomScale?: number;
};

export default function EditorCamera2D({
  active,
  fitOrientation = "auto",
  roomWidth,
  roomDepth,
  roomHeight,
  centerX = 0,
  centerZ = 0,
  safeAreaLeftPx = 0,
  safeAreaRightPx = 0,
  safeAreaBottomPx = 0,
  zoomScale = WHOLE_HOME_FIT_ZOOM_SCALE,
}: EditorCamera2DProps) {
  const cameraRef = useRef<ThreeOrthographicCamera | null>(null);
  const { size } = useThree();

  useEffect(() => {
    if (!active || !cameraRef.current) return;

    const leftInsetPx = size.width >= 768 ? Math.max(0, safeAreaLeftPx) : 0;
    const rightInsetPx = size.width >= 768 ? Math.max(0, safeAreaRightPx) : 0;
    const bottomInsetPx = size.width < 768 ? Math.max(0, safeAreaBottomPx) : 0;
    const fitPaddingMeters = Math.max(
      WHOLE_HOME_FIT_PADDING_MIN_METERS,
      Math.max(roomWidth, roomDepth) * WHOLE_HOME_FIT_PADDING_RATIO
    );
    const fit = resolvePlan2DViewFit({
      centerX,
      centerZ,
      fitOrientation,
      paddingMeters: fitPaddingMeters,
      planDepthMeters: roomDepth,
      planWidthMeters: roomWidth,
      safeAreaBottomPx: bottomInsetPx,
      safeAreaLeftPx: leftInsetPx,
      safeAreaRightPx: rightInsetPx,
      viewportHeightPx: size.height,
      viewportWidthPx: size.width,
      zoomScale,
    });
    applyPlan2DCameraInvariant({
      camera: cameraRef.current,
      fit,
      cameraHeightMeters: Math.max(roomWidth, roomDepth) + roomHeight + 6,
    });
  }, [
    active,
    centerX,
    centerZ,
    fitOrientation,
    roomDepth,
    roomHeight,
    roomWidth,
    safeAreaBottomPx,
    safeAreaLeftPx,
    safeAreaRightPx,
    size.height,
    size.width,
    zoomScale,
  ]);

  if (!active) return null;

  return (
    <OrthographicCamera
      ref={cameraRef}
      makeDefault
      near={0.1}
      far={2000}
      position={[0, Math.max(roomWidth, roomDepth) + roomHeight + 6, 0]}
      up={[0, 0, -1]}
    />
  );
}
