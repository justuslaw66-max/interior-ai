"use client";

import { useCallback, useEffect } from "react";

import { useFloorManager } from "@/lib/useFloorManager";
import { useDesignPageHousePlanState } from "@/lib/useDesignPageHousePlanState";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";

type HousePlanInput = Parameters<typeof useDesignPageHousePlanState>[0];
type FloorManagerInput = Parameters<typeof useFloorManager>[0];

export type UseDesignPageRoomFloorWorkspaceInput = {
  state: {
    document: {
      designSnapshot: HousePlanInput["designSnapshot"];
    };
    editor: {
      viewMode: FloorManagerInput["viewMode"];
      editorMode: DesignPageEditorMode;
      designControlsPanelVisible: boolean;
    };
    plan: {
      focusPanelRevealed: boolean;
      floorPlanCalibrationMode: boolean;
      floorPlanTraceRoomMode: boolean;
      floorPlanTraceOpeningMode: boolean;
    };
  };
  configuration: {
    isDesigner: boolean;
    isClientPreview: boolean;
  };
  refs: Pick<
    FloorManagerInput,
    | "actionAdaptersRef"
    | "cameraViewRef"
    | "designSnapshotRef"
    | "floorCameraViewsRef"
    | "history"
  >;
  actions: {
    document: {
      setDesignSnapshot: HousePlanInput["setDesignSnapshot"];
      setPlanOpenings: FloorManagerInput["setPlanOpenings"];
    };
    history: {
      runTransaction: (
        name: string,
        action: () => void
      ) => void;
    };
    plan: {
      setFocusPanelRevealed: (revealed: boolean) => void;
      setSelectedPlanRoomId: FloorManagerInput["setSelectedPlanRoomId"];
    };
    feedback: {
      showToast: FloorManagerInput["showRuleToast"];
    };
  };
};

/**
 * Composes room and floor orchestration without changing the established hook
 * order: house state, history-wrapped room actions, focus reset, then floors.
 */
export function useDesignPageRoomFloorWorkspace({
  state: {
    document: { designSnapshot },
    editor: { viewMode, editorMode, designControlsPanelVisible },
    plan: {
      focusPanelRevealed,
      floorPlanCalibrationMode,
      floorPlanTraceRoomMode,
      floorPlanTraceOpeningMode,
    },
  },
  configuration,
  refs,
  actions,
}: UseDesignPageRoomFloorWorkspaceInput) {
  const { setDesignSnapshot, setPlanOpenings } = actions.document;
  const { runTransaction } = actions.history;
  const { setFocusPanelRevealed, setSelectedPlanRoomId } = actions.plan;
  const { showToast } = actions.feedback;

  const house = useDesignPageHousePlanState({
    designSnapshot,
    setDesignSnapshot,
    isPlanView2D: viewMode === "2d",
  });
  const {
    handleAddRoom: handleAddRoomFromHousePlanState,
    handleRenameRoom: handleRenameRoomFromHousePlanState,
  } = house;

  const handleAddRoom = useCallback(
    (...args: Parameters<typeof handleAddRoomFromHousePlanState>) => {
      runTransaction("Add room", () => {
        handleAddRoomFromHousePlanState(...args);
      });
    },
    [handleAddRoomFromHousePlanState, runTransaction]
  );
  const handleRenameRoom = useCallback(
    (...args: Parameters<typeof handleRenameRoomFromHousePlanState>) => {
      runTransaction("Rename room", () => {
        handleRenameRoomFromHousePlanState(...args);
      });
    },
    [handleRenameRoomFromHousePlanState, runTransaction]
  );

  const activePlanCanvasInteraction =
    !configuration.isDesigner &&
    !configuration.isClientPreview &&
    viewMode === "2d" &&
    editorMode === "design" &&
    (floorPlanCalibrationMode ||
      floorPlanTraceRoomMode ||
      floorPlanTraceOpeningMode);
  useEffect(() => {
    if (!activePlanCanvasInteraction) {
      setFocusPanelRevealed(false);
    }
  }, [activePlanCanvasInteraction, setFocusPanelRevealed]);

  const planCanvasFocusActive =
    activePlanCanvasInteraction && !focusPanelRevealed;
  const designControlsPanelVisibleForLayout =
    designControlsPanelVisible && !planCanvasFocusActive;
  const commercePanelVisibleForLayout =
    editorMode === "buy" && !configuration.isClientPreview;
  const shoppingPanelVisibleForLayout = commercePanelVisibleForLayout;

  const floor = useFloorManager({
    actionAdaptersRef: refs.actionAdaptersRef,
    activeRoom: house.activeRoom,
    cameraViewRef: refs.cameraViewRef,
    designSnapshot,
    designSnapshotRef: refs.designSnapshotRef,
    floorCameraViewsRef: refs.floorCameraViewsRef,
    history: refs.history,
    roomDepth: house.roomDepth,
    roomHeight: house.roomHeight,
    roomWidth: house.roomWidth,
    setDesignSnapshot,
    setPlanOpenings,
    setSelectedPlanRoomId,
    showRuleToast: showToast,
    viewMode,
    wallThickness: house.wallThickness,
  });

  return {
    boundaries: { house, floor },
    state: {
      room: {
        roomWidthInput: house.roomWidthInput,
        roomDepthInput: house.roomDepthInput,
        newRoomType: house.newRoomType,
        newRoomShape: house.newRoomShape,
      },
      floor: {
        hiddenFloorLevels: floor.hiddenFloorLevels,
        stackedFloorView: floor.stackedFloorView,
      },
      plan: { focusPanelRevealed },
    },
    derived: {
      room: {
        activeRoom: house.activeRoom,
        roomWidth: house.roomWidth,
        roomDepth: house.roomDepth,
        roomHeight: house.roomHeight,
        wallThickness: house.wallThickness,
        activeRoomPresetId: house.activeRoomPresetId,
        items: house.items,
        zones: house.zones,
      },
      plan: {
        housePlan2D: house.housePlan2D,
        activeRoomPlanOffset: house.activeRoomPlanOffset,
        planViewWidth: house.planViewWidth,
        planViewDepth: house.planViewDepth,
        activePlanCanvasInteraction,
        planCanvasFocusActive,
        designControlsPanelVisibleForLayout,
        commercePanelVisibleForLayout,
        shoppingPanelVisibleForLayout,
      },
      floor: {
        activeFloorLevel: floor.activeFloorLevel,
        activeFloorRoomCount: floor.activeFloorRoomCount,
        floorOptions: floor.floorOptions,
      },
    },
    actions: {
      room: {
        clampToActiveRoom: house.clampToActiveRoom,
        setRoomWidthInput: house.setRoomWidthInput,
        setRoomDepthInput: house.setRoomDepthInput,
        setNewRoomType: house.setNewRoomType,
        setNewRoomShape: house.setNewRoomShape,
        handleAddRoom,
        handleRenameRoom,
        handleMoveRoom2D: house.handleMoveRoom2D,
      },
      floor: {
        handleAddFloor: floor.handleAddFloor,
        handleDeleteFloor: floor.handleDeleteFloor,
        handleDuplicateFloor: floor.handleDuplicateFloor,
        handleRenameFloor: floor.handleRenameFloor,
        handleSwitchFloor: floor.handleSwitchFloor,
        handleToggleFloorVisibility: floor.handleToggleFloorVisibility,
        setStackedFloorView: floor.setStackedFloorView,
      },
      plan: { setFocusPanelRevealed },
    },
    configuration,
    refs,
  };
}
