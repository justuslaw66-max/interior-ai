import { z } from "zod";
import type { FloorPlanSourceCalibrationV2, FloorPlanSourceMeasurementV2 } from "./floor-plan-document-v2";
import { projectReviewSourcePointToPlan } from "./floor-plan-source-point-projection";
import { buildFloorPlanSourceProjection } from "./floor-plan-imports/source-projection";
import { originalPhotoPoint } from "./floor-plan-photo-constraints";

const point = z.object({ x: z.number().finite(), y: z.number().finite() }).strict();
export const sourceMeasurementSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(200),
  firstPx: point,
  secondPx: point,
  confirmedLengthMm: z.number().int().min(100).max(1_000_000),
  inputUnit: z.enum(["mm", "cm", "in", "ft-in"]),
  sourceQuality: z.enum(["clean", "scan"]),
  basis: z.enum(["printed", "assumed_opening_width"]).optional(),
  confirmedAt: z.string().datetime({ offset: true }),
  residualAtConfirmation: z.object({ millimetres: z.number().finite(), pixels: z.number().finite() }).strict().optional(),
}).strict();
const calibrationMeasurementsSchema = z.object({ primaryMeasurement: sourceMeasurementSchema.optional(),
  independentMeasurements: z.array(sourceMeasurementSchema).max(32).optional() });

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(b.x - a.x, b.y - a.y);

export function validateSourceMeasurements(calibration: FloorPlanSourceCalibrationV2) {
  const parsed = calibrationMeasurementsSchema.safeParse(calibration);
  if (!parsed.success) return parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
  const errors: { path: string; message: string }[] = [], ids = new Set<string>();
  const entries = [...(parsed.data.primaryMeasurement ? [{ path: "primaryMeasurement", value: parsed.data.primaryMeasurement }] : []),
    ...(parsed.data.independentMeasurements ?? []).map((value, index) => ({ path: `independentMeasurements[${index}]`, value }))];
  for (const { path, value } of entries) {
    if (ids.has(value.id)) errors.push({ path, message: "Measurement IDs must be distinct." });
    ids.add(value.id);
    if ([value.firstPx, value.secondPx].some(({ x, y }) => x < 0 || y < 0 || x > calibration.imageWidthPx || y > calibration.imageHeightPx)) {
      errors.push({ path, message: "Measurement endpoints must stay inside the registered source page." });
    }
    if (distance(value.firstPx, value.secondPx) < Math.max(8, Math.hypot(calibration.imageWidthPx, calibration.imageHeightPx) * 0.01)) {
      errors.push({ path, message: "Choose a longer source span for a reliable measurement." });
    }
  }
  return errors;
}

function isIndependent(calibration: FloorPlanSourceCalibrationV2, measurement: FloorPlanSourceMeasurementV2) {
  const original=(point:{x:number;y:number})=>calibration.photoCorrection?originalPhotoPoint(calibration.photoCorrection.constraints,point):point;
  const apart=(a:{x:number;y:number},b:{x:number;y:number})=>distance(original(a),original(b));
  const primary = calibration.primaryMeasurement;
  if (!primary) {
    return !(calibration.controlPoints.some(({ sourcePx }) => apart(sourcePx, measurement.firstPx) <= 3) &&
      calibration.controlPoints.some(({ sourcePx }) => apart(sourcePx, measurement.secondPx) <= 3));
  }
  return !((apart(primary.firstPx, measurement.firstPx) <= 3 && apart(primary.secondPx, measurement.secondPx) <= 3) ||
    (apart(primary.secondPx, measurement.firstPx) <= 3 && apart(primary.firstPx, measurement.secondPx) <= 3));
}

/** Length disagreement in the measured direction; never fits or warps geometry. */
export function evaluateSourceMeasurement(calibration: FloorPlanSourceCalibrationV2, measurement: FloorPlanSourceMeasurementV2) {
  const first = projectReviewSourcePointToPlan(calibration, measurement.firstPx);
  const second = projectReviewSourcePointToPlan(calibration, measurement.secondPx);
  const lengthMm = first && second ? Math.hypot(second.xMm - first.xMm, second.zMm - first.zMm) : NaN;
  const sourceLengthPx = distance(measurement.firstPx, measurement.secondPx);
  const residualMm = lengthMm - measurement.confirmedLengthMm;
  let residualPx = residualMm * sourceLengthPx / lengthMm;
  const projection=calibration.photoCorrection?buildFloorPlanSourceProjection(calibration):null;
  if(projection && first && second && lengthMm>0) {
    const ratio=measurement.confirmedLengthMm/lengthMm;
    const a=projection.project({xMm:second.xMm+(first.xMm-second.xMm)*ratio,zMm:second.zMm+(first.zMm-second.zMm)*ratio});
    const b=projection.project({xMm:first.xMm+(second.xMm-first.xMm)*ratio,zMm:first.zMm+(second.zMm-first.zMm)*ratio});
    const original=(point:{x:number;y:number})=>calibration.photoCorrection?originalPhotoPoint(calibration.photoCorrection.constraints,point):point;
    residualPx=Math.sign(residualMm)*Math.max(distance(original({x:a.xPx,y:a.yPx}),original(measurement.firstPx)),distance(original({x:b.xPx,y:b.yPx}),original(measurement.secondPx)));
  }
  const tolerancePx = measurement.sourceQuality === "clean" ? 2 : 3;
  const independent = isIndependent(calibration, measurement);
  return { lengthMm, residualMm, residualPx, tolerancePx, independent,
    agrees: independent && Number.isFinite(residualPx) && Math.abs(residualPx) <= tolerancePx };
}
