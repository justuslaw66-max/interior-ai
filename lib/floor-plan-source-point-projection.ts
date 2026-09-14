import type { FloorPlanPointMmV2, FloorPlanSourceCalibrationV2 } from "./floor-plan-document-v2";
import type { ReviewSourcePoint } from "./floor-plan-import-review-overlay";
import { buildFloorPlanSourceProjection } from "./floor-plan-imports/source-overlay-residuals";

export function projectReviewSourcePointToPlan(
  calibration: FloorPlanSourceCalibrationV2,
  point: ReviewSourcePoint
): FloorPlanPointMmV2 | null {
  const projection = buildFloorPlanSourceProjection(calibration);
  if (!projection) return null;
  const origin = projection.project({ xMm: 0, zMm: 0 });
  const xUnit = projection.project({ xMm: 1, zMm: 0 });
  const zUnit = projection.project({ xMm: 0, zMm: 1 });
  const a = xUnit.xPx - origin.xPx;
  const b = zUnit.xPx - origin.xPx;
  const c = xUnit.yPx - origin.yPx;
  const d = zUnit.yPx - origin.yPx;
  const determinant = a * d - b * c;
  if (Math.abs(determinant) < 1e-12) return null;
  const x = point.x - origin.xPx;
  const y = point.y - origin.yPx;
  return {
    xMm: (d * x - b * y) / determinant,
    zMm: (-c * x + a * y) / determinant,
  };
}

