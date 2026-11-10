import { boundsOf, DrawingRecorder, type DrawnCommand, type DrawnShape } from "./pdf-drawing-recorder";
import { simplifiedCurves } from "./pdf-own-curves";
import { loadFloorPlanPdfRuntime } from "./pdf-runtime";
import { pdfDrawingPlanArea } from "./pdf-own-plan-area";
import type { SourceTextEvidence } from "./deterministic-evidence";
import type { SourceArtworkTrace } from "./source-artwork-trace";
import type { TracePath } from "./source-trace-fit";
import { TRACE_SETTINGS } from "./source-trace-mask";

/**
 * A vector PDF page's traced drawing taken from the page itself (J, 9 Nov 2026: "Use PDF's own vectors"): every line
 * at its own width, cap and grey, every fill (white masks included), and the lettering as the font's own outlines,
 * in page order, so the Traced view matches the PDF as Illustrator shows it. The picture-based tracer is kept for
 * pages this cannot draw exactly (a picture on the page, a pattern, a clip cutting a shape, text with no outline).
 */
export const PDF_OWN_DRAWING_VERSION = "pdf-own-drawing-v1";
export const PDF_OWN_DRAWING_SETTINGS = Object.freeze({
  /** Drawn this many times finer than the page picture, so PDF.js's one-pixel least line width is a quarter pixel. */
  oversample: 4,
  /** Points are kept to a hundredth of a page pixel. */
  precision: 100,
  /** A page needing more points than this is too detailed to keep beside the plan (the candidate's 5 MB cap). */
  maxPoints: 100_000,
  maxCommandsPerPath: 4000,
  /** Runs of curves are redrawn with fewer where they stay this close (page pixels; the sharp picture has three). */
  curveTolerancePx: 0.08,
  /** How many paths back a shape may move to join one like it. */
  lookBack: 64,
});

type PdfPage = {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvas: unknown; canvasContext?: unknown; viewport: unknown }): { promise: Promise<unknown>; cancel(): void };
};
/** A page's own drawing (of its plan area alone, where `area` is given), or why it keeps the picture-based trace. */
export type OwnDrawing = { trace: SourceArtworkTrace; area?: number[] } | { reason: string };

/**
 * The scale the page picture was drawn at (pdf-raster-adapter.ts renderPdf: twice the PDF's points, less for a page
 * over 16 million pixels), where it gives the picture's width; otherwise the width's own ratio.
 */
export function pdfReadingScale(unitWidth: number, unitHeight: number, widthPx: number) {
  const scale = 2 * Math.min(1, Math.sqrt(16_000_000 / Math.max(1, 4 * unitWidth * unitHeight)));
  return Math.ceil(unitWidth * scale) === widthPx ? scale : widthPx / unitWidth;
}

/** What the page draws, recorded in page-picture pixels (`widthPx` by `heightPx`). A problem with no known place stops
 * it; one with a place (a picture, a shape a clip cuts) is kept, so a plan area clear of it can still be drawn. */
export async function recordPdfPageDrawing(page: PdfPage, widthPx: number, heightPx: number) {
  const { oversample } = PDF_OWN_DRAWING_SETTINGS;
  const unit = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: pdfReadingScale(unit.width, unit.height, widthPx) * oversample });
  const recorder = new DrawingRecorder(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const task = page.render({ canvas: recorder.canvas, canvasContext: recorder, viewport });
  recorder.onUnsupported = () => task.cancel();
  await task.promise.catch((cause: unknown) => { if (!recorder.problems.some((problem) => !problem.bbox)) throw cause; });
  return { shapes: recorder.shapes, problems: recorder.problems, scale: 1 / oversample, widthPx, heightPx };
}

/** The PDF's own drawing of each page asked for, by page number, or why a page keeps its picture-based trace. Only a
 * cancelled import stops it: any other failure leaves the pages to the tracers. */
export async function pdfOwnDrawings(bytes: Uint8Array,
  pages: Array<{ pageNumber: number; widthPx: number; heightPx: number; text?: TextBox[]; area?: number[] | null }>,
  signal?: AbortSignal): Promise<Map<number, OwnDrawing>> {
  const drawings = new Map<number, OwnDrawing>();
  const reason = (cause: unknown) => ({ reason: cause instanceof Error ? cause.message : "the PDF could not be drawn" });
  let loadingTask: { promise: Promise<{ getPage(n: number): Promise<PdfPage> }>; destroy(): Promise<void> } | null = null;
  try {
    if (!pages.length) return drawings;
    const { createLoadingTask } = await loadFloorPlanPdfRuntime();
    const task = createLoadingTask(bytes, true);
    loadingTask = task;
    const pdf = await task.promise;
    for (const { pageNumber, widthPx, heightPx, text, area } of pages) {
      signal?.throwIfAborted();
      const started = Date.now();
      const recorded = await recordPdfPageDrawing(await pdf.getPage(pageNumber), widthPx, heightPx).catch(reason);
      if ("reason" in recorded) { drawings.set(pageNumber, recorded); continue; }
      // The whole sheet first; where it cannot be drawn, the plan area alone (the vectorizer's, or else the drawing's).
      const whole = pdfOwnDrawingTrace(recorded, started, text);
      const planArea = "reason" in whole ? area ?? pdfDrawingPlanArea(recorded) : null;
      drawings.set(pageNumber, planArea ? pdfOwnDrawingTrace(recorded, started, text, planArea) : whole);
    }
  } catch (cause) {
    signal?.throwIfAborted();
    for (const { pageNumber } of pages) if (!drawings.has(pageNumber)) drawings.set(pageNumber, reason(cause));
  } finally {
    await loadingTask?.destroy();
  }
  return drawings;
}

/** The recorded page as a trace (only what lies wholly inside `area`, page pixels, where given), or the reason it is not
 * drawn this way: a problem anywhere on a whole page; in an area, a picture or lettering over it, or a shape left out
 * that lies wholly inside it (one crossing its edge is left out like any other shape there). */
export function pdfOwnDrawingTrace(recorded: Awaited<ReturnType<typeof recordPdfPageDrawing>>, started = Date.now(),
  text: TextBox[] = [], area?: number[]): OwnDrawing {
  const device = area?.map((value) => value / recorded.scale);
  const blocking = recorded.problems.filter((problem) => !device || !problem.bbox
    || (problem.shape ? within(problem.bbox, device) : overlaps(problem.bbox, device)));
  if (blocking.length) return { reason: [...new Set(blocking.map((problem) => problem.reason))].join(", ") + (area ? " in the plan area" : "") };
  const shapes = visibleShapes(device ? recorded.shapes.filter((shape) => within(shape.bbox, device)) : recorded.shapes);
  const boxes = text.map(textBounds);
  const paths = mergedPaths(shapes.map((shape) => scaled(shape, recorded.scale))
    .map((shape) => (!shape.letter && boxes.some((box) => within(shape.bbox, box)) ? { ...shape, letter: true } : shape)));
  if (!paths) return { reason: `a shape of more than ${PDF_OWN_DRAWING_SETTINGS.maxCommandsPerPath} commands` };
  const points = paths.reduce((sum, path) => sum + path.points.length, 0);
  if (!paths.length) return { reason: "nothing drawn" };
  if (points > PDF_OWN_DRAWING_SETTINGS.maxPoints) return { reason: `${points} points, more than ${PDF_OWN_DRAWING_SETTINGS.maxPoints}` };
  const curves = paths.reduce((sum, path) => sum + path.commands.filter((c) => c === "C").length, 0);
  return { ...(area ? { area } : {}), trace: { version: PDF_OWN_DRAWING_VERSION, widthPx: recorded.widthPx, heightPx: recorded.heightPx, paths,
    settings: { ...TRACE_SETTINGS, version: PDF_OWN_DRAWING_VERSION },
    diagnostics: { inkPixels: 0, removedSpeckPixels: 0, rawChains: 0, fillContours: shapes.filter((s) => s.kind === "fill").length,
      curves, elapsedMs: Date.now() - started, glyphPixels: 0 } } };
}

/** Lettering the page reads (its text layer or OCR), in page pixels. */
type TextBox = Pick<SourceTextEvidence, "center" | "widthPx" | "heightPx" | "rotationDegrees">;
function textBounds({ center, widthPx, heightPx, rotationDegrees = 0 }: TextBox): number[] {
  const a = (rotationDegrees * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = (widthPx * c + heightPx * s) / 2 + 1, h = (widthPx * s + heightPx * c) / 2 + 1;
  return [center.x - w, center.y - h, center.x + w, center.y + h];
}
/** A shape inside lettering the page reads is part of it (a CAD font drawn in strokes). */
const within = (a: number[], b: number[]) => a[0] >= b[0] && a[1] >= b[1] && a[2] <= b[2] && a[3] <= b[3];
const overlaps = (a: number[], b: number[]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
/** Boxes that overlap or meet (half a pixel apart at most): parts of one drawn thing. */
const touches = (a: number[], b: number[]) => a[0] <= b[2] + 0.5 && a[2] >= b[0] - 0.5 && a[1] <= b[3] + 0.5 && a[3] >= b[1] - 0.5;

/** White painted where nothing is drawn yet changes nothing (the page's own white background above all). */
function visibleShapes(shapes: DrawnShape[]) {
  const kept: DrawnShape[] = [];
  for (const shape of shapes) {
    if (shape.tone === 255 && !kept.some((k) => overlaps(k.bbox, shape.bbox))) continue;
    kept.push(shape);
  }
  return kept;
}

function scaled(shape: DrawnShape, scale: number): DrawnShape {
  const p = PDF_OWN_DRAWING_SETTINGS.precision, r = (v: number) => Math.round(v * p) / p;
  const inPage = shape.commands.map((c): DrawnCommand => (c.op === "Z" ? c : c.op === "C"
    ? { op: "C", p: [c.p[0] * scale, c.p[1] * scale, c.p[2] * scale, c.p[3] * scale, c.p[4] * scale, c.p[5] * scale] } : { op: c.op, p: [c.p[0] * scale, c.p[1] * scale] }));
  const commands = simplifiedCurves(inPage, PDF_OWN_DRAWING_SETTINGS.curveTolerancePx).map((c): DrawnCommand => (c.op === "Z" ? c : c.op === "C"
    ? { op: "C", p: [r(c.p[0]), r(c.p[1]), r(c.p[2]), r(c.p[3]), r(c.p[4]), r(c.p[5])] } : { op: c.op, p: [r(c.p[0]), r(c.p[1])] }));
  const oriented = shape.kind !== "fill" ? commands : simple(commands) ? turnedPositive(commands)
    : shape.evenOdd ? evenOddAsNonZero(commands) : commands;
  return { ...shape, commands: oriented, widthPx: Math.max(0.01, shape.widthPx * scale), bbox: boundsOf(oriented, shape.kind === "stroke" ? shape.widthPx * scale / 2 : 0),
    dash: shape.dash.map((d) => d * scale), dashOffset: shape.dashOffset * scale };
}

/**
 * Same-looking shapes become one path, drawn where the first of them was. A shape moves back to join one only if
 * nothing drawn since in another grey overlaps it, so the page looks the same. Fills of one outline, all turned the same
 * way, join even where they overlap: one path, so the pieces of a solid (a wall's triangles, a dot's slices) show no
 * seam between them. A fill with holes joins only where it overlaps nothing, so the non-zero rule the views fill
 * with cannot cancel one against another.
 */
/** A fill of one outline, turned one way (`turnedPositive`): any number of them overlap without cancelling. */
const simple = (commands: DrawnCommand[]) => commands.filter((c) => c.op === "M").length === 1;
function turnedPositive(commands: DrawnCommand[]) {
  const ring = flattened(commands).map(([a]) => a);
  return ring.length > 2 && area(ring) < 0 ? reversed(commands) : commands;
}

type Group = { path: TracePath; key: string; tone: number; boxes: Array<{ box: number[]; simple: boolean }> };
const pathKey = (piece: DrawnShape) =>
  `${piece.letter}|${piece.kind}|${piece.tone}|${piece.kind === "stroke" ? `${piece.widthPx.toFixed(2)}|${piece.cap}|${piece.join}` : ""}`;

/** Whether the piece can join the group: alike, room left, a fill not cancelling the group's own, and (lettering aside)
 * touching what the group already holds, so a path stays one drawn thing (a door, a fixture, a run of wall). */
function joins(group: Group, key: string, piece: DrawnShape) {
  return group.key === key && group.path.commands.length + piece.commands.length <= PDF_OWN_DRAWING_SETTINGS.maxCommandsPerPath &&
    (piece.kind === "stroke" || !group.boxes.some((b) => overlaps(b.box, piece.bbox) && !(b.simple && simple(piece.commands)))) &&
    (piece.letter || group.boxes.some((b) => touches(b.box, piece.bbox)));
}

function newGroup(piece: DrawnShape, key: string, index: number): Group {
  const stroke = piece.kind === "stroke";
  return { key, tone: piece.tone, boxes: [], path: { points: [], commands: [], fill: !stroke, groupId: `pdf-${piece.letter ? "letter-" : ""}${index}`,
    tone: piece.tone, strokeWidthPx: stroke ? Math.min(100, Number(piece.widthPx.toFixed(2))) : 1,
    ...(stroke && piece.cap !== "butt" ? { lineCap: piece.cap } : {}), ...(stroke && piece.join !== "miter" ? { lineJoin: piece.join } : {}) } };
}

function mergedPaths(shapes: DrawnShape[]): TracePath[] | null {
  const { maxCommandsPerPath, lookBack } = PDF_OWN_DRAWING_SETTINGS;
  const groups: Group[] = [];
  for (const piece of shapes.flatMap(dashed)) {
    if (piece.commands.length > maxCommandsPerPath) return null;
    const key = pathKey(piece);
    let target: Group | undefined;
    for (let i = groups.length - 1; i >= Math.max(0, groups.length - lookBack) && !target; i--) {
      if (joins(groups[i], key, piece)) target = groups[i];
      else if (groups[i].tone !== piece.tone && groups[i].boxes.some((b) => overlaps(b.box, piece.bbox))) break;
    }
    if (!target) groups.push((target = newGroup(piece, key, groups.length)));
    target.boxes.push({ box: piece.bbox, simple: piece.kind === "fill" && simple(piece.commands) });
    append(target.path, piece.commands);
  }
  return groups.map((group) => group.path);
}

/** A trace path keeps its first point as its start and each later command's points after it. */
function append(path: TracePath, commands: DrawnCommand[]) {
  for (const c of commands) {
    if (c.op === "Z") { path.commands.push("Z"); continue; }
    const points = [];
    for (let i = 0; i < c.p.length; i += 2) points.push({ x: c.p[i], y: c.p[i + 1] });
    if (!path.points.length) { if (c.op !== "M") return; path.points.push(points[0]); continue; }
    path.commands.push(c.op);
    path.points.push(...points);
  }
}

function subpaths(commands: DrawnCommand[]) {
  const out: DrawnCommand[][] = [];
  for (const c of commands) { if (c.op === "M" || !out.length) out.push([]); out[out.length - 1].push(c); }
  return out;
}

/** A stroke's dash pattern cut into the pieces it draws (lines and curves alike, the curves walked in short steps). */
export function dashed(shape: DrawnShape): DrawnShape[] {
  if (shape.kind !== "stroke" || !shape.dash.length || shape.dash.every((d) => d === 0)) return [shape];
  const walker = dashWalker(shape);
  for (const sub of subpaths(shape.commands)) {
    walker.start();
    for (const [a, b] of flattened(sub)) walker.walk(a, b);
  }
  return walker.pieces.length ? [{ ...shape, dash: [], commands: walker.pieces }] : [];
}

/** Walks a stroke's subpaths along its dash pattern, keeping the dashes (a zero-length dash with round or square ends
 * is a dot, as the PDF draws it). */
function dashWalker(shape: DrawnShape) {
  const full = shape.dash.length % 2 ? [...shape.dash, ...shape.dash] : shape.dash;
  const total = full.reduce((a, b) => a + b, 0);
  const pieces: DrawnCommand[] = [];
  let index = 0, left = 0, drawing = false;
  const next = (at: [number, number]) => {
    index = (index + 1) % full.length; left = full[index]; drawing = false;
    if (index % 2 === 0 && left === 0 && shape.cap !== "butt") pieces.push({ op: "M", p: at }, { op: "L", p: at });
  };
  const start = () => {
    let phase = ((shape.dashOffset % total) + total) % total;
    index = 0;
    while (phase >= full[index]) { phase -= full[index]; index = (index + 1) % full.length; }
    left = full[index] - phase; drawing = false;
  };
  const walk = (a: [number, number], b: [number, number]) => {
    let from = a, length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (length > 0) {
      const step = Math.min(left, length), t = step / length;
      const to: [number, number] = [from[0] + (b[0] - from[0]) * t, from[1] + (b[1] - from[1]) * t];
      if (index % 2 === 0) { if (!drawing) pieces.push({ op: "M", p: from }); pieces.push({ op: "L", p: to }); drawing = true; }
      from = to; length -= step; left -= step;
      if (left <= 1e-9) next(from);
    }
  };
  return { pieces, start, walk };
}

/** A subpath as straight steps (a curve in sixteen). */
function flattened(sub: DrawnCommand[]): Array<[[number, number], [number, number]]> {
  const steps: Array<[[number, number], [number, number]]> = [];
  let start: [number, number] = [0, 0], at: [number, number] = [0, 0];
  for (const c of sub) {
    if (c.op === "M") { start = at = c.p; continue; }
    if (c.op === "L") { steps.push([at, c.p]); at = c.p; continue; }
    if (c.op === "Z") { steps.push([at, start]); at = start; continue; }
    const [x1, y1, x2, y2, x3, y3] = c.p;
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, u = 1 - t;
      const next: [number, number] = [u * u * u * at[0] + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        u * u * u * at[1] + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3];
      steps.push([at, next]); at = next;
    }
  }
  return steps.filter(([a, b]) => a[0] !== b[0] || a[1] !== b[1]);
}

/**
 * An even-odd fill redrawn for the non-zero rule the views use: each outline turns the way its depth asks (outer
 * outlines one way, the holes in them the other, islands in the holes the first way again), which fills the same area
 * wherever outlines do not cross.
 */
export function evenOddAsNonZero(commands: DrawnCommand[]): DrawnCommand[] {
  const subs = subpaths(commands);
  if (subs.length < 2) return commands;
  const rings = subs.map((sub) => flattened(sub).map(([a]) => a));
  return subs.flatMap((sub, i) => {
    const ring = rings[i];
    if (ring.length < 3) return sub;
    const depth = rings.reduce((n, other, j) => n + (j !== i && other.length > 2 && contains(other, ring[0]) ? 1 : 0), 0);
    return (area(ring) > 0) === (depth % 2 === 0) ? sub : reversed(sub);
  });
}

const area = (ring: Array<[number, number]>) => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
function contains(ring: Array<[number, number]>, [x, y]: [number, number]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** One subpath walked the other way round, curves with their controls swapped. */
function reversed(sub: DrawnCommand[]): DrawnCommand[] {
  const closed = sub[sub.length - 1]?.op === "Z";
  const out: DrawnCommand[] = [];
  let at: [number, number] = [0, 0];
  const segments: Array<{ from: [number, number]; c: DrawnCommand }> = [];
  for (const c of sub) {
    if (c.op === "M") { at = c.p; continue; }
    if (c.op === "Z") continue;
    segments.push({ from: at, c }); at = c.op === "C" ? [c.p[4], c.p[5]] : c.p;
  }
  out.push({ op: "M", p: at });
  for (const { from, c } of segments.reverse()) {
    out.push(c.op === "C" ? { op: "C", p: [c.p[2], c.p[3], c.p[0], c.p[1], from[0], from[1]] } : { op: "L", p: from });
  }
  if (closed) out.push({ op: "Z" });
  return out;
}
