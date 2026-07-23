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
  const { history, updateCameraViewFromScene } = actions;
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

  const changePlanRoomDragging = useCallback(
    (dragging: boolean) => {
      if (dragging && !roomDragHistoryActiveRef.current) {
        history.begin("Move room");
        roomDragHistoryActiveRef.current = true;
      } else if (!dragging && roomDragHistoryActiveRef.current) {
        history.commit();
        roomDragHistoryActiveRef.current = false;
      }

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
      history,
      planOverlayDragging,
      planRoomResizing,
      setOrbitControlsEnabled,
    ]
  );

  const changePlanOverlayDragging = useCallback(
    (dragging: boolean, kind?: PlanOverlayDragKind) => {
      if (dragging && !overlayDragHistoryActiveRef.current) {
        history.begin(getPlanOverlayMoveHistoryLabel(kind));
        overlayDragHistoryActiveRef.current = true;
      } else if (!dragging && overlayDragHistoryActiveRef.current) {
        history.commit();
        overlayDragHistoryActiveRef.current = false;
      }

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
      history,
      planRoomDragging,
      planRoomResizing,
      setOrbitControlsEnabled,
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
      if (resizing && !roomResizeHistoryActiveRef.current) {
        history.begin("Resize room");
        roomResizeHistoryActiveRef.current = true;
      } else if (!resizing && roomResizeHistoryActiveRef.current) {
        history.commit();
        roomResizeHistoryActiveRef.current = false;
      }

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
      history,
      planOverlayDragging,
      planRoomDragging,
      setOrbitControlsEnabled,
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
