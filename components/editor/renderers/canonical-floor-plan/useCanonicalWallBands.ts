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

/**
 * Cut sets kept per floor: a full turn around "h1" (13 rooms, 125 walls) shows
 * 48 at its 360 compass steps, their bands about 1,500 outline points each.
 */
export const CANONICAL_WALL_BAND_CACHE_LIMIT = 64;

const bandsByFloor = new WeakMap<
  CanonicalFloorPlanFloorRenderModel,
  LeastRecentlyUsedCache<CanonicalWallBand[]>
>();

function floorBandCache(floor: CanonicalFloorPlanFloorRenderModel) {
  let cache = bandsByFloor.get(floor);
  if (!cache) {
    cache = createLeastRecentlyUsedCache<CanonicalWallBand[]>(CANONICAL_WALL_BAND_CACHE_LIMIT);
    bandsByFloor.set(floor, cache);
  }
  return cache;
}

function excludedWallIdsOf(floor: CanonicalFloorPlanFloorRenderModel, cutawayWallKeys: ReadonlySet<string>) {
  return new Set(
    floor.walls
      .filter((wall) => cutawayWallKeys.has(canonicalWallCutawayKey(floor.id, wall.id)))
      .map((wall) => wall.id)
  );
}

/** Whether the floor already keeps the bands for this cut set. */
export function hasCanonicalWallBands(floor: CanonicalFloorPlanFloorRenderModel, cutawayWallKeys: ReadonlySet<string>) {
  return floorBandCache(floor).has([...excludedWallIdsOf(floor, cutawayWallKeys)].sort().join("|"));
}

/**
 * The floor's wall bodies as union bands, without its cut-away walls. Building
 * them takes about 30 ms on a 125-wall plan, so each floor keeps them per cut
 * set and orbiting back to a set reuses its bands.
 */
export function canonicalWallBands(
  floor: CanonicalFloorPlanFloorRenderModel,
  cutawayWallKeys: ReadonlySet<string>
): CanonicalWallBand[] {
  const cache = floorBandCache(floor);
  const excludedWallIds = excludedWallIdsOf(floor, cutawayWallKeys);
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
