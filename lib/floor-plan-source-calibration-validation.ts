import type { FloorPlanFloorV2,FloorPlanSourceCalibrationV2 } from "./floor-plan-document-v2";
import { validateSourceMeasurements } from "./floor-plan-scale-measurements";
import { validatePhotoCorrection } from "./floor-plan-photo-calibration";
import { photoReviewDraftSchema } from "./floor-plan-photo-constraints";

type CalibrationValidationChecks = {
  issue: (code: string, path: string, message: string) => void;
  integer: (value: number, path: string, options?: { positive?: boolean; nonnegative?: boolean }) => void;
  finite: (value: number, path: string) => void;
};

export function validateFloorSourceReviews(floor:FloorPlanFloorV2,path:string,sourceIds:ReadonlySet<string>,checks:CalibrationValidationChecks) {
  floor.calibrations.forEach((calibration,index)=>validateFloorPlanSourceCalibration(calibration,`${path}.calibrations[${index}]`,sourceIds,checks));
  if(floor.photoReviewDrafts===undefined)return;
  if(!Array.isArray(floor.photoReviewDrafts)||floor.photoReviewDrafts.length>16) {
    checks.issue("INVALID_PHOTO_REVIEW_DRAFT",`${path}.photoReviewDrafts`,"Keep at most sixteen source review drafts.");return;
  }
  const ids=new Set<string>();
  floor.photoReviewDrafts.forEach((value,index)=> {
    const parsed=photoReviewDraftSchema.safeParse(value),location=`${path}.photoReviewDrafts[${index}]`;
    if(!parsed.success){checks.issue("INVALID_PHOTO_REVIEW_DRAFT",location,"Invalid source review observations.");return;}
    const draft=parsed.data,key=`${draft.sourceId}:${draft.pageNumber}`;
    if(!sourceIds.has(draft.sourceId)||ids.has(key))checks.issue("INVALID_PHOTO_REVIEW_DRAFT",location,"Choose a distinct page of an existing source.");
    ids.add(key);
    const points=[...(draft.first??[]),...(draft.second??[]),...draft.measurements.flatMap((m)=>[m.first,m.second])];
    if(points.some((p)=>p.x<0||p.y<0||p.x>draft.widthPx||p.y>draft.heightPx))checks.issue("INVALID_PHOTO_REVIEW_DRAFT",location,"Keep observations inside the source image.");
  });
}

export function validateFloorPlanSourceCalibration(
  calibration: FloorPlanSourceCalibrationV2,
  calibrationPath: string,
  sourceIds: ReadonlySet<string>,
  checks: CalibrationValidationChecks
) {
  if(calibration.photoCorrection) {
    const message=validatePhotoCorrection(calibration.photoCorrection,calibration.imageWidthPx,calibration.imageHeightPx);
    if(message) checks.issue("INVALID_PHOTO_CORRECTION",`${calibrationPath}.photoCorrection`,message);
  }
  if (calibration.reflected !== undefined && typeof calibration.reflected !== "boolean") {
    checks.issue("INVALID_CALIBRATION_REFLECTION", `${calibrationPath}.reflected`, "Source registration reflection must be a boolean.");
  }
  for (const error of validateSourceMeasurements(calibration)) {
    checks.issue("INVALID_SOURCE_MEASUREMENT", `${calibrationPath}.${error.path}`, error.message);
  }
  if (!sourceIds.has(calibration.sourceId)) checks.issue("UNKNOWN_SOURCE", `${calibrationPath}.sourceId`, `Unknown source: ${calibration.sourceId}.`);
  checks.integer(calibration.pageNumber, `${calibrationPath}.pageNumber`, { positive: true });
  checks.integer(calibration.imageWidthPx, `${calibrationPath}.imageWidthPx`, { positive: true });
  checks.integer(calibration.imageHeightPx, `${calibrationPath}.imageHeightPx`, { positive: true });
  if (calibration.controlPoints.length < 2) {
    checks.issue("INSUFFICIENT_CALIBRATION", `${calibrationPath}.controlPoints`, "Source registration needs at least two control points.");
  }
  const sourcePointKeys = new Set<string>();
  calibration.controlPoints.forEach((point, pointIndex) => {
    const pointPath = `${calibrationPath}.controlPoints[${pointIndex}]`;
    checks.finite(point.sourcePx.x, `${pointPath}.sourcePx.x`);
    checks.finite(point.sourcePx.y, `${pointPath}.sourcePx.y`);
    checks.integer(point.planMm.xMm, `${pointPath}.planMm.xMm`);
    checks.integer(point.planMm.zMm, `${pointPath}.planMm.zMm`);
    const key = `${point.sourcePx.x}:${point.sourcePx.y}`;
    if (sourcePointKeys.has(key)) checks.issue("DUPLICATE_CALIBRATION_POINT", pointPath, "Calibration source points must be distinct.");
    sourcePointKeys.add(key);
  });
  if (calibration.rmsErrorPx !== undefined) {
    checks.finite(calibration.rmsErrorPx, `${calibrationPath}.rmsErrorPx`);
    if (calibration.rmsErrorPx < 0) checks.issue("NEGATIVE_CALIBRATION_ERROR", `${calibrationPath}.rmsErrorPx`, "Calibration error cannot be negative.");
  }
}
