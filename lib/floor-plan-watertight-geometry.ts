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

function planarPolygonsContainPoint(
  polygons: PlanarUnionPolygonMm[],
  point: FloorPlanPointMmV2
) {
  return polygons.some(
    (polygon) =>
      isPointInPlanarRing(point, polygon.outer) &&
      !(polygon.holes ?? []).some((hole) => isPointInPlanarRing(point, hole))
  );
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
  const wallThicknessById = new Map(
    floor.walls.map((wall) => [wall.id, wall.thicknessMm])
  );
  const wallLengthById = new Map(
    floor.walls.map((wall) => [
      wall.id,
      wall.centerlineSegments.at(-1)?.endOffsetMm ?? 0,
    ])
  );
  const excludedEndpointVertexIds = new Set(
    floor.walls
      .filter((wall) => excludedWallIds?.has(wall.id))
      .flatMap((wall) => [
        wall.path.startVertexId,
        wall.path.endVertexId,
      ])
  );
  const wallById = new Map(floor.walls.map((wall) => [wall.id, wall]));
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
    const regionsWithSamples = solids
      .filter(
        (solid) =>
          solid.bottomMm <= bottomMm + 0.001 &&
          solid.topMm >= topMm - 0.001
      )
      .map((solid) => {
        const wall = wallById.get(solid.wallId);
        const wallLengthMm = wallLengthById.get(solid.wallId) ?? 0;
        const touchesWallStart = solid.startOffsetMm <= 0.001;
        const touchesWallEnd =
          Math.abs(solid.endOffsetMm - wallLengthMm) <= 0.001;
        const squareStart =
          Boolean(wall) &&
          touchesWallStart &&
          excludedEndpointVertexIds.has(wall!.path.startVertexId);
        const squareEnd =
          Boolean(wall) &&
          touchesWallEnd &&
          excludedEndpointVertexIds.has(wall!.path.endVertexId);
        let footprint = solid.footprint;
        if (squareStart || squareEnd) {
          // Only endpoints made physical by the removed exterior wall are
          // squared. Rebuilding every wall as a rectangle whenever any cutaway
          // exists destroys unrelated miters and creates visible corner steps.
          const rectangular = buildRectangularWallFootprint(
            solid,
            wallThicknessById.get(solid.wallId) ?? 1
          );
          footprint = {
            ...solid.footprint,
            ...(squareStart
              ? {
                  startLeft: rectangular.startLeft,
                  startRight: rectangular.startRight,
                }
              : {}),
            ...(squareEnd
              ? {
                  endLeft: rectangular.endLeft,
                  endRight: rectangular.endRight,
                }
              : {}),
          };
        }
        return {
          region: {
            outer: [
              footprint.startLeft,
              footprint.endLeft,
              footprint.endRight,
              footprint.startRight,
            ],
          } satisfies PlanarRegionMm,
          centerlineSamples: [0.25, 0.5, 0.75].map((amount) => ({
            xMm:
              solid.start.xMm +
              (solid.end.xMm - solid.start.xMm) * amount,
            zMm:
              solid.start.zMm +
              (solid.end.zMm - solid.start.zMm) * amount,
          })),
        };
      });
    const regions = regionsWithSamples.map(({ region }) => region);
    const polygons = buildPlanarUnionPolygons(regions);
    // The planar union is intentionally optimized for large connected wall
    // graphs. Highly segmented imported façades can still form a rare
    // degenerate cycle at an opening lintel after a neighboring cutaway wall
    // is removed. Never let that cycle discard a source-proven wall solid:
    // restore only the affected solid as a normalized standalone polygon.
    for (const { region, centerlineSamples } of regionsWithSamples) {
      if (
        centerlineSamples.every((point) =>
          planarPolygonsContainPoint(polygons, point)
        )
      ) {
        continue;
      }
      polygons.push(...buildPlanarUnionPolygons([region]));
    }
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
