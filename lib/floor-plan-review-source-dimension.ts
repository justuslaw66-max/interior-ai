import type { FloorPlanEntityProvenanceV2 } from "./floor-plan-document-v2";
import type { ReviewSourcePoint } from "./floor-plan-import-review-overlay";

export function reviewerSourceDimensionBaseId(floorId: string, calibrationId: string) {
  return `consumer-source-dimension:${floorId}:${calibrationId.replace(/[^A-Za-z0-9_.:-]/g, "-")}`;
}

export function reviewerSourceDimensionProvenance(input: {
  baseId: string; sourceId: string; pageNumber: number; calibrationId: string;
  firstSource: ReviewSourcePoint; secondSource: ReviewSourcePoint; at: string;
}, role: "start" | "end" | "dimension"): FloorPlanEntityProvenanceV2 {
  const { firstSource, secondSource } = input;
  return {
    confidence: 1, extractionVersion: "consumer-scale-calibration-v1",
    evidence: [{
      sourceId: input.sourceId, basis: "user_confirmed", confidence: 1,
      extractorVersion: "consumer-scale-calibration-v1", pageNumber: input.pageNumber, calibrationId: input.calibrationId,
      cropPx: {
        xPx: Math.max(0, Math.floor(Math.min(firstSource.x, secondSource.x))),
        yPx: Math.max(0, Math.floor(Math.min(firstSource.y, secondSource.y))),
        widthPx: Math.max(1, Math.ceil(Math.abs(secondSource.x - firstSource.x))),
        heightPx: Math.max(1, Math.ceil(Math.abs(secondSource.y - firstSource.y))),
      },
      sourceAnchors: role === "start" ? [{ role: "start", sourcePx: firstSource }]
        : role === "end" ? [{ role: "end", sourcePx: secondSource }]
          : [{ role: "start", sourcePx: firstSource }, { role: "end", sourcePx: secondSource }],
      note: role === "dimension" ? "Printed source dimension entered and confirmed by the reviewer."
        : `${role === "start" ? "First" : "Second"} endpoint of the reviewer-confirmed printed dimension.`,
    }],
    reviewHistory: [{ id: `${input.baseId}:${role}:confirmation`, action: "confirmed", reviewerId: "consumer-import-review",
      reviewedAt: input.at, note: "Reviewer confirmed the printed source dimension and endpoints." }],
  };
}
