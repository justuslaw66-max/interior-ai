import type { CanonicalFloorPlanWallRenderModel, CanonicalFloorPlanWallSolid } from "@/lib/floor-plan-render-model";
import { getRoomWallPanelDepths, readPlanEdgeWallIds, type RoomWallFinishDepths, type WallFinishRoom } from "@/lib/room-wall-finish-depths";
import { NO_FACE_TRIMS, WALL_FINISH_SKIN_MM, wallSurfaceEdge, type FaceTrimsMm } from "./geometry";

/**
 * Where each of an imported room's faces starts and ends, so its finish stops exactly at the room's own corners.
 *
 * A plan's wall footprints are joined at their vertices, and at a T-junction or a sharp corner they run past the room's
 * corner. So each face of the room (a straight wall, or an arc's run of edges) ends at each corner of the room's outline on a
 * line through where its bare face and its front stop, found from the faces' own lines (an arc's is the polyline of its
 * slices, so a straight wall meeting it stops where it really meets it):
 * - within 10 degrees of straight on (the signed turn: a fold-back is a corner), both stop on the mitre through the vertex;
 * - at an inside corner the face on the wall whose id sorts later, or a straight wall meeting an arc, stops where the other
 *   panel's front meets it, as in a drawn room (legacyWallSurfaceMiterOffset, house-plan-3d/geometry.ts), and the other runs
 *   on to its bare face; while the other is cut away for the camera, it runs to the corner instead;
 * - at an outside corner both meet on the mitre from where their bare faces cross to where their fronts do.
 * A crossing counts within the two faces' own lengths along the outline (on each, no farther back than its own length nor
 * farther past the vertex than the other's); outside them the face ends square at the vertex. Between an arc's slices the
 * finish follows the footprints' mitred joints. A hole's walls, and a wall the room meets twice, keep their footprint's ends.
 */

type Wall = CanonicalFloorPlanWallRenderModel;
type Solid = CanonicalFloorPlanWallSolid;
type PlanPoint = { x: number; z: number };
type Line = { point: PlanPoint; dir: PlanPoint };
/** Where a face stops: the line through its bare and front ends. */
type Cut = { line: Line };
/** A face's end at a room corner; while wall `by` is cut away for the camera, `cutAway` instead. */
type FaceEnd = Cut & { atWallStart: boolean; by?: string; cutAway?: Cut };
/** A face's bare line and its front, as polylines from one end, and its length along the room's outline. */
type FacePaths = { bare: PlanPoint[]; front: PlanPoint[]; length: number };
/** Another wall's slice, in plan, which a face stops at where it runs into it (a T-junction's stem poking through, say). */
type Footprint = { points: PlanPoint[]; bottomMm: number; topMm: number };
type Face = FacePaths & {
  wall: Wall; side: 1 | -1; arc: boolean; depth: number; firstAtWallStart: boolean;
  firstMm: number; lastMm: number; ends: FaceEnd[]; others: Footprint[];
};
type Crossing = { point: PlanPoint; sA: number; sB: number };
export type FaceLimitsRoom = WallFinishRoom & { x?: number; z?: number; planPosition?: PlanPoint };

const STRAIGHT_ON = (10 * Math.PI) / 180;
const FAR = 1000; // metres: a ray past a path's end
const sub = (a: PlanPoint, b: PlanPoint) => ({ x: a.x - b.x, z: a.z - b.z });
const cross = (a: PlanPoint, b: PlanPoint) => a.x * b.z - a.z * b.x;
const dot = (a: PlanPoint, b: PlanPoint) => a.x * b.x + a.z * b.z;
const unit = (v: PlanPoint) => { const length = Math.hypot(v.x, v.z) || 1; return { x: v.x / length, z: v.z / length }; };
const metres = (point: { xMm: number; zMm: number }) => ({ x: point.xMm / 1000, z: point.zMm / 1000 });
const sideOf = (wall: Wall | undefined, roomId: string) => wall?.roomSides.find((entry) => entry.roomId === roomId)?.side;

/** The polyline moved `offset` along its left normal (-dz, dx), with mitred joints. */
function offsetPolyline(points: readonly PlanPoint[], offset: number): PlanPoint[] {
  const normals = points.slice(1).map((point, index) => { const d = unit(sub(point, points[index])); return { x: -d.z, z: d.x }; });
  return points.map((point, index) => {
    const before = normals[Math.max(0, index - 1)], after = normals[Math.min(normals.length - 1, index)];
    const scale = offset / (1 + dot(before, after) || 1);
    return { x: point.x + (before.x + after.x) * scale, z: point.z + (before.z + after.z) * scale };
  });
}

/** The path with a ray past each end, and each point's distance along it from its first point (negative before it). */
function extended(points: readonly PlanPoint[]): { points: PlanPoint[]; at: number[] } {
  const before = unit(sub(points[0], points[1])), after = unit(sub(points[points.length - 1], points[points.length - 2]));
  const all = [{ x: points[0].x + before.x * FAR, z: points[0].z + before.z * FAR }, ...points,
    { x: points[points.length - 1].x + after.x * FAR, z: points[points.length - 1].z + after.z * FAR }];
  const at = [-FAR, 0];
  for (let index = 2; index < all.length; index += 1) at.push(at[index - 1] + Math.hypot(...Object.values(sub(all[index], all[index - 1]))));
  return { points: all, at };
}

/** Where two paths from a corner cross, nearest it: the point, and how far along each path from the corner (negative past it). */
function crossing(a: readonly PlanPoint[], b: readonly PlanPoint[]): Crossing | null {
  const [pathA, pathB] = [extended(a), extended(b)];
  let best: Crossing | null = null;
  for (let i = 0; i + 1 < pathA.points.length; i += 1) {
    const [p, r] = [pathA.points[i], sub(pathA.points[i + 1], pathA.points[i])];
    for (let j = 0; j + 1 < pathB.points.length; j += 1) {
      const [q, s] = [pathB.points[j], sub(pathB.points[j + 1], pathB.points[j])];
      const denominator = cross(r, s);
      if (Math.abs(denominator) < 1e-15) continue;
      const t = cross(sub(q, p), s) / denominator, u = cross(sub(q, p), r) / denominator;
      if (t < 0 || t > 1 || u < 0 || u > 1) continue;
      const sA = pathA.at[i] + t * (pathA.at[i + 1] - pathA.at[i]), sB = pathB.at[j] + u * (pathB.at[j + 1] - pathB.at[j]);
      if (!best || Math.abs(sA) + Math.abs(sB) < Math.abs(best.sA) + Math.abs(best.sB)) best = { point: { x: p.x + r.x * t, z: p.z + r.z * t }, sA, sB };
    }
  }
  return best;
}

/** A crossing counts within the two faces' lengths: on each, no farther back than its own nor farther past the vertex than the other's. */
const within = (found: Crossing | null, a: { length: number }, b: { length: number }): found is Crossing =>
  Boolean(found && found.sA >= -b.length && found.sA <= a.length && found.sB >= -a.length && found.sB <= b.length);

const cutThrough = (bareEnd: PlanPoint, frontEnd: PlanPoint): Cut => ({ line: { point: bareEnd, dir: unit(sub(frontEnd, bareEnd)) } });
/** Square across the face where it meets the vertex. */
const squareCut = (paths: FacePaths) => cutThrough(paths.bare[0], paths.front[0]);
const reversedPaths = (face: Face): FacePaths => ({ bare: [...face.bare].reverse(), front: [...face.front].reverse(), length: face.length });

/** The two faces' cuts at a corner: [the incoming face's, the outgoing face's], and the cut-away cut of the one that stops. */
function cornerCuts(
  vertex: PlanPoint, turn: number, area: number, incoming: Face, outgoing: Face
): [Cut & { by?: string; cutAway?: Cut }, Cut & { by?: string; cutAway?: Cut }] {
  const [p, n] = [reversedPaths(incoming), outgoing];
  if (Math.abs(turn) < STRAIGHT_ON) {
    const before = unit(sub(p.bare[0], p.bare[1])), after = unit(sub(n.bare[1], n.bare[0]));
    const mean = unit({ x: before.x + after.x, z: before.z + after.z });
    const mitre = { line: { point: vertex, dir: { x: -mean.z, z: mean.x } } };
    return [mitre, mitre];
  }
  if (turn * area < 0) {
    // An outside corner's walls end square at the vertex unless their footprints meet where their faces cross.
    const bare = crossing(p.bare, n.bare), front = crossing(p.front, n.front);
    const joined = within(bare, p, n) && within(front, p, n) && meetsAt(incoming, bare.point) && meetsAt(outgoing, bare.point);
    if (!joined) return [squareCut(p), squareCut(n)];
    return [cutThrough(bare.point, front.point), cutThrough(bare.point, front.point)];
  }
  const outgoingStops = incoming.arc !== outgoing.arc ? incoming.arc : outgoing.wall.id > incoming.wall.id;
  const [stopping, running, other] = outgoingStops ? [n, p, incoming] : [p, n, outgoing];
  const stop = insideCornerCuts(stopping, running, other.wall.id);
  return outgoingStops ? [stop.running, stop.stopping] : [stop.stopping, stop.running];
}

/** Whether the face's wall stands on the floor at its end at the wall's start (or end): no door or opening there. */
function standsAtCorner(face: Face, atWallStart: boolean): boolean {
  return face.wall.solids.some((solid) => solid.bottomMm <= face.wall.baseOffsetMm + 0.5
    && (atWallStart ? solid.startOffsetMm <= face.firstMm + 0.5 : solid.endOffsetMm >= face.lastMm - 0.5));
}

/** Whether the face's wall footprint has a corner on the face's side at `point` (within a millimetre). */
function meetsAt(face: Face, point: PlanPoint): boolean {
  return face.wall.solids.some(({ footprint }) => (face.side === 1 ? [footprint.startLeft, footprint.endLeft] : [footprint.startRight, footprint.endRight])
    .some((corner) => Math.hypot(corner.xMm / 1000 - point.x, corner.zMm / 1000 - point.z) < 0.001));
}

/** An inside corner: the stopping face ends at the running one's front, which runs on to the stopping one's bare face. */
function insideCornerCuts(stopping: FacePaths, running: FacePaths, runningWallId: string) {
  const atFront = crossing(stopping.bare, running.front), frontAtFront = crossing(stopping.front, running.front);
  const bare = crossing(stopping.bare, running.bare), runningFront = crossing(running.front, stopping.bare);
  const frontAtBare = crossing(stopping.front, running.bare);
  const corner = within(bare, stopping, running) && within(frontAtBare, stopping, running)
    ? cutThrough(bare.point, frontAtBare.point) : squareCut(stopping);
  const stop = within(atFront, stopping, running) && within(frontAtFront, stopping, running)
    ? cutThrough(atFront.point, frontAtFront.point) : squareCut(stopping);
  const run = within(bare, stopping, running) && within(runningFront, running, stopping)
    ? cutThrough(bare.point, runningFront.point) : squareCut(running);
  return { stopping: { ...stop, by: runningWallId, cutAway: corner }, running: run };
}

type Run = { wallId: string; from: number; count: number };

/** The outline's edges grouped into faces: each run of consecutive edges on one wall (an arc's several). */
function faceRuns(edges: readonly string[]): Run[] {
  const count = edges.length;
  const start = edges.findIndex((id, index) => id !== edges[(index - 1 + count) % count]);
  const runs: Run[] = [];
  for (let step = 0; start >= 0 && step < count; step += 1) {
    const index = (start + step) % count;
    if (step === 0 || edges[index] !== edges[(index - 1 + count) % count]) runs.push({ wallId: edges[index], from: index, count: 1 });
    else runs[runs.length - 1].count += 1;
  }
  return runs;
}

function buildFace(run: Run, vertices: readonly PlanPoint[], wall: Wall | undefined, roomId: string, depth: number): Face | null {
  const side = sideOf(wall, roomId);
  const segments = wall?.centerlineSegments ?? [];
  if (!wall || !side || !segments.length || !wall.solids.length) return null;
  const centre = [metres(segments[0].start), ...segments.map((segment) => metres(segment.end))];
  const first = vertices[run.from];
  const reversed = Math.hypot(...Object.values(sub(first, centre[0]))) > Math.hypot(...Object.values(sub(first, centre[centre.length - 1])));
  const along = (offset: number) => { const line = offsetPolyline(centre, side * offset); return reversed ? line.reverse() : line; };
  let length = 0;
  for (let step = 0; step < run.count; step += 1) {
    const [from, to] = [vertices[(run.from + step) % vertices.length], vertices[(run.from + step + 1) % vertices.length]];
    length += Math.hypot(to.x - from.x, to.z - from.z);
  }
  const half = wall.thicknessMm / 2000;
  return {
    wall, side, arc: wall.path.kind === "arc", depth, length, bare: along(half), front: along(half + depth), firstAtWallStart: !reversed,
    firstMm: Math.min(...wall.solids.map((solid) => solid.startOffsetMm)), lastMm: Math.max(...wall.solids.map((solid) => solid.endOffsetMm)),
    ends: [], others: [],
  };
}

/** A face's drawn depth in metres: its laminate's (the deepest along an arc's run), else the skin's. */
function drawnDepth(depths: RoomWallFinishDepths, run: Run, count: number): number {
  let deepest = 0;
  for (let step = 0; step < run.count; step += 1) deepest = Math.max(deepest, depths[`wall-${(run.from + step) % count}`] ?? 0);
  return deepest > 0 ? deepest : WALL_FINISH_SKIN_MM / 1000;
}

const facesByEdges = new WeakMap<readonly string[], { outline: unknown; walls: unknown; depths: unknown; faces: Map<string, Face> }>();

function getRoomFaces(room: FaceLimitsRoom, walls: readonly Wall[]): Map<string, Face> | null {
  const edges = readPlanEdgeWallIds(room);
  const outline = room.planPolygon ?? room.polygon;
  if (!edges || !outline || edges.length !== outline.length) return null;
  const depths = getRoomWallPanelDepths(room);
  const known = facesByEdges.get(edges);
  if (known && known.outline === outline && known.walls === walls && known.depths === depths) return known.faces;
  const origin = room.planPosition ?? { x: room.x ?? 0, z: room.z ?? 0 };
  const vertices = outline.map(({ x, z }) => ({ x: x + origin.x, z: z + origin.z }));
  const area = vertices.reduce((sum, point, index) => sum + cross(point, vertices[(index + 1) % vertices.length]), 0);
  const wallById = new Map(walls.map((wall) => [wall.id, wall]));
  const runs = faceRuns(edges);
  const built = runs.map((run) => buildFace(run, vertices, wallById.get(run.wallId), room.id, drawnDepth(depths, run, edges.length)));
  runs.forEach((run, index) => {
    const [incoming, outgoing] = [built[(index - 1 + runs.length) % runs.length], built[index]];
    if (!incoming || !outgoing || incoming === outgoing) return;
    const vertex = vertices[run.from];
    const into = sub(vertex, vertices[(run.from - 1 + vertices.length) % vertices.length]), out = sub(vertices[(run.from + 1) % vertices.length], vertex);
    const cuts = cornerCuts(vertex, Math.atan2(cross(into, out), dot(into, out)), area, incoming, outgoing);
    const [atIncoming, atOutgoing] = [{ ...cuts[0], atWallStart: !incoming.firstAtWallStart }, { ...cuts[1], atWallStart: outgoing.firstAtWallStart }];
    // Where the running wall has an opening down to the floor at the corner, the stopping face runs to the corner.
    for (const [end, other, otherEnd] of [[atIncoming, outgoing, atOutgoing], [atOutgoing, incoming, atIncoming]] as const) {
      if (end.cutAway && !standsAtCorner(other, otherEnd.atWallStart)) Object.assign(end, end.cutAway, { by: undefined, cutAway: undefined });
    }
    incoming.ends.push(atIncoming);
    outgoing.ends.push(atOutgoing);
  });
  const faces = new Map<string, Face>();
  built.forEach((face, index) => {
    if (!face || runs.filter(({ wallId }) => wallId === runs[index].wallId).length !== 1) return;
    face.others = footprintsNear(face, walls);
    faces.set(face.wall.id, face);
  });
  facesByEdges.set(edges, { outline, walls, depths, faces });
  return faces;
}

/**
 * How far a slice's finish stops short of each end of its face, in millimetres, on the bare face and on its front (see
 * FaceTrimsMm): to the room's corners as above, unless the wall the face stops at is cut away for the camera (`isCutAway`),
 * where the panel runs to the corner. `hidden` when nothing of the slice is left (a slice inside a corner's cut). Nothing for
 * a wall the room isn't measured to (a hole's).
 */
export function getCanonicalFaceTrimsMm(
  room: FaceLimitsRoom, walls: readonly Wall[], wall: Pick<Wall, "id">, solid: Solid, side: 1 | -1,
  isCutAway?: (wallId: string) => boolean
): FaceTrimsMm {
  const face = getRoomFaces(room, walls)?.get(wall.id);
  if (!face || face.side !== side) return NO_FACE_TRIMS;
  const cutAway = face.ends.map((end) => Boolean(end.by && end.cutAway && isCutAway?.(end.by)));
  // Kept per slice while the room's faces are the same object, so a re-render or a drag frame measures nothing again.
  const key = `${room.id}:${side}:${cutAway.join(",")}`;
  const known = trimsBySolid.get(solid) ?? new Map<string, { face: Face; trims: FaceTrimsMm }>();
  trimsBySolid.set(solid, known);
  const kept = known.get(key);
  if (kept?.face === face) return kept.trims;
  const trims = sliceTrims(face, solid, cutAway);
  known.set(key, { face, trims });
  return trims;
}

const trimsBySolid = new WeakMap<Solid, Map<string, { face: Face; trims: FaceTrimsMm }>>();
const HIDDEN: FaceTrimsMm = Object.freeze({ startMm: 0, endMm: 0, hidden: true });

/** Other walls' slices near the face (within half a metre of its line's box), which it may run into. */
function footprintsNear(face: Face, walls: readonly Wall[]): Footprint[] {
  const xs = face.bare.map(({ x }) => x), zs = face.bare.map(({ z }) => z);
  const [minX, maxX, minZ, maxZ] = [Math.min(...xs) - 0.5, Math.max(...xs) + 0.5, Math.min(...zs) - 0.5, Math.max(...zs) + 0.5];
  return walls.filter((wall) => wall.id !== face.wall.id).flatMap((wall) => wall.solids.map((solid) => ({
    points: [solid.footprint.startLeft, solid.footprint.endLeft, solid.footprint.endRight, solid.footprint.startRight].map(metres),
    bottomMm: solid.bottomMm, topMm: solid.topMm,
  }))).filter(({ points }) => points.some(({ x, z }) => x >= minX && x <= maxX && z >= minZ && z <= maxZ));
}

/**
 * Where the slice's bare face, as cut at its corners (`from` to `to` metres along it, past its ends where a corner runs it on),
 * runs into another wall's footprint at one of its ends: that footprint's side, as a cut.
 */
function footprintCuts(face: Face, solid: Solid, from: number, to: number): Array<{ line: Line; atStart: boolean }> {
  const edge = wallSurfaceEdge(solid, face.side, 0);
  const dir = unit(sub(edge.end, edge.start)), length = to - from;
  const start = { x: edge.start.x + dir.x * from, z: edge.start.z + dir.z * from };
  if (length <= 0.0005) return [];
  return face.others.flatMap((other) => {
    // Another wall stops a face only where it stands at the face's foot: not a lintel over a door it runs past.
    if (other.bottomMm > solid.bottomMm + 0.5 || other.topMm <= solid.bottomMm) return [];
    const span = segmentInside(start, dir, length, other.points);
    if (!span || span.to - span.from < 0.0002) return [];
    if (!span.entry || !span.exit) return [{ line: { point: start, dir: { x: -dir.z, z: dir.x } }, atStart: false }, { line: { point: start, dir: { x: -dir.z, z: dir.x } }, atStart: true }];
    // Cut from the nearer end: a wall's footprint reaches into a face only near its ends (a join, or a stem past its corner).
    if (span.from <= 0.0002 && span.to >= length - 0.0002) return [{ line: span.exit, atStart: true }, { line: span.entry, atStart: false }];
    return span.from + span.to < length ? [{ line: span.exit, atStart: true }] : [{ line: span.entry, atStart: false }];
  });
}

/** The stretch of a segment inside a convex outline (Cyrus-Beck), and the outline's sides it enters and leaves by. */
function segmentInside(start: PlanPoint, dir: PlanPoint, length: number, outline: readonly PlanPoint[]) {
  const turning = Math.sign(outline.reduce((sum, point, index) => sum + cross(point, outline[(index + 1) % outline.length]), 0)) || 1;
  let span = { from: 0, to: length, entry: null as Line | null, exit: null as Line | null };
  for (let index = 0; index < outline.length; index += 1) {
    const [from, to] = [outline[index], outline[(index + 1) % outline.length]];
    const side = { point: from, dir: unit(sub(to, from)) };
    // Inside is to the left of each side of a positively turning outline, by more than a tenth of a millimetre: a face along
    // another wall's side (their joint) only touches it.
    const [at, rate] = [turning * cross(side.dir, sub(start, from)) - 0.0001, turning * cross(side.dir, dir)];
    if (Math.abs(rate) < 1e-12) { if (at < 0) return null; continue; }
    const crossingAt = -at / rate;
    if (rate > 0 && crossingAt > span.from) span = { ...span, from: crossingAt, entry: side };
    if (rate < 0 && crossingAt < span.to) span = { ...span, to: crossingAt, exit: side };
  }
  if (span.from >= span.to) return null;
  // Wholly inside, it has no side to stop at: it's buried (a slice inside another wall's sharp mitre).
  const side = span.entry ?? span.exit;
  return side ? { from: span.from, to: span.to, entry: span.entry ?? side, exit: span.exit ?? side } : { from: 0, to: length, entry: null, exit: null };
}

function sliceTrims(face: Face, solid: Solid, cutAway: readonly boolean[]): FaceTrimsMm {
  const corners = sliceExtent(face, solid, 0, cutAway, []);
  const others = footprintCuts(face, solid, corners.lo, corners.hi);
  const [bare, front] = [sliceExtent(face, solid, 0, cutAway, others), sliceExtent(face, solid, face.depth, cutAway, others)];
  if (bare.hi - bare.lo <= 0.0005 && front.hi - front.lo <= 0.0005) return HIDDEN;
  const mm = (extent: typeof bare) => ({ startMm: extent.lo * 1000, endMm: (extent.length - extent.hi) * 1000 });
  const [atBare, atFront] = [mm(bare), mm(front)];
  if ([atBare.startMm, atBare.endMm, atFront.startMm, atFront.endMm].every((value) => Math.abs(value) < 1e-6)) return NO_FACE_TRIMS;
  return { ...atBare, front: { offsetMm: face.depth * 1000, ...atFront } };
}

/** Where line `line` crosses the edge's line, in metres along the edge from its start; none when they run parallel. */
function paramOn(start: PlanPoint, dir: PlanPoint, line: Line): number | null {
  const denominator = cross(line.dir, dir);
  return Math.abs(denominator) < 1e-12 ? null : cross(line.dir, sub(line.point, start)) / denominator;
}

/** A slice's face end lines as its footprint ends them: square at a door, mitred at an arc's joints and the wall's corners. */
function footprintEnds(solid: Solid, side: 1 | -1): [Line | null, Line | null] {
  const { startLeft, startRight, endLeft, endRight } = solid.footprint;
  const through = (a: { xMm: number; zMm: number }, b: { xMm: number; zMm: number }) => {
    const [from, to] = [metres(a), metres(b)];
    return Math.hypot(to.x - from.x, to.z - from.z) < 1e-6 ? null : { point: from, dir: unit(sub(to, from)) };
  };
  return side === 1 ? [through(startLeft, startRight), through(endLeft, endRight)] : [through(endRight, endLeft), through(startRight, startLeft)];
}

/** The slice's face `offset` metres in front of the wall, from where to where along it (metres from its start) it's kept. */
function sliceExtent(face: Face, solid: Solid, offset: number, cutAway: readonly boolean[], others: ReturnType<typeof footprintCuts>) {
  const edge = wallSurfaceEdge(solid, face.side, offset * 1000);
  const length = Math.hypot(edge.end.x - edge.start.x, edge.end.z - edge.start.z);
  const dir = unit(sub(edge.end, edge.start));
  const [startLine, endLine] = footprintEnds(solid, face.side);
  let lo = (startLine && paramOn(edge.start, dir, startLine)) ?? 0;
  let hi = (endLine && paramOn(edge.start, dir, endLine)) ?? length;
  const middleMm = (solid.startOffsetMm + solid.endOffsetMm) / 2, wallMiddleMm = (face.firstMm + face.lastMm) / 2;
  face.ends.forEach((end, index) => {
    // An arc's cut at one end reaches only its slices on that half.
    if (face.arc && (end.atWallStart ? middleMm > wallMiddleMm : middleMm < wallMiddleMm)) return;
    const cut = cutAway[index] && end.cutAway ? end.cutAway : end;
    const at = paramOn(edge.start, dir, cut.line);
    if (at === null) return;
    // The slice at the wall's end there takes the cut where it falls, short of its corner or past it; another is only cut.
    // A face runs with its wall on side 1 and against it on side -1 (wallSurfaceEdge).
    const atCorner = end.atWallStart ? solid.startOffsetMm <= face.firstMm + 0.5 : solid.endOffsetMm >= face.lastMm - 0.5;
    if (end.atWallStart === (face.side === 1)) lo = atCorner ? at : Math.max(lo, at);
    else hi = atCorner ? at : Math.min(hi, at);
  });
  for (const { line, atStart } of others) {
    const at = paramOn(edge.start, dir, line);
    if (at !== null && atStart) lo = Math.max(lo, at);
    else if (at !== null) hi = Math.min(hi, at);
  }
  return { lo, hi, length };
}
