import type { CabinetCutListItem } from "./types";

type EdgeBandedPart = Pick<CabinetCutListItem, "edgeBandingMm" | "quantity">;

/** The exact length of edge banding on these cut-list parts, in metres. */
export function exactEdgeBandingM(parts: readonly EdgeBandedPart[]): number {
  return parts.reduce((sum, part) => sum + (part.edgeBandingMm * part.quantity) / 1000, 0);
}

/**
 * Edge banding totals, everywhere they're shown or exported: the cut list's exact length, rounded
 * once to 0.01 m (30 Oct 2026). Adding up the edge-banding schedule's rows, each already rounded,
 * came to 0.01 m less on some cabinets: 27.36 m in the studio against 27.37 m in the exports.
 */
export function roundedEdgeBandingM(parts: readonly EdgeBandedPart[]): number {
  return Math.round(exactEdgeBandingM(parts) * 100) / 100;
}
