import { PDF_OWN_WALL_LIMITS, type AxisLine, type Swing, type WallGrid } from "./pdf-own-walls-grid";
import { wallLeaves, type WallLeaf } from "./pdf-own-walls-leaves";
import type { Closure, WallMass } from "./pdf-own-walls-mass";
import type { FloorPlanVectorizerEvidence } from "./vectorizer-evidence-schema";

/**
 * The doors a vector PDF page draws at the gaps between its walls (pdf-own-walls.ts): a leaf's swing hung from a
 * jamb, a pair of leaves, folding leaves, sliding panels, or the opening the reader saw there. A swing is used for
 * one gap only (the narrowest it fits), so the same door cannot close two.
 */
type Evidence = FloorPlanVectorizerEvidence;

/** A room name that says the space is open to the air. */
const OPEN_AIR_NAME = /\b(ledge|balcony|yard|terrace|planter|patio|roof)\b/i;

/** Where the reader's lettering names a space as open to the air (a ledge, a balcony, a yard), in page pixels. */
export const openAirPoints = (evidence: Evidence, sx: number, sy: number) => evidence.semantics.roomLabels
  .filter((label) => OPEN_AIR_NAME.test(label.label))
  .map((label) => ({ x: label.centerXRatio * evidence.page.widthPx * sx, y: label.centerYRatio * evidence.page.heightPx * sy }));

type ReaderOpening = NonNullable<Evidence["wallEdges"][number]["opening"]>;
export type Drawn = { opening: Pick<ReaderOpening, "kind" | "operation" | "confidence"> & Partial<ReaderOpening>; note: string };
export type DoorDrawing = { lines: AxisLine[]; swings: Swing[]; diagonals: { start: { x: number; y: number }; end: { x: number; y: number } }[] };

/** How a drawn door is told at a gap between two pieces of wall, as shares of the gap's width (or millimetres). */
const DOOR_SIGNS = {
  /** One leaf's swing is about as big as the gap, hinged at one jamb, lying over most of the gap. */
  leafMin: 0.75, leafMax: 1.15, leafCover: 0.75, hingeReach: 0.15,
  /** A leaf's own line starts this near its hinge and is this near as long as its swing is big (shares of the swing). */
  leafNear: 0.1,
  /** A pair of leaves (equal, or a door and a half) is one hinged at each jamb, together about as big as the gap. */
  pairMin: 0.2, pairSumMin: 0.8, pairSumMax: 1.2,
  /** Folding leaves are slanted strokes at least this long, in the gap or just beside it; only narrow doors fold. */
  foldMin: 0.3, foldReach: 0.5, foldMaxMm: 1000,
  /** Sliding panels are lines along the gap, inside the wall's own thickness, over most of the gap. */
  panelCover: 0.6,
  /** Between two walls that face each other deeper than a wall is thick, a door stands this thick at its hinge; its
   * sliding panels are two or more lines along the gap, each over this share of it, no further apart than this. */
  doorMm: 100, panelShare: 0.2, panelSpreadMm: 300,
} as const;

const SWING: Drawn = { opening: { kind: "door", operation: "swing", confidence: 0.8 }, note: "a door swing drawn at a gap of the PDF's walls" };
const FOLDING: Drawn = { opening: { kind: "door", operation: "folding", confidence: 0.7 }, note: "folding leaves drawn at a gap of the PDF's walls" };
const IN_WALL: Record<"swing" | "folding", Drawn> = {
  swing: { opening: { kind: "door", operation: "swing", confidence: 0.8 }, note: "a door swing drawn on a piece of the PDF's wall" },
  folding: { opening: { kind: "door", operation: "folding", confidence: 0.7 }, note: "folding leaves drawn on a piece of the PDF's wall" },
};
const SLIDING: Drawn = { opening: { kind: "door", operation: "sliding", confidence: 0.6 }, note: "panels drawn along a gap of the PDF's walls" };

type Span = { from: number; to: number; low: number; high: number };

/** The gap's extent along itself (from, to) and across (low, high: the depth the two pieces of wall face each other). */
const spanOf = (gap: Closure, grid: WallGrid): Span => (gap.level
  ? { from: grid.xs[gap.i0], to: grid.xs[gap.i1], low: grid.ys[gap.j0], high: grid.ys[gap.j1] }
  : { from: grid.ys[gap.j0], to: grid.ys[gap.j1], low: grid.xs[gap.i0], high: grid.xs[gap.i1] });

/** The reader's own opening lying in the gap (its middle inside the gap, its width near the gap's). */
function readerOpening(evidence: Evidence, gap: Closure, grid: WallGrid, sx: number, sy: number): Drawn | null {
  const { from, to, low, high } = spanOf(gap, grid), slack = gap.depthPx;
  for (const edge of evidence.wallEdges) {
    // A window the reader saw between two piers is a recess of the room, with the window in the wall behind it.
    if (!edge.opening || edge.opening.kind === "window") continue;
    const [[x0, y0], [x1, y1]] = edge.sourcePx.map(([x, y]) => [x * sx, y * sy]);
    const x = (x0 + x1) / 2, y = (y0 + y1) / 2, width = Math.hypot(x1 - x0, y1 - y0);
    const [along, across] = gap.level ? [x, y] : [y, x];
    if (along >= from && along <= to && across >= low - slack && across <= high + slack && width >= 0.5 * gap.lengthPx && width <= 1.5 * gap.lengthPx) {
      return { opening: edge.opening, note: "the reader's opening in a gap of the PDF's walls" };
    }
  }
  return null;
}

type Hung = { index: number; far: boolean; size: number; cover: number; depth: number };

/**
 * Whether the leaf of a swing is drawn standing open across the gap: a line from the hinge along the gap, as long as
 * the swing is big. Such a leaf shuts against the wall it is hinged on (a casement, a door in that wall), not across
 * this gap.
 */
function leafAcross(gap: Closure, lines: AxisLine[], [x, y]: [number, number], sizePx: number) {
  const [along, depth] = gap.level ? [x, y] : [y, x], near = DOOR_SIGNS.leafNear * sizePx;
  return lines.some((line) => line.plumb !== gap.level && Math.abs(line.at - depth) <= near && Math.abs(line.to - line.from - sizePx) <= 2 * near
    && (Math.abs(line.from - along) <= near || Math.abs(line.to - along) <= near));
}

/** The swings not yet used that are hinged at one of the gap's two sides, within the depth the walls face each other. */
function hungSwings(gap: Closure, span: Span, drawing: DoorDrawing, used: Set<number>): Hung[] {
  const length = gap.lengthPx, reach = DOOR_SIGNS.hingeReach * length;
  return drawing.swings.flatMap((swing, index) => {
    if (used.has(index)) return [];
    const [lo, hi] = gap.level ? [swing.left, swing.right] : [swing.top, swing.bottom], sizePx = Math.max(swing.right - swing.left, swing.bottom - swing.top);
    const cover = (Math.min(hi, span.to) - Math.max(lo, span.from)) / length;
    return swing.hinges.flatMap((hinge) => {
      const [along, depth] = gap.level ? hinge : [hinge[1], hinge[0]];
      const near = Math.abs(along - span.from) <= reach, far = Math.abs(along - span.to) <= reach;
      if (!(near || far) || depth < span.low - reach || depth > span.high + reach || leafAcross(gap, drawing.lines, hinge, sizePx)) return [];
      return [{ index, far: !near, size: sizePx / length, cover, depth }];
    });
  });
}

/** The leaf, or pair of leaves, hung in the gap: the swings it is made of and the depth its hinges stand at. */
function swingDoor(gap: Closure, span: Span, drawing: DoorDrawing, used: Set<number>): { indices: number[]; depth: number } | null {
  const hung = hungSwings(gap, span, drawing, used);
  const leaf = hung.find((arc) => arc.size >= DOOR_SIGNS.leafMin && arc.size <= DOOR_SIGNS.leafMax && arc.cover >= DOOR_SIGNS.leafCover);
  if (leaf) return { indices: [leaf.index], depth: leaf.depth };
  for (const a of hung) {
    if (a.far || a.size < DOOR_SIGNS.pairMin) continue;
    const b = hung.find((arc) => arc.far && arc.size >= DOOR_SIGNS.pairMin && arc.size + a.size >= DOOR_SIGNS.pairSumMin && arc.size + a.size <= DOOR_SIGNS.pairSumMax
      && Math.abs(arc.depth - a.depth) <= DOOR_SIGNS.hingeReach * gap.lengthPx);
    if (b) return { indices: [a.index, b.index], depth: (a.depth + b.depth) / 2 };
  }
  return null;
}

/** A door drawn at a gap no deeper than a wall: a swing hinged at one of its jambs, folding leaves, or sliding panels. */
function drawnDoor(gap: Closure, grid: WallGrid, drawing: DoorDrawing, millimetresPerPixel: number, used: Set<number>): Drawn | null {
  const span = spanOf(gap, grid), length = gap.lengthPx;
  const swing = swingDoor(gap, span, drawing, used);
  if (swing) { for (const index of swing.indices) used.add(index); return SWING; }
  const reach = DOOR_SIGNS.foldReach * length;
  const folding = length * millimetresPerPixel <= DOOR_SIGNS.foldMaxMm && drawing.diagonals.some(({ start, end }) => {
    const x = (start.x + end.x) / 2, y = (start.y + end.y) / 2, [along, across] = gap.level ? [x, y] : [y, x];
    return Math.hypot(end.x - start.x, end.y - start.y) >= DOOR_SIGNS.foldMin * length && along >= span.from && along <= span.to && across >= span.low - reach && across <= span.high + reach;
  });
  if (folding) return FOLDING;
  const panel = (line: AxisLine) => line.plumb !== gap.level && line.at > span.low + 1e-6 && line.at < span.high - 1e-6
    && Math.min(line.to, span.to) - Math.max(line.from, span.from) >= DOOR_SIGNS.panelCover * length;
  return drawing.lines.some(panel) ? SLIDING : null;
}

/** Sliding panels in a deep gap: lines along it, close together, that between them lie over most of the gap. */
function panelBand(gap: Closure, span: Span, lines: AxisLine[], millimetresPerPixel: number): { from: number; to: number } | null {
  const length = gap.lengthPx, spread = DOOR_SIGNS.panelSpreadMm / millimetresPerPixel, least = PDF_OWN_WALL_LIMITS.minWallMm / millimetresPerPixel;
  const over = (line: AxisLine) => Math.min(line.to, span.to) - Math.max(line.from, span.from);
  const along = lines.filter((line) => line.plumb !== gap.level && line.at >= span.low - 1e-6 && line.at <= span.high + 1e-6 && over(line) >= DOOR_SIGNS.panelShare * length)
    .sort((a, b) => a.at - b.at);
  for (const first of along) {
    const group = along.filter((line) => line.at >= first.at && line.at <= first.at + spread), last = group[group.length - 1];
    if (last.at - first.at < least - 1e-6) continue;
    // How much of the gap the group's lines lie over between them.
    const pieces = group.map((line) => [Math.max(line.from, span.from), Math.min(line.to, span.to)]).sort((a, b) => a[0] - b[0]);
    let covered = 0, reached = span.from;
    for (const [from, to] of pieces) { if (to > reached) { covered += to - Math.max(from, reached); reached = to; } }
    if (covered >= DOOR_SIGNS.panelCover * length) return { from: first.at, to: last.at };
  }
  return null;
}

export type DoorFinder = {
  /** The door drawn at a gap no deeper than a wall, or null. */
  at(gap: Closure): Drawn | null;
  /** In a gap deeper than a wall: the band across it (page pixels along its depth) where a door is drawn, or null. */
  deep(gap: Closure): { from: number; to: number; keep(part: Closure): void } | null;
  /** The doors and casements drawn inside the wall mass (after the gaps are closed: a swing a gap used is not one). */
  inWalls(mass: WallMass): WallLeaf[];
  /** The swings no gap and no piece of wall has used. */
  unused(): Swing[];
  /** Forgets an opening that was taken back: the swing drawn at it is free for another. */
  release(gap: Closure): void;
};

/** Finds the doors drawn at the gaps of one grid; what it finds for a gap it keeps, and a swing serves one gap. */
export function doorFinder(evidence: Evidence, grid: WallGrid, drawing: DoorDrawing, millimetresPerPixel: number, sx: number, sy: number): DoorFinder {
  const found = new Map<Closure, Drawn | null>(), used = new Set<number>(), swingsOf = new Map<Closure, number[]>();
  return {
    at(gap) {
      if (found.has(gap)) return found.get(gap) ?? null;
      const before = new Set(used), drawn = readerOpening(evidence, gap, grid, sx, sy) ?? drawnDoor(gap, grid, drawing, millimetresPerPixel, used);
      found.set(gap, drawn);
      swingsOf.set(gap, [...used].filter((index) => !before.has(index)));
      return drawn;
    },
    release(gap) {
      for (const index of swingsOf.get(gap) ?? []) used.delete(index);
      swingsOf.delete(gap);
      found.delete(gap);
    },
    deep(gap) {
      const span = spanOf(gap, grid), swing = swingDoor(gap, span, drawing, used);
      if (swing) {
        const thick = Math.min(DOOR_SIGNS.doorMm / millimetresPerPixel, span.high - span.low), reach = DOOR_SIGNS.hingeReach * gap.lengthPx;
        const from = swing.depth - span.low <= reach ? span.low : span.high - swing.depth <= reach ? span.high - thick : Math.max(span.low, Math.min(span.high - thick, swing.depth - thick / 2));
        return { from, to: from + thick, keep: (part) => { for (const index of swing.indices) used.add(index); found.set(part, SWING); swingsOf.set(part, swing.indices); } };
      }
      const panels = panelBand(gap, span, drawing.lines, millimetresPerPixel);
      return panels && { ...panels, keep: (part) => { found.set(part, SLIDING); } };
    },
    inWalls(mass) {
      const leaves = wallLeaves(grid, mass, drawing, millimetresPerPixel, used, openAirPoints(evidence, sx, sy));
      for (const leaf of leaves) {
        for (const index of leaf.swings) used.add(index);
        if (leaf.kind !== "casement") found.set(leaf.part, IN_WALL[leaf.kind]);
      }
      return leaves;
    },
    unused: () => drawing.swings.filter((_, index) => !used.has(index)),
  };
}
