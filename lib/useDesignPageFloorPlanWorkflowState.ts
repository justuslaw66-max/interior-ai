"use client";

import { useCallback, useMemo, useState } from "react";
import type { RoomOpening2D } from "@/lib/editorScene";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import type { RoomType } from "@/lib/room-types";
import { useSynchronizedFloorPlanTraceMode } from "@/lib/useSynchronizedFloorPlanTraceMode";

export type FloorPlanActiveTool = "select" | "draw_room" | RoomOpening2D["kind"];

type ResetFloorPlanInteractionOptions = {
  resetCalibrationDistance?: boolean;
};

function getFloorPlanCalibrationSummary(underlay: FloorPlanUnderlay | null) {
  if (!underlay?.calibration) return null;
  return `${underlay.calibration.referenceLengthMeters}m set (${underlay.widthMeters} x ${underlay.depthMeters}m)`;
}

export function useDesignPageFloorPlanWorkflowState() {
  const [floorPlanUnderlay, setFloorPlanUnderlay] = useState<FloorPlanUnderlay | null>(null);
  const [floorPlanCalibrationMode, setFloorPlanCalibrationMode] = useState(false);
  const [floorPlanCalibrationPoints, setFloorPlanCalibrationPoints] = useState<FloorPlanPoint[]>([]);
  const [floorPlanCalibrationDistanceInput, setFloorPlanCalibrationDistanceInput] = useState("");
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

  const resetFloorPlanOpeningTrace = useCallback((resetMode = true) => {
    if (resetMode) setFloorPlanTraceOpeningMode(false);
    setFloorPlanTraceOpeningPoints([]);
  }, []);

  const {
    floorPlanTraceRoomMode,
    floorPlanTraceRoomModeRef,
    setFloorPlanTraceRoomMode,
    resetFloorPlanRoomTrace,
    activateFloorPlanRoomTrace,
    activateFloorPlanRoomDrawMode,
  } = useSynchronizedFloorPlanTraceMode({
    resetFloorPlanCalibration,
    resetFloorPlanOpeningTrace,
    setFloorPlanDrawRoomMode,
    setFloorPlanTraceRoomPoints,
    setBlankGridRoomPreviewPoint,
  });

  const resetFloorPlanInteraction = useCallback(
    (options: ResetFloorPlanInteractionOptions = {}) => {
      resetFloorPlanCalibration(options.resetCalibrationDistance !== false);
      resetFloorPlanRoomTrace(true);
      resetFloorPlanOpeningTrace(true);
    },
    [
      resetFloorPlanCalibration,
      resetFloorPlanOpeningTrace,
      resetFloorPlanRoomTrace,
    ]
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

  const floorPlanCalibrationSummary = useMemo(
    () => getFloorPlanCalibrationSummary(floorPlanUnderlay),
    [floorPlanUnderlay]
  );

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
