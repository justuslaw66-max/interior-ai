"use client";

import type { CameraView } from "@/lib/design-page-types";
import { useDesignPageEditorShellRuntime } from "@/lib/useDesignPageEditorShellRuntime";
import { useDesignPagePlanViewportRuntime } from "@/lib/useDesignPagePlanViewportRuntime";

type EditorShellRuntimeInput = Parameters<
  typeof useDesignPageEditorShellRuntime
>[0];

export type UseDesignPageViewportShellRegistrationInput = {
  state: EditorShellRuntimeInput["state"];
  actions: Omit<EditorShellRuntimeInput["actions"], "diagnostics">;
  configuration: {
    initialCameraView: CameraView;
    nodeEnv: string | undefined;
  };
};

/** Registers viewport state before shell state so their effects retain order. */
export function useDesignPageViewportShellRegistration({
  state,
  actions,
  configuration,
}: UseDesignPageViewportShellRegistrationInput) {
  const planViewportRuntime = useDesignPagePlanViewportRuntime({
    configuration: {
      camera: {
        initialCameraView: configuration.initialCameraView,
        transitionDurationMs: 520,
      },
    },
  });
  const {
    boundaries: {
      planDocument: planDocumentController,
      floorPlanDocument: floorPlanDocumentController,
      cameraBridge,
    },
    state: {
      diagnostics: { planDebugMetrics, showLayoutDebugOverlay, viewportSize },
      plan: {
        planTheme,
        planLayers,
        planOpenings,
        simplePlanControls,
        planLayerPreset,
        planMeasurementUnit,
        exportStylePreset,
        planGuidedActionsEnabled,
        planOpeningsStorageState,
        planSettingsLoaded,
      },
      floorPlan: {
        floorPlanUnderlay,
        floorPlanCalibrationMode,
        floorPlanCalibrationPoints,
        floorPlanTraceRoomMode,
        floorPlanDrawRoomMode,
        floorPlanTraceRoomPoints,
        blankGridRoomPreviewPoint,
        floorPlanTraceOpeningMode,
        floorPlanTraceOpeningPoints,
        floorPlanTraceOpeningKind,
        blankGridRoomDrawActive,
      },
      overlaySelection: {
        selectedPlanOverlayId,
        suppressedDoorwaySuggestionKeys,
        selectedPlanRoomId,
      },
      camera: { cameraView, savedViews },
    },
    actions: {
      plan: {
        setPlanTheme,
        setPlanLayers,
        setPlanAnnotations,
        setPlanOpenings,
        setPlanFixedElements,
        setSimplePlanControls,
        setPlanMeasurementUnit,
        setExportStylePreset,
        setPlanGuidedActionsEnabled,
        setPlanGuidedActionsChoiceSeen,
      },
      floorPlan: {
        setFloorPlanTraceOpeningKind,
        resetFloorPlanInteraction,
        activateFloorPlanRoomTrace,
      },
      overlaySelection: {
        setSelectedPlanOverlayId,
        setSelectedPlanRoomId,
      },
      camera: {
        setSavedViews,
        navigation: {
          updateProjection,
          updateCameraViewFromScene,
          preserveCameraAfterPlanOverlaySelection,
          transitionToCameraView,
        },
        resolveGroundPointFromClient,
      },
    },
    refs: {
      plan: { defaultPlanOpeningsSeededRef },
      camera: {
        canvas: canvasRef,
        camera: cameraRef,
        controls: orbitControlsRef,
        renderer: rendererRef,
        scene: sceneRef,
        cameraView: cameraViewRef,
        floorCameraViews: floorCameraViewsRef,
        floorActionAdapters: floorActionAdaptersRef,
      },
    },
  } = planViewportRuntime;

  const editorShellRuntime = useDesignPageEditorShellRuntime({
    state,
    actions: {
      ...actions,
      diagnostics: planViewportRuntime.actions.diagnostics,
    },
    configuration: { nodeEnv: configuration.nodeEnv },
  });
  const {
    boundaries: { surfaceState: surfaceStateController },
    state: {
      cart: { hoveredCartInstanceId },
      presentation: { showPresentModal, presentModeRoomId },
      shopping: { shoppingReadinessFilter },
      surface: {
        activeSurfaceTarget,
        selectedWallSurfaceTarget,
        selectedRendererSurfaceTarget,
        surfaceBrushActive,
        surfaceBrushMaterialId,
        surfaceBrushPaint,
      },
      editor: { editorMode, guidedPlanStartMode },
      panel: { designControlsPanelMode, designControlsPanelVisible },
    },
    actions: {
      presentation: { setShowPresentModal, setPresentModeRoomId },
      shopping: { setShoppingReadinessFilter },
      surface: surfaceStateActions,
      editor: { setEditorMode, setGuidedPlanStartMode },
      panel: { goPlan, goFurnish, goAiDesign, goShop },
      diagnostics: {
        handlePlanDebugMetricsChange,
        handlePlan2DCameraDiagnosticsChange,
      },
    },
    configuration: { aiDesignEnabled },
  } = editorShellRuntime;

  return {
    boundaries: {
      planViewport: planViewportRuntime,
      editorShell: editorShellRuntime,
      planDocument: planDocumentController,
      floorPlanDocument: floorPlanDocumentController,
      cameraBridge,
      surfaceState: surfaceStateController,
    },
    state: {
      diagnostics: { planDebugMetrics, showLayoutDebugOverlay, viewportSize },
      plan: {
        planTheme,
        planLayers,
        planOpenings,
        simplePlanControls,
        planLayerPreset,
        planMeasurementUnit,
        exportStylePreset,
        planGuidedActionsEnabled,
        planOpeningsStorageState,
        planSettingsLoaded,
      },
      floorPlan: {
        floorPlanUnderlay,
        floorPlanCalibrationMode,
        floorPlanCalibrationPoints,
        floorPlanTraceRoomMode,
        floorPlanDrawRoomMode,
        floorPlanTraceRoomPoints,
        blankGridRoomPreviewPoint,
        floorPlanTraceOpeningMode,
        floorPlanTraceOpeningPoints,
        floorPlanTraceOpeningKind,
        blankGridRoomDrawActive,
      },
      planSelection: {
        selectedPlanOverlayId,
        suppressedDoorwaySuggestionKeys,
        selectedPlanRoomId,
      },
      camera: { cameraView, savedViews },
      presentation: { showPresentModal, presentModeRoomId },
      shopping: { shoppingReadinessFilter, hoveredCartInstanceId },
      surface: {
        activeSurfaceTarget,
        selectedWallSurfaceTarget,
        selectedRendererSurfaceTarget,
        surfaceBrushActive,
        surfaceBrushMaterialId,
        surfaceBrushPaint,
      },
      editor: { editorMode, guidedPlanStartMode },
      panels: { designControlsPanelMode, designControlsPanelVisible },
    },
    derived: { aiDesignEnabled },
    actions: {
      plan: {
        setPlanTheme,
        setPlanLayers,
        setPlanAnnotations,
        setPlanOpenings,
        setPlanFixedElements,
        setSimplePlanControls,
        setPlanMeasurementUnit,
        setExportStylePreset,
        setPlanGuidedActionsEnabled,
        setPlanGuidedActionsChoiceSeen,
        setSelectedPlanOverlayId,
        setSelectedPlanRoomId,
      },
      floorPlan: {
        setFloorPlanTraceOpeningKind,
        resetFloorPlanInteraction,
        activateFloorPlanRoomTrace,
      },
      camera: {
        setSavedViews,
        updateProjection,
        updateCameraViewFromScene,
        preserveCameraAfterPlanOverlaySelection,
        transitionToCameraView,
        resolveGroundPointFromClient,
      },
      presentation: { setShowPresentModal, setPresentModeRoomId },
      shopping: { setShoppingReadinessFilter },
      surface: surfaceStateActions,
      editor: { setEditorMode, setGuidedPlanStartMode },
      panels: { goPlan, goFurnish, goAiDesign, goShop },
      diagnostics: {
        handlePlanDebugMetricsChange,
        handlePlan2DCameraDiagnosticsChange,
      },
    },
    configuration: {
      initialCameraView: configuration.initialCameraView,
    },
    refs: {
      defaultPlanOpeningsSeededRef,
      canvasRef,
      cameraRef,
      orbitControlsRef,
      rendererRef,
      sceneRef,
      cameraViewRef,
      floorCameraViewsRef,
      floorActionAdaptersRef,
    },
  };
}
