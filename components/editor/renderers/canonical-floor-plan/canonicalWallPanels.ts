import { Shape, Vector2 } from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "@/lib/floor-materials";
import type {
  CanonicalFloorPlanFloorRenderModel,
  CanonicalFloorPlanWallRenderModel,
  CanonicalFloorPlanWallSolid,
} from "@/lib/floor-plan-render-model";
import { getWallFinishDepthMm } from "@/lib/laminate-wall-backing";
import { getRoomMeasuredWallIds, type WallFinishRoom } from "@/lib/room-wall-finish-depths";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { getWallFaceSurfaceSettings } from "@/lib/surface-settings";
import { trimFaceEdge, wallSurfaceEdge, type FaceTrimsMm } from "./geometry";
import { getCanonicalFaceTrimsMm } from "./roomFaceLimits";

export { getCanonicalFaceTrimsMm } from "./roomFaceLimits";
import { resolveRoomSurfaceAssignments } from "./surfaceMaterials";

type PlanPoint = { x: number; z: number };
/** A room as the imported plan reads its finishes and outline: a plan room or a room snapshot. */
export type CanonicalFinishRoom = WallFinishRoom & Pick<HousePlanRoom2D, "surfaces" | "surfaceFinishes"> &
  { x?: number; z?: number; planPosition?: PlanPoint };

/** One room's laminate panel on one floor-standing slice of an imported plan's wall, in plan metres. */
export type CanonicalPanelStrip2D = {
  key: string;
  wallId: string;
  roomId: string;
  /** The strip's corners: along the bare face, then back along the panel's face. */
  corners: [PlanPoint, PlanPoint, PlanPoint, PlanPoint];
  /** The strip as the plan draws it, looking down: a shape's y is the plan's -z, as the room shapes are. */
  shape: Shape;
  /** The panel's face, as a plan line. */
  faceLine: [[number, number, number], [number, number, number]];
  finish: { paintColorHex: string | null; materialId: string | null };
};

/**
 * A room's finish on an imported plan's wall, and how far the imported plan draws it off the face: a laminate's build-up on a
 * wall the room is measured to (one its outline's edges lie on, getRoomMeasuredWallIds), so what is drawn is what furniture
 * and the checks stop at; 0 for paint or tile, and for a laminate on any other wall (a hole's, or a room whose edges aren't
 * named), which is drawn as the flat skin it was.
 */
export function getCanonicalRoomWallFinish(room: CanonicalFinishRoom, wallId: string) {
  const settings = getWallFaceSurfaceSettings(
    resolveRoomSurfaceAssignments(room), wallId, normalizeFloorRotationDeg, clampFloorPatternScale
  );
  const material = getRuntimeSurfaceMaterialById(settings.materialId);
  const measured = getRoomMeasuredWallIds(room)?.has(wallId) ?? false;
  return { settings, material, depthMm: measured ? getWallFinishDepthMm(material, settings, 0) : 0 };
}

/** The deeper of the laminates the wall's rooms have on it, in millimetres (0 for none). */
export function getCanonicalWallPanelDepthMm(
  wall: Pick<CanonicalFloorPlanWallRenderModel, "id" | "roomSides">, rooms: readonly CanonicalFinishRoom[]
): number {
  return Math.max(0, ...wall.roomSides.map(({ roomId }) => {
    const room = rooms.find((candidate) => candidate.id === roomId);
    return room ? getCanonicalRoomWallFinish(room, wall.id).depthMm : 0;
  }));
}

/**
 * How deep an opening's hover and selection box is, in metres: through the wall, and 3 mm in front of the deeper panel on
 * each side, as a drawn room's door outline is (house-plan-3d/wallAndOpeningMeshes.tsx), so the panel's ends don't hide it.
 */
export function getCanonicalOpeningHighlightDepth(wallThicknessMm: number, panelDepthMm: number): number {
  return Math.max(0.08, (wallThicknessMm + (panelDepthMm > 0 ? 2 * (panelDepthMm + 3) : 0)) / 1000);
}

// One strip per slice and finish, kept while both are the same (the floor's walls are kept with the plan; a room's finish is
// read again on each plan rebuild, such as every frame of an item drag, but its strip's shape needn't be).
const stripsBySolid = new WeakMap<CanonicalFloorPlanWallSolid, Map<string, { value: string; strip: CanonicalPanelStrip2D }>>();

function buildStrip(
  key: string, wallId: string, roomId: string, solid: CanonicalFloorPlanWallSolid, side: 1 | -1, depthMm: number,
  trims: FaceTrimsMm, finish: CanonicalPanelStrip2D["finish"]
): CanonicalPanelStrip2D {
  const bare = trimFaceEdge(wallSurfaceEdge(solid, side, 0), trims);
  const face = trimFaceEdge(wallSurfaceEdge(solid, side, depthMm), trims);
  const corners: CanonicalPanelStrip2D["corners"] = [bare.start, bare.end, face.end, face.start];
  return {
    key, wallId, roomId, corners, finish,
    shape: new Shape(corners.map((point) => new Vector2(point.x, -point.z))),
    faceLine: [[face.start.x, 0, face.start.z], [face.end.x, 0, face.end.z]],
  };
}

/**
 * An imported plan's laminate panels on the 2D plan, as a drawn room's are (RoomPanelFaces2D.tsx): for each room's side of
 * each wall with a laminate it is measured to, a strip from the bare face to the panel's face (10 to 44 mm).
 *
 * The strips follow the 3D view's panels (CanonicalWallSurfaceMesh.tsx): one per slice of the wall that stands on the floor,
 * so a strip stops at a door or an opening down to the floor and runs on under a window's sill, and one stops at the other's
 * panel at an inside corner. Paint and tiles have none.
 */
export function getCanonicalPanelStrips2D(
  floor: Pick<CanonicalFloorPlanFloorRenderModel, "id" | "walls">,
  rooms: readonly CanonicalFinishRoom[]
): CanonicalPanelStrip2D[] {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return floor.walls.flatMap((wall) => wall.roomSides.flatMap(({ roomId, side }) => {
    const room = roomById.get(roomId);
    if (!room) return [];
    const { settings, depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    if (depthMm <= 0) return [];
    const finish = { paintColorHex: settings.paintColorHex ?? null, materialId: settings.materialId ?? null };
    return wall.solids.filter((solid) => solid.bottomMm <= wall.baseOffsetMm + 0.5).flatMap((solid) => {
      const trims = getCanonicalFaceTrimsMm(room, floor.walls, wall, solid, side);
      if (trims.hidden) return [];
      const key = `${floor.id}:${solid.id}:${roomId}:panel`;
      const value = `${side}|${depthMm}|${trims.startMm}|${trims.endMm}|${finish.paintColorHex}|${finish.materialId}`;
      const known = stripsBySolid.get(solid) ?? new Map<string, { value: string; strip: CanonicalPanelStrip2D }>();
      stripsBySolid.set(solid, known);
      const kept = known.get(roomId);
      if (kept?.value === value) return [kept.strip];
      const strip = buildStrip(key, wall.id, roomId, solid, side, depthMm, trims, finish);
      known.set(roomId, { value, strip });
      return [strip];
    });
  }));
}
