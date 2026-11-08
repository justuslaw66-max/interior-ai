import type { FloorPlanDocumentV2, FloorPlanVertexV2, FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "./deterministic-evidence";
import { pageLineworkKind } from "./mixed-pdf-evidence";
import { type PdfFace, type PdfFillGround, pdfPageDrawing } from "./pdf-wall-faces";
import { moveVertex, restoreFloor, snapshotFloor, type TopologyFloor, vertexMap, wallsStillValid } from "./vectorizer-topology-graph";

/**
 * Walls snapped to a vector PDF's own lines (8 Nov 2026). On a vector PDF page the vectorizer reads the page's render,
 * so its walls carry the render's pixel error; the PDF itself has every wall face exactly. Each straight run of level
 * or plumb walls (walls end to end on one line) is moved onto the middle of the pair of PDF lines it lies between, and
 * takes their distance apart as its thickness; an interior wall the PDF draws solid black is marked structural. A run with no
 * such pair near it, or whose move the app's wall rules refuse, is left as read. Off unless FLOOR_PLAN_PDF_WALL_SNAP=1.
 */
export const PDF_WALL_SNAP_LIMITS = {
  /** A wall this far off level or plumb is left as read. */
  maxSkewDeg: 1,
  /** A run's walls lie within this of one line. */
  runToleranceMm: 15,
  /** How far a run may move onto its faces: its thickness, and at least this. */
  minReachMm: 150,
  /** Two faces this far apart, and no further, can be one wall's. */
  minThicknessMm: 60,
  maxThicknessMm: 450,
  /** A face counts where it runs along at least this share of the run (a window or door breaks the rest). */
  minCoverShare: 0.3,
  /** A wall at least this share of whose band the PDF fills black is structural. */
  structuralShare: 0.6,
} as const;

type Run = { axis: "x" | "z"; at: number; from: number; to: number; thicknessMm: number; walls: FloorPlanWallV2[]; vertexIds: Set<string> };
export type PdfWallSnapLog = { runs: number; snapped: number; unmatched: number; refused: number; shiftsMm: number[]; thicknessChanges: number; structural: number };

function runAxis(wall: FloorPlanWallV2, vertices: Map<string, FloorPlanVertexV2>) {
  const a = vertices.get(wall.path.startVertexId), b = vertices.get(wall.path.endVertexId);
  if (!a || !b || wall.path.kind !== "line") return null;
  const dx = b.xMm - a.xMm, dz = b.zMm - a.zMm;
  const skew = (Math.atan2(Math.min(Math.abs(dx), Math.abs(dz)), Math.max(Math.abs(dx), Math.abs(dz))) * 180) / Math.PI;
  if (skew > PDF_WALL_SNAP_LIMITS.maxSkewDeg || Math.hypot(dx, dz) < 1) return null;
  return Math.abs(dz) >= Math.abs(dx)
    ? { axis: "x" as const, at: (a.xMm + b.xMm) / 2, from: Math.min(a.zMm, b.zMm), to: Math.max(a.zMm, b.zMm) }
    : { axis: "z" as const, at: (a.zMm + b.zMm) / 2, from: Math.min(a.xMm, b.xMm), to: Math.max(a.xMm, b.xMm) };
}

/** Level and plumb walls joined end to end on one line, as runs (each a line of the drawing). */
export function wallRuns(floor: TopologyFloor): Run[] {
  const vertices = vertexMap(floor);
  const lines = floor.walls.flatMap((wall) => { const line = runAxis(wall, vertices); return line ? [{ wall, ...line }] : []; });
  const parent = lines.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const byVertex = new Map<string, number[]>();
  lines.forEach((line, i) => [line.wall.path.startVertexId, line.wall.path.endVertexId].forEach((id) => byVertex.set(id, [...(byVertex.get(id) ?? []), i])));
  for (const indices of byVertex.values()) {
    for (const i of indices) for (const j of indices) {
      if (i < j && lines[i].axis === lines[j].axis && Math.abs(lines[i].at - lines[j].at) <= PDF_WALL_SNAP_LIMITS.runToleranceMm) parent[find(i)] = find(j);
    }
  }
  const runs = new Map<number, typeof lines>();
  lines.forEach((line, i) => runs.set(find(i), [...(runs.get(find(i)) ?? []), line]));
  return [...runs.values()].map((members) => {
    const length = members.reduce((sum, m) => sum + (m.to - m.from), 0) || 1;
    return {
      axis: members[0].axis,
      at: members.reduce((sum, m) => sum + m.at * (m.to - m.from), 0) / length,
      from: Math.min(...members.map((m) => m.from)),
      to: Math.max(...members.map((m) => m.to)),
      thicknessMm: members.reduce((sum, m) => sum + m.wall.thicknessMm * (m.to - m.from), 0) / length,
      walls: members.map((m) => m.wall),
      vertexIds: new Set(members.flatMap((m) => [m.wall.path.startVertexId, m.wall.path.endVertexId])),
    };
  });
}

/** The PDF faces along a run (same axis, within its reach), merged by position, with how much of the run each covers. */
function facesAlong(run: Run, faces: PdfFace[]) {
  const reach = Math.max(run.thicknessMm, PDF_WALL_SNAP_LIMITS.minReachMm) + PDF_WALL_SNAP_LIMITS.maxThicknessMm / 2;
  const near = new Map<number, number>();
  for (const f of faces) {
    if (f.axis !== run.axis || Math.abs(f.at - run.at) > reach) continue;
    const cover = Math.max(0, Math.min(f.to, run.to) - Math.max(f.from, run.from));
    if (cover <= 0) continue;
    const key = Math.round(f.at * 2) / 2;
    near.set(key, (near.get(key) ?? 0) + cover);
  }
  const length = Math.max(1, run.to - run.from);
  return [...near.entries()].map(([at, cover]) => ({ at, share: Math.min(1, cover / length) }))
    .filter((f) => f.share >= PDF_WALL_SNAP_LIMITS.minCoverShare);
}

/** The pair of PDF faces a run lies between: the nearest middle, then the nearest thickness. */
export function facePairFor(run: Run, faces: PdfFace[]) {
  const along = facesAlong(run, faces).sort((a, b) => a.at - b.at);
  const reach = Math.max(run.thicknessMm, PDF_WALL_SNAP_LIMITS.minReachMm);
  let best: { middle: number; thickness: number; cost: number } | null = null;
  for (let i = 0; i < along.length; i++) for (let j = i + 1; j < along.length; j++) {
    const thickness = along[j].at - along[i].at, middle = (along[i].at + along[j].at) / 2;
    if (thickness < PDF_WALL_SNAP_LIMITS.minThicknessMm || thickness > PDF_WALL_SNAP_LIMITS.maxThicknessMm) continue;
    if (Math.abs(middle - run.at) > reach) continue;
    const cost = Math.abs(middle - run.at) + 0.5 * Math.abs(thickness - run.thicknessMm) - 100 * Math.min(along[i].share, along[j].share);
    if (!best || cost < best.cost) best = { middle, thickness, cost };
  }
  return best;
}

function structuralShare(wall: FloorPlanWallV2, vertices: Map<string, FloorPlanVertexV2>, fills: PdfFillGround) {
  const a = vertices.get(wall.path.startVertexId)!, b = vertices.get(wall.path.endVertexId)!;
  const length = Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm) || 1, nx = -(b.zMm - a.zMm) / length, nz = (b.xMm - a.xMm) / length;
  let hits = 0, total = 0;
  for (let s = 0.05; s < 1; s += 0.1) for (const o of [-0.3, 0, 0.3]) {
    total++;
    if (fills.covered({ xMm: a.xMm + (b.xMm - a.xMm) * s + nx * o * wall.thicknessMm, zMm: a.zMm + (b.zMm - a.zMm) * s + nz * o * wall.thicknessMm })) hits++;
  }
  return hits / total;
}

/** Moves one run onto the middle of its face pair, in whole millimetres (the document's rule), so the run ends up
 * exactly straight as well as on the drawing; undone if the app's wall rules refuse the result. */
function snapRun(floor: TopologyFloor, run: Run, pair: { middle: number; thickness: number }) {
  const line = Math.round(pair.middle), saved = snapshotFloor(floor), vertices = vertexMap(floor);
  for (const id of run.vertexIds) {
    const vertex = vertices.get(id);
    if (!vertex) continue;
    const delta = line - (run.axis === "x" ? vertex.xMm : vertex.zMm);
    moveVertex(floor, id, run.axis === "x" ? delta : 0, run.axis === "z" ? delta : 0);
  }
  for (const wall of run.walls) wall.thicknessMm = Math.round(pair.thickness);
  if (wallsStillValid(floor)) return true;
  restoreFloor(floor, saved);
  return false;
}

/** Marks structural every interior wall the PDF fills black. Only interior walls: an exterior wall stays "exterior"
 * (the 3D camera's cut-away treats a structural wall as interior, so an outer wall marked structural would no longer be
 * cut away). */
function markStructural(floor: TopologyFloor, fills: PdfFillGround) {
  const vertices = vertexMap(floor);
  let marked = 0;
  for (const wall of floor.walls) {
    if (wall.classification !== "interior" || wall.path.kind !== "line") continue;
    if (structuralShare(wall, vertices, fills) < PDF_WALL_SNAP_LIMITS.structuralShare) continue;
    wall.classification = "structural";
    marked++;
  }
  return marked;
}

/** Moves each run onto its PDF face pair; returns the log. Each move is checked by the app's wall rules on its own. */
export function snapWallsToPdf(floor: TopologyFloor, faces: PdfFace[], fills: PdfFillGround | null): PdfWallSnapLog {
  const log: PdfWallSnapLog = { runs: 0, snapped: 0, unmatched: 0, refused: 0, shiftsMm: [], thicknessChanges: 0, structural: 0 };
  for (const run of wallRuns(floor)) {
    log.runs++;
    const pair = facePairFor(run, faces);
    if (!pair) { log.unmatched++; continue; }
    if (!snapRun(floor, run, pair)) { log.refused++; continue; }
    log.snapped++;
    log.shiftsMm.push(Math.round(Math.abs(Math.round(pair.middle) - run.at)));
    if (Math.abs(Math.round(pair.thickness) - run.thicknessMm) >= 5) log.thicknessChanges++;
  }
  if (fills && fills.size > 0) log.structural = markStructural(floor, fills);
  return log;
}

export function summarizePdfWallSnap(log: PdfWallSnapLog) {
  const shifts = [...log.shiftsMm].sort((a, b) => a - b);
  const median = shifts.length ? shifts[Math.floor(shifts.length / 2)] : 0;
  return `runs ${log.runs}; snapped ${log.snapped}; unmatched ${log.unmatched}; refused ${log.refused}; ` +
    `moved median ${median}mm max ${shifts.at(-1) ?? 0}mm; thickness changed ${log.thicknessChanges}; structural ${log.structural}`;
}

/**
 * The adapter's step: on a floor read by the vectorizer from a vector PDF page, snap its walls to that page's lines.
 * "off" unless FLOOR_PLAN_PDF_WALL_SNAP=1 and there is such a page with a calibration.
 */
export function snapImportedWallsToPdf(document: FloorPlanDocumentV2, pages: RegisteredPageEvidence[],
  environment: Readonly<Record<string, string | undefined>> = process.env) {
  const floor = document.floors[0];
  if (environment.FLOOR_PLAN_PDF_WALL_SNAP !== "1" || !floor?.walls.length) return "off";
  const page = pages.find((p) => (p.vectorizer?.rooms.length ?? 0) > 0 && pageLineworkKind(p) !== "raster_linework");
  const drawing = page ? pdfPageDrawing(page, floor.calibrations.find((c) => c.pageNumber === page.pageNumber)) : null;
  if (!drawing) return "off";
  return summarizePdfWallSnap(snapWallsToPdf(floor, drawing.faces, drawing.fills));
}
