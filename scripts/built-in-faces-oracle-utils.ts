import {
  buildLegacyWallBandsForTest,
  buildWallParts,
  getWallInteriorSurfaceSide,
  getWallSegments,
  getWallSurfaceFaceId,
  joinedLegacyWallSurfacePart,
  legacyWallDirection,
} from "../components/editor/renderers/house-plan-3d/geometry";
import type { HousePlanRoom2D } from "../lib/design-page-house-plan";
import { getRoomPlanOutlinePoints } from "../lib/room-finished-outline";
import type { RoomSnapshot } from "../lib/room-types";
import { getRoomWallFinishDepths } from "../lib/room-wall-finish-depths";

/**
 * Where a built-in may stand, as the 3D view draws the room, for scripts/test-built-in-faces-oracle.ts: inside the room's
 * outline, outside its columns, outside its walls (the 3D view's own wall bands, buildLegacyWallBandsForTest: each wall's
 * core with its ends run on) and outside its laminate panels (each the box the 3D view draws, joinedLegacyWallSurfacePart).
 * Nothing here reads lib/room-built-in-region.ts. Point tests by crossings; distances by brute force over the solids' edges.
 */

export type P = { x: number; z: number };
type Segment = { a: P; b: P; bounds: [number, number, number, number] };
type Band = { outer: P[]; holes: P[][] };
export type Region = { outline: P[]; bands: Band[]; others: P[][]; vertices: P[]; edges: Segment[]; thickness: number; filled: boolean };
export const EPS = 1e-9;

export function insideRing(point: P, ring: readonly P[]): boolean {
  let inside = false;
  ring.forEach((current, index) => {
    const previous = ring[(index + ring.length - 1) % ring.length];
    if (current.z > point.z !== previous.z > point.z && point.x < ((previous.x - current.x) * (point.z - current.z)) / (previous.z - current.z) + current.x) inside = !inside;
  });
  return inside;
}

export function toPlanRoom(room: RoomSnapshot): HousePlanRoom2D {
  return {
    id: room.id, name: room.name, roomType: room.roomType, x: 0, z: 0, w: room.geometry.width, d: room.geometry.depth, height: room.geometry.height,
    wallThickness: room.geometry.wallThickness, shape: room.planShape ?? "rectangle", polygon: room.planPolygon, holes: room.planHoles, surfaces: room.surfaces,
  };
}

/** The panels' boxes as the 3D view draws them: along the joined face, from the wall's face its finish depth in. */
function panelBoxes(room: RoomSnapshot, plan: HousePlanRoom2D, thickness: number): P[][] {
  const depths = getRoomWallFinishDepths(room);
  return getWallSegments(plan).flatMap((segment) => {
    // A wall too short to draw (no parts) has no panel either.
    const depth = depths[getWallSurfaceFaceId(plan, segment)] ?? 0;
    if (!(depth > 0) || !buildWallParts(segment, []).length) return [];
    const side = getWallInteriorSurfaceSide(segment), [dx, dz] = legacyWallDirection(segment), nx = -dz * side, nz = dx * side;
    const joined = joinedLegacyWallSurfacePart(plan, segment, { key: `${segment.key}:oracle`, x: segment.x, z: segment.z, length: segment.length }, side, thickness);
    const [from, to] = [joined.centerDelta - joined.length / 2, joined.centerDelta + joined.length / 2];
    const at = (along: number, across: number) => ({ x: segment.x + dx * along + nx * across, z: segment.z + dz * along + nz * across });
    return [[at(from, thickness / 2), at(to, thickness / 2), at(to, thickness / 2 + depth), at(from, thickness / 2 + depth)]];
  });
}

export function regionOf(room: RoomSnapshot): Region {
  const plan = toPlanRoom(room), thickness = room.geometry.wallThickness ?? 0.12;
  const outline = getRoomPlanOutlinePoints({ shape: room.planShape ?? "rectangle", polygon: room.planPolygon, w: room.geometry.width, d: room.geometry.depth });
  const bands = buildLegacyWallBandsForTest({ rooms: [plan], openings: [], defaultWallHeight: 2.6, stackedFloors: false })
    .filter((band) => band.bottomMeters <= 0.1 && band.topMeters >= 0.1).flatMap((band) => band.polygons);
  const toMetres = (ring: ReadonlyArray<{ xMm: number; zMm: number }>) => ring.map((point) => ({ x: point.xMm / 1000, z: point.zMm / 1000 }));
  const walls = bands.map((band) => ({ outer: toMetres(band.outer), holes: band.holes.map(toMetres) }));
  const others = [...panelBoxes(room, plan, thickness), ...(room.planHoles ?? [])];
  const rings = [...walls.flatMap((band) => [band.outer, ...band.holes]), ...others];
  const edges = rings.flatMap((ring) => ring.map((a, index) => {
    const b = ring[(index + 1) % ring.length];
    return { a, b, bounds: [Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(a.z, b.z), Math.max(a.z, b.z)] as [number, number, number, number] };
  }));
  // The walls' union always leaves the room as a hole in it, unless it fails to (filled: then it can't be the reference).
  return { outline, bands: walls, others, vertices: [...outline, ...rings.flat()], edges, thickness, filled: !walls.some((band) => band.holes.length) };
}

/** True when the point is in the room and in no solid: no wall band (inside its outline, not in a hole of it), panel or column. */
export function inRegion(region: Region, point: P): boolean {
  if (!insideRing(point, region.outline)) return false;
  return !region.bands.some((band) => insideRing(point, band.outer) && !band.holes.some((hole) => insideRing(point, hole))) &&
    !region.others.some((ring) => insideRing(point, ring));
}

// --- A run's frame -----------------------------------------------------------------------------------------------------------
export type Run = { x: number; z: number; width: number; depth: number; rotationY: number };
export const toWorld = (run: Run, along: number, across: number): P => ({
  x: run.x + along * Math.cos(run.rotationY) + across * Math.sin(run.rotationY), z: run.z - along * Math.sin(run.rotationY) + across * Math.cos(run.rotationY),
});
/** A point in the run's frame: [along from its middle, out from its face], its back `back` off the face. */
export function toRun(run: Run, back: number, point: P): [number, number] {
  const dx = point.x - run.x, dz = point.z - run.z;
  return [dx * Math.cos(run.rotationY) - dz * Math.sin(run.rotationY), dx * Math.sin(run.rotationY) + dz * Math.cos(run.rotationY) + run.depth / 2 + back];
}

/**
 * The solids' edges in front of the run's back that a run sliding along its face would meet: those crossing the band from its
 * back to its front (more than a thousandth of a mm in), or with `pastFront` any that reach past its back; or past its face,
 * `from` 0. Cut 0.005 mm behind it, as the 3D view's bands are drawn to 0.001 mm: cut at it, the next wall's face at a bend of
 * a few hundredths of a degree would start half a millimetre off. In the run's frame.
 */
export function edgesItMeets(region: Region, run: Run, back: number, pastFront = false, from = back): Array<[[number, number], [number, number]]> {
  const edge = from - 0.000005, low = from + 0.000001;
  const high = pastFront ? Number.POSITIVE_INFINITY : back + run.depth - 0.000001;
  return region.edges.flatMap(({ a, b }) => {
    let [p, q] = [toRun(run, back, a), toRun(run, back, b)];
    if (p[1] < edge && q[1] < edge) return [];
    if (p[1] < edge || q[1] < edge) {
      const t = (edge - p[1]) / (q[1] - p[1]), cut: [number, number] = [p[0] + (q[0] - p[0]) * t, edge];
      [p, q] = p[1] < edge ? [cut, q] : [p, cut];
    }
    // The run's own face isn't in front of it: the 3D view's bands are rounded to a thousandth of a mm, and their union leaves
    // corners up to a few thousandths off the face.
    if (Math.max(p[1], q[1]) < 0.000005) return [];
    return Math.min(p[1], q[1]) <= high && Math.max(p[1], q[1]) >= low ? [[p, q]] : [];
  });
}

function pointToSegment([px, py]: [number, number], [ax, ay]: [number, number], [bx, by]: [number, number]): number {
  const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
  const t = length > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / length)) : 0;
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}

function segmentsCross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const side = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return side(a, b, c) * side(a, b, d) <= 0 && side(c, d, a) * side(c, d, b) <= 0;
}

/** How far the edges stand from the box [a0, a1] × [y0, y1] in the run's frame (zero where one enters or crosses it). */
export function distanceToBox(edges: Array<[[number, number], [number, number]]>, [a0, a1, y0, y1]: [number, number, number, number]): number {
  const corners: Array<[number, number]> = [[a0, y0], [a1, y0], [a1, y1], [a0, y1]];
  const sides = corners.map((corner, index): [[number, number], [number, number]] => [corner, corners[(index + 1) % 4]]);
  const inside = ([a, y]: [number, number]) => a >= a0 && a <= a1 && y >= y0 && y <= y1;
  return Math.min(Number.POSITIVE_INFINITY, ...edges.map(([p, q]) => {
    if (inside(p) || inside(q) || sides.some(([c, d]) => segmentsCross(p, q, c, d))) return 0;
    return Math.min(...sides.flatMap(([c, d]) => [pointToSegment(p, c, d), pointToSegment(q, c, d)]), ...corners.map((corner) => pointToSegment(corner, p, q)));
  }));
}

// --- Where the 3D view draws a face ------------------------------------------------------------------------------------------
/** A line's frame: a point in the plan as [along it, out from it to the room's side], and back. */
export type LineFrame = { frame: (point: P) => [number, number]; at: (along: number, across: number) => P };
/** An exposed stretch along a line, and how much less exactly each end is known (where a wall ending it is all but parallel). */
export type Stretch = { from: number; to: number; slackFrom: number; slackTo: number };

const PROBE = 0.000005;

/**
 * Where a line is a face as the 3D view draws it, from `from` to `to` along it: a solid just behind it (0.005 mm, as the 3D view's
 * bands are drawn to 0.001 mm and their union leaves corners a few thousandths off), none just in front, none standing on it
 * (within 0.002 mm, however low: a panel's corner past a bend), inside the room. Exact: tested between each place a solid's
 * edge crosses those lines or comes onto the line; gaps under 0.01 mm (where solids meet) are passed over, and stretches
 * under 1 mm aren't faces. Where
 * a wall ending a stretch is all but parallel to the line, its end is known only to 0.006 mm over that wall's slope, `slack`.
 */
export function exposedOnLine(region: Region, { frame, at }: LineFrame, from: number, to: number): Stretch[] {
  const rings = [region.outline, ...region.bands.flatMap((band) => [band.outer, ...band.holes]), ...region.others];
  const cuts: Array<{ along: number; slope: number }> = [];
  const standing: Array<[number, number]> = [];
  rings.forEach((ring, ringIndex) => ring.forEach((point, index) => {
    const [p, q] = [frame(point), frame(ring[(index + 1) % ring.length])];
    const slope = Math.abs(q[1] - p[1]) / Math.max(1e-12, Math.abs(q[0] - p[0]));
    for (const level of [-PROBE, PROBE]) {
      if ((p[1] - level) * (q[1] - level) > 0 || p[1] === q[1]) continue;
      cuts.push({ along: p[0] + ((q[0] - p[0]) * (level - p[1])) / (q[1] - p[1]), slope });
    }
    // A solid's edge that comes onto the line from in front: its part within 0.002 mm of it (not the face itself, nor a corner
    // a few thousandths off it, which reach no further out).
    if (ringIndex === 0 || Math.max(p[1], q[1]) < PROBE || Math.min(p[1], q[1]) > 0.000002) return;
    const [low, high] = [(-PROBE - p[1]) / (q[1] - p[1]), (0.000002 - p[1]) / (q[1] - p[1])].sort((a, b) => a - b);
    const ends = [Math.max(0, low), Math.min(1, high)].map((value) => p[0] + (q[0] - p[0]) * value);
    standing.push([Math.min(...ends) - 0.000002, Math.max(...ends) + 0.000002]);
    standing[standing.length - 1].forEach((along) => cuts.push({ along, slope }));
  }));
  const exposed = (along: number) => !inRegion(region, at(along, -PROBE)) && insideRing(at(along, -PROBE), region.outline) &&
    inRegion(region, at(along, PROBE)) && !standing.some(([low, high]) => along >= low && along <= high);
  const stops = [from, ...cuts.map(({ along }) => along).filter((along) => along > from && along < to).sort((a, b) => a - b), to];
  const slackAt = (along: number) => Math.min(0.005, Math.max(0, ...cuts.filter((cut) => Math.abs(cut.along - along) < 0.00005).map(({ slope }) => 0.000006 / Math.max(1e-9, slope))));
  const merged: Array<[number, number]> = [];
  stops.slice(1).forEach((stop, index) => {
    const start = stops[index];
    if (!(stop > start) || !exposed((start + stop) / 2)) return;
    const last = merged[merged.length - 1];
    if (last && start - last[1] < 0.00001) last[1] = stop;
    else merged.push([start, stop]);
  });
  // Under 1 mm it holds nothing, and lies where solids meet a few thousandths apart (lib/room-built-in-region.ts's rule too).
  return merged.filter(([start, stop]) => stop - start >= 0.001)
    .map(([start, stop]) => ({ from: start, to: stop, slackFrom: slackAt(start), slackTo: slackAt(stop) }));
}
