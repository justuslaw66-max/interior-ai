import { getFurnitureWallInset, isPointInsideRoomPolygon } from "@/lib/design-page-geometry";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import {
  clampToRoomInsideFinishes,
  getBuiltInWallInset,
  getRoomPlanOutlinePoints,
} from "@/lib/room-finished-outline";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";

/**
 * Where a built-in cabinet may stand in a drawn room: inside its walls' finished faces (J, 29 Oct 2026: "Face, back flush").
 * Each edge of the room's outline (the wall centre line) has its own face, half the wall and its laminate panel in from it.
 * Faces meet where their lines cross; where two edges run straight on with different panels, the faces step. A built-in may
 * touch a face, but not cross it. A room from an imported plan keeps furniture's rule for now: its walls each have their own
 * thickness, which its room doesn't carry (the plan's walls do), and they can be angled or curved.
 */

type Point = RoomPlanPolygonPoint;

/** A corner under 90° at one end of a face: its sine and cotangent. */
export type AcuteCorner = { sin: number; cot: number };

/** One outline edge's face, with the corner under 90° at either end, if any. A dropped edge's face has no length. */
export type BuiltInFaceEdge = { start: Point; end: Point; startAcute: AcuteCorner | null; endAcute: AcuteCorner | null };

export type BuiltInRoomFaces = {
  /** The outline, room-local, in face order (getRoomWallFaceIds). */
  outline: Point[];
  faceIds: string[];
  /** How far each edge's face stands in from it: half the wall, and its panel. */
  insets: number[];
  edges: BuiltInFaceEdge[];
  /** The faces as one outline, stepping where two straight-on faces stand at different depths. */
  polygon: Point[];
  holes: Point[][];
};

/** How far a built-in may reach into a face and still count as against it, in metres; the clamp keeps most of it in hand. */
export const BUILT_IN_CONTACT_TOLERANCE = 0.0005;

/** True for a room from an imported plan: only the import sets its exact floor elevation. */
export function isImportedPlanRoom(room: { floorElevationMm?: number }): boolean {
  return typeof room.floorElevationMm === "number";
}

type FaceLine = { x: number; z: number; dx: number; dz: number; nx: number; nz: number };

function faceLine(outline: readonly Point[], index: number, inset: number, inwardSign: number): FaceLine {
  const start = outline[index], end = outline[(index + 1) % outline.length];
  const length = Math.hypot(end.x - start.x, end.z - start.z) || 1;
  const dx = (end.x - start.x) / length, dz = (end.z - start.z) / length;
  const nx = -dz * inwardSign, nz = dx * inwardSign;
  return { x: start.x + nx * inset, z: start.z + nz * inset, dx, dz, nx, nz };
}

type Joint = { end: Point; start: Point; corner: boolean; acute: AcuteCorner | null };

/** A bend under this is drawn straight on: its faces step between their depths (as the room checks' outline does). */
const STRAIGHT_ON_BEND_COS = Math.cos((10 * Math.PI) / 180);
/** How far a corner of the faces may sit from its outline vertex, per metre of the deeper face: past it, the faces step. */
const MAX_CORNER_REACH_PER_INSET = 1 / Math.sin((5 * Math.PI) / 180);

/** Where face `before` (whose edge ends at `beforeEnd`) ends and face `after` (whose edge starts at `afterStart`) starts. */
function joinFaces(beforeEnd: Point, afterStart: Point, before: FaceLine, after: FaceLine, insetBefore: number, insetAfter: number): Joint {
  const cross = before.dx * after.dz - before.dz * after.dx;
  // Straight on, or bent under 10° (a hand-drawn wall, a millimetre off): each face stops at its edge's end, and the faces step
  // between their depths. Joined where their lines cross, faces of different depths met far along the wall.
  const step = (): Joint => ({
    end: { x: beforeEnd.x + before.nx * insetBefore, z: beforeEnd.z + before.nz * insetBefore },
    start: { x: afterStart.x + after.nx * insetAfter, z: afterStart.z + after.nz * insetAfter }, corner: false, acute: null,
  });
  if (Math.abs(cross) < 1e-9 || before.dx * after.dx + before.dz * after.dz > STRAIGHT_ON_BEND_COS) return step();
  const t = ((after.x - before.x) * after.dz - (after.z - before.z) * after.dx) / cross;
  const point = { x: before.x + before.dx * t, z: before.z + before.dz * t };
  const reach = Math.max(Math.hypot(point.x - beforeEnd.x, point.z - beforeEnd.z), Math.hypot(point.x - afterStart.x, point.z - afterStart.z));
  if (reach > Math.max(insetBefore, insetAfter) * MAX_CORNER_REACH_PER_INSET) return step();
  // A convex corner (the next face turns into the room) under 90°: a run's front corner reaches the other face before its end.
  const cos = -(before.dx * after.dx + before.dz * after.dz);
  const convex = after.dx * before.nx + after.dz * before.nz > 1e-9;
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  return { end: point, start: point, corner: true, acute: convex && cos > 1e-9 && sin > 1e-9 ? { sin, cot: cos / sin } : null };
}

function signedArea(points: readonly Point[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

/** The joint at the start of each kept edge (in the order kept), from the kept edge before it. */
function joinKeptFaces(outline: readonly Point[], lines: FaceLine[], insets: number[], kept: number[]): Joint[] {
  return kept.map((index, order) => {
    const previous = kept[(order - 1 + kept.length) % kept.length];
    return joinFaces(outline[(previous + 1) % outline.length], outline[index], lines[previous], lines[index], insets[previous], insets[index]);
  });
}

/** The edges kept for faces: those with a length, less any zero-area spike (an edge drawn out and straight back). */
function keptEdges(outline: readonly Point[], lines: FaceLine[]): number[] {
  const count = outline.length;
  const length = (index: number) => Math.hypot(outline[(index + 1) % count].x - outline[index].x, outline[(index + 1) % count].z - outline[index].z);
  const kept = outline.map((_, index) => index).filter((index) => length(index) > 1e-6);
  const spikes = new Set<number>();
  kept.forEach((index, order) => {
    const next = kept[(order + 1) % kept.length];
    if (lines[index].dx * lines[next].dx + lines[index].dz * lines[next].dz < -0.9998) spikes.add(index).add(next);
  });
  return kept.filter((index) => !spikes.has(index));
}

/**
 * Each edge's face, joined to its neighbours'. An edge whose face would run backwards (an edge shorter than its face is deep,
 * such as a 10 mm chamfer at a corner) is dropped and its neighbours joined past it, until none is: otherwise they ran past
 * each other's faces. With fewer than three faces left (a room narrower than its walls) there are none.
 */
function buildFaceEdges(outline: readonly Point[], insets: number[]) {
  const count = outline.length, sign = signedArea(outline) >= 0 ? 1 : -1;
  const lines = outline.map((_, index) => faceLine(outline, index, insets[index], sign));
  const none: { edges: BuiltInFaceEdge[]; polygon: Point[] } = { edges: outline.map(() => ({ start: outline[0], end: outline[0], startAcute: null, endAcute: null })), polygon: [] };
  let kept = keptEdges(outline, lines);
  if (kept.length < 3) return none;
  let joints = joinKeptFaces(outline, lines, insets, kept);
  const runsOn = (order: number) => {
    const start = joints[order].start, end = joints[(order + 1) % kept.length].end, line = lines[kept[order]];
    return (end.x - start.x) * line.dx + (end.z - start.z) * line.dz > 1e-6;
  };
  for (let round = 0; round <= count; round += 1) {
    const next = kept.filter((_, order) => runsOn(order));
    if (next.length === kept.length) break;
    if (next.length < 3) return none;
    kept = next;
    joints = joinKeptFaces(outline, lines, insets, kept);
  }
  const edges: BuiltInFaceEdge[] = outline.map((_, index) => {
    const order = kept.indexOf(index);
    const nextOrder = order >= 0 ? (order + 1) % kept.length : Math.max(0, kept.findIndex((other) => other > index));
    const end = joints[nextOrder].end;
    if (order < 0) return { start: end, end, startAcute: null, endAcute: null };
    return { start: joints[order].start, end, startAcute: joints[order].acute, endAcute: joints[nextOrder].acute };
  });
  const polygon = joints.flatMap((joint) =>
    joint.corner || Math.hypot(joint.end.x - joint.start.x, joint.end.z - joint.start.z) < 1e-9 ? [joint.start] : [joint.end, joint.start]);
  return { edges, polygon };
}

function buildRoomBuiltInFaces(room: RoomSnapshot, size: { w: number; d: number }): BuiltInRoomFaces {
  const shape = room.planShape ?? "rectangle";
  const outline = getRoomPlanOutlinePoints({ shape, polygon: room.planPolygon, w: size.w, d: size.d });
  const faceIds = getRoomWallFaceIds({ shape, polygon: room.planPolygon });
  const depths = getRoomWallFinishDepths(room);
  const halfWall = getBuiltInWallInset(room.geometry.wallThickness);
  const insets = faceIds.map((faceId) => halfWall + (depths[faceId] ?? 0));
  return { outline, faceIds, insets, ...buildFaceEdges(outline, insets), holes: room.planHoles ?? [] };
}

type FacesInputs = Pick<RoomSnapshot, "planShape" | "planPolygon" | "planHoles" | "surfaces" | "surfaceFinishes"> & { w: number; d: number; wall?: number };

// One set of faces per room outline, walls and surfaces: containment runs on every frame of a drag, and a move or turn gives the
// room a new snapshot but keeps its geometry, outline and surfaces.
const facesByGeometry = new WeakMap<RoomSnapshot["geometry"], { inputs: FacesInputs; faces: BuiltInRoomFaces }>();

function isSameInputs(a: FacesInputs, b: FacesInputs): boolean {
  return a.planShape === b.planShape && a.planPolygon === b.planPolygon && a.planHoles === b.planHoles &&
    a.surfaces === b.surfaces && a.surfaceFinishes === b.surfaceFinishes && a.w === b.w && a.d === b.d && a.wall === b.wall;
}

/** The room's finished faces; `size` is the drawn size of its rectangle or L-shape when it isn't the room's own. */
export function getRoomBuiltInFaces(
  room: RoomSnapshot,
  size: { w: number; d: number } = { w: room.geometry.width, d: room.geometry.depth }
): BuiltInRoomFaces {
  const inputs: FacesInputs = {
    planShape: room.planShape, planPolygon: room.planPolygon, planHoles: room.planHoles, surfaces: room.surfaces,
    surfaceFinishes: room.surfaceFinishes, w: size.w, d: size.d, wall: room.geometry.wallThickness,
  };
  const known = facesByGeometry.get(room.geometry);
  if (known && isSameInputs(known.inputs, inputs)) return known.faces;
  const faces = buildRoomBuiltInFaces(room, size);
  facesByGeometry.set(room.geometry, { inputs, faces });
  return faces;
}

function distanceToSegment(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x, dz = end.z - start.z;
  const lengthSq = dx * dx + dz * dz;
  const t = lengthSq > 0 ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSq)) : 0;
  return Math.hypot(point.x - (start.x + dx * t), point.z - (start.z + dz * t));
}

/** True when the segments cross at a point inside both (touching ends don't count). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

function edgesCross(polygon: readonly Point[], corners: Point[]): boolean {
  return polygon.some((start, index) => corners.some((corner, cornerIndex) =>
    segmentsCross(start, polygon[(index + 1) % polygon.length], corner, corners[(cornerIndex + 1) % corners.length])));
}

/**
 * True when a built-in `width` × `depth` metres, centred at (x, z) and turned `rotationY`, stands inside the faces: its real
 * (turned) footprint, so an angled wall doesn't count against a run beside it. It may reach `tolerance` into a face.
 */
export function builtInFootprintFits(
  faces: BuiltInRoomFaces, x: number, z: number, width: number, depth: number, rotationY: number,
  tolerance = BUILT_IN_CONTACT_TOLERANCE
): boolean {
  const halfWidth = Math.max(0, width / 2 - tolerance), halfDepth = Math.max(0, depth / 2 - tolerance);
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
  const corners = [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]]
    .map(([along, across]) => ({ x: x + along * cos + across * sin, z: z - along * sin + across * cos }));
  const isInsideRectangle = (point: Point) => {
    const dx = point.x - x, dz = point.z - z;
    return Math.abs(dx * cos - dz * sin) < halfWidth && Math.abs(dx * sin + dz * cos) < halfDepth;
  };
  if (!corners.every((corner) => isPointInsideRoomPolygon(corner, faces.polygon))) return false;
  if (faces.polygon.some(isInsideRectangle) || edgesCross(faces.polygon, corners)) return false;
  return !faces.holes.some((hole) => hole.length >= 3 && (hole.some(isInsideRectangle) || edgesCross(hole, corners)
    || corners.some((corner) => isPointInsideRoomPolygon(corner, hole))));
}

/**
 * True when the face of edge `index` is part of the room: just in front of its middle there is no other wall. A nib narrower
 * than the walls around it has its walls' faces inside each other's, so it has none.
 */
export function isBuiltInFaceInRoom(faces: BuiltInRoomFaces, index: number): boolean {
  const { outline, insets } = faces;
  const { start, end } = faces.edges[index];
  const edgeStart = outline[index], edgeEnd = outline[(index + 1) % outline.length];
  const length = Math.hypot(edgeEnd.x - edgeStart.x, edgeEnd.z - edgeStart.z) || 1;
  const dx = (edgeEnd.x - edgeStart.x) / length, dz = (edgeEnd.z - edgeStart.z) / length;
  if ((end.x - start.x) * dx + (end.z - start.z) * dz <= 0) return false; // Its face runs backwards.
  // The face's middle, 1 mm into the room (from the centre line towards the face).
  const middle = { x: (start.x + end.x) / 2, z: (start.z + end.z) / 2 };
  const edgeMiddle = { x: (edgeStart.x + edgeEnd.x) / 2, z: (edgeStart.z + edgeEnd.z) / 2 };
  const inward = (middle.x - edgeMiddle.x) * -dz + (middle.z - edgeMiddle.z) * dx >= 0 ? 1 : -1;
  const probe = { x: middle.x - dz * inward * 0.001, z: middle.z + dx * inward * 0.001 };
  return outline.every((point, other) =>
    distanceToSegment(probe, point, outline[(other + 1) % outline.length]) >= insets[other] - BUILT_IN_CONTACT_TOLERANCE);
}

/** Furniture's clamp (half the wall plus 2 cm, inside each panel), as built-ins in an imported plan's rooms keep for now. */
function clampAsFurniture(room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY: number): [number, number] {
  return clampToRoomInsideFinishes(
    x, z, width, depth, room.geometry.width, room.geometry.depth, getFurnitureWallInset(room.geometry.wallThickness ?? 0.12),
    rotationY, room.planShape ?? "rectangle", room.planPolygon, room.planHoles, getRoomWallFinishDepths(room)
  );
}

/**
 * A built-in kept inside its room's finished faces, its back allowed against a face. Where its real (turned) footprint already
 * fits, it stays put, as Fit to Space places it. A move that would leave the faces stops where it still fits, going from
 * `from`. Otherwise it is clamped with half the wall, by the box test furniture uses. An imported plan's room keeps furniture's
 * clamp.
 */
export function clampBuiltInToRoom(
  room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY = 0,
  options: { from?: readonly [number, number] } = {}
): [number, number] {
  if (isImportedPlanRoom(room)) return clampAsFurniture(room, x, z, width, depth, rotationY);
  const faces = getRoomBuiltInFaces(room);
  // A tenth of the contact tolerance: a move stops within 0.05 mm of a face, and containment (0.5 mm) keeps it.
  const fits = (atX: number, atZ: number) =>
    builtInFootprintFits(faces, atX, atZ, width, depth, rotationY, BUILT_IN_CONTACT_TOLERANCE / 10);
  if (fits(x, z)) return [x, z];
  const from = options.from;
  if (from && fits(from[0], from[1])) {
    let reach = 0, beyond = 1;
    for (let step = 0; step < 24; step += 1) {
      const middle = (reach + beyond) / 2;
      if (fits(from[0] + (x - from[0]) * middle, from[1] + (z - from[1]) * middle)) reach = middle;
      else beyond = middle;
    }
    return [from[0] + (x - from[0]) * reach, from[1] + (z - from[1]) * reach];
  }
  return clampToRoomInsideFinishes(
    x, z, width, depth, room.geometry.width, room.geometry.depth, getBuiltInWallInset(room.geometry.wallThickness),
    rotationY, room.planShape ?? "rectangle", room.planPolygon, room.planHoles, getRoomWallFinishDepths(room)
  );
}

/**
 * Where Snap to wall sends a built-in: to the nearest side of its room's faces along x or z (the move then stops at the first
 * face it meets). An imported plan's room snaps as furniture does, half the wall plus 2 cm in from its rectangle.
 */
export function getBuiltInSnapTarget(
  room: RoomSnapshot, position: readonly [number, number, number], width: number, depth: number, rotationY: number
): [number, number] {
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(width, depth, rotationY);
  const faces = isImportedPlanRoom(room) ? [] : getRoomBuiltInFaces(room).polygon;
  // An imported plan's room, or one with no faces, snaps half the wall plus 2 cm in from its rectangle, as furniture does.
  const inset = getFurnitureWallInset(room.geometry.wallThickness ?? 0.12);
  const points = faces.length ? faces
    : [{ x: -room.geometry.width / 2 + inset, z: -room.geometry.depth / 2 + inset }, { x: room.geometry.width / 2 - inset, z: room.geometry.depth / 2 - inset }];
  const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
  const [x, , z] = position;
  const candidates: Array<[number, number]> = [
    [Math.min(...xs) + effectiveWidth / 2, z], [Math.max(...xs) - effectiveWidth / 2, z],
    [x, Math.min(...zs) + effectiveDepth / 2], [x, Math.max(...zs) - effectiveDepth / 2],
  ];
  return candidates.reduce((best, candidate) =>
    Math.hypot(candidate[0] - x, candidate[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? candidate : best);
}
