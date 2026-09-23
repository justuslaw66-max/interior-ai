"use client";

import {
  useCallback,
  useMemo,
  type Dispatch,
  type SetStateAction,
} from "react";

import type { PlanStartMode } from "@/components/editor/DesignControlsPlanPanel";
import type { DesignPagePlanCanvasOverlaysActions } from "@/components/editor/design-page/DesignPagePlanCanvasOverlays";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanDrawRoomMode } from "@/lib/floor-plan-types";

export type UseDesignPagePlanCanvasActionsControllerInput = {
  actions: {
    setGuidedActionsChoiceSeen: Dispatch<SetStateAction<boolean>>;
    chooseGuidedActionsMode: (guided: boolean) => void;
    selectFloorPlanTool: () => void;
    setGuidedPlanStartMode: Dispatch<SetStateAction<PlanStartMode>>;
    changeCalibrationMode: (enabled: boolean) => void;
    changeDrawRoomMode: (mode: FloorPlanDrawRoomMode) => void;
    addFloorPlanOpening: (kind: RoomOpening2D["kind"]) => void;
    fitPlanView: () => void;
    setGuidedActionsEnabled: Dispatch<SetStateAction<boolean>>;
    undoFloorPlanTraceRoomPoint: () => void;
    clearPlanFocusPoints: () => void;
    setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
    setPlanFocusPanelRevealed: Dispatch<SetStateAction<boolean>>;
    goPlan: () => void;
    goFurnish: () => void;
    dismissPlanCanvasGuidance: Dispatch<SetStateAction<string | null>>;
  };
};

export type DesignPagePlanCanvasActionsController = {
  actions: DesignPagePlanCanvasOverlaysActions;
};

export function useDesignPagePlanCanvasActionsController({
  actions,
}: UseDesignPagePlanCanvasActionsControllerInput): DesignPagePlanCanvasActionsController {
  const closeGuidedActionsChoice = useCallback(() => {
    actions.setGuidedActionsChoiceSeen(true);
  }, [actions]);

  const startScaleFromManualActions = useCallback(() => {
    actions.setGuidedPlanStartMode("upload");
    actions.changeCalibrationMode(true);
  }, [actions]);

  const startRoomDraw = useCallback(() => {
    actions.setGuidedPlanStartMode("draw");
    actions.changeDrawRoomMode("rectangle_wall");
  }, [actions]);

  const toggleGuidedActions = useCallback(() => {
    actions.setGuidedActionsEnabled((enabled) => !enabled);
  }, [actions]);

  const togglePlanFocusPanel = useCallback(() => {
    actions.setDesignPanelOpen(true);
    actions.setPlanFocusPanelRevealed((revealed) => !revealed);
  }, [actions]);

  const finishPlanFocus = useCallback(() => {
    actions.selectFloorPlanTool();
    actions.setPlanFocusPanelRevealed(false);
  }, [actions]);

  const startScaleFromGuidance = useCallback(() => {
    actions.changeCalibrationMode(true);
  }, [actions]);

  const startEmptyPlanRoom = useCallback(() => {
    actions.setDesignPanelOpen(true);
    actions.goPlan();
    actions.setGuidedPlanStartMode("start");
  }, [actions]);

  const restoreDesignTools = useCallback(() => {
    actions.setDesignPanelOpen(true);
    actions.setPlanFocusPanelRevealed(false);
  }, [actions]);

  const controllerActions = useMemo(
    () => ({
      guidedActionsChoice: {
        close: closeGuidedActionsChoice,
        choose: actions.chooseGuidedActionsMode,
      },
      manualQuickActions: {
        select: actions.selectFloorPlanTool,
        startScale: startScaleFromManualActions,
        startRoomDraw,
        addOpening: actions.addFloorPlanOpening,
        fit: actions.fitPlanView,
      },
      guidedActionsToggle: { toggle: toggleGuidedActions },
      focusControl: {
        undo: actions.undoFloorPlanTraceRoomPoint,
        clear: actions.clearPlanFocusPoints,
        togglePanel: togglePlanFocusPanel,
        finish: finishPlanFocus,
      },
      guidance: {
        startScale: startScaleFromGuidance,
        addOpening: actions.addFloorPlanOpening,
        furnish: actions.goFurnish,
        dismiss: actions.dismissPlanCanvasGuidance,
      },
      emptyPrompt: { startRoom: startEmptyPlanRoom },
      restoreTools: { restore: restoreDesignTools },
    }),
    [
      actions.addFloorPlanOpening,
      actions.chooseGuidedActionsMode,
      actions.clearPlanFocusPoints,
      actions.dismissPlanCanvasGuidance,
      actions.fitPlanView,
      actions.goFurnish,
      actions.selectFloorPlanTool,
      actions.undoFloorPlanTraceRoomPoint,
      closeGuidedActionsChoice,
      finishPlanFocus,
      restoreDesignTools,
      startEmptyPlanRoom,
      startRoomDraw,
      startScaleFromGuidance,
      startScaleFromManualActions,
      toggleGuidedActions,
      togglePlanFocusPanel,
    ]
  );

  return { actions: controllerActions };
}
