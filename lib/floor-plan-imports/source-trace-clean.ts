import type { SourcePointPx as Point } from "./deterministic-evidence";
import type { TracePath } from "./source-trace-fit";
import { letteringBoxes } from "./source-trace-lettering";
import { squareFilter } from "./source-trace-paper";
import type { RegisteredVectorizerDrawing, VectorizerDrawingItem } from "./vectorizer-drawing";

/**
 * The clean traced drawing (source-strokes-v3, J 15 Oct: "trace and reproduce a clean 2d vector floor plan"): the
 * vectorizer's own drawing of the page - every wall it read, whether or not it closes a room, with doors, windows,
 * fixtures and lines - redrawn as sharp vector shapes, the source's lettering traced from the picture, and the ink
 * the drawing does not explain traced as before. Walls are solid fills (J, 15 Oct).
 */
export const CLEAN_TRACE_SETTINGS = Object.freeze({
  version: "source-strokes-v3",
  explainedMarginPx: 1.5,
  /** A traced leftover lying mostly this close to the drawing is the soft edge of a line it already drew. */
  shadowMarginPx: 3.5,
  shadowShare: 0.7,
  /** A stroke of the reading with less than this share of its length on ink is misplaced or misread. */
  inkSupport: 0.35,
  /** A line of the reading is carried on along its ink this far at most. */
  extendPx: 12,
  /** A line's end goes onto a line it meets this many pixels away at most. */
  joinPx: 3,
  /** Ink a square this wide fits inside is solid (a dot, a column), not a line's width. */
  solidPx: 5,
});

type Polyline = { points: Point[]; closed: boolean };

/** The drawing's shapes as trace paths, in drawing order (`groupId` clean-<kind>-<n>). */
export function cleanDrawingPaths(drawing: RegisteredVectorizerDrawing): TracePath[] {
  return drawing.items.map((item, index) => ({
    points: item.points.map((point) => ({ x: point.x, y: point.y })),
    commands: [...item.commands],
    fill: item.fill,
    strokeWidthPx: item.fill ? 1 : Math.min(100, Math.max(0.25, item.strokeWidthPx)),
    groupId: `clean-${item.kind}-${index + 1}`,
  }));
}

function cubicAt(a: Point, b: Point, c: Point, d: Point, t: number): Point {
  const s = 1 - t;
  return {
    x: s * s * s * a.x + 3 * s * s * t * b.x + 3 * s * t * t * c.x + t * t * t * d.x,
    y: s * s * s * a.y + 3 * s * s * t * b.y + 3 * s * t * t * c.y + t * t * t * d.y,
  };
}

/** An item as polylines: curves sampled about every two pixels. */
export function drawingPolylines(item: VectorizerDrawingItem): Polyline[] {
  const lines: Polyline[] = [{ points: [item.points[0]], closed: false }];
  let at = 1;
  for (const command of item.commands) {
    const current = lines[lines.length - 1];
    switch (command) {
      case "Z": current.closed = true; break;
      case "M": lines.push({ points: [item.points[at++]], closed: false }); break;
      case "L": current.points.push(item.points[at++]); break;
      default: {
        const start = current.points[current.points.length - 1], [b, c, d] = item.points.slice(at, at + 3);
        at += 3;
        const steps = Math.min(32, Math.max(4, Math.ceil(Math.hypot(d.x - start.x, d.y - start.y) / 2)));
        for (let i = 1; i <= steps; i++) current.points.push(cubicAt(start, b, c, d, i / steps));
      }
    }
  }
  return lines.filter((line) => line.points.length > 1 || line.closed);
}

function discOffsets(radius: number) {
  const r = Math.ceil(radius), offsets: Array<[number, number]> = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
  return offsets;
}

/** Marks every pixel whose centre lies within `radius` of the polyline. */
function stampPolyline(mask: Uint8Array, width: number, height: number, line: Polyline, radius: number) {
  const offsets = discOffsets(Math.max(0.5, radius));
  const points = line.closed ? [...line.points, line.points[0]] : line.points;
  const stamp = (p: Point) => {
    const cx = Math.floor(p.x), cy = Math.floor(p.y);
    for (const [dx, dy] of offsets) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1;
    }
  };
  stamp(points[0]);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 2));
    for (let k = 1; k <= steps; k++) stamp({ x: a.x + ((b.x - a.x) * k) / steps, y: a.y + ((b.y - a.y) * k) / steps });
  }
}

/** Even-odd fill of closed polylines, at pixel centres. */
function fillPolylines(mask: Uint8Array, width: number, height: number, lines: Polyline[]) {
  const edges = lines.flatMap((line) => line.points.map((a, i) => [a, line.points[(i + 1) % line.points.length]] as const));
  const ys = edges.flatMap(([a, b]) => [a.y, b.y]);
  const top = Math.max(0, Math.floor(Math.min(...ys))), bottom = Math.min(height - 1, Math.ceil(Math.max(...ys)));
  for (let y = top; y <= bottom; y++) {
    const yc = y + 0.5, crossings: number[] = [];
    for (const [a, b] of edges) if ((a.y > yc) !== (b.y > yc)) crossings.push(a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y));
    crossings.sort((p, q) => p - q);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i] - 0.5)), to = Math.min(width - 1, Math.floor(crossings[i + 1] - 0.5));
      for (let x = from; x <= to; x++) mask[y * width + x] = 1;
    }
  }
}

/** The pixels the drawing accounts for: its fills and strokes, with a margin for the source's soft edges. */
export function explainedInkMask(drawing: RegisteredVectorizerDrawing, width: number, height: number,
  margin: number = CLEAN_TRACE_SETTINGS.explainedMarginPx) {
  const mask = new Uint8Array(width * height);
  for (const item of drawing.items) {
    const lines = drawingPolylines(item);
    if (item.fill) fillPolylines(mask, width, height, lines.filter((line) => line.closed));
    for (const line of lines) stampPolyline(mask, width, height, line, (item.fill ? 0 : item.strokeWidthPx / 2) + margin);
  }
  return mask;
}

/** The darkest tone within a pixel of a point. */
export function darkestNear(gray: Uint8Array, width: number, p: Point) {
  const height = gray.length / width;
  let best = 255;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
    if (x >= 0 && y >= 0 && x < width && y < height) best = Math.min(best, gray[y * width + x]);
  }
  return best;
}

/** Points along an item's lines, about every 1.5 px. */
export function lineSamples(item: VectorizerDrawingItem) {
  return drawingPolylines(item).flatMap((line) => line.points.flatMap((a, i) => {
    const b = line.points[i + 1];
    if (!b) return [a];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 1.5));
    return Array.from({ length: n }, (_, k) => ({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
  }));
}

/** The tones of the plan's own lines: per stroke of the drawing, the median of the darkest tone near it; of those, the
 * median and the 90th percentile (the lightest lines), or null for a drawing with too few strokes to tell. */
export function planLineTone(drawing: RegisteredVectorizerDrawing, gray: Uint8Array, width: number) {
  const tones: number[] = [];
  for (const item of drawing.items) {
    if (item.fill) continue;
    const near = lineSamples(item).map((p) => darkestNear(gray, width, p)).sort((a, b) => a - b);
    if (near.length >= 3) tones.push(near[Math.floor(near.length / 2)]);
  }
  if (tones.length < 20) return null;
  tones.sort((a, b) => a - b);
  return { median: tones[Math.floor(tones.length / 2)], light: tones[Math.floor(tones.length * 0.9)] };
}

const sharesEnd = (a: VectorizerDrawingItem, b: VectorizerDrawingItem) => [a.points[0], a.points[a.points.length - 1]]
  .some((p) => [b.points[0], b.points[b.points.length - 1]].some((q) => Math.hypot(p.x - q.x, p.y - q.y) <= 1));

/** Door swings the reading placed through a wall (a misread door: s001's basin beside the bath's wall read as a double
 * door): a swing running a third of its length or more well inside a wall, and the door's other swing (sharing its
 * end) with it. */
function swingsThroughWalls(drawing: RegisteredVectorizerDrawing, width: number, height: number) {
  const walls = explainedInkMask({ ...drawing, items: drawing.items.filter((item) => item.fill) }, width, height, 0);
  const deep = (p: Point) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const x = Math.round(p.x) + dx, y = Math.round(p.y) + dy;
      if (x < 0 || y < 0 || x >= width || y >= height || !walls[y * width + x]) return false;
    }
    return true;
  };
  const swings = drawing.items.filter((item) => item.kind === "door-swing");
  const misread = new Set(swings.filter((item) => {
    const samples = lineSamples(item);
    return samples.filter(deep).length >= samples.length / 3;
  }));
  for (const swing of swings) if ([...misread].some((bad) => bad !== swing && sharesEnd(bad, swing))) misread.add(swing);
  return misread;
}

/** The drawing without the strokes the picture does not support: a line of the reading lying mostly on paper is
 * misplaced (its ink, a little to one side, is then traced instead, rather than drawn twice) or misread. Dashed lines
 * (their dashes need not fall on the drawn ones) and short pieces stay. */
export function supportedDrawing(drawing: RegisteredVectorizerDrawing, gray: Uint8Array, width: number, inkTone: number) {
  const misread = swingsThroughWalls(drawing, width, gray.length / width);
  const items = drawing.items.filter((item) => {
    if (misread.has(item)) return false;
    if (item.fill || item.kind.includes("dash")) return true;
    const samples = lineSamples(item);
    if (samples.length < 6) return true;
    return samples.filter((p) => darkestNear(gray, width, p) < inkTone).length >= CLEAN_TRACE_SETTINGS.inkSupport * samples.length;
  });
  return { drawing: { ...drawing, items }, unsupported: drawing.items.length - items.length };
}

/** The tone at a point, between pixels (bilinear). */
export function toneAt(gray: Uint8Array, width: number, p: Point) {
  const height = gray.length / width, x = Math.min(width - 1.001, Math.max(0, p.x - 0.5)), y = Math.min(height - 1.001, Math.max(0, p.y - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, at = (xx: number, yy: number) => gray[yy * width + xx];
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
}

/** How far the ink runs on past a line's end, along the line (0 when it stops there). */
function inkRun(gray: Uint8Array, width: number, end: Point, from: Point, inkTone: number) {
  const length = Math.hypot(end.x - from.x, end.y - from.y), ux = (end.x - from.x) / length, uy = (end.y - from.y) / length;
  let run = 0;
  for (let t = 0.5; t <= CLEAN_TRACE_SETTINGS.extendPx; t += 0.5) {
    if (toneAt(gray, width, { x: end.x + ux * t, y: end.y + uy * t }) >= inkTone) break;
    run = t;
  }
  return run;
}

/** The drawing's straight lines carried on to where their ink ends: the reading stops a line short where it meets a
 * column, a frame or a tick (a gap the picture does not have); the ink beyond its end, along it, is the line's own. */
export function extendAlongInk(drawing: RegisteredVectorizerDrawing, gray: Uint8Array, width: number, inkTone: number) {
  let extended = 0;
  const items = drawing.items.map((item) => {
    if (item.fill || item.kind.includes("dash") || item.commands.length !== 1 || item.commands[0] !== "L") return item;
    const [a, b] = item.points;
    if (Math.hypot(b.x - a.x, b.y - a.y) < 4) return item;
    const ra = inkRun(gray, width, a, b, inkTone), rb = inkRun(gray, width, b, a, inkTone);
    if (ra < 1 && rb < 1) return item;
    extended++;
    const len = Math.hypot(b.x - a.x, b.y - a.y), ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    return { ...item, points: [{ x: a.x - ux * ra, y: a.y - uy * ra }, { x: b.x + ux * rb, y: b.y + uy * rb }] };
  });
  return { drawing: { ...drawing, items }, extended };
}

/** The pieces of a mask that are blobs: no longer than 15 px, and at most two and a half times as long as wide. */
function blobPieces(mask: Uint8Array, width: number, height: number) {
  const seen = new Uint8Array(mask.length), out: number[][] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || seen[start]) continue;
    const pixels = [start], box = [width, height, 0, 0];
    seen[start] = 1;
    for (let k = 0; k < pixels.length; k++) {
      const p = pixels[k], x = p % width, y = (p - x) / width;
      box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y); box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      for (const q of [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1]) {
        if (q >= 0 && mask[q] && !seen[q]) { seen[q] = 1; pixels.push(q); }
      }
    }
    const w = box[2] - box[0] + 1, h = box[3] - box[1] + 1;
    if (Math.max(w, h) <= 15 && Math.max(w, h) <= 2.5 * Math.min(w, h)) out.push(pixels);
  }
  return out;
}

/** Solid ink - a dimension's dot, an arrowhead, a column or wall stub the reading missed - that no filled shape of the
 * drawing accounts for: the ink a square of five pixels fits inside, less the drawing's fills. It stays to be traced
 * whole, even where a line of the drawing runs through it (a line explains its own width, not a dot on it). */
function unexplainedSolids(ink: Uint8Array, drawing: RegisteredVectorizerDrawing, width: number, height: number) {
  const open = (size: number) => squareFilter(squareFilter(ink, width, height, size, false), width, height, size, true);
  const solid = open(CLEAN_TRACE_SETTINGS.solidPx), dots = open(3);
  // (a dot a little wider than a line - a dimension's dot, about 5 px across - is a round piece, not a long one)
  for (const piece of blobPieces(dots, width, height)) for (const p of piece) solid[p] = 1;
  const fills = explainedInkMask({ ...drawing, items: drawing.items.filter((item) => item.fill) }, width, height, 1);
  for (let i = 0; i < solid.length; i++) if (fills[i]) solid[i] = 0;
  return solid;
}

type Segment = { item: number; a: Point; b: Point; half: number };

/** Where the line through p along u meets the line through q along v (null when they are near parallel). */
function crossing(p: Point, u: Point, q: Point, v: Point) {
  const det = u.x * v.y - u.y * v.x;
  if (Math.abs(det) < 0.5) return null;                       // (closer than 30 degrees to parallel)
  const t = ((q.x - p.x) * v.y - (q.y - p.y) * v.x) / det;
  return { x: p.x + u.x * t, y: p.y + u.y * t, t };
}

/** Where one end of a line goes: onto the nearest line it meets or stops short of (a T or an L), within `reach` of
 * that line's faces; with the half weight of that line (how far the end then runs on, to its far face). */
function snapEnd(end: Point, other: Point, segments: Segment[], self: number, reach: number) {
  const len = Math.hypot(end.x - other.x, end.y - other.y), u = { x: (end.x - other.x) / len, y: (end.y - other.y) / len };
  let best: { at: Point; half: number } | null = null, bestMove = Infinity;
  for (const s of segments) {
    if (s.item === self) continue;
    const sl = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y), v = { x: (s.b.x - s.a.x) / sl, y: (s.b.y - s.a.y) / sl };
    const c = crossing(end, u, s.a, v);
    if (!c || Math.abs(c.t) > reach + s.half || Math.abs(c.t) >= bestMove) continue;
    const along = (c.x - s.a.x) * v.x + (c.y - s.a.y) * v.y;
    if (along < -reach || along > sl + reach || len + c.t < 2) continue;  // (the other line passes there; the line stays 2 px)
    best = { at: { x: c.x, y: c.y }, half: s.half }; bestMove = Math.abs(c.t);
  }
  return best;
}

/** The drawing's straight lines joined as a drafter joins them: a line that stops short of a line it meets, or runs a
 * pixel or two past it, ends on it (a T), and two that nearly meet at a corner meet there (an L). The reading leaves
 * such ends a pixel or three off, which shows as gaps, overshoots and hooks. */
export function joinLines(drawing: RegisteredVectorizerDrawing) {
  const straight = (item: VectorizerDrawingItem) => !item.fill && !item.kind.includes("dash") && item.commands.length === 1 && item.commands[0] === "L"
    && Math.hypot(item.points[1].x - item.points[0].x, item.points[1].y - item.points[0].y) >= 3;
  const segments: Segment[] = drawing.items.flatMap((item, i) => (straight(item) ? [{ item: i, a: item.points[0], b: item.points[1], half: item.strokeWidthPx / 2 }] : []));
  let moved = 0;
  const items = drawing.items.map((item, i) => {
    if (!straight(item)) return item;
    const [a, b] = item.points, reach = CLEAN_TRACE_SETTINGS.joinPx;
    const a2 = snapEnd(a, b, segments, i, reach), b2 = snapEnd(b, a, segments, i, reach);
    const pa0 = a2?.at ?? a, pb0 = b2?.at ?? b;
    if ((!a2 && !b2) || Math.hypot(pb0.x - pa0.x, pb0.y - pa0.y) < 2) return item;   // (both ends on one place: as it was)
    moved++;
    // A joined end runs on to the far face of the line it meets (half that line's weight): a corner comes out square,
    // neither notched nor standing out past the other line, whatever the two weights.
    const pa = pa0, pb = pb0, len = Math.hypot(pb.x - pa.x, pb.y - pa.y), ux = (pb.x - pa.x) / len, uy = (pb.y - pa.y) / len;
    const outA = a2 ? { x: pa.x - ux * a2.half, y: pa.y - uy * a2.half } : a, outB = b2 ? { x: pb.x + ux * b2.half, y: pb.y + uy * b2.half } : b;
    return { ...item, points: [outA, outB] };
  });
  return { drawing: { ...drawing, items }, moved };
}

/** The pixels inside whole-pixel boxes. */
export function boxMask(boxes: Array<{ left: number; top: number; right: number; bottom: number }>, width: number, height: number) {
  const mask = new Uint8Array(width * height);
  for (const box of boxes) for (let y = box.top; y <= box.bottom; y++) mask.fill(1, y * width + box.left, y * width + box.right + 1);
  return mask;
}

/**
 * Clears the ink the drawing explains, so only the rest is traced: the lettering (never cleared here - it is traced
 * from the picture) and marks the vectorizer did not read. Returns the explained mask and the count cleared.
 */
export function removeExplainedInk(ink: Uint8Array, drawing: RegisteredVectorizerDrawing, width: number, height: number) {
  const explained = explainedInkMask(drawing, width, height);
  const lettering = boxMask(letteringBoxes(drawing.textBoxes, width, height), width, height);
  const solid = unexplainedSolids(ink, drawing, width, height);
  let removed = 0;
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && explained[i] && !lettering[i] && !solid[i]) {
      ink[i] = 0;
      removed++;
    }
  }
  return { explained, removed, solid };
}

/** Lettering the smooth pass left (too faint a box) is drawn as traced shapes, never skeleton strokes: its ink joins
 * the fill mask. */
export function keepTracedLettering(ink: Uint8Array, fill: Uint8Array, lettering: Uint8Array) {
  let pixels = 0;
  for (let i = 0; i < ink.length; i++) {
    if (ink[i] && lettering[i] && !fill[i]) {
      fill[i] = 1;
      pixels++;
    }
  }
  return pixels;
}
