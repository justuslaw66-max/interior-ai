/**
 * A drawing context that keeps what PDF.js paints on a page as shapes instead of pixels (9 Nov 2026), so a vector PDF's
 * traced view can be the page's own drawing (pdf-own-drawing.ts): its lines at their own widths, its fills, its dashes
 * and dots, and its lettering as the font's outlines. PDF.js draws through the 2D canvas API; this context takes the
 * same calls, follows the transform, styles and clips as a canvas does, and keeps each fill and stroke in page pixels.
 * Anything it cannot keep as a shape (a picture, a pattern, a gradient, text with no outline, a clip that cuts what is
 * drawn) is kept in `problems` with where it is on the page, if known: the page keeps its picture-based trace, unless
 * every problem lies outside the plan area drawn alone (pdf-own-plan-area.ts).
 */
export type Matrix = [number, number, number, number, number, number];
export type DrawnCommand = { op: "M"; p: [number, number] } | { op: "L"; p: [number, number] }
  | { op: "C"; p: [number, number, number, number, number, number] } | { op: "Z" };
export type DrawnShape = {
  kind: "fill" | "stroke";
  /** Subpaths in page pixels, curves kept as cubics. */
  commands: DrawnCommand[];
  evenOdd: boolean;
  /** 0 black - 255 white, already blended with the paint's alpha over white paper. */
  tone: number;
  /** Stroke width in page pixels (stroke only). */
  widthPx: number;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  dash: number[];
  dashOffset: number;
  bbox: [number, number, number, number];
  /** Drawn from a font's outline: a letter, digit or sign of the page's lettering. */
  letter: boolean;
};

type Style = {
  matrix: Matrix; fill: unknown; stroke: unknown; lineWidth: number; lineCap: string; lineJoin: string; miterLimit: number;
  alpha: number; composite: string; dash: number[]; dashOffset: number; filter: string; font: string;
  clip: { bbox: [number, number, number, number]; rectangular: boolean } | null;
};

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const copy = (m: Matrix): Matrix => [m[0], m[1], m[2], m[3], m[4], m[5]];
type MatrixLike = { a: number; b: number; c: number; d: number; e: number; f: number };
const isMatrixLike = (value: unknown): value is MatrixLike => typeof value === "object" && value !== null &&
  ["a", "b", "c", "d", "e", "f"].every((key) => typeof Reflect.get(value, key) === "number");
const toMatrix = (value: unknown): Matrix => (isMatrixLike(value) ? [value.a, value.b, value.c, value.d, value.e, value.f] : copy(IDENTITY));
type SvgPath = { toSVGString(): string };
const isSvgPath = (value: unknown): value is SvgPath => typeof value === "object" && value !== null && typeof Reflect.get(value, "toSVGString") === "function";

/** A CSS colour as a grey, 0 black - 255 white (Rec. 601 luma), or null for one this context does not keep. */
export function cssTone(value: unknown): { tone: number; alpha: number } | null {
  if (typeof value !== "string") return null;
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(value.trim());
  const rgb = hex ? hex.slice(1, 4).map((h) => Number.parseInt(h, 16)).concat(hex[4] ? Number.parseInt(hex[4], 16) / 255 : 1)
    : /^rgba?\(([^)]+)\)$/i.exec(value.trim())?.[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (!rgb || rgb.length < 3 || rgb.slice(0, 3).some((n) => !Number.isFinite(n))) {
    const named: Record<string, number> = { black: 0, white: 255 };
    return value in named ? { tone: named[value], alpha: 1 } : null;
  }
  return { tone: Math.round(0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]), alpha: Number.isFinite(rgb[3]) ? rgb[3] : 1 };
}

/** Commands of an SVG path string ("M x y L x y C … Q … Z"), as napi-rs and browser Path2D objects write them. */
export function svgCommands(d: string): Array<{ op: string; n: number[] }> {
  const out: Array<{ op: string; n: number[] }> = [];
  for (const [, op, args] of d.matchAll(/([MLCQZmlcqzHhVv])([^MLCQZmlcqzHhVvAa]*)/g)) {
    out.push({ op, n: (args.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number) });
  }
  if (/[Aa]/.test(d)) out.push({ op: "A", n: [] });
  return out;
}

class RecordedPath {
  commands: Array<{ op: string; n: number[] }> = [];
}

export class DrawingRecorder {
  readonly shapes: DrawnShape[] = [];
  /** What could not be kept as a shape, and its bounds in device pixels (null where they are not known). `shape` marks a
   * single shape left out (a plan area only misses it if the shape lies wholly inside); otherwise it is a picture or
   * lettering, which covers whatever its bounds overlap. */
  readonly problems: Array<{ reason: string; bbox: number[] | null; shape?: boolean }> = [];
  readonly canvas: { width: number; height: number; getContext: () => DrawingRecorder };
  private state: Style;
  private readonly stack: Style[] = [];
  private current = new RecordedPath();
  /** Whether the path last read was a font's outline. */
  private letter = false;
  /** Canvas settings PDF.js sets that change no shape. */
  imageSmoothingEnabled = true;
  fillRule = "nonzero";

  constructor(readonly width: number, readonly height: number) {
    this.canvas = { width, height, getContext: () => this };
    this.state = { matrix: copy(IDENTITY), fill: "#000000", stroke: "#000000", lineWidth: 1, lineCap: "butt", lineJoin: "miter",
      miterLimit: 10, alpha: 1, composite: "source-over", dash: [], dashOffset: 0, filter: "none", font: "10px sans-serif", clip: null };
  }

  /** Called at the first problem with no known place (the page's drawing then stops: no area can leave it out). */
  onUnsupported: (() => void) | null = null;
  private note(reason: string, bbox: number[] | null = null, shape = false) {
    this.problems.push(shape ? { reason, bbox, shape } : { reason, bbox });
    if (bbox) return;
    this.onUnsupported?.();
    this.onUnsupported = null;
  }
  /** Device bounds of a rectangle in the current transform's space. */
  private deviceBox(x: number, y: number, w: number, h: number): number[] {
    const corners = [apply(this.state.matrix, x, y), apply(this.state.matrix, x + w, y), apply(this.state.matrix, x, y + h),
      apply(this.state.matrix, x + w, y + h)];
    return [Math.min(...corners.map((c) => c[0])), Math.min(...corners.map((c) => c[1])), Math.max(...corners.map((c) => c[0])),
      Math.max(...corners.map((c) => c[1]))];
  }

  // Styles
  get fillStyle() { return this.state.fill; } set fillStyle(v: unknown) { this.state.fill = v; }
  get strokeStyle() { return this.state.stroke; } set strokeStyle(v: unknown) { this.state.stroke = v; }
  get lineWidth() { return this.state.lineWidth; } set lineWidth(v: number) { if (Number.isFinite(v) && v > 0) this.state.lineWidth = v; }
  get lineCap() { return this.state.lineCap; } set lineCap(v: string) { this.state.lineCap = v; }
  get lineJoin() { return this.state.lineJoin; } set lineJoin(v: string) { this.state.lineJoin = v; }
  get miterLimit() { return this.state.miterLimit; } set miterLimit(v: number) { this.state.miterLimit = v; }
  get globalAlpha() { return this.state.alpha; } set globalAlpha(v: number) { if (Number.isFinite(v)) this.state.alpha = Math.max(0, Math.min(1, v)); }
  get globalCompositeOperation() { return this.state.composite; } set globalCompositeOperation(v: string) { this.state.composite = v; }
  get lineDashOffset() { return this.state.dashOffset; } set lineDashOffset(v: number) { this.state.dashOffset = Number(v) || 0; }
  get filter() { return this.state.filter; } set filter(v: string) { this.state.filter = v; }
  get font() { return this.state.font; } set font(v: string) { this.state.font = v; }
  setLineDash(v: number[]) { this.state.dash = Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n) && n >= 0) : []; }
  getLineDash() { return [...this.state.dash]; }

  // State and transform
  save() { this.stack.push({ ...this.state, matrix: copy(this.state.matrix), dash: [...this.state.dash] }); }
  restore() { const s = this.stack.pop(); if (s) this.state = s; }
  getTransform() { const [a, b, c, d, e, f] = this.state.matrix; return new DOMMatrix([a, b, c, d, e, f]); }
  setTransform(a?: unknown, b?: number, c?: number, d?: number, e?: number, f?: number) {
    this.state.matrix = typeof a === "number" ? [a, b ?? 0, c ?? 0, d ?? 1, e ?? 0, f ?? 0] : toMatrix(a);
  }
  resetTransform() { this.state.matrix = copy(IDENTITY); }
  transform(a: number, b: number, c: number, d: number, e: number, f: number) { this.state.matrix = multiply(this.state.matrix, [a, b, c, d, e, f]); }
  translate(x: number, y: number) { this.transform(1, 0, 0, 1, x, y); }
  scale(x: number, y: number) { this.transform(x, 0, 0, y, 0, 0); }
  rotate(angle: number) { const c = Math.cos(angle), s = Math.sin(angle); this.transform(c, s, -s, c, 0, 0); }

  // The canvas's own path, kept in device space as a canvas keeps it
  beginPath() { this.current = new RecordedPath(); }
  private add(op: string, ...xy: number[]) {
    const n: number[] = [];
    for (let i = 0; i < xy.length; i += 2) n.push(...apply(this.state.matrix, xy[i], xy[i + 1]));
    this.current.commands.push({ op, n });
  }
  moveTo(x: number, y: number) { this.add("M", x, y); }
  lineTo(x: number, y: number) { this.add("L", x, y); }
  bezierCurveTo(a: number, b: number, c: number, d: number, e: number, f: number) { this.add("C", a, b, c, d, e, f); }
  quadraticCurveTo(a: number, b: number, c: number, d: number) { this.add("Q", a, b, c, d); }
  closePath() { this.current.commands.push({ op: "Z", n: [] }); }
  rect(x: number, y: number, w: number, h: number) { this.add("M", x, y); this.add("L", x + w, y); this.add("L", x + w, y + h); this.add("L", x, y + h); this.closePath(); }

  /**
   * A Path2D's commands in device space (a Path2D is in the current transform's space). PDF.js draws a letter as its
   * font's outline in em units (within a unit or so of its origin) scaled up to the font's size; a PDF's own paths are
   * in points, so such a small outline is taken as lettering.
   */
  private commandsOf(path: unknown): Array<{ op: string; n: number[] }> | null {
    this.letter = false;
    if (path === undefined) return this.current.commands;
    if (!isSvgPath(path)) { this.note("path that cannot be read"); return null; }
    const m = this.state.matrix, raw = svgCommands(path.toSVGString());
    this.letter = raw.length > 0 && raw.every(({ n }) => n.every((v) => Math.abs(v) <= 2));
    return raw.map(({ op, n }) => {
      const out: number[] = [];
      for (let i = 0; i + 1 < n.length; i += 2) out.push(...apply(m, n[i], n[i + 1]));
      return { op, n: out };
    });
  }

  /** Why the current paint cannot be kept as a shape (a blend, a filter, a pattern or gradient), or its grey. */
  private paintTone(kind: "fill" | "stroke", bbox: number[]): number | null {
    if (this.state.composite !== "source-over") { this.note(`composite ${this.state.composite}`, bbox, true); return null; }
    if (this.state.filter && this.state.filter !== "none") { this.note("filter", bbox, true); return null; }
    const colour = cssTone(kind === "fill" ? this.state.fill : this.state.stroke);
    if (!colour) { this.note(`${kind} pattern or gradient`, bbox, true); return null; }
    const alpha = colour.alpha * this.state.alpha;
    return alpha > 0 ? Math.round(255 - (255 - colour.tone) * alpha) : null;
  }

  /** Whether a shape with these bounds shows whole: one wholly outside the clip is not seen; one it cuts, or one under
   * a clip of another shape than a rectangle, is not kept. */
  private showsWhole(bbox: number[]) {
    const clip = this.state.clip;
    if (!clip) return true;
    if (!inside(bbox, clip.bbox)) { if (overlaps(bbox, clip.bbox)) this.note("shape cut by a clip", bbox, true); return false; }
    if (!clip.rectangular) this.note("shape under a shaped clip", bbox, true);
    return clip.rectangular;
  }

  private paint(kind: "fill" | "stroke", path: unknown, rule?: unknown) {
    const evenOdd = rule === "evenodd" || path === "evenodd";
    const raw = this.commandsOf(typeof path === "string" ? undefined : path);
    const commands = raw && normalise(raw);
    if (raw && !commands) this.note("path command not kept");
    if (!commands?.length) return;
    const m = this.state.matrix, scale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
    const bbox = boundsOf(commands, kind === "stroke" ? (this.state.lineWidth * scale) / 2 : 0);
    const tone = this.paintTone(kind, bbox);
    if (tone === null || !this.showsWhole(bbox)) return;
    const { lineCap, lineJoin } = this.state;
    this.shapes.push({ kind, commands, evenOdd, tone, widthPx: this.state.lineWidth * scale, bbox, letter: this.letter,
      cap: lineCap === "round" || lineCap === "square" ? lineCap : "butt", join: lineJoin === "round" || lineJoin === "bevel" ? lineJoin : "miter",
      dash: this.state.dash.map((d) => d * scale), dashOffset: this.state.dashOffset * scale });
  }
  fill(path?: unknown, rule?: unknown) { this.paint("fill", path, rule); }
  stroke(path?: unknown) { this.paint("stroke", path); }
  fillRect(x: number, y: number, w: number, h: number) {
    const saved = this.current; this.current = new RecordedPath(); this.rect(x, y, w, h); this.paint("fill", undefined); this.current = saved;
  }
  strokeRect(x: number, y: number, w: number, h: number) {
    const saved = this.current; this.current = new RecordedPath(); this.rect(x, y, w, h); this.paint("stroke", undefined); this.current = saved;
  }
  clearRect() { /* the page starts blank; PDF.js clears only scratch canvases */ }
  clip(path?: unknown, rule?: unknown) {
    void rule;
    const raw = this.commandsOf(typeof path === "string" ? undefined : path);
    const commands = raw && normalise(raw);
    if (!commands) { this.note("clip that cannot be read"); return; }
    const bbox = boundsOf(commands, 0), rectangular = isRectangle(commands);
    const previous = this.state.clip;
    const merged: [number, number, number, number] = previous
      ? [Math.max(bbox[0], previous.bbox[0]), Math.max(bbox[1], previous.bbox[1]), Math.min(bbox[2], previous.bbox[2]), Math.min(bbox[3], previous.bbox[3])]
      : bbox;
    this.state.clip = { bbox: merged, rectangular: rectangular && (previous?.rectangular ?? true) };
  }

  // What is not kept as a shape
  /** A picture is left out, and kept as a problem where it lies (`drawImage(image, [sx, sy, sw, sh,] dx, dy[, dw, dh])`). */
  drawImage(image: { width?: number; height?: number }, ...n: number[]) {
    const [dx, dy, dw = image?.width ?? 0, dh = image?.height ?? 0] = n.length >= 8 ? n.slice(4) : n;
    this.note("picture", Number.isFinite(dx) && Number.isFinite(dy) ? this.deviceBox(dx, dy, dw, dh) : null);
  }
  putImageData() { this.note("picture"); }
  getImageData(_x: number, _y: number, w: number, h: number) { this.note("read back"); return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  createImageData(w: number, h: number) { return { data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }; }
  createPattern() { return { setTransform() {} }; }
  createLinearGradient() { return { addColorStop() {} }; }
  createRadialGradient() { return { addColorStop() {} }; }
  fillText(_text: string, x: number, y: number) { this.letterProblem(x, y); }
  strokeText(_text: string, x: number, y: number) { this.letterProblem(x, y); }
  private letterProblem(x: number, y: number) {
    const size = Number(/([\d.]+)px/.exec(this.state.font)?.[1] ?? 10);
    this.note("text with no outline", Number.isFinite(x) && Number.isFinite(y) ? this.deviceBox(x - size, y - size, 2 * size, 2 * size) : null);
  }
  measureText(text: string) { const size = Number(/([\d.]+)px/.exec(this.state.font)?.[1] ?? 10);
    return { width: String(text).length * size * 0.5, actualBoundingBoxLeft: 0, actualBoundingBoxRight: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }; }
  drawFocusIfNeeded() {}
  isPointInPath() { return false; }
}

/** One serialised command's coordinates as drawn commands; `at` and `start` follow the pen. Null for a command
 * Path2D serialisers we read do not write (an arc, a relative or axis command). */
function drawnCommands(op: string, n: number[], pen: { at: [number, number]; start: [number, number] }): DrawnCommand[] | null {
  const out: DrawnCommand[] = [];
  const pairs = (size: number) => Array.from({ length: Math.floor(n.length / size) }, (_, i) => n.slice(i * size, i * size + size));
  if (op === "M" || op === "L") {
    pairs(2).forEach(([x, y], i) => { pen.at = [x, y]; if (op === "M" && i === 0) pen.start = pen.at; out.push({ op: op === "M" && i === 0 ? "M" : "L", p: pen.at }); });
  } else if (op === "C") {
    for (const [a, b, c, d, x, y] of pairs(6)) { out.push({ op: "C", p: [a, b, c, d, x, y] }); pen.at = [x, y]; }
  } else if (op === "Q") {
    for (const [qx, qy, x, y] of pairs(4)) {
      const [px, py] = pen.at;
      out.push({ op: "C", p: [px + (2 / 3) * (qx - px), py + (2 / 3) * (qy - py), x + (2 / 3) * (qx - x), y + (2 / 3) * (qy - y), x, y] });
      pen.at = [x, y];
    }
  } else if (op === "Z" || op === "z") {
    out.push({ op: "Z" }); pen.at = pen.start;
  } else return null;
  return out;
}

/** Quadratics as cubics; null where the path holds a command this context does not keep. */
function normalise(raw: Array<{ op: string; n: number[] }>): DrawnCommand[] | null {
  const out: DrawnCommand[] = [];
  const pen: { at: [number, number]; start: [number, number] } = { at: [0, 0], start: [0, 0] };
  for (const { op, n } of raw) {
    const drawn = drawnCommands(op, n, pen);
    if (!drawn) return null;
    out.push(...drawn);
  }
  // A subpath of a lone move draws nothing.
  return out.filter((c, i) => c.op !== "M" || (out[i + 1] !== undefined && out[i + 1].op !== "M"));
}

export function boundsOf(commands: DrawnCommand[], pad: number): [number, number, number, number] {
  let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
  for (const c of commands) if (c.op !== "Z") for (let i = 0; i < c.p.length; i += 2) {
    l = Math.min(l, c.p[i]); r = Math.max(r, c.p[i]); t = Math.min(t, c.p[i + 1]); b = Math.max(b, c.p[i + 1]);
  }
  return [l - pad, t - pad, r + pad, b + pad];
}
const inside = (a: number[], b: number[]) => a[0] >= b[0] - 0.5 && a[1] >= b[1] - 0.5 && a[2] <= b[2] + 0.5 && a[3] <= b[3] + 0.5;
const overlaps = (a: number[], b: number[]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function isRectangle(commands: DrawnCommand[]) {
  const points = commands.flatMap((c) => (c.op === "M" || c.op === "L" ? [c.p] : []));
  if (commands.some((c) => c.op === "C") || commands.filter((c) => c.op === "M").length !== 1 || points.length < 4 || points.length > 5) return false;
  return points.every((p, i) => { const q = points[(i + 1) % points.length]; return Math.abs(p[0] - q[0]) < 0.01 || Math.abs(p[1] - q[1]) < 0.01; });
}
