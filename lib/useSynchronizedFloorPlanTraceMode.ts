"use client";

import {
  useCallback,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type {
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
} from "@/lib/floor-plan-types";

type SynchronizedFloorPlanTraceModeInput = {
  resetFloorPlanCalibration: (resetDistance?: boolean) => void;
  resetFloorPlanOpeningTrace: (resetMode?: boolean) => void;
  setFloorPlanDrawRoomMode: Dispatch<SetStateAction<FloorPlanDrawRoomMode>>;
  setFloorPlanTraceRoomPoints: Dispatch<SetStateAction<FloorPlanPoint[]>>;
  setBlankGridRoomPreviewPoint: Dispatch<
    SetStateAction<FloorPlanPoint | null>
  >;
};

function useSynchronizedFloorPlanTraceModeState() {
  const [floorPlanTraceRoomMode, setFloorPlanTraceRoomModeState] =
    useState(false);
  const floorPlanTraceRoomModeRef = useRef(false);
  const setFloorPlanTraceRoomMode: Dispatch<SetStateAction<boolean>> =
    useCallback((next) => {
      const resolved =
        typeof next === "function"
          ? next(floorPlanTraceRoomModeRef.current)
          : next;
      floorPlanTraceRoomModeRef.current = resolved;
      setFloorPlanTraceRoomModeState(resolved);
    }, []);

  return [
    floorPlanTraceRoomMode,
    floorPlanTraceRoomModeRef,
    setFloorPlanTraceRoomMode,
  ] as const;
}

function useFloorPlanRoomTraceTransitions(
  input: SynchronizedFloorPlanTraceModeInput,
  setFloorPlanTraceRoomMode: Dispatch<SetStateAction<boolean>>
) {
  const {
    resetFloorPlanCalibration,
    resetFloorPlanOpeningTrace,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceRoomPoints,
  } = input;
  const resetFloorPlanRoomTrace = useCallback(
    (resetMode = true) => {
      if (resetMode) setFloorPlanTraceRoomMode(false);
      setFloorPlanTraceRoomPoints([]);
      setBlankGridRoomPreviewPoint(null);
    },
    [
      setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomMode,
      setFloorPlanTraceRoomPoints,
    ]
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
      setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomMode,
      setFloorPlanTraceRoomPoints,
    ]
  );

  return {
    resetFloorPlanRoomTrace,
    activateFloorPlanRoomTrace,
    activateFloorPlanRoomDrawMode: useActivateFloorPlanRoomDrawMode(
      input,
      setFloorPlanTraceRoomMode
    ),
  };
}

function useActivateFloorPlanRoomDrawMode(
  input: SynchronizedFloorPlanTraceModeInput,
  setFloorPlanTraceRoomMode: Dispatch<SetStateAction<boolean>>
) {
  const {
    resetFloorPlanCalibration,
    resetFloorPlanOpeningTrace,
    setBlankGridRoomPreviewPoint,
    setFloorPlanDrawRoomMode,
    setFloorPlanTraceRoomPoints,
  } = input;
  return useCallback(
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
      setBlankGridRoomPreviewPoint,
      setFloorPlanDrawRoomMode,
      setFloorPlanTraceRoomMode,
      setFloorPlanTraceRoomPoints,
    ]
  );
}

export function useSynchronizedFloorPlanTraceMode(
  input: SynchronizedFloorPlanTraceModeInput
) {
  const [mode, modeRef, setMode] = useSynchronizedFloorPlanTraceModeState();
  const transitions = useFloorPlanRoomTraceTransitions(input, setMode);

  return {
    floorPlanTraceRoomMode: mode,
    floorPlanTraceRoomModeRef: modeRef,
    setFloorPlanTraceRoomMode: setMode,
    ...transitions,
  };
}
