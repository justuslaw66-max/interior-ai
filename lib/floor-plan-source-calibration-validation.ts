import type { FloorPlanSourceCalibrationV2 } from "./floor-plan-document-v2";

type CalibrationValidationChecks = {
  issue: (code: string, path: string, message: string) => void;
  integer: (value: number, path: string, options?: { positive?: boolean; nonnegative?: boolean }) => void;
  finite: (value: number, path: string) => void;
};

export function validateFloorPlanSourceCalibration(
  calibration: FloorPlanSourceCalibrationV2,
  calibrationPath: string,
  sourceIds: ReadonlySet<string>,
  checks: CalibrationValidationChecks
) {
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
