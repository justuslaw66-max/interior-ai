import type { RoomPlanPolygonPoint } from "@/lib/room-types";
import type { OutlineEdges } from "@/lib/room-outline-edges";

/**
 * An imported room's outline with each arc in the slices its 3D view draws it in (lib/floor-plan-render-model.ts: π/32 of its
 * sweep each; the room's outline takes it in π/16 chords, which stand up to a few cm off the drawn wall), and each edge's face
 * offset from the centre line (its laminate and half its wall), wall thickness and laminate depth, for furniture
 * (lib/furniture-faces-as-drawn.ts). An arc is a
 * run of two or more edges on one plan wall whose points lie on a circle (they are rounded to the millimetre); its ends are the
 * plan's own points.
 */

type Point = RoomPlanPolygonPoint;

export type SlicedOutline = { points: Point[]; faces: number[]; thicknesses: number[]; panels: number[] };

/** The 3D view's slice of an arc's sweep (segmentWallRange). */
const DRAWN_SLICE_RADIANS = Math.PI / 32;
/** An arc's run of edges is fitted to a circle its points are within this of. */
const ARC_FIT_METERS = 0.002;

type Arc = { cx: number; cz: number; radius: number; start: number; sweep: number };

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
  return { cx, cz, radius, start: Math.atan2(first.z - cz, first.x - cx), sweep };
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

/** The arc's points as the 3D view slices it, its start included, its end (the next edge's start) not. */
function slicePoints(arc: Arc, start: Point): Point[] {
  const slices = Math.max(1, Math.ceil(Math.abs(arc.sweep) / DRAWN_SLICE_RADIANS));
  return [start, ...Array.from({ length: slices - 1 }, (_, index) => {
    const angle = arc.start + (arc.sweep * (index + 1)) / slices;
    return { x: arc.cx + arc.radius * Math.cos(angle), z: arc.cz + arc.radius * Math.sin(angle) };
  })];
}

export function sliceImportedArcs(edges: OutlineEdges): SlicedOutline | null {
  const { outline } = edges, count = outline.length;
  if (edges.panels.length !== count) return null;
  const thickness = (index: number) => edges.thicknesses?.[index] ?? edges.wallThickness;
  const arcs = new Map<number, { points: Point[]; length: number }>();
  for (const [start, length] of edges.wallIds?.length === count ? wallRuns(edges.wallIds) : []) {
    const run = Array.from({ length: length + 1 }, (_, index) => outline[(start + index) % count]);
    const arc = fitArc(run);
    if (arc) arcs.set(start, { points: slicePoints(arc, run[0]), length });
  }
  const covered = new Set([...arcs].flatMap(([start, { length }]) => Array.from({ length }, (_, index) => (start + index) % count)));
  const sliced: SlicedOutline = { points: [], faces: [], thicknesses: [], panels: [] };
  const push = (point: Point, index: number) => {
    sliced.points.push(point);
    sliced.faces.push((edges.panels[index] ?? 0) + thickness(index) / 2);
    sliced.thicknesses.push(thickness(index));
    sliced.panels.push(edges.panels[index] ?? 0);
  };
  for (let index = 0; index < count; index += 1) {
    const arc = arcs.get(index);
    if (arc) arc.points.forEach((point) => push(point, index));
    else if (!covered.has(index)) push(outline[index], index);
  }
  return sliced;
}
