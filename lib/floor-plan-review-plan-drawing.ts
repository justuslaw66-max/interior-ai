import type { FloorPlanAnnotationV2, FloorPlanDocumentV2, FloorPlanPointMmV2 as Point } from "@/lib/floor-plan-document-v2";
import type { CompiledFloorPlanFloorV2 } from "@/lib/floor-plan-compiler-v2";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { buildFloorPlanVectorDrawing, type PlanDrawingPrimitive } from "@/lib/floor-plan-vector-drawing";
import { vectorInkPath } from "@/lib/floor-plan-vector-ink";
import { buildFloorPlanSourceProjection } from "@/lib/floor-plan-imports/source-projection";
import { isFinalSourceTrace } from "@/lib/floor-plan-source-trace";
import { sourceDrawingSvgPath, type FloorPlanSourceDrawingGeometryV2 } from "@/lib/floor-plan-source-drawing";
import { isFloorPlanVoidRoom } from "@/lib/floor-plan-void-rooms";

/**
 * The plan drawn from the document (workstream 2, 8 Nov 2026): the review's clean drawing of a page, in that page's
 * pixels. Walls are the model's wall footprints, solid; doors and windows the app's own opening symbols; room names
 * typed; the dimensions the plan states, as dimension lines. So it is straight and sharp by construction, and it
 * follows every correction made in the review. What the model does not hold yet (sanitary and kitchen fixtures,
 * furniture, floor patterns) is kept from the faithful trace: only its shapes that lie clear inside a room, away
 * from the walls, the doors' swings and the lettering. Nothing here is stored; it is drawn from the document.
 */
export type ReviewPlanShape = { id: string; d: string; fill: boolean; strokeWidthPx: number; ink: string; role: string };
export type ReviewPlanLabel = { id: string; lines: string[]; x: number; y: number; sizePx: number; role: "room-label" | "dimension";
  /** Turned to read along a vertical dimension line (from below, as plans do). */
  rotateDeg?: number };
export type ReviewPlanDrawing = {
  widthPx: number;
  heightPx: number;
  /** Trace shapes kept (fixtures and the like), drawn first, under the walls. */
  traced: ReviewPlanShape[];
  shapes: ReviewPlanShape[];
  labels: ReviewPlanLabel[];
  diagnostics: { tracedKept: number; tracedLeft: number; walls: number; openings: number; rooms: number };
};

/** Sizes on the drawing, in plan millimetres (a 1:100 plan's 0.25 mm pen is 25 mm), so lines keep the plan's weights. */
export const REVIEW_PLAN_STYLE = {
  wallInk: "#262626",
  lineInk: "#262626",
  dimensionInk: "#555555",
  openingLineMm: 22,
  swingLineMm: 14,
  dimensionLineMm: 12,
  minLinePx: 0.6,
  roomLabelMm: 230,
  minRoomLabelPx: 7,
  /** A room's name keeps this clear of the room's outline (its walls' centrelines). */
  roomLabelMarginMm: 180,
  dimensionLabelMm: 250,
  /** A trace shape smaller than this across is a dot or a speck. */
  fixtureMinSpanMm: 80,
  /** A filled trace shape larger than this across is a floor's tint or the page's, not a fixture (a counter or a
   * shower tray is smaller); the clean plan is drawn on white. */
  fixtureMaxFillSpanMm: 2400,
  /** How far clear of a wall's face a fixture shape keeps (more is wall ink, a door leaf or a window). */
  wallClearanceMm: 45,
  /** A trace shape with this share of it on the model's walls or door swings (or off the plan) is what the model
   * draws itself (or a dimension line, a title), and is left out. */
  fixtureDrawnShare: 0.5,
  gridCellMm: 25,
} as const;

type Projection = NonNullable<ReturnType<typeof buildFloorPlanSourceProjection>>;
type PathPrimitive = Extract<PlanDrawingPrimitive, { kind: "path" }>;
const fmt = (value: number) => Number(value.toFixed(2));

/** A plan-millimetre path ("M x z L x z C ... Z") in page pixels: every coordinate pair projected. */
export function projectPlanPath(path: string, project: (point: Point) => { x: number; y: number }) {
  const tokens = path.match(/[MLCZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (/^[MLCZ]$/i.test(token)) { out.push(token.toUpperCase()); continue; }
    const p = project({ xMm: Number(token), zMm: Number(tokens[i + 1]) });
    out.push(`${fmt(p.x)} ${fmt(p.y)}`);
    i++;
  }
  return out.join(" ");
}

function pixelsPerMm(projection: Projection, at: Point) {
  const a = projection.project(at), b = projection.project({ xMm: at.xMm + 1000, zMm: at.zMm });
  const c = projection.project({ xMm: at.xMm, zMm: at.zMm + 1000 });
  return Math.sqrt(Math.hypot(b.xPx - a.xPx, b.yPx - a.yPx) * Math.hypot(c.xPx - a.xPx, c.yPx - a.yPx)) / 1000;
}

function strokeMm(role: string) {
  if (role === "swing_arc") return REVIEW_PLAN_STYLE.swingLineMm;
  if (role.startsWith("dimension")) return REVIEW_PLAN_STYLE.dimensionLineMm;
  return REVIEW_PLAN_STYLE.openingLineMm;
}

const outerLoop = (room: CompiledFloorPlanFloorV2["rooms"][number]) =>
  (room.wallLoops.find((loop) => loop.kind === "outer") ?? room.wallLoops[0])?.walls.map((ref) => ref.start) ?? [];

function insidePolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.zMm > point.zMm) !== (b.zMm > point.zMm) &&
      point.xMm < ((b.xMm - a.xMm) * (point.zMm - a.zMm)) / (b.zMm - a.zMm) + a.xMm) inside = !inside;
  }
  return inside;
}

function distanceToSegment(p: Point, a: Point, b: Point) {
  const dx = b.xMm - a.xMm, dz = b.zMm - a.zMm, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((p.xMm - a.xMm) * dx + (p.zMm - a.zMm) * dz) / length)) : 0;
  return Math.hypot(p.xMm - (a.xMm + dx * t), p.zMm - (a.zMm + dz * t));
}

/** Where a room's name goes: the point inside it farthest from its outline (so an L-shaped room's name sits in the
 * room, not in its notch), and how far that is. A coarse grid search, then a finer one round the best cell. */
export function roomLabelPoint(polygon: Point[]): { point: Point; clearanceMm: number } | null {
  if (polygon.length < 3) return null;
  const xs = polygon.map((p) => p.xMm), zs = polygon.map((p) => p.zMm);
  let box = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
  const clearance = (p: Point) => Math.min(...polygon.map((a, i) => distanceToSegment(p, a, polygon[(i + 1) % polygon.length])));
  let best: { point: Point; clearanceMm: number } | null = null;
  for (let pass = 0; pass < 3; pass++) {
    const steps = 14, sx = (box.x1 - box.x0) / steps, sz = (box.z1 - box.z0) / steps;
    for (let i = 0; i <= steps; i++) for (let j = 0; j <= steps; j++) {
      const point = { xMm: box.x0 + sx * i, zMm: box.z0 + sz * j };
      if (!insidePolygon(point, polygon)) continue;
      const clear = clearance(point);
      if (!best || clear > best.clearanceMm + 1e-6) best = { point, clearanceMm: clear };
    }
    if (!best) return null;
    box = { x0: best.point.xMm - sx, x1: best.point.xMm + sx, z0: best.point.zMm - sz, z1: best.point.zMm + sz };
  }
  return best;
}

/** How far a room runs across its label point, along plan x (`across`) or z: the span of the outline's crossing. */
function roomRun(polygon: Point[], at: Point, across: boolean) {
  const cuts: number[] = [];
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    const [ua, va, ub, vb, u] = across ? [a.xMm, a.zMm, b.xMm, b.zMm, at.zMm] : [a.zMm, a.xMm, b.zMm, b.xMm, at.xMm];
    if ((va > u) !== (vb > u)) cuts.push(ua + ((u - va) * (ub - ua)) / (vb - va));
  }
  const v = across ? at.xMm : at.zMm;
  const below = Math.max(...cuts.filter((c) => c <= v)), above = Math.min(...cuts.filter((c) => c >= v));
  return Number.isFinite(below) && Number.isFinite(above) ? above - below : 0;
}

/** A room's name sized to the plan and fitted inside the room (clear of its walls): one line, or two at a space,
 * else smaller. */
function roomLabel(room: CompiledFloorPlanFloorV2["rooms"][number], project: (p: Point) => { x: number; y: number },
  pxPerMm: number): ReviewPlanLabel | null {
  const name = room.name.trim();
  if (!name || isFloorPlanVoidRoom(room) || /^Room \d+$/.test(name)) return null;
  const outline = outerLoop(room), spot = roomLabelPoint(outline);
  if (!spot) return null;
  const at = project(spot.point), margin = REVIEW_PLAN_STYLE.roomLabelMarginMm;
  const widthPx = Math.max(0, roomRun(outline, spot.point, true) - 2 * margin) * pxPerMm;
  const heightPx = Math.max(0, roomRun(outline, spot.point, false) - 2 * margin) * pxPerMm;
  const wide = (lines: string[]) => Math.max(...lines.map((line) => line.length)) * 0.6;
  const fits = (lines: string[], size: number) => wide(lines) * size <= widthPx && lines.length * size * 1.15 <= heightPx;
  const base = REVIEW_PLAN_STYLE.roomLabelMm * pxPerMm, words = name.split(" ");
  const twoLines = words.slice(1).map((_, k) => [words.slice(0, k + 1).join(" "), words.slice(k + 1).join(" ")])
    .sort((a, b) => wide(a) - wide(b));
  const options = [[name], ...twoLines];
  const label = (lines: string[], sizePx: number): ReviewPlanLabel => ({ id: `${room.id}:label`, lines, x: at.x, y: at.y, sizePx, role: "room-label" });
  for (const lines of options) if (fits(lines, base)) return label(lines, base);
  const best = options.map((lines) => ({ lines, size: Math.min(base, widthPx / wide(lines), heightPx / (lines.length * 1.15)) }))
    .sort((a, b) => b.size - a.size)[0];
  return label(best.lines, Math.max(REVIEW_PLAN_STYLE.minRoomLabelPx, best.size));
}

/** A dimension's figure beside its line, on the side the vector drawing puts it, read along the line. */
function dimensionLabel(text: Extract<PlanDrawingPrimitive, { kind: "text" }>, line: readonly Point[], project: (p: Point) => { x: number; y: number },
  pxPerMm: number): ReviewPlanLabel {
  const a = project(line[0]), b = project(line[line.length - 1]), at = project(text.point);
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  let nx = -(b.y - a.y) / length, ny = (b.x - a.x) / length;
  if ((at.x - mid.x) * nx + (at.y - mid.y) * ny < 0) { nx = -nx; ny = -ny; }
  const size = REVIEW_PLAN_STYLE.dimensionLabelMm * pxPerMm, vertical = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
  return { id: text.id, lines: [text.text], x: mid.x + nx * size * 0.75, y: mid.y + ny * size * 0.75, sizePx: size, role: "dimension",
    ...(vertical ? { rotateDeg: -90 } : {}) };
}

/** Where a trace shape lies, as a plan-millimetre grid: off the plan (0), on the plan (1: within the walls' extent),
 * or on what the model draws itself (2: a wall and its faces, a door's leaf and swing). */
class PlanGround {
  private cells: Uint8Array;
  private x0: number; private z0: number; private nx: number; private nz: number;
  private readonly cell = REVIEW_PLAN_STYLE.gridCellMm;
  constructor(floor: CompiledFloorPlanFloorV2) {
    const points = floor.walls.flatMap((wall) => [wall.start, wall.end]);
    const pad = 1000;
    this.x0 = Math.min(...points.map((p) => p.xMm)) - pad; this.z0 = Math.min(...points.map((p) => p.zMm)) - pad;
    this.nx = Math.max(1, Math.ceil((Math.max(...points.map((p) => p.xMm)) + pad - this.x0) / this.cell));
    this.nz = Math.max(1, Math.ceil((Math.max(...points.map((p) => p.zMm)) + pad - this.z0) / this.cell));
    this.cells = new Uint8Array(this.nx * this.nz);
    const xs = points.map((p) => p.xMm), zs = points.map((p) => p.zMm), [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    this.fill([{ xMm: x0, zMm: z0 }, { xMm: x1, zMm: z0 }, { xMm: x1, zMm: z1 }, { xMm: x0, zMm: z1 }], 1);
    for (const wall of floor.walls) this.stampBand(wall.start, wall.end, wall.thicknessMm / 2 + REVIEW_PLAN_STYLE.wallClearanceMm);
    // A door's leaf and swing, as the source may draw them: hinged at either jamb, opening to either side. Only
    // their lines are stamped, so a fixture inside a swing's reach is still kept.
    const half = REVIEW_PLAN_STYLE.wallClearanceMm;
    for (const opening of floor.openings) {
      if (opening.kind !== "door" || opening.operation === "open") continue;
      const dx = opening.end.xMm - opening.start.xMm, dz = opening.end.zMm - opening.start.zMm, length = Math.hypot(dx, dz) || 1;
      const nx = -dz / length, nz = dx / length, reach = opening.widthMm;
      for (const jamb of [opening.start, opening.end]) {
        this.stampRing(jamb, reach, half);
        for (const side of [1, -1]) this.stampBand(jamb, { xMm: jamb.xMm + nx * reach * side, zMm: jamb.zMm + nz * reach * side }, half);
      }
    }
  }
  private index(p: Point) {
    const i = Math.floor((p.xMm - this.x0) / this.cell), j = Math.floor((p.zMm - this.z0) / this.cell);
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }
  at(p: Point) { const k = this.index(p); return k < 0 ? 0 : this.cells[k]; }
  private centre(i: number, j: number): Point { return { xMm: this.x0 + (i + 0.5) * this.cell, zMm: this.z0 + (j + 0.5) * this.cell }; }
  private fill(polygon: Point[], value: number) {
    if (polygon.length < 3) return;
    const zs = polygon.map((p) => p.zMm);
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - this.z0) / this.cell)), j1 = Math.min(this.nz - 1, Math.floor((Math.max(...zs) - this.z0) / this.cell));
    for (let j = j0; j <= j1; j++) {
      const z = this.z0 + (j + 0.5) * this.cell, crossings: number[] = [];
      for (let k = 0, m = polygon.length - 1; k < polygon.length; m = k++) {
        const a = polygon[k], b = polygon[m];
        if ((a.zMm > z) !== (b.zMm > z)) crossings.push(a.xMm + ((z - a.zMm) * (b.xMm - a.xMm)) / (b.zMm - a.zMm));
      }
      crossings.sort((p, q) => p - q);
      for (let c = 0; c + 1 < crossings.length; c += 2) {
        const i0 = Math.max(0, Math.ceil((crossings[c] - this.x0) / this.cell - 0.5)), i1 = Math.min(this.nx - 1, Math.floor((crossings[c + 1] - this.x0) / this.cell - 0.5));
        for (let i = i0; i <= i1; i++) this.cells[j * this.nx + i] = value;
      }
    }
  }
  private stampWhere(x0: number, x1: number, z0: number, z1: number, hit: (p: Point) => boolean) {
    const i0 = Math.max(0, Math.floor((x0 - this.x0) / this.cell)), i1 = Math.min(this.nx - 1, Math.floor((x1 - this.x0) / this.cell));
    const j0 = Math.max(0, Math.floor((z0 - this.z0) / this.cell)), j1 = Math.min(this.nz - 1, Math.floor((z1 - this.z0) / this.cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) if (hit(this.centre(i, j))) this.cells[j * this.nx + i] = 2;
  }
  private stampBand(a: Point, b: Point, half: number) {
    this.stampWhere(Math.min(a.xMm, b.xMm) - half, Math.max(a.xMm, b.xMm) + half, Math.min(a.zMm, b.zMm) - half,
      Math.max(a.zMm, b.zMm) + half, (p) => distanceToSegment(p, a, b) <= half);
  }
  private stampRing(c: Point, r: number, half: number) {
    const outer = r + half;
    this.stampWhere(c.xMm - outer, c.xMm + outer, c.zMm - outer, c.zMm + outer, (p) => Math.abs(Math.hypot(p.xMm - c.xMm, p.zMm - c.zMm) - r) <= half);
  }
}

/** Points along a trace path, about every `stepPx` (curves by their control polygon, which bounds them). */
function samplePath(geometry: FloorPlanSourceDrawingGeometryV2, stepPx: number) {
  const points = geometry.points, out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[i + 1];
    out.push(a);
    if (!b) break;
    const n = Math.min(40, Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / stepPx));
    for (let k = 1; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Whether a trace shape is a fixture to keep: not lettering, larger than a speck, not a floor's tint, and mostly on
 * the plan, off what the model draws itself. */
function isTracedFixture(geometry: FloorPlanSourceDrawingGeometryV2, ground: PlanGround, projection: Projection, pxPerMm: number) {
  if (geometry.command === "text" || geometry.groupId?.startsWith("faithful-letter-")) return false;
  const xs = geometry.points.map((p) => p.x), ys = geometry.points.map((p) => p.y);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  if (span < REVIEW_PLAN_STYLE.fixtureMinSpanMm * pxPerMm) return false;
  if (geometry.fill && span > REVIEW_PLAN_STYLE.fixtureMaxFillSpanMm * pxPerMm) return false;
  const samples = samplePath(geometry, Math.max(1, REVIEW_PLAN_STYLE.gridCellMm * 2 * pxPerMm));
  const drawn = samples.filter((sample) => {
    const mm = projection.unproject(sample);
    return !mm || ground.at(mm) !== 1;
  }).length;
  return drawn < samples.length * REVIEW_PLAN_STYLE.fixtureDrawnShare;
}

/** The faithful trace's shapes that are fixtures, furniture or floor patterns: on the plan, mostly off the model's
 * walls and doors' swings, and not lettering. The rest of the trace (walls, openings, lettering, the dimensions and
 * title round the plan) is what the model now draws, or leaves out. */
function tracedFixtures(trace: FloorPlanAnnotationV2[], floor: CompiledFloorPlanFloorV2, projection: Projection, pxPerMm: number) {
  if (!trace.length || !floor.rooms.length || !floor.walls.length) return { kept: [] as ReviewPlanShape[], left: trace.length };
  const ground = new PlanGround(floor), kept: ReviewPlanShape[] = [];
  for (const annotation of trace) {
    const geometry = annotation.geometry;
    if (geometry.kind !== "source_drawing" || !isTracedFixture(geometry, ground, projection, pxPerMm)) continue;
    const tone = geometry.tone ?? 51;
    kept.push({ id: annotation.id, d: sourceDrawingSvgPath(geometry), fill: Boolean(geometry.fill),
      strokeWidthPx: geometry.strokeWidthPx ?? 1, ink: `rgb(${tone},${tone},${tone})`, role: "traced" });
  }
  return { kept, left: trace.length - kept.length };
}

type PlanInput = { document: FloorPlanDocumentV2; floorId: string; sourceId: string; pageNumber: number; widthPx: number; heightPx: number;
  dimensions?: boolean };

/** The page's projection and the document's vector drawing, or null where there is nothing to draw from. */
function planSources(input: PlanInput) {
  const source = input.document.floors.find((floor) => floor.id === input.floorId);
  const calibration = source?.calibrations.find((item) => item.sourceId === input.sourceId && item.pageNumber === input.pageNumber);
  const projection = calibration ? buildFloorPlanSourceProjection(calibration) : null;
  if (!source || !projection || !source.walls.length) return null;
  try {
    const model = compileCanonicalFloorPlanRenderModel(input.document);
    const drawing = buildFloorPlanVectorDrawing(input.document,
      { floorId: input.floorId, dimensions: input.dimensions ?? true, labels: false, fixtures: false }, undefined, model);
    const floor = model.compiledScene.floors.find((item) => item.id === input.floorId);
    return floor ? { source, projection, drawing, floor } : null;
  } catch {
    // Walls the vector drawing cannot draw: the review shows the faithful trace, as before.
    return null;
  }
}

function pathShape(path: PathPrimitive, project: (p: Point) => { x: number; y: number }, pxPerMm: number): ReviewPlanShape {
  const wall = path.role === "wall";
  const ink = wall ? REVIEW_PLAN_STYLE.wallInk : path.role.startsWith("dimension") ? REVIEW_PLAN_STYLE.dimensionInk : REVIEW_PLAN_STYLE.lineInk;
  return { id: path.id, d: projectPlanPath(wall ? path.path : vectorInkPath(path, 1), project), fill: wall, ink, role: path.role,
    strokeWidthPx: wall ? 0 : Math.max(REVIEW_PLAN_STYLE.minLinePx, strokeMm(path.role) * pxPerMm) };
}

/** The vector drawing's walls, openings and dimensions in page pixels (an opening's host span is a hit target, not ink). */
function planShapes(primitives: PlanDrawingPrimitive[], project: (p: Point) => { x: number; y: number }, pxPerMm: number) {
  const shapes: ReviewPlanShape[] = [], labels: ReviewPlanLabel[] = [];
  const dimensionLines = new Map(primitives.flatMap((p) => p.kind === "path" && p.role === "dimension" ? [[p.id.replace(/:line$/, ""), p.points] as const] : []));
  for (const primitive of primitives) {
    if (primitive.kind === "path") {
      if (primitive.role !== "host_span") shapes.push(pathShape(primitive, project, pxPerMm));
      continue;
    }
    const line = dimensionLines.get(primitive.id.replace(/:text$/, ""));
    if (primitive.role === "live-dimension-mm" && line) labels.push(dimensionLabel(primitive, line, project, pxPerMm));
  }
  return { shapes, labels };
}

/**
 * The plan drawn from the document for one source page, in that page's pixels, or null where there is nothing to
 * draw it from (no calibration to the page, no walls, or walls the vector drawing cannot draw): the review then
 * shows the faithful trace, as before.
 */
export function buildReviewPlanDrawing(input: PlanInput): ReviewPlanDrawing | null {
  const sources = planSources(input);
  if (!sources) return null;
  const { source, projection, drawing, floor } = sources;
  const project = (point: Point) => { const p = projection.project(point); return { x: p.xPx, y: p.yPx }; };
  const xs = floor.walls.flatMap((w) => [w.start.xMm, w.end.xMm]), zs = floor.walls.flatMap((w) => [w.start.zMm, w.end.zMm]);
  const pxPerMm = pixelsPerMm(projection, { xMm: (Math.min(...xs) + Math.max(...xs)) / 2, zMm: (Math.min(...zs) + Math.max(...zs)) / 2 });
  if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return null;
  const { shapes, labels } = planShapes(drawing.primitives, project, pxPerMm);
  labels.push(...floor.rooms.flatMap((room) => roomLabel(room, project, pxPerMm) ?? []));
  const trace = source.annotations.filter((annotation) => isFinalSourceTrace(annotation) && annotation.geometry.kind === "source_drawing" &&
    annotation.geometry.sourceId === input.sourceId && annotation.geometry.pageNumber === input.pageNumber);
  const fixtures = tracedFixtures(trace, floor, projection, pxPerMm);
  return { widthPx: input.widthPx, heightPx: input.heightPx, traced: fixtures.kept, shapes, labels,
    diagnostics: { tracedKept: fixtures.kept.length, tracedLeft: fixtures.left, walls: floor.walls.length, openings: floor.openings.length, rooms: floor.rooms.length } };
}

/** The drawing as one SVG document (white paper), for exports and the A/B harness; the review draws the same shapes. */
export function reviewPlanDrawingSvg(drawing: ReviewPlanDrawing) {
  const esc = (text: string) => text.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c] ?? c);
  const shape = (s: ReviewPlanShape) => s.fill
    ? `<path d="${s.d}" fill="${s.ink}" fill-rule="nonzero" stroke="none"/>`
    : `<path d="${s.d}" fill="none" stroke="${s.ink}" stroke-width="${fmt(s.strokeWidthPx)}" stroke-linecap="butt" stroke-linejoin="miter"/>`;
  const label = (l: ReviewPlanLabel) => {
    const top = l.y - ((l.lines.length - 1) * l.sizePx * 1.15) / 2;
    return l.lines.map((line, i) => `<text x="${fmt(l.x)}" y="${fmt(top + i * l.sizePx * 1.15)}" font-size="${fmt(l.sizePx)}" ` +
      `fill="${l.role === "dimension" ? REVIEW_PLAN_STYLE.dimensionInk : REVIEW_PLAN_STYLE.lineInk}" text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Arial, Helvetica, sans-serif"${l.rotateDeg ? ` transform="rotate(${l.rotateDeg} ${fmt(l.x)} ${fmt(l.y)})"` : ""}>${esc(line)}</text>`).join("");
  };
  return [`<svg xmlns="http://www.w3.org/2000/svg" width="${drawing.widthPx}" height="${drawing.heightPx}" viewBox="0 0 ${drawing.widthPx} ${drawing.heightPx}">`,
    `<rect width="${drawing.widthPx}" height="${drawing.heightPx}" fill="#fff"/>`,
    ...drawing.traced.map(shape), ...drawing.shapes.map(shape), ...drawing.labels.map(label), "</svg>"].join("\n");
}
