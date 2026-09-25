import type { RegisteredPageEvidence, SemanticDimensionLabel, SourcePointPx } from "./deterministic-evidence";
import type { DimensionCandidate } from "./scale-diagnostics";

export function dimensionHintDistance(page: RegisteredPageEvidence, label: SemanticDimensionLabel, start: SourcePointPx, end: SourcePointPx) {
  if (!label.extensionStart || !label.extensionEnd) return null;
  const first = { x: label.extensionStart.xRatio * page.widthPx, y: label.extensionStart.yRatio * page.heightPx };
  const second = { x: label.extensionEnd.xRatio * page.widthPx, y: label.extensionEnd.yRatio * page.heightPx };
  const distance = (a: SourcePointPx, b: SourcePointPx) => Math.hypot(a.x - b.x, a.y - b.y);
  return Math.min(Math.max(distance(start, first), distance(end, second)), Math.max(distance(start, second), distance(end, first)));
}

/** Both ends must belong to the proposed search region; a nearby midpoint cannot rescue an unrelated fragment. */
export function dimensionCandidateMatchesHint(page: RegisteredPageEvidence, label: SemanticDimensionLabel, candidate: Pick<DimensionCandidate, "start" | "end">) {
  const distance = dimensionHintDistance(page, label, candidate.start, candidate.end);
  return distance === null || distance <= 16;
}

export function rasterDimensionCandidates(page: RegisteredPageEvidence, label: SemanticDimensionLabel, dimensionIndex: number): DimensionCandidate[] | null {
  const labelIndex = page.semantics.dimensionLabels.indexOf(label);
  const association = page.dimensionSpanEvidence?.observations.find((entry) => entry.labelIndex === labelIndex && entry.valueMm === label.valueMm);
  if (!association) return null;
  if (dimensionHintDistance(page, label, association.hintStart, association.hintEnd) !== 0) return [];
  if (association.status !== "source_supported" || !association.start || !association.end) return [];
  const { start, end } = association;
  const observedLengthPx = Math.hypot(end.x - start.x, end.y - start.y);
  return [{ dimensionIndex, valueMm: label.valueMm, start, end, observedLengthPx, ratio: label.valueMm / observedLengthPx,
    distancePx: dimensionHintDistance(page, label, start, end) ?? 0, segmentId: `raster-ticks:${page.pageNumber}:${labelIndex}`, kind: "compound_span" }];
}

/** How many locally supported spans must agree before a disagreeing printed dimension is outvoted: a misread digit
 *  or a tick taken from the neighbouring dimension is then a review item, not a veto. Eight tight spans cannot all be
 *  wrong the same way; three can. */
export const OUTVOTE_MIN_SUPPORT = 6;

/** The cluster members that agree with their own median to 2 %, when at least OUTVOTE_MIN_SUPPORT of them do;
 *  otherwise the members unchanged, so a small cluster with an outlier still fails as before. */
export function outvoteOutliers<T extends { ratio: number }>(members: T[]): T[] {
  const sorted = members.map((member) => member.ratio).sort((a, b) => a - b);
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const kept = members.filter((member) => Math.abs(member.ratio / median - 1) <= 0.02);
  return kept.length >= OUTVOTE_MIN_SUPPORT ? kept : members;
}
