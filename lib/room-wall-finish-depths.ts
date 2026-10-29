import { clampFloorPatternScale, normalizeFloorRotationDeg } from "@/lib/floor-materials";
import { getWallFinishDepthMm } from "@/lib/laminate-wall-backing";
import type { RoomPlanPolygonPoint, RoomPlanShape, RoomSurfaceAssignments } from "@/lib/room-types";
import { getRuntimeSurfaceMaterialById } from "@/lib/surface-material-runtime";
import {
  getDeterministicWallFaceId,
  getWallFaceSurfaceSettings,
  getWallPanelSurfaceSettings,
  RECTANGULAR_WALL_FACE_IDS,
} from "@/lib/surface-settings";

/**
 * How far each wall's laminate panel stands into a drawn room, so the room is measured to the panel's face (J, 29 Oct 2026).
 *
 * A laminate wall finish sits on its board, 10 to 44 mm off the wall (lib/laminate-wall-backing.ts). Paint and tiles count as
 * nothing. A wall's depth is the deepest finish anywhere on it, panels included (J: "At the deepest panel"), so furniture
 * stopped at that face never clips a panel, at the cost of up to a 44 mm gap in front of a painted part of the same wall.
 *
 * Faces are named as the 3D view names them: `north` (z = -depth / 2), `east`, `south` and `west` for a rectangle, and
 * `wall-N` for edge N of an L-shape's or a drawn shape's outline (components/editor/renderers/house-plan-3d/geometry.ts).
 */

/** A room snapshot or a plan room: what the depths are read from. */
export type WallFinishRoom = {
  id: string;
  planShape?: RoomPlanShape;
  shape?: RoomPlanShape;
  planPolygon?: readonly RoomPlanPolygonPoint[];
  polygon?: readonly RoomPlanPolygonPoint[];
  surfaces?: RoomSurfaceAssignments;
  surfaceFinishes?: RoomSurfaceAssignments;
};

/** Each face's panel depth off the bare wall, in metres; a face that isn't listed has none. */
export type RoomWallFinishDepths = Readonly<Record<string, number>>;

export const NO_WALL_FINISH_DEPTHS: RoomWallFinishDepths = Object.freeze({});

function roomShapeOf(room: Pick<WallFinishRoom, "planShape" | "shape">): RoomPlanShape {
  return room.planShape ?? room.shape ?? "rectangle";
}

/** The room's wall faces, in outline order. */
export function getRoomWallFaceIds(room: Omit<WallFinishRoom, "id">): string[] {
  const shape = roomShapeOf(room);
  if (shape === "l_shape") return Array.from({ length: 6 }, (_, index) => `wall-${index}`);
  const polygon = room.planPolygon ?? room.polygon;
  if (shape === "custom_polygon" && polygon && polygon.length >= 3) {
    return polygon.map((_, index) => `wall-${index}`);
  }
  return [...RECTANGULAR_WALL_FACE_IDS];
}

/**
 * The face a saved panel finish is on: v2 panel ids name it (`wall-panel:v2:<floor>:<room>:<face>:...`), and older ids start
 * with the wall's key (`<room>-north...`, `<room>-3...`). Null when it can't be told. Every laminate panel is saved under a
 * v2 id: they exist since 31 Jul 2026, and saving a panel replaces its older ids.
 */
export function getWallPanelFaceId(panelId: string, roomId: string): string | null {
  const parts = panelId.split(":");
  if (parts[0] === "wall-panel" && parts[1] === "v2" && parts.length >= 6 && parts[4]) {
    return getDeterministicWallFaceId(parts[4]);
  }
  if (!panelId.startsWith(`${roomId}-`)) return null;
  const key = panelId.slice(roomId.length + 1);
  const rectangular = RECTANGULAR_WALL_FACE_IDS.find((faceId) => key === faceId || key.startsWith(`${faceId}-`));
  if (rectangular) return rectangular;
  const index = /^(\d+)(?:-|$)/.exec(key);
  return index ? `wall-${index[1]}` : null;
}

function finishDepthMeters(settings: ReturnType<typeof getWallFaceSurfaceSettings>): number {
  return getWallFinishDepthMm(getRuntimeSurfaceMaterialById(settings.materialId), settings, 0) / 1000;
}

// Rooms are replaced, not changed, when edited, so a room's depths are kept while it and its surfaces are the same objects:
// the 3D view asks once per item.
const depthsByRoom = new WeakMap<WallFinishRoom, { surfaces: RoomSurfaceAssignments; depths: RoomWallFinishDepths }>();

/** Each face's panel depth: the deepest of the face's own finish and the finished panels on it. */
export function getRoomWallFinishDepths(room: WallFinishRoom | null | undefined): RoomWallFinishDepths {
  if (!room) return NO_WALL_FINISH_DEPTHS;
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  if (!surfaces?.walls) return NO_WALL_FINISH_DEPTHS;
  const known = depthsByRoom.get(room);
  if (known && known.surfaces === surfaces) return known.depths;
  const depths = measureRoomWallFinishDepths(room, surfaces);
  depthsByRoom.set(room, { surfaces, depths });
  return depths;
}

function measureRoomWallFinishDepths(room: WallFinishRoom, surfaces: RoomSurfaceAssignments): RoomWallFinishDepths {
  const depths: Record<string, number> = {};
  const deepen = (faceId: string, depth: number) => {
    if (depth > 0) depths[faceId] = Math.max(depths[faceId] ?? 0, depth);
  };
  for (const faceId of getRoomWallFaceIds(room)) {
    deepen(faceId, finishDepthMeters(getWallFaceSurfaceSettings(surfaces, faceId, normalizeFloorRotationDeg, clampFloorPatternScale)));
  }
  for (const panelId of Object.keys(surfaces.walls?.panels ?? {})) {
    const faceId = getWallPanelFaceId(panelId, room.id);
    if (!faceId) continue;
    deepen(faceId, finishDepthMeters(
      getWallPanelSurfaceSettings(surfaces, faceId, panelId, normalizeFloorRotationDeg, clampFloorPatternScale)
    ));
  }
  return Object.keys(depths).length > 0 ? depths : NO_WALL_FINISH_DEPTHS;
}

export function hasWallFinishDepths(depths: RoomWallFinishDepths | null | undefined): boolean {
  return Boolean(depths && Object.keys(depths).length > 0);
}

/**
 * An item's clear gap to the nearer wall on each axis of a rectangular room, measured to the finished face: half the wall in
 * from the centre-line outline, and in front of that wall's panel (J, 29 Oct 2026: "Fix it, all from the face").
 */
export function getRectangleWallClearances({
  width,
  depth,
  wallThickness,
  depths,
  center,
  footprint,
}: {
  width: number;
  depth: number;
  wallThickness: number;
  depths: RoomWallFinishDepths;
  center: { x: number; z: number };
  footprint: { w: number; d: number };
}): { x: number; z: number } {
  const face = wallThickness / 2;
  const panelX = (center.x >= 0 ? depths.east : depths.west) ?? 0;
  const panelZ = (center.z >= 0 ? depths.south : depths.north) ?? 0;
  return {
    x: width / 2 - face - panelX - footprint.w / 2 - Math.abs(center.x),
    z: depth / 2 - face - panelZ - footprint.d / 2 - Math.abs(center.z),
  };
}

/** `getRectangleWallClearances` for a room snapshot: its drawn size, its wall (12 cm when not set) and its panels. */
export function getRoomWallClearances(
  room: WallFinishRoom & { geometry: { width: number; depth: number; wallThickness?: number } },
  center: { x: number; z: number },
  footprint: { w: number; d: number }
): { x: number; z: number } {
  const { width, depth, wallThickness = 0.12 } = room.geometry;
  return getRectangleWallClearances({ width, depth, wallThickness, depths: getRoomWallFinishDepths(room), center, footprint });
}
