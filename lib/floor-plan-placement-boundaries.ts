import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import type { DimensionsMm } from "@/lib/catalog-schema";
import type { RoomSnapshot } from "@/lib/room-types";
import { polygonIntersectsFootprint } from "@/lib/design-page-geometry";
import { getRotatedFootprint } from "@/lib/design-page-utils";

export type CanonicalPlacementDimensions = Pick<DimensionsMm, "w" | "d"> & Partial<Pick<DimensionsMm, "h">>;

/** Uses the existing footprint collision engine with the exact extrusion slices drawn in 3D. */
export function findCanonicalPlacementWall(
  model: CanonicalFloorPlanRenderModel | undefined, room: RoomSnapshot,
  position: [number, number, number], rotationY: number, dimensions: CanonicalPlacementDimensions
): string | null {
  if (!model) return null;
  const floor = model.floors.find((entry) => entry.rooms.some(({ id }) => id === room.id));
  if (!floor) return null;
  const [width, depth] = getRotatedFootprint(dimensions.w / 1000, dimensions.d / 1000, rotationY);
  const x = position[0] + (room.planPosition?.x ?? 0), z = position[2] + (room.planPosition?.z ?? 0);
  const bottom = position[1] * 1000;
  const top = bottom + (dimensions.h ?? floor.storeyHeightMm);
  for (const wall of floor.walls) {
    if (wall.solids.some((solid) => {
      if (top <= solid.bottomMm || bottom >= solid.topMm) return false;
      const { startLeft, endLeft, endRight, startRight } = solid.footprint;
      const points = [startLeft, endLeft, endRight, startRight].map((point) => ({ x: point.xMm / 1000, z: point.zMm / 1000 }));
      return polygonIntersectsFootprint(points, x - width / 2, x + width / 2, z - depth / 2, z + depth / 2);
    })) return wall.id;
  }
  return null;
}
