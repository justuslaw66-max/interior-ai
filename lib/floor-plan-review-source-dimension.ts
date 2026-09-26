import type { FloorPlanDocumentV2, FloorPlanEntityProvenanceV2, FloorPlanPointMmV2 } from "./floor-plan-document-v2";
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

/** The integer plan point nearest `end` whose distance from `start` reads as `lengthMm`: vertices are whole
 *  millimetres, and rounding a rescaled endpoint on its own can put the measured span off by a millimetre, which the
 *  compiler reports as a dimension mismatch. */
function integerEndAtLength(start: FloorPlanPointMmV2, end: FloorPlanPointMmV2, lengthMm: number): FloorPlanPointMmV2 {
  const run = Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm);
  if (run < 1) return end;
  const exact = { xMm: start.xMm + ((end.xMm - start.xMm) / run) * lengthMm, zMm: start.zMm + ((end.zMm - start.zMm) / run) * lengthMm };
  let best = { xMm: Math.round(exact.xMm), zMm: Math.round(exact.zMm) };
  let bestError = Math.abs(Math.hypot(best.xMm - start.xMm, best.zMm - start.zMm) - lengthMm);
  for (const xMm of [Math.floor(exact.xMm), Math.ceil(exact.xMm)]) {
    for (const zMm of [Math.floor(exact.zMm), Math.ceil(exact.zMm)]) {
      const error = Math.abs(Math.hypot(xMm - start.xMm, zMm - start.zMm) - lengthMm);
      if (error < bestError) { best = { xMm, zMm }; bestError = error; }
    }
  }
  return best;
}

type ReviewerDimensionInput = {
  document: FloorPlanDocumentV2;
  floor: FloorPlanDocumentV2["floors"][number];
  calibrationId: string;
  sourceId: string;
  pageNumber: number;
  firstSource: ReviewSourcePoint;
  secondSource: ReviewSourcePoint;
  firstPlan: FloorPlanPointMmV2;
  secondPlan: FloorPlanPointMmV2;
  measuredMm: number;
  firstVertexId?: string;
  secondVertexId?: string;
};

/** The vertex a measurement end lands on: the caller's vertex, a coincident one the caller accepts, or the review's
 *  own (created or moved) at whole millimetres. */
function reviewerDimensionVertex(input: ReviewerDimensionInput, baseId: string, suffix: "start" | "end",
  point: FloorPlanPointMmV2, provenance: FloorPlanEntityProvenanceV2, preferredId: string | undefined,
  accept: (entry: FloorPlanPointMmV2) => boolean = () => true) {
  if (preferredId) return preferredId;
  const coincident = input.floor.vertices.find(
    (entry) => Math.hypot(entry.xMm - point.xMm, entry.zMm - point.zMm) <= 1 && accept(entry));
  if (coincident) return coincident.id;
  const id = `${baseId}:${suffix}`;
  const existing = input.floor.vertices.find((entry) => entry.id === id);
  if (existing) {
    existing.xMm = Math.round(point.xMm);
    existing.zMm = Math.round(point.zMm);
    existing.provenance = provenance;
    return id;
  }
  input.floor.vertices.push({ id, xMm: Math.round(point.xMm), zMm: Math.round(point.zMm), provenance });
  return id;
}

export function upsertReviewerSourceDimension(input: ReviewerDimensionInput) {
  const baseId = reviewerSourceDimensionBaseId(input.floor.id, input.calibrationId);
  const at = new Date().toISOString();
  const provenance = (role: "start" | "end" | "dimension") =>
    reviewerSourceDimensionProvenance({ ...input, baseId, at }, role);
  const fromVertexId = reviewerDimensionVertex(input, baseId, "start", input.firstPlan, provenance("start"), input.firstVertexId);
  const start = input.floor.vertices.find((entry) => entry.id === fromVertexId);
  const measuredMm = Math.round(input.measuredMm);
  const toVertexId = reviewerDimensionVertex(input, baseId, "end",
    start ? integerEndAtLength(start, input.secondPlan, measuredMm) : input.secondPlan, provenance("end"), input.secondVertexId,
    (entry) => !start || Math.abs(Math.hypot(entry.xMm - start.xMm, entry.zMm - start.zMm) - measuredMm) <= 0.5);
  const id = `${baseId}:measurement`;
  const nextDimension = {
    id,
    label: `${measuredMm} mm`,
    fromVertexId,
    toVertexId,
    axis: "aligned" as const,
    measuredMm,
    provenance: provenance("dimension"),
  };
  const existingIndex = input.floor.dimensions.findIndex((dimension) => dimension.id === id);
  if (existingIndex >= 0) input.floor.dimensions[existingIndex] = nextDimension;
  else input.floor.dimensions.push(nextDimension);
}
