"use client";

import { useEffect } from "react";

import { resolveDesignPagePresentHotkey } from "@/lib/design-page-presentation-hotkey";
import { useDesignPageExport } from "@/lib/useDesignPageExport";

type ExportInput = Parameters<typeof useDesignPageExport>[0];
type ExportState = ExportInput["state"];
type ExportRefs = ExportInput["refs"];
type ExportActions = ExportInput["actions"];

export type UseDesignPagePresentationExportRuntimeInput = {
  state: {
    access: { isDesigner: boolean };
    document: Pick<ExportState, "items">;
    presentation: Omit<ExportState, "items">;
  };
  refs: {
    canvas: ExportRefs["canvasRef"];
    camera: ExportRefs["cameraRef"];
    controls: ExportRefs["controlsRef"];
    renderer: ExportRefs["rendererRef"];
    scene: ExportRefs["sceneRef"];
    cameraView: ExportRefs["cameraViewRef"];
    designSnapshot: ExportRefs["designSnapshotRef"];
  };
  actions: {
    setClientPreview: ExportActions["setClientPreview"];
    updateProjection: ExportActions["updateProjection"];
    showToast: ExportActions["showToast"];
    logFunnelEvent: ExportActions["logFunnelEvent"];
  };
};

export type DesignPagePresentationExportRuntime = ReturnType<
  typeof useDesignPageExport
>;

/**
 * Registers presentation keyboard behavior and export at their established
 * contiguous hook slot.
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
      const command = resolveDesignPagePresentHotkey({ isDesigner, event });
      if (command !== "toggle-client-preview") return;
      event.preventDefault();
      setClientPreview((previous) => !previous);
    };

    window.addEventListener("keydown", handlePresentModeHotkey);
    return () =>
      window.removeEventListener("keydown", handlePresentModeHotkey);
  }, [isDesigner, setClientPreview]);

  const exportController = useDesignPageExport({
    state: { ...state.presentation, items: state.document.items },
    actions: {
      setClientPreview,
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
      cameraViewRef: refs.cameraView,
      designSnapshotRef: refs.designSnapshot,
    },
  });

  return exportController;
}
