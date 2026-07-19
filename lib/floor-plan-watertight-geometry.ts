import type {
  CompiledFloorPlanRoomLoopV2,
  CompiledFloorPlanRoomV2,
} from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";
import {
  isPointInPlanarRing,
  buildPlanarUnionPolygons,
  type PlanarRegionMm,
  type PlanarUnionPolygonMm,
} from "@/lib/floor-plan-planar-union";
import type {
  CanonicalFloorPlanFloorRenderModel,
  CanonicalFloorPlanWallRenderModel,
} from "@/lib/floor-plan-render-model";
import { buildRectangularWallFootprint } from "@/lib/floor-plan-wall-footprints";

export type CanonicalWallUnionBand = {
  bottomMm: number;
  topMm: number;
  polygons: PlanarUnionPolygonMm[];
};

function samePoint(first: FloorPlanPointMmV2, second: FloorPlanPointMmV2) {
  return first.xMm === second.xMm && first.zMm === second.zMm;
}

function appendPoint(points: FloorPlanPointMmV2[], point: FloorPlanPointMmV2) {
  if (!points.length || !samePoint(points[points.length - 1], point)) {
    points.push(point);
  }
}

function roomLoopPoints(
  loop: CompiledFloorPlanRoomLoopV2,
  wallById: Map<string, CanonicalFloorPlanWallRenderModel>
) {
  const points: FloorPlanPointMmV2[] = [];
  for (const reference of loop.walls) {
    const wall = wallById.get(reference.wallId);
    if (!wall?.centerlineSegments.length) {
      appendPoint(points, reference.start);
      appendPoint(points, reference.end);
      continue;
    }
    const segments =
      reference.direction === "forward"
        ? wall.centerlineSegments
        : [...wall.centerlineSegments].reverse().map((segment) => ({
            ...segment,
            start: segment.end,
            end: segment.start,
          }));
    for (const segment of segments) appendPoint(points, segment.start);
    appendPoint(points, segments[segments.length - 1].end);
  }
  if (points.length > 1 && samePoint(points[0], points[points.length - 1])) {
    points.pop();
  }
  return points;
}

function roomRegions(
  room: CompiledFloorPlanRoomV2,
  wallById: Map<string, CanonicalFloorPlanWallRenderModel>
) {
  const outerRings = room.wallLoops
    .filter((loop) => loop.kind === "outer")
    .map((loop) => roomLoopPoints(loop, wallById))
    .filter((ring) => ring.length >= 3);
  const holeRings = room.wallLoops
    .filter((loop) => loop.kind === "hole")
    .map((loop) => roomLoopPoints(loop, wallById))
    .filter((ring) => ring.length >= 3);
  return outerRings.map((outer): PlanarRegionMm => ({
    outer,
    holes: holeRings.filter((hole) => isPointInPlanarRing(hole[0], outer)),
  }));
}

function wallCenterlineRegions(
  walls: CanonicalFloorPlanWallRenderModel[]
): PlanarRegionMm[] {
  return walls.flatMap((wall) =>
    wall.centerlineSegments.map((segment) => {
      const footprint = buildRectangularWallFootprint(segment, wall.thicknessMm);
      return {
        outer: [
          footprint.startLeft,
          footprint.endLeft,
          footprint.endRight,
          footprint.startRight,
        ],
      };
    })
  );
}

/**
 * Build one occupied slab footprint for the complete canonical floor. Room
 * regions remove internal room edges, while full wall footprints carry the
 * slab through door thresholds and out to the exterior wall face.
 */
export function buildCanonicalFloorSlabPolygons(
  floor: CanonicalFloorPlanFloorRenderModel
) {
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
  const regions = [
    ...floor.rooms.flatMap((room) => roomRegions(room, wallById)),
    ...wallCenterlineRegions(floor.walls),
  ];
  const voids = floor.structures
    .filter((structure) => structure.kind === "void")
    .map((structure) => structure.points);
  return buildPlanarUnionPolygons(regions, voids);
}

function polygonSignature(polygons: PlanarUnionPolygonMm[]) {
  return JSON.stringify(polygons);
}

/**
 * Slice wall solids at every vertical transition, union their plan footprints,
 * and merge identical neighboring slices. Each visible height band is one
 * non-overlapping mesh, so T-junctions and right-angle corners cannot expose
 * overlapping caps or hollow wedges.
 */
export function buildCanonicalWallUnionBands(
  floor: CanonicalFloorPlanFloorRenderModel,
  options: { excludedWallIds?: ReadonlySet<string> } = {}
): CanonicalWallUnionBand[] {
  const excludedWallIds = options.excludedWallIds;
  const hasCutawayWalls = Boolean(excludedWallIds?.size);
  const wallThicknessById = new Map(
    floor.walls.map((wall) => [wall.id, wall.thicknessMm])
  );
  const solids = floor.walls
    .filter((wall) => !excludedWallIds?.has(wall.id))
    .flatMap((wall) => wall.solids);
  const boundaries = [...new Set(solids.flatMap((solid) => [solid.bottomMm, solid.topMm]))]
    .sort((left, right) => left - right);
  const bands: CanonicalWallUnionBand[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const bottomMm = boundaries[index];
    const topMm = boundaries[index + 1];
    if (topMm - bottomMm <= 0.001) continue;
    const regions: PlanarRegionMm[] = solids
      .filter(
        (solid) =>
          solid.bottomMm <= bottomMm + 0.001 &&
          solid.topMm >= topMm - 0.001
      )
      .map((solid) => {
        // A cutaway removes the neighboring wall that normally completes a
        // miter. Rebuild the surviving solid as a square-ended rectangle so
        // its exposed section is capped cleanly instead of retaining a
        // diagonal notch from the hidden wall.
        const footprint = hasCutawayWalls
          ? buildRectangularWallFootprint(
              solid,
              wallThicknessById.get(solid.wallId) ?? 1
            )
          : solid.footprint;
        return {
          outer: [
            footprint.startLeft,
            footprint.endLeft,
            footprint.endRight,
            footprint.startRight,
          ],
        };
      });
    const polygons = buildPlanarUnionPolygons(regions);
    if (!polygons.length) continue;
    const previous = bands.at(-1);
    if (
      previous &&
      Math.abs(previous.topMm - bottomMm) <= 0.001 &&
      polygonSignature(previous.polygons) === polygonSignature(polygons)
    ) {
      previous.topMm = topMm;
    } else {
      bands.push({ bottomMm, topMm, polygons });
    }
  }
  return bands;
}
