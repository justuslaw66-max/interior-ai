import type { CanonicalFloorPlanFloorRenderModel } from "@/lib/floor-plan-render-model";
import type { CanonicalFloorPlanWallFootprint } from "@/lib/floor-plan-wall-footprints";
import { buildRectangularWallFootprint } from "@/lib/floor-plan-wall-footprints";
import { buildPlanarUnionPolygons } from "@/lib/floor-plan-planar-union";
import type { PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";

const ring = (footprint: CanonicalFloorPlanWallFootprint) =>
  [footprint.startLeft, footprint.endLeft, footprint.endRight, footprint.startRight];

/** Keep each uninterrupted wall section editable while retaining the shared corner geometry. */
export function buildFloorPlanVectorWalls(floor: CanonicalFloorPlanFloorRenderModel): PlanDrawingPrimitive[] {
  return floor.walls.flatMap((wall) => wall.planSegments.map((segment, index) => {
    const solid = wall.solids.find((candidate) => Math.abs(candidate.startOffsetMm - segment.startOffsetMm) < 0.001 &&
      Math.abs(candidate.endOffsetMm - segment.endOffsetMm) < 0.001);
    const rectangular = ring(buildRectangularWallFootprint(segment, wall.thicknessMm));
    // A multi-wall node can leave a wedge between independently mitered strips.
    // The actual wall sweep still occupies that area. Union only this section's
    // sweep and corner footprint; never union different walls or bridge openings.
    const regions = [rectangular, ...(solid ? [ring(solid.footprint)] : [])];
    const polygons = buildPlanarUnionPolygons(regions.map((outer) => ({ outer })));
    if (!polygons.length) throw new Error(`Wall ${wall.id} has no supported vector footprint.`);
    const rings = polygons.flatMap((polygon) => [polygon.outer, ...polygon.holes]);
    const path = rings.map((points) => points.map((point, i) =>
      `${i ? "L" : "M"} ${Number(point.xMm.toFixed(6))} ${Number(point.zMm.toFixed(6))}`).join(" ") + " Z").join(" ");
    return { id: `${wall.id}:wall:${index}`, kind: "path", path, fill: true, points: rings.flat(), role: "wall" };
  }));
}
