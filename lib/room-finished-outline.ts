import { clampToRoom } from "@/lib/design-page-geometry";
import { L_SHAPE_NOTCH_RATIO } from "@/lib/room-floor-area";
import type { RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";
import {
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  hasWallFinishDepths,
  NO_WALL_FINISH_DEPTHS,
  type RoomWallFinishDepths,
  type WallFinishRoom,
} from "@/lib/room-wall-finish-depths";

/**
 * A drawn room's plan outline inside its laminate panels (J, 29 Oct 2026: the room measured to the panel face). Placement
 * keeps its own inset from the bare wall (half the wall plus 2 cm, getFurnitureWallInset); each wall's panel depth
 * (lib/room-wall-finish-depths.ts) moves that wall's edge of the outline in, so the same clamps and containment checks stop
 * furniture at the panel. A room with no panels keeps its outline exactly.
 */

/** The outline fields placement reads, in a room snapshot's or a plan room's terms. */
export type RoomPlanOutline = {
  shape: RoomPlanShape;
  polygon?: RoomPlanPolygonPoint[];
  holes?: RoomPlanPolygonPoint[][];
  w: number;
  d: number;
};

/** The outline's corners, in face order (getRoomWallFaceIds): the wall centre line, as drawn. */
export function getRoomPlanOutlinePoints({ shape, polygon, w, d }: RoomPlanOutline): RoomPlanPolygonPoint[] {
  if (shape === "custom_polygon" && polygon && polygon.length >= 3) return polygon.map(({ x, z }) => ({ x, z }));
  const left = -w / 2, right = w / 2, top = -d / 2, bottom = d / 2;
  if (shape === "l_shape") {
    const notchW = w * L_SHAPE_NOTCH_RATIO;
    const notchD = d * L_SHAPE_NOTCH_RATIO;
    return [
      { x: left, z: top }, { x: right, z: top }, { x: right, z: bottom - notchD },
      { x: right - notchW, z: bottom - notchD }, { x: right - notchW, z: bottom }, { x: left, z: bottom },
    ];
  }
  return [{ x: left, z: top }, { x: right, z: top }, { x: right, z: bottom }, { x: left, z: bottom }];
}

/** Which way an outline's edges face its inside: +1 when the inside is on their local +Z normal's side (−dz, dx). */
export function getOutlineInwardSign(points: readonly RoomPlanPolygonPoint[]): 1 | -1 {
  const area = points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0);
  return area >= 0 ? 1 : -1;
}

type OffsetLine = { x: number; z: number; dx: number; dz: number; nx: number; nz: number; length: number; inset: number };

/** Edge `index` moved `inset` towards the inside: a point on it, its direction, its inward normal and its own length. */
function offsetEdge(points: readonly RoomPlanPolygonPoint[], index: number, inset: number, inwardSign: number): OffsetLine {
  const start = points[index];
  const end = points[(index + 1) % points.length];
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const dx = (end.x - start.x) / (length || 1);
  const dz = (end.z - start.z) / (length || 1);
  const nx = -dz * inwardSign;
  const nz = dx * inwardSign;
  return { x: start.x + nx * inset, z: start.z + nz * inset, dx, dz, nx, nz, length, inset };
}

/** A corner of the moved outline: where its two edges meet, or a step between them (insetPolygonEdgesWithSteps). */
export type InsetCorner = RoomPlanPolygonPoint | readonly [RoomPlanPolygonPoint, RoomPlanPolygonPoint];

const ZERO_EDGE_METERS = 1e-6;
/** How far along either edge, in the deeper of the two depths, two moved edges may meet before they meet in a step. */
const CORNER_REACH_LIMIT = 2;

/**
 * Where two moved edges meet at `point`. Two edges moved in by different depths that run straight on, or would meet further
 * along either edge than its own length or twice the deeper depth (near-parallel walls, as a wall drawn with a slight kink or
 * an arc's pieces are, would meet metres away), meet in a step instead: the end of the first moved edge, then the start of
 * the second. Edges moved in by the same depth always meet at their corner, as before.
 */
function insetCorner(point: RoomPlanPolygonPoint, before: OffsetLine, after: OffsetLine): InsetCorner {
  const cross = before.dx * after.dz - before.dz * after.dx;
  if (Math.abs(cross) >= 1e-9) {
    const t = ((after.x - before.x) * after.dz - (after.z - before.z) * after.dx) / cross;
    const corner = { x: before.x + before.dx * t, z: before.z + before.dz * t };
    const pastBefore = Math.abs((corner.x - point.x) * before.dx + (corner.z - point.z) * before.dz);
    const pastAfter = Math.abs((corner.x - point.x) * after.dx + (corner.z - point.z) * after.dz);
    const reach = CORNER_REACH_LIMIT * Math.max(before.inset, after.inset);
    const meets = pastBefore <= Math.min(before.length, reach) && pastAfter <= Math.min(after.length, reach);
    if (before.inset === after.inset || meets) return corner;
  }
  const start = { x: point.x + after.nx * after.inset, z: point.z + after.nz * after.inset };
  if (before.inset === after.inset) return start;
  return [{ x: point.x + before.nx * before.inset, z: point.z + before.nz * before.inset }, start];
}

/**
 * The polygon with each edge moved in by its own distance (`insets[i]` for the edge from point i to point i + 1), one corner
 * per point, a step where two moved edges don't meet by a corner (insetCorner). An edge of no length (a drawn outline closed
 * with its first point repeated) is passed over: its two corners are where the edges either side of it meet. The opposite
 * `inwardSign` moves the edges out instead (a hole's walls, which stand out of it into the room).
 */
export function insetPolygonEdgesWithSteps(
  points: readonly RoomPlanPolygonPoint[], insets: readonly number[], inwardSign: 1 | -1 = getOutlineInwardSign(points)
): InsetCorner[] {
  const count = points.length;
  const lines = points.map((_, index) => offsetEdge(points, index, Math.max(0, insets[index] ?? 0), inwardSign));
  const real = lines.map((line) => line.length > ZERO_EDGE_METERS);
  if (!real.some(Boolean)) return points.map(({ x, z }) => ({ x, z }));
  const step = (from: number, by: number) => {
    let index = (from + count) % count;
    while (!real[index]) index = (index + by + count) % count;
    return lines[index];
  };
  return points.map((point, index) => insetCorner(point, step(index - 1, -1), step(index, 1)));
}

/**
 * Each edge's own moved face, by its index (`wall-N` is edge N): from its start corner to its end corner, taking its own
 * side of a step, so a face stands at its own depth up to the corner where it meets a deeper or shallower one.
 */
export function getInsetPolygonFaces(
  points: readonly RoomPlanPolygonPoint[], insets: readonly number[], inwardSign: 1 | -1 = getOutlineInwardSign(points)
): { start: RoomPlanPolygonPoint; end: RoomPlanPolygonPoint }[] {
  const corners = insetPolygonEdgesWithSteps(points, insets, inwardSign);
  return corners.map((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return { start: isInsetStep(corner) ? corner[1] : corner, end: isInsetStep(next) ? next[0] : next };
  });
}

/**
 * `insetPolygonEdgesWithSteps` with one point per corner, for a closed outline whose corners keep their indices (the
 * furniture clamp, and the cabinets, which name each edge's wall `wall-N`): a step's deeper end, so the shallower face
 * leans from the deeper depth at that corner to its own at the next. Two edges that run straight on move in by the deeper
 * of the two, as before. Read a face where it stands with getInsetPolygonFaces.
 */
export function insetPolygonEdges(
  points: readonly RoomPlanPolygonPoint[], insets: readonly number[], inwardSign: 1 | -1 = getOutlineInwardSign(points)
): RoomPlanPolygonPoint[] {
  return insetPolygonEdgesWithSteps(points, insets, inwardSign).map((corner, index) => {
    if (!isInsetStep(corner)) return corner;
    const point = points[index];
    const [end, start] = corner;
    return Math.hypot(end.x - point.x, end.z - point.z) > Math.hypot(start.x - point.x, start.z - point.z) ? end : start;
  });
}

export function isInsetStep(corner: InsetCorner): corner is readonly [RoomPlanPolygonPoint, RoomPlanPolygonPoint] {
  return Array.isArray(corner);
}

// One inset outline per room's depths while its outline is the same: an item's clamp runs on every drag frame, and the 3D view
// hands each item the polygon, whose identity its re-clamp effect depends on.
const insideOutlineByDepths = new WeakMap<RoomWallFinishDepths, { outline: RoomPlanOutline; inside: RoomPlanOutline }>();

function isSameOutline(a: RoomPlanOutline, b: RoomPlanOutline): boolean {
  return a.shape === b.shape && a.polygon === b.polygon && a.holes === b.holes && a.w === b.w && a.d === b.d;
}

/**
 * The outline inside the panels: the same outline when no wall has one, otherwise a drawn shape whose edges stand in by their
 * walls' panel depths. Its holes and its bounding size are unchanged.
 */
export function getRoomOutlineInsideFinishes(outline: RoomPlanOutline, depths: RoomWallFinishDepths): RoomPlanOutline {
  if (!hasWallFinishDepths(depths)) return outline;
  const known = insideOutlineByDepths.get(depths);
  if (known && isSameOutline(known.outline, outline)) return known.inside;
  const faceIds = getRoomWallFaceIds({ shape: outline.shape, polygon: outline.polygon });
  const points = getRoomPlanOutlinePoints(outline);
  const inside: RoomPlanOutline = {
    ...outline,
    shape: "custom_polygon",
    polygon: insetPolygonEdges(points, faceIds.map((faceId) => depths[faceId] ?? 0)),
  };
  insideOutlineByDepths.set(depths, { outline, inside });
  return inside;
}

/**
 * `clampToRoom` (lib/design-page-geometry.ts) inside the room's panels: the same arguments, then the room's panel depths.
 * `wallInset` is still placement's inset from the bare wall.
 */
export function clampToRoomInsideFinishes(
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  roomW: number,
  roomD: number,
  wallInset: number,
  rotationY: number,
  planShape: RoomPlanShape | undefined,
  planPolygon: RoomPlanPolygonPoint[] | undefined,
  planHoles: RoomPlanPolygonPoint[][] | undefined,
  depths: RoomWallFinishDepths
): [number, number] {
  const outline = getRoomOutlineInsideFinishes(
    { shape: planShape ?? "rectangle", polygon: planPolygon, holes: planHoles, w: roomW, d: roomD },
    depths
  );
  return clampToRoom(x, z, itemWidth, itemDepth, roomW, roomD, wallInset, rotationY, outline.shape, outline.polygon, outline.holes);
}

/** The room fields an item in the 3D view is placed with (components/scene/FurnitureItem.tsx). */
export type FurnitureRoomFrame = {
  roomWidth: number;
  roomDepth: number;
  roomOriginX: number;
  roomOriginZ: number;
  roomPlanShape: RoomPlanShape;
  roomPlanPolygon?: RoomPlanPolygonPoint[];
  roomPlanHoles?: RoomPlanPolygonPoint[][];
};

/**
 * The frame an item in the 3D view is placed in, inside the room's panels. A rectangle shrinks and shifts by its walls'
 * depths, so the item's wall snap (rectangular bounds) stops at each panel as well as its clamp; another shape takes the
 * inset outline, as its clamp already did with the bare one.
 */
export function getFurnitureRoomFrameInsideFinishes(
  room: {
    roomWidth: number;
    roomDepth: number;
    roomPlanShape: RoomPlanShape;
    roomPlanPolygon?: RoomPlanPolygonPoint[];
    roomPlanHoles?: RoomPlanPolygonPoint[][];
    roomWallFinishDepths?: RoomWallFinishDepths;
  },
  origin: { x: number; z: number }
): FurnitureRoomFrame {
  const { roomWidth, roomDepth, roomPlanShape, roomPlanPolygon, roomPlanHoles } = room;
  const depths = room.roomWallFinishDepths ?? NO_WALL_FINISH_DEPTHS;
  const frame = { roomWidth, roomDepth, roomOriginX: origin.x, roomOriginZ: origin.z, roomPlanShape, roomPlanPolygon, roomPlanHoles };
  if (!hasWallFinishDepths(depths)) return frame;
  if (roomPlanShape === "rectangle") {
    const west = depths.west ?? 0, east = depths.east ?? 0, north = depths.north ?? 0, south = depths.south ?? 0;
    return {
      ...frame,
      roomWidth: Math.max(0, roomWidth - west - east),
      roomDepth: Math.max(0, roomDepth - north - south),
      roomOriginX: origin.x + (west - east) / 2,
      roomOriginZ: origin.z + (north - south) / 2,
    };
  }
  const outline = getRoomOutlineInsideFinishes(
    { shape: roomPlanShape, polygon: roomPlanPolygon, holes: roomPlanHoles, w: roomWidth, d: roomDepth },
    depths
  );
  return { ...frame, roomPlanShape: outline.shape, roomPlanPolygon: outline.polygon };
}

/**
 * The room's clear size inside its walls and their laminate panels, as metrics for the room inspector, for example
 * "Clear inside 3.86 m × 2.86 m"; none when no wall has a panel (J, 29 Oct 2026: "Add a clear size"). It is the bounding size
 * of the outline with each edge moved in by half its wall and its panel; the room keeps its drawn size and floor area.
 */
export function getRoomClearInsideMetrics(
  room: WallFinishRoom & { shape: RoomPlanShape; w: number; d: number; wallThickness?: number },
  formatLengthMm: (valueMm: number) => string
): string[] {
  const depths = getRoomWallFinishDepths(room);
  if (!hasWallFinishDepths(depths)) return [];
  const halfWall = (room.wallThickness ?? 0.12) / 2;
  const outline = { shape: room.shape, polygon: room.polygon ? [...room.polygon] : undefined, w: room.w, d: room.d };
  const faceIds = getRoomWallFaceIds(outline);
  const inside = insetPolygonEdges(getRoomPlanOutlinePoints(outline), faceIds.map((faceId) => halfWall + (depths[faceId] ?? 0)));
  const xs = inside.map((point) => point.x);
  const zs = inside.map((point) => point.z);
  const widthMm = Math.max(0, Math.max(...xs) - Math.min(...xs)) * 1000;
  const depthMm = Math.max(0, Math.max(...zs) - Math.min(...zs)) * 1000;
  return [`Clear inside ${formatLengthMm(widthMm)} × ${formatLengthMm(depthMm)}`];
}
