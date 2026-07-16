"use client";

import {
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { CameraView } from "@/lib/design-page-types";
import type { DesignItem } from "@/lib/room-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

export type DesignPageCartHoverCameraFocusConfiguration = {
  focusDelayMs: number;
  transitionDurationMs: number;
  minimumTargetHeight: number;
  itemTargetHeightScale: number;
  cameraPositionBlend: number;
  cameraTargetBlend: number;
  fallbackFov: number;
};

export const DEFAULT_DESIGN_PAGE_CART_HOVER_CAMERA_FOCUS_CONFIGURATION = {
  focusDelayMs: 120,
  transitionDurationMs: 260,
  minimumTargetHeight: 0.45,
  itemTargetHeightScale: 0.52,
  cameraPositionBlend: 0.22,
  cameraTargetBlend: 0.45,
  fallbackFov: 45,
} satisfies DesignPageCartHoverCameraFocusConfiguration;

export type UseDesignPageCartHoverCameraFocusInput = {
  state: {
    editorMode: DesignPageEditorMode;
    viewMode: EditorViewMode;
    hoveredCartInstanceId: string | null;
    items: DesignItem[];
    cameraView: CameraView;
  };
  configuration: DesignPageCartHoverCameraFocusConfiguration & {
    catalogItems: Readonly<Record<string, CatalogItemSchema | undefined>>;
  };
  refs: {
    camera: MutableRefObject<THREE.Camera | null>;
    controls: MutableRefObject<OrbitControlsImpl | null>;
  };
  actions: {
    transitionToCameraView: (
      nextView: CameraView,
      durationMs?: number
    ) => void;
  };
};

/** Preserves the cart hover camera delay, easing distance, and baseline restore. */
export function useDesignPageCartHoverCameraFocus({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageCartHoverCameraFocusInput): void {
  const {
    editorMode,
    viewMode,
    hoveredCartInstanceId,
    items,
    cameraView,
  } = state;
  const {
    catalogItems,
    focusDelayMs,
    transitionDurationMs,
    minimumTargetHeight,
    itemTargetHeightScale,
    cameraPositionBlend,
    cameraTargetBlend,
    fallbackFov,
  } = configuration;
  const { camera: cameraRef, controls: controlsRef } = refs;
  const { transitionToCameraView } = actions;
  const baselineRef = useRef<CameraView | null>(null);
  const focusTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;

    if (focusTimerRef.current) {
      window.clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }

    if (editorMode !== "buy" || viewMode === "2d") {
      baselineRef.current = null;
      return;
    }

    if (!hoveredCartInstanceId) {
      if (baselineRef.current) {
        transitionToCameraView(baselineRef.current, transitionDurationMs);
        baselineRef.current = null;
      }
      return;
    }

    const hoveredItem = items.find(
      (item) => item.instanceId === hoveredCartInstanceId
    );
    if (!hoveredItem) return;
    const hoveredProduct = catalogItems[hoveredItem.productId];
    if (!hoveredProduct) return;

    const currentTarget = (controls.target as THREE.Vector3).clone();
    const currentPosition = camera.position.clone();
    const perspectiveFov =
      camera instanceof THREE.PerspectiveCamera
        ? camera.fov
        : cameraView.fov ?? fallbackFov;

    if (!baselineRef.current) {
      baselineRef.current = {
        pos: [currentPosition.x, currentPosition.y, currentPosition.z],
        target: [currentTarget.x, currentTarget.y, currentTarget.z],
        fov: perspectiveFov,
      };
    }

    const itemX = hoveredItem.position?.[0] ?? 0;
    const itemZ = hoveredItem.position?.[2] ?? 0;
    const itemY = Math.max(
      minimumTargetHeight,
      (hoveredProduct.dimsMm.h / 1000) * itemTargetHeightScale
    );
    const deltaX = itemX - currentTarget.x;
    const deltaZ = itemZ - currentTarget.z;

    focusTimerRef.current = window.setTimeout(() => {
      transitionToCameraView(
        {
          pos: [
            currentPosition.x + deltaX * cameraPositionBlend,
            currentPosition.y,
            currentPosition.z + deltaZ * cameraPositionBlend,
          ],
          target: [
            currentTarget.x + deltaX * cameraTargetBlend,
            itemY,
            currentTarget.z + deltaZ * cameraTargetBlend,
          ],
          fov: perspectiveFov,
        },
        transitionDurationMs
      );
      focusTimerRef.current = null;
    }, focusDelayMs);

    return () => {
      if (focusTimerRef.current) {
        window.clearTimeout(focusTimerRef.current);
        focusTimerRef.current = null;
      }
    };
  }, [
    cameraPositionBlend,
    cameraTargetBlend,
    cameraView.fov,
    catalogItems,
    controlsRef,
    cameraRef,
    editorMode,
    fallbackFov,
    focusDelayMs,
    hoveredCartInstanceId,
    itemTargetHeightScale,
    items,
    minimumTargetHeight,
    transitionDurationMs,
    transitionToCameraView,
    viewMode,
  ]);
}
