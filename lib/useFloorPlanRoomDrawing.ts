"use client";

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type {
  ResolvedWallDrawRoom,
  TracedRoomRectangle,
} from "@/lib/floor-plan-tracing";
import {
  isClosingWallDrawPoint,
  resolveArcWallDrawPreview,
  resolveClosedWallDrawRoom,
  resolveExactWallDrawPoint,
  resolveTracedRoomRectangle,
  snapFloorPlanPointForRoomDraw,
  snapFloorPlanPointForWallDraw,
  snapFloorPlanPointToGrid,
} from "@/lib/floor-plan-tracing";
import type {
  FloorPlanDrawAngleLockMode,
  FloorPlanDrawRoomMode,
  FloorPlanPoint,
  FloorPlanUnderlay,
} from "@/lib/floor-plan-types";
import {
  ROOM_DIMENSION_DEFAULTS,
  roundPlanCoordinate,
  type HousePlan2D,
} from "@/lib/design-page-house-plan";

type UseFloorPlanRoomDrawingParams = {
  blankGridRoomDrawActive: boolean;
  blankGridRoomPreviewPoint: FloorPlanPoint | null;
  floorPlanDrawAngleLockMode: FloorPlanDrawAngleLockMode;
  floorPlanDrawRoomMode: FloorPlanDrawRoomMode;
  floorPlanExactWallLengthInput: string;
  floorPlanTraceRoomMode: boolean;
  floorPlanTraceRoomPoints: FloorPlanPoint[];
  floorPlanUnderlay: FloorPlanUnderlay | null;
  housePlanRooms: HousePlan2D["rooms"];
  isDesigner: boolean;
  setBlankGridRoomPreviewPoint: Dispatch<SetStateAction<FloorPlanPoint | null>>;
  setFloorPlanTraceRoomPoints: Dispatch<SetStateAction<FloorPlanPoint[]>>;
  applyResolvedWallDrawRoom: (resolvedRoom: ResolvedWallDrawRoom) => boolean;
  applyTracedRoomRectangle: (bounds: TracedRoomRectangle) => boolean;
  showRuleToast: (label: string) => void;
};

function hasOversizedWallDrawSegment(points: FloorPlanPoint[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const point = points[index];
    const length = Math.hypot(point.x - previousPoint.x, point.z - previousPoint.z);
    if (!Number.isFinite(length) || length <= 0 || length > ROOM_DIMENSION_DEFAULTS.max) {
      return true;
    }
  }
  return false;
}

function isWallDrawSegmentWithinRoomLimit(
  start: FloorPlanPoint,
  end: FloorPlanPoint
): boolean {
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  return Number.isFinite(length) && length > 0 && length <= ROOM_DIMENSION_DEFAULTS.max;
}

export function useFloorPlanRoomDrawing({
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
  applyResolvedWallDrawRoom,
  applyTracedRoomRectangle,
  showRuleToast,
}: UseFloorPlanRoomDrawingParams) {
  const resetFloorPlanTraceRoomPoints = useCallback(() => {
    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
  }, [setBlankGridRoomPreviewPoint, setFloorPlanTraceRoomPoints]);

  useEffect(() => {
    if (!floorPlanTraceRoomMode || floorPlanDrawRoomMode !== "straight_wall") return;
    if (!hasOversizedWallDrawSegment(floorPlanTraceRoomPoints)) return;

    setFloorPlanTraceRoomPoints([]);
    setBlankGridRoomPreviewPoint(null);
    showRuleToast("Enter a valid wall length.");
  }, [
    floorPlanDrawRoomMode,
    floorPlanTraceRoomMode,
    floorPlanTraceRoomPoints,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceRoomPoints,
    showRuleToast,
  ]);

  const undoFloorPlanTraceRoomPoint = useCallback(() => {
    if (floorPlanDrawRoomMode !== "straight_wall" || floorPlanTraceRoomPoints.length === 0) {
      return false;
    }

    setFloorPlanTraceRoomPoints((points) => points.slice(0, -1));
    setBlankGridRoomPreviewPoint(null);
    return true;
  }, [
    floorPlanDrawRoomMode,
    floorPlanTraceRoomPoints.length,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceRoomPoints,
  ]);

  const snapBlankGridRoomDrawPoint = useCallback(
    (
      point: FloorPlanPoint,
      activePoints: FloorPlanPoint[] = floorPlanTraceRoomPoints
    ): FloorPlanPoint => {
      const roundedPoint = {
        x: roundPlanCoordinate(point.x),
        z: roundPlanCoordinate(point.z),
      };

      const snappedPoint = snapFloorPlanPointForRoomDraw(roundedPoint, {
        rooms: housePlanRooms,
      });

      if (floorPlanDrawRoomMode === "rectangle_wall") {
        const firstPoint = activePoints[0] ?? null;
        const gridSnappedPoint = snapFloorPlanPointToGrid(roundedPoint);
        if (
          firstPoint &&
          !resolveTracedRoomRectangle([firstPoint, snappedPoint]) &&
          resolveTracedRoomRectangle([firstPoint, gridSnappedPoint])
        ) {
          return gridSnappedPoint;
        }
      }

      return snappedPoint;
    },
    [floorPlanDrawRoomMode, floorPlanTraceRoomPoints, housePlanRooms]
  );

  const snapBlankGridWallDrawPoint = useCallback(
    (point: FloorPlanPoint, points: FloorPlanPoint[]): FloorPlanPoint => {
      return snapFloorPlanPointForWallDraw(
        {
          x: roundPlanCoordinate(point.x),
          z: roundPlanCoordinate(point.z),
        },
        {
          rooms: housePlanRooms,
          previousPoint: points.length > 0 ? points[points.length - 1] : null,
          firstPoint: points.length > 0 ? points[0] : null,
          pointCount: points.length,
          angleLockMode: isDesigner ? floorPlanDrawAngleLockMode : "free",
        }
      );
    },
    [floorPlanDrawAngleLockMode, housePlanRooms, isDesigner]
  );

  const handleFloorPlanTraceRoomPoint = useCallback(
    (point: FloorPlanPoint) => {
      if (floorPlanDrawRoomMode === "straight_wall") {
        const snappedPoint = snapFloorPlanPointForWallDraw(
          {
            x: roundPlanCoordinate(point.x),
            z: roundPlanCoordinate(point.z),
          },
          {
            rooms: housePlanRooms,
            previousPoint:
              floorPlanTraceRoomPoints.length > 0
                ? floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1]
                : null,
            firstPoint: floorPlanTraceRoomPoints.length > 0 ? floorPlanTraceRoomPoints[0] : null,
            pointCount: floorPlanTraceRoomPoints.length,
            angleLockMode: isDesigner ? floorPlanDrawAngleLockMode : "free",
          }
        );
        const lastPoint = floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1];

        if (
          lastPoint &&
          Math.abs(lastPoint.x - snappedPoint.x) <= 0.001 &&
          Math.abs(lastPoint.z - snappedPoint.z) <= 0.001
        ) {
          setBlankGridRoomPreviewPoint(null);
          return;
        }

        if (lastPoint && !isWallDrawSegmentWithinRoomLimit(lastPoint, snappedPoint)) {
          resetFloorPlanTraceRoomPoints();
          showRuleToast("Enter a valid wall length.");
          return;
        }

        const closingPath = isClosingWallDrawPoint(
          snappedPoint,
          floorPlanTraceRoomPoints[0],
          floorPlanTraceRoomPoints.length
        );

        if (closingPath) {
          const resolvedRoom = resolveClosedWallDrawRoom([
            ...floorPlanTraceRoomPoints,
            snappedPoint,
          ]);
          if (!resolvedRoom) {
            resetFloorPlanTraceRoomPoints();
            showRuleToast("Close straight wall segments into a valid room.");
            return;
          }

          if (applyResolvedWallDrawRoom(resolvedRoom)) {
            resetFloorPlanTraceRoomPoints();
          }
          return;
        }

        setFloorPlanTraceRoomPoints([...floorPlanTraceRoomPoints, snappedPoint]);
        setBlankGridRoomPreviewPoint(null);
        return;
      }

      const snappedPoint = floorPlanUnderlay
        ? snapFloorPlanPointToGrid(point)
        : snapFloorPlanPointForRoomDraw(point, { rooms: housePlanRooms });
      const nextPoints =
        floorPlanTraceRoomPoints.length >= 2
          ? [snappedPoint]
          : [...floorPlanTraceRoomPoints, snappedPoint];

      setFloorPlanTraceRoomPoints(nextPoints);
      if (nextPoints.length !== 2) return;

      if (floorPlanDrawRoomMode === "arc_wall") {
        const arcRoom = resolveArcWallDrawPreview(nextPoints[0], nextPoints[1], {
          rooms: housePlanRooms,
        }).resolvedRoom;
        if (!arcRoom) {
          resetFloorPlanTraceRoomPoints();
          showRuleToast("Draw a larger arc wall");
          return;
        }

        if (applyResolvedWallDrawRoom(arcRoom)) {
          resetFloorPlanTraceRoomPoints();
        }
        return;
      }

      const bounds = resolveTracedRoomRectangle([nextPoints[0], nextPoints[1]]);
      if (!bounds) {
        resetFloorPlanTraceRoomPoints();
        showRuleToast("Draw a larger room area");
        return;
      }

      if (applyTracedRoomRectangle(bounds)) {
        resetFloorPlanTraceRoomPoints();
      }
    },
    [
      applyResolvedWallDrawRoom,
      applyTracedRoomRectangle,
      floorPlanDrawAngleLockMode,
      floorPlanDrawRoomMode,
      floorPlanTraceRoomPoints,
      floorPlanUnderlay,
      housePlanRooms,
      isDesigner,
      resetFloorPlanTraceRoomPoints,
      setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomPoints,
      showRuleToast,
    ]
  );

  const handleBlankGridRoomDrawPoint = useCallback(
    (point: FloorPlanPoint) => {
      if (!blankGridRoomDrawActive) return;

      if (floorPlanDrawRoomMode !== "straight_wall") {
        const snappedPoint = snapBlankGridRoomDrawPoint(point, floorPlanTraceRoomPoints);
        const nextPoints =
          floorPlanTraceRoomPoints.length >= 2
            ? [snappedPoint]
            : [...floorPlanTraceRoomPoints, snappedPoint];

        setFloorPlanTraceRoomPoints(nextPoints);
        setBlankGridRoomPreviewPoint(null);
        if (nextPoints.length !== 2) return;

        if (floorPlanDrawRoomMode === "arc_wall") {
          const arcRoom = resolveArcWallDrawPreview(nextPoints[0], nextPoints[1]).resolvedRoom;
          if (!arcRoom) {
            resetFloorPlanTraceRoomPoints();
            showRuleToast("Draw a larger arc wall");
            return;
          }

          if (applyResolvedWallDrawRoom(arcRoom)) {
            resetFloorPlanTraceRoomPoints();
          }
          return;
        }

        const bounds = resolveTracedRoomRectangle([nextPoints[0], nextPoints[1]]);
        if (!bounds) {
          resetFloorPlanTraceRoomPoints();
          showRuleToast("Draw a larger room area");
          return;
        }

        if (applyTracedRoomRectangle(bounds)) {
          resetFloorPlanTraceRoomPoints();
        }
        return;
      }

      const snappedPoint = snapBlankGridWallDrawPoint(point, floorPlanTraceRoomPoints);
      const lastPoint = floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1];

      if (
        lastPoint &&
        Math.abs(lastPoint.x - snappedPoint.x) <= 0.001 &&
        Math.abs(lastPoint.z - snappedPoint.z) <= 0.001
      ) {
        setBlankGridRoomPreviewPoint(null);
        return;
      }

      if (lastPoint && !isWallDrawSegmentWithinRoomLimit(lastPoint, snappedPoint)) {
        resetFloorPlanTraceRoomPoints();
        showRuleToast("Enter a valid wall length.");
        return;
      }

      const closingPath = isClosingWallDrawPoint(
        snappedPoint,
        floorPlanTraceRoomPoints[0],
        floorPlanTraceRoomPoints.length
      );

      if (closingPath) {
        const resolvedRoom = resolveClosedWallDrawRoom([
          ...floorPlanTraceRoomPoints,
          snappedPoint,
        ]);
        if (!resolvedRoom) {
          resetFloorPlanTraceRoomPoints();
          showRuleToast("Close straight wall segments into a valid room.");
          return;
        }

        if (applyResolvedWallDrawRoom(resolvedRoom)) {
          resetFloorPlanTraceRoomPoints();
        }
        return;
      }

      setFloorPlanTraceRoomPoints([...floorPlanTraceRoomPoints, snappedPoint]);
      setBlankGridRoomPreviewPoint(null);
    },
    [
      applyResolvedWallDrawRoom,
      applyTracedRoomRectangle,
      blankGridRoomDrawActive,
      floorPlanDrawRoomMode,
      floorPlanTraceRoomPoints,
      resetFloorPlanTraceRoomPoints,
      setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomPoints,
      showRuleToast,
      snapBlankGridRoomDrawPoint,
      snapBlankGridWallDrawPoint,
    ]
  );

  const handleBlankGridRoomDrawPreviewPoint = useCallback(
    (point: FloorPlanPoint | null) => {
      if (!blankGridRoomDrawActive || floorPlanTraceRoomPoints.length < 1 || !point) {
        setBlankGridRoomPreviewPoint(null);
        return;
      }
      if (floorPlanDrawRoomMode !== "straight_wall") {
        setBlankGridRoomPreviewPoint(snapBlankGridRoomDrawPoint(point));
        return;
      }
      const snappedPoint = snapBlankGridWallDrawPoint(point, floorPlanTraceRoomPoints);
      const lastPoint = floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1];
      if (lastPoint && !isWallDrawSegmentWithinRoomLimit(lastPoint, snappedPoint)) {
        setBlankGridRoomPreviewPoint(null);
        return;
      }
      setBlankGridRoomPreviewPoint(snappedPoint);
    },
    [
      blankGridRoomDrawActive,
      floorPlanDrawRoomMode,
      floorPlanTraceRoomPoints,
      setBlankGridRoomPreviewPoint,
      snapBlankGridRoomDrawPoint,
      snapBlankGridWallDrawPoint,
    ]
  );

  const handleApplyFloorPlanExactWallLength = useCallback(() => {
    if (!floorPlanTraceRoomMode || floorPlanDrawRoomMode !== "straight_wall") return;

    const previousPoint = floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 1];
    if (!previousPoint) {
      showRuleToast("Pick a wall start point first.");
      return;
    }

    const lengthMm = Number(floorPlanExactWallLengthInput.trim());
    if (
      !Number.isFinite(lengthMm) ||
      lengthMm <= 0 ||
      lengthMm > ROOM_DIMENSION_DEFAULTS.max * 1000
    ) {
      showRuleToast("Enter a valid wall length.");
      return;
    }

    const nextPoint = resolveExactWallDrawPoint({
      previousPoint,
      previousSegmentStart:
        floorPlanTraceRoomPoints.length >= 2
          ? floorPlanTraceRoomPoints[floorPlanTraceRoomPoints.length - 2]
          : null,
      previewPoint: blankGridRoomPreviewPoint,
      lengthMeters: lengthMm / 1000,
      angleLockMode: isDesigner ? floorPlanDrawAngleLockMode : "free",
    });
    if (!nextPoint) {
      showRuleToast("Enter a valid wall length.");
      return;
    }

    const closingPath = isClosingWallDrawPoint(
      nextPoint,
      floorPlanTraceRoomPoints[0],
      floorPlanTraceRoomPoints.length
    );
    if (closingPath) {
      const resolvedRoom = resolveClosedWallDrawRoom([
        ...floorPlanTraceRoomPoints,
        nextPoint,
      ]);
      if (!resolvedRoom) {
        resetFloorPlanTraceRoomPoints();
        showRuleToast("Close straight wall segments into a valid room.");
        return;
      }

      if (applyResolvedWallDrawRoom(resolvedRoom)) {
        resetFloorPlanTraceRoomPoints();
      }
      return;
    }

    setFloorPlanTraceRoomPoints([...floorPlanTraceRoomPoints, nextPoint]);
    setBlankGridRoomPreviewPoint(null);
  }, [
    applyResolvedWallDrawRoom,
    blankGridRoomPreviewPoint,
    floorPlanDrawAngleLockMode,
    floorPlanDrawRoomMode,
    floorPlanExactWallLengthInput,
    floorPlanTraceRoomMode,
    floorPlanTraceRoomPoints,
    isDesigner,
    resetFloorPlanTraceRoomPoints,
    setBlankGridRoomPreviewPoint,
    setFloorPlanTraceRoomPoints,
    showRuleToast,
  ]);

  const handleCommitWallDrawSegmentLength2D = useCallback(
    (segmentIndex: number, valueMeters: number) => {
      if (!floorPlanTraceRoomMode || floorPlanDrawRoomMode !== "straight_wall") return;
      if (
        segmentIndex <= 0 ||
        segmentIndex >= floorPlanTraceRoomPoints.length ||
        !Number.isFinite(valueMeters) ||
        valueMeters <= 0 ||
        valueMeters > ROOM_DIMENSION_DEFAULTS.max
      ) {
        if (Number.isFinite(valueMeters) && valueMeters > ROOM_DIMENSION_DEFAULTS.max) {
          setFloorPlanTraceRoomPoints([]);
          setBlankGridRoomPreviewPoint(null);
        }
        showRuleToast("Enter a valid wall length.");
        return;
      }

      const previousPoint = floorPlanTraceRoomPoints[segmentIndex - 1];
      const currentPoint = floorPlanTraceRoomPoints[segmentIndex];
      if (!previousPoint || !currentPoint) return;

      const nextPoint = resolveExactWallDrawPoint({
        previousPoint,
        previewPoint: currentPoint,
        lengthMeters: valueMeters,
        angleLockMode: "free",
      });
      if (!nextPoint) {
        showRuleToast("Enter a valid wall length.");
        return;
      }

      const deltaX = roundPlanCoordinate(nextPoint.x - currentPoint.x);
      const deltaZ = roundPlanCoordinate(nextPoint.z - currentPoint.z);
      setFloorPlanTraceRoomPoints((points) =>
        points.map((point, index) => {
          if (index < segmentIndex) return point;
          return {
            x: roundPlanCoordinate(point.x + deltaX),
            z: roundPlanCoordinate(point.z + deltaZ),
          };
        })
      );
      setBlankGridRoomPreviewPoint(null);
    },
    [
      floorPlanDrawRoomMode,
      floorPlanTraceRoomMode,
      floorPlanTraceRoomPoints,
      setBlankGridRoomPreviewPoint,
      setFloorPlanTraceRoomPoints,
      showRuleToast,
    ]
  );

  const handleBlankGridRoomDrawDrag = useCallback(
    (start: FloorPlanPoint, end: FloorPlanPoint) => {
      if (!blankGridRoomDrawActive) return;
      if (floorPlanDrawRoomMode === "straight_wall") return;

      const snappedStart = snapBlankGridRoomDrawPoint(start, []);
      const snappedEnd = snapBlankGridRoomDrawPoint(end, [snappedStart]);
      if (floorPlanDrawRoomMode === "arc_wall") {
        const arcRoom = resolveArcWallDrawPreview(snappedStart, snappedEnd).resolvedRoom;
        if (!arcRoom) {
          resetFloorPlanTraceRoomPoints();
          showRuleToast("Draw a larger arc wall");
          return;
        }

        if (applyResolvedWallDrawRoom(arcRoom)) {
          resetFloorPlanTraceRoomPoints();
        }
        return;
      }

      const bounds = resolveTracedRoomRectangle([snappedStart, snappedEnd]);
      if (!bounds) {
        resetFloorPlanTraceRoomPoints();
        showRuleToast("Draw a larger room area");
        return;
      }

      if (applyTracedRoomRectangle(bounds)) {
        resetFloorPlanTraceRoomPoints();
      }
    },
    [
      applyResolvedWallDrawRoom,
      applyTracedRoomRectangle,
      blankGridRoomDrawActive,
      floorPlanDrawRoomMode,
      resetFloorPlanTraceRoomPoints,
      showRuleToast,
      snapBlankGridRoomDrawPoint,
    ]
  );

  return {
    handleApplyFloorPlanExactWallLength,
    handleBlankGridRoomDrawDrag,
    handleBlankGridRoomDrawPoint,
    handleBlankGridRoomDrawPreviewPoint,
    handleCommitWallDrawSegmentLength2D,
    handleFloorPlanTraceRoomPoint,
    handleResetFloorPlanTraceRoomPoints: resetFloorPlanTraceRoomPoints,
    handleUndoFloorPlanTraceRoomPoint: undoFloorPlanTraceRoomPoint,
  };
}
