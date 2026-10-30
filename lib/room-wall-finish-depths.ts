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
import { parseWallPanelId } from "@/lib/wall-panel-ids";

/**
 * How far each wall's laminate panel stands into a room, so the room is measured to the panel's face (J, 29 Oct 2026).
 *
 * A laminate wall finish sits on its board, 10 to 44 mm off the wall (lib/laminate-wall-backing.ts). Paint and tiles count as
 * nothing. A wall's depth is the deepest finish anywhere on it, panels included (J: "At the deepest panel"), so furniture
 * stopped at that face never clips a panel, at the cost of up to a 44 mm gap in front of a painted part of the same wall.
 *
 * Faces are named as the 3D view names them: `north` (z = -depth / 2), `east`, `south` and `west` for a rectangle, and
 * `wall-N` for edge N of an L-shape's or a drawn shape's outline (components/editor/renderers/house-plan-3d/geometry.ts).
 *
 * An imported plan's room is a drawn shape too, edge N its outline's, but its finishes are saved under the plan's own wall
 * ids and drawn by the imported plan's 3D view (canonical-floor-plan/CanonicalWallSurfaceMesh.tsx, J's "Two: drawn rooms,
 * then imported"). Its `planEdgeWallIds` name the wall each edge lies on, so edge N's depth is that wall's finish. An
 * imported room saved before it had them keeps the bare wall: its edges can't be matched to its walls.
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
  /** Set only on a room made from an imported plan (lib/floor-plan-legacy-adapters.ts): its exact floor elevation. */
  floorElevationMm?: number;
  /** An imported room's: the plan wall each outline edge lies on (a room snapshot's, and a plan room's). */
  planEdgeWallIds?: readonly string[];
  edgeWallIds?: readonly string[];
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

/** A v2 panel id's token, as the 3D view writes it (`getWallSurfacePanelId`, house-plan-3d/geometry.ts). */
export function normalizeWallPanelIdToken(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

/**
 * The face a saved panel finish stands into the room on: the face its v2 id names
 * (`wall-panel:v2:<floor>:<room>:<face>:<start>:<end>:<role>`), when the id is this room's and the panel is on the inside.
 * Null for a panel on a wall's outside face, one saved under another room's id (a duplicated room's copy, which the 3D view
 * doesn't draw), and an older id: laminates came after v2 ids (31 Jul 2026), and saving a panel replaces its older ids.
 */
export function getWallPanelFaceId(panelId: string, roomId: string): string | null {
  const parts = parseWallPanelId(panelId);
  if (!parts || parts.roomToken !== normalizeWallPanelIdToken(roomId) || parts.role !== "interior" || !parts.faceToken) return null;
  return getDeterministicWallFaceId(parts.faceToken);
}

/**
 * Where a room's finishes are saved for each face: under the face's own id in a drawn room; under the plan wall each outline
 * edge lies on in an imported room. Null for an imported room whose edges aren't named (saved before they were, or an
 * outline that no longer matches them).
 */
function getFinishFaceKeys(room: WallFinishRoom): Map<string, string> | null {
  const faceIds = getRoomWallFaceIds(room);
  if (typeof room.floorElevationMm !== "number") return new Map(faceIds.map((faceId) => [faceId, faceId]));
  const wallIds = room.planEdgeWallIds ?? room.edgeWallIds;
  if (!wallIds || wallIds.length !== faceIds.length || roomShapeOf(room) !== "custom_polygon") return null;
  return new Map(faceIds.map((faceId, index) => [faceId, wallIds[index]]));
}

function finishDepthMeters(settings: ReturnType<typeof getWallFaceSurfaceSettings>): number {
  return getWallFinishDepthMm(getRuntimeSurfaceMaterialById(settings.materialId), settings, 0) / 1000;
}

// Surfaces are replaced, not changed, when edited, so a room's depths are kept while its surfaces are the same object and it
// has the same faces: the 3D view asks once per item, and the 2D plan copies a room on every frame of a room drag.
const depthsBySurfaces = new WeakMap<RoomSurfaceAssignments, { roomId: string; faces: string; depths: RoomWallFinishDepths }>();

function faceListKey(room: WallFinishRoom): string {
  const shape = roomShapeOf(room);
  const faces = shape === "custom_polygon" ? `${shape}:${(room.planPolygon ?? room.polygon)?.length ?? 0}` : shape;
  // An imported plan's edit can move a room's edges onto other walls and keep its surfaces.
  return typeof room.floorElevationMm === "number" ? `${faces}:${(room.planEdgeWallIds ?? room.edgeWallIds)?.join("|")}` : faces;
}

/**
 * Each face's panel depth: the deepest of the face's own finish and the finished panels on it, keyed by the face (`wall-N`
 * for each edge of an imported room's outline).
 */
export function getRoomWallFinishDepths(room: WallFinishRoom | null | undefined): RoomWallFinishDepths {
  const surfaces = room?.surfaces ?? room?.surfaceFinishes;
  if (!room || !surfaces?.walls) return NO_WALL_FINISH_DEPTHS;
  const faces = faceListKey(room);
  const known = depthsBySurfaces.get(surfaces);
  if (known && known.roomId === room.id && known.faces === faces) return known.depths;
  const depths = measureRoomWallFinishDepths(room, surfaces);
  depthsBySurfaces.set(surfaces, { roomId: room.id, faces, depths });
  return depths;
}

function measureRoomWallFinishDepths(room: WallFinishRoom, surfaces: RoomSurfaceAssignments): RoomWallFinishDepths {
  const finishKeys = getFinishFaceKeys(room);
  if (!finishKeys) return NO_WALL_FINISH_DEPTHS;
  const depths: Record<string, number> = {};
  const deepen = (faceId: string, depth: number) => {
    if (depth > 0) depths[faceId] = Math.max(depths[faceId] ?? 0, depth);
  };
  for (const [faceId, finishKey] of finishKeys) {
    deepen(faceId, finishDepthMeters(getWallFaceSurfaceSettings(surfaces, finishKey, normalizeFloorRotationDeg, clampFloorPatternScale)));
  }
  // An imported plan's walls take one finish per room face; its 3D view draws no panels.
  if (typeof room.floorElevationMm === "number") return Object.keys(depths).length > 0 ? depths : NO_WALL_FINISH_DEPTHS;
  for (const panelId of Object.keys(surfaces.walls?.panels ?? {})) {
    const faceId = getWallPanelFaceId(panelId, room.id);
    if (!faceId) continue;
    deepen(faceId, finishDepthMeters(
      getWallPanelSurfaceSettings(surfaces, faceId, panelId, normalizeFloorRotationDeg, clampFloorPatternScale)
    ));
  }
  return Object.keys(depths).length > 0 ? depths : NO_WALL_FINISH_DEPTHS;
}

/**
 * The finish that sets a face's depth: the deepest of its own and its panels' (the laminate a 2D strip is drawn in, since a
 * laminate set from the 3D view is saved on a panel, not the face). Null when nothing on the face stands off the wall.
 */
export function getDeepestWallFinish(
  room: WallFinishRoom, faceId: string
): ReturnType<typeof getWallFaceSurfaceSettings> | null {
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const finishKey = getFinishFaceKeys(room)?.get(faceId);
  if (!surfaces?.walls || !finishKey) return null;
  const imported = typeof room.floorElevationMm === "number";
  // Panels first, so one as deep as the face's finish wins: it's the finish the 3D view draws where the panel is.
  const finishes = [
    ...Object.keys((!imported && surfaces.walls.panels) || {}).filter((panelId) => getWallPanelFaceId(panelId, room.id) === faceId).map(
      (panelId) => getWallPanelSurfaceSettings(surfaces, faceId, panelId, normalizeFloorRotationDeg, clampFloorPatternScale)),
    getWallFaceSurfaceSettings(surfaces, finishKey, normalizeFloorRotationDeg, clampFloorPatternScale),
  ];
  let deepest: { depth: number; finish: (typeof finishes)[number] | null } = { depth: 0, finish: null };
  for (const finish of finishes) {
    const depth = finishDepthMeters(finish);
    if (depth > deepest.depth) deepest = { depth, finish };
  }
  return deepest.finish;
}

export function hasWallFinishDepths(depths: RoomWallFinishDepths | null | undefined): boolean {
  return Boolean(depths && Object.keys(depths).length > 0);
}

/**
 * An item's clear gap to the nearer wall on each axis of a room's rectangle, measured to the finished face: half the wall in
 * from the centre-line outline, and in front of that side's panel (J, 29 Oct 2026: "Fix it, all from the face"). `depths`
 * are the sides' panels (getRoomSideFinishDepths, lib/room-finished-outline.ts). Each axis takes the nearer of its two
 * finished faces, which with different panels needn't be the wall on the item's side of the centre.
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
  const gap = (half: number, offset: number, size: number, panel: number | undefined) =>
    half - face - (panel ?? 0) - size / 2 + offset;
  return {
    x: Math.min(gap(width / 2, center.x, footprint.w, depths.west), gap(width / 2, -center.x, footprint.w, depths.east)),
    z: Math.min(gap(depth / 2, center.z, footprint.d, depths.north), gap(depth / 2, -center.z, footprint.d, depths.south)),
  };
}
