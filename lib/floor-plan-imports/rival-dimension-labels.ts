import type { RegisteredPageEvidence, SemanticDimensionLabel, SourceScaleSolution } from "./deterministic-evidence";
import type { RasterDimensionAssociation } from "./raster-dimension-spans";

/**
 * Two readers, one printed number: labels at the same place with different digits (d11: the vectorizer read 3730 and
 * the AI reader 3700 for one printed 3730; 2510 and 2570 for a printed 2570). Once a scale is known the ticks decide:
 * the value that sits on the scale over a tick-supported span - its own, or a rival's, since each reader's hint may
 * have found different ticks - wins, keeps the best span, and the others are set aside as review items.
 */

const SAME_PLACE = 0.02;
const TOLERANCE_PX = 3;

const samePlace = (a: SemanticDimensionLabel, b: SemanticDimensionLabel) =>
  a.valueMm !== b.valueMm && (a.orientation === b.orientation || a.orientation === "unknown" || b.orientation === "unknown") &&
  Math.hypot(a.centerXRatio - b.centerXRatio, a.centerYRatio - b.centerYRatio) <= SAME_PLACE;

function rivalGroups(labels: SemanticDimensionLabel[]): number[][] {
  const groups: number[][] = [];
  labels.forEach((label, index) => {
    if (label.confidence < 0.45) return;
    const group = groups.find((members) => members.some((member) => samePlace(labels[member], label)));
    if (group) group.push(index); else groups.push([index]);
  });
  return groups.filter((group) => group.length > 1);
}

const spanLength = (observation: RasterDimensionAssociation) =>
  observation.start && observation.end ? Math.hypot(observation.end.x - observation.start.x, observation.end.y - observation.start.y) : null;

/** Losers mapped to the winner that replaces them. The winner's observation becomes the span that put it on the scale. */
export function resolveRivalDimensionLabels(page: RegisteredPageEvidence, solution: SourceScaleSolution): Map<number, number> {
  const losers = new Map<number, number>();
  const observations = page.dimensionSpanEvidence?.observations;
  if (!observations) return losers;
  for (const group of rivalGroups(page.semantics.dimensionLabels)) {
    const spans = group.flatMap((index) => {
      const observation = observations.find((entry) => entry.labelIndex === index);
      const length = observation?.status === "source_supported" ? spanLength(observation) : null;
      return observation && length ? [{ observation, length }] : [];
    });
    let best: { index: number; span: (typeof spans)[number]; errorPx: number } | null = null;
    for (const index of group) for (const span of spans) {
      const errorPx = Math.abs(page.semantics.dimensionLabels[index].valueMm / solution.millimetresPerPixel - span.length);
      if (!best || errorPx < best.errorPx) best = { index, span, errorPx };
    }
    if (!best || best.errorPx > TOLERANCE_PX) continue;
    const winner = best.index, valueMm = page.semantics.dimensionLabels[winner].valueMm;
    if (best.span.observation.labelIndex !== winner) {
      // The winner keeps its own hints (an observation whose hints differ from its label's extension is stale and
      // ignored) and takes the rival's found ticks.
      const own = observations.findIndex((entry) => entry.labelIndex === winner);
      const label = page.semantics.dimensionLabels[winner];
      const hint = (point: { xRatio: number; yRatio: number } | undefined, fallback: RasterDimensionAssociation["hintStart"]) =>
        point ? { x: point.xRatio * page.widthPx, y: point.yRatio * page.heightPx } : fallback;
      const replacement = { ...best.span.observation, labelIndex: winner, valueMm,
        hintStart: own >= 0 ? observations[own].hintStart : hint(label.extensionStart, best.span.observation.hintStart),
        hintEnd: own >= 0 ? observations[own].hintEnd : hint(label.extensionEnd, best.span.observation.hintEnd) };
      if (own >= 0) observations[own] = replacement; else observations.push(replacement);
    }
    for (const index of group) if (index !== winner) losers.set(index, winner);
  }
  return losers;
}
