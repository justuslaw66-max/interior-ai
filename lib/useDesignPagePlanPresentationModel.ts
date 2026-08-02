"use client";

import { useCallback, useMemo } from "react";

import type { PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import type { LightingPreset } from "@/lib/lightingPresets";
import {
  buildExportReadinessItems,
  getExportReadinessScore,
} from "@/lib/design-page-export-readiness";
import { getPlan2DRoomFitBounds } from "@/lib/design-page-floor-plan-utils";
import {
  buildHousePlan2D,
  type HouseRoomConnectionChecklistItem,
} from "@/lib/design-page-house-plan";
import { resolveDesignPagePlanCanvasOverlaysState } from "@/lib/design-page-plan-canvas-overlays";
import { resolvePlanCanvasGuidance } from "@/lib/plan-canvas-guidance";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawRoomMode,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { FloorPlanActiveTool } from "@/lib/useDesignPageFloorPlanWorkflowState";
import type {
  ExportStylePreset,
  PlanLayers,
  PlanTheme,
} from "@/lib/useDesignPagePlanState";
import type {
  DesignControlsPanelMode,
  DesignPageEditorMode,
} from "@/lib/useDesignPagePanelMode";

type HousePlanRoom = ReturnType<typeof buildHousePlan2D>["rooms"][number];

export type ResolveDesignPageViewportLayoutInput = {
  designControlsPanelVisible: boolean;
  designControlsPanelMode: DesignControlsPanelMode;
  shoppingPanelVisible: boolean;
  designPanelCollapsed: boolean;
  isClientPreview: boolean;
  isDesigner: boolean;
  floorCount: number;
  viewportWidth: number;
  viewMode: EditorViewMode;
  hasWholeHousePlan: boolean;
  planQualityReviewVisible: boolean;
  planQualityReviewReservedBottomPx: number;
  floatingOverlayDesktopMinWidthPx: number;
  floatingOverlayStackRightPx: number;
  floatingOverlayInspectorStackTopPx: number;
  floatingOverlayStackWidthPx: number;
  floatingOverlayStackGapPx: number;
};

export function resolveDesignPageViewportLayout({
  designControlsPanelVisible,
  designControlsPanelMode,
  shoppingPanelVisible,
  designPanelCollapsed,
  isClientPreview,
  isDesigner,
  floorCount,
  viewportWidth,
  viewMode,
  hasWholeHousePlan,
  planQualityReviewVisible,
  planQualityReviewReservedBottomPx,
  floatingOverlayDesktopMinWidthPx,
  floatingOverlayStackRightPx,
  floatingOverlayInspectorStackTopPx,
  floatingOverlayStackWidthPx,
  floatingOverlayStackGapPx,
}: ResolveDesignPageViewportLayoutInput) {
  const floorPropertiesPanelEligible =
    designControlsPanelVisible &&
    designControlsPanelMode === "plan" &&
    !isClientPreview &&
    (isDesigner || floorCount > 1 || viewMode === "3d");
  const floatingPlanOverlayStackVisible =
    !isClientPreview &&
    viewportWidth >= floatingOverlayDesktopMinWidthPx;
  const floatingFloorPropertiesPanelVisible =
    floorPropertiesPanelEligible && floatingPlanOverlayStackVisible;
  const inlineFloorPropertiesPanelVisible =
    floorPropertiesPanelEligible && !floatingFloorPropertiesPanelVisible;
  const primaryLeftPanelVisible =
    designControlsPanelVisible || shoppingPanelVisible;
  const plan2DSafeAreaLeftPx =
    primaryLeftPanelVisible && !isClientPreview && viewportWidth >= 768
      ? shoppingPanelVisible
        ? isDesigner
          ? 398
          : 318
        : designPanelCollapsed
          ? isDesigner
            ? 128
            : 88
          : isDesigner
            ? 398
            : 318
      : 0;
  const selectionInspectorDockedWithPlanStack =
    floatingPlanOverlayStackVisible &&
    viewMode === "3d" &&
    hasWholeHousePlan;
  const selectionInspectorDockedWithRightRail =
    floatingPlanOverlayStackVisible;
  const selectionInspectorRightPx = floatingOverlayStackRightPx;
  const selectionInspectorTopPx = selectionInspectorDockedWithPlanStack
    ? floatingOverlayInspectorStackTopPx
    : planQualityReviewVisible
      ? planQualityReviewReservedBottomPx + floatingOverlayStackGapPx
      : 140;
  const selectionInspectorWidthPx = selectionInspectorDockedWithRightRail
    ? floatingOverlayStackWidthPx
    : 288;
  const plan2DSafeAreaRightPx =
    !isClientPreview && viewMode === "2d" && viewportWidth >= 768
      ? Math.max(
          planQualityReviewVisible ? 344 : 0,
          floatingFloorPropertiesPanelVisible ? 284 : 0
        )
      : 0;
  const plan2DSafeAreaBottomPx =
    designControlsPanelVisible &&
    !isClientPreview &&
    viewportWidth > 0 &&
    viewportWidth < 768
      ? 360
      : 0;

  return {
    floorPropertiesPanelEligible,
    floatingPlanOverlayStackVisible,
    floatingFloorPropertiesPanelVisible,
    inlineFloorPropertiesPanelVisible,
    primaryLeftPanelVisibleForLayout: primaryLeftPanelVisible,
    plan2DSafeAreaLeftPx,
    selectionInspectorDockedWithPlanStack,
    selectionInspectorDockedWithRightRail,
    selectionInspectorRightPx,
    selectionInspectorTopPx,
    selectionInspectorWidthPx,
    plan2DSafeAreaRightPx,
    plan2DSafeAreaBottomPx,
  };
}

export type UseDesignPagePlanPresentationModelInput = {
  state: {
    layout: {
      designControlsPanelVisible: boolean;
      designControlsPanelMode: DesignControlsPanelMode;
      shoppingPanelVisible: boolean;
      commercePanelVisible: boolean;
      designPanelCollapsed: boolean;
      isClientPreview: boolean;
      isDesigner: boolean;
      floorCount: number;
      viewportWidth: number;
      viewMode: EditorViewMode;
      hasWholeHousePlan: boolean;
      planQualityReviewVisible: boolean;
      planQualityReviewReservedBottomPx: number;
      housePlanRooms: HousePlanRoom[];
      roomWidth: number;
      roomDepth: number;
    };
    export: {
      openingCount: number;
      itemCount: number;
      shoppableCount: number;
      roomConnectionChecklistItems: HouseRoomConnectionChecklistItem[];
      sceneReady: boolean;
      exportStylePreset: ExportStylePreset;
    };
    presentation: {
      lightingPreset: LightingPreset;
      showDesignerTheme: boolean;
      simplePlanControls: boolean;
      planLayers: PlanLayers;
      planTheme: PlanTheme;
      planGuidedActionsEnabled: boolean;
      editorMode: DesignPageEditorMode;
      guidedPlanStartMode: PlanStartMode;
      floorPlanUnderlay: FloorPlanUnderlay | null;
      floorPlanCalibrationMode: boolean;
      floorPlanCalibrationPointCount: number;
      floorPlanTraceRoomMode: boolean;
      floorPlanDrawRoomMode: FloorPlanDrawRoomMode;
      floorPlanTraceRoomPointCount: number;
      floorPlanTraceOpeningMode: boolean;
      floorPlanTraceOpeningKind: RoomOpening2D["kind"];
      floorPlanTraceOpeningPointCount: number;
      activeFloorPlanTool: FloorPlanActiveTool;
      activePlanCanvasInteraction: boolean;
      planCanvasFocusActive: boolean;
      planSettingsLoaded: boolean;
      planGuidedActionsChoiceSeen: boolean;
      showBetaStart: boolean;
      dismissedPlanCanvasGuidanceKey: string | null;
    };
  };
  configuration: {
    simplePlanLayers: PlanLayers;
    floatingOverlayDesktopMinWidthPx: number;
    floatingOverlayStackRightPx: number;
    floatingOverlayInspectorStackTopPx: number;
    floatingOverlayStackWidthPx: number;
    floatingOverlayStackGapPx: number;
  };
  actions: {
    resetFloorPlanCalibrationPoints: () => void;
    resetFloorPlanTraceOpeningPoints: () => void;
    resetFloorPlanTraceRoomPoints: () => void;
  };
};

export function useDesignPagePlanPresentationModel({
  state,
  configuration,
  actions,
}: UseDesignPagePlanPresentationModelInput) {
  const { layout, export: exportState, presentation } = state;
  const {
    simplePlanLayers,
    floatingOverlayDesktopMinWidthPx,
    floatingOverlayStackRightPx,
    floatingOverlayInspectorStackTopPx,
    floatingOverlayStackWidthPx,
    floatingOverlayStackGapPx,
  } = configuration;
  const viewportLayout = resolveDesignPageViewportLayout({
    designControlsPanelVisible: layout.designControlsPanelVisible,
    designControlsPanelMode: layout.designControlsPanelMode,
    shoppingPanelVisible: layout.shoppingPanelVisible,
    designPanelCollapsed: layout.designPanelCollapsed,
    isClientPreview: layout.isClientPreview,
    isDesigner: layout.isDesigner,
    floorCount: layout.floorCount,
    viewportWidth: layout.viewportWidth,
    viewMode: layout.viewMode,
    hasWholeHousePlan: layout.hasWholeHousePlan,
    planQualityReviewVisible: layout.planQualityReviewVisible,
    planQualityReviewReservedBottomPx:
      layout.planQualityReviewReservedBottomPx,
    floatingOverlayDesktopMinWidthPx,
    floatingOverlayStackRightPx,
    floatingOverlayInspectorStackTopPx,
    floatingOverlayStackWidthPx,
    floatingOverlayStackGapPx,
  });
  const plan2DFitBounds = useMemo(
    () =>
      getPlan2DRoomFitBounds(
        layout.housePlanRooms,
        layout.roomWidth,
        layout.roomDepth
      ),
    [layout.housePlanRooms, layout.roomDepth, layout.roomWidth]
  );
  const exportReadinessItems = useMemo(
    () =>
      buildExportReadinessItems({
        roomCount: layout.housePlanRooms.length,
        openingCount: exportState.openingCount,
        itemCount: exportState.itemCount,
        shoppableCount: exportState.shoppableCount,
        hasRoomConnectionBlockers:
          exportState.roomConnectionChecklistItems.some(
            (item) => item.status !== "connected"
          ),
        sceneReady: exportState.sceneReady,
        exportStylePreset: exportState.exportStylePreset,
      }),
    [
      exportState.exportStylePreset,
      exportState.itemCount,
      exportState.openingCount,
      exportState.roomConnectionChecklistItems,
      exportState.sceneReady,
      exportState.shoppableCount,
      layout.housePlanRooms.length,
    ]
  );
  const {
    readyCount: exportReadinessReadyCount,
    score: exportReadinessScore,
  } = useMemo(
    () => getExportReadinessScore(exportReadinessItems),
    [exportReadinessItems]
  );
  const sceneBackgroundColor =
    layout.viewMode === "3d"
      ? presentation.showDesignerTheme
        ? "#dedfdf"
        : "#f4f2ed"
      : "#ffffff";
  const effectivePlanLayers = presentation.simplePlanControls
    ? simplePlanLayers
    : presentation.planLayers;
  const effectivePlanTheme = presentation.simplePlanControls
    ? "consumer"
    : presentation.planTheme;
  const planCanvasCursor =
    layout.viewMode !== "2d"
      ? undefined
      : presentation.activeFloorPlanTool === "select"
        ? "default"
        : presentation.activeFloorPlanTool === "draw_room"
          ? "crosshair"
          : "copy";
  const planCanvasGuidance = useMemo(() => {
    if (!presentation.planGuidedActionsEnabled) return null;

    return resolvePlanCanvasGuidance({
      viewMode: layout.viewMode,
      editorMode: presentation.editorMode,
      isClientPreview: layout.isClientPreview,
      isDesigner: layout.isDesigner,
      planStartMode: presentation.guidedPlanStartMode,
      floorPlanUnderlay: presentation.floorPlanUnderlay,
      floorPlanCalibrationMode: presentation.floorPlanCalibrationMode,
      floorPlanCalibrationPointCount:
        presentation.floorPlanCalibrationPointCount,
      floorPlanTraceRoomMode: presentation.floorPlanTraceRoomMode,
      floorPlanDrawRoomMode: presentation.floorPlanDrawRoomMode,
      floorPlanTraceRoomPointCount:
        presentation.floorPlanTraceRoomPointCount,
      floorPlanTraceOpeningMode: presentation.floorPlanTraceOpeningMode,
      floorPlanTraceOpeningKind: presentation.floorPlanTraceOpeningKind,
      floorPlanTraceOpeningPointCount:
        presentation.floorPlanTraceOpeningPointCount,
      hasRooms: layout.housePlanRooms.length > 0,
      hasOpenings: exportState.openingCount > 0,
      hasConnectionBlockers:
        exportState.roomConnectionChecklistItems.some(
          (item) => item.status !== "connected"
        ),
      hasFurniture: exportState.itemCount > 0,
    });
  }, [
    exportState.itemCount,
    exportState.openingCount,
    exportState.roomConnectionChecklistItems,
    layout.housePlanRooms.length,
    layout.isClientPreview,
    layout.isDesigner,
    layout.viewMode,
    presentation.editorMode,
    presentation.floorPlanCalibrationMode,
    presentation.floorPlanCalibrationPointCount,
    presentation.floorPlanDrawRoomMode,
    presentation.floorPlanTraceOpeningKind,
    presentation.floorPlanTraceOpeningMode,
    presentation.floorPlanTraceOpeningPointCount,
    presentation.floorPlanTraceRoomMode,
    presentation.floorPlanTraceRoomPointCount,
    presentation.floorPlanUnderlay,
    presentation.guidedPlanStartMode,
    presentation.planGuidedActionsEnabled,
  ]);
  const showPlanGuidedActionsToggle =
    !layout.isClientPreview &&
    !layout.isDesigner &&
    layout.viewMode === "2d" &&
    presentation.editorMode === "design";
  const compactRoomPlanStatusBar =
    showPlanGuidedActionsToggle || layout.commercePanelVisible;
  const showRoomPlanStatusHealth = !showPlanGuidedActionsToggle;
  const planCanvasOverlaysState =
    resolveDesignPagePlanCanvasOverlaysState({
      showGuidedActionsToggle: showPlanGuidedActionsToggle,
      guidedActionsEnabled: presentation.planGuidedActionsEnabled,
      activeInteraction: presentation.activePlanCanvasInteraction,
      planSettingsLoaded: presentation.planSettingsLoaded,
      guidedActionsChoiceSeen:
        presentation.planGuidedActionsChoiceSeen,
      showBetaStart: presentation.showBetaStart,
      isClientPreview: layout.isClientPreview,
      isDesigner: layout.isDesigner,
      viewMode: layout.viewMode,
      editorMode: presentation.editorMode,
      designControlsPanelVisible: layout.designControlsPanelVisible,
      designControlsPanelMode: layout.designControlsPanelMode,
      roomCount: layout.housePlanRooms.length,
      activeFloorPlanTool: presentation.activeFloorPlanTool,
      floorPlanUnderlay: presentation.floorPlanUnderlay,
      floorPlanCalibrationMode: presentation.floorPlanCalibrationMode,
      floorPlanCalibrationPointCount:
        presentation.floorPlanCalibrationPointCount,
      floorPlanTraceRoomMode: presentation.floorPlanTraceRoomMode,
      floorPlanDrawRoomMode: presentation.floorPlanDrawRoomMode,
      floorPlanTraceRoomPointCount:
        presentation.floorPlanTraceRoomPointCount,
      floorPlanTraceOpeningMode: presentation.floorPlanTraceOpeningMode,
      floorPlanTraceOpeningKind: presentation.floorPlanTraceOpeningKind,
      floorPlanTraceOpeningPointCount:
        presentation.floorPlanTraceOpeningPointCount,
      planCanvasFocusActive: presentation.planCanvasFocusActive,
      planCanvasGuidance,
      dismissedPlanCanvasGuidanceKey:
        presentation.dismissedPlanCanvasGuidanceKey,
    });
  const clearPlanFocusPoints = useCallback(() => {
    if (presentation.floorPlanCalibrationMode) {
      actions.resetFloorPlanCalibrationPoints();
      return;
    }
    if (presentation.floorPlanTraceOpeningMode) {
      actions.resetFloorPlanTraceOpeningPoints();
      return;
    }
    if (presentation.floorPlanTraceRoomMode) {
      actions.resetFloorPlanTraceRoomPoints();
    }
  }, [
    actions,
    presentation.floorPlanCalibrationMode,
    presentation.floorPlanTraceOpeningMode,
    presentation.floorPlanTraceRoomMode,
  ]);

  return {
    derived: {
      ...viewportLayout,
      plan2DFitBounds,
      exportReadinessItems,
      exportReadinessReadyCount,
      exportReadinessScore,
      sceneBackgroundColor,
      effectivePlanLayers,
      effectivePlanTheme,
      planCanvasCursor,
      planCanvasGuidance,
      showPlanGuidedActionsToggle,
      compactRoomPlanStatusBar,
      showRoomPlanStatusHealth,
      planCanvasOverlaysState,
    },
    actions: { clearPlanFocusPoints },
  };
}
