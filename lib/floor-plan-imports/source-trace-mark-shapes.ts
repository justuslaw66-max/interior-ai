import type { SourcePointPx as Point } from "./deterministic-evidence";
import { FINE_TRACE_SETTINGS, circlePath, dropFineShapes, finePieces, simplifyContour, type FineMask } from "./source-trace-fine";
import { fitTracePath, type TracePath } from "./source-trace-fit";
import { thinTraceMask, traceSkeletonPaths } from "./source-trace-skeleton";

/**
 * Two kinds of small mark drawn as what they are rather than as traced outlines (clean traced drawing, v3): a dot (a
 * dimension's end, with the line ends running into it) as a true circle, and a thin stroke (a dash, a door's swing, a
 * short frame line) as a sharp line along its centre at the weight of its ink.
 */
export const MARK_SHAPE_SETTINGS = Object.freeze({
  /** A dot: a core of this radius or more once every stroke up to twice the opening wide is taken away. */
  dotOpeningPx: 1.5,
  dotMinimumRadiusPx: 2,
  /** ... a compact one this big at least (a window frame's square end post is smaller). */
  compactDotMinimumRadiusPx: 2.5,
  dotMaximumRadiusPx: 8,
  /** The core's area against the circle through its farthest pixel: a round core is a dot anywhere (a square with
   * rounded corners is about 0.84); a compact one (a small dot printed as a diamond, 0.64, drawn out a little along
   * the lines through it) only on a line of the drawing. */
  dotRoundness: 0.88,
  dotCompactness: 0.6,
  /** A block: a core filling this share of its box (a disc fills 0.79, a square with rounded corners 0.88 or more). */
  blockFill: 0.86,
  stubPx: 2,
  /** A thin stroke: half-width at most this, longer than it is wide this many times, each chain turning this little, */
  strokeHalfWidthPx: 2,
  strokeElongation: 2.5,
  strokeMinimumLengthPx: 3,
  strokeTurnDegrees: 120,
  /** ... and at most this many strokes meeting at junctions (a window's glazing lines and mullions). */
  strokeMaximumChains: 40,
  /** A stroke is fitted with straight lines where they stay this close to its centre, curves only past that. */
  strokeFitPx: 0.75,
  /** A stroke whose centre runs this close to the drawing's ink (median, px) is a line the drawing has drawn a little
   * to one side of its ink: drawn twice otherwise. */
  doubledGapPx: 1.5,
  spurPx: 1.5,
});

const S = FINE_TRACE_SETTINGS.upsample, SET = MARK_SHAPE_SETTINGS;

/** A dot in source pixels. */
export type MarkDot = { x: number; y: number; r: number };
/** What a mark's strokes are drawn with: its dots, the ink a source pixel carries (0 to 1), how far a point is from
 * the drawing's own ink (px), the abort signal. */
export type StrokeContext = { dots: MarkDot[]; mass: (x: number, y: number) => number; lineGap: (x: number, y: number) => number;
  signal: AbortSignal };

/** Each pixel's distance (px, a chamfer) to the nearest set pixel of `mask`. */
export function distanceToInk(mask: Uint8Array, width: number, height: number) {
  return chamfer(Uint8Array.from(mask, (v) => (v ? 0 : 1)), width, height, true);
}

/** Each set pixel's distance (fine pixels, a chamfer) to the nearest unset one; beyond the edge counts as unset, or as
 * set with `edgeSet`. */
function chamfer(mask: Uint8Array, w: number, h: number, edgeSet = false) {
  const d = Float32Array.from(mask, (v) => (v ? 1e9 : 0));
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? (edgeSet ? 1e9 : 0) : d[y * w + x]);
  const pass = (x: number, y: number, step: number) => {
    const i = y * w + x;
    if (d[i]) d[i] = Math.min(d[i], at(x - step, y) + 1, at(x, y - step) + 1, at(x - step, y - step) + Math.SQRT2, at(x + step, y - step) + Math.SQRT2);
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) pass(x, y, 1);
  for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) pass(x, y, -1);
  return d;
}

/** The mask opened by a disc of `radius` fine pixels: what is left once every stroke narrower than the disc is gone. */
function opened(mask: Uint8Array, w: number, h: number, radius: number) {
  const inner = chamfer(mask, w, h), outsideCore = Uint8Array.from(inner, (v) => (v > radius ? 0 : 1));
  const reach = chamfer(outsideCore, w, h, true);
  return Uint8Array.from(mask, (v, i) => (v && reach[i] <= radius ? 1 : 0));
}

/** Is there ink within `radius` px of the point (x, y)? */
function nearInk(mask: Uint8Array, width: number, x: number, y: number, radius: number) {
  const height = mask.length / width;
  for (let v = Math.max(0, Math.floor(y - radius)); v <= Math.min(height - 1, Math.floor(y + radius)); v++) {
    for (let u = Math.max(0, Math.floor(x - radius)); u <= Math.min(width - 1, Math.floor(x + radius)); u++) {
      if (mask[v * width + u] && Math.hypot(u + 0.5 - x, v + 0.5 - y) <= radius + 0.5) return true;
    }
  }
  return false;
}

/** A core's measures in fine pixels: centre, the radius of the largest circle the mark holds there (so the line ends
 * running into a dot do not swell it), its box, and its area against the circle through its farthest pixel. */
function coreMeasures(pixels: number[], w: number, inner: Float32Array) {
  let cx = 0, cy = 0, r = 0, left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
  for (const p of pixels) {
    const x = (p % w) + 0.5, y = Math.floor(p / w) + 0.5;
    cx += x; cy += y; r = Math.max(r, inner[p] - 0.5);
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  cx /= pixels.length; cy /= pixels.length;
  const reach = pixels.reduce((m, p) => Math.max(m, Math.hypot((p % w) + 0.5 - cx, Math.floor(p / w) + 0.5 - cy)), 0) + 0.5;
  return { cx, cy, r, left: left - 0.5, top: top - 0.5, right: right + 0.5, bottom: bottom + 0.5, round: pixels.length / (Math.PI * reach * reach) };
}

type Core = { kind: "dot"; cx: number; cy: number; r: number } | { kind: "block"; left: number; top: number; right: number; bottom: number };

/** A core of the opened mask that is a block (a window frame's square end post: it fills its box) or a dot, or null. */
function coreShape(pixels: number[], w: number, inner: Float32Array, onLine: (x: number, y: number) => boolean): Core | null {
  const m = coreMeasures(pixels, w, inner), bw = m.right - m.left, bh = m.bottom - m.top;
  if (pixels.length >= SET.blockFill * bw * bh) return { kind: "block", left: m.left, top: m.top, right: m.right, bottom: m.bottom };
  const squat = Math.abs(bw - bh) / Math.max(bw, bh), sized = m.r >= SET.dotMinimumRadiusPx * S && m.r <= SET.dotMaximumRadiusPx * S;
  const round = m.round >= SET.dotRoundness && squat <= 0.25;
  const compact = m.round >= SET.dotCompactness && squat <= 0.35 && m.r >= SET.compactDotMinimumRadiusPx * S && onLine(m.cx, m.cy);
  return sized && (round || compact) ? { kind: "dot", cx: m.cx, cy: m.cy, r: m.r } : null;
}

type Block = Extract<Core, { kind: "block" }>;

/** A block with each side carried out onto the drawing's ink where that lies just beyond it, up to 2.5 px (a wall's
 * nib the reading left out then meets its wall with no seam). Fine pixels; `drawn` in source pixels. */
function snappedBlock(block: Block, drawn: Uint8Array, width: number, box: FineMask["box"]): Block {
  const height = drawn.length / width, out = { ...block };
  const hit = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && drawn[Math.floor(y) * width + Math.floor(x)] === 1;
  const sides = [["left", -1, 0], ["right", 1, 0], ["top", 0, -1], ["bottom", 0, 1]] as const;
  for (const [side, dx, dy] of sides) {
    const along = (t: number) => (dx ? { x: box.left + block[side] / S, y: box.top + (block.top + (block.bottom - block.top) * t) / S }
      : { x: box.left + (block.left + (block.right - block.left) * t) / S, y: box.top + block[side] / S });
    const reach = [0.5, 1, 1.5, 2, 2.5].find((d) => [0.2, 0.35, 0.5, 0.65, 0.8].filter((t) => hit(along(t).x + dx * d, along(t).y + dy * d)).length >= 3);
    if (reach !== undefined) out[side] = block[side] + (dx + dy) * (reach + 0.25) * S;
  }
  return out;
}

/** Does a core (grown by one source pixel) cover the fine pixel centred at (x, y)? */
function covers(core: Core, x: number, y: number) {
  if (core.kind === "dot") return Math.hypot(x - core.cx, y - core.cy) <= core.r + S;
  return x >= core.left - S && x <= core.right + S && y >= core.top - S && y <= core.bottom + S;
}

/** A core as a filled path in source pixels: a true circle, or a rectangle. */
function corePath(core: Core, box: FineMask["box"]): TracePath {
  const at = (x: number, y: number) => ({ x: box.left + x / S, y: box.top + y / S });
  const shape = core.kind === "dot" ? circlePath(box.left + core.cx / S, box.top + core.cy / S, core.r / S)
    : { points: [at(core.left, core.top), at(core.right, core.top), at(core.right, core.bottom), at(core.left, core.bottom)],
      commands: ["L", "L", "L", "Z"] as TracePath["commands"] };
  return { ...shape, fill: true, strokeWidthPx: 1, groupId: "fine" };
}

/** The fine mask's dots as true circles and its blocks as rectangles: each leaves the mask, and so do the stubs left
 * beside it (specks, or lying on the drawing's lines: `drawn`). `dots`: the dots in source pixels. */
export function roundDots(fine: FineMask, drawn: Uint8Array, width: number) {
  const { mask, w, h, box } = fine, inner = chamfer(mask, w, h);
  const onLine = (x: number, y: number) => nearInk(drawn, width, box.left + x / S, box.top + y / S, 1.5);
  const found = finePieces(opened(mask, w, h, SET.dotOpeningPx * S), w, h).map((p) => coreShape(p, w, inner, onLine))
    .filter((core): core is Core => core !== null);
  if (!found.length) return { paths: [] as TracePath[], dots: [] as MarkDot[] };
  for (let p = 0; p < mask.length; p++) if (mask[p] && found.some((core) => covers(core, (p % w) + 0.5, Math.floor(p / w) + 0.5))) mask[p] = 0;
  dropFineShapes(fine, drawn, width);
  for (const piece of finePieces(mask, w, h)) if (piece.length < (SET.stubPx * S) ** 2) for (const p of piece) mask[p] = 0;
  const dots = found.flatMap((d): MarkDot[] => (d.kind === "dot" ? [{ x: box.left + d.cx / S, y: box.top + d.cy / S, r: d.r / S }] : []));
  return { dots, paths: found.map((core) => corePath(core.kind === "block" ? snappedBlock(core, drawn, width, box) : core, box)) };
}

const pointKey = (p: Point) => `${p.x}:${p.y}`;
const chainLength = (chain: Point[]) => chain.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - chain[i].x, p.y - chain[i].y), 0);

function endCounts(chains: Point[][]) {
  const counts = new Map<string, number>();
  for (const chain of chains) for (const p of [chain[0], chain[chain.length - 1]]) counts.set(pointKey(p), (counts.get(pointKey(p)) ?? 0) + 1);
  return counts;
}

/** Skeleton chains without their short spurs: a chain with a free end, shorter than 1.5 px or the stroke's width,
 * off a junction. */
function withoutSpurs(chains: Point[][], strokeWidth: number) {
  if (chains.length < 2) return chains;
  const counts = endCounts(chains), limit = Math.max(SET.spurPx, strokeWidth);
  return chains.filter((c) => !(chainLength(c) < limit && [c[0], c[c.length - 1]].some((p) => counts.get(pointKey(p)) === 1)));
}

/** Two chains through a node only they share, as one chain; or null. */
function joinTwo(a: Point[], b: Point[], counts: Map<string, number>) {
  const two = (p: Point) => counts.get(pointKey(p)) === 2, same = (p: Point, q: Point) => pointKey(p) === pointKey(q);
  const [a0, a1, b0, b1] = [a[0], a[a.length - 1], b[0], b[b.length - 1]];
  if (same(a1, b0) && two(a1)) return [...a, ...b.slice(1)];
  if (same(a1, b1) && two(a1)) return [...a, ...b.slice().reverse().slice(1)];
  if (same(a0, b1) && two(a0)) return [...b, ...a.slice(1)];
  if (same(a0, b0) && two(a0)) return [...a.slice().reverse(), ...b.slice(1)];
  return null;
}

/** Chains meeting at nodes where only two of them meet, joined into one. */
function joinChains(chains: Point[][]) {
  const out = chains.slice();
  for (let joined = true; joined;) {
    joined = false;
    const counts = endCounts(out);
    for (let i = 0; i < out.length && !joined; i++) for (let j = i + 1; j < out.length && !joined; j++) {
      const merged = joinTwo(out[i], out[j], counts);
      if (merged) { out[i] = merged; out.splice(j, 1); joined = true; }
    }
  }
  return out;
}

/** The unit direction from a chain's end (`atStart`) into it, measured 3 px along (or as far as it goes). */
function inward(chain: Point[], atStart: boolean) {
  const c = atStart ? chain : chain.slice().reverse(), end = c[0];
  let far = c[c.length - 1];
  for (const p of c) if (Math.hypot(p.x - end.x, p.y - end.y) >= 3) { far = p; break; }
  const d = Math.hypot(far.x - end.x, far.y - end.y) || 1;
  return { x: (far.x - end.x) / d, y: (far.y - end.y) / d };
}

/** At a node where three or more chains meet (a T, a crossing), the two running on straight through it (opposite
 * within 30 degrees) joined into one chain, so a line crossing another stays one straight line. */
function throughJunctions(chains: Point[][]) {
  const out = chains.slice();
  for (let joined = true; joined;) {
    joined = false;
    const counts = endCounts(out);
    const ends = out.flatMap((c, i) => [{ i, atStart: true, p: c[0] }, { i, atStart: false, p: c[c.length - 1] }])
      .filter((e) => (counts.get(pointKey(e.p)) ?? 0) >= 3 && pointKey(out[e.i][0]) !== pointKey(out[e.i][out[e.i].length - 1]));
    let best: { a: (typeof ends)[number]; b: (typeof ends)[number]; dot: number } | null = null;
    for (const a of ends) for (const b of ends) {
      if (a.i >= b.i || pointKey(a.p) !== pointKey(b.p)) continue;
      const da = inward(out[a.i], a.atStart), db = inward(out[b.i], b.atStart), dot = da.x * db.x + da.y * db.y;
      if (dot < -Math.cos(Math.PI / 6) && (!best || dot < best.dot)) best = { a, b, dot };
    }
    if (best) {
      const first = best.a.atStart ? out[best.a.i].slice().reverse() : out[best.a.i], second = best.b.atStart ? out[best.b.i] : out[best.b.i].slice().reverse();
      out[best.a.i] = [...first, ...second.slice(1)];
      out.splice(best.b.i, 1);
      joined = true;
    }
  }
  return out;
}

/** A chain that runs straight - no corner, and within the larger of a pixel and its stroke's width of one line - as
 * that line's two ends (a wardrobe's line skewed where another crosses it comes out straight), or null. */
function straightLine(chain: Point[], width: number) {
  const n = chain.length, cx = chain.reduce((s, p) => s + p.x, 0) / n, cy = chain.reduce((s, p) => s + p.y, 0) / n;
  let xx = 0, xy = 0, yy = 0;
  for (const p of chain) { xx += (p.x - cx) ** 2; xy += (p.x - cx) * (p.y - cy); yy += (p.y - cy) ** 2; }
  const angle = Math.atan2(2 * xy, xx - yy) / 2, d = { x: Math.cos(angle), y: Math.sin(angle) };
  const off = (p: Point) => Math.abs((p.x - cx) * d.y - (p.y - cy) * d.x), along = (p: Point) => (p.x - cx) * d.x + (p.y - cy) * d.y;
  const coarse = simplifyContour(chain, SET.strokeFitPx), corner = coarse.slice(1, -1).some((b, i) => {
    const a = coarse[i], c = coarse[i + 2], t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) >= (35 * Math.PI) / 180;
  });
  if (corner || chainLength(chain) < 6 || chain.some((p) => off(p) > Math.max(1, width))) return null;
  return [chain[0], chain[n - 1]].map((p) => ({ x: cx + d.x * along(p), y: cy + d.y * along(p) }));
}

/** How far a chain turns along its way (degrees), its pixel stairs left out. */
function turning(chain: Point[]) {
  const coarse = simplifyContour(chain, 0.5);
  let total = 0;
  for (let i = 1; i + 1 < coarse.length; i++) {
    const [a, b, c] = [coarse[i - 1], coarse[i], coarse[i + 1]];
    const t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    total += Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
  }
  return (total * 180) / Math.PI;
}

/** Is a chain straight runs meeting at corners (a dash, a jamb's corner, a frame's step) rather than a curve? A curve
 * - a door's swing - turns gently at two or more of the vertices of its outline at the fitting bound (12 to 35
 * degrees each); a run turns at corners, or not at all. */
function straightRuns(chain: Point[]) {
  const coarse = simplifyContour(chain, SET.strokeFitPx);
  const gentle = coarse.slice(1, -1).filter((b, i) => {
    const a = coarse[i], c = coarse[i + 2], t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    const turn = (Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) * 180) / Math.PI;
    return turn >= 12 && turn < 35;
  });
  return gentle.length < 2;
}

/** A chain without a hook at a free end (`free`: which of its two ends are): a last short stretch (under `limit` px)
 * turning off by more than 35 degrees - where a stroke's end runs into the soft edge of a wall beside it. */
function withoutHooks(chain: Point[], limit: number, free: [boolean, boolean] = [true, true]) {
  const coarse = simplifyContour(chain, 0.5);
  if (coarse.length < 3) return chain;
  const bends = (a: Point, b: Point, c: Point) => {
    const t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    return Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) > (35 * Math.PI) / 180;
  };
  const n = coarse.length, hook = (a: Point, b: Point, c: Point) => Math.hypot(c.x - b.x, c.y - b.y) < limit && bends(a, b, c);
  const from = free[0] && hook(coarse[2], coarse[1], coarse[0]) ? chain.indexOf(coarse[1]) : 0;
  const to = free[1] && hook(coarse[n - 3], coarse[n - 2], coarse[n - 1]) ? chain.indexOf(coarse[n - 2]) : chain.length - 1;
  return to - from >= 1 ? chain.slice(from, to + 1) : chain;
}

/** A chain carried on by `by` at each free end (thinning stops a stroke's centre half its width short of its cap). */
function extendedEnds(chain: Point[], by: number, free: [boolean, boolean] = [true, true]) {
  const out = chain.slice(), n = chain.length;
  const push = (end: Point, inner: Point) => {
    const d = Math.hypot(end.x - inner.x, end.y - inner.y) || 1;
    return { x: end.x + ((end.x - inner.x) / d) * by, y: end.y + ((end.y - inner.y) / d) * by };
  };
  if (free[0]) out[0] = push(chain[0], chain[Math.min(3, n - 1)]);
  if (free[1]) out[n - 1] = push(chain[n - 1], chain[Math.max(0, n - 4)]);
  return out;
}

/** A chain's free ends carried on, up to 3 px, onto the drawing's ink where they stop just short of it (a fixture's
 * line cut where it crosses a line the drawing has, the ink of the crossing having gone with that line). */
function ontoDrawing(chain: Point[], free: [boolean, boolean], lineGap: StrokeContext["lineGap"]) {
  const out = chain.slice(), n = chain.length;
  const reach = (end: Point, inner: Point) => {
    const d = Math.hypot(end.x - inner.x, end.y - inner.y) || 1, ux = (end.x - inner.x) / d, uy = (end.y - inner.y) / d;
    if (lineGap(end.x, end.y) > 3) return end;
    for (let t = 0.25; t <= 3; t += 0.25) if (lineGap(end.x + ux * t, end.y + uy * t) <= 0.5) return { x: end.x + ux * t, y: end.y + uy * t };
    return end;
  };
  if (free[0] && n > 1) out[0] = reach(chain[0], chain[Math.min(3, n - 1)]);
  if (free[1] && n > 1) out[n - 1] = reach(chain[n - 1], chain[Math.max(0, n - 4)]);
  return out;
}

/** The dot a stroke's end runs towards, close by (the dot took the line's end with it), or undefined. */
function towardDot(end: Point, inner: Point, dots: MarkDot[]) {
  const along = Math.atan2(end.y - inner.y, end.x - inner.x);
  return dots.find((d) => {
    const gap = Math.hypot(d.x - end.x, d.y - end.y), turn = Math.atan2(d.y - end.y, d.x - end.x) - along;
    return gap <= d.r + 3 && (gap < 0.5 || Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) <= Math.PI / 6);
  });
}

/** A chain carried on into the centre of a dot each end runs towards. */
function intoDots(chain: Point[], dots: MarkDot[]) {
  const n = chain.length, first = towardDot(chain[0], chain[Math.min(3, n - 1)], dots);
  const last = towardDot(chain[n - 1], chain[Math.max(0, n - 4)], dots);
  return [...(first ? [{ x: first.x, y: first.y }] : []), ...chain, ...(last ? [{ x: last.x, y: last.y }] : [])];
}

/** A piece's centre lines in source pixels (its skeleton, short spurs off, chains through two-way nodes and straight
 * through junctions joined), or null for a loop. */
async function centreChains(fine: FineMask, piece: number[], half: number, signal: AbortSignal) {
  const { w, h, box } = fine, own = new Uint8Array(w * h);
  for (const p of piece) own[p] = 1;
  const skeleton = traceSkeletonPaths(await thinTraceMask(own, w, h, signal), w, h)
    .map((chain) => chain.map((p) => ({ x: box.left + p.x / S, y: box.top + p.y / S })));
  const chains = throughJunctions(joinChains(withoutSpurs(skeleton, (2 * half) / S)));
  return chains.length && chains.every((c) => pointKey(c[0]) !== pointKey(c[c.length - 1])) ? chains : null;
}

/** The ink a piece carries (source pixels' worth of full-tone ink), over the source pixels it covers. */
function pieceMass(fine: FineMask, piece: number[], mass: StrokeContext["mass"]) {
  const covered = new Set(piece.map((p) => Math.floor(Math.floor(p / fine.w) / S) * fine.w + Math.floor((p % fine.w) / S)));
  let total = 0;
  for (const at of covered) total += mass(fine.box.left + (at % fine.w), fine.box.top + Math.floor(at / fine.w));
  return total;
}

/** A thin piece as strokes along its centre lines - one, or a few meeting at junctions (a window frame's step) - as
 * wide as its ink is heavy (a light line is a thin line, softened), each line the drawing already has (running along
 * its ink) left out - "doubled" when that is all of them; null when it is not clear strokes (a loop, a letter's turns,
 * a blob). */
async function pieceStrokes(fine: FineMask, piece: number[], half: number, context: StrokeContext): Promise<TracePath[] | "doubled" | null> {
  const centres = await centreChains(fine, piece, half, context.signal);
  if (!centres || centres.length > SET.strokeMaximumChains) return null;
  const counts = endCounts(centres), free = (c: Point[]): [boolean, boolean] => [counts.get(pointKey(c[0])) === 1, counts.get(pointKey(c[c.length - 1])) === 1];
  const chains = centres.map((c) => withoutHooks(c, Math.max(1.5, (4 * half) / S), free(c)));
  const length = chains.reduce((sum, c) => sum + chainLength(c), 0), area = piece.length / (S * S);
  const outline = (Math.sqrt(length * length + 4 * area) - length) / 2;
  const width = Math.max(0.5, Math.min(outline, pieceMass(fine, piece, context.mass) / (length + outline)));
  const long = length + outline >= Math.max(SET.strokeMinimumLengthPx, SET.strokeElongation * width);
  if (!long || chains.some((c) => !straightRuns(c) && turning(c) > SET.strokeTurnDegrees)) return null;
  const doubled = (c: Point[]) => { const gaps = c.map((p) => context.lineGap(p.x, p.y)).sort((a, b) => a - b); return gaps[Math.floor(gaps.length / 2)] <= SET.doubledGapPx; };
  const own = chains.map((c, i) => ({ c, free: free(centres[i]) })).filter(({ c }) => !doubled(c));
  if (!own.length) return "doubled";
  try {
    // (straight runs are fitted with straight lines only, so their corners stay sharp; a curve may take curves)
    return own.map(({ c, free: ends }) => {
      const points = intoDots(ontoDrawing(extendedEnds(straightLine(c, width) ?? c, outline / 2, ends), ends, context.lineGap), context.dots);
      return { ...fitTracePath(points, SET.strokeFitPx, straightRuns(c), "fine"), fill: false, strokeWidthPx: width };
    });
  } catch { return null; }
}

/** The fine mask's thin strokes as sharp lines along their centres; each leaves the mask, and so does a stroke the
 * drawing already has (`doubled`, how many). */
export async function thinStrokes(fine: FineMask, context: StrokeContext) {
  const { mask, w, h } = fine, inner = chamfer(mask, w, h), paths: TracePath[] = [];
  let doubled = 0;
  for (const piece of finePieces(mask, w, h)) {
    const half = piece.reduce((m, p) => Math.max(m, inner[p]), 0);
    if (half > SET.strokeHalfWidthPx * S + 0.5) continue;
    const strokes = await pieceStrokes(fine, piece, half, context);
    if (!strokes) continue;
    if (strokes === "doubled") doubled++;
    else paths.push(...strokes);
    for (const p of piece) mask[p] = 0;
  }
  return { paths, doubled };
}
