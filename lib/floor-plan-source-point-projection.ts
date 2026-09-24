import type { FloorPlanPointMmV2, FloorPlanSourceCalibrationV2 } from "./floor-plan-document-v2";
import type { ReviewSourcePoint } from "./floor-plan-import-review-overlay";
import { buildFloorPlanSourceProjection } from "./floor-plan-imports/source-overlay-residuals";

export function projectReviewSourcePointToPlan(
  calibration: FloorPlanSourceCalibrationV2,
  point: ReviewSourcePoint
): FloorPlanPointMmV2 | null {
  return buildFloorPlanSourceProjection(calibration)?.unproject(point)??null;
}
