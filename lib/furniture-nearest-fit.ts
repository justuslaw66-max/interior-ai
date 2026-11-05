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
 * the places tried are the same. A footprint's search (prepareClearSearch) is kept by the caller, its grid made from the grown
 * shapes' bounds and each shape grown when the search first reaches it, so a drag along a curved wall, or a resize or turn that
 * makes a new footprint each frame, stays within a frame.
 */

type Point = RoomPlanPolygonPoint;
/** A grown shape: its points (counter-clockwise), bounds, edges, and each edge's inward unit normal and offset (n·p > c inside). */
type Shape = { points: Point[]; minX: number; maxX: number; minZ: number; maxZ: number; edges: Edge[] | null; sides: Float64Array };
type Edge = { a: Point; b: Point; shape: Shape; minX: number; maxX: number; minZ: number; maxZ: number };

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

/**
 * The corners of two convex shapes' sum (each counter-clockwise, as convexHull gives it; one may be a segment), walked round both
 * by their edges' directions from their lowest corners: each a corner of one plus a corner of the other, as the sum of every
 * pair would give them, in a few steps for each corner rather than one for each pair.
 */
function convexSum(one: readonly Point[], two: readonly Point[]): Point[] {
  const lowest = (loop: readonly Point[]) => loop.reduce((best, point, index) =>
    (point.z < loop[best].z || (point.z === loop[best].z && point.x < loop[best].x) ? index : best), 0);
  const [n, m] = [one.length, two.length], sums: Point[] = [];
  let [i, j, stepsOne, stepsTwo] = [lowest(one), lowest(two), 0, 0];
  while (stepsOne < n || stepsTwo < m) {
    const a = one[i % n], b = two[j % m], nextA = one[(i + 1) % n], nextB = two[(j + 1) % m];
    sums.push({ x: a.x + b.x, z: a.z + b.z });
    const turn = stepsOne === n ? -1 : stepsTwo === m ? 1 : (nextA.x - a.x) * (nextB.z - b.z) - (nextA.z - a.z) * (nextB.x - b.x);
    if (turn >= 0) [i, stepsOne] = [i + 1, stepsOne + 1];
    if (turn <= 0) [j, stepsTwo] = [j + 1, stepsTwo + 1];
  }
  return sums;
}

/** A shape `obstacle` grown by `outline` (convexHull's), as the hull of every corner of one plus every corner of the other. */
function grownBy(obstacle: readonly Point[], outline: readonly Point[]): Point[] {
  const hull = convexHull(obstacle);
  // A point, or a segment or shape with a corner twice: every pair, as a sum walked by edges needs edges of some length.
  const walkable = hull.length >= 2 && outline.length >= 3 && hull.every((point, index) => {
    const next = hull[(index + 1) % hull.length];
    return point.x !== next.x || point.z !== next.z;
  });
  return convexHull(walkable ? convexSum(hull, outline) : obstacle.flatMap((o) => outline.map((f) => ({ x: o.x + f.x, z: o.z + f.z }))));
}

function boxed(points: Point[]): Shape {
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const { x, z } of points) [minX, maxX, minZ, maxZ] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minZ, z), Math.max(maxZ, z)];
  const sides = new Float64Array(points.length * 3);
  points.forEach((start, index) => {
    const end = points[(index + 1) % points.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    // cross(start, end, p) / length = n·p - c, with n the edge's left normal: 0 for an edge of no length (always passes).
    const [nx, nz] = length > 0 ? [-(end.z - start.z) / length, (end.x - start.x) / length] : [0, 0];
    sides.set([nx, nz, length > 0 ? nx * start.x + nz * start.z : -Infinity], index * 3);
  });
  return { points, minX, maxX, minZ, maxZ, edges: null, sides };
}

/** A shape's edges, made the first time a search pairs them (a shape only looked inside never needs them). */
function edgesOf(shape: Shape): Edge[] {
  shape.edges ??= shape.points.map((a, at) => {
    const b = shape.points[(at + 1) % shape.points.length];
    return { a, b, shape, minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x), minZ: Math.min(a.z, b.z), maxZ: Math.max(a.z, b.z) };
  });
  return shape.edges;
}

function isStrictlyInside(shape: Shape, point: Point): boolean {
  if (shape.points.length < 3 || point.x <= shape.minX || point.x >= shape.maxX || point.z <= shape.minZ || point.z >= shape.maxZ) return false;
  const { sides } = shape;
  for (let index = 0; index < sides.length; index += 3) {
    if (!(sides[index] * point.x + sides[index + 1] * point.z - sides[index + 2] > INSIDE_EPSILON)) return false;
  }
  return true;
}

/**
 * An obstacle's place in a search: the bounds of its grown shape (the obstacle's plus the footprint's, as the shape's own are)
 * and the shape, grown the first time the search reaches it (most of a room's are never near the place sought).
 */
type Entry = { obstacle: readonly Point[]; minX: number; maxX: number; minZ: number; maxZ: number; shape: Shape | null };

/** The entries by a grid of their bounds, for the shapes a point may be in. */
function gridOf(entries: readonly Entry[], cell: number, shapeOf: (entry: Entry) => Shape) {
  const cells = new Map<number, Entry[]>();
  const at = (value: number) => Math.floor(value / cell), key = (i: number, j: number) => i * 1048576 + j;
  for (const entry of entries) {
    for (let i = at(entry.minX); i <= at(entry.maxX); i += 1) for (let j = at(entry.minZ); j <= at(entry.maxZ); j += 1) {
      const list = cells.get(key(i, j));
      if (list) list.push(entry);
      else cells.set(key(i, j), [entry]);
    }
  }
  /** The shape (other than `except`) the point is strictly inside, or null. */
  return (point: Point, except?: Shape): Shape | null => {
    for (const entry of cells.get(key(at(point.x), at(point.z))) ?? []) {
      if (point.x <= entry.minX || point.x >= entry.maxX || point.z <= entry.minZ || point.z >= entry.maxZ) continue;
      const shape = shapeOf(entry);
      if (shape !== except && isStrictlyInside(shape, point)) return shape;
    }
    return null;
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
function exposedEdges(search: ClearSearch, start: Point, reach: number): Edge[] {
  const edges: Edge[] = [];
  for (const entry of search.entries) {
    // Only the shapes reaching within `reach` of the start, by their bounds, have edges that may.
    if (entry.minX - start.x > reach || start.x - entry.maxX > reach || entry.minZ - start.z > reach || start.z - entry.maxZ > reach) continue;
    for (const edge of edgesOf(search.shapeOf(entry))) if (isExposed(search, edge, start, reach)) edges.push(edge);
  }
  return edges;
}

function isExposed(search: ClearSearch, edge: Edge, start: Point, reach: number): boolean {
  if (edge.minX - start.x > reach || start.x - edge.maxX > reach || edge.minZ - start.z > reach || start.z - edge.maxZ > reach) return false;
  const nearest = nearestOnSegment(edge.a, edge.b, start);
  if (Math.hypot(nearest.x - start.x, nearest.z - start.z) > reach) return false;
  // Both ends inside one convex shape: the whole edge is.
  const inside = search.insideOf(edge.a, edge.shape);
  return !inside || !isStrictlyInside(inside, edge.b);
}

/**
 * The places a nearest clear place may be: the start, each exposed edge's nearest point and ends, and their crossings. A corner
 * is listed once, where it first comes (the end of one edge and the start of the next).
 */
function candidates(start: Point, edges: Edge[]): Point[] {
  const found: Point[] = [start], seen = new Set<Point>();
  const add = (corner: Point) => {
    if (seen.has(corner)) return;
    seen.add(corner);
    found.push(corner);
  };
  for (const edge of edges) {
    found.push(nearestOnSegment(edge.a, edge.b, start));
    add(edge.a);
    add(edge.b);
  }
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

/** A footprint's obstacles, each grown once for every search with it (a drag's frames keep its size and turn). */
export type ClearSearch = { entries: Entry[]; shapeOf: (entry: Entry) => Shape; insideOf: ReturnType<typeof gridOf> };

// Grown shapes by footprint and obstacle, so a room whose walls are being moved (a wall drag: new faces every frame, most of
// their shapes the same) grows only the shapes that changed. A few footprints, each with a bounded number of shapes.
const grownByFootprint = new Map<string, Map<string, Shape>>();

/** How an entry's shape is grown: the footprint's `outline` summed with its obstacle, kept by obstacle for the footprint `key`. */
function growerOf(outline: readonly Point[], key: string | undefined): (entry: Entry) => Shape {
  const grow = (obstacle: readonly Point[]) => boxed(grownBy(obstacle, outline));
  if (key === undefined) return (entry) => (entry.shape ??= grow(entry.obstacle));
  const known = grownByFootprint.get(key) ?? new Map<string, Shape>();
  grownByFootprint.delete(key);
  grownByFootprint.set(key, known);
  if (grownByFootprint.size > 8) grownByFootprint.delete(grownByFootprint.keys().next().value!);
  if (known.size > 20000) known.clear();
  return (entry) => {
    if (entry.shape) return entry.shape;
    const id = entry.obstacle.map(({ x, z }) => `${x},${z}`).join(";"), kept = known.get(id) ?? grow(entry.obstacle);
    known.set(id, kept);
    return (entry.shape = kept);
  };
}

const boundsOf = (points: readonly Point[]) => points.reduce((bounds, { x, z }) => ({
  minX: Math.min(bounds.minX, x), maxX: Math.max(bounds.maxX, x), minZ: Math.min(bounds.minZ, z), maxZ: Math.max(bounds.maxZ, z),
}), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });

/**
 * The search for a footprint (convex, about its centre, its own mirror) among obstacles (convex shapes or segments); `key` names
 * the footprint, so its grown shapes are kept for other searches with it.
 */
export function prepareClearSearch(footprint: readonly Point[], obstacles: ReadonlyArray<readonly Point[]>, key?: string): ClearSearch {
  const outline = convexHull(footprint), around = boundsOf(outline);
  // A sum's bounds are its parts' summed: the grown shape's (to rounding, far inside the 1e-9 a point must be inside by).
  const entries = obstacles.map((obstacle): Entry => {
    const { minX, maxX, minZ, maxZ } = boundsOf(obstacle);
    return { obstacle, minX: minX + around.minX, maxX: maxX + around.maxX, minZ: minZ + around.minZ, maxZ: maxZ + around.maxZ, shape: null };
  });
  const shapeOf = growerOf(outline, key), span = Math.max(...outline.map(({ x, z }) => Math.hypot(x, z)));
  return { entries, shapeOf, insideOf: gridOf(entries, Math.max(0.05, span / 2), shapeOf) };
}

/**
 * The nearest place to `start` within `reach` metres where the search's footprint is clear of every obstacle, its centre is
 * inside `within`, and `fits` accepts it; or null. Places the same distance away are tried in the order they were found.
 */
export function findNearestClearPlace(
  search: ClearSearch, start: Point, reach: number, fits: (x: number, z: number) => boolean, within: readonly Point[]
): [number, number] | null {
  const found = candidates(start, exposedEdges(search, start, reach));
  const distances = found.map((point) => Math.hypot(point.x - start.x, point.z - start.z));
  const ordered = found.map((_, index) => index).filter((index) => distances[index] <= reach + 1e-12)
    .sort((first, second) => distances[first] - distances[second] || first - second);
  for (const index of ordered) {
    const point = found[index];
    if (search.insideOf(point) || !isInsideRing(point, within)) continue;
    if (fits(point.x, point.z)) return [point.x, point.z];
  }
  return null;
}
