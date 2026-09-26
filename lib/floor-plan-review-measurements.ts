import { compileFloorPlanDocumentV2 } from "./floor-plan-compiler-v2";
import type { FloorPlanDocumentV2, FloorPlanSourceMeasurementV2 } from "./floor-plan-document-v2";
import { evaluateSourceMeasurement, sourceMeasurementSchema } from "./floor-plan-scale-measurements";

/** Review evidence changes only; source pixels and canonical geometry stay intact. */
export function changeReviewMeasurement(input: {
  document: FloorPlanDocumentV2;
  floorId: string;
  calibrationId: string;
  measurement: FloorPlanSourceMeasurementV2 | { removeId: string };
  primary?: boolean;
}): FloorPlanDocumentV2 {
  const next = structuredClone(input.document);
  const calibration = next.floors.find(({ id }) => id === input.floorId)?.calibrations.find(({ id }) => id === input.calibrationId);
  if (!calibration) throw new Error("Select the registered source page before checking its scale.");
  if ("removeId" in input.measurement) {
    const removeId = input.measurement.removeId;
    calibration.independentMeasurements = (calibration.independentMeasurements ?? []).filter(({ id }) => id !== removeId);
  } else {
    const measurement = sourceMeasurementSchema.parse(input.measurement);
    const result = evaluateSourceMeasurement(calibration, measurement);
    if (!input.primary && !result.independent) {
      throw new Error("Choose a different dimension from the one used to set scale, preferably in the other direction.");
    }
    measurement.residualAtConfirmation = { millimetres: result.residualMm, pixels: result.residualPx };
    if (input.primary) calibration.primaryMeasurement = measurement;
    else calibration.independentMeasurements = [...(calibration.independentMeasurements ?? []).filter(({ id }) => id !== measurement.id), measurement];
  }
  next.verification = { tier: "needs_review", criticalIssueIds: [...next.verification.criticalIssueIds] };
  compileFloorPlanDocumentV2(next);
  return next;
}
