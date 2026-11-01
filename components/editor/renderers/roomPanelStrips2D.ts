import * as THREE from "three";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { getInsetPolygonFaces, getRoomPlanOutlinePoints } from "@/lib/room-finished-outline";
import {
  getDeepestWallFinish,
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  hasWallFinishDepths,
  type RoomWallFinishDepths,
  type WallFinishRoom,
} from "@/lib/room-wall-finish-depths";
import {
  buildOpeningSillParts,
  buildWallParts,
  getWallSegments,
  getWallSurfaceFaceId,
  legacyWallDirection,
  legacyWallPartAxisRange,
} from "./house-plan-3d/geometry";
import { getWallOpenings } from "./house-plan-3d/legacyWallOpenings";

/** A plan room, as the 2D plan draws it: centre-line outline in room coordinates, placed at x, z. */
export type PanelFaceRoom2D = WallFinishRoom & Pick<HousePlanRoom2D,
  "id" | "name" | "roomType" | "shape" | "polygon" | "x" | "z" | "w" | "d" | "wallThickness" | "height" | "wallHeights">;

/** The plan's rooms where they are saved (not a dragged copy) and its doors and windows, for the strips' doorways. */
export type PanelStripOpenings2D = {
  rooms: readonly PanelFaceRoom2D[];
  openings: readonly RoomRendererOpening[];
};

export type PanelStrip2D = {
  key: string;
  faceId: string;
  shape: THREE.Shape;
  /** The panel's face, the line the room is measured to. */
  faceLine: Array<[number, number, number]>;
  /** The finish that stands deepest on the face, which the strip is drawn in. */
  finish: { paintColorHex: string | null; materialId: string | null };
};

type Point = RoomPlanPolygonPoint;
type Strips = { strips: PanelStrip2D[] };
type Edge = { start: Point; end: Point };

const NO_STRIPS: Strips = { strips: [] };
const NO_OPENINGS: PanelStripOpenings2D = { rooms: [], openings: [] };
const DOORWAY_TOLERANCE = 0.002;
const DEFAULT_WALL_HEIGHT = 2.6;

// One list per room's depths while its outline, its doorways and the finishes it is drawn in are the same, so the plan
// keeps its shapes and lines across re-renders, edits elsewhere, and the copy of the room it draws on every frame of a room
// drag (only x and z change). While the plan's rooms and openings are the same lists, the doorways aren't measured again. A
// room's depths are the same object whenever their values are (getRoomWallFinishDepths), so the finishes are read too: a
// laminate swapped for another as deep has the same depths.
type KnownStrips = {
  room: PanelFaceRoom2D; context: PanelStripOpenings2D; doorways: string; finishes: string; strips: Strips;
};
const stripsByDepths = new WeakMap<RoomWallFinishDepths, KnownStrips>();
// Each room's strip finishes by its surfaces object, so a re-render or a drag frame reads none again.
type KnownFinishes = Map<string, { depths: RoomWallFinishDepths; finishes: string }>;
const finishesBySurfaces = new WeakMap<object, KnownFinishes>();

/** The finish each laminate face's strip is drawn in (getDeepestWallFinish), as one key. */
function stripFinishesKey(room: PanelFaceRoom2D, depths: RoomWallFinishDepths): string {
  const surfaces = room.surfaces ?? room.surfaceFinishes;
  const byRoom: KnownFinishes | undefined = surfaces ? finishesBySurfaces.get(surfaces) ?? new Map() : undefined;
  const known = byRoom?.get(room.id);
  if (known?.depths === depths) return known.finishes;
  const finishes = Object.keys(depths).filter((faceId) => (depths[faceId] ?? 0) > 0).map((faceId) => {
    const deepest = getDeepestWallFinish(room, faceId);
    return `${faceId}:${deepest?.paintColorHex ?? ""}:${deepest?.materialId ?? ""}`;
  }).join("|");
  if (surfaces && byRoom) {
    byRoom.set(room.id, { depths, finishes });
    finishesBySurfaces.set(surfaces, byRoom);
  }
  return finishes;
}

function isSameRoomOutline(a: PanelFaceRoom2D, b: PanelFaceRoom2D): boolean {
  return a.id === b.id && a.shape === b.shape && a.polygon === b.polygon && a.w === b.w && a.d === b.d &&
    a.wallThickness === b.wallThickness;
}

/**
 * Each laminate wall's panel strip, in room coordinates: from the bare wall face (half the wall in from the centre line) to
 * the panel's face, mitred where it meets the next wall, and stopped where the 3D view's panel leaves the floor: at doors,
 * and at windows without a sill panel under them.
 */
export function getRoomPanelStrips2D(room: PanelFaceRoom2D, openings: PanelStripOpenings2D = NO_OPENINGS): Strips {
  const depths = getRoomWallFinishDepths(room);
  if (!hasWallFinishDepths(depths)) return NO_STRIPS;
  const known = stripsByDepths.get(depths);
  const finishes = stripFinishesKey(room, depths);
  const sameOutline = Boolean(known && isSameRoomOutline(known.room, room) && known.finishes === finishes);
  if (known && sameOutline && known.context.rooms === openings.rooms && known.context.openings === openings.openings) {
    return known.strips;
  }
  const outline = { shape: room.shape, polygon: room.polygon, w: room.w, d: room.d };
  const faceIds = getRoomWallFaceIds(outline);
  const points = getRoomPlanOutlinePoints(outline);
  const doorways = getFaceDoorways(room, openings, points, faceIds);
  const doorwaysKey = doorways.map((ranges) => ranges.map((range) => range.map((at) => at.toFixed(4)).join("~")).join(",")).join("|");
  const strips = known && sameOutline && known.doorways === doorwaysKey
    ? known.strips : buildRoomPanelStrips2D(room, depths, faceIds, points, doorways);
  stripsByDepths.set(depths, { room, context: openings, doorways: doorwaysKey, finishes, strips });
  return strips;
}

function buildRoomPanelStrips2D(
  room: PanelFaceRoom2D, depths: RoomWallFinishDepths, faceIds: readonly string[], points: readonly Point[],
  doorways: ReadonlyArray<ReadonlyArray<[number, number]>>
): Strips {
  if (!faceIds.some((faceId) => (depths[faceId] ?? 0) > 0)) return { strips: [] };
  const halfWall = (room.wallThickness ?? 0.12) / 2;
  // Each face where it stands: a face meeting a deeper or shallower one in line steps at the corner, not leaning to it.
  const bare = getInsetPolygonFaces(points, faceIds.map(() => halfWall));
  const panel = getInsetPolygonFaces(points, faceIds.map((faceId) => halfWall + (depths[faceId] ?? 0)));
  const strips = faceIds.flatMap((faceId, index): PanelStrip2D[] => {
    if ((depths[faceId] ?? 0) <= 0) return [];
    const next = (index + 1) % points.length;
    const deepest = getDeepestWallFinish(room, faceId);
    const finish = { paintColorHex: deepest?.paintColorHex ?? null, materialId: deepest?.materialId ?? null };
    const edge = { start: points[index], end: points[next] };
    const [bareFace, panelFace] = [bare[index], panel[index]];
    return cutStripAtDoorways(edge, [bareFace.start, bareFace.end], [panelFace.start, panelFace.end], doorways[index])
      .map(({ bareLine, panelLine }, piece) => ({
        key: piece === 0 ? `${room.id}:${faceId}` : `${room.id}:${faceId}:${piece}`,
        faceId,
        // The plan is drawn looking down: a shape's y is the plan's -z, as the room shapes are (lib/room-plan-shape.ts).
        shape: new THREE.Shape([bareLine[0], bareLine[1], panelLine[1], panelLine[0]].map((point) => new THREE.Vector2(point.x, -point.z))),
        faceLine: panelLine.map((point): [number, number, number] => [point.x, 0, point.z]),
        finish,
      }));
  });
  return { strips };
}

function edgeLength(edge: Edge): number {
  return Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z) || 1;
}

/** How far along an edge, from its start corner on the centre line, a point is. */
function alongEdge(edge: Edge, point: Point): number {
  return ((point.x - edge.start.x) * (edge.end.x - edge.start.x) + (point.z - edge.start.z) * (edge.end.z - edge.start.z)) /
    edgeLength(edge);
}

/**
 * Each face's doorways, from its start corner along the centre line: where the 3D view's panels don't stand on the floor.
 * They stand on its solid parts and on the sills it draws under windows (buildWallParts, buildOpeningSillParts), with the
 * openings getWallOpenings finds: the room's own, and a neighbour's in a shared wall. A doorway that reaches a corner takes
 * the rest of the strip there, as the 3D panel stops at the opening.
 */
function getFaceDoorways(
  room: PanelFaceRoom2D, context: PanelStripOpenings2D, points: readonly Point[], faceIds: readonly string[]
): Array<Array<[number, number]>> {
  if (!context.openings.length) return faceIds.map(() => []);
  // Openings are placed against the saved room, so a dragged copy is measured where the room was.
  const placed = context.rooms.find((candidate) => candidate.id === room.id) ?? room;
  const segments = getWallSegments(placed);
  return faceIds.map((faceId, index) => {
    const segment = segments.find((candidate) => getWallSurfaceFaceId(placed, candidate) === faceId);
    const openings = segment ? getWallOpenings(placed, segment, context.rooms, context.openings) : [];
    if (!segment || !openings.length) return [];
    const height = Math.max(0.2, placed.wallHeights?.[faceId] ?? placed.height ?? DEFAULT_WALL_HEIGHT);
    const standing = [...buildWallParts(segment, openings), ...buildOpeningSillParts(segment, openings, height, height)]
      .map((part) => legacyWallPartAxisRange(segment, part)).sort((a, b) => a.startOffset - b.startOffset);
    const half = segment.length / 2;
    const gaps: Array<[number, number]> = [];
    let cursor = -half;
    for (const { startOffset, endOffset } of standing) {
      if (startOffset > cursor + DOORWAY_TOLERANCE) gaps.push([cursor, startOffset]);
      cursor = Math.max(cursor, endOffset);
    }
    if (half > cursor + DOORWAY_TOLERANCE) gaps.push([cursor, half]);
    const edge = { start: points[index], end: points[(index + 1) % points.length] };
    const [dx, dz] = legacyWallDirection(segment);
    const beyond = edgeLength(edge) + 1;
    const at = (offset: number) => {
      const distance = alongEdge(edge, { x: segment.x + dx * offset, z: segment.z + dz * offset });
      if (distance <= DOORWAY_TOLERANCE) return -beyond;
      return distance >= edgeLength(edge) - DOORWAY_TOLERANCE ? beyond : distance;
    };
    return gaps.map(([from, to]): [number, number] => {
      const [first, second] = [at(from), at(to)];
      return first <= second ? [first, second] : [second, first];
    });
  });
}

/**
 * The strip's pieces between its doorways: each a bare-face line and a panel-face line, cut square across the edge at a
 * doorway. A piece left with no length on either line (beside a doorway at a corner) is dropped.
 */
function cutStripAtDoorways(
  edge: Edge, bare: [Point, Point], panel: [Point, Point], doorways: ReadonlyArray<[number, number]>
): Array<{ bareLine: [Point, Point]; panelLine: [Point, Point] }> {
  const length = edgeLength(edge);
  const direction = { x: (edge.end.x - edge.start.x) / length, z: (edge.end.z - edge.start.z) / length };
  const cut = (line: [Point, Point], distance: number): Point => {
    const shift = distance - alongEdge(edge, line[0]);
    return { x: line[0].x + direction.x * shift, z: line[0].z + direction.z * shift };
  };
  const bounds = [
    { bare: bare[0], panel: panel[0] },
    ...doorways.flatMap(([from, to]) => [{ bare: cut(bare, from), panel: cut(panel, from) }, { bare: cut(bare, to), panel: cut(panel, to) }]),
    { bare: bare[1], panel: panel[1] },
  ];
  const pieces: Array<{ bareLine: [Point, Point]; panelLine: [Point, Point] }> = [];
  for (let index = 0; index < bounds.length; index += 2) {
    const [from, to] = [bounds[index], bounds[index + 1]];
    const bareLength = alongEdge(edge, to.bare) - alongEdge(edge, from.bare);
    const panelLength = alongEdge(edge, to.panel) - alongEdge(edge, from.panel);
    if (bareLength > DOORWAY_TOLERANCE && panelLength > DOORWAY_TOLERANCE) {
      pieces.push({ bareLine: [from.bare, to.bare], panelLine: [from.panel, to.panel] });
    }
  }
  return pieces;
}
