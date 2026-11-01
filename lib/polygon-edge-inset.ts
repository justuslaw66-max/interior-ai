import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * An outline with each edge moved in by its own distance, for the room's finished faces and the furniture clamp
 * (lib/room-finished-outline.ts, lib/furniture-room-fit.ts): where moved edges meet, step at a near-straight corner, or pass
 * over an edge that would turn back on itself. It depends on nothing but the plan's points, so the clamp's geometry
 * (lib/design-page-geometry.ts) can use it too.
 */

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
