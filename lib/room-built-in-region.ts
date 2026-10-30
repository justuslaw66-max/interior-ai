import { clipToStrip, getObstacleFreeSpans, type FacePoint } from "@/lib/built-in-free-span";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * A drawn room's finished region (J, 29 Oct 2026: "Face, back flush"), where its built-ins stand: inside its outline (the
 * walls' centre line), outside its columns, and outside its walls as the 3D view draws them
 * (components/editor/renderers/house-plan-3d/geometry.ts): each wall's core, its thickness wide along its edge and run on half
 * its thickness past each end (legacyWallPartRegion), and each laminate panel, from the wall's face its finish depth into the
 * room, ended where the 3D view joins it to the next wall (legacyWallSurfaceMiterOffset). A wall's face is half the wall and
 * its panel in from its edge; where it is exposed, a run can stand with its back against it, keeping clear of every solid it
 * would meet along the face.
 */

type Point = RoomPlanPolygonPoint;

/**
 * A wall as the 3D view draws it, room-local metres: its start, direction (east for an edge with no length, as the 3D view's
 * is), normal towards its room, length, panel depth, how deep its face stands, and its face id (which orders its panel joins).
 */
export type RegionWall = {
  start: Point; dx: number; dz: number; nx: number; nz: number; length: number; panel: number; face: number; faceId: string;
};

/** A wall's exposed face. */
export type BuiltInFaceHost = {
  /** Its ends, room-local metres, in its wall's direction. */
  start: Point;
  end: Point;
  /**
   * What a run against it keeps clear of: the walls' solids and the room's columns, cut to the room's side of the face, and
   * its two ends, as convex outlines of [along the face, into the room] mm about the face's middle.
   */
  obstacles: Array<Array<[number, number]>>;
};

export type BuiltInRegion = {
  outline: Point[];
  holes: Point[][];
  walls: RegionWall[];
  /** The walls' cores and panels, convex outlines, room-local metres. */
  solids: Point[][];
  /** Each wall's exposed face, or null where none is (a wall inside another, or with no length). */
  exposed: Array<BuiltInFaceHost | null>;
};

/** How near two wall ends meet to join, as the 3D view joins them (LEGACY_WALL_JOIN_TOLERANCE_METERS). */
const JOIN_TOLERANCE = 0.002;
/** Two walls this near parallel (the cross of their directions) join square, as the 3D view joins them (intersectOffsetLines). */
const PARALLEL_CROSS = 0.00001;
/** Solids are cut this far (mm) in front of a face: one flush with it (the next stretch of a straight wall) stays behind it. */
const FACE_EDGE_MM = 0.0001;
/** A face is exposed where nothing stands within this (mm) in front of it, and a solid does as near behind it. */
const FACE_PROBE_MM = 0.001;
/** How far into the room (mm) a face keeps its obstacles: deeper than any run. */
const FACE_REACH_MM = 3000;

/** True when the point is inside the ring, by crossings (no tolerance: a point on an edge may fall either way). */
function isInsideRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    if (current.z > point.z !== previous.z > point.z &&
      point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x) inside = !inside;
  });
  return inside;
}

function signedArea(points: readonly Point[]): number {
  return points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;
}

/** Every edge of the outline as a wall, the room on the side its winding puts it (getWallSegments, getOutlineInteriorSide). */
function buildWalls(outline: readonly Point[], faceIds: readonly string[], panels: readonly number[], thickness: number): RegionWall[] {
  const sign = signedArea(outline) >= 0 ? 1 : -1;
  return outline.map((start, index) => {
    const next = outline[(index + 1) % outline.length];
    const length = Math.hypot(next.x - start.x, next.z - start.z);
    const [dx, dz] = length > 0 ? [(next.x - start.x) / length, (next.z - start.z) / length] : [1, 0];
    const panel = panels[index] ?? 0;
    return { start, dx, dz, nx: -dz * sign, nz: dx * sign, length, panel, face: thickness / 2 + panel, faceId: faceIds[index] ?? "" };
  });
}

const at = (wall: RegionWall, along: number, across: number): Point =>
  ({ x: wall.start.x + wall.dx * along + wall.nx * across, z: wall.start.z + wall.dz * along + wall.nz * across });

/**
 * Where a wall's panel ends at one end (`end` 0 its start, 1 its end), along the wall from its start: where its face meets the
 * next wall's face, or that wall's panel when this wall's id sorts later; within a wall's thickness of the corner
 * (legacyWallSurfaceMiterOffset).
 */
function panelEndAlong(walls: readonly RegionWall[], index: number, end: 0 | 1, thickness: number): number {
  const wall = walls[index], endpoint = end * wall.length, target = at(wall, endpoint, 0);
  const near = (point: Point) => Math.hypot(point.x - target.x, point.z - target.z) <= JOIN_TOLERANCE;
  const adjacent = walls.find((other, otherIndex) => otherIndex !== index && (near(other.start) || near(at(other, other.length, 0))));
  if (!adjacent) return endpoint;
  const cross = wall.dx * adjacent.dz - wall.dz * adjacent.dx;
  if (Math.abs(cross) < PARALLEL_CROSS) return endpoint;
  const adjacentFace = thickness / 2 + (wall.faceId > adjacent.faceId ? adjacent.panel : 0);
  const first = at(wall, 0, thickness / 2), second = at(adjacent, 0, adjacentFace);
  const along = ((second.x - first.x) * adjacent.dz - (second.z - first.z) * adjacent.dx) / cross;
  return Math.min(endpoint + thickness, Math.max(endpoint - thickness, along));
}

/**
 * The walls' cores (run on half the wall past each end) and their panels' boxes, as the 3D view draws them: a wall no longer
 * than the join tolerance has neither (getWallSolidSpans).
 */
function buildSolids(walls: readonly RegionWall[], thickness: number): Point[][] {
  const half = thickness / 2, drawn = (wall: RegionWall) => wall.length > JOIN_TOLERANCE;
  const cores = walls.filter(drawn).map((wall) => [at(wall, -half, -half), at(wall, wall.length + half, -half), at(wall, wall.length + half, half), at(wall, -half, half)]);
  const panels = walls.flatMap((wall, index) => {
    if (!(wall.panel > 0) || !drawn(wall)) return [];
    const from = panelEndAlong(walls, index, 0, thickness), to = from + Math.max(0.001, panelEndAlong(walls, index, 1, thickness) - from);
    return [[at(wall, from, half), at(wall, to, half), at(wall, to, wall.face), at(wall, from, wall.face)]];
  });
  return [...cores, ...panels];
}

/** The stretches along a face where a solid stands just behind it, merged where they meet (to a ten-thousandth of a mm). */
function getCoveredBehind(solids: readonly FacePoint[][]): Array<[number, number]> {
  const spans = solids.map((points) => clipToStrip(points, -FACE_PROBE_MM, -FACE_EDGE_MM).map(([along]) => along))
    .filter((values) => values.length >= 2).map((values): [number, number] => [Math.min(...values), Math.max(...values)])
    .sort((left, right) => left[0] - right[0]);
  return spans.reduce<Array<[number, number]>>((merged, span) => {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + FACE_EDGE_MM) last[1] = Math.max(last[1], span[1]);
    else merged.push([...span]);
    return merged;
  }, []);
}

/**
 * Wall `index`'s exposed face: where its face line has a solid just behind it and nothing just in front, inside the room,
 * over the stretches that meet its own edge. A face runs on over the next wall's where they stand flush (a straight wall
 * drawn in two pieces), and ends where a solid stands in front of it or none behind (a corner, a deeper or shallower panel).
 */
function buildFaceHost(region: Omit<BuiltInRegion, "exposed">, index: number): BuiltInFaceHost | null {
  const wall = region.walls[index];
  if (!(wall.length > 1e-9)) return null;
  const origin = { x: wall.start.x + wall.nx * wall.face, z: wall.start.z + wall.nz * wall.face };
  const toFrame = (point: Point): FacePoint => {
    const x = (point.x - origin.x) * 1000, z = (point.z - origin.z) * 1000;
    return [x * wall.dx + z * wall.dz, x * wall.nx + z * wall.nz];
  };
  const fromFrame = (along: number, into: number): Point => ({
    x: origin.x + (wall.dx * along + wall.nx * into) / 1000, z: origin.z + (wall.dz * along + wall.nz * into) / 1000,
  });
  // Only what stands at the face line can end it: in a room of many edges, every other solid is far from most faces.
  const nearLine = (points: readonly Point[]) => {
    let low = Number.POSITIVE_INFINITY, high = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      const across = ((point.x - origin.x) * wall.nx + (point.z - origin.z) * wall.nz) * 1000;
      low = Math.min(low, across);
      high = Math.max(high, across);
    }
    return low < FACE_PROBE_MM && high > -FACE_PROBE_MM;
  };
  const solids = region.solids.filter(nearLine).map((points) => points.map(toFrame));
  const obstacles = [...solids, ...region.holes.filter(nearLine).map((hole) => hole.map(toFrame))]
    .map((points) => clipToStrip(points, FACE_EDGE_MM, FACE_REACH_MM))
    .filter((points) => points.length >= 2);
  const inRoom = (point: Point) =>
    isInsideRing(point, region.outline) && !region.holes.some((hole) => isInsideRing(point, hole));
  const lengthMm = wall.length * 1000;
  // Each exposed stretch, by the stretch of face behind them, of which the one most along the wall's own edge is its face.
  const pieces = getCoveredBehind(solids).map(([coverFrom, coverTo]) =>
    getObstacleFreeSpans(obstacles, FACE_EDGE_MM, FACE_PROBE_MM, 0, coverFrom, coverTo)
      .filter(([from, to]) => to - from > FACE_EDGE_MM && to > 0 && from < lengthMm && inRoom(fromFrame((from + to) / 2, FACE_PROBE_MM / 2))));
  const alongEdge = (stretch: typeof pieces[number]) => stretch.reduce((sum, [from, to]) => sum + Math.max(0, Math.min(to, lengthMm) - Math.max(from, 0)), 0);
  const exposed = pieces.reduce((best, stretch) => (alongEdge(stretch) > alongEdge(best) ? stretch : best), pieces[0] ?? []);
  if (!exposed.length) return null;
  const from = exposed[0][0], to = exposed[exposed.length - 1][1];
  // Found when first read (by Fit's hosts): containment and the clamp need only the region.
  let found: Array<Array<[number, number]>> | undefined;
  return {
    start: fromFrame(from, 0),
    end: fromFrame(to, 0),
    get obstacles() { return (found ??= getFaceObstacles(region, toFrame, from, to)); },
  };
}

/**
 * What a run on a face from `from` to `to` keeps clear of: every solid and column standing in front of the face along it (and
 * 100 mm past its ends), cut to the room's side of it; and its ends, as lines across them (the face less 10 mm each end,
 * whatever ends it: a corner, a deeper panel, a solid too low to meet a raised back). In the face's frame, about its middle,
 * to a hundredth of a mm.
 */
function getFaceObstacles(region: Omit<BuiltInRegion, "exposed">, toFrame: (point: Point) => FacePoint, from: number, to: number): Array<Array<[number, number]>> {
  const inReach = (points: readonly FacePoint[]) => points.some(([along]) => along > from - 100) && points.some(([along]) => along < to + 100) &&
    points.some(([, into]) => into > FACE_EDGE_MM) && points.some(([, into]) => into < FACE_REACH_MM);
  const solids = [...region.solids, ...region.holes].map((points) => points.map(toFrame)).filter(inReach)
    .map((points) => clipToStrip(points, FACE_EDGE_MM, FACE_REACH_MM)).filter((points) => points.length >= 2 && inReach(points));
  const ends = [from, to].map((along): FacePoint[] => [[along, 0], [along, FACE_REACH_MM]]);
  const round = (value: number) => Math.round(value * 100) / 100, middle = (from + to) / 2;
  return [...solids, ...ends].map((points) => points.map(([along, into]): [number, number] => [round(along - middle), round(into)]));
}

/**
 * What a run on wall `index`'s face between `start` and `end` (room-local metres, on its face line) keeps clear of, as an
 * exposed face's obstacles are given (about the stretch's middle): for a host the face's closed form gives.
 */
export function getBuiltInFaceObstaclesAlong(region: BuiltInRegion, index: number, start: Point, end: Point): Array<Array<[number, number]>> {
  const wall = region.walls[index];
  const origin = { x: wall.start.x + wall.nx * wall.face, z: wall.start.z + wall.nz * wall.face };
  const toFrame = (point: Point): FacePoint => {
    const x = (point.x - origin.x) * 1000, z = (point.z - origin.z) * 1000;
    return [x * wall.dx + z * wall.dz, x * wall.nx + z * wall.nz];
  };
  const [from, to] = [toFrame(start)[0], toFrame(end)[0]].sort((a, b) => a - b);
  return getFaceObstacles(region, toFrame, from, to);
}

/**
 * The region of a room's `outline` (room-local metres) with its walls `thickness` thick and each edge's face id and panel depth;
 * the exposed faces in the outline's edge order, null for an edge with none.
 */
export function buildBuiltInRegion(
  outline: Point[], faceIds: readonly string[], panels: readonly number[], thickness: number, holes: Point[][]
): BuiltInRegion {
  const walls = buildWalls(outline, faceIds, panels, thickness);
  const base = { outline, holes: holes.filter((hole) => hole.length >= 3), walls, solids: buildSolids(walls, thickness) };
  return { ...base, exposed: walls.map((_, index) => buildFaceHost(base, index)) };
}

/** True when the convex outlines overlap by more than a touch (separating axes). */
function convexOverlap(first: readonly Point[], second: readonly Point[]): boolean {
  for (const shape of [first, second]) {
    for (let index = 0; index < shape.length; index += 1) {
      const start = shape[index], end = shape[(index + 1) % shape.length];
      const ax = -(end.z - start.z), az = end.x - start.x;
      if (ax === 0 && az === 0) continue;
      const project = (points: readonly Point[]) => points.map((point) => point.x * ax + point.z * az);
      const a = project(first), b = project(second);
      if (Math.max(...a) <= Math.min(...b) || Math.max(...b) <= Math.min(...a)) return false;
    }
  }
  return true;
}

function boundsOf(points: readonly Point[]) {
  const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** True when the segments cross at a point inside both (touching ends don't count). */
function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

/** True when the ring (an outline or a column) cuts into the convex footprint `corners`. */
function ringCutsInto(ring: readonly Point[], corners: readonly Point[]): boolean {
  const inside = (point: Point) => corners.every((corner, index) => {
    const next = corners[(index + 1) % corners.length];
    return ((next.x - corner.x) * (point.z - corner.z) - (next.z - corner.z) * (point.x - corner.x)) * Math.sign(signedArea(corners)) > 0;
  });
  return ring.some(inside) || ring.some((start, index) => corners.some((corner, cornerIndex) =>
    segmentsCross(start, ring[(index + 1) % ring.length], corner, corners[(cornerIndex + 1) % corners.length])));
}

/** True when the convex footprint `corners` (room-local metres) stands in the region, touching its edges at most. */
export function isFootprintInBuiltInRegion(region: BuiltInRegion, corners: readonly Point[]): boolean {
  if (!corners.every((corner) => isInsideRing(corner, region.outline)) || ringCutsInto(region.outline, corners)) return false;
  const bounds = boundsOf(corners);
  const near = (points: readonly Point[]) => {
    const other = boundsOf(points);
    return other.maxX > bounds.minX && other.minX < bounds.maxX && other.maxZ > bounds.minZ && other.minZ < bounds.maxZ;
  };
  if (region.solids.some((solid) => near(solid) && convexOverlap(solid, corners))) return false;
  return !region.holes.some((hole) => near(hole) &&
    (ringCutsInto(hole, corners) || corners.some((corner) => isInsideRing(corner, hole))));
}
