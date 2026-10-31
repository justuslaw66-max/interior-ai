import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * The nearest place a built-in fits, found exactly in the space of its positions rather than on a grid: a footprint (a
 * convex outline about its centre) meets a convex obstacle exactly where its centre is inside the obstacle grown by the
 * footprint turned about (their Minkowski sum with the footprint's mirror). The nearest place it stands clear of every
 * obstacle is then where the room's centre is nearest outside all of those grown shapes: on one of their edges (the nearest
 * point of it), at a corner of one, or where two edges cross. Those places are tried nearest first, and the first that the
 * caller's own test (`fits`, the region's: inside the outline, clear of every solid and baseboard) accepts is the answer.
 */

type Point = RoomPlanPolygonPoint;

/** A footprint's outline about its centre, and the convex obstacles (or wall segments) it must keep clear of. */
export type BuiltInFitObstacles = { footprint: readonly Point[]; obstacles: ReadonlyArray<readonly Point[]> };

/** A point this far (metres) inside a grown shape, on every side, is inside it; nearer its edge counts as on it. */
const INSIDE_EPSILON = 1e-9;

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
}

/** The convex hull of the points, counter-clockwise (x right, z up), without repeated or collinear points. */
function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length < 3) return sorted;
  const half = (input: Point[]) => {
    const chain: Point[] = [];
    for (const point of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 1e-15) chain.pop();
      chain.push(point);
    }
    return chain;
  };
  const lower = half(sorted), upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** The obstacle grown by the footprint turned about its centre: where the footprint's centre makes them overlap. */
function grow(obstacle: readonly Point[], footprint: readonly Point[]): Point[] {
  return convexHull(obstacle.flatMap((o) => footprint.map((f) => ({ x: o.x - f.x, z: o.z - f.z }))));
}

/** True when the point is inside the convex counter-clockwise shape by more than INSIDE_EPSILON on every side. */
function isStrictlyInside(shape: readonly Point[], point: Point): boolean {
  if (shape.length < 3) return false;
  return shape.every((start, index) => {
    const end = shape[(index + 1) % shape.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    return length === 0 || cross(start, end, point) / length > INSIDE_EPSILON;
  });
}

function nearestOnSegment(a: Point, b: Point, p: Point): Point {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0;
  return { x: a.x + dx * t, z: a.z + dz * t };
}

function segmentCrossing(a: Point, b: Point, c: Point, d: Point): Point | null {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, denominator = r.x * s.z - r.z * s.x;
  if (Math.abs(denominator) < 1e-15) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / denominator, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + r.x * t, z: a.z + r.z * t } : null;
}

type Edge = { a: Point; b: Point; shape: number; minX: number; maxX: number; minZ: number; maxZ: number };

function edgesOf(shapes: Point[][]): Edge[] {
  return shapes.flatMap((shape, index) => (shape.length === 2 ? [[shape[0], shape[1]]] : shape.map((point, at) => [point, shape[(at + 1) % shape.length]]))
    .map(([a, b]) => ({ a, b, shape: index, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) })));
}

/** The places a nearest fit may be: the start, the nearest point of each grown edge, their corners, and edges' crossings. */
function candidatesNear(start: Point, shapes: Point[][], reach: number): Point[] {
  const edges = edgesOf(shapes).filter((edge) => {
    const nearest = nearestOnSegment(edge.a, edge.b, start);
    return Math.hypot(nearest.x - start.x, nearest.z - start.z) <= reach;
  });
  const candidates: Point[] = [start, ...edges.flatMap((edge) => [nearestOnSegment(edge.a, edge.b, start), edge.a, edge.b])];
  for (let first = 0; first < edges.length; first += 1) {
    const one = edges[first];
    for (let second = first + 1; second < edges.length; second += 1) {
      const two = edges[second];
      if (one.shape === two.shape || two.minX > one.maxX || two.maxX < one.minX || two.minZ > one.maxZ || two.maxZ < one.minZ) continue;
      const crossing = segmentCrossing(one.a, one.b, two.a, two.b);
      if (crossing) candidates.push(crossing);
    }
  }
  return candidates;
}

/**
 * The nearest place to `start` within `reach` metres where the footprints stand clear of their obstacles and `fits` accepts
 * it, or null. Each family pairs one footprint with the obstacles it must keep clear of (the region's solids and outline
 * edges for the whole footprint; the baseboard bands for its back): a place counts only clear of every family's.
 */
export function findNearestBuiltInFit(
  families: readonly BuiltInFitObstacles[], start: Point, reach: number, fits: (x: number, z: number) => boolean,
  within?: readonly Point[]
): [number, number] | null {
  const shapes = families.flatMap(({ footprint, obstacles }) => {
    const radius = Math.max(...footprint.map((point) => Math.hypot(point.x, point.z)));
    return obstacles.filter((obstacle) => distanceToBounds(obstacle, start) <= reach + radius).map((obstacle) => grow(obstacle, footprint));
  });
  const boxed = shapes.map((shape) => ({ shape, ...boundsOf(shape) }));
  const ordered = candidatesNear(start, shapes, reach)
    .map((point) => ({ point, distance: Math.hypot(point.x - start.x, point.z - start.z) }))
    .filter(({ distance }) => distance <= reach + 1e-12)
    .sort((first, second) => first.distance - second.distance);
  for (const { point } of ordered) {
    // A footprint inside the room has its centre inside the room's outline (`within`), and it is clear of every grown shape.
    if (within && !isInsideRing(point, within)) continue;
    if (boxed.some((box) => point.x > box.minX && point.x < box.maxX && point.z > box.minZ && point.z < box.maxZ &&
      isStrictlyInside(box.shape, point))) continue;
    if (fits(point.x, point.z)) return [point.x, point.z];
  }
  return null;
}

function boundsOf(points: readonly Point[]) {
  const xs = points.map((value) => value.x), zs = points.map((value) => value.z);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
}

/** True when the point is inside the ring, by crossings. */
function isInsideRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    if (current.z > point.z !== previous.z > point.z &&
      point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x) inside = !inside;
  });
  return inside;
}

function distanceToBounds(points: readonly Point[], point: Point): number {
  const { minX, maxX, minZ, maxZ } = boundsOf(points);
  return Math.hypot(Math.max(minX - point.x, 0, point.x - maxX), Math.max(minZ - point.z, 0, point.z - maxZ));
}
