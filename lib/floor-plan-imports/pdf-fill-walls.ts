import type { FloorPlanWallV2 } from "@/lib/floor-plan-document-v2";
import type { PdfFillGround } from "./pdf-wall-faces";
import { addVertex, restoreFloor, snapshotFloor, type TopologyFloor, vertexMap, wallsStillValid } from "./vectorizer-topology-graph";

/**
 * Walls the vectorizer missed, from a vector PDF's black fills (8 Nov 2026). HDB draws its structural walls solid
 * black, so a long thin band of fill is a wall whatever the render's reading of it. Where such a band runs along no
 * wall of the document for a stretch, the stretch becomes a wall of its own (not a room's: the review closes the room),
 * ending at the faces of the walls it meets so it crosses none. Part of FLOOR_PLAN_PDF_WALL_SNAP (pdf-wall-snap.ts).
 */
export const PDF_FILL_WALL_LIMITS = {
  /** A band shorter than this, or under twice its thickness, is a column or a corner block. */
  minLengthMm: 500,
  minThicknessMm: 60,
  maxThicknessMm: 450,
  /** A row's run joins a band where they overlap by this share of the shorter. */
  bandOverlap: 0.8,
  /** A stretch of band no wall covers, this long or more, becomes a wall. */
  minMissingMm: 400,
  /** A wall covers a point of a band within its half thickness and this. */
  coverMarginMm: 40,
  sampleMm: 50,
} as const;

export type FillBand = { axis: "x" | "z"; at: number; from: number; to: number; thicknessMm: number };

/** Maximal runs of filled cells along one row (or column), at least the minimum length. */
function runsOf(sorted: number[], minCells: number) {
  const runs: Array<[number, number]> = [];
  let start = sorted[0], last = sorted[0];
  for (const value of [...sorted.slice(1), Number.NaN]) {
    if (value === last + 1) { last = value; continue; }
    if (last - start + 1 >= minCells) runs.push([start, last]);
    start = value;
    last = value;
  }
  return runs;
}

/** The fill's long thin bands along one axis: "z" bands lie along x (level walls), "x" bands along z (plumb walls). */
function bandsAlong(cells: ReadonlyArray<readonly [number, number]>, cell: number, axis: "x" | "z"): FillBand[] {
  const rows = new Map<number, number[]>();
  for (const [i, j] of cells) {
    const [row, along] = axis === "z" ? [j, i] : [i, j];
    rows.set(row, [...(rows.get(row) ?? []), along]);
  }
  const open: Array<{ rows: [number, number]; span: [number, number] }> = [], done: typeof open = [];
  for (const row of [...rows.keys()].sort((a, b) => a - b)) {
    const runs = runsOf(rows.get(row)!.sort((a, b) => a - b), Math.ceil(PDF_FILL_WALL_LIMITS.minLengthMm / cell));
    const next: typeof open = [];
    for (const run of runs) {
      const band = open.find((b) => b.rows[1] === row - 1 && Math.min(b.span[1], run[1]) - Math.max(b.span[0], run[0]) + 1 >=
        PDF_FILL_WALL_LIMITS.bandOverlap * Math.min(b.span[1] - b.span[0] + 1, run[1] - run[0] + 1));
      if (band) { open.splice(open.indexOf(band), 1); next.push({ rows: [band.rows[0], row], span: [Math.max(band.span[0], run[0]), Math.min(band.span[1], run[1])] }); }
      else next.push({ rows: [row, row], span: run });
    }
    done.push(...open);
    open.splice(0, open.length, ...next);
  }
  done.push(...open);
  return done.flatMap((band) => {
    const thicknessMm = (band.rows[1] - band.rows[0] + 1) * cell, from = band.span[0] * cell, to = (band.span[1] + 1) * cell;
    if (thicknessMm < PDF_FILL_WALL_LIMITS.minThicknessMm || thicknessMm > PDF_FILL_WALL_LIMITS.maxThicknessMm) return [];
    if (to - from < Math.max(PDF_FILL_WALL_LIMITS.minLengthMm, 2 * thicknessMm)) return [];
    return [{ axis, at: ((band.rows[0] + band.rows[1] + 1) / 2) * cell, from, to, thicknessMm }];
  });
}

export function fillWallBands(fills: PdfFillGround): FillBand[] {
  const cells = fills.indices();
  return [...bandsAlong(cells, fills.cellMm, "z"), ...bandsAlong(cells, fills.cellMm, "x")];
}

/** The stretches of a band no wall of the floor covers, each at least the minimum length. */
export function uncoveredStretches(floor: TopologyFloor, band: FillBand) {
  const vertices = vertexMap(floor);
  const covered = (s: number) => {
    const p = band.axis === "z" ? { xMm: s, zMm: band.at } : { xMm: band.at, zMm: s };
    return floor.walls.some((wall) => {
      const a = vertices.get(wall.path.startVertexId), b = vertices.get(wall.path.endVertexId);
      if (!a || !b) return false;
      const dx = b.xMm - a.xMm, dz = b.zMm - a.zMm, length = dx * dx + dz * dz;
      const t = length ? Math.max(0, Math.min(1, ((p.xMm - a.xMm) * dx + (p.zMm - a.zMm) * dz) / length)) : 0;
      return Math.hypot(p.xMm - a.xMm - dx * t, p.zMm - a.zMm - dz * t) <= wall.thicknessMm / 2 + PDF_FILL_WALL_LIMITS.coverMarginMm;
    });
  };
  const stretches: Array<[number, number]> = [];
  let start: number | null = null;
  for (let s = band.from; s <= band.to; s += PDF_FILL_WALL_LIMITS.sampleMm) {
    const end = Math.min(s, band.to);
    if (!covered(end)) { start ??= end; continue; }
    if (start !== null && end - start >= PDF_FILL_WALL_LIMITS.minMissingMm) stretches.push([start, end]);
    start = null;
  }
  if (start !== null && band.to - start >= PDF_FILL_WALL_LIMITS.minMissingMm) stretches.push([start, band.to]);
  return stretches;
}

/** Adds the walls the black fills draw and the floor lacks; each is checked by the app's wall rules on its own. */
export function addFillWalls(floor: TopologyFloor, fills: PdfFillGround) {
  const template = floor.walls.find((wall) => wall.path.kind === "line");
  const anchor = floor.vertices[0];
  if (!template || !anchor) return { added: 0, refused: 0 };
  // The plan's extent is all its walls' (only the plan has black fill, so a stray far wall widens nothing that matters).
  const extent = floor.vertices;
  const xs = extent.map((v) => v.xMm), zs = extent.map((v) => v.zMm);
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  let added = 0, refused = 0;
  for (const band of fillWallBands(fills)) {
    const across = band.axis === "z" ? [band.at, z0, z1] : [band.at, x0, x1];
    if (across[0] < across[1] - 500 || across[0] > across[2] + 500) continue;
    for (const [from, to] of uncoveredStretches(floor, band)) {
      const saved = snapshotFloor(floor);
      const point = (s: number) => (band.axis === "z" ? { xMm: s, zMm: band.at } : { xMm: band.at, zMm: s });
      const start = addVertex(floor, point(from), anchor), end = addVertex(floor, point(to), anchor);
      const outer = Math.abs(across[0] - across[1]) < band.thicknessMm || Math.abs(across[0] - across[2]) < band.thicknessMm;
      const wall: FloorPlanWallV2 = {
        id: freshId(floor), path: { kind: "line", startVertexId: start.id, endVertexId: end.id }, thicknessMm: Math.round(band.thicknessMm),
        classification: outer ? "exterior" : "structural", adjacentRoomIds: [],
        provenance: { ...template.provenance, confidence: 0.8, evidence: template.provenance.evidence.map((e) => ({ ...e, basis: "vector_traced" as const,
          confidence: 0.8, note: "Wall drawn solid black in the PDF (structural shading) that the vectorizer missed; confirm against the source" })) },
      };
      floor.walls.push(wall);
      if (wallsStillValid(floor)) added++;
      else { restoreFloor(floor, saved); refused++; }
    }
  }
  return { added, refused };
}

function freshId(floor: TopologyFloor) {
  const ids = new Set(floor.walls.map((wall) => wall.id));
  let next = floor.walls.length + 1;
  while (ids.has(`w${next}`)) next += 1;
  return `w${next}`;
}
