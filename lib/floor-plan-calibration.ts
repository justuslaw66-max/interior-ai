import type { FloorPlanPoint, FloorPlanUnderlay } from "@/lib/floor-plan-types";

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
  const rotationRadians = (underlay.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  const localX = dx * cos - dz * sin;
  const localZ = dx * sin + dz * cos;

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
    widthMeters: roundMeters(underlay.widthPx / pixelsPerMeter),
    depthMeters: roundMeters(underlay.heightPx / pixelsPerMeter),
    calibration: {
      pixelsPerMeter: roundPixels(pixelsPerMeter),
      referenceLengthMeters: roundMeters(referenceLengthMeters),
      referencePointsPx: [firstPx, secondPx],
    },
  };
}
