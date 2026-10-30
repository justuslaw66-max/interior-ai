import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "@/lib/floor-materials";
import type { CanonicalFloorPlanFloorRenderModel, CanonicalFloorPlanWallRenderModel } from "@/lib/floor-plan-render-model";
import { getWallFinishDepthMm } from "@/lib/laminate-wall-backing";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import { getWallFaceSurfaceSettings } from "@/lib/surface-settings";
import { wallSurfaceEdge } from "./geometry";
import { resolveRoomSurfaceAssignments } from "./surfaceMaterials";

type PlanPoint = { x: number; z: number };

/** One room's laminate panel on one floor-standing slice of an imported plan's wall, in plan metres. */
export type CanonicalPanelStrip2D = {
  key: string;
  wallId: string;
  roomId: string;
  /** The strip's corners: along the bare face, then back along the panel's face. */
  corners: [PlanPoint, PlanPoint, PlanPoint, PlanPoint];
  /** The panel's face, as a plan line. */
  faceLine: [[number, number, number], [number, number, number]];
  finish: { paintColorHex: string | null; materialId: string | null };
};

/** A room's finish on an imported plan's wall, and how far it stands off the face: a laminate's build-up; 0 for paint or tile. */
export function getCanonicalRoomWallFinish(room: HousePlanRoom2D, wallId: string) {
  const settings = getWallFaceSurfaceSettings(
    resolveRoomSurfaceAssignments(room), wallId, normalizeFloorRotationDeg, clampFloorPatternScale
  );
  return { settings, depthMm: getWallFinishDepthMm(getRuntimeSurfaceMaterialById(settings.materialId), settings, 0) };
}

/** The deeper of the laminates the wall's rooms have on it, in millimetres (0 for none). */
export function getCanonicalWallPanelDepthMm(
  wall: Pick<CanonicalFloorPlanWallRenderModel, "id" | "roomSides">, rooms: readonly HousePlanRoom2D[]
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

/**
 * An imported plan's laminate panels on the 2D plan, as a drawn room's are (RoomPanelFaces2D.tsx): for each room's side of
 * each wall with a laminate, a strip from the bare face to the panel's face (lib/laminate-wall-backing.ts: 10 to 44 mm).
 *
 * The strips follow the 3D view's panels (CanonicalWallSurfaceMesh.tsx): one per slice of the wall that stands on the floor,
 * so a strip stops at a door or an opening down to the floor and runs on under a window's sill. Paint and tiles have none.
 */
export function getCanonicalPanelStrips2D(
  floor: Pick<CanonicalFloorPlanFloorRenderModel, "id" | "walls">,
  rooms: readonly HousePlanRoom2D[]
): CanonicalPanelStrip2D[] {
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  return floor.walls.flatMap((wall) => wall.roomSides.flatMap(({ roomId, side }) => {
    const room = roomById.get(roomId);
    if (!room) return [];
    const { settings, depthMm } = getCanonicalRoomWallFinish(room, wall.id);
    if (depthMm <= 0) return [];
    const finish = { paintColorHex: settings.paintColorHex ?? null, materialId: settings.materialId ?? null };
    return wall.solids.filter((solid) => solid.bottomMm <= wall.baseOffsetMm + 0.5).map((solid): CanonicalPanelStrip2D => {
      const bare = wallSurfaceEdge(solid, side, 0);
      const face = wallSurfaceEdge(solid, side, depthMm);
      return {
        key: `${floor.id}:${solid.id}:${roomId}:panel`,
        wallId: wall.id,
        roomId,
        corners: [bare.start, bare.end, face.end, face.start],
        faceLine: [[face.start.x, 0, face.start.z], [face.end.x, 0, face.end.z]],
        finish,
      };
    });
  }));
}
