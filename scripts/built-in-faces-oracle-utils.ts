import { getRoomPlanOutlinePoints } from "../lib/room-finished-outline";
import type { RoomSnapshot } from "../lib/room-types";
import { getRoomWallFinishDepths, getRoomWallFaceIds } from "../lib/room-wall-finish-depths";

/**
 * The built-in region by its definition (lib/room-built-in-region.ts), for scripts/test-built-in-faces-oracle.ts: a point is
 * in it when it is inside the room's outline, outside its columns, and outside every wall's band (from its centre line to its
 * face along its edge) and corner (where two walls turn away from the room, past both their ends and inside both their faces,
 * within a wall's thickness of the corner; where a wall runs straight back along the last, half the wall past the end). Point
 * by point, by inequalities; its solids as polygons by their bounding lines' crossings; distances by brute force.
 */

export type P = { x: number; z: number };
export type Wall = { a: P; dx: number; dz: number; nx: number; nz: number; length: number; face: number; bounds: [number, number, number, number] };
export type Region = { outline: P[]; holes: P[][]; walls: Wall[]; thickness: number; solids?: P[][] };
export const EPS = 1e-9;
export const strictly = (value: number, low: number, high: number) => value > low + EPS && value < high - EPS;
export function insideRing(point: P, ring: readonly P[]): boolean {
  let inside = false;
  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    if (current.z > point.z !== previous.z > point.z && point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x) inside = !inside;
  });
  return inside;
}

export function regionOf(room: RoomSnapshot): Region {
  const shape = room.planShape ?? "rectangle";
  const outline = getRoomPlanOutlinePoints({ shape, polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth });
  const faceIds = getRoomWallFaceIds({ shape, polygon: room.planPolygon });
  const depths = getRoomWallFinishDepths(room), thickness = room.geometry.wallThickness ?? 0.12;
  const sign = outline.reduce((sum, point, index) => sum + point.x * outline[(index + 1) % outline.length].z - outline[(index + 1) % outline.length].x * point.z, 0) >= 0 ? 1 : -1;
  const walls = outline.flatMap((a, index): Wall[] => {
    const b = outline[(index + 1) % outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
    if (!(length > 1e-9)) return [];
    const face = thickness / 2 + (depths[faceIds[index]] ?? 0), reach = thickness + face;
    const xs = [a.x, b.x], zs = [a.z, b.z];
    return [{ a, dx: (b.x - a.x) / length, dz: (b.z - a.z) / length, nx: (-(b.z - a.z) / length) * sign, nz: ((b.x - a.x) / length) * sign, length, face,
      bounds: [Math.min(...xs) - reach, Math.max(...xs) + reach, Math.min(...zs) - reach, Math.max(...zs) + reach] }];
  });
  return { outline, holes: room.planHoles ?? [], walls, thickness };
}

/** True when the corner where `before` ends and `after` starts holds the point. */
function inCorner(region: Region, before: Wall, after: Wall, point: P): boolean {
  const c = after.a, along = (wall: Wall) => (point.x - c.x) * wall.dx + (point.z - c.z) * wall.dz;
  const across = (wall: Wall) => (point.x - c.x) * wall.nx + (point.z - c.z) * wall.nz;
  const t = region.thickness;
  if (Math.abs(before.dx * after.dz - before.dz * after.dx) < 0.00001) {
    if (before.dx * after.dx + before.dz * after.dz > 0) return false;
    return (strictly(along(before), 0, t / 2) && strictly(across(before), 0, t / 2)) || (strictly(along(after), -t / 2, 0) && strictly(across(after), 0, t / 2));
  }
  return strictly(along(before), 0, t) && strictly(along(after), -t, 0) && strictly(across(before), 0, before.face) && strictly(across(after), 0, after.face);
}

export function inRegion(region: Region, point: P, walls = region.walls): boolean {
  if (!insideRing(point, region.outline) || region.holes.some((hole) => insideRing(point, hole))) return false;
  return !walls.some((wall) => {
    const u = (point.x - wall.a.x) * wall.dx + (point.z - wall.a.z) * wall.dz, v = (point.x - wall.a.x) * wall.nx + (point.z - wall.a.z) * wall.nz;
    if (strictly(u, 0, wall.length) && strictly(v, 0, wall.face)) return true;
    const next = region.walls[(region.walls.indexOf(wall) + 1) % region.walls.length];
    return inCorner(region, wall, next, point);
  });
}

// --- A run's frame -----------------------------------------------------------------------------------------------------------
export type Run = { x: number; z: number; width: number; depth: number; rotationY: number };
export const toWorld = (run: Run, along: number, across: number): P => ({
  x: run.x + along * Math.cos(run.rotationY) + across * Math.sin(run.rotationY), z: run.z - along * Math.sin(run.rotationY) + across * Math.cos(run.rotationY),
});
/** A corner's solids as polygons: their bounding lines' crossings that keep every bound, in order round their middle. */
function cornerPolygon(region: Region, before: Wall, after: Wall): P[][] {
  const c = after.a, t = region.thickness;
  const parallel = Math.abs(before.dx * after.dz - before.dz * after.dx) < 0.00001;
  if (parallel && before.dx * after.dx + before.dz * after.dz > 0) return [];
  // Each bound: a direction and its range, along the corner's walls from the corner.
  const bounds: Array<[number, number, number, number][]> = parallel
    ? [[[before.dx, before.dz, 0, t / 2], [before.nx, before.nz, 0, t / 2]], [[after.dx, after.dz, -t / 2, 0], [after.nx, after.nz, 0, t / 2]]]
    : [[[before.dx, before.dz, 0, t], [after.dx, after.dz, -t, 0], [before.nx, before.nz, 0, before.face], [after.nx, after.nz, 0, after.face]]];
  return bounds.flatMap((set) => {
    const lines = set.flatMap(([ax, az, low, high]) => [[ax, az, low], [ax, az, high]] as const);
    const points: P[] = [];
    lines.forEach(([ax, az, value], first) => lines.slice(first + 1).forEach(([bx, bz, other]) => {
      const det = ax * bz - az * bx;
      if (Math.abs(det) < 1e-12) return;
      const point = { x: c.x + (value * bz - other * az) / det, z: c.z + (ax * other - bx * value) / det };
      if (set.every(([dx, dz, low, high]) => { const v = (point.x - c.x) * dx + (point.z - c.z) * dz; return v >= low - 1e-12 && v <= high + 1e-12; })) points.push(point);
    }));
    if (points.length < 3) return [];
    const middle = { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, z: points.reduce((sum, point) => sum + point.z, 0) / points.length };
    return [points.sort((a, b) => Math.atan2(a.z - middle.z, a.x - middle.x) - Math.atan2(b.z - middle.z, b.x - middle.x))];
  });
}

/** Every solid as a polygon: the bands, the corners and the columns. */
export function solidsOf(region: Region): P[][] {
  const bands = region.walls.map((wall) => [0, wall.length].flatMap((u, end) => (end ? [0, wall.face] : [wall.face, 0]).map((v) =>
    ({ x: wall.a.x + wall.dx * u + wall.nx * v, z: wall.a.z + wall.dz * u + wall.nz * v }))));
  return [...bands, ...region.walls.flatMap((wall, index) => cornerPolygon(region, wall, region.walls[(index + 1) % region.walls.length])), ...region.holes];
}

/**
 * A solid's part in front of the run's face (more than a ten-thousandth of a mm), in the run's frame: [along, from the face].
 * The convex hull of its corners there and its edges' crossings of that line.
 */
export function inFrontOfFace(run: Run, back: number, solid: readonly P[]): Array<[number, number]> {
  const edge = 0.0000001;
  const local = solid.map((point): [number, number] => {
    const dx = point.x - run.x, dz = point.z - run.z;
    return [dx * Math.cos(run.rotationY) - dz * Math.sin(run.rotationY), dx * Math.sin(run.rotationY) + dz * Math.cos(run.rotationY) + run.depth / 2 + back];
  });
  const kept = local.filter(([, y]) => y >= edge);
  local.forEach(([a, y], index) => {
    const [na, ny] = local[(index + 1) % local.length];
    if ((y >= edge) !== (ny >= edge)) kept.push([a + ((na - a) * (edge - y)) / (ny - y), edge]);
  });
  return kept;
}

/** The distance from a point to a segment, in the run's frame. */
function pointToSegment([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

/**
 * How far the points (a solid's part in front of the face) stand from the box [a0, a1] × [y0, y1] in the run's frame: zero
 * when one is inside; otherwise the nearest of the points (and, when a box edge runs between two, that edge).
 */
export function distanceToBox(points: Array<[number, number]>, [a0, a1, y0, y1]: [number, number, number, number]): number {
  if (!points.length) return Number.POSITIVE_INFINITY;
  const corners: Array<[number, number]> = [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
  const hull = points.length > 2 ? convexHull(points) : points;
  const insideHull = (point: [number, number]) => hull.length > 2 && hull.every((start, index) => {
    const end = hull[(index + 1) % hull.length];
    return (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]) >= -1e-15;
  });
  if (points.some(([a, y]) => a >= a0 && a <= a1 && y >= y0 && y <= y1) || corners.some(insideHull)) return 0;
  const sides = corners.map((corner, index): [[number, number], [number, number]] => [corner, corners[(index + 1) % 4]]);
  const hullSides = hull.map((point, index): [[number, number], [number, number]] => [point, hull[(index + 1) % hull.length]]);
  return Math.min(...hull.flatMap((point) => sides.map(([a, b]) => pointToSegment(point, a, b))),
    ...corners.flatMap((corner) => hullSides.map(([a, b]) => pointToSegment(corner, a, b))));
}

function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Array<[number, number]>) => list.reduce<Array<[number, number]>>((hull, point) => {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], point) <= 0) hull.pop();
    hull.push(point);
    return hull;
  }, []);
  const lower = half(sorted), upper = half([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

