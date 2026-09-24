import { inspectScaleFromRegisteredEvidence, type RegisteredPageEvidence, type SemanticDimensionLabel, type SourceScaleSolution, type SourceVectorSegment } from "./deterministic-evidence";

const REVIEW_PREFIX = "Dimension association conflict:";
const TOLERANCE_PX = 3;
type DimensionConflict = Pick<SourceScaleSolution["evidence"][number], "valueMm" | "segmentId" | "start" | "end" | "observedLengthPx"> & {
  residualPx: number; orientation: SemanticDimensionLabel["orientation"]; rawText: string | null;
  endpointStatus: "source_supported" | "unverified";
};

function centeredSpan(segment: SourceVectorSegment, label: SemanticDimensionLabel, page: RegisteredPageEvidence) {
  const dx = Math.abs(segment.end.x - segment.start.x), dy = Math.abs(segment.end.y - segment.start.y);
  const orientation = dx >= dy ? "horizontal" : "vertical";
  const length = Math.hypot(dx, dy);
  if (label.orientation !== orientation || Math.min(dx, dy) > TOLERANCE_PX) return null;
  if (length < Math.hypot(page.widthPx, page.heightPx) * 0.1) return null;
  const distance = Math.hypot((segment.start.x + segment.end.x) / 2 - label.centerXRatio * page.widthPx,
    (segment.start.y + segment.end.y) / 2 - label.centerYRatio * page.heightPx);
  if (distance > Math.min(length * 0.12, Math.max(12, Math.hypot(page.widthPx, page.heightPx) * 0.025))) return null;
  return { segment, length, distance };
}

/** Cross-check nearby centered dimension spans independently of the winning ratio cluster. */
export function scaleDimensionConflicts(page: RegisteredPageEvidence, solution: SourceScaleSolution) {
  return page.semantics.dimensionLabels.flatMap((label, labelIndex): DimensionConflict[] => {
    if (label.confidence < 0.45) return [];
    const observed = page.dimensionSpanEvidence?.observations.find((entry) => entry.labelIndex === labelIndex && entry.valueMm === label.valueMm);
    if (observed) {
      if (observed.status !== "source_supported" || !observed.start || !observed.end) return [];
      const length = Math.hypot(observed.end.x - observed.start.x, observed.end.y - observed.start.y);
      const residualPx = Math.abs(label.valueMm / solution.millimetresPerPixel - length);
      return residualPx > TOLERANCE_PX ? [{ valueMm: label.valueMm, residualPx, segmentId: `raster-ticks:${page.pageNumber}:${labelIndex}`,
        start: observed.start, end: observed.end, observedLengthPx: length, orientation: label.orientation,
        rawText: label.rawText ?? null, endpointStatus: "source_supported" as const }] : [];
    }
    const spans = page.vectorSegments.map((segment) => centeredSpan(segment, label, page))
      .filter((span) => span !== null).sort((a, b) => a.distance - b.distance);
    const nearest = spans[0];
    if (!nearest) return [];
    // Two equally plausible, differently sized hosts require guided registration,
    // and cannot establish an independent contradiction by themselves.
    if (spans.slice(1).some((span) => span.distance <= nearest.distance + 3 && Math.abs(span.length - nearest.length) > TOLERANCE_PX)) return [];
    const residualPx = Math.abs(label.valueMm / solution.millimetresPerPixel - nearest.length);
    return residualPx > TOLERANCE_PX ? [{ valueMm: label.valueMm, residualPx, segmentId: nearest.segment.id,
      start: nearest.segment.start, end: nearest.segment.end, observedLengthPx: nearest.length,
      orientation: label.orientation, rawText: label.rawText ?? null, endpointStatus: "unverified" as const }] : [];
  });
}

function sourceSupportedScaleInterval(page: RegisteredPageEvidence) {
  const sourceSpanIntervals = (page.dimensionSpanEvidence?.observations ?? []).flatMap((entry) => {
    if (entry.status !== "source_supported" || !entry.start || !entry.end) return [];
    const length = Math.hypot(entry.end.x - entry.start.x, entry.end.y - entry.start.y);
    return [{ valueMm: entry.valueMm, start: entry.start, end: entry.end,
      minimumMmPerPx: entry.valueMm / (length + TOLERANCE_PX), maximumMmPerPx: entry.valueMm / (length - TOLERANCE_PX) }];
  });
  const minimum = Math.max(...sourceSpanIntervals.map((span) => span.minimumMmPerPx));
  const maximum = Math.min(...sourceSpanIntervals.map((span) => span.maximumMmPerPx));
  return sourceSpanIntervals.length ? { minimum, maximum, feasible: minimum <= maximum, spans: sourceSpanIntervals } : null;
}

export function diagnoseSourceScale(page: RegisteredPageEvidence) {
  const { solution: candidate, ...inspection } = inspectScaleFromRegisteredEvidence(page);
  const conflicts = candidate ? scaleDimensionConflicts(page, candidate) : [];
  const sourceSpanScaleInterval = sourceSupportedScaleInterval(page);
  if (sourceSpanScaleInterval && !sourceSpanScaleInterval.feasible) {
    const note = `${REVIEW_PREFIX} Raster-supported tick-to-tick dimensions do not share a common scale within ${TOLERANCE_PX} source pixels. Review the highlighted printed spans before selecting a calibration. Scale remains unconfirmed.`;
    if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
  }
  if (inspection.reason === "competing_clusters") {
    const note = `${REVIEW_PREFIX} Several locally supported scale candidates disagree. Their spans have unverified endpoints. Review the printed numbers and full dimension spans; scale remains unconfirmed.`;
    if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
  }
  if (conflicts.length) {
    const support = conflicts.every((item) => item.endpointStatus === "source_supported")
      ? "These tick-to-tick spans have raster line support; review their printed values and highlighted endpoints."
      : "These automatically associated spans have unverified endpoints. Check the printed numbers, endpoints and orientations before judging source distortion.";
    const note = `${REVIEW_PREFIX} ${conflicts.map((item) => `${item.valueMm} mm differs by ${item.residualPx.toFixed(1)} source pixels`).join("; ")}. ${support} Scale remains unconfirmed.`;
    if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
  }
  return { status: !candidate ? "no_supported_cluster" as const : conflicts.length || sourceSpanScaleInterval?.feasible === false ? "rejected_associations" as const : "accepted" as const,
    candidate, conflicts, tolerancePx: TOLERANCE_PX, sourceDimensions: page.dimensionSpanEvidence ?? null, sourceSpanScaleInterval, ...inspection };
}

export function solveCrossCheckedScale(page: RegisteredPageEvidence): SourceScaleSolution | null {
  const diagnosis = diagnoseSourceScale(page);
  return diagnosis.status === "accepted" ? diagnosis.candidate : null;
}

export function automaticScaleReviewMessage(page: RegisteredPageEvidence | undefined) {
  return page?.semantics.notes.findLast((note) => note.startsWith(REVIEW_PREFIX) || note.startsWith("Independent dimension conflict:")) ??
    "Confirm one known distance. At least two printed dimensions must agree before automatic geometry can be trusted.";
}
