"use client";

import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { RoomType } from "@/lib/room-types";

export type FloorPlanActiveTool = "select" | "draw_room" | RoomOpening2D["kind"];

type ResetFloorPlanInteractionOptions = {
  resetCalibrationDistance?: boolean;
};

export function useDesignPageFloorPlanWorkflowState() {
  const [floorPlanUnderlay, setFloorPlanUnderlay] = useState<FloorPlanUnderlay | null>(null);
  const [floorPlanCalibrationMode, setFloorPlanCalibrationMode] = useState(false);
  const [floorPlanCalibrationPoints, setFloorPlanCalibrationPoints] = useState<FloorPlanPoint[]>([]);
  const [floorPlanCalibrationDistanceInput, setFloorPlanCalibrationDistanceInput] = useState("");
  const [floorPlanTraceRoomMode, setFloorPlanTraceRoomModeState] = useState(false);
  const floorPlanTraceRoomModeRef = useRef(false);
  const setFloorPlanTraceRoomMode: Dispatch<SetStateAction<boolean>> = useCallback(
    (next) => {
      const resolved =
        typeof next === "function"
          ? next(floorPlanTraceRoomModeRef.current)
          : next;
      floorPlanTraceRoomModeRef.current = resolved;
      setFloorPlanTraceRoomModeState(resolved);
    },
    []
  );
  const [floorPlanDrawRoomMode, setFloorPlanDrawRoomMode] =
    useState<FloorPlanDrawRoomMode>("rectangle_wall");
  const [floorPlanDrawAngleLockMode, setFloorPlanDrawAngleLockMode] =
    useState<FloorPlanDrawAngleLockMode>("ortho");
  const [floorPlanExactWallLengthInput, setFloorPlanExactWallLengthInput] = useState("");
  const [floorPlanTraceRoomPoints, setFloorPlanTraceRoomPoints] = useState<FloorPlanPoint[]>([]);
  const [blankGridRoomPreviewPoint, setBlankGridRoomPreviewPoint] = useState<FloorPlanPoint | null>(null);
  const [floorPlanTraceRoomType, setFloorPlanTraceRoomType] = useState<RoomType>("living");
  const [floorPlanTraceOpeningMode, setFloorPlanTraceOpeningMode] = useState(false);
  const [floorPlanTraceOpeningPoints, setFloorPlanTraceOpeningPoints] = useState<FloorPlanPoint[]>([]);
  const [floorPlanTraceOpeningKind, setFloorPlanTraceOpeningKind] =
    useState<RoomOpening2D["kind"]>("door");
  const [floorPlanPdfSourceReady, setFloorPlanPdfSourceReady] = useState(false);
  const [floorPlanPdfRenderingPage, setFloorPlanPdfRenderingPage] = useState<number | null>(null);

  const resetFloorPlanCalibration = useCallback((resetDistance = true) => {
    setFloorPlanCalibrationMode(false);
    setFloorPlanCalibrationPoints([]);
    if (resetDistance) setFloorPlanCalibrationDistanceInput("");
  }, []);

  const resetFloorPlanRoomTrace = useCallback((resetMode = true) => {
    if (resetMode) setFloorPlanTraceRoomMode(false);
    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
  }, [setFloorPlanTraceRoomMode]);

  const resetFloorPlanOpeningTrace = useCallback((resetMode = true) => {
    if (resetMode) setFloorPlanTraceOpeningMode(false);
    setFloorPlanTraceOpeningPoints([]);
  }, []);

  const resetFloorPlanInteraction = useCallback(
    (options: ResetFloorPlanInteractionOptions = {}) => {
      resetFloorPlanCalibration(options.resetCalibrationDistance !== false);
      resetFloorPlanRoomTrace(true);
      resetFloorPlanOpeningTrace(true);
    },
    [resetFloorPlanCalibration, resetFloorPlanOpeningTrace, resetFloorPlanRoomTrace]
  );

  const activateFloorPlanSelectTool = useCallback(() => {
    resetFloorPlanInteraction({ resetCalibrationDistance: false });
  }, [resetFloorPlanInteraction]);

  const activateFloorPlanCalibrationMode = useCallback(
    (enabled: boolean) => {
      setFloorPlanCalibrationMode(enabled);
      if (enabled) {
        setFloorPlanCalibrationPoints([]);
        resetFloorPlanRoomTrace(true);
        resetFloorPlanOpeningTrace(true);
      }
    },
    [resetFloorPlanOpeningTrace, resetFloorPlanRoomTrace]
  );

  const activateFloorPlanRoomTrace = useCallback(
    (enabled: boolean) => {
      setFloorPlanTraceRoomMode(enabled);
      if (enabled) {
        resetFloorPlanCalibration(false);
        setFloorPlanTraceRoomPoints([]);
        setBlankGridRoomPreviewPoint(null);
        resetFloorPlanOpeningTrace(true);
      } else {
        resetFloorPlanRoomTrace(false);
      }
    },
    [
      resetFloorPlanCalibration,
      resetFloorPlanOpeningTrace,
      resetFloorPlanRoomTrace,
      setFloorPlanTraceRoomMode,
    ]
  );

  const activateFloorPlanRoomDrawMode = useCallback(
    (mode: FloorPlanDrawRoomMode) => {
      setFloorPlanDrawRoomMode(mode);
      setFloorPlanTraceRoomMode(true);
      resetFloorPlanCalibration(false);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
      resetFloorPlanOpeningTrace(true);
    },
    [
      resetFloorPlanCalibration,
      resetFloorPlanOpeningTrace,
      setFloorPlanTraceRoomMode,
    ]
  );

  const activateFloorPlanOpeningTrace = useCallback(
    (enabled: boolean, kind?: RoomOpening2D["kind"]) => {
      setFloorPlanTraceOpeningMode(enabled);
      if (kind) setFloorPlanTraceOpeningKind(kind);
      if (enabled) {
        resetFloorPlanCalibration(false);
        resetFloorPlanRoomTrace(true);
        setFloorPlanTraceOpeningPoints([]);
      }
    },
    [resetFloorPlanCalibration, resetFloorPlanRoomTrace]
  );

  const clearFloorPlanTraceBuffers = useCallback(() => {
    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
    setFloorPlanTraceOpeningPoints([]);
  }, []);

  const floorPlanCalibrationSummary = useMemo(() => {
    if (!floorPlanUnderlay?.calibration) return null;
    return `${floorPlanUnderlay.calibration.referenceLengthMeters}m set (${floorPlanUnderlay.widthMeters} x ${floorPlanUnderlay.depthMeters}m)`;
  }, [floorPlanUnderlay]);

  const blankGridRoomDrawActive = floorPlanTraceRoomMode && !floorPlanUnderlay;

  const activeFloorPlanTool: FloorPlanActiveTool =
    floorPlanTraceRoomMode
      ? "draw_room"
      : floorPlanTraceOpeningMode
        ? floorPlanTraceOpeningKind
        : "select";

  return {
    floorPlanUnderlay,
    setFloorPlanUnderlay,
    floorPlanCalibrationMode,
    setFloorPlanCalibrationMode,
    floorPlanCalibrationPoints,
    setFloorPlanCalibrationPoints,
    floorPlanCalibrationDistanceInput,
    setFloorPlanCalibrationDistanceInput,
    floorPlanTraceRoomMode,
    floorPlanTraceRoomModeRef,
    setFloorPlanTraceRoomMode,
    floorPlanDrawRoomMode,
    setFloorPlanDrawRoomMode,
    floorPlanDrawAngleLockMode,
    setFloorPlanDrawAngleLockMode,
    floorPlanExactWallLengthInput,
    setFloorPlanExactWallLengthInput,
    floorPlanTraceRoomPoints,
    setFloorPlanTraceRoomPoints,
    blankGridRoomPreviewPoint,
    setBlankGridRoomPreviewPoint,
    floorPlanTraceRoomType,
    setFloorPlanTraceRoomType,
    floorPlanTraceOpeningMode,
    setFloorPlanTraceOpeningMode,
    floorPlanTraceOpeningPoints,
    setFloorPlanTraceOpeningPoints,
    floorPlanTraceOpeningKind,
    setFloorPlanTraceOpeningKind,
    floorPlanPdfSourceReady,
    setFloorPlanPdfSourceReady,
    floorPlanPdfRenderingPage,
    setFloorPlanPdfRenderingPage,
    floorPlanCalibrationSummary,
    blankGridRoomDrawActive,
    activeFloorPlanTool,
    resetFloorPlanCalibration,
    resetFloorPlanRoomTrace,
    resetFloorPlanOpeningTrace,
    resetFloorPlanInteraction,
    activateFloorPlanSelectTool,
    activateFloorPlanCalibrationMode,
    activateFloorPlanRoomTrace,
    activateFloorPlanRoomDrawMode,
    activateFloorPlanOpeningTrace,
    clearFloorPlanTraceBuffers,
  };
}
