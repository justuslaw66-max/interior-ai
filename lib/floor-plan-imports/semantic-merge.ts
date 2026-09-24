import type { PageSemanticEvidence } from "./deterministic-evidence";
import { mergeDimensionLabels } from "./semantic-dimension-merge";

type Centre = { centerXRatio: number; centerYRatio: number };

function distanceBetween(left: Centre, right: Centre) {
  return Math.hypot(left.centerXRatio - right.centerXRatio, left.centerYRatio - right.centerYRatio);
}

function normalizedLabel(value: string) {
  return value.trim().toLocaleLowerCase();
}

function centroid(points: ReadonlyArray<{ xRatio: number; yRatio: number }>): Centre {
  return points.reduce(
    (total, point) => ({
      centerXRatio: total.centerXRatio + point.xRatio / points.length,
      centerYRatio: total.centerYRatio + point.yRatio / points.length,
    }),
    { centerXRatio: 0, centerYRatio: 0 }
  );
}

/** Preferred observations first, then every supplemental one that no preferred observation already covers. */
function appendUnmatched<T>(
  preferred: readonly T[] | undefined,
  supplemental: readonly T[] | undefined,
  covers: (existing: T, candidate: T) => boolean
): T[] {
  const merged = [...(preferred ?? [])];
  for (const candidate of supplemental ?? []) {
    if (!merged.some((existing) => covers(existing, candidate))) merged.push(candidate);
  }
  return merged;
}

/**
 * Merges one page's semantic observations from a second source (vision, local
 * OCR, the local vectorizer) into the deterministic set. Deterministic
 * observations win unless the caller prefers the supplement; an observation
 * the other source already reports at the same place is not repeated.
 */
export function mergeSemantics(
  deterministic: PageSemanticEvidence,
  semantic: PageSemanticEvidence | null,
  preferSemantic = false
): PageSemanticEvidence {
  if (!semantic) return deterministic;
  const preferred = preferSemantic ? semantic : deterministic;
  const supplemental = preferSemantic ? deterministic : semantic;
  return {
    planRegion: preferred.planRegion ?? supplemental.planRegion ?? null,
    unitSystem:
      preferred.unitSystem && preferred.unitSystem !== "unknown"
        ? preferred.unitSystem
        : supplemental.unitSystem ?? "unknown",
    roomLabels: appendUnmatched(
      preferred.roomLabels,
      supplemental.roomLabels,
      (existing, candidate) =>
        normalizedLabel(existing.label) === normalizedLabel(candidate.label) &&
        distanceBetween(existing, candidate) <= 0.04
    ),
    roomBoundaries: appendUnmatched(
      preferred.roomBoundaries,
      supplemental.roomBoundaries,
      (existing, candidate) =>
        normalizedLabel(existing.label) === normalizedLabel(candidate.label) &&
        distanceBetween(centroid(existing.points), centroid(candidate.points)) <= 0.04
    ),
    dimensionLabels: mergeDimensionLabels(preferred.dimensionLabels, supplemental.dimensionLabels),
    openingSymbols: appendUnmatched(
      preferred.openingSymbols,
      supplemental.openingSymbols,
      (existing, candidate) => existing.kind === candidate.kind && distanceBetween(existing, candidate) <= 0.04
    ),
    fixtureSymbols: appendUnmatched(
      preferred.fixtureSymbols,
      supplemental.fixtureSymbols,
      (existing, candidate) => existing.kind === candidate.kind && distanceBetween(existing, candidate) <= 0.035
    ),
    entrance: preferred.entrance ?? supplemental.entrance,
    notes: [...supplemental.notes, ...preferred.notes],
  };
}
