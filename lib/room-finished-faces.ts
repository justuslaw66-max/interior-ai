import {
  getOutlineInwardSign,
  getRoomPlanOutlinePoints,
  insetPolygonEdgesWithSteps,
  isInsetStep,
  type InsetCorner,
} from "@/lib/room-finished-outline";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import {
  getRectangleWallClearances,
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  type RoomWallFinishDepths,
  type WallFinishRoom,
} from "@/lib/room-wall-finish-depths";

/**
 * An L-shaped, drawn or imported room's finished wall faces, for the checks that measure an item's gap to the walls: the
 * clearance checks (lib/constraints/evaluate.ts), placement scoring, catalog placement quality, the walkway map and plan
 * review. Each edge of the outline stands in by its own distance: `faceOffset` (half the wall to its finished face, or none
 * for plan review, which measures from the centre line) and that wall's laminate panel (J, 29 Oct 2026: "Fix it, all from
 * the face", "At the deepest panel"). A rectangle has none of these: its checks keep measuring its four sides, as before.
 * The notch's walls used to go unchecked, since every shape was measured as its bounding rectangle.
 */

/** A room snapshot or a plan room, with the courtyard loops an imported room can have. */
export type FinishedFacesRoom = WallFinishRoom & {
  planHoles?: readonly (readonly RoomPlanPolygonPoint[])[];
  holes?: readonly (readonly RoomPlanPolygonPoint[])[];
};

type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * The finished faces as loops (the outline first, then any holes, each grown by `faceOffset`), each with the side of its
 * edges the room is on (+1 on their local +Z normal's, (−dz, dx)); their bounds, within the outline's own; and whether the
 * walls leave no floor between them (an outline narrower than its walls turns inside out when moved in).
 */
export type RoomFinishedOutline = {
  loops: { points: RoomPlanPolygonPoint[]; roomSide: 1 | -1 }[];
  bounds: Box;
  inverted: boolean;
  /** With no floor: each outline edge's face line, a point on it and its way into the room. */
  faceLines: { x: number; z: number; nx: number; nz: number }[];
};

const flattenSteps = (corners: readonly InsetCorner[]): RoomPlanPolygonPoint[] =>
  corners.flatMap((corner) => (isInsetStep(corner) ? [...corner] : [corner]));

function boundsOf(points: readonly RoomPlanPolygonPoint[]): Box {
  const xs = points.map(({ x }) => x), zs = points.map(({ z }) => z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

function measureRoomFinishedOutline(
  points: readonly RoomPlanPolygonPoint[], insets: readonly number[], holeLoops: readonly (readonly RoomPlanPolygonPoint[])[],
  faceOffset: number
): RoomFinishedOutline {
  const roomSide = getOutlineInwardSign(points);
  const outer = flattenSteps(insetPolygonEdgesWithSteps(points, insets, roomSide));
  // A hole's walls stand out of it into the room, so it grows by the offset (an imported room's holes have no panels).
  const holes = holeLoops.filter((hole) => hole.length >= 3).map((hole) => {
    const side = getOutlineInwardSign(hole) === 1 ? -1 : 1;
    return { points: flattenSteps(insetPolygonEdgesWithSteps(hole, hole.map(() => faceOffset), side)), roomSide: side } as const;
  });
  const faces = boundsOf(outer), drawn = boundsOf(points);
  const inverted = getOutlineInwardSign(outer) !== roomSide;
  return {
    loops: [{ points: outer, roomSide }, ...holes],
    bounds: {
      minX: Math.max(faces.minX, drawn.minX), maxX: Math.min(faces.maxX, drawn.maxX),
      minZ: Math.max(faces.minZ, drawn.minZ), maxZ: Math.min(faces.maxZ, drawn.maxZ),
    },
    inverted,
    faceLines: inverted ? points.flatMap((a, index) => {
      const b = points[(index + 1) % points.length];
      const length = Math.hypot(b.x - a.x, b.z - a.z);
      if (length === 0) return [];
      const nx = (-(b.z - a.z) / length) * roomSide, nz = ((b.x - a.x) / length) * roomSide, inset = insets[index] ?? 0;
      return [{ x: a.x + nx * inset, z: a.z + nz * inset, nx, nz }];
    }) : [],
  };
}

// The faces are measured once per room while its outline, size, offset and depths are the same: placement scores dozens of
// candidate spots in one room, each through several checks.
type KnownOutline = {
  w: number; d: number; faceOffset: number; depths: RoomWallFinishDepths; shape: unknown; polygon: unknown; holes: unknown;
  outline: RoomFinishedOutline;
};
const outlinesByRoom = new WeakMap<object, KnownOutline[]>();

/** The room's finished faces, or null for a rectangle (and for a room the checks know only by its size). */
export function getRoomFinishedOutline(
  room: FinishedFacesRoom | null | undefined, size: { w: number; d: number }, faceOffset: number
): RoomFinishedOutline | null {
  if (!room) return null;
  const faceIds = getRoomWallFaceIds(room);
  if (faceIds[0] === "north") return null;
  const depths = getRoomWallFinishDepths(room);
  const shape = room.planShape ?? room.shape ?? "rectangle";
  const polygon = room.planPolygon ?? room.polygon, holes = room.planHoles ?? room.holes;
  const known = outlinesByRoom.get(room) ?? [];
  const match = known.find((entry) => entry.w === size.w && entry.d === size.d && entry.faceOffset === faceOffset &&
    entry.depths === depths && entry.shape === shape && entry.polygon === polygon && entry.holes === holes);
  if (match) return match.outline;
  const points = getRoomPlanOutlinePoints({ shape, polygon: [...(polygon ?? [])], w: size.w, d: size.d });
  const insets = faceIds.map((faceId) => faceOffset + (depths[faceId] ?? 0));
  const outline = measureRoomFinishedOutline(points, insets, holes ?? [], faceOffset);
  outlinesByRoom.set(room, [{ w: size.w, d: size.d, faceOffset, depths, shape, polygon, holes, outline }, ...known].slice(0, 4));
  return outline;
}

function isInsideLoop(point: RoomPlanPolygonPoint, loop: readonly RoomPlanPolygonPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = loop[i], b = loop[j];
    if ((a.z > point.z) !== (b.z > point.z) && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}

function isInside(outline: RoomFinishedOutline, point: RoomPlanPolygonPoint): boolean {
  const [outer, ...holes] = outline.loops;
  return !outline.inverted && isInsideLoop(point, outer.points) && !holes.some((hole) => isInsideLoop(point, hole.points));
}

type FaceVisitor = (a: RoomPlanPolygonPoint, b: RoomPlanPolygonPoint, roomSide: 1 | -1) => void;

function forEachFace(outline: RoomFinishedOutline, visit: FaceVisitor) {
  for (const { points, roomSide } of outline.loops) {
    points.forEach((point, index) => visit(point, points[(index + 1) % points.length], roomSide));
  }
}

function distanceToSegment(point: RoomPlanPolygonPoint, a: RoomPlanPolygonPoint, b: RoomPlanPolygonPoint): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq)) : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
}

function nearestFace(outline: RoomFinishedOutline, point: RoomPlanPolygonPoint, measure: typeof distanceToSegment): number {
  let nearest = Infinity;
  forEachFace(outline, (a, b) => { nearest = Math.min(nearest, measure(point, a, b)); });
  return nearest;
}

/** Whether the segment touches the box (Liang–Barsky clipping). */
function segmentTouchesBox(a: RoomPlanPolygonPoint, b: RoomPlanPolygonPoint, box: Box): boolean {
  let enter = 0, leave = 1;
  const dx = b.x - a.x, dz = b.z - a.z;
  const sides: Array<[number, number]> = [[-dx, a.x - box.minX], [dx, box.maxX - a.x], [-dz, a.z - box.minZ], [dz, box.maxZ - a.z]];
  for (const [p, q] of sides) {
    if (p === 0) {
      if (q < 0) return false;
    } else if (p < 0) enter = Math.max(enter, q / p);
    else leave = Math.min(leave, q / p);
    if (enter > leave) return false;
  }
  return true;
}

const boxCorners = (box: Box): RoomPlanPolygonPoint[] => [
  { x: box.minX, z: box.minZ }, { x: box.maxX, z: box.minZ }, { x: box.maxX, z: box.maxZ }, { x: box.minX, z: box.maxZ },
];

function distanceToBox(point: RoomPlanPolygonPoint, box: Box): number {
  return Math.hypot(Math.max(box.minX - point.x, 0, point.x - box.maxX), Math.max(box.minZ - point.z, 0, point.z - box.maxZ));
}

/** How far a face's corner stands into the box: the nearer of its sides. */
function depthInBox(point: RoomPlanPolygonPoint, box: Box): number {
  return Math.max(0, Math.min(point.x - box.minX, box.maxX - point.x, point.z - box.minZ, box.maxZ - point.z));
}

/** A point's distance into the room from a face's line: less than zero past it. */
function intoRoom(point: RoomPlanPolygonPoint, a: RoomPlanPolygonPoint, b: RoomPlanPolygonPoint, roomSide: 1 | -1): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  return (((point.z - a.z) * dx - (point.x - a.x) * dz) / (Math.hypot(dx, dz) || 1)) * roomSide;
}

/** How far a point stands past a face, out of the room, where it's level with the face (its foot falls on it). */
function reachPastFace(point: RoomPlanPolygonPoint, a: RoomPlanPolygonPoint, b: RoomPlanPolygonPoint, roomSide: 1 | -1): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const along = length > 0 ? ((point.x - a.x) * dx + (point.z - a.z) * dz) / length : -1;
  return along < 0 || along > length ? 0 : Math.max(0, -intoRoom(point, a, b, roomSide));
}

/** The next face along a loop from `index` (by `by`, +1 or -1) that has a length: a step's jog can be of none. */
function neighbourFace(points: readonly RoomPlanPolygonPoint[], index: number, by: 1 | -1): [RoomPlanPolygonPoint, RoomPlanPolygonPoint] | null {
  const count = points.length;
  for (let step = 1; step < count; step += 1) {
    const at = (index + by * step + count * step) % count;
    const a = points[at], b = points[(at + 1) % count];
    if (a.x !== b.x || a.z !== b.z) return [a, b];
  }
  return null;
}

/**
 * How far a point out of the room stands past the walls: past the face it is nearest, along that face's way in, or, nearest
 * a corner, past the further of the corner's two faces (as a rectangle measures each of its walls, so a box past two walls
 * stands past them by the larger overhang, not the straight line to the corner).
 */
function depthPastFaces(outline: RoomFinishedOutline, point: RoomPlanPolygonPoint): number {
  let best = { distance: Infinity, depth: 0 };
  for (const { points, roomSide } of outline.loops) {
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length];
      const dx = b.x - a.x, dz = b.z - a.z, lengthSq = dx * dx + dz * dz;
      if (lengthSq === 0) return;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSq));
      const distance = Math.hypot(point.x - (a.x + dx * t), point.z - (a.z + dz * t));
      if (distance >= best.distance) return;
      const past = (face: [RoomPlanPolygonPoint, RoomPlanPolygonPoint] | null) =>
        face ? Math.max(0, -intoRoom(point, face[0], face[1], roomSide)) : 0;
      const corner = t === 0 ? neighbourFace(points, index, -1) : t === 1 ? neighbourFace(points, index, 1) : null;
      best = { distance, depth: Math.max(past([a, b]), past(corner)) };
    });
  }
  return best.depth;
}

/** With no floor between the walls, each wall's face line still counts: the box's least distance into the room from them. */
function gapAcrossFaceLines(outline: RoomFinishedOutline, box: Box): number {
  const corners = boxCorners(box);
  return Math.min(...outline.faceLines.flatMap((line) =>
    corners.map((corner) => (corner.x - line.x) * line.nx + (corner.z - line.z) * line.nz)));
}

/**
 * An item's footprint (an axis-aligned box in the room's plan) to the nearest finished face. While it's inside, the clear
 * gap: its straight-line distance to the nearest face, a wall's corner included. Otherwise less than zero by the most it
 * stands past a face: a corner out of the room past the wall it is nearest, along that wall's way in (past the further of
 * two at a corner, as a rectangle room measures each wall), a wall's corner standing into it, or, with every corner inside,
 * its far side past a wall it runs across (a narrow notch or a courtyard it spans).
 */
export function getBoxGapToFinishedOutline(outline: RoomFinishedOutline, box: Box): number {
  if (outline.inverted) return gapAcrossFaceLines(outline, box);
  const corners = boxCorners(box);
  const outside = corners.filter((corner) => !isInside(outline, corner));
  let gap = Infinity, overlap = 0, crossed = false;
  forEachFace(outline, (a, b, roomSide) => {
    if (segmentTouchesBox(a, b, box)) {
      crossed = true;
      overlap = Math.max(overlap, depthInBox(a, box), depthInBox(b, box));
      if (!outside.length) overlap = Math.max(overlap, ...corners.map((corner) => reachPastFace(corner, a, b, roomSide)));
      return;
    }
    gap = Math.min(gap, distanceToBox(a, box), distanceToBox(b, box), ...corners.map((corner) => distanceToSegment(corner, a, b)));
  });
  for (const corner of outside) overlap = Math.max(overlap, depthPastFaces(outline, corner));
  return crossed || outside.length > 0 ? -overlap : gap;
}

function segmentsTouch(a: RoomPlanPolygonPoint, b: RoomPlanPolygonPoint, c: RoomPlanPolygonPoint, d: RoomPlanPolygonPoint): boolean {
  const side = (p: RoomPlanPolygonPoint, q: RoomPlanPolygonPoint, r: RoomPlanPolygonPoint) =>
    Math.sign((q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x));
  const [s1, s2, s3, s4] = [side(a, b, c), side(a, b, d), side(c, d, a), side(c, d, b)];
  if (s1 !== s2 && s3 !== s4) return true;
  const within = (p: RoomPlanPolygonPoint, q: RoomPlanPolygonPoint, r: RoomPlanPolygonPoint) =>
    Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.z, q.z) <= r.z && r.z <= Math.max(p.z, q.z);
  return (s1 === 0 && within(a, b, c)) || (s2 === 0 && within(a, b, d)) || (s3 === 0 && within(c, d, a)) || (s4 === 0 && within(c, d, b));
}

/** Whether the straight walk from one point to another meets a finished face (runs into a wall). */
export function crossesFinishedFace(outline: RoomFinishedOutline, from: RoomPlanPolygonPoint, to: RoomPlanPolygonPoint): boolean {
  let crosses = false;
  forEachFace(outline, (a, b) => { crosses ||= segmentsTouch(from, to, a, b); });
  return crosses;
}

/** A point's clearance to the nearest finished face, or null when it isn't inside them (in a notch, a hole or past a wall). */
export function getPointClearanceInFinishedOutline(outline: RoomFinishedOutline, point: RoomPlanPolygonPoint): number | null {
  return isInside(outline, point) ? nearestFace(outline, point, distanceToSegment) : null;
}

/**
 * An item's clear gap to the nearest finished face of a room snapshot (placement scoring and catalog placement quality): for a
 * rectangle the nearer of `getRectangleWallClearances`' two axes, as before, and for another shape its gap to the outline's
 * faces, the notch's walls included.
 */
export function getRoomWallClearance(
  room: FinishedFacesRoom & { geometry: { width: number; depth: number; wallThickness?: number } },
  center: { x: number; z: number },
  footprint: { w: number; d: number }
): number {
  const { width, depth, wallThickness = 0.12 } = room.geometry;
  const outline = getRoomFinishedOutline(room, { w: width, d: depth }, wallThickness / 2);
  if (outline) {
    return getBoxGapToFinishedOutline(outline, {
      minX: center.x - footprint.w / 2, maxX: center.x + footprint.w / 2, minZ: center.z - footprint.d / 2, maxZ: center.z + footprint.d / 2,
    });
  }
  const clearance = getRectangleWallClearances({ width, depth, wallThickness, depths: getRoomWallFinishDepths(room), center, footprint });
  return Math.min(clearance.x, clearance.z);
}
