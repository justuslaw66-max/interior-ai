import { formatDisplayLength, type DisplayUnit } from "@/lib/display-units";
import type { FloorPlanPoint, FloorPlanUnderlay } from "@/lib/floor-plan-types";
import { underlayPlanToLocal } from "./floor-plan-underlay-geometry";
import { formatPlanDimensionsLabel } from "@/lib/plan-room-summary";

const MIN_REFERENCE_DISTANCE_METERS = 0.05;

function roundMeters(value: number): number {
  return Number(value.toFixed(3));
}

function roundPixels(value: number): number {
  return Number(value.toFixed(2));
}

export function measureFloorPlanPointDistanceMeters(
  first: FloorPlanPoint,
  second: FloorPlanPoint
): number {
  return Math.hypot(second.x - first.x, second.z - first.z);
}

export function mapUnderlayWorldPointToPixels(
  underlay: FloorPlanUnderlay,
  point: FloorPlanPoint
): { x: number; y: number } | null {
  if (
    !underlay.widthPx ||
    !underlay.heightPx ||
    underlay.widthMeters <= 0 ||
    underlay.depthMeters <= 0
  ) {
    return null;
  }

  const dx = point.x - underlay.position.x;
  const dz = point.z - underlay.position.z;
  const { x: localX, z: localZ } = underlayPlanToLocal(underlay, dx, dz);

  return {
    x: roundPixels((localX / underlay.widthMeters + 0.5) * underlay.widthPx),
    y: roundPixels((localZ / underlay.depthMeters + 0.5) * underlay.heightPx),
  };
}

export function applyFloorPlanScaleCalibration(params: {
  underlay: FloorPlanUnderlay;
  points: [FloorPlanPoint, FloorPlanPoint];
  referenceLengthMeters: number;
}): FloorPlanUnderlay | null {
  const { underlay, points, referenceLengthMeters } = params;
  if (!Number.isFinite(referenceLengthMeters) || referenceLengthMeters < MIN_REFERENCE_DISTANCE_METERS) {
    return null;
  }

  const measuredDistanceMeters = measureFloorPlanPointDistanceMeters(points[0], points[1]);
  if (measuredDistanceMeters < MIN_REFERENCE_DISTANCE_METERS) {
    return null;
  }

  const firstPx = mapUnderlayWorldPointToPixels(underlay, points[0]);
  const secondPx = mapUnderlayWorldPointToPixels(underlay, points[1]);
  if (!firstPx || !secondPx || !underlay.widthPx || !underlay.heightPx) {
    return null;
  }

  const measuredDistancePx = Math.hypot(secondPx.x - firstPx.x, secondPx.y - firstPx.y);
  if (!Number.isFinite(measuredDistancePx) || measuredDistancePx <= 0) {
    return null;
  }

  const pixelsPerMeter = measuredDistancePx / referenceLengthMeters;
  if (!Number.isFinite(pixelsPerMeter) || pixelsPerMeter <= 0) {
    return null;
  }

  return {
    ...underlay,
    widthMeters: roundMeters(underlay.widthMeters * referenceLengthMeters / measuredDistanceMeters),
    depthMeters: roundMeters(underlay.depthMeters * referenceLengthMeters / measuredDistanceMeters),
    calibration: {
      pixelsPerMeter: roundPixels(pixelsPerMeter),
      referenceLengthMeters: roundMeters(referenceLengthMeters),
      referencePointsPx: [firstPx, secondPx],
    },
  };
}

/** "Reference set (underlay width × depth)" in the viewer's display unit; null until calibrated. */
export function formatFloorPlanCalibrationSummary(
  underlay: FloorPlanUnderlay | null,
  unit: DisplayUnit
): string | null {
  if (!underlay?.calibration) return null;
  const reference = formatDisplayLength(underlay.calibration.referenceLengthMeters * 1000, unit);
  const extent = formatPlanDimensionsLabel(underlay.widthMeters, underlay.depthMeters, unit);
  return `${reference} set (${extent})`;
}
