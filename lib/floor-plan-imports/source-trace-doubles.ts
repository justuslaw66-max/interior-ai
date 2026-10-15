import type { SourcePointPx as Point } from "./deterministic-evidence";
import { CLEAN_TRACE_SETTINGS, darkestNear, drawingPolylines, toneAt } from "./source-trace-clean";
import type { TracePath } from "./source-trace-fit";
import type { RegisteredVectorizerDrawing, VectorizerDrawingItem } from "./vectorizer-drawing";

/**
 * No line drawn twice (clean traced drawing, v3). The reading places a line up to a few pixels off its ink; the ink
 * beside it was then traced again as a second line (h1's dimension lines, s001's door swing). Each straight line of
 * the reading is first moved onto the centre of its own ink, and a traced line still running along a drawn one is left
 * out.
 */
export const DOUBLES_SETTINGS = Object.freeze({
  /** How far across a line its ink is looked for (px each way), and the widest ink taken as the line's own. */
  searchPx: 5,
  widestInkPx: 6,
  /** No line is drawn thinner than this (a hairline at the page's own scale). */
  thinnestPx: 1,
  /** Ink wider than this at its own mid-tone is a band (a wall painted grey), drawn as wide as it is. */
  bandPx: 4,
  /** A dot is moved this far at most. */
  dotShiftPx: 3,
  /** The share of a line's length its ink must be found along, and how straight that ink must run (median spread). */
  foundShare: 0.6,
  spreadPx: 0.75,
  /** A traced line whose centre runs this close to the drawing's ink (median, px) doubles a drawn line. */
  doubledGapPx: 1.5,
});

const SET = DOUBLES_SETTINGS;

/** An item moved by `shift` (px). */
const movedBy = (item: VectorizerDrawingItem, shift: Point) => ({ ...item, points: item.points.map((p) => ({ x: p.x + shift.x, y: p.y + shift.y })) });

type Crossing = { centre: number; width: number };
type Tones = { ink: number; paper: number; full: number };

/** Where the ink crosses a line at one point: the dark peak (darker than the line ink's tone) nearest the line, its
 * extent to the peak's own mid-tone (half-way to the paper), the darkness-weighted centre of that extent (offset
 * along `n`) and its width - as wide as it is for a band (a wall painted grey), at the weight of its ink (as full-tone
 * ink) for a thin line, grey or softened - or null when there is no peak or it is wider than a line. */
function inkCrossing(gray: Uint8Array, width: number, p: Point, n: Point, tones: Tones): Crossing | null {
  const offsets: number[] = [], profile: number[] = [];
  for (let o = -SET.searchPx; o <= SET.searchPx + 1e-9; o += 0.25) { offsets.push(o); profile.push(toneAt(gray, width, { x: p.x + n.x * o, y: p.y + n.y * o })); }
  const peaks = profile.map((_tone, k) => k).filter((k) => profile[k] < tones.ink
    && (k === 0 || profile[k - 1] >= profile[k]) && (k === profile.length - 1 || profile[k + 1] > profile[k]));
  const peak = peaks.sort((a, b) => Math.abs(offsets[a]) - Math.abs(offsets[b]))[0];
  if (peak === undefined) return null;
  const level = (tones.paper + profile[peak]) / 2;
  let from = peak, to = peak;
  while (from > 0 && profile[from - 1] < level) from--;
  while (to < profile.length - 1 && profile[to + 1] < level) to++;
  const half = (to - from + 1) * 0.25, full = Math.max(1, tones.paper - tones.full);
  if (half > SET.widestInkPx || from === 0 || to === profile.length - 1) return null;
  let sum = 0, moment = 0, mass = 0;
  for (let k = Math.max(0, from - 4); k <= Math.min(profile.length - 1, to + 4); k++) {
    const dark = Math.max(0, tones.paper - profile[k]);
    mass += (dark / full) * 0.25;
    if (k >= from && k <= to) { sum += dark; moment += dark * offsets[k]; }
  }
  return { centre: moment / sum, width: half > SET.bandPx ? half : Math.min(half, mass) };
}

const median = (values: number[]) => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];

/** Where a straight line of the reading's ink runs: how far the line sits off its centre (px along its normal) and
 * how wide the ink is; null when its ink is not found along most of it or does not run straight. */
function inkOfLine(item: VectorizerDrawingItem, gray: Uint8Array, width: number, tones: Tones) {
  const [a, b] = item.points, length = Math.hypot(b.x - a.x, b.y - a.y);
  if (length < 8) return null;
  const n = { x: -(b.y - a.y) / length, y: (b.x - a.x) / length }, count = Math.floor((0.8 * length) / 1.5), found: Crossing[] = [];
  for (let k = 0; k <= count; k++) {
    const t = 0.1 + (0.8 * k) / Math.max(1, count), at = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const crossing = inkCrossing(gray, width, at, n, tones);
    if (crossing) found.push(crossing);
  }
  if (found.length < SET.foundShare * (count + 1)) return null;
  const shift = median(found.map((c) => c.centre)), spread = median(found.map((c) => Math.abs(c.centre - shift)));
  return spread <= SET.spreadPx ? { shift, n, width: median(found.map((c) => c.width)) } : null;
}

/** A straight line of the reading moved onto the centre of its ink and drawn at the ink's width, or as it was. */
function lineOnInk(item: VectorizerDrawingItem, gray: Uint8Array, width: number, tones: Tones) {
  const ink = inkOfLine(item, gray, width, tones);
  if (!ink) return item;
  const weight = Math.max(SET.thinnestPx, Math.min(SET.widestInkPx, ink.width));
  const reweigh = Math.abs(weight - item.strokeWidthPx) > Math.max(0.3, 0.25 * item.strokeWidthPx);
  const shifted = Math.abs(ink.shift) >= 0.3 ? movedBy(item, { x: ink.n.x * ink.shift, y: ink.n.y * ink.shift }) : item;
  return reweigh ? { ...shifted, strokeWidthPx: weight } : shifted;
}

/** How far a dot of the reading (a dimension's dot) sits off the centre of its darkest ink, as a vector (px). The
 * darkest ink counts most, so the lines running into the dot do not pull it along them. */
function dotOffset(item: VectorizerDrawingItem, gray: Uint8Array, width: number, inkTone: number) {
  const xs = item.points.map((p) => p.x), ys = item.points.map((p) => p.y), height = gray.length / width;
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  const reach = (Math.max(...xs) - Math.min(...xs)) / 2 + 2;
  let sum = 0, mx = 0, my = 0;
  for (let y = Math.max(0, Math.floor(cy - reach)); y <= Math.min(height - 1, Math.ceil(cy + reach)); y++) {
    for (let x = Math.max(0, Math.floor(cx - reach)); x <= Math.min(width - 1, Math.ceil(cx + reach)); x++) {
      const dark = Math.max(0, inkTone - gray[y * width + x]) ** 2;
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= reach) { sum += dark; mx += dark * (x + 0.5); my += dark * (y + 0.5); }
    }
  }
  const dx = sum ? mx / sum - cx : 0, dy = sum ? my / sum - cy : 0;
  return Math.hypot(dx, dy) >= 0.3 && Math.hypot(dx, dy) <= SET.dotShiftPx ? { x: dx, y: dy } : null;
}

/** The drawing with each straight line of the reading (one segment, not dashed) moved onto the centre of its ink and
 * drawn at the ink's width, and each of its dots moved onto its own ink. `tones`: where the plan's line ink starts,
 * its paper, and its full-tone ink. */
export function centredOnInk(drawing: RegisteredVectorizerDrawing, gray: Uint8Array, width: number, tones: Tones) {
  let moved = 0;
  const items = drawing.items.map((item) => {
    const dot = item.fill && item.kind.includes("dot") ? dotOffset(item, gray, width, tones.ink) : null;
    const line = !item.fill && !item.kind.includes("dash") && item.commands.length === 1 && item.commands[0] === "L";
    const next = dot ? movedBy(item, dot) : line ? lineOnInk(item, gray, width, tones) : item;
    if (next !== item) moved++;
    return next;
  });
  return { drawing: { ...drawing, items }, moved };
}

/** A path's outline as points about every 1.5 px. */
function pathSamples(path: TracePath) {
  return drawingPolylines({ kind: "", fill: path.fill, strokeWidthPx: 0, commands: path.commands, points: path.points })
    .flatMap((line) => line.points.flatMap((a, i) => {
      const b = line.points[i + 1];
      if (!b) return [a];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
      return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
    }));
}

type Leftovers = { width: number; gray: Uint8Array; shadowTone: number; near: Uint8Array; lettering: Uint8Array; lineGap: Float32Array };

/** The traced paths that are neither the soft edge of a shape the drawing already has (a path lying mostly near the
 * drawing whose ink is no darker than `shadowTone`) nor a line it already drew (a stroke running along the drawing's
 * ink: `lineGap`). Lettering always stays; a line with a dark core of its own away from the drawing stays. */
export function withoutShadows(paths: TracePath[], input: Leftovers) {
  const { width, gray, shadowTone, near, lettering, lineGap } = input, height = near.length / width;
  const at = (mask: Uint8Array | Float32Array, p: Point) => {
    const x = Math.floor(p.x), y = Math.floor(p.y);
    return x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0;
  };
  const share = (mask: Uint8Array, points: Point[]) => points.filter((p) => at(mask, p) === 1).length / Math.max(1, points.length);
  return paths.filter((path) => {
    const points = pathSamples(path);
    if (share(lettering, points) >= 0.5) return true;
    if (!path.fill && median(points.map((p) => at(lineGap, p))) <= SET.doubledGapPx) return false;
    if (share(near, points) < CLEAN_TRACE_SETTINGS.shadowShare) return true;
    return median(points.map((p) => darkestNear(gray, width, p))) < shadowTone;
  });
}
