"use client";

import { useDesignPageFloorPlanTracing } from "@/lib/useDesignPageFloorPlanTracing";
import { useDesignPageFloorPlanUnderlayController } from "@/lib/useDesignPageFloorPlanUnderlayController";
import { useDesignPagePlanEditingFacade } from "@/lib/useDesignPagePlanEditingFacade";
import { useDesignPagePlanPresentationModel } from "@/lib/useDesignPagePlanPresentationModel";

type EditingInput = Parameters<typeof useDesignPagePlanEditingFacade>[0];
type PresentationInput = Parameters<
  typeof useDesignPagePlanPresentationModel
>[0];
type UnderlayInput = Parameters<
  typeof useDesignPageFloorPlanUnderlayController
>[0];
type TracingInput = Parameters<typeof useDesignPageFloorPlanTracing>[0];

type PresentationState = PresentationInput["state"];
type PresentationPlanState = PresentationState["presentation"];
type TracingState = TracingInput["state"];

export type UseDesignPagePlanWorkspaceFacadeInput = {
  state: {
    document: EditingInput["state"]["document"];
    plan: EditingInput["state"]["plan"] & {
      hasWholeHousePlan: PresentationState["layout"]["hasWholeHousePlan"];
      layers: PresentationPlanState["planLayers"];
      theme: PresentationPlanState["planTheme"];
      guidedActionsEnabled: PresentationPlanState["planGuidedActionsEnabled"];
      guidedActionsChoiceSeen: PresentationPlanState["planGuidedActionsChoiceSeen"];
      settingsLoaded: PresentationPlanState["planSettingsLoaded"];
      canvasFocusActive: PresentationPlanState["planCanvasFocusActive"];
      dismissedCanvasGuidanceKey: PresentationPlanState["dismissedPlanCanvasGuidanceKey"];
      activeFloorPlanTool: PresentationPlanState["activeFloorPlanTool"];
      selectedZoneId: TracingState["selectedZoneId"];
    };
    floorPlan: Omit<UnderlayInput["state"], "planOpenings"> &
      Pick<
        TracingState,
        | "floorPlanTraceRoomType"
        | "floorPlanTraceRoomMode"
        | "floorPlanDrawRoomMode"
        | "floorPlanDrawAngleLockMode"
        | "floorPlanExactWallLengthInput"
        | "floorPlanTraceRoomPoints"
        | "blankGridRoomDrawActive"
        | "blankGridRoomPreviewPoint"
        | "floorPlanTraceOpeningMode"
        | "floorPlanTraceOpeningPoints"
        | "floorPlanTraceOpeningKind"
      > & {
        calibrationMode: PresentationPlanState["floorPlanCalibrationMode"];
      };
    room: Pick<
      EditingInput["configuration"],
      | "roomWidth"
      | "roomDepth"
      | "roomHeight"
      | "planViewWidth"
      | "planViewDepth"
    > & { wallThickness: UnderlayInput["configuration"]["wallThickness"] };
    selection: EditingInput["state"]["selection"];
    editor: EditingInput["state"]["editor"] & {
      isDesigner: PresentationState["layout"]["isDesigner"];
      simplePlanControls: PresentationPlanState["simplePlanControls"];
      showDesignerTheme: PresentationPlanState["showDesignerTheme"];
      lightingPreset: PresentationPlanState["lightingPreset"];
      guidedPlanStartMode: PresentationPlanState["guidedPlanStartMode"];
      showBetaStart: PresentationPlanState["showBetaStart"];
    };
    layout: Omit<
      PresentationState["layout"],
      | "isClientPreview"
      | "isDesigner"
      | "viewMode"
      | "hasWholeHousePlan"
      | "housePlanRooms"
      | "roomWidth"
      | "roomDepth"
      | "planQualityReviewVisible"
      | "planQualityReviewReservedBottomPx"
    >;
    export: Omit<
      PresentationState["export"],
      "openingCount" | "itemCount" | "roomConnectionChecklistItems"
    >;
    surfaceInspector: EditingInput["state"]["surfaceInspector"];
  };
  derived: EditingInput["derived"];
  configuration: Pick<
    EditingInput["configuration"],
    | "canEdit"
    | "catalogItems"
    | "resolveConfiguredPlanningDimsMm"
    | "planMeasurementUnit"
    | "houseRoomById"
    | "qualityReviewPanel"
  > & PresentationInput["configuration"];
  refs: EditingInput["refs"] & {
    floorCameraViews: UnderlayInput["refs"]["floorCameraViewsRef"];
    underlayObjectUrl: UnderlayInput["refs"]["underlayObjectUrlRef"];
    pdfSourceData: UnderlayInput["refs"]["pdfSourceDataRef"];
    selectedIds: TracingInput["refs"]["selectedIdsRef"];
  };
  actions: {
    document: EditingInput["actions"]["document"];
    selection: EditingInput["actions"]["selection"] &
      Pick<
        UnderlayInput["actions"],
        "clearAllSelection" | "setSelectedPlanOverlayId"
      >;
    room: EditingInput["actions"]["room"] &
      Pick<TracingInput["actions"], "handleAddRoom">;
    navigation: Omit<EditingInput["actions"]["navigation"], "setViewMode"> &
      Pick<
        TracingInput["actions"],
        "setDesignPanelOpen" | "setPlanFocusPanelRevealed"
      > &
      Pick<
        UnderlayInput["actions"],
        "setViewMode" | "prepareCameraForPlanTemplate"
      >;
    history: EditingInput["actions"]["history"] &
      Pick<UnderlayInput["actions"], "runCoalescedHistoryTransaction">;
    feedback: EditingInput["actions"]["feedback"];
    floorPlanState: Pick<
      UnderlayInput["actions"],
      | "setFloorPlanUnderlay"
      | "setFloorPlanPdfSourceReady"
      | "setFloorPlanPdfRenderingPage"
      | "setFloorPlanCalibrationPoints"
      | "resetFloorPlanInteraction"
      | "resetFloorPlanCalibration"
      | "clearFloorPlanTraceBuffers"
      | "revokeUnderlayObjectUrl"
    > &
      Pick<
        TracingInput["actions"],
        | "setPlanGuidedActionsEnabled"
        | "setPlanGuidedActionsChoiceSeen"
        | "setBlankGridRoomPreviewPoint"
        | "setFloorPlanTraceRoomMode"
        | "setFloorPlanTraceRoomPoints"
        | "setFloorPlanTraceOpeningMode"
        | "setFloorPlanTraceOpeningPoints"
        | "activateFloorPlanSelectTool"
        | "activateFloorPlanCalibrationMode"
        | "activateFloorPlanRoomTrace"
        | "activateFloorPlanRoomDrawMode"
        | "activateFloorPlanOpeningTrace"
      >;
  };
};

/**
 * Composes plan editing and presentation, and prepares typed deferred bindings
 * for the underlay and tracing hooks that must stay at later registration slots.
 */
export function useDesignPagePlanWorkspaceFacade({
  state,
  derived,
  configuration,
  refs,
  actions,
}: UseDesignPagePlanWorkspaceFacadeInput) {
  const { document, plan, floorPlan, room, selection, editor, layout } = state;
  const editing = useDesignPagePlanEditingFacade({
    state: {
      document,
      plan,
      selection,
      editor,
      surfaceInspector: state.surfaceInspector,
    },
    derived,
    configuration: {
      canEdit: configuration.canEdit,
      catalogItems: configuration.catalogItems,
      resolveConfiguredPlanningDimsMm:
        configuration.resolveConfiguredPlanningDimsMm,
      ...room,
      planMeasurementUnit: configuration.planMeasurementUnit,
      houseRoomById: configuration.houseRoomById,
      qualityReviewPanel: configuration.qualityReviewPanel,
    },
    refs: {
      designSnapshot: refs.designSnapshot,
      planOpenings: refs.planOpenings,
    },
    actions: {
      document: actions.document,
      selection: actions.selection,
      room: actions.room,
      navigation: actions.navigation,
      history: actions.history,
      feedback: actions.feedback,
    },
  });

  const presentation = useDesignPagePlanPresentationModel({
    state: {
      layout: {
        ...layout,
        isClientPreview: editor.isClientPreview,
        isDesigner: editor.isDesigner,
        viewMode: editor.viewMode,
        hasWholeHousePlan: plan.hasWholeHousePlan,
        housePlanRooms: plan.housePlanRooms,
        roomWidth: room.roomWidth,
        roomDepth: room.roomDepth,
        planQualityReviewVisible:
          editing.state.quality.reviewPanelVisible,
        planQualityReviewReservedBottomPx:
          editing.state.quality.reviewPanelReservedBottomPx,
      },
      export: {
        ...state.export,
        openingCount: plan.openings.length,
        itemCount: document.items.length,
        roomConnectionChecklistItems:
          editing.state.overlay.roomConnectionChecklistItems,
      },
      presentation: {
        lightingPreset: editor.lightingPreset,
        showDesignerTheme: editor.showDesignerTheme,
        simplePlanControls: editor.simplePlanControls,
        planLayers: plan.layers,
        planTheme: plan.theme,
        planGuidedActionsEnabled: plan.guidedActionsEnabled,
        editorMode: editor.editorMode,
        guidedPlanStartMode: editor.guidedPlanStartMode,
        floorPlanUnderlay: floorPlan.floorPlanUnderlay,
        floorPlanCalibrationMode: floorPlan.calibrationMode,
        floorPlanCalibrationPointCount: floorPlan.calibrationPoints.length,
        floorPlanTraceRoomMode: floorPlan.floorPlanTraceRoomMode,
        floorPlanDrawRoomMode: floorPlan.floorPlanDrawRoomMode,
        floorPlanTraceRoomPointCount: floorPlan.floorPlanTraceRoomPoints.length,
        floorPlanTraceOpeningMode: floorPlan.floorPlanTraceOpeningMode,
        floorPlanTraceOpeningKind: floorPlan.floorPlanTraceOpeningKind,
        floorPlanTraceOpeningPointCount:
          floorPlan.floorPlanTraceOpeningPoints.length,
        activeFloorPlanTool: plan.activeFloorPlanTool,
        activePlanCanvasInteraction: plan.canvasInteractionActive,
        planCanvasFocusActive: plan.canvasFocusActive,
        planSettingsLoaded: plan.settingsLoaded,
        planGuidedActionsChoiceSeen: plan.guidedActionsChoiceSeen,
        showBetaStart: editor.showBetaStart,
        dismissedPlanCanvasGuidanceKey: plan.dismissedCanvasGuidanceKey,
      },
    },
    configuration: {
      simplePlanLayers: configuration.simplePlanLayers,
      floatingOverlayDesktopMinWidthPx:
        configuration.floatingOverlayDesktopMinWidthPx,
      floatingOverlayStackRightPx:
        configuration.floatingOverlayStackRightPx,
      floatingOverlayInspectorStackTopPx:
        configuration.floatingOverlayInspectorStackTopPx,
      floatingOverlayStackWidthPx: configuration.floatingOverlayStackWidthPx,
      floatingOverlayStackGapPx: configuration.floatingOverlayStackGapPx,
    },
    actions: {
      resetFloorPlanCalibrationPoints: () =>
        actions.floorPlanState.setFloorPlanCalibrationPoints([]),
      resetFloorPlanTraceOpeningPoints: () =>
        actions.floorPlanState.setFloorPlanTraceOpeningPoints([]),
      resetFloorPlanTraceRoomPoints: () => {
        actions.floorPlanState.setFloorPlanTraceRoomPoints([]);
        actions.floorPlanState.setBlankGridRoomPreviewPoint(null);
      },
    },
  });

  const underlay: UnderlayInput = {
    state: {
      floorPlanUnderlay: floorPlan.floorPlanUnderlay,
      calibrationPoints: floorPlan.calibrationPoints,
      calibrationDistanceInput: floorPlan.calibrationDistanceInput,
      planOpenings: plan.openings,
    },
    configuration: {
      planViewWidth: room.planViewWidth,
      planViewDepth: room.planViewDepth,
      roomHeight: room.roomHeight,
      wallThickness: room.wallThickness,
    },
    refs: {
      designSnapshotRef: refs.designSnapshot,
      floorCameraViewsRef: refs.floorCameraViews,
      underlayObjectUrlRef: refs.underlayObjectUrl,
      pdfSourceDataRef: refs.pdfSourceData,
    },
    actions: {
      history: actions.history.history,
      setDesignSnapshot: actions.document.setDesignSnapshot,
      setFloorPlanUnderlay: actions.floorPlanState.setFloorPlanUnderlay,
      setFloorPlanPdfSourceReady:
        actions.floorPlanState.setFloorPlanPdfSourceReady,
      setFloorPlanPdfRenderingPage:
        actions.floorPlanState.setFloorPlanPdfRenderingPage,
      setFloorPlanCalibrationPoints:
        actions.floorPlanState.setFloorPlanCalibrationPoints,
      setPlanOpenings: actions.document.setPlanOpenings,
      setPlanFixedElements: actions.document.setPlanFixedElements,
      setSelectedPlanOverlayId: actions.selection.setSelectedPlanOverlayId,
      setViewMode: actions.navigation.setViewMode,
      resetFloorPlanInteraction:
        actions.floorPlanState.resetFloorPlanInteraction,
      resetFloorPlanCalibration:
        actions.floorPlanState.resetFloorPlanCalibration,
      clearFloorPlanTraceBuffers:
        actions.floorPlanState.clearFloorPlanTraceBuffers,
      clearAllSelection: actions.selection.clearAllSelection,
      prepareCameraForPlanTemplate:
        actions.navigation.prepareCameraForPlanTemplate,
      revokeUnderlayObjectUrl: actions.floorPlanState.revokeUnderlayObjectUrl,
      runHistoryTransaction: actions.history.runHistoryTransaction,
      runCoalescedHistoryTransaction:
        actions.history.runCoalescedHistoryTransaction,
      showRuleToast: actions.feedback.showToast,
    },
  };

  const tracing: TracingInput = {
    state: {
      activeRoom: document.activeRoom,
      housePlanRooms: plan.housePlanRooms,
      roomCount: document.designSnapshot.rooms.length,
      floorPlanUnderlay: floorPlan.floorPlanUnderlay,
      floorPlanTraceRoomType: floorPlan.floorPlanTraceRoomType,
      floorPlanTraceRoomMode: floorPlan.floorPlanTraceRoomMode,
      floorPlanDrawRoomMode: floorPlan.floorPlanDrawRoomMode,
      floorPlanDrawAngleLockMode: floorPlan.floorPlanDrawAngleLockMode,
      floorPlanExactWallLengthInput: floorPlan.floorPlanExactWallLengthInput,
      floorPlanTraceRoomPoints: floorPlan.floorPlanTraceRoomPoints,
      blankGridRoomDrawActive: floorPlan.blankGridRoomDrawActive,
      blankGridRoomPreviewPoint: floorPlan.blankGridRoomPreviewPoint,
      floorPlanTraceOpeningMode: floorPlan.floorPlanTraceOpeningMode,
      floorPlanTraceOpeningPoints: floorPlan.floorPlanTraceOpeningPoints,
      floorPlanTraceOpeningKind: floorPlan.floorPlanTraceOpeningKind,
      planOpenings: plan.openings,
      planGuidedActionsEnabled: plan.guidedActionsEnabled,
      isDesigner: editor.isDesigner,
      isClientPreview: editor.isClientPreview,
      editorMode: editor.editorMode,
      viewMode: editor.viewMode,
      selectedPlanRoomId: plan.selectedPlanRoomId,
      selectedPlanOverlayId: plan.selectedPlanOverlayId,
      selectedZoneId: plan.selectedZoneId,
    },
    refs: { selectedIdsRef: refs.selectedIds },
    actions: {
      history: actions.history.history,
      handleAddRoom: actions.room.handleAddRoom,
      setDesignSnapshot: actions.document.setDesignSnapshot,
      setPlanOpenings: actions.document.setPlanOpenings,
      setViewMode: actions.navigation.setViewMode,
      setDesignPanelOpen: actions.navigation.setDesignPanelOpen,
      setPlanFocusPanelRevealed:
        actions.navigation.setPlanFocusPanelRevealed,
      setPlanGuidedActionsEnabled:
        actions.floorPlanState.setPlanGuidedActionsEnabled,
      setPlanGuidedActionsChoiceSeen:
        actions.floorPlanState.setPlanGuidedActionsChoiceSeen,
      setBlankGridRoomPreviewPoint:
        actions.floorPlanState.setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomMode:
        actions.floorPlanState.setFloorPlanTraceRoomMode,
      setFloorPlanTraceRoomPoints:
        actions.floorPlanState.setFloorPlanTraceRoomPoints,
      setFloorPlanTraceOpeningMode:
        actions.floorPlanState.setFloorPlanTraceOpeningMode,
      setFloorPlanTraceOpeningPoints:
        actions.floorPlanState.setFloorPlanTraceOpeningPoints,
      activateFloorPlanSelectTool:
        actions.floorPlanState.activateFloorPlanSelectTool,
      activateFloorPlanCalibrationMode:
        actions.floorPlanState.activateFloorPlanCalibrationMode,
      activateFloorPlanRoomTrace:
        actions.floorPlanState.activateFloorPlanRoomTrace,
      activateFloorPlanRoomDrawMode:
        actions.floorPlanState.activateFloorPlanRoomDrawMode,
      activateFloorPlanOpeningTrace:
        actions.floorPlanState.activateFloorPlanOpeningTrace,
      handleSelectPlanOverlay: actions.selection.selectPlanOverlay,
      clearAllSelection: actions.selection.clearAllSelection,
      showRuleToast: actions.feedback.showToast,
    },
  };

  return {
    state: editing.state,
    derived: presentation.derived,
    actions: {
      ...editing.actions,
      clearPlanFocusPoints: presentation.actions.clearPlanFocusPoints,
    },
    configuration: { underlay, tracing },
    refs: editing.refs,
  };
}

export function useDesignPagePlanUnderlayFacade(input: UnderlayInput) {
  return useDesignPageFloorPlanUnderlayController(input);
}

export function useDesignPagePlanTracingFacade(input: TracingInput) {
  return useDesignPageFloorPlanTracing(input);
}
