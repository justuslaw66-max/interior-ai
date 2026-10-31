import { clampToRoom } from "@/lib/design-page-geometry";
import { L_SHAPE_NOTCH_RATIO } from "@/lib/room-floor-area";
import type { RoomPlanPolygonPoint, RoomPlanShape } from "@/lib/room-types";
import {
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  hasRoomWallPanels,
  hasWallFinishDepths,
  NO_WALL_FINISH_DEPTHS,
  type RoomWallFinishDepths,
  type WallFinishRoom,
} from "@/lib/room-wall-finish-depths";

/**
 * A room's plan outline inside its laminate panels, a drawn room's or an imported plan's (J, 29 Oct 2026: the room measured to
 * the panel face; an imported room's edges are named by their plan walls, lib/room-wall-finish-depths.ts). Placement
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
/** Two edges turning by less than this (10°) are near-straight: moved in by different depths, they meet in a step. */
const NEAR_STRAIGHT_SIN = Math.sin((10 * Math.PI) / 180);

/** The foot of `point` on a moved edge's line. */
function footOn(line: OffsetLine, point: RoomPlanPolygonPoint): RoomPlanPolygonPoint {
  const along = (point.x - line.x) * line.dx + (point.z - line.z) * line.dz;
  return { x: line.x + line.dx * along, z: line.z + line.dz * along };
}

/**
 * Where two moved edges meet, at the corner `point` of the outline: where their lines cross. Two edges in line or nearly so
 * (a turn under 10°: a wall drawn as two pieces, with a slight kink, or an arc's pieces) moved in by different depths would
 * cross far off, or never, so they meet in a step at the corner instead: the first face up to it, then a jog to the second.
 */
function insetCorner(point: RoomPlanPolygonPoint, before: OffsetLine, after: OffsetLine): InsetCorner {
  const cross = before.dx * after.dz - before.dz * after.dx;
  const nearStraight = Math.abs(cross) < NEAR_STRAIGHT_SIN && before.dx * after.dx + before.dz * after.dz > 0;
  if (Math.abs(cross) >= 1e-9 && !(nearStraight && before.inset !== after.inset)) {
    const t = ((after.x - before.x) * after.dz - (after.z - before.z) * after.dx) / cross;
    return { x: before.x + before.dx * t, z: before.z + before.dz * t };
  }
  const start = footOn(after, point);
  return before.inset === after.inset ? start : [footOn(before, point), start];
}

/** The moved outline's corners, each with the moved edges either side of it that meet there. */
type MovedCorners = { corners: InsetCorner[]; meeting: (readonly [OffsetLine, OffsetLine])[] };

/** Each corner, from the nearest edges either side of it still in the outline: one an edge passed over doesn't stop. */
function cornersBetween(points: readonly RoomPlanPolygonPoint[], lines: readonly OffsetLine[], kept: readonly boolean[]): MovedCorners {
  const count = points.length;
  const nearest = (from: number, by: number) => {
    let index = (from + count) % count;
    while (!kept[index]) index = (index + by + count) % count;
    return index;
  };
  const sides = points.map((_, index) => [nearest(index - 1, -1), nearest(index, 1)] as const);
  const meeting = sides.map(([before, after]) => [lines[before], lines[after]] as const);
  // A corner past passed-over edges takes the first of their points, so they all meet at the same place.
  const corners = sides.map(([before, after]) => insetCorner(points[(before + 1) % count], lines[before], lines[after]));
  return { corners, meeting };
}

const cornerOut = (corner: InsetCorner) => (isInsetStep(corner) ? corner[1] : corner);
const cornerIn = (corner: InsetCorner) => (isInsetStep(corner) ? corner[0] : corner);

/**
 * The polygon with each edge moved in by its own distance (`insets[i]` for the edge from point i to point i + 1), one corner
 * per point (insetCorner). An edge of no length (a drawn outline closed with its first point repeated) is passed over, and
 * so is an edge whose moved face would turn back on itself (a jog or a chamfer shorter than the depth its neighbours move
 * in), as many times as that takes: its corners are where the edges either side of it meet. The opposite `inwardSign`
 * moves the edges out instead (a hole's walls, which stand out of it into the room).
 */
export function insetPolygonEdgesWithSteps(
  points: readonly RoomPlanPolygonPoint[], insets: readonly number[], inwardSign: 1 | -1 = getOutlineInwardSign(points)
): InsetCorner[] {
  return moveEdges(points, insets, inwardSign).corners;
}

function moveEdges(points: readonly RoomPlanPolygonPoint[], insets: readonly number[], inwardSign: 1 | -1): MovedCorners {
  // An inset may be negative: an imported room's edge on a wall thinner than its average stands that much nearer its centre
  // line (getRoomWallFinishDepths). A drawn room's are never.
  const lines = points.map((_, index) => offsetEdge(points, index, insets[index] ?? 0, inwardSign));
  const kept = lines.map((line) => line.length > ZERO_EDGE_METERS);
  if (!kept.some(Boolean)) return { corners: points.map(({ x, z }) => ({ x, z })), meeting: [] };
  let moved = cornersBetween(points, lines, kept);
  for (let round = 0; round < points.length; round += 1) {
    const { corners } = moved;
    const reversed = lines.map((line, index) => {
      const from = cornerOut(corners[index]), to = cornerIn(corners[(index + 1) % corners.length]);
      return kept[index] && (to.x - from.x) * line.dx + (to.z - from.z) * line.dz < -1e-9;
    });
    // An outline that would keep fewer than three edges is narrower than its walls: it is left turned inside out.
    if (!reversed.some(Boolean) || kept.filter((keep, index) => keep && !reversed[index]).length < 3) break;
    reversed.forEach((turned, index) => { if (turned) kept[index] = false; });
    moved = cornersBetween(points, lines, kept);
  }
  return moved;
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
    return { start: cornerOut(corner), end: cornerIn(next) };
  });
}

/**
 * `insetPolygonEdgesWithSteps` with one point per corner, for a closed outline whose corners keep their indices (the
 * furniture clamp, and the cabinets, which name each edge's wall `wall-N`): a step's end on the edge moved in further, so
 * the other face leans from the deeper depth at that corner to its own at the next. Two edges that run straight on move in
 * by the deeper of the two, as before. Read a face where it stands with getInsetPolygonFaces.
 */
export function insetPolygonEdges(
  points: readonly RoomPlanPolygonPoint[], insets: readonly number[], inwardSign: 1 | -1 = getOutlineInwardSign(points)
): RoomPlanPolygonPoint[] {
  const { corners, meeting } = moveEdges(points, insets, inwardSign);
  return corners.map((corner, index) => {
    if (!isInsetStep(corner)) return corner;
    // The end of the edge moved in further. With insets never negative, as a drawn room's, that is the end farther from the
    // corner; an imported room's edge on a thinner wall moves out (a negative inset), and its end would stand out of the room.
    const [before, after] = meeting[index];
    return before.inset > after.inset ? corner[0] : corner[1];
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
  // Shown when a wall has a laminate (J: "Add a clear size"), measured to each wall's own face: an imported room's depths also
  // carry each wall's thickness, so they are there without a laminate.
  if (!hasRoomWallPanels(room)) return [];
  const depths = getRoomWallFinishDepths(room);
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
