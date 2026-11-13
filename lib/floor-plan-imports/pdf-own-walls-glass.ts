import { PDF_OWN_WALL_LIMITS, gridIndex, type AxisLine, type WallGrid } from "./pdf-own-walls-grid";
import { DASHED_GLASS, FREE, type WallMass } from "./pdf-own-walls-mass";

/**
 * Windows drawn as a dashed glass line down the middle of a thin piece of wall (14 Nov 2026). HDB draws a bathroom's
 * window this way: the wall's two lines, a short line across each jamb, and between them a row of dashes. Light passes
 * between the dashes, so they do not split the piece into two layers the way a whole glass line does, and the piece
 * read as plain wall (Blk 670 baths 1 and 2, Blk 88 baths 1 and 2).
 */
export const PDF_OWN_GLASS_LIMITS = {
  /** One dash is at least this long and at most this long (Blk 670: 90 to 200 mm). */
  minDashMm: 40,
  maxDashMm: 400,
  /** The space between two dashes of one row (Blk 670: 60 to 100 mm). */
  minSpaceMm: 20,
  maxSpaceMm: 250,
  /** Each of the wall's two lines lies at least this far and at most this far from the dashes. */
  minSideMm: 15,
  maxSideMm: 200,
} as const;

type DashRow = { plumb: boolean; at: number; from: number; to: number };

/** Rows of two or more dashes: collinear short lines, each the next's neighbour across a short space. */
export function dashRows(lines: AxisLine[], millimetresPerPixel: number): DashRow[] {
  const px = (mm: number) => mm / millimetresPerPixel, L = PDF_OWN_GLASS_LIMITS;
  const dashes = lines.filter((line) => line.to - line.from >= px(L.minDashMm) && line.to - line.from <= px(L.maxDashMm))
    .sort((a, b) => Number(a.plumb) - Number(b.plumb) || a.at - b.at || a.from - b.from);
  const rows: DashRow[] = [];
  let row: (DashRow & { count: number }) | null = null;
  for (const dash of dashes) {
    const space = row && row.plumb === dash.plumb && Math.abs(row.at - dash.at) <= PDF_OWN_WALL_LIMITS.snapPx ? dash.from - row.to : -Infinity;
    if (row && space >= px(L.minSpaceMm) && space <= px(L.maxSpaceMm)) { row.to = dash.to; row.count += 1; continue; }
    if (row && row.count >= 2) rows.push({ plumb: row.plumb, at: row.at, from: row.from, to: row.to });
    row = { ...dash, count: 1 };
  }
  if (row && row.count >= 2) rows.push({ plumb: row.plumb, at: row.at, from: row.from, to: row.to });
  return rows;
}

/** The nearest whole line either side of a row, parallel to it and running its whole length: the wall's two lines. */
function sideLines(row: DashRow, lines: AxisLine[], millimetresPerPixel: number): [number, number] | null {
  const px = (mm: number) => mm / millimetresPerPixel, snap = PDF_OWN_WALL_LIMITS.snapPx;
  let before = -Infinity, after = Infinity;
  for (const line of lines) {
    if (line.plumb !== row.plumb || line.from > row.from + snap || line.to < row.to - snap) continue;
    const off = line.at - row.at;
    if (off <= -px(PDF_OWN_GLASS_LIMITS.minSideMm) && off >= -px(PDF_OWN_GLASS_LIMITS.maxSideMm)) before = Math.max(before, line.at);
    if (off >= px(PDF_OWN_GLASS_LIMITS.minSideMm) && off <= px(PDF_OWN_GLASS_LIMITS.maxSideMm)) after = Math.min(after, line.at);
  }
  return Number.isFinite(before) && Number.isFinite(after) ? [before, after] : null;
}

/**
 * Marks as glazed the wall mass of every piece of wall with a dashed glass line down its middle: across, between the
 * wall's two lines; along, from the first dash to the last (they end at the jambs' lines). Returns how many it found.
 */
export function markDashedGlass(grid: WallGrid, mass: WallMass, lines: AxisLine[], millimetresPerPixel: number): number {
  let found = 0;
  for (const row of dashRows(lines, millimetresPerPixel)) {
    const sides = sideLines(row, lines, millimetresPerPixel);
    if (!sides) continue;
    found += 1;
    const [a0, a1] = row.plumb ? [grid.xs, grid.ys] : [grid.ys, grid.xs];
    const c0 = gridIndex(a0, sides[0]), c1 = gridIndex(a0, sides[1]), l0 = gridIndex(a1, row.from), l1 = gridIndex(a1, row.to);
    for (let l = l0; l < l1; l += 1) {
      for (let c = c0; c < c1; c += 1) {
        const index = row.plumb ? l * grid.nx + c : c * grid.nx + l;
        if (mass.kind[index] !== FREE) mass.glazed[index] = DASHED_GLASS;
      }
    }
  }
  return found;
}
