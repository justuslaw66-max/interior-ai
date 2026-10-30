import { getRoomPlanOutlinePoints, getOutlineInwardSign, insetPolygonEdges } from "@/lib/room-finished-outline";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import {
  getRectangleWallClearances,
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
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

/**
 * The finished faces as loops (the outline first, then any holes, each grown by `faceOffset`), each with the side of its
 * edges the room is on (+1 on their local +Z normal's, (−dz, dx)), and their bounds.
 */
export type RoomFinishedOutline = {
  loops: { points: RoomPlanPolygonPoint[]; roomSide: 1 | -1 }[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
};

type Box = RoomFinishedOutline["bounds"];

/** The room's finished faces, or null for a rectangle (and for a room the checks know only by its size). */
export function getRoomFinishedOutline(
  room: FinishedFacesRoom | null | undefined, size: { w: number; d: number }, faceOffset: number
): RoomFinishedOutline | null {
  if (!room) return null;
  const faceIds = getRoomWallFaceIds(room);
  if (faceIds[0] === "north") return null;
  const depths = getRoomWallFinishDepths(room);
  const shape = room.planShape ?? room.shape ?? "rectangle";
  const points = getRoomPlanOutlinePoints({ shape, polygon: [...(room.planPolygon ?? room.polygon ?? [])], w: size.w, d: size.d });
  const outer = insetPolygonEdges(points, faceIds.map((faceId) => faceOffset + (depths[faceId] ?? 0)));
  // A hole's walls stand out of it into the room, so it grows by the offset (an imported room's holes have no panels).
  const holes = (room.planHoles ?? room.holes ?? []).filter((hole) => hole.length >= 3).map((hole) => {
    const roomSide = getOutlineInwardSign(hole) === 1 ? -1 : 1;
    return { points: insetPolygonEdges(hole, hole.map(() => faceOffset), roomSide), roomSide } as const;
  });
  const xs = outer.map(({ x }) => x), zs = outer.map(({ z }) => z);
  return {
    loops: [{ points: outer, roomSide: getOutlineInwardSign(points) }, ...holes],
    bounds: { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) },
  };
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
  return isInsideLoop(point, outer.points) && !holes.some((hole) => isInsideLoop(point, hole.points));
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

function distanceToFaces(outline: RoomFinishedOutline, point: RoomPlanPolygonPoint): number {
  let nearest = Infinity;
  forEachFace(outline, (a, b) => { nearest = Math.min(nearest, distanceToSegment(point, a, b)); });
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

/** How far a point stands past a face, out of the room, where it's level with the face (its foot falls on it). */
function reachPastFace(point: RoomPlanPolygonPoint, a: RoomPlanPolygonPoint, b: RoomPlanPolygonPoint, roomSide: 1 | -1): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  const along = length > 0 ? ((point.x - a.x) * dx + (point.z - a.z) * dz) / length : -1;
  if (along < 0 || along > length) return 0;
  return Math.max(0, -(((point.z - a.z) * dx - (point.x - a.x) * dz) / length) * roomSide);
}

/**
 * An item's footprint (an axis-aligned box in the room's plan) to the nearest finished face: the clear gap while it's inside,
 * and otherwise less than zero by the most it stands past a face: a corner out of the room, its far side past a wall it runs
 * across (a narrow notch or a courtyard it spans), or a wall's corner standing into it.
 */
export function getBoxGapToFinishedOutline(outline: RoomFinishedOutline, box: Box): number {
  const corners = boxCorners(box);
  let gap = Infinity, overlap = 0, crossed = false;
  forEachFace(outline, (a, b, roomSide) => {
    if (segmentTouchesBox(a, b, box)) {
      crossed = true;
      overlap = Math.max(overlap, depthInBox(a, box), depthInBox(b, box), ...corners.map((corner) => reachPastFace(corner, a, b, roomSide)));
      return;
    }
    gap = Math.min(gap, distanceToBox(a, box), distanceToBox(b, box), ...corners.map((corner) => distanceToSegment(corner, a, b)));
  });
  for (const corner of corners) {
    if (!isInside(outline, corner)) overlap = Math.max(overlap, distanceToFaces(outline, corner));
  }
  return crossed || overlap > 0 ? -overlap : gap;
}

/** A point's clearance to the nearest finished face, or null when it isn't inside them (in a notch, a hole or past a wall). */
export function getPointClearanceInFinishedOutline(outline: RoomFinishedOutline, point: RoomPlanPolygonPoint): number | null {
  return isInside(outline, point) ? distanceToFaces(outline, point) : null;
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
