import type {
  SurfaceSuitabilityFacts,
  SurfaceSuitabilityTuple,
} from "./surface-material-runtime-types";

/**
 * The tile facts plan review checks a room's surfaces against (17 Oct 2026), as the render tuple carries them. The
 * generator builds them (`surface-material-suitability-source.ts`); this file only reads them, so the client never loads
 * ABK's sheets. See docs/architecture/surface-material-runtime-boundary.md.
 */
export const SURFACE_SUITABILITY_OUTDOOR_FLOOR = 1;
export const SURFACE_SUITABILITY_WALL_TILE_BODY = 2;
export const SURFACE_SUITABILITY_LAMINATE_SHEET = 4;

export function encodeSurfaceSuitability(facts: SurfaceSuitabilityFacts): SurfaceSuitabilityTuple | null {
  const flags =
    (facts.outdoor_floor ? SURFACE_SUITABILITY_OUTDOOR_FLOOR : 0) |
    (facts.wall_tile_body ? SURFACE_SUITABILITY_WALL_TILE_BODY : 0) |
    (facts.laminate_sheet ? SURFACE_SUITABILITY_LAMINATE_SHEET : 0);
  if (!facts.slip_rating && !facts.barefoot_slip_rating && !facts.datasheet && flags === 0) return null;
  return [facts.slip_rating, facts.barefoot_slip_rating, facts.datasheet, flags];
}

export function decodeSurfaceSuitability(tuple: SurfaceSuitabilityTuple): SurfaceSuitabilityFacts {
  const [slipRating, barefootSlipRating, datasheet, flags] = tuple;
  return {
    slip_rating: slipRating,
    barefoot_slip_rating: barefootSlipRating,
    datasheet,
    outdoor_floor: (flags & SURFACE_SUITABILITY_OUTDOOR_FLOOR) !== 0,
    wall_tile_body: (flags & SURFACE_SUITABILITY_WALL_TILE_BODY) !== 0,
    laminate_sheet: (flags & SURFACE_SUITABILITY_LAMINATE_SHEET) !== 0,
  };
}
