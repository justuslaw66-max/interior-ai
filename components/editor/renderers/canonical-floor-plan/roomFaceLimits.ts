import type { CanonicalFloorPlanWallRenderModel, CanonicalFloorPlanWallSolid } from "@/lib/floor-plan-render-model";
import { getRoomWallFinishDepths, readPlanEdgeWallIds, type WallFinishRoom } from "@/lib/room-wall-finish-depths";
import { NO_FACE_TRIMS, wallSurfaceEdge, type FaceTrimsMm } from "./geometry";

/**
 * Where each of an imported room's faces starts and ends, so its finish stops at the room's own corners.
 *
 * A plan's wall footprints are joined at their vertices, and at a T-junction they run past the room's corner: the stem's face
 * to the through wall's far side, the through wall's face across the stem. So each face is cut first to the room's corner,
 * where it meets the room's next face (where they run straight on, at the vertex), and then, where two laminates meet at an
 * inside corner, the one on the wall whose id sorts later stops at the other's panel, as in a drawn room
 * (legacyWallSurfaceMiterOffset, house-plan-3d/geometry.ts). A straight wall meeting an arc stops at the arc's panel; the
 * arc itself, and a hole's walls, keep their footprint's ends.
 */

type PlanPoint = { x: number; z: number };
type Line = { point: PlanPoint; dir: PlanPoint };
type Edge = { wall: CanonicalFloorPlanWallRenderModel; centre: Line; face: Line };
/** A face's extent along its wall's centre line, in metres from the wall's start. */
type Limits = { lo: number; hi: number };
export type FaceLimitsRoom = WallFinishRoom & { x?: number; z?: number; planPosition?: PlanPoint };

const along = (line: Line, point: PlanPoint) => (point.x - line.point.x) * line.dir.x + (point.z - line.point.z) * line.dir.z;
const cross = (a: PlanPoint, b: PlanPoint) => a.x * b.z - a.z * b.x;

/** A straight wall's centre line and the room's face of it; none for an arc, or a wall the room has no side of. */
function edgeLines(wall: CanonicalFloorPlanWallRenderModel | undefined, roomId: string): Edge | null {
  const side = wall?.roomSides.find((entry) => entry.roomId === roomId)?.side;
  const first = wall?.centerlineSegments[0], last = wall?.centerlineSegments.at(-1);
  if (!wall || !side || wall.path.kind !== "line" || !first || !last) return null;
  const start = { x: first.start.xMm / 1000, z: first.start.zMm / 1000 };
  const length = Math.hypot(last.end.xMm / 1000 - start.x, last.end.zMm / 1000 - start.z) || 1;
  const dir = { x: (last.end.xMm / 1000 - start.x) / length, z: (last.end.zMm / 1000 - start.z) / length };
  const offset = (side * wall.thicknessMm) / 2000;
  return { wall, centre: { point: start, dir }, face: { point: { x: start.x - dir.z * offset, z: start.z + dir.x * offset }, dir } };
}

/** Where two faces meet: their lines' crossing, or the vertex on each where they run straight on. */
function cornerOn(face: Line, other: Line, vertex: PlanPoint): PlanPoint {
  const denominator = cross(face.dir, other.dir);
  if (Math.abs(denominator) < 1e-6) {
    const t = along(face, vertex);
    return { x: face.point.x + face.dir.x * t, z: face.point.z + face.dir.z * t };
  }
  const t = cross({ x: other.point.x - face.point.x, z: other.point.z - face.point.z }, other.dir) / denominator;
  return { x: face.point.x + face.dir.x * t, z: face.point.z + face.dir.z * t };
}

/** How far the panel on the wall that stops is cut back from the corner, clear of the other's across its own depth. */
function insideCornerCut(into: PlanPoint, out: PlanPoint, area: number, stoppingDepth: number, otherDepth: number): number {
  const lengths = (Math.hypot(into.x, into.z) * Math.hypot(out.x, out.z)) || 1;
  const turn = cross(into, out);
  const sine = Math.abs(turn) / lengths, cosine = -(into.x * out.x + into.z * out.z) / lengths;
  // Outside corners, and walls meeting within about 12 degrees of straight on, aren't cut.
  if (turn * area <= 0 || sine < 0.2 || stoppingDepth <= 0 || otherDepth <= 0) return 0;
  return (otherDepth + Math.max(0, cosine) * stoppingDepth) / sine;
}

/** An arc's face where it meets a straight wall: the face of its slice at that end, as a line. */
function arcFaceAt(wall: CanonicalFloorPlanWallRenderModel | undefined, roomId: string, vertex: PlanPoint): Line | null {
  const side = wall?.roomSides.find((entry) => entry.roomId === roomId)?.side;
  const first = wall?.centerlineSegments[0], last = wall?.centerlineSegments.at(-1);
  if (!wall || !side || wall.path.kind !== "arc" || !first || !last || !wall.solids.length) return null;
  const near = (point: { xMm: number; zMm: number }) => Math.hypot(point.xMm / 1000 - vertex.x, point.zMm / 1000 - vertex.z);
  const atStart = near(first.start) <= near(last.end);
  const solid = wall.solids.reduce((best, entry) =>
    (atStart ? entry.startOffsetMm < best.startOffsetMm : entry.endOffsetMm > best.endOffsetMm) ? entry : best);
  const edge = wallSurfaceEdge(solid, side, 0);
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z) || 1;
  return { point: edge.start, dir: { x: (edge.end.x - edge.start.x) / length, z: (edge.end.z - edge.start.z) / length } };
}

type Corner = { vertex: PlanPoint; previous: PlanPoint; next: PlanPoint; area: number };

/** Sets a straight face's limit at a corner: where it meets the other face, moved back by `cut` when it is the one that stops. */
function limitAtCorner(limits: Limits, line: Edge, other: Line, corner: Corner, far: PlanPoint, cut: number): void {
  const at = along(line.centre, cornerOn(line.face, other, corner.vertex));
  const away = Math.sign(along(line.centre, far) - at) || 1;
  if (away > 0) limits.lo = Math.max(limits.lo, at + cut);
  else limits.hi = Math.min(limits.hi, at - cut);
}

/** Cuts the two faces meeting at outline vertex `index` to the room's corner, and the one that stops back from it. */
function limitCorner(
  index: number, corner: Corner, edges: readonly string[], lines: readonly (Edge | null)[], ends: Limits[],
  depthOf: (edge: number) => number, wallById: Map<string, CanonicalFloorPlanWallRenderModel>, roomId: string
): void {
  const before = (index - 1 + edges.length) % edges.length;
  if (edges[before] === edges[index]) return;
  const [incoming, outgoing] = [lines[before], lines[index]];
  const inFace = incoming?.face ?? arcFaceAt(wallById.get(edges[before]), roomId, corner.vertex);
  const outFace = outgoing?.face ?? arcFaceAt(wallById.get(edges[index]), roomId, corner.vertex);
  if (!inFace || !outFace) return;
  // Of two straight walls the later id stops, as in a drawn room; a straight wall always stops at an arc, which isn't cut.
  const outgoingStops = !incoming || (Boolean(outgoing) && edges[index] > edges[before]);
  const into = { x: corner.vertex.x - corner.previous.x, z: corner.vertex.z - corner.previous.z };
  const out = { x: corner.next.x - corner.vertex.x, z: corner.next.z - corner.vertex.z };
  const [stopping, other] = outgoingStops ? [index, before] : [before, index];
  const cut = insideCornerCut(into, out, corner.area, depthOf(stopping), depthOf(other));
  if (incoming) limitAtCorner(ends[before], incoming, outFace, corner, corner.previous, outgoingStops ? 0 : cut);
  if (outgoing) limitAtCorner(ends[index], outgoing, inFace, corner, corner.next, outgoingStops ? cut : 0);
}

const limitsByEdges = new WeakMap<readonly string[], { outline: unknown; walls: unknown; depths: unknown; limits: Map<string, Limits> }>();

function getRoomFaceLimits(room: FaceLimitsRoom, walls: readonly CanonicalFloorPlanWallRenderModel[]): Map<string, Limits> | null {
  const edges = readPlanEdgeWallIds(room);
  const outline = room.planPolygon ?? room.polygon;
  if (!edges || !outline) return null;
  const depths = getRoomWallFinishDepths(room);
  const known = limitsByEdges.get(edges);
  if (known && known.outline === outline && known.walls === walls && known.depths === depths) return known.limits;
  const origin = room.planPosition ?? { x: room.x ?? 0, z: room.z ?? 0 };
  const vertices = outline.map(({ x, z }) => ({ x: x + origin.x, z: z + origin.z }));
  const area = vertices.reduce((sum, point, index) => sum + cross(point, vertices[(index + 1) % vertices.length]), 0);
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const lines = edges.map((wallId) => edgeLines(wallById.get(wallId), room.id));
  const ends: Limits[] = edges.map(() => ({ lo: -Infinity, hi: Infinity }));
  const depthOf = (edge: number) => depths[`wall-${edge}`] ?? 0;
  vertices.forEach((vertex, index) => {
    const corner = { vertex, area, previous: vertices[(index - 1 + vertices.length) % vertices.length], next: vertices[(index + 1) % vertices.length] };
    limitCorner(index, corner, edges, lines, ends, depthOf, wallById, room.id);
  });
  const limits = new Map<string, Limits>();
  edges.forEach((wallId, index) => {
    if (lines[index] && edges.indexOf(wallId) === edges.lastIndexOf(wallId)) limits.set(wallId, ends[index]);
  });
  limitsByEdges.set(edges, { outline, walls, depths, limits });
  return limits;
}

/**
 * How far a slice's finish stops short of each end of its face, in millimetres: to the room's corner, and back from it where
 * it stops at another laminate. Nothing for a wall the room isn't measured to (a hole's) or an arc.
 */
export function getCanonicalFaceTrimsMm(
  room: FaceLimitsRoom, walls: readonly CanonicalFloorPlanWallRenderModel[],
  wall: Pick<CanonicalFloorPlanWallRenderModel, "id">, solid: CanonicalFloorPlanWallSolid, side: 1 | -1
): FaceTrimsMm {
  const limits = getRoomFaceLimits(room, walls)?.get(wall.id);
  const line = limits && edgeLines(walls.find(({ id }) => id === wall.id), room.id);
  if (!limits || !line) return NO_FACE_TRIMS;
  const edge = wallSurfaceEdge(solid, side, 0);
  const [from, to] = [along(line.centre, edge.start), along(line.centre, edge.end)];
  // The face runs with the wall on side 1 and against it on side -1 (wallSurfaceEdge).
  const startMm = (from <= to ? limits.lo - from : from - limits.hi) * 1000;
  const endMm = (from <= to ? to - limits.hi : limits.lo - to) * 1000;
  return startMm <= 0 && endMm <= 0 ? NO_FACE_TRIMS : { startMm: Math.max(0, startMm), endMm: Math.max(0, endMm) };
}
