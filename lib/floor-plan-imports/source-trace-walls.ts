import type { SourcePointPx as Point } from "./deterministic-evidence";
import { drawingPolylines, toneAt } from "./source-trace-clean";
import type { RegisteredVectorizerDrawing, VectorizerDrawingItem } from "./vectorizer-drawing";

/**
 * Walls as drawn (clean traced drawing, v3; J, 15 Oct: "As drawn"). A wall the plan draws solid - black, painted grey
 * or hatched - stays a solid shape, its faces moved onto the edges of its ink; a wall the plan draws as two lines with
 * paper between (a partition) is drawn as those lines, each where the plan has one.
 */
export const WALL_SETTINGS = Object.freeze({
  /** A wall is drawn as lines when no more than this share of its inside is ink (hatching is more, about 0.15). */
  hollowShare: 0.1,
  /** A side of a hollow wall is drawn when ink runs along this share of it, this close to it (px). */
  sideSupport: 0.6,
  sideReachPx: 2.5,
  /** A solid wall's face moves onto its ink's edge when that edge is found along this share of it, this far at most. */
  faceSupport: 0.6,
  faceShiftPx: 4,
});

const SET = WALL_SETTINGS;
export const WALL_KINDS = ["wall", "partition-fill", "wall-joint", "grey"];

/** A filled item's outline when it is one closed ring, or null. */
export function ring(item: VectorizerDrawingItem): Point[] | null {
  const lines = drawingPolylines(item), line = lines.length === 1 ? lines[0] : undefined;   // (a wall with holes stays as it is)
  const points = line?.points.filter((p, i, all) => Math.hypot(p.x - all[(i + 1) % all.length].x, p.y - all[(i + 1) % all.length].y) > 0.01);
  return line?.closed && points && points.length >= 3 ? points : null;
}

function inside(p: Point, points: Point[]) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

const segmentGap = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** The share of a ring's inside (more than 1.5 px in from its outline) that is ink, or null when it is too thin. */
function insideInk(points: Point[], gray: Uint8Array, width: number, inkTone: number) {
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  let seen = 0, ink = 0;
  for (let y = Math.floor(Math.min(...ys)) + 0.5; y < Math.max(...ys); y += 1) for (let x = Math.floor(Math.min(...xs)) + 0.5; x < Math.max(...xs); x += 1) {
    const p = { x, y };
    if (!inside(p, points) || points.some((a, i) => segmentGap(p, a, points[(i + 1) % points.length]) < 1.5)) continue;
    seen++;
    if (toneAt(gray, width, p) < inkTone) ink++;
  }
  return seen >= 6 ? ink / seen : null;
}

/** Samples along a side about every pixel, its ends left out. */
function sideSamples(a: Point, b: Point) {
  const length = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.floor(length));
  return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * (k + 0.5)) / n, y: a.y + ((b.y - a.y) * (k + 0.5)) / n }));
}

/** Is there ink across the side at a point, within `reach` px along its normal? */
function inkAcross(gray: Uint8Array, width: number, p: Point, n: Point, inkTone: number) {
  for (let o = -SET.sideReachPx; o <= SET.sideReachPx + 1e-9; o += 0.5) if (toneAt(gray, width, { x: p.x + n.x * o, y: p.y + n.y * o }) < inkTone) return true;
  return false;
}

/** A hollow wall's sides that the plan draws, as line items (each then goes onto its ink with the drawing's lines). */
function drawnSides(item: VectorizerDrawingItem, points: Point[], gray: Uint8Array, width: number, inkTone: number): VectorizerDrawingItem[] {
  return points.flatMap((a, i) => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 2) return [];
    const n = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }, samples = sideSamples(a, b);
    const inked = samples.filter((p) => inkAcross(gray, width, p, n, inkTone)).length;
    return inked >= SET.sideSupport * samples.length
      ? [{ kind: `${item.kind}-side`, fill: false, strokeWidthPx: 1, commands: ["L"], points: [a, b] } as VectorizerDrawingItem] : [];
  });
}

/** Where a solid wall's ink ends across one face: the crossing from ink (inside) to paper (outside, along the outward
 * normal `n`) nearest the face, as an offset; null when there is none within reach (the face meets another wall). */
export function inkEdge(gray: Uint8Array, width: number, p: Point, n: Point, level: number) {
  let best: number | null = null, previous = toneAt(gray, width, { x: p.x - n.x * SET.faceShiftPx, y: p.y - n.y * SET.faceShiftPx });
  for (let o = -SET.faceShiftPx + 0.25; o <= SET.faceShiftPx + 1e-9; o += 0.25) {
    const tone = toneAt(gray, width, { x: p.x + n.x * o, y: p.y + n.y * o });
    const edge = previous < level && tone >= level ? o - 0.25 + (0.25 * (level - previous)) / Math.max(1e-6, tone - previous) : null;
    if (edge !== null && (best === null || Math.abs(edge) < Math.abs(best))) best = edge;
    previous = tone;
  }
  return best;
}

/** How far each face of a solid wall moves out (+) or in (-) onto its ink's edge (0 where it is not found). */
function faceShifts(points: Point[], outward: number, gray: Uint8Array, width: number, level: number) {
  return points.map((a, i) => {
    const b = points[(i + 1) % points.length], length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length < 3) return 0;
    const n = { x: (outward * (b.y - a.y)) / length, y: (-outward * (b.x - a.x)) / length }, samples = sideSamples(a, b);
    const edges = samples.map((p) => inkEdge(gray, width, p, n, level)).filter((o): o is number => o !== null).sort((x, y) => x - y);
    if (edges.length < SET.faceSupport * samples.length) return 0;
    const shift = edges[Math.floor(edges.length / 2)];
    return Math.abs(shift) >= 0.3 ? shift : 0;
  });
}

/** The ring with each side moved along its outward normal by its shift, each corner where its two sides now cross. */
function shiftedRing(points: Point[], shifts: number[], outward: number) {
  const k = points.length, line = (i: number) => {
    const a = points[i], b = points[(i + 1) % k], length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const n = { x: (outward * (b.y - a.y)) / length, y: (-outward * (b.x - a.x)) / length };
    return { p: { x: a.x + n.x * shifts[i], y: a.y + n.y * shifts[i] }, d: { x: (b.x - a.x) / length, y: (b.y - a.y) / length }, n };
  };
  return points.map((corner, i) => {
    const before = line((i - 1 + k) % k), after = line(i), cross = before.d.x * after.d.y - before.d.y * after.d.x;
    if (Math.abs(cross) < 0.1) return { x: corner.x + after.n.x * shifts[i], y: corner.y + after.n.y * shifts[i] };
    const t = ((after.p.x - before.p.x) * after.d.y - (after.p.y - before.p.y) * after.d.x) / cross;
    return { x: before.p.x + before.d.x * t, y: before.p.y + before.d.y * t };
  });
}

/** A solid wall with its faces on its ink's edges (corners moved at most twice the face shift), or as it was. */
function facesOnInk(item: VectorizerDrawingItem, points: Point[], gray: Uint8Array, width: number, level: number) {
  const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length].y - points[(i + 1) % points.length].x * p.y, 0);
  const outward = area > 0 ? 1 : -1, shifts = faceShifts(points, outward, gray, width, level);
  if (!shifts.some(Boolean)) return item;
  const moved = shiftedRing(points, shifts, outward);
  if (moved.some((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y) > 2 * SET.faceShiftPx)) return item;
  return { ...item, commands: [...moved.slice(1).map(() => "L" as const), "Z" as const], points: moved };
}

/** The drawing with its walls as the plan draws them: hollow walls as their drawn sides, solid walls with their faces on
 * their ink. `tones`: where the plan's line ink starts, its paper and its full-tone ink. */
export function wallsAsDrawn(drawing: RegisteredVectorizerDrawing, gray: Uint8Array, width: number, tones: { ink: number; paper: number; full: number }) {
  let hollow = 0, refaced = 0;
  const filled = new Set(drawing.items.flatMap((item) => {
    const points = item.fill && WALL_KINDS.includes(item.kind) ? ring(item) : null;
    return points ? [ringKey(points)] : [];
  }));
  const items = drawing.items.flatMap((item) => {
    if (isOutlineOf(item, filled)) return [];
    const points = item.fill && WALL_KINDS.includes(item.kind) ? ring(item) : null;
    if (!points) return [item];
    const share = insideInk(points, gray, width, tones.ink);
    if (share !== null && share <= SET.hollowShare) { hollow++; return drawnSides(item, points, gray, width, tones.ink); }
    const next = facesOnInk(item, points, gray, width, (tones.paper + tones.full) / 2);
    if (next !== item) refaced++;
    return [next];
  });
  return { drawing: { ...drawing, items }, hollow, refaced };
}

/** A ring as a key (its corners to a hundredth of a pixel). */
const ringKey = (points: Point[]) => points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");

/** A wall the reading drew both filled and outlined (a hatched wall): the outline goes - the wall is drawn solid, and an
 * outline centred on its edge stood half its weight out past the faces put on the ink (a step beside every line that
 * carries the face on). */
function isOutlineOf(item: VectorizerDrawingItem, filled: Set<string>) {
  const points = !item.fill && WALL_KINDS.includes(item.kind) ? ring(item) : null;
  return points !== null && filled.has(ringKey(points));
}
