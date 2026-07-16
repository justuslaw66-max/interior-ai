"use client";

import type { useDesignPageDocumentHistoryController } from "@/lib/useDesignPageDocumentHistoryController";
import type {
  useDesignPageFloorPlanDocumentState,
  useDesignPagePlanDocumentState,
  useDesignPageSnapshotDocumentState,
} from "@/lib/useDesignPageDocumentStateController";
import type { useDesignPageHousePlanState } from "@/lib/useDesignPageHousePlanState";
import type { useDesignPageItemSelectionController } from "@/lib/useDesignPageItemSelectionController";
import {
  useDesignPagePlanWorkspaceFacade,
  type UseDesignPagePlanWorkspaceFacadeInput,
} from "@/lib/useDesignPagePlanWorkspaceFacade";
import type { useDesignPageProductInspectionController } from "@/lib/useDesignPageProductInspectionController";
import type { useDesignPageRoomReadModel } from "@/lib/useDesignPageRoomReadModel";
import type { useDesignPageSceneReadModel } from "@/lib/useDesignPageSceneReadModel";
import type { useDesignPageSelectionCoordinator } from "@/lib/useDesignPageSelectionCoordinator";
import type { DesignPageCameraBridgeController } from "@/lib/useDesignPageCameraBridgeController";

type WorkspaceInput = UseDesignPagePlanWorkspaceFacadeInput;
type PlanDocumentBoundary = ReturnType<
  typeof useDesignPagePlanDocumentState
>;
type FloorPlanDocumentBoundary = ReturnType<
  typeof useDesignPageFloorPlanDocumentState
>;
type SnapshotDocumentBoundary = ReturnType<
  typeof useDesignPageSnapshotDocumentState
>;
type DocumentHistoryBoundary = ReturnType<
  typeof useDesignPageDocumentHistoryController
>;
type HousePlanBoundary = ReturnType<typeof useDesignPageHousePlanState>;
type SceneReadBoundary = ReturnType<typeof useDesignPageSceneReadModel>;
type RoomReadBoundary = ReturnType<typeof useDesignPageRoomReadModel>;
type ItemSelectionBoundary = ReturnType<
  typeof useDesignPageItemSelectionController
>;
type SelectionCoordinationBoundary = ReturnType<
  typeof useDesignPageSelectionCoordinator
>;
type ProductInspectionBoundary = ReturnType<
  typeof useDesignPageProductInspectionController
>;

type ResidualPlanState = Pick<
  WorkspaceInput["state"]["plan"],
  | "selectedPlanRoomId"
  | "suppressedDoorwaySuggestionKeys"
  | "selectedPlanOverlayId"
  | "canvasInteractionActive"
  | "canvasFocusActive"
  | "dismissedCanvasGuidanceKey"
  | "selectedZoneId"
>;

export type UseDesignPagePlanWorkspaceRegistrationFacadeInput = {
  boundaries: {
    document: PlanDocumentBoundary;
    floorPlan: FloorPlanDocumentBoundary;
    snapshot: SnapshotDocumentBoundary;
    history: DocumentHistoryBoundary;
    house: HousePlanBoundary;
    sceneRoom: {
      scene: SceneReadBoundary;
      room: RoomReadBoundary;
    };
    selection: {
      items: ItemSelectionBoundary;
      coordination: SelectionCoordinationBoundary;
    };
    inspection: ProductInspectionBoundary;
    cameraBridge: DesignPageCameraBridgeController;
  };
  state: {
    plan: ResidualPlanState;
    editor: WorkspaceInput["state"]["editor"];
    layout: WorkspaceInput["state"]["layout"];
    export: Pick<WorkspaceInput["state"]["export"], "sceneReady">;
  };
  configuration: Omit<
    WorkspaceInput["configuration"],
    | "resolveConfiguredPlanningDimsMm"
    | "planMeasurementUnit"
    | "houseRoomById"
  >;
  actions: {
    selection: Pick<
      WorkspaceInput["actions"]["selection"],
      "setSelectedPlanOverlayId"
    >;
    room: Pick<
      WorkspaceInput["actions"]["room"],
      "setSelectedPlanRoomId" | "handleAddRoom" | "renameRoom"
    >;
    navigation: Omit<
      WorkspaceInput["actions"]["navigation"],
      "prepareCameraForPlanTemplate"
    >;
    feedback: WorkspaceInput["actions"]["feedback"];
  };
};

/**
 * Maps already-registered controller boundaries to the plan workspace input.
 * Underlay and tracing remain deferred configuration returned by the existing
 * facade, so their hooks can keep their later registration slots.
 */
export function buildDesignPagePlanWorkspaceRegistrationInput({
  boundaries,
  state,
  configuration,
  actions,
}: UseDesignPagePlanWorkspaceRegistrationFacadeInput): WorkspaceInput {
  const {
    document,
    floorPlan,
    snapshot,
    history,
    house,
    sceneRoom: { scene, room },
    selection: { items: selection, coordination },
    inspection,
    cameraBridge,
  } = boundaries;

  return {
    state: {
      document: {
        designSnapshot: snapshot.state.designSnapshot,
        activeRoom: house.activeRoom ?? null,
        items: house.items,
      },
      plan: {
        housePlanRooms: house.housePlan2D.rooms,
        selectedPlanRoomId: state.plan.selectedPlanRoomId,
        selectedPlanRoom: scene.derived.selectedPlanRoomContext,
        annotations: document.state.planAnnotations,
        openings: document.state.planOpenings,
        fixedElements: document.state.planFixedElements,
        suppressedDoorwaySuggestionKeys:
          state.plan.suppressedDoorwaySuggestionKeys,
        selectedPlanOverlayId: state.plan.selectedPlanOverlayId,
        canvasInteractionActive: state.plan.canvasInteractionActive,
        hasWholeHousePlan: scene.derived.hasWholeHousePlan,
        layers: document.state.planLayers,
        theme: document.state.planTheme,
        guidedActionsEnabled: document.state.planGuidedActionsEnabled,
        guidedActionsChoiceSeen: document.state.planGuidedActionsChoiceSeen,
        settingsLoaded: document.state.planSettingsLoaded,
        canvasFocusActive: state.plan.canvasFocusActive,
        dismissedCanvasGuidanceKey:
          state.plan.dismissedCanvasGuidanceKey,
        activeFloorPlanTool: floorPlan.state.activeFloorPlanTool,
        selectedZoneId: state.plan.selectedZoneId,
      },
      floorPlan: {
        floorPlanUnderlay: floorPlan.state.floorPlanUnderlay,
        calibrationPoints: floorPlan.state.floorPlanCalibrationPoints,
        calibrationDistanceInput:
          floorPlan.state.floorPlanCalibrationDistanceInput,
        calibrationMode: floorPlan.state.floorPlanCalibrationMode,
        floorPlanTraceRoomType: floorPlan.state.floorPlanTraceRoomType,
        floorPlanTraceRoomMode: floorPlan.state.floorPlanTraceRoomMode,
        floorPlanDrawRoomMode: floorPlan.state.floorPlanDrawRoomMode,
        floorPlanDrawAngleLockMode:
          floorPlan.state.floorPlanDrawAngleLockMode,
        floorPlanExactWallLengthInput:
          floorPlan.state.floorPlanExactWallLengthInput,
        floorPlanTraceRoomPoints: floorPlan.state.floorPlanTraceRoomPoints,
        blankGridRoomDrawActive: floorPlan.state.blankGridRoomDrawActive,
        blankGridRoomPreviewPoint:
          floorPlan.state.blankGridRoomPreviewPoint,
        floorPlanTraceOpeningMode:
          floorPlan.state.floorPlanTraceOpeningMode,
        floorPlanTraceOpeningPoints:
          floorPlan.state.floorPlanTraceOpeningPoints,
        floorPlanTraceOpeningKind:
          floorPlan.state.floorPlanTraceOpeningKind,
      },
      room: {
        roomWidth: house.roomWidth,
        roomDepth: house.roomDepth,
        roomHeight: house.roomHeight,
        wallThickness: house.wallThickness,
        planViewWidth: house.planViewWidth,
        planViewDepth: house.planViewDepth,
      },
      selection: {
        selectedIds: selection.state.selectedIds,
        selectedInstanceId: selection.state.selectedInstanceId,
        selectedItem: selection.state.selectedItem,
        selectedItemPlanningDimensionsMm:
          inspection.derived.selectedItemPlanningDimensionsMm,
        selectedProduct: inspection.derived.selectedProduct,
      },
      editor: state.editor,
      layout: state.layout,
      export: {
        shoppableCount:
          room.derived.wholeHomeShoppingSummary.shoppableCount,
        sceneReady: state.export.sceneReady,
        exportStylePreset: document.state.exportStylePreset,
      },
      surfaceInspector: {
        displayName: room.derived.surfaceInspectorDisplayName,
        isCeiling: room.derived.surfaceInspectorIsCeiling,
        isWall: room.derived.surfaceInspectorIsWall,
        wallDefaultHeight: room.derived.wallInspectorDefaultHeight,
        wallFaceId: room.derived.wallInspectorFaceId,
        wallHeight: room.derived.wallInspectorHeight,
      },
    },
    derived: {
      itemPlanningBoundsByInstanceId:
        inspection.derived.itemPlanningBoundsByInstanceId,
    },
    configuration: {
      ...configuration,
      resolveConfiguredPlanningDimsMm:
        inspection.resolvers.resolveConfiguredPlanningDimsMm,
      planMeasurementUnit: document.state.planMeasurementUnit,
      houseRoomById: scene.derived.houseRoomById,
    },
    refs: {
      designSnapshot: snapshot.refs.designSnapshotRef,
      planOpenings: document.refs.planOpeningsRef,
      floorCameraViews: cameraBridge.refs.floorCameraViews,
      underlayObjectUrl: floorPlan.refs.floorPlanUnderlayUrlRef,
      pdfSourceData: floorPlan.refs.floorPlanPdfSourceDataRef,
      selectedIds: selection.refs.selectedIds,
    },
    actions: {
      document: {
        setDesignSnapshot: snapshot.actions.setDesignSnapshot,
        setPlanOpenings: document.actions.setPlanOpenings,
        setPlanTheme: document.actions.setPlanTheme,
        setPlanLayers: document.actions.setPlanLayers,
        setPlanLayerPreset: document.actions.setPlanLayerPreset,
        setPlanAnnotations: document.actions.setPlanAnnotations,
        setPlanFixedElements: document.actions.setPlanFixedElements,
      },
      selection: {
        clearNonRoomSelection: coordination.actions.clearNonRoomSelection,
        selectPlanOverlay: coordination.actions.handleSelectPlanOverlay,
        selectPlanRoom: actions.room.setSelectedPlanRoomId,
        updateSelection: selection.actions.updateSelection,
        clearAllSelection: coordination.actions.clearAllSelection,
        setSelectedPlanOverlayId:
          actions.selection.setSelectedPlanOverlayId,
      },
      room: {
        setSelectedPlanRoomId: actions.room.setSelectedPlanRoomId,
        setRoomWidthInput: house.setRoomWidthInput,
        setRoomDepthInput: house.setRoomDepthInput,
        renameRoom: actions.room.renameRoom,
        moveRoom2D: house.handleMoveRoom2D,
        handleAddRoom: actions.room.handleAddRoom,
      },
      navigation: {
        ...actions.navigation,
        prepareCameraForPlanTemplate:
          cameraBridge.actions.navigation.prepareCameraForPlanTemplate,
      },
      history: {
        history: history.refs.history,
        runHistoryTransaction: history.actions.runHistoryTransaction,
        runCoalescedHistoryTransaction:
          history.actions.runCoalescedHistoryTransaction,
      },
      feedback: actions.feedback,
      floorPlanState: {
        setFloorPlanUnderlay: floorPlan.actions.setFloorPlanUnderlay,
        setFloorPlanPdfSourceReady:
          floorPlan.actions.setFloorPlanPdfSourceReady,
        setFloorPlanPdfRenderingPage:
          floorPlan.actions.setFloorPlanPdfRenderingPage,
        setFloorPlanCalibrationPoints:
          floorPlan.actions.setFloorPlanCalibrationPoints,
        resetFloorPlanInteraction: floorPlan.actions.resetFloorPlanInteraction,
        resetFloorPlanCalibration: floorPlan.actions.resetFloorPlanCalibration,
        clearFloorPlanTraceBuffers:
          floorPlan.actions.clearFloorPlanTraceBuffers,
        revokeUnderlayObjectUrl:
          floorPlan.actions.revokeFloorPlanUnderlayUrl,
        setPlanGuidedActionsEnabled:
          document.actions.setPlanGuidedActionsEnabled,
        setPlanGuidedActionsChoiceSeen:
          document.actions.setPlanGuidedActionsChoiceSeen,
        setBlankGridRoomPreviewPoint:
          floorPlan.actions.setBlankGridRoomPreviewPoint,
        setFloorPlanTraceRoomMode:
          floorPlan.actions.setFloorPlanTraceRoomMode,
        setFloorPlanTraceRoomPoints:
          floorPlan.actions.setFloorPlanTraceRoomPoints,
        setFloorPlanTraceOpeningMode:
          floorPlan.actions.setFloorPlanTraceOpeningMode,
        setFloorPlanTraceOpeningPoints:
          floorPlan.actions.setFloorPlanTraceOpeningPoints,
        activateFloorPlanSelectTool:
          floorPlan.actions.activateFloorPlanSelectTool,
        activateFloorPlanCalibrationMode:
          floorPlan.actions.activateFloorPlanCalibrationMode,
        activateFloorPlanRoomTrace:
          floorPlan.actions.activateFloorPlanRoomTrace,
        activateFloorPlanRoomDrawMode:
          floorPlan.actions.activateFloorPlanRoomDrawMode,
        activateFloorPlanOpeningTrace:
          floorPlan.actions.activateFloorPlanOpeningTrace,
      },
    },
  };
}

/** Registers the composed plan hook once at the existing workspace slot. */
export function useDesignPagePlanWorkspaceRegistrationFacade(
  input: UseDesignPagePlanWorkspaceRegistrationFacadeInput
) {
  return useDesignPagePlanWorkspaceFacade(
    buildDesignPagePlanWorkspaceRegistrationInput(input)
  );
}
