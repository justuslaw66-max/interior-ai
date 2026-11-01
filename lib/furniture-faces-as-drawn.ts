import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import { buildBuiltInRegion } from "@/lib/room-built-in-region";
import { insetPolygonEdges } from "@/lib/polygon-edge-inset";
import type { MovedOutline, OutlineEdges } from "@/lib/room-outline-edges";

/**
 * Where a room's 3D view draws its walls and panels past the faces furniture keeps off (lib/furniture-room-fit.ts: the outline
 * inside the finishes, each edge moved in, mitred), so furniture keeps 2 cm off those too. Each is read from the room's
 * outline (`moved.from`, its walls' centre line), how far each edge was moved in (`moved.by`) and its edges (`edges`,
 * lib/room-outline-edges.ts); `faceInset` is the wall's part of furniture's inset (half the room's wall).
 *
 * - A drawn room (components/editor/renderers/house-plan-3d/geometry.ts): each wall's core runs on half the wall past each end,
 *   and each panel is a box ended where the 3D view joins it to the next wall, so at an outside corner that isn't square a
 *   core's end or a panel's end stands past the other wall's face. They are #245's region's solids (lib/room-built-in-region.ts),
 *   reused as they are.
 * - An imported plan's room (canonical-floor-plan/CanonicalWallSurfaceMesh.tsx): a painted face is drawn as a 1.5 mm skin, and a
 *   laminate's end is cut from the bare walls' crossing to where its front meets that skin, so at an outside corner between a
 *   laminate and paint its tip stands past the painted face (by about 1.5 mm over the sine of the corner's angle).
 * - An imported plan's arc is drawn on its true curve (in slices a quarter of the room outline's), and the outline is its
 *   chords: where the arc bows into the room, the faces follow the arc itself.
 */

type Point = RoomPlanPolygonPoint;

/** The skin an imported plan's 3D view draws a painted face as (WALL_FINISH_SKIN_MM, canonical-floor-plan/geometry.ts). */
export const IMPORTED_PAINT_SKIN_METERS = 0.0015;
/** Turns under this (10°) meet in a step, not a mitre (lib/polygon-edge-inset.ts): no tip stands past them. */
const NEAR_STRAIGHT_SIN = Math.sin((10 * Math.PI) / 180);
/** An arc's run of edges is fitted to a circle its points are within this of (they are rounded to the millimetre). */
const ARC_FIT_METERS = 0.002;
/** The arc's faces are slices of it bowing at most this far from it. */
const ARC_SAGITTA_METERS = 0.0001;
const MAX_ARC_SLICES = 256;

type Line = { x: number; z: number; dx: number; dz: number };

function edgeLine(outline: readonly Point[], index: number, inset: number, side: number): Line | null {
  const a = outline[index], b = outline[(index + 1) % outline.length], length = Math.hypot(b.x - a.x, b.z - a.z);
  if (!(length > 1e-6)) return null;
  const dx = (b.x - a.x) / length, dz = (b.z - a.z) / length;
  return { x: a.x - dz * side * inset, z: a.z + dx * side * inset, dx, dz };
}

function meet(first: Line, second: Line): Point | null {
  const cross = first.dx * second.dz - first.dz * second.dx;
  if (Math.abs(cross) < 1e-9) return null;
  const t = ((second.x - first.x) * second.dz - (second.z - first.z) * second.dx) / cross;
  return { x: first.x + first.dx * t, z: first.z + first.dz * t };
}

/** A drawn room's walls' cores and panels' boxes, as its 3D view draws them (#245's region). */
export function getDrawnWallSolids(moved: MovedOutline, edges: OutlineEdges, faceInset: number): Point[][] {
  const outline = [...moved.from];
  const faceIds = outline.map((_, index) => `wall-${index}`);
  return buildBuiltInRegion(outline, faceIds, edges.panels, 2 * faceInset, []).solids;
}

/**
 * An imported room's laminate tips past its painted faces: at each outside corner between a laminate and paint, the tip's
 * two edges in front of the painted face (from the faces' corner along the laminate's front to its end, then back along its
 * cut to the bare walls' crossing).
 */
export function getImportedLaminateTips(moved: MovedOutline, edges: OutlineEdges, faceInset: number, side: 1 | -1): Point[][] {
  const { from: outline, by } = moved, count = outline.length;
  return outline.flatMap((_, corner) => {
    const before = (corner - 1 + count) % count, after = corner;
    const [panelBefore, panelAfter] = [edges.panels[before] ?? 0, edges.panels[after] ?? 0];
    if (panelBefore > 0 === panelAfter > 0) return [];
    const [laminate, paint] = panelBefore > 0 ? [before, after] : [after, before];
    const face = (index: number, extra = 0) => edgeLine(outline, index, (by[index] ?? 0) + faceInset + extra, side);
    const [front, painted] = [face(laminate), face(paint)];
    if (!front || !painted) return [];
    const [incoming, outgoing] = panelBefore > 0 ? [front, painted] : [painted, front];
    const turn = incoming.dx * outgoing.dz - incoming.dz * outgoing.dx;
    // An outside corner turns away from the room; a near-straight one steps.
    if (turn * side >= 0 || Math.abs(turn) < NEAR_STRAIGHT_SIN) return [];
    const tip = meet(front, painted), end = meet(front, face(paint, IMPORTED_PAINT_SKIN_METERS) ?? painted);
    const bare = face(laminate, -(edges.panels[laminate] ?? 0)), crossing = bare && meet(bare, painted);
    return tip && end && crossing ? [[tip, end, crossing]] : [];
  });
}

type Arc = { cx: number; cz: number; radius: number; start: number; sweep: number; turns: number[] };

/** The circle a run of an imported room's edges (outline points `run`) lies on, when they are an arc's slices. */
function fitArc(run: readonly Point[]): Arc | null {
  const first = run[0], last = run[run.length - 1], chord = Math.hypot(last.x - first.x, last.z - first.z);
  if (run.length < 3 || !(chord > 0.01)) return null;
  // The centre is on the ends' bisector (the ends are the plan's own points), where the points between are nearest its circle.
  const mx = (first.x + last.x) / 2, mz = (first.z + last.z) / 2, nx = -(last.z - first.z) / chord, nz = (last.x - first.x) / chord;
  let top = 0, bottom = 0;
  for (const point of run.slice(1, -1)) {
    const ex = first.x - point.x, ez = first.z - point.z;
    const a = 2 * (nx * ex + nz * ez), b = first.x ** 2 + first.z ** 2 - point.x ** 2 - point.z ** 2 - 2 * (mx * ex + mz * ez);
    top += a * b;
    bottom += a * a;
  }
  if (!(bottom > 0)) return null;
  const cx = mx + (nx * top) / bottom, cz = mz + (nz * top) / bottom, radius = Math.hypot(first.x - cx, first.z - cz);
  if (!(radius < 1000) || run.some((point) => Math.abs(Math.hypot(point.x - cx, point.z - cz) - radius) > ARC_FIT_METERS)) return null;
  const turns = run.slice(1).map((point, index) => {
    const ax = run[index].x - cx, az = run[index].z - cz, bx = point.x - cx, bz = point.z - cz;
    return Math.atan2(ax * bz - az * bx, ax * bx + az * bz);
  });
  const sweep = turns.reduce((sum, turn) => sum + turn, 0);
  if (!turns.every((turn) => turn * sweep > 0) || Math.abs(sweep) >= 2 * Math.PI - 1e-6) return null;
  return { cx, cz, radius, start: Math.atan2(first.z - cz, first.x - cx), sweep, turns };
}

/** The runs of two or more consecutive edges on one plan wall: [first edge, edge count]. */
function wallRuns(wallIds: readonly string[]): Array<[number, number]> {
  const count = wallIds.length;
  const starts = wallIds.map((_, index) => index).filter((index) => wallIds[index] !== wallIds[(index - 1 + count) % count]);
  return starts.map((start): [number, number] => {
    let length = 1;
    while (length < count && wallIds[(start + length) % count] === wallIds[start]) length += 1;
    return [start, length];
  }).filter(([, length]) => length >= 2);
}

type SlicedArc = { points: Point[]; by: number[]; angles: number[] };

/** The run's outline, edges 0..n of the arc replaced by its own slices, each moved in as far as the edge it lies along. */
function sliceArc(arc: Arc, run: readonly Point[], by: readonly number[]): SlicedArc {
  const step = 2 * Math.acos(Math.max(-1, 1 - ARC_SAGITTA_METERS / arc.radius));
  const slices = Math.min(MAX_ARC_SLICES, Math.max(run.length - 1, Math.ceil(Math.abs(arc.sweep) / step)));
  const bounds = arc.turns.reduce<number[]>((sums, turn) => [...sums, sums[sums.length - 1] + turn], [0]);
  const points: Point[] = [run[0]], moved: number[] = [], angles = [arc.start];
  for (let slice = 1; slice <= slices; slice += 1) {
    const angle = (arc.sweep * slice) / slices, middle = (arc.sweep * (slice - 0.5)) / slices;
    const after = bounds.findIndex((bound, index) => index > 0 && Math.abs(bound) >= Math.abs(middle));
    const edge = after > 0 ? after - 1 : arc.turns.length - 1;
    moved.push(by[edge] ?? 0);
    angles.push(arc.start + angle);
    if (slice < slices) points.push({ x: arc.cx + arc.radius * Math.cos(arc.start + angle), z: arc.cz + arc.radius * Math.sin(arc.start + angle) });
  }
  return { points, by: moved, angles };
}

/**
 * The wall in front of an arc bowing into the room, its faces' curve closed by the chord between its ends: a convex shape
 * (inside the arc's circle, the room outside it), so the nearest-fit search takes the arc as one obstacle, not its slices.
 */
function bulgeOf(arc: Arc, sliced: SlicedArc, faceInset: number): Point[] {
  return sliced.angles.map((angle, index) => {
    const radius = arc.radius + Math.max(sliced.by[Math.max(0, index - 1)] ?? 0, sliced.by[Math.min(sliced.by.length - 1, index)] ?? 0) + faceInset;
    return { x: arc.cx + radius * Math.cos(angle), z: arc.cz + radius * Math.sin(angle) };
  });
}

/**
 * An imported room's faces with each arc bowing into the room on its true curve, as furniture's faces are made (the outline
 * moved in by `moved.by`, then by `faceInset`, mitred), and the wall in front of each such arc (bulgeOf), or null when it has
 * none.
 */
export function getImportedArcFaces(
  moved: MovedOutline, edges: OutlineEdges, faceInset: number, side: 1 | -1
): { outer: Point[]; bulges: Point[][] } | null {
  const { from: outline, by } = moved, count = outline.length;
  if (!edges.wallIds || edges.wallIds.length !== count) return null;
  const replaced = new Map<number, SlicedArc & { length: number }>(), bulges: Point[][] = [];
  for (const [start, length] of wallRuns(edges.wallIds)) {
    const run = Array.from({ length: length + 1 }, (_, index) => outline[(start + index) % count]);
    const arc = fitArc(run);
    // It bows into the room where its slices turn away from it (outside corners): points on a circle turn the way it sweeps.
    if (!arc || Math.sign(arc.sweep) !== -side) continue;
    const sliced = sliceArc(arc, run, Array.from({ length }, (_, index) => by[(start + index) % count] ?? 0));
    replaced.set(start, { ...sliced, length });
    bulges.push(bulgeOf(arc, sliced, faceInset));
  }
  if (!replaced.size) return null;
  const points: Point[] = [], offsets: number[] = [];
  const covered = new Set([...replaced].flatMap(([start, { length }]) => Array.from({ length }, (_, index) => (start + index) % count)));
  for (let index = 0; index < count; index += 1) {
    const arc = replaced.get(index);
    if (arc) {
      points.push(...arc.points);
      offsets.push(...arc.by);
    } else if (!covered.has(index)) {
      points.push(outline[index]);
      offsets.push(by[index] ?? 0);
    }
  }
  const inside = insetPolygonEdges(points, offsets, side);
  return { outer: insetPolygonEdges(inside, inside.map(() => faceInset), side), bulges };
}
