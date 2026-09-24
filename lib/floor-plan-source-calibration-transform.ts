import type { FloorPlanPointMmV2, FloorPlanSourceCalibrationV2 } from "./floor-plan-document-v2";
import { buildFloorPlanSourceProjection } from "./floor-plan-imports/source-overlay-residuals";

/** Keep the draft's registration in the same coordinate system as its transformed geometry. */
export function transformSourceCalibration(
  calibration: FloorPlanSourceCalibrationV2,
  transformPoint: (point: FloorPlanPointMmV2) => FloorPlanPointMmV2,
  offset: FloorPlanPointMmV2,
  reversesOrientation: boolean
) {
  const projection = buildFloorPlanSourceProjection(calibration);
  let wasReflected = calibration.reflected ?? false;
  if (projection) {
    const origin = projection.project({ xMm: 0, zMm: 0 });
    const x = projection.project({ xMm: 1, zMm: 0 });
    const z = projection.project({ xMm: 0, zMm: 1 });
    wasReflected = (x.xPx - origin.xPx) * (z.yPx - origin.yPx) - (x.yPx - origin.yPx) * (z.xPx - origin.xPx) < 0;
  }
  for (const control of calibration.controlPoints) {
    const point = transformPoint(control.planMm);
    control.planMm = { xMm: point.xMm - offset.xMm, zMm: point.zMm - offset.zMm };
  }
  if (wasReflected !== reversesOrientation) calibration.reflected = true;
  else delete calibration.reflected;
}
