"use client";

import { useEffect } from "react";

import { CATALOG_ITEMS } from "@/lib/catalog";
import { resolveDesignPagePresentHotkey } from "@/lib/design-page-presentation-hotkey";
import {
  DEFAULT_DESIGN_PAGE_CART_HOVER_CAMERA_FOCUS_CONFIGURATION,
  useDesignPageCartHoverCameraFocus,
} from "@/lib/useDesignPageCartHoverCameraFocus";
import { useDesignPageExport } from "@/lib/useDesignPageExport";

type CartFocusInput = Parameters<
  typeof useDesignPageCartHoverCameraFocus
>[0];
type ExportInput = Parameters<typeof useDesignPageExport>[0];
type CartFocusState = CartFocusInput["state"];
type ExportState = ExportInput["state"];
type ExportRefs = ExportInput["refs"];
type ExportActions = ExportInput["actions"];

export type UseDesignPagePresentationExportRuntimeInput = {
  state: {
    access: { isDesigner: boolean };
    editor: Pick<CartFocusState, "editorMode" | "viewMode">;
    shopping: Pick<CartFocusState, "hoveredCartInstanceId">;
    document: Pick<ExportState, "items">;
    presentation: Omit<ExportState, "items">;
  };
  refs: {
    canvas: ExportRefs["canvasRef"];
    camera: ExportRefs["cameraRef"];
    controls: ExportRefs["controlsRef"];
    renderer: ExportRefs["rendererRef"];
    scene: ExportRefs["sceneRef"];
    designSnapshot: ExportRefs["designSnapshotRef"];
  };
  actions: {
    setClientPreview: ExportActions["setClientPreview"];
    transitionToCameraView: CartFocusInput["actions"]["transitionToCameraView"];
    setUpgradeReason: ExportActions["setUpgradeReason"];
    setShowUpgrade: ExportActions["setShowUpgrade"];
    updateProjection: ExportActions["updateProjection"];
    showToast: ExportActions["showToast"];
    logFunnelEvent: ExportActions["logFunnelEvent"];
  };
};

export type DesignPagePresentationExportRuntime = ReturnType<
  typeof useDesignPageExport
>;

/**
 * Registers presentation keyboard behavior, cart camera focus, and export at
 * their established contiguous hook slot.
 */
export function useDesignPagePresentationExportRuntime({
  state,
  refs,
  actions,
}: UseDesignPagePresentationExportRuntimeInput): DesignPagePresentationExportRuntime {
  const { isDesigner } = state.access;
  const { setClientPreview } = actions;

  useEffect(() => {
    const handlePresentModeHotkey = (event: KeyboardEvent) => {
      const command = resolveDesignPagePresentHotkey({
        isDesigner,
        key: event.key,
      });
      if (command !== "toggle-client-preview") return;
      event.preventDefault();
      setClientPreview((previous) => !previous);
    };

    window.addEventListener("keydown", handlePresentModeHotkey);
    return () =>
      window.removeEventListener("keydown", handlePresentModeHotkey);
  }, [isDesigner, setClientPreview]);

  useDesignPageCartHoverCameraFocus({
    state: {
      ...state.editor,
      ...state.shopping,
      items: state.document.items,
      cameraView: state.presentation.cameraView,
    },
    configuration: {
      ...DEFAULT_DESIGN_PAGE_CART_HOVER_CAMERA_FOCUS_CONFIGURATION,
      catalogItems: CATALOG_ITEMS,
    },
    refs: { camera: refs.camera, controls: refs.controls },
    actions: { transitionToCameraView: actions.transitionToCameraView },
  });

  const exportController = useDesignPageExport({
    state: { ...state.presentation, items: state.document.items },
    actions: {
      setClientPreview,
      setUpgradeReason: actions.setUpgradeReason,
      setShowUpgrade: actions.setShowUpgrade,
      updateProjection: actions.updateProjection,
      showToast: actions.showToast,
      logFunnelEvent: actions.logFunnelEvent,
    },
    refs: {
      canvasRef: refs.canvas,
      cameraRef: refs.camera,
      controlsRef: refs.controls,
      rendererRef: refs.renderer,
      sceneRef: refs.scene,
      designSnapshotRef: refs.designSnapshot,
    },
  });

  return exportController;
}
