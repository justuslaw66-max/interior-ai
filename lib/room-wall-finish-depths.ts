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
 * then imported"). Its `planEdgeWallIds` name the wall each edge lies on, so edge N's depth is that wall's finish. A room
 * saved before it had them is matched to its plan when the design loads (lib/imported-room-edge-walls.ts); one that can't be
 * matched (its outline no longer the plan's) keeps the bare wall, and its plan draws its laminates flat.
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
  /** An imported room's: the plan wall each outline edge lies on, and that wall's thickness (a room snapshot's, a plan room's). */
  planEdgeWallIds?: readonly string[];
  edgeWallIds?: readonly string[];
  planEdgeWallThicknessesMm?: readonly number[];
  edgeWallThicknessesMm?: readonly number[];
  /** The room's one wall thickness, in metres: a room snapshot's geometry, a plan room's own. */
  geometry?: { wallThickness?: number };
  wallThickness?: number;
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

/** A saved list of edge wall ids, when it is one: a list of strings. Anything else (a hand-edited or damaged design) is none. */
export function sanitizePlanEdgeWallIds(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}

/** A saved list of edge wall thicknesses, when it is one: positive millimetres, one per edge. */
/** The most a plan wall can be thick: anything thicker isn't a wall (a damaged save). */
export const MAX_PLAN_WALL_THICKNESS_MM = 2000;

export function sanitizePlanEdgeWallThicknesses(value: unknown, edges: number): number[] | undefined {
  return Array.isArray(value) && value.length === edges &&
    value.every((entry) => Number.isFinite(entry) && entry > 0 && entry <= MAX_PLAN_WALL_THICKNESS_MM) ? value : undefined;
}

const validEdgeWallIds = new WeakSet<readonly string[]>();

/** An imported room's edge wall ids, when they name each edge of its outline; otherwise none. */
export function readPlanEdgeWallIds(room: WallFinishRoom): readonly string[] | undefined {
  const value = room.planEdgeWallIds ?? room.edgeWallIds;
  const polygon = room.planPolygon ?? room.polygon;
  if (!value || !polygon || roomShapeOf(room) !== "custom_polygon" || value.length !== polygon.length || polygon.length < 3) return undefined;
  if (validEdgeWallIds.has(value)) return value;
  if (!sanitizePlanEdgeWallIds(value)) return undefined;
  validEdgeWallIds.add(value);
  return value;
}

/** An imported room's edge walls' thicknesses in millimetres, when its edges are named and the thicknesses saved with them. */
function readPlanEdgeWallThicknesses(room: WallFinishRoom): readonly number[] | undefined {
  const edges = readPlanEdgeWallIds(room);
  return edges && sanitizePlanEdgeWallThicknesses(room.planEdgeWallThicknessesMm ?? room.edgeWallThicknessesMm, edges.length);
}

/**
 * Where a room's finishes are saved for each face: under the face's own id in a drawn room; under the plan wall each outline
 * edge lies on in an imported room. Null for an imported room whose edges aren't named (saved before they were and not yet
 * matched to its plan, lib/imported-room-edge-walls.ts, or an outline that no longer matches them).
 */
function getFinishFaceKeys(room: WallFinishRoom): Map<string, string> | null {
  const faceIds = getRoomWallFaceIds(room);
  if (typeof room.floorElevationMm !== "number") return new Map(faceIds.map((faceId) => [faceId, faceId]));
  const wallIds = readPlanEdgeWallIds(room);
  return wallIds ? new Map(faceIds.map((faceId, index) => [faceId, wallIds[index]])) : null;
}

const measuredWallIdsByEdges = new WeakMap<readonly string[], ReadonlySet<string>>();

/**
 * The plan walls an imported room is measured to: those its outline's edges lie on. The imported plan draws a room's laminate
 * at its depth only on these, so what is drawn is what the room is measured to; elsewhere (a hole's walls, a room whose
 * edges aren't named) it is drawn as the flat skin it was. Null for a drawn room.
 */
export function getRoomMeasuredWallIds(room: WallFinishRoom): ReadonlySet<string> | null {
  if (typeof room.floorElevationMm !== "number") return null;
  const wallIds = readPlanEdgeWallIds(room);
  if (!wallIds) return new Set();
  const known = measuredWallIdsByEdges.get(wallIds);
  if (known) return known;
  const measured = new Set(wallIds);
  measuredWallIdsByEdges.set(wallIds, measured);
  return measured;
}

function finishDepthMeters(settings: ReturnType<typeof getWallFaceSurfaceSettings>): number {
  return getWallFinishDepthMm(getRuntimeSurfaceMaterialById(settings.materialId), settings, 0) / 1000;
}

/** The room's one wall thickness, which placement insets half of from every edge (ROOM_DIMENSION_DEFAULTS when not set). */
function roomWallThickness(room: WallFinishRoom): number {
  return room.geometry?.wallThickness ?? room.wallThickness ?? 0.12;
}

type MeasuredDepths = { roomId: string; faces: string; depths: RoomWallFinishDepths; panels: RoomWallFinishDepths };
// Surfaces are replaced, not changed, when edited, so a room's depths are kept while its surfaces are the same object (or, for
// an imported room without surfaces, its edges) and it has the same faces: the 3D view asks once per item, and the 2D plan
// copies a room on every frame of a room drag.
const depthsByOwner = new WeakMap<object, MeasuredDepths>();
const edgeKeys = new WeakMap<readonly unknown[], string>();
const joined = (list: readonly unknown[] | undefined) => {
  if (!list) return "";
  const known = edgeKeys.get(list);
  if (known !== undefined) return known;
  const key = list.join("|");
  edgeKeys.set(list, key);
  return key;
};

function faceListKey(room: WallFinishRoom): string {
  const shape = roomShapeOf(room);
  const faces = shape === "custom_polygon" ? `${shape}:${(room.planPolygon ?? room.polygon)?.length ?? 0}` : shape;
  if (typeof room.floorElevationMm !== "number") return faces;
  // An imported plan's edit can move a room's edges onto other walls and keep its surfaces.
  return `${faces}:${joined(readPlanEdgeWallIds(room))}:${joined(readPlanEdgeWallThicknesses(room))}:${roomWallThickness(room)}`;
}

function readRoomDepths(room: WallFinishRoom | null | undefined): MeasuredDepths | null {
  const surfaces = room?.surfaces ?? room?.surfaceFinishes;
  const imported = room && typeof room.floorElevationMm === "number";
  const owner: object | undefined = surfaces?.walls ? surfaces : imported ? readPlanEdgeWallThicknesses(room) : undefined;
  if (!room || !owner) return null;
  const faces = faceListKey(room);
  const known = depthsByOwner.get(owner);
  if (known && known.roomId === room.id && known.faces === faces) return known;
  const measured = { roomId: room.id, faces, ...measureRoomWallFinishDepths(room, surfaces?.walls ? surfaces : undefined) };
  depthsByOwner.set(owner, measured);
  return measured;
}

/**
 * How far each face's finished face stands in from where the room's own wall inset puts its bare face, in metres, keyed by
 * the face (`wall-N` for each edge of an imported room's outline): the deepest of the face's own finish and the finished
 * panels on it. A room is inset by half its one wall thickness everywhere (getFurnitureWallInset); an imported plan's walls
 * vary, so each edge of an imported room also takes its own wall's difference from that, half the thicker wall's extra (or
 * less, for a thinner one), so its furniture, checks and clear size measure from that wall's own face.
 */
export function getRoomWallFinishDepths(room: WallFinishRoom | null | undefined): RoomWallFinishDepths {
  return readRoomDepths(room)?.depths ?? NO_WALL_FINISH_DEPTHS;
}

/** Each face's laminate depth alone, without an imported room's wall corrections: what the panels themselves are. */
export function getRoomWallPanelDepths(room: WallFinishRoom | null | undefined): RoomWallFinishDepths {
  return readRoomDepths(room)?.panels ?? NO_WALL_FINISH_DEPTHS;
}

/** Whether any of the room's walls has a laminate standing off it. */
export function hasRoomWallPanels(room: WallFinishRoom | null | undefined): boolean {
  return hasWallFinishDepths(getRoomWallPanelDepths(room));
}

function measureRoomWallFinishDepths(
  room: WallFinishRoom, surfaces: RoomSurfaceAssignments | undefined
): { depths: RoomWallFinishDepths; panels: RoomWallFinishDepths } {
  const finishKeys = getFinishFaceKeys(room);
  if (!finishKeys) return { depths: NO_WALL_FINISH_DEPTHS, panels: NO_WALL_FINISH_DEPTHS };
  const panels: Record<string, number> = {};
  const deepen = (faceId: string, depth: number) => {
    if (depth > 0) panels[faceId] = Math.max(panels[faceId] ?? 0, depth);
  };
  for (const [faceId, finishKey] of surfaces ? finishKeys : []) {
    deepen(faceId, finishDepthMeters(getWallFaceSurfaceSettings(surfaces, finishKey, normalizeFloorRotationDeg, clampFloorPatternScale)));
  }
  const panelDepths = Object.keys(panels).length > 0 ? panels : NO_WALL_FINISH_DEPTHS;
  // An imported plan's walls take one finish per room face; its 3D view draws no panels.
  if (typeof room.floorElevationMm === "number") return { depths: withEdgeWallCorrections(room, panelDepths), panels: panelDepths };
  for (const panelId of Object.keys(surfaces?.walls?.panels ?? {})) {
    const faceId = getWallPanelFaceId(panelId, room.id);
    if (!faceId || !surfaces) continue;
    deepen(faceId, finishDepthMeters(
      getWallPanelSurfaceSettings(surfaces, faceId, panelId, normalizeFloorRotationDeg, clampFloorPatternScale)
    ));
  }
  const depths = Object.keys(panels).length > 0 ? panels : NO_WALL_FINISH_DEPTHS;
  return { depths, panels: depths };
}

/** An imported room's depths with each edge's own wall's half-thickness less the room's (see getRoomWallFinishDepths). */
function withEdgeWallCorrections(room: WallFinishRoom, panels: RoomWallFinishDepths): RoomWallFinishDepths {
  const thicknesses = readPlanEdgeWallThicknesses(room);
  if (!thicknesses) return panels;
  const halfRoomWall = roomWallThickness(room) / 2;
  const depths: Record<string, number> = {};
  thicknesses.forEach((thicknessMm, index) => {
    const value = (panels[`wall-${index}`] ?? 0) + thicknessMm / 2000 - halfRoomWall;
    if (Math.abs(value) > 1e-9) depths[`wall-${index}`] = value;
  });
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
 * An item's clear gap to the nearer wall on each axis of a rectangular room, measured to the finished face: half the wall in
 * from the centre-line outline, and in front of that wall's panel (J, 29 Oct 2026: "Fix it, all from the face"). `depths` are
 * the walls' panels (getRoomWallFinishDepths). Each axis takes the nearer of its two finished faces, which with different
 * panels needn't be the wall on the item's side of the centre. Other shapes measure to their outline's faces instead
 * (lib/room-finished-faces.ts).
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
