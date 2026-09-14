import { solveScaleFromRegisteredEvidence, type RegisteredPageEvidence, type SemanticDimensionLabel, type SourceScaleSolution, type SourceVectorSegment } from "./deterministic-evidence";

const REVIEW_PREFIX = "Independent dimension conflict:";
const TOLERANCE_PX = 3;

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
  return page.semantics.dimensionLabels.flatMap((label) => {
    if (label.confidence < 0.45) return [];
    const spans = page.vectorSegments.map((segment) => centeredSpan(segment, label, page))
      .filter((span) => span !== null).sort((a, b) => a.distance - b.distance);
    const nearest = spans[0];
    if (!nearest) return [];
    // Two equally plausible, differently sized hosts require guided registration,
    // and cannot establish an independent contradiction by themselves.
    if (spans.slice(1).some((span) => span.distance <= nearest.distance + 3 && Math.abs(span.length - nearest.length) > TOLERANCE_PX)) return [];
    const residualPx = Math.abs(label.valueMm / solution.millimetresPerPixel - nearest.length);
    return residualPx > TOLERANCE_PX ? [{ valueMm: label.valueMm, residualPx, segmentId: nearest.segment.id }] : [];
  });
}

export function solveCrossCheckedScale(page: RegisteredPageEvidence): SourceScaleSolution | null {
  const solution = solveScaleFromRegisteredEvidence(page);
  if (!solution) return null;
  const conflicts = scaleDimensionConflicts(page, solution);
  if (!conflicts.length) return solution;
  const note = `${REVIEW_PREFIX} ${conflicts.map((item) => `${item.valueMm} mm differs by ${item.residualPx.toFixed(1)} source pixels`).join("; ")}. A single scale has not been confirmed. Check endpoints and another direction, or use a less distorted source.`;
  if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
  return null;
}

export function automaticScaleReviewMessage(page: RegisteredPageEvidence | undefined) {
  return page?.semantics.notes.find((note) => note.startsWith(REVIEW_PREFIX)) ??
    "Confirm one known distance. At least two printed dimensions must agree before automatic geometry can be trusted.";
}
