import { clipToStrip, getObstacleFreeSpans, type FacePoint } from "@/lib/built-in-free-span";
import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * A drawn room's finished region (J, 29 Oct 2026: "Face, back flush"), where its built-ins stand: inside its outline (the
 * walls' centre line), outside its columns, and outside every wall's solid. A wall's solid is its band, from its centre line
 * to its face (half the wall, and its laminate panel) along its edge, and the corners as the 3D view joins its walls
 * (components/editor/renderers/house-plan-3d/geometry.ts): where two walls turn away from the room, their faces run on to meet
 * where their lines cross, within a wall's thickness of the corner (legacyWallSurfaceMiterOffset); where a wall runs straight
 * back along the last (a spike, a stub's tip), it runs on half its thickness past the end (legacyWallPartRegion). A wall's
 * exposed face is where a run can stand with its back against it; what a run there keeps clear of is every solid in front.
 */

type Point = RoomPlanPolygonPoint;

/** A wall, room-local metres: its start, direction, normal towards its room, length and how deep its face stands. */
export type RegionWall = { start: Point; dx: number; dz: number; nx: number; nz: number; length: number; face: number };

/** A wall's exposed face. */
export type BuiltInFaceHost = {
  /** Its ends, room-local metres, in its wall's direction. */
  start: Point;
  end: Point;
  /**
   * What a run against it keeps clear of: the walls' solids and the room's columns, cut to the room's side of the face, as
   * convex outlines of [along the face, into the room] mm about the face's middle.
   */
  obstacles: Array<Array<[number, number]>>;
};

export type BuiltInRegion = {
  outline: Point[];
  holes: Point[][];
  walls: RegionWall[];
  /** The walls' bands and corners, convex outlines, room-local metres. */
  solids: Point[][];
  /** Each wall's exposed face, or null where none is (a wall inside another, or with no length). */
  exposed: Array<BuiltInFaceHost | null>;
};

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

/** The outline's edges with a length as walls, the room on the side its winding puts it (getOutlineInteriorSide). */
function buildWalls(outline: readonly Point[], faces: readonly number[]): RegionWall[] {
  const sign = signedArea(outline) >= 0 ? 1 : -1;
  return outline.flatMap((start, index) => {
    const next = outline[(index + 1) % outline.length];
    const length = Math.hypot(next.x - start.x, next.z - start.z);
    if (!(length > 1e-9)) return [];
    const dx = (next.x - start.x) / length, dz = (next.z - start.z) / length;
    return [{ start, dx, dz, nx: -dz * sign, nz: dx * sign, length, face: faces[index] ?? 0 }];
  });
}

/** A half-plane: the points p with (p − origin)·(ax, az) ≥ offset. */
type HalfPlane = { origin: Point; ax: number; az: number; offset: number };

/** The convex polygon cut to a half-plane (Sutherland–Hodgman). */
function clipToHalfPlane(points: readonly Point[], { origin, ax, az, offset }: HalfPlane): Point[] {
  const value = (point: Point) => (point.x - origin.x) * ax + (point.z - origin.z) * az - offset;
  const output: Point[] = [];
  points.forEach((point, index) => {
    const next = points[(index + 1) % points.length];
    const here = value(point), there = value(next);
    if (here >= 0) output.push(point);
    if ((here >= 0) !== (there >= 0)) {
      const t = here / (here - there);
      output.push({ x: point.x + (next.x - point.x) * t, z: point.z + (next.z - point.z) * t });
    }
  });
  return output;
}

/** The part of a square about `origin` inside every half-plane. */
function intersectHalfPlanes(origin: Point, size: number, planes: HalfPlane[]): Point[] {
  const square = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => ({ x: origin.x + x * size, z: origin.z + z * size }));
  return planes.reduce<Point[]>((points, plane) => (points.length ? clipToHalfPlane(points, plane) : points), square);
}

const hasArea = (points: readonly Point[]) => points.length >= 3 && Math.abs(signedArea(points)) > 1e-12;

/** The bands, from each wall's centre line to its face along its edge. */
function buildBands(walls: readonly RegionWall[]): Point[][] {
  return walls.map(({ start, dx, dz, nx, nz, length, face }) => {
    const end = { x: start.x + dx * length, z: start.z + dz * length };
    return [start, end, { x: end.x + nx * face, z: end.z + nz * face }, { x: start.x + nx * face, z: start.z + nz * face }];
  });
}

/**
 * The corner where wall `before` ends and wall `after` starts, at `corner`: where the walls turn away from the room, the
 * stretch past both their ends and inside both their faces, within `thickness` of the corner along each; where the second runs
 * straight back along the first, each runs on half `thickness`, half the wall thick.
 */
function buildCorner(corner: Point, before: RegionWall, after: RegionWall, thickness: number): Point[][] {
  const plane = (ax: number, az: number, offset: number): HalfPlane => ({ origin: corner, ax, az, offset });
  const cross = before.dx * after.dz - before.dz * after.dx;
  if (Math.abs(cross) < PARALLEL_CROSS) {
    if (before.dx * after.dx + before.dz * after.dz > 0) return [];
    const half = thickness / 2, ends: Array<[RegionWall, number]> = [[before, 1], [after, -1]];
    return ends.map(([wall, way]) => intersectHalfPlanes(corner, 2 * thickness, [
      plane(wall.dx * way, wall.dz * way, 0), plane(-wall.dx * way, -wall.dz * way, -half), plane(wall.nx, wall.nz, 0), plane(-wall.nx, -wall.nz, -half),
    ])).filter(hasArea);
  }
  const block = intersectHalfPlanes(corner, 2 * (thickness + before.face + after.face), [
    plane(before.dx, before.dz, 0), plane(-before.dx, -before.dz, -thickness),
    plane(-after.dx, -after.dz, 0), plane(after.dx, after.dz, -thickness),
    plane(before.nx, before.nz, 0), plane(-before.nx, -before.nz, -before.face),
    plane(after.nx, after.nz, 0), plane(-after.nx, -after.nz, -after.face),
  ]);
  return hasArea(block) ? [block] : [];
}

function buildSolids(walls: readonly RegionWall[], thickness: number): Point[][] {
  const corners = walls.flatMap((wall, index) => {
    const next = walls[(index + 1) % walls.length];
    return buildCorner({ x: next.start.x, z: next.start.z }, wall, next, thickness);
  });
  return [...buildBands(walls), ...corners];
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
  // Each exposed stretch, and whether its ends are open (its face ends, nothing in front) rather than met by a solid.
  const exposed = getCoveredBehind(solids).flatMap(([coverFrom, coverTo]) =>
    getObstacleFreeSpans(obstacles, FACE_EDGE_MM, FACE_PROBE_MM, 0, coverFrom, coverTo)
      .map(([from, to]) => ({ from, to, openFrom: from - coverFrom < 1e-9, openTo: coverTo - to < 1e-9 })))
    .filter(({ from, to }) => to - from > FACE_EDGE_MM && to > 0 && from < lengthMm && inRoom(fromFrame((from + to) / 2, FACE_PROBE_MM / 2)));
  if (!exposed.length) return null;
  const first = exposed[0], last = exposed[exposed.length - 1], middle = (first.from + last.to) / 2;
  // Found when first read (by Fit's hosts): containment and the clamp need only the region.
  let found: Array<Array<[number, number]>> | undefined;
  return {
    start: fromFrame(first.from, 0),
    end: fromFrame(last.to, 0),
    get obstacles() { return (found ??= getFaceObstacles(region, toFrame, first, last, middle)); },
  };
}

/**
 * What a run on a face keeps clear of: every solid and column standing in front of the face along its exposed stretch (and
 * 100 mm past its ends), cut to the room's side of it; and its open ends, as lines across them. In the face's frame, about its
 * middle, to a hundredth of a mm.
 */
function getFaceObstacles(
  region: Omit<BuiltInRegion, "exposed">, toFrame: (point: Point) => FacePoint,
  first: { from: number; openFrom: boolean }, last: { to: number; openTo: boolean }, middle: number
): Array<Array<[number, number]>> {
  const inReach = (points: readonly FacePoint[]) => points.some(([along]) => along > first.from - 100) && points.some(([along]) => along < last.to + 100) &&
    points.some(([, into]) => into > FACE_EDGE_MM) && points.some(([, into]) => into < FACE_REACH_MM);
  const solids = [...region.solids, ...region.holes].map((points) => points.map(toFrame)).filter(inReach)
    .map((points) => clipToStrip(points, FACE_EDGE_MM, FACE_REACH_MM)).filter((points) => points.length >= 2);
  const openEnds = [first.openFrom ? first.from : null, last.openTo ? last.to : null]
    .filter((along): along is number => along !== null).map((along): FacePoint[] => [[along, 0], [along, FACE_REACH_MM]]);
  const round = (value: number) => Math.round(value * 100) / 100;
  return [...solids, ...openEnds].filter(inReach).map((points) => points.map(([along, into]): [number, number] => [round(along - middle), round(into)]));
}

/**
 * The region of a room's `outline` (room-local metres) with its walls `thickness` thick and each edge's face `faces` in from
 * it (half the wall and its panel); the exposed faces in the outline's edge order, null for an edge with no length.
 */
export function buildBuiltInRegion(outline: Point[], faces: readonly number[], thickness: number, holes: Point[][]): BuiltInRegion {
  const walls = buildWalls(outline, faces);
  const base = { outline, holes: holes.filter((hole) => hole.length >= 3), walls, solids: buildSolids(walls, thickness) };
  const byWall = walls.map((_, index) => buildFaceHost(base, index));
  let next = 0;
  const exposed = outline.map((start) => {
    const wall = walls[next];
    if (!wall || wall.start !== start) return null;
    next += 1;
    return byWall[next - 1];
  });
  return { ...base, exposed };
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
