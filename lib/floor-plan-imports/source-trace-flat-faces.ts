import type { SourcePointPx as Point } from "./deterministic-evidence";
import type { RegisteredVectorizerDrawing, VectorizerDrawingItem } from "./vectorizer-drawing";
import { inkEdge, ring, WALL_KINDS } from "./source-trace-walls";

/**
 * Flat faces (clean traced drawing, v3; J, 15 Oct: a wall "is suppose to be flat, of course until there is a step in the
 * floor plan itself"). Each wall piece's faces were put on its own ink, and a heavy line drawn over a wall was drawn at
 * its own measured weight, so pieces meeting end to end along one drawn face came out a fraction of a pixel apart: a
 * step at every joint, plain once zoomed in or built up in 3D. Faces of the drawing's walls (and of the lines lying on
 * them) that run along one line, face the same way and meet end to end or overlap become one straight face, on the
 * longest one's line - unless the plan's own ink beside the joint shows the step.
 */
export const FLAT_FACE_SETTINGS = Object.freeze({
  /** Faces this close (px) are always one face: a step this small is the tracing's (or the picture's anti-aliasing),
   * not the plan's... */
  alwaysPx: 1.5,
  /** ...and faces up to this far apart (px) are one face unless the plan's ink shows the step... */
  snapPx: 3,
  /** ...when they meet end to end within this gap (px) or overlap. */
  touchPx: 1,
  /** The ink shows a step when its edge beside the joint jumps this much (px) the same way, and at least this share of
   * the faces' own step... */
  inkStepPx: 1,
  inkStepShare: 0.5,
  /** ...measured from this far into each face to this far (px). */
  sampleFromPx: 1.5,
  sampleToPx: 6,
  /** A face shorter than this (px: the riser of a step) moves only with the faces either side of it. */
  minimumFacePx: 1,
  /** A line this heavy (px) is a wall the reading drew as a line: its faces count wherever it is. */
  heavyLinePx: 2,
  /** A line's weight changes by at most this (px), or this share of it, for its faces to go flat. */
  lineWeightPx: 0.25,
  lineWeightShare: 0.3,
});

const SET = FLAT_FACE_SETTINGS;

type Axis = "h" | "v";
/** One straight face: along `axis` (h: a level face at y = c), from a to b, its outside towards `out` (+1 = larger
 * coordinate); `lo`..`hi`: how far its shape reaches across. `slot`: the polygon edge it is, or -1 / +1 for a line's
 * low / high face. */
type Face = { axis: Axis; c: number; a: number; b: number; out: 1 | -1; lo: number; hi: number; item: number; slot: number; length: number };
type Cluster = { axis: Axis; out: 1 | -1; c: number; members: Face[] };
type Tones = { paper: number; full: number };

const level = (a: Point, b: Point) => Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.x - b.x) > 1e-6;
const plumb = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) > 1e-6;

/** A wall polygon's faces: its level and plumb edges (a slanted edge follows the corners it shares with them). */
function polygonFaces(points: Point[], item: number): Face[] {
  const area = points.reduce((sum, p, i) => sum + p.x * points[(i + 1) % points.length].y - points[(i + 1) % points.length].x * p.y, 0);
  const turn = area > 0 ? 1 : -1, faces: Face[] = [];
  const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    if (!level(a, b) && !plumb(a, b)) continue;
    const horizontal = level(a, b), along = horizontal ? b.x - a.x : b.y - a.y;
    // (walking a ring with positive area in y-down pixels, the outside is on the left of each edge)
    const out = (horizontal ? -turn * Math.sign(along) : turn * Math.sign(along)) as 1 | -1;
    const [lo, hi] = horizontal ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
    const across = horizontal ? ys : xs;
    faces.push({ axis: horizontal ? "h" : "v", c: horizontal ? a.y : a.x, a: lo, b: hi, out, lo: Math.min(...across), hi: Math.max(...across), item, slot: i, length: hi - lo });
  }
  return faces;
}

/** A straight level or plumb line's two faces (its weight either side of its centre-line). */
function lineFaces(item: VectorizerDrawingItem, index: number): Face[] {
  const [a, b] = item.points, h = item.strokeWidthPx / 2;
  if (!level(a, b) && !plumb(a, b)) return [];
  const horizontal = level(a, b), c = horizontal ? a.y : a.x;
  const [lo, hi] = horizontal ? [Math.min(a.x, b.x), Math.max(a.x, b.x)] : [Math.min(a.y, b.y), Math.max(a.y, b.y)];
  return ([-1, 1] as const).map((out) => ({ axis: horizontal ? "h" : "v", c: c + out * h, a: lo, b: hi, out, lo: c - h, hi: c + h, item: index, slot: out, length: hi - lo }));
}

const isLine = (item: VectorizerDrawingItem) => !item.fill && item.commands.length === 1 && item.commands[0] === "L" && item.strokeWidthPx >= 1;
const isWallSide = (item: VectorizerDrawingItem) => item.kind.endsWith("-side") && WALL_KINDS.some((kind) => item.kind.startsWith(kind));

/** Does a line lie on or against one of the walls (their boxes grown by snapPx)? A heavy line (heavyLinePx or more,
 * a wall the reading drew as a line) always counts. */
function onWall(item: VectorizerDrawingItem, boxes: Array<[number, number, number, number]>) {
  const xs = item.points.map((p) => p.x), ys = item.points.map((p) => p.y), h = item.strokeWidthPx / 2 + SET.snapPx;
  return item.strokeWidthPx >= SET.heavyLinePx || boxes.some(([l, t, r, b]) => Math.min(...xs) - h <= r && Math.max(...xs) + h >= l && Math.min(...ys) - h <= b && Math.max(...ys) + h >= t);
}

/** The faces of the drawing's walls (polygons and the sides of hollow walls) and of the lines lying on them. */
function wallFaces(items: VectorizerDrawingItem[]) {
  const rings = new Map<number, Point[]>(), faces: Face[] = [], boxes: Array<[number, number, number, number]> = [];
  items.forEach((item, i) => {
    const points = item.fill && WALL_KINDS.includes(item.kind) ? ring(item) : null;
    const mine = points ? polygonFaces(points, i) : [];
    if (!points || !mine.length) return;
    rings.set(i, points);
    faces.push(...mine);
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    boxes.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  });
  items.forEach((item, i) => {
    if (isLine(item) && (isWallSide(item) || (item.kind === "line" && onWall(item, boxes)))) faces.push(...lineFaces(item, i));
  });
  return { rings, faces };
}

/** Where the ink's edge runs beside a stretch of a face (median, as a coordinate across it), or null. */
function inkAlong(face: Face, from: number, to: number, gray: Uint8Array, width: number, cut: number) {
  const n = face.axis === "h" ? { x: 0, y: face.out } : { x: face.out, y: 0 }, found: number[] = [];
  for (let s = Math.min(from, to) + 0.5; s <= Math.max(from, to); s += 1) {
    const p = face.axis === "h" ? { x: s, y: face.c } : { x: face.c, y: s };
    const edge = inkEdge(gray, width, p, n, cut);
    if (edge !== null) found.push(face.c + face.out * edge);
  }
  return found.length >= 2 ? found.sort((x, y) => x - y)[Math.floor(found.length / 2)] : null;
}

/** The stretch of a face beside its joint with another (sampleFromPx to sampleToPx into it), or the whole face where
 * the two overlap. */
function besideJoint(face: Face, other: Face): [number, number] {
  if (face.a >= other.b - SET.touchPx) return [face.a + SET.sampleFromPx, Math.min(face.b, face.a + SET.sampleToPx)];
  if (face.b <= other.a + SET.touchPx) return [Math.max(face.a, face.b - SET.sampleToPx), face.b - SET.sampleFromPx];
  return [face.a, face.b];
}

/** Does the plan's ink show a step between two faces (its edge beside the joint jumping the way the faces do)? null
 * when it cannot be read. */
function inkStep(face: Face, other: Face, gray: Uint8Array, width: number, cut: number) {
  const [a0, a1] = besideJoint(face, other), [b0, b1] = besideJoint(other, face);
  if (a1 - a0 < 1 || b1 - b0 < 1) return null;
  const mine = inkAlong(face, a0, a1, gray, width, cut), theirs = inkAlong(other, b0, b1, gray, width, cut);
  if (mine === null || theirs === null) return null;
  const drawn = mine - theirs, made = face.c - other.c;
  return Math.abs(drawn) >= Math.max(SET.inkStepPx, SET.inkStepShare * Math.abs(made)) && Math.sign(drawn) === Math.sign(made);
}

/** Do two faces meet: end to end, or side by side where their shapes lie on each other (two lines with paper between,
 * a wall drawn as two lines, stay two)? */
const touching = (f: Face, g: Face) => f.a <= g.b + SET.touchPx && g.a <= f.b + SET.touchPx
  && (Math.min(f.b, g.b) - Math.max(f.a, g.a) <= SET.touchPx || Math.min(f.hi, g.hi) - Math.max(f.lo, g.lo) > 0);

/** The cluster a face joins: the nearest one along its line, facing its way, that it touches - within alwaysPx, or
 * within snapPx where the ink beside the joint does not show the step (and can be read). */
function clusterFor(face: Face, clusters: Cluster[], gray: Uint8Array, width: number, cut: number) {
  const near = clusters.filter((cl) => cl.axis === face.axis && cl.out === face.out && Math.abs(cl.c - face.c) <= SET.snapPx)
    .sort((x, y) => Math.abs(x.c - face.c) - Math.abs(y.c - face.c));
  for (const cl of near) {
    const met = cl.members.find((m) => touching(face, m));
    if (!met) continue;
    if (Math.abs(cl.c - face.c) <= SET.alwaysPx) return cl;
    const step = inkStep(face, met, gray, width, cut);
    if (step === false) return cl;
  }
  return null;
}

/** Each face's line: the faces gathered longest first, a face joining the cluster it belongs to (see clusterFor); a
 * cluster's line is its outermost face's, so a wall only ever grows onto a face beside it, never shrinks off its own
 * ink (a sliver of ink left beside a wall joins the marks around it into one piece too big to trace). */
function faceLines(faces: Face[], gray: Uint8Array, width: number, cut: number) {
  const clusters: Cluster[] = [];
  for (const face of [...faces].filter((f) => f.length >= SET.minimumFacePx).sort((x, y) => y.length - x.length)) {
    const cl = clusterFor(face, clusters, gray, width, cut);
    if (cl) cl.members.push(face);
    else clusters.push({ axis: face.axis, out: face.out, c: face.c, members: [face] });
  }
  const line = new Map<Face, number>();
  for (const cl of clusters) {
    const outermost = cl.out * Math.max(...cl.members.map((m) => cl.out * m.c));
    for (const m of cl.members) line.set(m, Math.abs(outermost - m.c) <= SET.snapPx ? outermost : m.c);
  }
  return line;
}

/** A ring with each edge on its new line: every corner where its two edges' lines cross; edges that shrank to nothing
 * and corners on a straight run go. Null when the result is no longer a sound ring. */
function reshapedRing(points: Point[], lines: Array<number | undefined>) {
  const n = points.length, edgeLevel = (i: number) => level(points[i], points[(i + 1) % n]);
  const moved = points.map((p, i) => {
    const before = (i - 1 + n) % n, at = { ...p };
    for (const e of [before, i]) {
      const c = lines[e];
      if (c === undefined) continue;
      if (edgeLevel(e)) at.y = c; else at.x = c;
    }
    return at;
  });
  const kept = moved.filter((p, i) => Math.hypot(p.x - moved[(i + 1) % n].x, p.y - moved[(i + 1) % n].y) > 1e-6);
  const corners = kept.filter((p, i) => {
    const a = kept[(i - 1 + kept.length) % kept.length], b = kept[(i + 1) % kept.length];
    return Math.abs((p.x - a.x) * (b.y - p.y) - (p.y - a.y) * (b.x - p.x)) > 1e-9;
  });
  const area = (q: Point[]) => q.reduce((sum, p, i) => sum + p.x * q[(i + 1) % q.length].y - q[(i + 1) % q.length].x * p.y, 0);
  return corners.length >= 3 && Math.sign(area(corners)) === Math.sign(area(points)) && Math.abs(area(corners)) >= 0.5 * Math.abs(area(points)) ? corners : null;
}

/** A line with each face on its new line: its centre-line and weight follow; as it was when that would change its
 * weight by more than lineWeightShare (a thin line beside a wall is not made as thick as the wall). */
function reshapedLine(item: VectorizerDrawingItem, low: number | undefined, high: number | undefined) {
  const [a, b] = item.points, horizontal = level(a, b), c = horizontal ? a.y : a.x, h = item.strokeWidthPx / 2;
  const lo = low ?? c - h, hi = high ?? c + h;
  if (Math.abs(hi - lo - item.strokeWidthPx) > Math.max(SET.lineWeightPx, SET.lineWeightShare * item.strokeWidthPx)) return item;
  const mid = (lo + hi) / 2, points = item.points.map((p) => (horizontal ? { x: p.x, y: mid } : { x: mid, y: p.y }));
  return { ...item, points, strokeWidthPx: hi - lo };
}

const slot = (faces: Face[], which: number, lines: Map<Face, number>) => {
  const face = faces.find((f) => f.slot === which);
  return face ? lines.get(face) : undefined;
};

function polygonItem(item: VectorizerDrawingItem, points: Point[], faces: Face[], lines: Map<Face, number>) {
  const edgeLines: Array<number | undefined> = points.map(() => undefined);
  for (const f of faces) edgeLines[f.slot] = lines.get(f);
  const next = reshapedRing(points, edgeLines);
  return next ? { ...item, commands: [...next.slice(1).map(() => "L" as const), "Z" as const], points: next } : item;
}

/** The drawing with its walls' faces flat (see above). `tones`: the plan's paper and full-tone ink. */
export function flatFaces(drawing: RegisteredVectorizerDrawing, gray: Uint8Array, width: number, tones: Tones) {
  const { rings, faces } = wallFaces(drawing.items);
  const lines = faceLines(faces, gray, width, (tones.paper + tones.full) / 2);
  const moved = faces.filter((f) => Math.abs((lines.get(f) ?? f.c) - f.c) > 1e-6);
  const touched = new Set(moved.map((f) => f.item));
  let flattened = 0;
  const items = drawing.items.map((item, i) => {
    if (!touched.has(i)) return item;
    const mine = moved.filter((f) => f.item === i), points = rings.get(i);
    const next = points ? polygonItem(item, points, mine, lines) : reshapedLine(item, slot(mine, -1, lines), slot(mine, 1, lines));
    if (next !== item) flattened += mine.length;
    return next;
  });
  return { drawing: { ...drawing, items }, flattened };
}
