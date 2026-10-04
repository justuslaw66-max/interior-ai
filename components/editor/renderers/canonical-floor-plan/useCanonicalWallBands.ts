import { useMemo } from "react";

import { canonicalWallCutawayKey } from "@/lib/floor-plan-camera-cutaway";
import type { CanonicalFloorPlanFloorRenderModel } from "@/lib/floor-plan-render-model";
import {
  buildCanonicalWallUnionBands,
  type CanonicalWallUnionBand,
} from "@/lib/floor-plan-watertight-geometry";
import {
  createLeastRecentlyUsedCache,
  type LeastRecentlyUsedCache,
} from "@/lib/least-recently-used-cache";
import { planarUnionShapes } from "./geometry";

type CanonicalWallBand = CanonicalWallUnionBand & { shapes: ReturnType<typeof planarUnionShapes> };

/** Cut sets kept per floor: a full turn around "h1" (13 rooms, 125 walls) passes 23. */
export const CANONICAL_WALL_BAND_CACHE_LIMIT = 32;

const bandsByFloor = new WeakMap<
  CanonicalFloorPlanFloorRenderModel,
  LeastRecentlyUsedCache<CanonicalWallBand[]>
>();

/**
 * The floor's wall bodies as union bands, without its cut-away walls. Building
 * them takes about 30 ms on a 125-wall plan, so each floor keeps them per cut
 * set and orbiting back to a set reuses its bands.
 */
export function canonicalWallBands(
  floor: CanonicalFloorPlanFloorRenderModel,
  cutawayWallKeys: ReadonlySet<string>
): CanonicalWallBand[] {
  let cache = bandsByFloor.get(floor);
  if (!cache) {
    cache = createLeastRecentlyUsedCache<CanonicalWallBand[]>(CANONICAL_WALL_BAND_CACHE_LIMIT);
    bandsByFloor.set(floor, cache);
  }
  const excludedWallIds = new Set(
    floor.walls
      .filter((wall) => cutawayWallKeys.has(canonicalWallCutawayKey(floor.id, wall.id)))
      .map((wall) => wall.id)
  );
  // Shapes are built here, not per render, so a re-render keeps each band's geometry.
  return cache.get([...excludedWallIds].sort().join("|"), () =>
    buildCanonicalWallUnionBands(floor, { excludedWallIds }).map((band) => ({
      ...band,
      shapes: planarUnionShapes(band.polygons),
    }))
  );
}

export function useCanonicalWallBands(
  floor: CanonicalFloorPlanFloorRenderModel,
  cutawayWallKeys: ReadonlySet<string>
) {
  return useMemo(() => canonicalWallBands(floor, cutawayWallKeys), [cutawayWallKeys, floor]);
}
