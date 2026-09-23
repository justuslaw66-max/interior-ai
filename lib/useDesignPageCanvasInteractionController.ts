"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import {
  getPlanOverlayMoveHistoryLabel,
  type PlanOverlayDragKind,
} from "@/lib/design-page-floor-plan-utils";
import { syncGestureTransaction } from "@/lib/design-page-gesture-history";
import {
  rollbackInterruptedSceneItemDrag,
  SCENE_ITEM_DRAG_COMMAND_ID,
} from "@/lib/design-page-item-commands";
import type { HistoryManager } from "@/lib/historyManager";

type CanvasInteractionHistory = Pick<
  HistoryManager,
  "begin" | "commit" | "getStatus" | "rollbackContinuousCommand"
>;

export type UseDesignPageCanvasInteractionControllerInput = {
  state: {
    showGrid: boolean;
    snapEnabled: boolean;
    isDesigner: boolean;
  };
  refs: {
    orbitControls: MutableRefObject<OrbitControlsImpl | null>;
    cameraAnimating: MutableRefObject<boolean>;
  };
  actions: {
    history: CanvasInteractionHistory;
    /**
     * Closes a slider's still-open coalesced transaction. Room moves, room resizes and overlay
     * drags call it, through syncGestureTransaction, before opening their own: begin() refuses to
     * nest, so a gesture used to join the slider's undo entry, its end committed the slider's
     * transaction, and the slider's own commit then warned "No active transaction to commit".
     */
    flushCoalescedHistoryTransaction: () => void;
    updateCameraViewFromScene: () => void;
  };
};

export function useDesignPageCanvasInteractionController({
  state,
  refs,
  actions,
}: UseDesignPageCanvasInteractionControllerInput) {
  const { orbitControls: orbitControlsRef, cameraAnimating: cameraAnimatingRef } =
    refs;
  const { flushCoalescedHistoryTransaction, history, updateCameraViewFromScene } =
    actions;
  const [canvasObjectDragging, setCanvasObjectDragging] = useState(false);
  const [planRoomDragging, setPlanRoomDragging] = useState(false);
  const [planRoomResizing, setPlanRoomResizing] = useState(false);
  const [planOverlayDragging, setPlanOverlayDragging] = useState(false);
  const [gridPulse, setGridPulse] = useState(false);

  const roomDragHistoryActiveRef = useRef(false);
  const roomResizeHistoryActiveRef = useRef(false);
  const overlayDragHistoryActiveRef = useRef(false);
  const itemDragCommitRef = useRef(false);
  const gridPulseTimerRef = useRef<number | null>(null);

  const controlsEnabled =
    !canvasObjectDragging &&
    !planRoomDragging &&
    !planRoomResizing &&
    !planOverlayDragging;

  const setOrbitControlsEnabled = useCallback(
    (enabled: boolean) => {
      if (orbitControlsRef.current) {
        orbitControlsRef.current.enabled = enabled;
      }
    },
    [orbitControlsRef]
  );

  const changeCatalogObjectDragging = useCallback((dragging: boolean) => {
    setCanvasObjectDragging(dragging);
  }, []);

  const changeSceneItemDragging = useCallback(
    (dragging: boolean) => {
      setCanvasObjectDragging(dragging);
      if (dragging) {
        rollbackInterruptedSceneItemDrag(history);
        itemDragCommitRef.current = false;
        return;
      }

      if (itemDragCommitRef.current) {
        history.rollbackContinuousCommand(SCENE_ITEM_DRAG_COMMAND_ID);
        itemDragCommitRef.current = false;
      }
    },
    [history]
  );

  const syncGestureHistory = useCallback(
    (activeRef: MutableRefObject<boolean>, active: boolean, name: string) =>
      syncGestureTransaction(
        history,
        flushCoalescedHistoryTransaction,
        activeRef,
        active,
        name
      ),
    [flushCoalescedHistoryTransaction, history]
  );

  const changePlanRoomDragging = useCallback(
    (dragging: boolean) => {
      syncGestureHistory(roomDragHistoryActiveRef, dragging, "Move room");
      setPlanRoomDragging(dragging);
      setOrbitControlsEnabled(
        !dragging &&
          !canvasObjectDragging &&
          !planRoomResizing &&
          !planOverlayDragging
      );
    },
    [
      canvasObjectDragging,
      planOverlayDragging,
      planRoomResizing,
      setOrbitControlsEnabled,
      syncGestureHistory,
    ]
  );

  const changePlanOverlayDragging = useCallback(
    (dragging: boolean, kind?: PlanOverlayDragKind) => {
      syncGestureHistory(
        overlayDragHistoryActiveRef,
        dragging,
        getPlanOverlayMoveHistoryLabel(kind)
      );
      setPlanOverlayDragging(dragging);
      setOrbitControlsEnabled(
        !dragging &&
          !canvasObjectDragging &&
          !planRoomDragging &&
          !planRoomResizing
      );
    },
    [
      canvasObjectDragging,
      planRoomDragging,
      planRoomResizing,
      setOrbitControlsEnabled,
      syncGestureHistory,
    ]
  );

  const changePlanOpeningDragging = useCallback(
    (dragging: boolean) => {
      changePlanOverlayDragging(dragging, "opening");
    },
    [changePlanOverlayDragging]
  );

  const changePlanRoomResizing = useCallback(
    (resizing: boolean) => {
      syncGestureHistory(roomResizeHistoryActiveRef, resizing, "Resize room");
      setPlanRoomResizing(resizing);
      setOrbitControlsEnabled(
        !resizing &&
          !canvasObjectDragging &&
          !planRoomDragging &&
          !planOverlayDragging
      );
    },
    [
      canvasObjectDragging,
      planOverlayDragging,
      planRoomDragging,
      setOrbitControlsEnabled,
      syncGestureHistory,
    ]
  );

  const pulseSnapGrid = useCallback(() => {
    if (!state.showGrid || !state.snapEnabled || !state.isDesigner) return;

    setGridPulse(true);
    if (gridPulseTimerRef.current !== null) {
      window.clearTimeout(gridPulseTimerRef.current);
    }
    gridPulseTimerRef.current = window.setTimeout(() => {
      gridPulseTimerRef.current = null;
      setGridPulse(false);
    }, 240);
  }, [state.isDesigner, state.showGrid, state.snapEnabled]);

  const handleOrbitChange = useCallback(() => {
    if (!cameraAnimatingRef.current) {
      updateCameraViewFromScene();
    }
  }, [cameraAnimatingRef, updateCameraViewFromScene]);

  useEffect(
    () => () => {
      if (gridPulseTimerRef.current !== null) {
        window.clearTimeout(gridPulseTimerRef.current);
      }
    },
    []
  );

  const controllerActions = useMemo(
    () => ({
      changeCatalogObjectDragging,
      changeSceneItemDragging,
      changePlanRoomDragging,
      changePlanRoomResizing,
      changePlanOverlayDragging,
      changePlanOpeningDragging,
      pulseSnapGrid,
      handleOrbitChange,
    }),
    [
      changeCatalogObjectDragging,
      changePlanOpeningDragging,
      changePlanOverlayDragging,
      changePlanRoomDragging,
      changePlanRoomResizing,
      changeSceneItemDragging,
      handleOrbitChange,
      pulseSnapGrid,
    ]
  );

  return {
    state: {
      canvasObjectDragging,
      planRoomDragging,
      planRoomResizing,
      planOverlayDragging,
      controlsEnabled,
      gridPulse,
    },
    refs: { itemDragCommit: itemDragCommitRef },
    actions: controllerActions,
  };
}
