"use client";

import {
  useDesignPagePlanOverlayController,
  type UseDesignPagePlanOverlayControllerInput,
} from "@/lib/useDesignPagePlanOverlayController";
import {
  useDesignPagePlanQualityController,
  type UseDesignPagePlanQualityControllerInput,
} from "@/lib/useDesignPagePlanQualityController";
import {
  useDesignPageRoomPlanController,
  type UseDesignPageRoomPlanControllerInput,
} from "@/lib/useDesignPageRoomPlanController";
import {
  useDesignPageSelectionInspectorModel,
  type UseDesignPageSelectionInspectorModelParams,
} from "@/lib/useDesignPageSelectionInspectorModel";

type RoomPlanInput = UseDesignPageRoomPlanControllerInput;
type OverlayInput = UseDesignPagePlanOverlayControllerInput;
type QualityInput = UseDesignPagePlanQualityControllerInput;
type InspectorInput = UseDesignPageSelectionInspectorModelParams;

export type UseDesignPagePlanEditingFacadeInput = {
  state: {
    document: {
      designSnapshot: RoomPlanInput["state"]["designSnapshot"];
      activeRoom: RoomPlanInput["state"]["activeRoom"];
      items: OverlayInput["state"]["items"];
    };
    plan: {
      housePlanRooms: RoomPlanInput["state"]["housePlanRooms"];
      selectedPlanRoomId: RoomPlanInput["state"]["selectedPlanRoomId"];
      selectedPlanRoom: RoomPlanInput["state"]["selectedPlanRoom"];
      annotations: OverlayInput["state"]["planAnnotations"];
      openings: OverlayInput["state"]["planOpenings"];
      fixedElements: OverlayInput["state"]["planFixedElements"];
      suppressedDoorwaySuggestionKeys: OverlayInput["state"]["suppressedDoorwaySuggestionKeys"];
      selectedPlanOverlayId: InspectorInput["state"]["selectedPlanOverlayId"];
      canvasInteractionActive: QualityInput["state"]["planCanvasInteractionActive"];
    };
    selection: {
      selectedIds: InspectorInput["state"]["selectedIds"];
      selectedInstanceId: OverlayInput["state"]["selectedInstanceId"];
      selectedItem: InspectorInput["state"]["selectedItem"];
      selectedItemPlanningDimensionsMm: InspectorInput["state"]["selectedItemPlanningDimensionsMm"];
      selectedProduct: InspectorInput["state"]["selectedProduct"];
    };
    editor: {
      editorMode: InspectorInput["state"]["editorMode"];
      isClientPreview: QualityInput["state"]["isClientPreview"];
      viewMode: QualityInput["state"]["viewMode"];
    };
    surfaceInspector: InspectorInput["state"]["surfaceInspector"];
  };
  derived: {
    itemPlanningBoundsByInstanceId: OverlayInput["state"]["itemPlanningBoundsByInstanceId"];
  };
  configuration: {
    canEdit: RoomPlanInput["configuration"]["canEdit"];
    catalogItems: RoomPlanInput["configuration"]["catalogItems"];
    resolveConfiguredPlanningDimsMm: RoomPlanInput["configuration"]["resolveConfiguredPlanningDimsMm"];
    roomWidth: OverlayInput["configuration"]["roomWidth"];
    roomDepth: OverlayInput["configuration"]["roomDepth"];
    roomHeight: OverlayInput["configuration"]["roomHeight"];
    planViewWidth: OverlayInput["configuration"]["planViewWidth"];
    planViewDepth: OverlayInput["configuration"]["planViewDepth"];
    planMeasurementUnit: InspectorInput["configuration"]["planMeasurementUnit"];
    houseRoomById: InspectorInput["configuration"]["houseRoomById"];
    qualityReviewPanel: QualityInput["configuration"];
  };
  refs: {
    designSnapshot: RoomPlanInput["refs"]["designSnapshot"];
    planOpenings: OverlayInput["refs"]["planOpenings"];
  };
  actions: {
    document: Pick<
      RoomPlanInput["actions"],
      "setDesignSnapshot" | "setPlanOpenings"
    > &
      Pick<
        OverlayInput["actions"],
        | "setPlanTheme"
        | "setPlanLayers"
        | "setPlanLayerPreset"
        | "setPlanAnnotations"
        | "setPlanFixedElements"
      >;
    selection: {
      clearNonRoomSelection: RoomPlanInput["actions"]["clearNonRoomSelection"];
      selectPlanOverlay: OverlayInput["actions"]["selectPlanOverlay"];
      selectPlanRoom: QualityInput["actions"]["selectPlanRoom"];
      updateSelection: QualityInput["actions"]["updateSelection"];
    };
    room: Pick<
      RoomPlanInput["actions"],
      | "setSelectedPlanRoomId"
      | "setRoomWidthInput"
      | "setRoomDepthInput"
      | "renameRoom"
      | "moveRoom2D"
    >;
    navigation: Pick<
      QualityInput["actions"],
      "goPlan" | "goFurnish" | "setViewMode"
    > & {
      setTraceOpeningKind: QualityInput["actions"]["setTraceOpeningKind"];
    };
    history: Pick<
      RoomPlanInput["actions"],
      "history" | "runHistoryTransaction"
    >;
    feedback: {
      showToast: RoomPlanInput["actions"]["showToast"];
      track: OverlayInput["actions"]["track"];
    };
  };
};

export function useDesignPagePlanEditingFacade({
  state,
  derived,
  configuration,
  refs,
  actions,
}: UseDesignPagePlanEditingFacadeInput) {
  const room = useDesignPageRoomPlanController({
    state: {
      designSnapshot: state.document.designSnapshot,
      activeRoom: state.document.activeRoom,
      housePlanRooms: state.plan.housePlanRooms,
      selectedPlanRoomId: state.plan.selectedPlanRoomId,
      selectedPlanRoom: state.plan.selectedPlanRoom,
    },
    configuration: {
      canEdit: configuration.canEdit,
      viewMode: state.editor.viewMode,
      catalogItems: configuration.catalogItems,
      resolveConfiguredPlanningDimsMm:
        configuration.resolveConfiguredPlanningDimsMm,
    },
    refs: { designSnapshot: refs.designSnapshot },
    actions: {
      setDesignSnapshot: actions.document.setDesignSnapshot,
      setPlanOpenings: actions.document.setPlanOpenings,
      setSelectedPlanRoomId: actions.room.setSelectedPlanRoomId,
      setRoomWidthInput: actions.room.setRoomWidthInput,
      setRoomDepthInput: actions.room.setRoomDepthInput,
      clearNonRoomSelection: actions.selection.clearNonRoomSelection,
      renameRoom: actions.room.renameRoom,
      moveRoom2D: actions.room.moveRoom2D,
      history: actions.history.history,
      runHistoryTransaction: actions.history.runHistoryTransaction,
      showToast: actions.feedback.showToast,
    },
  });

  const overlay = useDesignPagePlanOverlayController({
    state: {
      activeRoomId: state.document.designSnapshot.activeRoomId,
      activeRoomName: state.document.activeRoom?.name,
      housePlanRooms: state.plan.housePlanRooms,
      items: state.document.items,
      itemPlanningBoundsByInstanceId:
        derived.itemPlanningBoundsByInstanceId,
      selectedInstanceId: state.selection.selectedInstanceId,
      planAnnotations: state.plan.annotations,
      planOpenings: state.plan.openings,
      planFixedElements: state.plan.fixedElements,
      suppressedDoorwaySuggestionKeys:
        state.plan.suppressedDoorwaySuggestionKeys,
    },
    configuration: {
      catalogItems: configuration.catalogItems,
      roomWidth: configuration.roomWidth,
      roomDepth: configuration.roomDepth,
      roomHeight: configuration.roomHeight,
      planViewWidth: configuration.planViewWidth,
      planViewDepth: configuration.planViewDepth,
    },
    refs: { planOpenings: refs.planOpenings },
    actions: {
      setPlanTheme: actions.document.setPlanTheme,
      setPlanLayers: actions.document.setPlanLayers,
      setPlanLayerPreset: actions.document.setPlanLayerPreset,
      setPlanAnnotations: actions.document.setPlanAnnotations,
      setPlanOpenings: actions.document.setPlanOpenings,
      setPlanFixedElements: actions.document.setPlanFixedElements,
      selectPlanOverlay: actions.selection.selectPlanOverlay,
      runHistoryTransaction: actions.history.runHistoryTransaction,
      showToast: actions.feedback.showToast,
      track: actions.feedback.track,
    },
  });

  const quality = useDesignPagePlanQualityController({
    state: {
      designSnapshot: state.document.designSnapshot,
      housePlanRooms: state.plan.housePlanRooms,
      planOpenings: state.plan.openings,
      viewMode: state.editor.viewMode,
      isClientPreview: state.editor.isClientPreview,
      planCanvasInteractionActive: state.plan.canvasInteractionActive,
    },
    configuration: configuration.qualityReviewPanel,
    actions: {
      switchRoom: room.actions.switchRoom,
      goPlan: actions.navigation.goPlan,
      goFurnish: actions.navigation.goFurnish,
      setViewMode: actions.navigation.setViewMode,
      clearNonRoomSelection: actions.selection.clearNonRoomSelection,
      selectPlanRoom: actions.selection.selectPlanRoom,
      setTraceOpeningKind: actions.navigation.setTraceOpeningKind,
      updateSelection: actions.selection.updateSelection,
      showToast: actions.feedback.showToast,
    },
  });

  const inspector = useDesignPageSelectionInspectorModel({
    state: {
      activeRoomName: state.document.activeRoom?.name ?? null,
      editorMode: state.editor.editorMode,
      isClientPreview: state.editor.isClientPreview,
      items: state.document.items,
      planAnnotations: state.plan.annotations,
      planFixedElements: state.plan.fixedElements,
      planOpenings: state.plan.openings,
      selectedIds: state.selection.selectedIds,
      selectedItem: state.selection.selectedItem,
      selectedItemPlanningDimensionsMm:
        state.selection.selectedItemPlanningDimensionsMm,
      selectedPlanOverlayId: state.plan.selectedPlanOverlayId,
      selectedPlanRoom: state.plan.selectedPlanRoom,
      selectedProduct: state.selection.selectedProduct,
      surfaceInspector: state.surfaceInspector,
    },
    configuration: {
      houseRoomById: configuration.houseRoomById,
      housePlanRooms: state.plan.housePlanRooms,
      planDepthMeters: configuration.planViewDepth,
      planMeasurementUnit: configuration.planMeasurementUnit,
      planWidthMeters: configuration.planViewWidth,
      roomHeightMeters: configuration.roomHeight,
    },
  });

  return {
    state: {
      room: room.state,
      overlay: overlay.state,
      quality: quality.state,
      inspector: inspector.state,
    },
    refs: { quality: quality.refs },
    actions: {
      room: room.actions,
      overlay: overlay.actions,
      quality: quality.actions,
    },
  };
}
