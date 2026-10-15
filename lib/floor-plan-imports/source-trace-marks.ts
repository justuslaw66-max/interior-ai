import { dropFineShapes, fineInk, fineShapePaths, grownBox, localCut, type PixelBox } from "./source-trace-fine";
import type { TracePath } from "./source-trace-fit";
import { roundDots, thinStrokes } from "./source-trace-mark-shapes";
import { eightNeighbours } from "./source-trace-paper";

/**
 * The small marks of the clean traced drawing (v3): the ink left after the drawing and the lettering. Each mark is cut
 * at its own strokes' mid-tone (a light line running into a black dot keeps its own weight); its dots are drawn as true
 * circles and its thin strokes - a dash, a door's swing, a short frame line - as sharp lines along their centre
 * (source-trace-mark-shapes.ts); the rest as smooth filled shapes. Faint marks and the drawing's soft edges are left out.
 */
export const MARK_SETTINGS = Object.freeze({
  /** A mark is a piece of leftover ink no bigger than this (a frame's step, a window's glazing; anything bigger is left
   * to the general pass). */
  markMaximumSidePx: 250,
  markMaximumAreaPx: 20_000,
  markMinimumPixels: 3,
  /** A mark lying mostly this near the drawing (its shadow mask) is the soft edge of a shape it already drew. */
  shadowShare: 0.7,
});

type Mark = { pixels: number[]; box: PixelBox };
/** `inkTone`: the page's full-tone ink (its darkest 1 %), the weight a stroke's ink is measured against. */
/** `lineGap`: each pixel's distance to the drawing's own ink (px). */
export type MarkInput = { ink: Uint8Array; gray: Uint8Array; width: number; height: number; explained: Uint8Array;
  drawn: Uint8Array; lineGap: Float32Array; near: Uint8Array; faint: number; shadowTone: number; inkTone: number;
  zones: PixelBox[]; signal: AbortSignal };

const overlaps = (a: PixelBox, b: PixelBox) => a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom;

/** The 8-connected pieces of the ink. */
function inkMarks(ink: Uint8Array, width: number, height: number): Mark[] {
  const seen = new Uint8Array(ink.length), marks: Mark[] = [];
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || seen[start]) continue;
    const pixels = [start], box = { left: width, top: height, right: 0, bottom: 0 };
    seen[start] = 1;
    for (let k = 0; k < pixels.length; k++) {
      const p = pixels[k], x = p % width, y = (p - x) / width;
      box.left = Math.min(box.left, x); box.right = Math.max(box.right, x);
      box.top = Math.min(box.top, y); box.bottom = Math.max(box.bottom, y);
      for (const q of eightNeighbours(p, width, height)) if (ink[q] && !seen[q]) { seen[q] = 1; pixels.push(q); }
    }
    marks.push({ pixels, box });
  }
  return marks;
}

function isSmall(box: PixelBox) {
  const w = box.right - box.left + 1, h = box.bottom - box.top + 1;
  return Math.max(w, h) <= MARK_SETTINGS.markMaximumSidePx && w * h <= MARK_SETTINGS.markMaximumAreaPx;
}

/** A mark's own pixels and their neighbours, inside its traced box. */
function ownPixels(mark: Mark, box: PixelBox, width: number) {
  const w = box.right - box.left + 1, h = box.bottom - box.top + 1, own = new Uint8Array(w * h);
  for (const p of mark.pixels) {
    const x = p % width - box.left, y = (p - (p % width)) / width - box.top;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h) own[(y + dy) * w + x + dx] = 1;
    }
  }
  return (x: number, y: number) => own[(y - box.top) * w + x - box.left] === 1;
}

/** The tone half-way between a long leftover's own darkest ink and the paper round it (a histogram of its box): on a
 * blurred page its soft edges are lighter than that and leave the mask, so the general pass traces the line, not a
 * swollen band of it. */
function sharpenLeftover(mark: Mark, gray: Uint8Array, ink: Uint8Array, width: number) {
  const tones = mark.pixels.map((p) => gray[p]).sort((a, b) => a - b), counts = new Uint32Array(256);
  const { left, top, right, bottom } = mark.box, step = Math.max(1, Math.round(Math.sqrt(((right - left + 1) * (bottom - top + 1)) / 40_000)));
  let seen = 0, paper = 255;
  for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) { counts[gray[y * width + x]]++; seen++; }
  for (let tone = 0, sum = 0; tone < 256; tone++) if ((sum += counts[tone]) >= 0.9 * seen) { paper = tone; break; }
  const level = (tones[Math.floor(tones.length * 0.05)] + paper) / 2;
  if (paper - tones[Math.floor(tones.length * 0.05)] < 40) return;
  for (const p of mark.pixels) if (gray[p] >= level) ink[p] = 0;
}

/** What to do with one leftover mark: leave it out (faint, or the drawing's shadow), trace it fine, or leave it. */
function markFate(mark: Mark, input: MarkInput) {
  if (mark.pixels.length < MARK_SETTINGS.markMinimumPixels) return "general";
  const tones = mark.pixels.map((p) => input.gray[p]).sort((a, b) => a - b);
  if (tones[Math.floor(tones.length * 0.1)] > input.faint) return "drop";
  if (!isSmall(mark.box)) return "general";
  const near = mark.pixels.filter((p) => input.near[p]).length;
  const soft = tones[Math.floor(tones.length * 0.1)] >= input.shadowTone;  // (no dark core: a soft edge, not a figure)
  return soft && near >= MARK_SETTINGS.shadowShare * mark.pixels.length ? "drop" : "fine";
}

/** One small mark as dots, thin strokes and smooth filled shapes; null when it is left to the general pass. Strokes are
 * not drawn beside the lettering (`zones`): a letter the reading did not box stays a letter's shape. */
async function fineMark(mark: Mark, input: MarkInput): Promise<TracePath[] | null> {
  const { gray, width, height, explained, signal } = input;
  const box = grownBox(mark.box, 2, { width, height }), own = ownPixels(mark, box, width), cut = localCut(gray, width, box, own);
  if (!cut) return null;
  const fine = fineInk(gray, { width, height }, box, cut.level, own, cut.paper);
  dropFineShapes(fine, explained, width);
  const dots = roundDots(fine, input.drawn, width), full = Math.max(1, cut.paper - input.inkTone);
  const mass = (x: number, y: number) => (own(x, y) ? Math.max(0, Math.min(1, (cut.paper - gray[y * width + x]) / full)) : 0);
  const lineGap = (x: number, y: number) => input.lineGap[Math.floor(y) * width + Math.floor(x)] ?? Infinity;
  const lettering = input.zones.some((zone) => overlaps(zone, mark.box));
  const strokes = lettering ? { paths: [], doubled: 0 } : await thinStrokes(fine, { dots: dots.dots, mass, lineGap, signal });
  const shapes = await fineShapePaths(fine, signal).catch((error) => { if (signal.aborted) throw error; return null; });
  const found = shapes || dots.paths.length || strokes.paths.length || strokes.doubled;
  return found ? [...dots.paths, ...strokes.paths, ...(shapes ?? [])] : null;
}

/**
 * The ink left after the drawing and the lettering: small marks as dots, strokes and smooth shapes (`groupId`
 * mark-<n>), faint marks and the drawing's soft edges left out; long leftovers stay for the general pass.
 */
export async function traceMarks(input: MarkInput) {
  const { ink, gray, width, height } = input, paths: TracePath[] = [];
  let dropped = 0;
  for (const mark of inkMarks(ink, width, height)) {
    const fate = markFate(mark, input);
    if (fate === "general") { sharpenLeftover(mark, gray, ink, width); continue; }
    if (fate === "fine") {
      const shapes = await fineMark(mark, input);
      if (!shapes) continue;                                     // (left to the general pass)
      for (const path of shapes) paths.push({ ...path, groupId: `mark-${paths.length + 1}` });
    } else dropped += mark.pixels.length;
    for (const p of mark.pixels) ink[p] = 0;
  }
  return { paths, dropped };
}

/** Where a mark is taken for lettering: each text box, grown by its height along the line and a third of it across. */
export function letteringZones(boxes: PixelBox[]): PixelBox[] {
  return boxes.map((b) => {
    const tall = b.bottom - b.top + 1, wide = b.right - b.left + 1, along = Math.min(tall, wide), across = Math.min(tall, wide) / 3;
    return wide >= tall ? { left: b.left - along, right: b.right + along, top: b.top - across, bottom: b.bottom + across }
      : { left: b.left - across, right: b.right + across, top: b.top - along, bottom: b.bottom + along };
  });
}
