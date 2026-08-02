"use client";

import {
  useCallback,
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { track } from "@/lib/analytics";
import type { EditorViewMode } from "@/components/editor/EditorViewToggle";
import {
  resolveFloorPlanDrawCancelDecision,
  resolveFloorPlanOpeningCancelDecision,
  type HousePlan2D,
} from "@/lib/design-page-house-plan";
import {
  resolveOpeningPlacementFromPoint,
  resolveTracedOpening,
  validateTracedOpeningPlacement,
} from "@/lib/floor-plan-tracing";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  DesignSnapshot,
  RoomPlanShape,
  RoomSnapshot,
  RoomType,
} from "@/lib/room-types";
import type { DesignPageEditorMode } from "@/lib/useDesignPagePanelMode";
import { useFloorPlanRoomCreation } from "@/lib/useFloorPlanRoomCreation";
import { useFloorPlanRoomDrawing } from "@/lib/useFloorPlanRoomDrawing";

type MutableRef<T> = { current: T };

type HistoryAdapter = {
  begin: (name: string) => void;
  commit: () => void;
};

type AddFloorPlanRoomOptions = {
  roomType?: RoomType;
  shape?: RoomPlanShape;
  width?: number;
  depth?: number;
  planPosition?: { x: number; z: number };
  planPolygon?: Array<{ x: number; z: number }>;
};

export type ConsumerPlanCompletionSignal = {
  id: number;
  kind: "room" | "opening";
};

type UseDesignPageFloorPlanTracingInput = {
  state: {
    activeRoom: RoomSnapshot | null;
    housePlanRooms: HousePlan2D["rooms"];
    roomCount: number;
    floorPlanUnderlay: FloorPlanUnderlay | null;
    floorPlanTraceRoomType: RoomType;
    floorPlanTraceRoomMode: boolean;
    floorPlanDrawRoomMode: FloorPlanDrawRoomMode;
    floorPlanDrawAngleLockMode: FloorPlanDrawAngleLockMode;
    floorPlanExactWallLengthInput: string;
    floorPlanTraceRoomPoints: FloorPlanPoint[];
    blankGridRoomDrawActive: boolean;
    blankGridRoomPreviewPoint: FloorPlanPoint | null;
    floorPlanTraceOpeningMode: boolean;
    floorPlanTraceOpeningPoints: FloorPlanPoint[];
    floorPlanTraceOpeningKind: RoomOpening2D["kind"];
    planOpenings: RoomOpening2D[];
    planGuidedActionsEnabled: boolean;
    isDesigner: boolean;
    isClientPreview: boolean;
    editorMode: DesignPageEditorMode;
    viewMode: EditorViewMode;
    selectedPlanRoomId: string | null;
    selectedPlanOverlayId: string | null;
    selectedZoneId: string | null;
  };
  refs: {
    selectedIdsRef: MutableRef<Set<string>>;
  };
  actions: {
    history: HistoryAdapter;
    handleAddRoom: (options?: AddFloorPlanRoomOptions) => void;
    setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
    setPlanOpenings: Dispatch<SetStateAction<RoomOpening2D[]>>;
    setViewMode: Dispatch<SetStateAction<EditorViewMode>>;
    setDesignPanelOpen: Dispatch<SetStateAction<boolean>>;
    setPlanFocusPanelRevealed: Dispatch<SetStateAction<boolean>>;
    setPlanGuidedActionsEnabled: Dispatch<SetStateAction<boolean>>;
    setPlanGuidedActionsChoiceSeen: Dispatch<SetStateAction<boolean>>;
    setBlankGridRoomPreviewPoint: Dispatch<SetStateAction<FloorPlanPoint | null>>;
    setFloorPlanTraceRoomMode: Dispatch<SetStateAction<boolean>>;
    setFloorPlanTraceRoomPoints: Dispatch<SetStateAction<FloorPlanPoint[]>>;
    setFloorPlanTraceOpeningMode: Dispatch<SetStateAction<boolean>>;
    setFloorPlanTraceOpeningPoints: Dispatch<SetStateAction<FloorPlanPoint[]>>;
    activateFloorPlanSelectTool: () => void;
    activateFloorPlanCalibrationMode: (enabled: boolean) => void;
    activateFloorPlanRoomTrace: (enabled: boolean) => void;
    activateFloorPlanRoomDrawMode: (mode: FloorPlanDrawRoomMode) => void;
    activateFloorPlanOpeningTrace: (
      enabled: boolean,
      kind?: RoomOpening2D["kind"]
    ) => void;
    handleSelectPlanOverlay: (id: string | null) => void;
    clearAllSelection: () => void;
    showRuleToast: (label: string) => void;
  };
};

export function useDesignPageFloorPlanTracing({
  state,
  refs,
  actions,
}: UseDesignPageFloorPlanTracingInput) {
  const {
    activeRoom,
    housePlanRooms,
    roomCount,
    floorPlanUnderlay,
    floorPlanTraceRoomType,
    floorPlanTraceRoomMode,
    floorPlanDrawRoomMode,
    floorPlanDrawAngleLockMode,
    floorPlanExactWallLengthInput,
    floorPlanTraceRoomPoints,
    blankGridRoomDrawActive,
    blankGridRoomPreviewPoint,
    floorPlanTraceOpeningMode,
    floorPlanTraceOpeningPoints,
    floorPlanTraceOpeningKind,
    planOpenings,
    planGuidedActionsEnabled,
    isDesigner,
    isClientPreview,
    editorMode,
    viewMode,
    selectedPlanRoomId,
    selectedPlanOverlayId,
    selectedZoneId,
  } = state;
  const { selectedIdsRef } = refs;
  const {
    history,
    handleAddRoom,
    setDesignSnapshot,
    setPlanOpenings,
    setViewMode,
    setDesignPanelOpen,
    setPlanFocusPanelRevealed,
    setPlanGuidedActionsEnabled,
    setPlanGuidedActionsChoiceSeen,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceRoomMode,
    setFloorPlanTraceRoomPoints,
    setFloorPlanTraceOpeningMode,
    setFloorPlanTraceOpeningPoints,
    activateFloorPlanSelectTool,
    activateFloorPlanCalibrationMode,
    activateFloorPlanRoomTrace,
    activateFloorPlanRoomDrawMode,
    activateFloorPlanOpeningTrace,
    handleSelectPlanOverlay,
    clearAllSelection,
    showRuleToast,
  } = actions;

  const [consumerPlanCompletionSignal, setConsumerPlanCompletionSignal] =
    useState<ConsumerPlanCompletionSignal | null>(null);

  const emitConsumerPlanCompletion = useCallback(
    (kind: ConsumerPlanCompletionSignal["kind"]) => {
      if (!planGuidedActionsEnabled) return;
      setConsumerPlanCompletionSignal((current) => ({
        id: (current?.id ?? 0) + 1,
        kind,
      }));
    },
    [planGuidedActionsEnabled]
  );

  const handleConsumerPlanCompletionHandled = useCallback((id: number) => {
    setConsumerPlanCompletionSignal((current) =>
      current?.id === id ? null : current
    );
  }, []);

  useEffect(() => {
    if (planGuidedActionsEnabled) return;
    // The completion is transient UI state and must not reappear if guidance is re-enabled.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setConsumerPlanCompletionSignal(null);
  }, [planGuidedActionsEnabled]);

  const choosePlanGuidedActionsMode = useCallback(
    (enabled: boolean) => {
      setPlanGuidedActionsEnabled(enabled);
      setPlanGuidedActionsChoiceSeen(true);
    },
    [setPlanGuidedActionsChoiceSeen, setPlanGuidedActionsEnabled]
  );

  const selectFloorPlanTool = useCallback(() => {
    setViewMode("2d");
    activateFloorPlanSelectTool();
  }, [activateFloorPlanSelectTool, setViewMode]);

  const changeCalibrationMode = useCallback(
    (enabled: boolean) => {
      activateFloorPlanCalibrationMode(enabled);
    },
    [activateFloorPlanCalibrationMode]
  );

  const addFloorPlanOpeningFromTool = useCallback(
    (kind: RoomOpening2D["kind"]) => {
      setViewMode("2d");
      activateFloorPlanOpeningTrace(true, kind);

      if (!activeRoom) {
        showRuleToast("Add a room first");
        return;
      }

      showRuleToast(
        kind === "door"
          ? "Click a wall to place a door"
          : "Click a wall to place a window"
      );
    },
    [
      activateFloorPlanOpeningTrace,
      activeRoom,
      setViewMode,
      showRuleToast,
    ]
  );

  const { applyResolvedWallDrawRoom, applyTracedRoomRectangle } =
    useFloorPlanRoomCreation({
      activeRoom,
      floorPlanTraceRoomType,
      handleAddRoom,
      housePlanRooms,
      roomCount,
      setDesignSnapshot,
      showRuleToast,
    });

  const completeConsumerRoomDraw = useCallback(
    (applied: boolean) => {
      if (applied && !isDesigner) {
        setFloorPlanTraceRoomMode(false);
        setPlanFocusPanelRevealed(false);
        setDesignPanelOpen(true);
        emitConsumerPlanCompletion("room");
      }
      return applied;
    },
    [
      emitConsumerPlanCompletion,
      isDesigner,
      setDesignPanelOpen,
      setFloorPlanTraceRoomMode,
      setPlanFocusPanelRevealed,
    ]
  );

  const applyResolvedWallDrawRoomWithCompletion = useCallback(
    (...args: Parameters<typeof applyResolvedWallDrawRoom>) =>
      completeConsumerRoomDraw(applyResolvedWallDrawRoom(...args)),
    [applyResolvedWallDrawRoom, completeConsumerRoomDraw]
  );

  const applyTracedRoomRectangleWithCompletion = useCallback(
    (...args: Parameters<typeof applyTracedRoomRectangle>) =>
      completeConsumerRoomDraw(applyTracedRoomRectangle(...args)),
    [applyTracedRoomRectangle, completeConsumerRoomDraw]
  );

  const changeTraceRoomMode = useCallback(
    (enabled: boolean) => {
      activateFloorPlanRoomTrace(enabled);
      if (enabled) setViewMode("2d");
    },
    [activateFloorPlanRoomTrace, setViewMode]
  );

  const changeDrawRoomMode = useCallback(
    (mode: FloorPlanDrawRoomMode) => {
      activateFloorPlanRoomDrawMode(mode);
      setViewMode("2d");
    },
    [activateFloorPlanRoomDrawMode, setViewMode]
  );

  const {
    handleApplyFloorPlanExactWallLength,
    handleBlankGridRoomDrawDrag,
    handleBlankGridRoomDrawPoint,
    handleBlankGridRoomDrawPreviewPoint,
    handleCommitWallDrawSegmentLength2D,
    handleFloorPlanTraceRoomPoint,
    handleResetFloorPlanTraceRoomPoints,
    handleUndoFloorPlanTraceRoomPoint,
  } = useFloorPlanRoomDrawing({
    blankGridRoomDrawActive,
    blankGridRoomPreviewPoint,
    floorPlanDrawAngleLockMode,
    floorPlanDrawRoomMode,
    floorPlanExactWallLengthInput,
    floorPlanTraceRoomMode,
    floorPlanTraceRoomPoints,
    floorPlanUnderlay,
    housePlanRooms,
    isDesigner,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceRoomPoints,
    applyResolvedWallDrawRoom: applyResolvedWallDrawRoomWithCompletion,
    applyTracedRoomRectangle: applyTracedRoomRectangleWithCompletion,
    showRuleToast,
  });

  const cancelActiveFloorPlanDraw = useCallback(() => {
    const openingDecision = resolveFloorPlanOpeningCancelDecision({
      traceOpeningMode: floorPlanTraceOpeningMode,
      pointCount: floorPlanTraceOpeningPoints.length,
    });

    if (openingDecision.shouldHandle) {
      if (openingDecision.clearOpeningPoints) setFloorPlanTraceOpeningPoints([]);
      if (openingDecision.exitOpeningMode) setFloorPlanTraceOpeningMode(false);
      return true;
    }

    const roomDecision = resolveFloorPlanDrawCancelDecision({
      traceRoomMode: floorPlanTraceRoomMode,
      drawMode: floorPlanDrawRoomMode,
      pointCount: floorPlanTraceRoomPoints.length,
    });

    if (!roomDecision.shouldHandle) return false;
    if (roomDecision.clearRoomPoints) setFloorPlanTraceRoomPoints([]);
    if (roomDecision.clearRoomPreview) setBlankGridRoomPreviewPoint(null);
    if (roomDecision.exitRoomDrawMode) setFloorPlanTraceRoomMode(false);
    return true;
  }, [
    floorPlanDrawRoomMode,
    floorPlanTraceOpeningMode,
    floorPlanTraceOpeningPoints.length,
    floorPlanTraceRoomMode,
    floorPlanTraceRoomPoints.length,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceOpeningMode,
    setFloorPlanTraceOpeningPoints,
    setFloorPlanTraceRoomMode,
    setFloorPlanTraceRoomPoints,
  ]);

  const changeTraceOpeningMode = useCallback(
    (enabled: boolean) => {
      activateFloorPlanOpeningTrace(enabled);
      if (enabled) setViewMode("2d");
    },
    [activateFloorPlanOpeningTrace, setViewMode]
  );

  const resetTraceOpeningPoints = useCallback(() => {
    setFloorPlanTraceOpeningPoints([]);
  }, [setFloorPlanTraceOpeningPoints]);

  const completeConsumerOpeningPlacement = useCallback(() => {
    if (isDesigner) return;
    setFloorPlanTraceOpeningMode(false);
    setFloorPlanTraceOpeningPoints([]);
    setPlanFocusPanelRevealed(false);
    setDesignPanelOpen(true);
    emitConsumerPlanCompletion("opening");
  }, [
    emitConsumerPlanCompletion,
    isDesigner,
    setDesignPanelOpen,
    setFloorPlanTraceOpeningMode,
    setFloorPlanTraceOpeningPoints,
    setPlanFocusPanelRevealed,
  ]);

  const traceOpeningPoint = useCallback(
    (point: FloorPlanPoint) => {
      const nextPoints =
        floorPlanTraceOpeningPoints.length >= 2
          ? [point]
          : [...floorPlanTraceOpeningPoints, point];

      setFloorPlanTraceOpeningPoints(nextPoints);
      if (nextPoints.length !== 2) return;

      const opening = resolveTracedOpening(
        [nextPoints[0], nextPoints[1]],
        housePlanRooms,
        floorPlanTraceOpeningKind
      );

      if (!opening) {
        setFloorPlanTraceOpeningPoints([]);
        showRuleToast("Trace along a room wall");
        return;
      }

      const validation = validateTracedOpeningPlacement(
        opening,
        housePlanRooms,
        planOpenings
      );
      if (!validation.valid) {
        setFloorPlanTraceOpeningPoints([]);
        showRuleToast(validation.label);
        return;
      }

      const id = `opening-${Date.now()}`;
      history.begin(opening.kind === "door" ? "Trace door" : "Trace window");
      setPlanOpenings((previous) => [...previous, { id, ...opening }]);
      history.commit();
      handleSelectPlanOverlay(id);
      setFloorPlanTraceOpeningPoints([]);
      completeConsumerOpeningPlacement();
      showRuleToast(opening.kind === "door" ? "Door traced" : "Window traced");
      track("floor_plan_opening_traced", {
        kind: opening.kind,
        roomId: opening.roomId,
        wall: opening.wall,
        widthMm: opening.widthMm,
      });
    },
    [
      completeConsumerOpeningPlacement,
      floorPlanTraceOpeningKind,
      floorPlanTraceOpeningPoints,
      handleSelectPlanOverlay,
      history,
      housePlanRooms,
      planOpenings,
      setFloorPlanTraceOpeningPoints,
      setPlanOpenings,
      showRuleToast,
    ]
  );

  const traceBlankGridOpeningPoint = useCallback(
    (point: FloorPlanPoint) => {
      if (!floorPlanTraceOpeningMode || floorPlanUnderlay) return;

      const preview = resolveOpeningPlacementFromPoint(
        point,
        housePlanRooms,
        floorPlanTraceOpeningKind,
        planOpenings
      );
      if (preview.status !== "valid" || !preview.opening) {
        showRuleToast(preview.label);
        return;
      }

      const opening = preview.opening;
      const id = `opening-${Date.now()}`;
      history.begin(opening.kind === "door" ? "Place door" : "Place window");
      setPlanOpenings((previous) => [...previous, { id, ...opening }]);
      history.commit();
      handleSelectPlanOverlay(id);
      completeConsumerOpeningPlacement();
      showRuleToast(opening.kind === "door" ? "Door placed" : "Window placed");
      track("floor_plan_opening_placed", {
        kind: opening.kind,
        roomId: opening.roomId,
        wall: opening.wall,
        widthMm: opening.widthMm,
      });
    },
    [
      completeConsumerOpeningPlacement,
      floorPlanTraceOpeningKind,
      floorPlanTraceOpeningMode,
      floorPlanUnderlay,
      handleSelectPlanOverlay,
      history,
      housePlanRooms,
      planOpenings,
      setPlanOpenings,
      showRuleToast,
    ]
  );

  useEffect(() => {
    if (isClientPreview || editorMode === "present" || viewMode !== "2d") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (event.key === "Escape") {
        const cancelledDraw = cancelActiveFloorPlanDraw();
        const hasSelection =
          selectedPlanRoomId ||
          selectedPlanOverlayId ||
          selectedZoneId ||
          selectedIdsRef.current.size > 0;

        if (hasSelection) clearAllSelection();
        if (cancelledDraw || hasSelection) {
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (
        (event.key === "Backspace" || event.key === "Delete") &&
        handleUndoFloorPlanTraceRoomPoint()
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "v" || key === "s") {
        event.preventDefault();
        selectFloorPlanTool();
      } else if (key === "r") {
        event.preventDefault();
        changeDrawRoomMode("rectangle_wall");
      } else if (key === "d" && !floorPlanTraceRoomMode) {
        event.preventDefault();
        addFloorPlanOpeningFromTool("door");
      } else if (key === "w" && !floorPlanTraceRoomMode) {
        event.preventDefault();
        addFloorPlanOpeningFromTool("window");
      } else if (key === "b") {
        event.preventDefault();
        changeDrawRoomMode("straight_wall");
      } else if (key === "f") {
        event.preventDefault();
        changeDrawRoomMode("rectangle_wall");
      } else if (key === "h") {
        event.preventDefault();
        changeDrawRoomMode("arc_wall");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    addFloorPlanOpeningFromTool,
    cancelActiveFloorPlanDraw,
    changeDrawRoomMode,
    clearAllSelection,
    editorMode,
    floorPlanTraceRoomMode,
    isClientPreview,
    handleUndoFloorPlanTraceRoomPoint,
    selectFloorPlanTool,
    selectedIdsRef,
    selectedPlanOverlayId,
    selectedPlanRoomId,
    selectedZoneId,
    viewMode,
  ]);

  return {
    state: {
      consumerPlanCompletionSignal,
    },
    actions: {
      choosePlanGuidedActionsMode,
      handleConsumerPlanCompletionHandled,
      selectFloorPlanTool,
      changeCalibrationMode,
      addFloorPlanOpeningFromTool,
      changeTraceRoomMode,
      changeDrawRoomMode,
      cancelActiveFloorPlanDraw,
      changeTraceOpeningMode,
      resetTraceOpeningPoints,
      traceOpeningPoint,
      traceBlankGridOpeningPoint,
      handleApplyFloorPlanExactWallLength,
      handleBlankGridRoomDrawDrag,
      handleBlankGridRoomDrawPoint,
      handleBlankGridRoomDrawPreviewPoint,
      handleCommitWallDrawSegmentLength2D,
      handleFloorPlanTraceRoomPoint,
      handleResetFloorPlanTraceRoomPoints,
      handleUndoFloorPlanTraceRoomPoint,
    },
  };
}
