import { FloorPlanDocumentValidationErrorV2 } from "@/lib/floor-plan-compiler-v2";
import { applyPointScaleCalibration, registerEmptyPlanScaleCalibration, registerPointScaleCalibration } from "@/lib/floor-plan-import-review-geometry";
import { changeReviewMeasurement } from "@/lib/floor-plan-review-measurements";
import type { FloorPlanSourceMeasurementV2 } from "@/lib/floor-plan-document-v2";
import type { FloorPlanScaleReviewPanelProps } from "./FloorPlanScaleReviewPanel";

export function scaleReviewFailureMessage(cause: unknown) {
  if (cause instanceof FloorPlanDocumentValidationErrorV2) {
    return cause.issues.slice(0, 4).map(({ code, message }) => `${code}: ${message}`).join(" · ");
  }
  return cause instanceof Error ? cause.message : "Scale could not be applied.";
}

export function applyScaleReviewMeasurement(input: Pick<FloorPlanScaleReviewPanelProps,
  "document" | "floorId" | "sourceId" | "page" | "calibration" | "scalePoints"> & {
  printedMm: number; firstVertexId: string; secondVertexId: string;
  inputUnit: FloorPlanSourceMeasurementV2["inputUnit"]; sourceQuality: FloorPlanSourceMeasurementV2["sourceQuality"];
}) {
  if (!input.page || input.scalePoints.length !== 2) throw new Error("Choose two endpoints on the source page.");
  if(input.calibration?.photoCorrection)throw new Error("Use the photo correction measurements to change this scale, then create a separate corrected review. You can still add independent scale checks here.");
  const args = { ...input, pageNumber: input.page.pageNumber, pageWidthPx: input.page.widthPx, pageHeightPx: input.page.heightPx,
    first: input.scalePoints[0], second: input.scalePoints[1] };
  const hasVertices = (input.document.floors.find(({ id }) => id === input.floorId)?.vertices.length ?? 0) >= 2;
  const document = input.calibration ? applyPointScaleCalibration(args)
    : hasVertices ? registerPointScaleCalibration(args) : registerEmptyPlanScaleCalibration(args);
  const calibration = document.floors.find(({ id }) => id === input.floorId)?.calibrations.find((entry) =>
    entry.sourceId === input.sourceId && entry.pageNumber === input.page!.pageNumber);
  if (!calibration) throw new Error("The source registration could not be retained.");
  return changeReviewMeasurement({ document, floorId: input.floorId, calibrationId: calibration.id, primary: true,
    measurement: { id: "primary-scale", firstPx: args.first, secondPx: args.second, confirmedLengthMm: input.printedMm,
      inputUnit: input.inputUnit, sourceQuality: input.sourceQuality, confirmedAt: new Date().toISOString() } });
}
