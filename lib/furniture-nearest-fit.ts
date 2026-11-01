import type { RoomPlanPolygonPoint } from "@/lib/room-types";

/**
 * The nearest place to a start where furniture's footprint stands clear of its obstacles, found exactly in the space of its
 * positions, as #245's search for built-ins does (lib/built-in-nearest-fit.ts, left as it is): the footprint (convex, about its
 * centre, here grown by the clearance) meets a convex obstacle exactly where its centre is inside the obstacle grown by the
 * footprint (their Minkowski sum; the footprint is its own mirror), so the nearest clear place is on an edge of one of those
 * grown shapes (its nearest point), at a corner of one, or where two edges cross. Those places are tried nearest first, and the
 * first the caller's test (`fits`: the same walls and panels, exactly) accepts is the answer.
 *
 * Along an arc or a run of short walls, a sofa's grown shapes overlap one another almost wholly, so an edge lying inside one of
 * the other grown shapes is dropped before any are paired (no place on it is clear), and the shapes are looked up by a grid:
 * the places tried are the same, and a drag along a curved wall stays within a frame.
 */

type Point = RoomPlanPolygonPoint;
type Shape = { points: Point[]; minX: number; maxX: number; minZ: number; maxZ: number };
type Edge = { a: Point; b: Point; shape: number; minX: number; maxX: number; minZ: number; maxZ: number };

/** A point this far (metres) inside a grown shape, on every side, is inside it; nearer its edge counts as on it. */
const INSIDE_EPSILON = 1e-9;

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);

/** The convex hull, counter-clockwise; a point is dropped only where the chain doesn't turn left at all. */
export function convexHull(points: readonly Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.z - b.z);
  if (sorted.length < 3) return sorted;
  const half = (input: Point[]) => {
    const chain: Point[] = [];
    for (const point of input) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], point) <= 0) chain.pop();
      chain.push(point);
    }
    return chain;
  };
  const lower = half(sorted), upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function boxed(points: Point[]): Shape {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const { x, z } of points) [minX, maxX, minZ, maxZ] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minZ, z), Math.max(maxZ, z)];
  return { points, minX, maxX, minZ, maxZ };
}

function isStrictlyInside(shape: Shape, point: Point): boolean {
  if (shape.points.length < 3 || point.x <= shape.minX || point.x >= shape.maxX || point.z <= shape.minZ || point.z >= shape.maxZ) return false;
  return shape.points.every((start, index) => {
    const end = shape.points[(index + 1) % shape.points.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    return length === 0 || cross(start, end, point) / length > INSIDE_EPSILON;
  });
}

/** The shapes by a grid of their bounds, for the ones a point may be in. */
function gridOf(shapes: readonly Shape[], cell: number) {
  const cells = new Map<string, number[]>();
  const at = (value: number) => Math.floor(value / cell);
  shapes.forEach((shape, index) => {
    for (let i = at(shape.minX); i <= at(shape.maxX); i += 1) for (let j = at(shape.minZ); j <= at(shape.maxZ); j += 1) {
      const key = `${i}:${j}`, list = cells.get(key);
      if (list) list.push(index);
      else cells.set(key, [index]);
    }
  });
  /** The shape (other than `except`) the point is strictly inside, or -1. */
  return (point: Point, except = -1) => {
    for (const index of cells.get(`${at(point.x)}:${at(point.z)}`) ?? []) {
      if (index !== except && isStrictlyInside(shapes[index], point)) return index;
    }
    return -1;
  };
}

function nearestOnSegment(a: Point, b: Point, p: Point): Point {
  const dx = b.x - a.x, dz = b.z - a.z, length = dx * dx + dz * dz;
  const t = length > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length)) : 0;
  return { x: a.x + dx * t, z: a.z + dz * t };
}

function segmentCrossing(one: Edge, two: Edge): Point | null {
  const { a, b } = one, { a: c, b: d } = two;
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, denominator = r.x * s.z - r.z * s.x;
  if (Math.abs(denominator) < 1e-15) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / denominator, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / denominator;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { x: a.x + r.x * t, z: a.z + r.z * t } : null;
}

/** The grown shapes' edges within `reach` of the start, less those lying wholly inside another grown shape. */
function exposedEdges(shapes: readonly Shape[], start: Point, reach: number, insideOf: ReturnType<typeof gridOf>): Edge[] {
  return shapes.flatMap((shape, index) => shape.points.map((a, at): Edge => {
    const b = shape.points[(at + 1) % shape.points.length];
    return { a, b, shape: index, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  })).filter((edge) => {
    const nearest = nearestOnSegment(edge.a, edge.b, start);
    if (Math.hypot(nearest.x - start.x, nearest.z - start.z) > reach) return false;
    // Both ends inside one convex shape: the whole edge is.
    const inside = insideOf(edge.a, edge.shape);
    return inside < 0 || !isStrictlyInside(shapes[inside], edge.b);
  });
}

/** The places a nearest clear place may be: the start, each exposed edge's nearest point and ends, and their crossings. */
function candidates(start: Point, edges: Edge[]): Point[] {
  const found: Point[] = [start, ...edges.flatMap((edge) => [nearestOnSegment(edge.a, edge.b, start), edge.a, edge.b])];
  const byX = [...edges].sort((one, two) => one.minX - two.minX);
  for (let first = 0; first < byX.length; first += 1) {
    const one = byX[first];
    for (let second = first + 1; second < byX.length && byX[second].minX <= one.maxX; second += 1) {
      const two = byX[second];
      if (one.shape === two.shape || two.minZ > one.maxZ || two.maxZ < one.minZ) continue;
      const crossing = segmentCrossing(one, two);
      if (crossing) found.push(crossing);
    }
  }
  return found;
}

function isInsideRing(point: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [current, before] = [ring[index], ring[previous]];
    if (current.z > point.z !== before.z > point.z && point.x < ((before.x - current.x) * (point.z - current.z)) / (before.z - current.z) + current.x) inside = !inside;
  }
  return inside;
}

/**
 * The nearest place to `start` within `reach` metres where the footprint (convex, about its centre, its own mirror) is clear
 * of every obstacle (convex shapes or segments), its centre is inside `within`, and `fits` accepts it; or null.
 */
export function findNearestClearPlace(
  footprint: readonly Point[], obstacles: ReadonlyArray<readonly Point[]>, start: Point, reach: number,
  fits: (x: number, z: number) => boolean, within: readonly Point[]
): [number, number] | null {
  const outline = convexHull(footprint);
  const shapes = obstacles.map((obstacle) => boxed(convexHull(obstacle.flatMap((o) => outline.map((f) => ({ x: o.x + f.x, z: o.z + f.z }))))));
  const span = Math.max(...outline.map(({ x, z }) => Math.hypot(x, z)));
  const insideOf = gridOf(shapes, Math.max(0.05, span / 2));
  const ordered = candidates(start, exposedEdges(shapes, start, reach, insideOf))
    .map((point) => ({ point, distance: Math.hypot(point.x - start.x, point.z - start.z) }))
    .filter(({ distance }) => distance <= reach + 1e-12)
    .sort((first, second) => first.distance - second.distance);
  for (const { point } of ordered) {
    if (!isInsideRing(point, within) || insideOf(point) >= 0) continue;
    if (fits(point.x, point.z)) return [point.x, point.z];
  }
  return null;
}
