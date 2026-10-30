import type { CanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import type { DimensionsMm } from "@/lib/catalog-schema";
import type { RoomSnapshot } from "@/lib/room-types";
import { polygonIntersectsFootprint } from "@/lib/design-page-geometry";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import {
  getCanonicalFaceTrimsMm,
  getCanonicalRoomWallFinish,
  type CanonicalFinishRoom,
} from "@/components/editor/renderers/canonical-floor-plan/canonicalWallPanels";
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

/** A room's drawn laminate panel on one slice of an imported plan's wall, as plan review tests it (plan metres). */
export type CanonicalPlacementPanel = { floorId: string; wallId: string; bottomMm: number; topMm: number; outline: Array<{ x: number; z: number }> };

/**
 * The laminate panels standing into the rooms off the plan's walls, once for a whole review: the ones the imported plan draws
 * at depth (getCanonicalRoomWallFinish), each room's on its side of each slice, cut to the room's corners as drawn
 * (getCanonicalFaceTrimsMm), less a contact allowance at the face and the ends.
 */
export function buildCanonicalPlacementPanels(
  model: CanonicalFloorPlanRenderModel | undefined, rooms: readonly CanonicalFinishRoom[]
): CanonicalPlacementPanel[] {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return (model?.floors ?? []).flatMap((floor) => floor.walls.flatMap((wall) => wall.roomSides.flatMap(({ roomId, side }) => {
    const room = roomById.get(roomId);
    const panelMm = room ? getCanonicalRoomWallFinish(room, wall.id).depthMm - PANEL_CONTACT_TOLERANCE_MM : 0;
    if (!room || panelMm <= 0) return [];
    return wall.solids.map((solid) => {
      const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
      const ends = { startMm: trims.startMm + PANEL_CONTACT_TOLERANCE_MM, endMm: trims.endMm + PANEL_CONTACT_TOLERANCE_MM };
      const bare = trimFaceEdge(wallSurfaceEdge(solid, side, 0), ends), face = trimFaceEdge(wallSurfaceEdge(solid, side, panelMm), ends);
      return { floorId: floor.id, wallId: wall.id, bottomMm: solid.bottomMm, topMm: solid.topMm, outline: [bare.start, bare.end, face.end, face.start] };
    });
  })));
}

/**
 * The wall whose laminate panel an item overlaps, for plan review, which measures from the finished face (J, 29 Oct 2026:
 * "Fix it, all from the face"), as the walls themselves are checked by findCanonicalPlacementWall. `panels` are the plan's
 * (buildCanonicalPlacementPanels). An item touching a panel's face or end doesn't count, so a built-in fitted to the finished
 * face is no hit.
 */
export function findCanonicalPlacementPanel(
  panels: readonly CanonicalPlacementPanel[], model: CanonicalFloorPlanRenderModel | undefined, room: RoomSnapshot,
  position: [number, number, number], rotationY: number, dimensions: CanonicalPlacementDimensions
): string | null {
  const floor = model?.floors.find((entry) => entry.rooms.some(({ id }) => id === room.id));
  if (!floor) return null;
  const [width, depth] = getRotatedFootprint(dimensions.w / 1000, dimensions.d / 1000, rotationY);
  const x = position[0] + (room.planPosition?.x ?? 0), z = position[2] + (room.planPosition?.z ?? 0);
  const bottom = position[1] * 1000;
  const top = bottom + (dimensions.h ?? floor.storeyHeightMm);
  const hit = panels.find((panel) => panel.floorId === floor.id && top > panel.bottomMm && bottom < panel.topMm &&
    polygonIntersectsFootprint(panel.outline, x - width / 2, x + width / 2, z - depth / 2, z + depth / 2));
  return hit?.wallId ?? null;
}
