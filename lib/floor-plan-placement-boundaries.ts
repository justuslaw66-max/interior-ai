import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import type { DimensionsMm } from "@/lib/catalog-schema";
import type { RoomSnapshot } from "@/lib/room-types";
import { polygonIntersectsFootprint } from "@/lib/design-page-geometry";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import { getCanonicalRoomWallFinish, type CanonicalFinishRoom } from "@/components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
import { trimFaceEdge, wallSurfaceEdge } from "@/components/editor/renderers/canonical-floor-plan/geometry";

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

/** An item may stand against a panel's face or end: only overlapping it by more than this is a hit. */
const PANEL_CONTACT_TOLERANCE_MM = 0.5;

/**
 * The wall whose laminate panel, standing into a room off the wall's face, an item overlaps: for plan review, which measures
 * from the finished face (J, 29 Oct 2026: "Fix it, all from the face"), as the walls themselves are checked by
 * findCanonicalPlacementWall. The panels are the ones the imported plan draws at depth (getCanonicalRoomWallFinish), each
 * room's on its side of each slice. An item touching a panel's face or end doesn't count, so a built-in fitted to the finished
 * face is no hit.
 */
export function findCanonicalPlacementPanel(
  model: CanonicalFloorPlanRenderModel | undefined, rooms: readonly CanonicalFinishRoom[], room: RoomSnapshot,
  position: [number, number, number], rotationY: number, dimensions: CanonicalPlacementDimensions
): string | null {
  const floor = model?.floors.find((entry) => entry.rooms.some(({ id }) => id === room.id));
  if (!floor) return null;
  const [width, depth] = getRotatedFootprint(dimensions.w / 1000, dimensions.d / 1000, rotationY);
  const x = position[0] + (room.planPosition?.x ?? 0), z = position[2] + (room.planPosition?.z ?? 0);
  const bottom = position[1] * 1000;
  const top = bottom + (dimensions.h ?? floor.storeyHeightMm);
  const ends = { startMm: PANEL_CONTACT_TOLERANCE_MM, endMm: PANEL_CONTACT_TOLERANCE_MM };
  for (const wall of floor.walls) {
    for (const { roomId, side } of wall.roomSides) {
      const owner = rooms.find(({ id }) => id === roomId);
      const panelMm = owner ? getCanonicalRoomWallFinish(owner, wall.id).depthMm - PANEL_CONTACT_TOLERANCE_MM : 0;
      if (panelMm <= 0) continue;
      if (wall.solids.some((solid) => {
        if (top <= solid.bottomMm || bottom >= solid.topMm) return false;
        const bare = trimFaceEdge(wallSurfaceEdge(solid, side, 0), ends), face = trimFaceEdge(wallSurfaceEdge(solid, side, panelMm), ends);
        return polygonIntersectsFootprint([bare.start, bare.end, face.end, face.start], x - width / 2, x + width / 2, z - depth / 2, z + depth / 2);
      })) return wall.id;
    }
  }
  return null;
}
