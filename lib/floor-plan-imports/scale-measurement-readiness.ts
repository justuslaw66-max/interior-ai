import type { FloorPlanDocumentV2 } from "../floor-plan-document-v2";
import { evaluateSourceMeasurement } from "../floor-plan-scale-measurements";
import type { FloorPlanReviewIssue } from "./types";

export const isScaleMeasurementIssue = (issue: FloorPlanReviewIssue) => issue.id.startsWith("independent-scale-check:");

/** Recomputed server-side even if a client marks the previous issue resolved. */
export function collectScaleMeasurementIssues(document: FloorPlanDocumentV2): FloorPlanReviewIssue[] {
  return document.floors.flatMap((floor) => floor.calibrations.flatMap((calibration) =>
    (calibration.independentMeasurements ?? []).flatMap((measurement) => {
      const result = evaluateSourceMeasurement(calibration, measurement);
      if (result.agrees) return [];
      const reason = !result.independent
        ? "This check uses the scale-setting endpoints. Choose a different printed dimension."
        : Number.isFinite(result.residualPx)
          ? `This dimension differs by ${result.residualMm.toFixed(1)} mm (${Math.abs(result.residualPx).toFixed(2)} source pixels; allowed ${result.tolerancePx}). Correct the endpoints or measurement, or use a better source or guided tracing. One global scale cannot fix conflicting dimensions.`
          : "The current registration cannot measure this span. Re-register the source page.";
      return [{ id: `independent-scale-check:${floor.id}:${calibration.id}:${measurement.id}`,
        code: "independent_scale_conflict", severity: "critical" as const, resolved: false,
        message: `Page ${calibration.pageNumber}: ${reason}`, entityIds: [calibration.id] }];
    })
  ));
}
