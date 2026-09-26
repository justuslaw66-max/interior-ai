import type { SemanticDimensionLabel, SourcePointPx } from "./deterministic-evidence";

export type DimensionCandidate = {
  dimensionIndex: number;
  valueMm: number;
  observedLengthPx: number;
  ratio: number;
  distancePx: number;
  segmentId: string;
  start: SourcePointPx;
  end: SourcePointPx;
  kind: "single_segment" | "compound_span";
};

export type ScaleInspectionReason = "insufficient_evidence" | "no_supported_cluster" | "competing_clusters" | "supported_cluster";
type ClusterSummary = Pick<SourceScaleSolution, "millimetresPerPixel" | "evidence" | "rmsResidualMm">;

/** Private source diagnostics survive rejection; none of these candidates is an accepted scale. */
export function scaleInspection(
  dimensions: readonly SemanticDimensionLabel[], candidates: readonly DimensionCandidate[],
  reason: ScaleInspectionReason, solution: SourceScaleSolution | null = null,
  clusters: readonly ClusterSummary[] = []
) {
  const diagnostics = {
    eligibleDimensionCount: dimensions.length,
    singleSegmentCandidateCount: candidates.filter((candidate) => candidate.kind === "single_segment").length,
    compoundSpanCandidateCount: candidates.filter((candidate) => candidate.kind === "compound_span").length,
    rejectedMissingEndpoints: dimensions.filter((dimension) => !dimension.extensionStart || !dimension.extensionEnd).length,
    rejectedUnsupportedSpan: dimensions.filter((dimension, index) => dimension.extensionStart && dimension.extensionEnd &&
      !candidates.some((candidate) => candidate.dimensionIndex === index && candidate.kind === "compound_span")).length,
    rejectedResidualClusters: Math.max(0, candidates.length - (solution?.dimensionCount ?? 0)),
  };
  return {
    solution: solution ? { ...solution, diagnostics } : null,
    reason, diagnostics, candidates,
    clusters: clusters.map(({ millimetresPerPixel, evidence, rmsResidualMm }) => ({ millimetresPerPixel, evidence, rmsResidualMm })),
  };
}

export type SourceScaleInspection = ReturnType<typeof scaleInspection>;

export type SourceScaleSolution = {
  millimetresPerPixel: number;
  dimensionCount: number;
  rmsResidualMm: number;
  confidence: number;
  evidence: Array<{
    valueMm: number;
    observedLengthPx: number;
    residualMm: number;
    segmentId: string;
    start: SourcePointPx;
    end: SourcePointPx;
  }>;
  diagnostics?: {
    eligibleDimensionCount: number;
    singleSegmentCandidateCount: number;
    compoundSpanCandidateCount: number;
    rejectedMissingEndpoints: number;
    rejectedUnsupportedSpan: number;
    rejectedResidualClusters: number;
  };
};
