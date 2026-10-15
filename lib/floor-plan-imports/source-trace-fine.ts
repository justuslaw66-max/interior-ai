import type { SourcePointPx as Point } from "./deterministic-evidence";
import { fitTracePath, type TracePath } from "./source-trace-fit";
import { traceFillContours } from "./source-trace-skeleton";

/**
 * Fine shapes: a small region of the picture resampled four times finer and cut at the tone half-way between its
 * paper and its darkest ink, so a traced edge follows the ink's own outline between pixels, at the ink's own weight,
 * rather than the pixel grid. Used for the lettering and the small marks of the clean traced drawing (v3).
 */
export const FINE_TRACE_SETTINGS = Object.freeze({
  upsample: 4,
  minimumContrast: 40,
  /** The darkest ink this near a pixel sets the pixel's cut (localCut). */
  levelRadiusPx: 2,
  /** A fine shape lying mostly on ink the drawing explains is a piece of a line or wall the drawing already has. */
  explainedShare: 0.7,
  minimumShapePx: 2,
  fitErrorPx: 0.45,
  /** Ink no darker than this share of the way from the page's ink to its paper is a faint mark (a watermark). */
  faintShare: 0.75,
  /** On a page with a drawing: ink past this share of the way from the drawing's lightest lines to paper is faint, */
  faintOverLines: 0.35,
  /** ... but never ink darker than this share of the way from the page's darkest ink to paper. */
  faintFloorShare: 0.6,
});

export type PixelBox = { left: number; top: number; right: number; bottom: number };
export type FineMask = { mask: Uint8Array; w: number; h: number; box: PixelBox };

/** A box grown by `margin` on every side, inside the page. */
export function grownBox(box: PixelBox, margin: number, { width, height }: { width: number; height: number }): PixelBox {
  return { left: Math.max(0, Math.floor(box.left - margin)), top: Math.max(0, Math.floor(box.top - margin)),
    right: Math.min(width - 1, Math.ceil(box.right + margin)), bottom: Math.min(height - 1, Math.ceil(box.bottom + margin)) };
}

/** The tone above which ink is faint on this page: most of the way from its darkest ink to its paper. */
export function faintTone(gray: Uint8Array, lineLight: number | null = null) {
  const counts = new Uint32Array(256);
  for (const tone of gray) counts[tone]++;
  const at = (share: number) => {
    let seen = 0;
    for (let tone = 0; tone < 256; tone++) if ((seen += counts[tone]) >= share * gray.length) return tone;
    return 255;
  };
  const ink = at(0.01), paper = at(0.5), page = ink + FINE_TRACE_SETTINGS.faintShare * (paper - ink);
  if (lineLight === null) return page;
  // A page drawn in grey (a brochure's light linework) sets the bar by its own lines: ink clearly lighter than the
  // lightest of the lines the drawing has is a watermark (c23's "BUYCONDO.sg" at 200 beside lines at 160 or darker).
  return Math.min(page, Math.max(ink + FINE_TRACE_SETTINGS.faintFloorShare * (paper - ink),
    lineLight + FINE_TRACE_SETTINGS.faintOverLines * (paper - lineLight)));
}

/** The tone `share` of the page is darker than or as dark as (its paper at 0.5, its full-tone ink at 0.01). */
export function pageTone(gray: Uint8Array, share: number) {
  const counts = new Uint32Array(256);
  for (const tone of gray) counts[tone]++;
  let seen = 0;
  for (let tone = 0; tone < 256; tone++) if ((seen += counts[tone]) >= share * gray.length) return tone;
  return 255;
}

/** The page's paper: its median tone. */
export const paperTone = (gray: Uint8Array) => pageTone(gray, 0.5);

/** A box's tones, darkest first. */
export function boxTones(gray: Uint8Array, width: number, box: PixelBox) {
  const tones: number[] = [];
  for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) tones.push(gray[y * width + x]);
  return tones.sort((a, b) => a - b);
}

/** The tone half-way between a box's paper and its darkest ink, or null when the box holds too little contrast. */
export function boxLevel(tones: number[]) {
  if (tones.length < 4) return null;
  const ink = tones[Math.floor(tones.length * 0.03)], paper = tones[Math.floor(tones.length * 0.9)];
  return paper - ink < FINE_TRACE_SETTINGS.minimumContrast ? null : (paper + ink) / 2;
}

/** Per source pixel of a box, its cut: half-way between the box's paper and the darkest ink within 2 px (of the
 * pixels `own` marks, when given), so a light stroke beside a black one keeps its own weight (-1, no ink, where that
 * ink is too faint); null when the whole box is. */
export function localCut(gray: Uint8Array, width: number, box: PixelBox, own: (x: number, y: number) => boolean = () => true) {
  const tones = boxTones(gray, width, box), paper = tones[Math.floor(tones.length * 0.9)], r = FINE_TRACE_SETTINGS.levelRadiusPx;
  const w = box.right - box.left + 1, h = box.bottom - box.top + 1, darkest = new Float32Array(w * h).fill(255);
  for (let y = box.top; y <= box.bottom; y++) for (let x = box.left; x <= box.right; x++) {
    if (!own(x, y)) continue;
    for (let v = Math.max(box.top, y - r); v <= Math.min(box.bottom, y + r); v++) for (let u = Math.max(box.left, x - r); u <= Math.min(box.right, x + r); u++) {
      const i = (v - box.top) * w + u - box.left;
      darkest[i] = Math.min(darkest[i], gray[y * width + x]);
    }
  }
  if (paper - darkest.reduce((m, v) => Math.min(m, v), 255) < FINE_TRACE_SETTINGS.minimumContrast) return null;
  const levels = darkest.map((ink) => (paper - ink < FINE_TRACE_SETTINGS.minimumContrast ? -1 : (paper + ink) / 2));
  return { paper, level: (x: number, y: number) => levels[(y - box.top) * w + x - box.left] };
}

/** The box's ink, four times finer: bilinear tone at each fine pixel's centre darker than the cut - one level, or one
 * per source pixel (`level(x, y)`). With `allowed`, only the source pixels it marks are ink, and every other pixel is
 * read as `paper`, so a mark's outline does not run into the wall beside it. */
export function fineInk(gray: Uint8Array, size: { width: number; height: number }, box: PixelBox,
  level: number | ((x: number, y: number) => number), allowed?: (x: number, y: number) => boolean, paper = 255): FineMask {
  const { width, height } = size, s = FINE_TRACE_SETTINGS.upsample;
  const w = (box.right - box.left + 1) * s, h = (box.bottom - box.top + 1) * s, mask = new Uint8Array(w * h);
  const own = (x: number, y: number) => !allowed || (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom && allowed(x, y));
  const at = (x: number, y: number) => (own(x, y) ? gray[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))] : paper);
  for (let Y = 0; Y < h; Y++) {
    const sy = box.top + (Y + 0.5) / s - 0.5, y0 = Math.floor(sy), fy = sy - y0, py = box.top + Math.floor(Y / s);
    for (let X = 0; X < w; X++) {
      const sx = box.left + (X + 0.5) / s - 0.5, x0 = Math.floor(sx), fx = sx - x0, px = box.left + Math.floor(X / s);
      if (!own(px, py)) continue;
      const top = at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx, bottom = at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx;
      if (top * (1 - fy) + bottom * fy < (typeof level === "number" ? level : level(px, py))) mask[Y * w + X] = 1;
    }
  }
  return { mask, w, h, box };
}

/** A fine pixel's four neighbours inside the mask. */
function fourNeighbours(p: number, w: number, h: number) {
  const x = p % w, y = (p - x) / w, out: number[] = [];
  if (x > 0) out.push(p - 1);
  if (x < w - 1) out.push(p + 1);
  if (y > 0) out.push(p - w);
  if (y < h - 1) out.push(p + w);
  return out;
}

/** The 4-connected pieces of a fine mask: for each, its pixels. */
export function finePieces(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(mask.length), out: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const pixels = [start];
    seen[start] = 1;
    for (let k = 0; k < pixels.length; k++) for (const q of fourNeighbours(pixels[k], w, h)) if (mask[q] && !seen[q]) { seen[q] = 1; pixels.push(q); }
    out.push(pixels);
  }
  return out;
}

/** The source pixel (an index into the page) a fine pixel lies in. */
function sourceIndex(fine: FineMask, p: number, width: number) {
  const s = FINE_TRACE_SETTINGS.upsample, x = p % fine.w, y = (p - x) / fine.w;
  return (fine.box.top + Math.floor(y / s)) * width + fine.box.left + Math.floor(x / s);
}

/** Clears the fine shapes that are specks or lie mostly on ink the drawing explains (a line or wall through the box).
 * With `drawn`, the drawing's own lines through the box (a wall a letter touches) come out of it first: the letter
 * stays whole. */
export function dropFineShapes(fine: FineMask, explained: Uint8Array, width: number, drawn?: Uint8Array) {
  const { mask, w, h } = fine, minimum = (FINE_TRACE_SETTINGS.minimumShapePx * FINE_TRACE_SETTINGS.upsample) ** 2;
  if (drawn) for (let p = 0; p < mask.length; p++) if (mask[p] && drawn[sourceIndex(fine, p, width)]) mask[p] = 0;
  for (const pixels of finePieces(mask, w, h)) {
    const onDrawing = pixels.filter((p) => explained[sourceIndex(fine, p, width)] === 1).length;
    if (pixels.length < minimum || onDrawing >= FINE_TRACE_SETTINGS.explainedShare * pixels.length) for (const p of pixels) mask[p] = 0;
  }
}

const segmentDistance = (p: Point, a: Point, b: Point) => {
  const dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
};

/** A closed contour with the points a straight run within `tolerance` does not need left out (iterative
 * Douglas-Peucker): the fine grid's quarter-pixel stairs, before the fitting. The first and last points stay. */
export function simplifyContour(points: Point[], tolerance: number) {
  const keep = new Uint8Array(points.length), stack: Array<[number, number]> = [[0, points.length - 1]];
  keep[0] = keep[points.length - 1] = 1;
  const far = Math.floor(points.length / 2);
  if (points.length > 3) { keep[far] = 1; stack.splice(0, 1, [0, far], [far, points.length - 1]); }
  while (stack.length) {
    const [from, to] = stack.pop()!;
    let worst = -1, error = tolerance;
    for (let i = from + 1; i < to; i++) {
      const d = segmentDistance(points[i], points[from], points[to]);
      if (d > error) { error = d; worst = i; }
    }
    if (worst >= 0) { keep[worst] = 1; stack.push([from, worst], [worst, to]); }
  }
  return points.filter((_, i) => keep[i]);
}

type AxisRun = { from: number; to: number; level: boolean; at: number; length: number; dx: number; dy: number };

/** A closed ring's sides that run level or plumb (a pixel or longer, within 8 degrees): index of the start point,
 * direction and the line they lie on. */
function axisRuns(ring: Point[]): AxisRun[] {
  const runs: AxisRun[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const slope = Math.abs(Math.atan2(dy, dx)) % Math.PI, off = Math.min(slope, Math.abs(slope - Math.PI / 2), Math.PI - slope);
    if (off > (8 * Math.PI) / 180) continue;
    const level = Math.abs(dx) > Math.abs(dy);
    runs.push({ from: i, to: (i + 1) % ring.length, level, at: level ? (a.y + b.y) / 2 : (a.x + b.x) / 2, length, dx: dx / length, dy: dy / length });
  }
  return runs;
}

/** Which way the outline turns from run `a` to run `b`: +1 or -1. */
const turnSign = (a: AxisRun, b: AxisRun) => Math.sign(a.dx * b.dy - a.dy * b.dx);

/** Is the corner from run k to run k + 1 a step of a staircase - the pixel stairs of a slanted edge, where a short run
 * turns back the other way - rather than a corner of the shape? */
function stairStep(runs: AxisRun[], k: number) {
  const n = runs.length, z = runs[(k - 1 + n) % n], a = runs[k], b = runs[(k + 1) % n], c = runs[(k + 2) % n];
  return (b.length < 2 && turnSign(a, b) * turnSign(b, c) < 0) || (a.length < 2 && turnSign(z, a) * turnSign(a, b) < 0);
}

/** Where the level side `a` meets the plumb side `b` (or the other way round) through a short rounded stretch (the
 * mid-tone outline of a sharp corner; at most 1.4 px): the point where their lines cross, or null. */
function sharpCorner(a: AxisRun, b: AxisRun, ring: Point[]) {
  if (a.level === b.level) return null;
  let length = 0;
  for (let i = a.to; i !== b.from && length <= 1.4; i = (i + 1) % ring.length) {
    const q = ring[(i + 1) % ring.length];
    length += Math.hypot(q.x - ring[i].x, q.y - ring[i].y);
  }
  if (length > 1.4) return null;
  const corner = a.level ? { x: b.at, y: a.at } : { x: a.at, y: b.at };
  return Math.hypot(corner.x - ring[a.to].x, corner.y - ring[a.to].y) > 2.5 ? null : corner;
}

/** Square corners: where a level side and a plumb side meet through a short rounded stretch, the stretch is replaced by
 * the corner where the two sides' lines cross. A wall stub or a letter's corner then stays sharp; a curve longer than
 * that (an O, a door swing) and the pixel stairs of a slanted edge (a "/") are left as they are. */
export function squareCorners(points: Point[]) {
  const closed = points.length > 3 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y;
  const ring = closed ? points.slice(0, -1) : points.slice();
  const runs = axisRuns(ring);
  if (runs.length < 2) return points;
  const replace = new Map<number, Point>(), drop = new Set<number>(), n = ring.length;
  for (let k = 0; k < runs.length; k++) {
    const a = runs[k], b = runs[(k + 1) % runs.length], corner = stairStep(runs, k) ? null : sharpCorner(a, b, ring);
    if (!corner) continue;
    replace.set(a.to, corner);
    for (let j = (a.to + 1) % n; j !== (b.from + 1) % n; j = (j + 1) % n) if (j !== a.to) drop.add(j);
  }
  const out = ring.flatMap((p, i) => (drop.has(i) && !replace.has(i) ? [] : [replace.get(i) ?? p]));
  return closed && out.length ? [...out, out[0]] : out;
}

const ringArea = (ring: Point[]) => ring.slice(1).reduce((sum, p, i) => sum + ring[i].x * p.y - p.x * ring[i].y, 0) / 2;

function insideRing(p: Point, ring: Point[]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A closed ring's corners, as indices into it: where its outline, with the fine grid's stairs (a quarter pixel) taken
 * out, turns by more than 50 degrees. */
function ringCorners(ring: Point[]) {
  const coarse = simplifyContour(ring, 0.3), n = coarse.length - 1, at = new Map(ring.map((p, i) => [p, i] as const)), corners: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = coarse[(i - 1 + n) % n], b = coarse[i], c = coarse[(i + 1) % n];
    const t = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(b.y - a.y, b.x - a.x);
    const index = at.get(b);
    if (index !== undefined && index < ring.length - 1 && Math.abs(Math.atan2(Math.sin(t), Math.cos(t))) > (50 * Math.PI) / 180) corners.push(index);
  }
  corners.sort((p, q) => p - q);
  return corners.length ? corners : [0, Math.floor((ring.length - 1) / 2)];
}

/** A closed ring as one path of lines and curves: each run between two corners fitted on its own (curves allowed, so
 * a letter's bowl stays round, the fine grid's stairs within the bound come out straight), the corners kept sharp. A
 * run the fitting cannot bound stays as its points. */
function fitRing(ring: Point[], tolerance: number) {
  const corners = ringCorners(ring), n = ring.length - 1, path = { points: [ring[corners[0]]], commands: [] as TracePath["commands"] };
  for (let k = 0; k < corners.length; k++) {
    const from = corners[k], to = corners[(k + 1) % corners.length], run: Point[] = [];
    for (let i = from; ; i = (i + 1) % n) { run.push(ring[i]); if (i === to && run.length > 1) break; }
    let piece: TracePath;
    try { piece = fitTracePath(run, tolerance, false, ""); } catch { piece = { points: run, commands: run.slice(1).map(() => "L"), fill: true, strokeWidthPx: 1, groupId: "" }; }
    path.commands.push(...piece.commands.filter((command) => command !== "Z"));
    path.points.push(...piece.points.slice(1));
  }
  path.commands.push("Z");
  return path;
}

/** A filled circle as a path: four quarter-circle curves round its centre. */
export function circlePath(cx: number, cy: number, r: number) {
  const k = 0.5523 * r;
  const points = [{ x: cx + r, y: cy },
    { x: cx + r, y: cy + k }, { x: cx + k, y: cy + r }, { x: cx, y: cy + r },
    { x: cx - k, y: cy + r }, { x: cx - r, y: cy + k }, { x: cx - r, y: cy },
    { x: cx - r, y: cy - k }, { x: cx - k, y: cy - r }, { x: cx, y: cy - r },
    { x: cx + k, y: cy - r }, { x: cx + r, y: cy - k }, { x: cx + r, y: cy }];
  return { points, commands: ["C", "C", "C", "C", "Z"] as TracePath["commands"] };
}

/** A small round shape (a dimension's dot) as a true circle, or null. */
function roundDot(ring: Point[]) {
  const xs = ring.map((p) => p.x), ys = ring.map((p) => p.y), area = Math.abs(ringArea(ring));
  const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), side = Math.max(w, h);
  if (side > 12 || side < 2 || Math.abs(w - h) > 0.25 * side || area < 0.68 * w * h || area > 0.86 * w * h) return null;
  return circlePath((Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, Math.sqrt(area / Math.PI));
}

/** The fine mask's shapes as filled trace paths in source pixels (holes kept as holes; letters' curves as curves). */
export async function fineShapePaths(fine: FineMask, signal: AbortSignal): Promise<TracePath[]> {
  const s = FINE_TRACE_SETTINGS.upsample, { box } = fine;
  const rings = traceFillContours(fine.mask, fine.w, fine.h)
    .map((contour) => squareCorners(simplifyContour(contour.map((p): Point => ({ x: box.left + p.x / s, y: box.top + p.y / s })), 0.05)))
    .filter((ring) => ring.length >= 4);
  signal.throwIfAborted();
  const holes = rings.filter((ring) => ringArea(ring) < 0);
  const outers = rings.filter((ring) => ringArea(ring) > 0).map((ring) => ({ ring, area: ringArea(ring),
    path: (!holes.some((hole) => insideRing(hole[0], ring)) && roundDot(ring)) || fitRing(ring, FINE_TRACE_SETTINGS.fitErrorPx) }));
  for (const hole of holes) {
    const outer = outers.filter((o) => insideRing(hole[0], o.ring)).sort((a, b) => a.area - b.area)[0];
    if (!outer) continue;
    const path = fitRing(hole, FINE_TRACE_SETTINGS.fitErrorPx);
    outer.path.commands.push("M", ...path.commands);
    outer.path.points.push(...path.points);
  }
  return outers.map((o): TracePath => ({ ...o.path, fill: true, strokeWidthPx: 1, groupId: "fine" }));
}
