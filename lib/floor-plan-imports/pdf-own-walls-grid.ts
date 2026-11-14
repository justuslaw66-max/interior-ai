import { arcOf, pageSwings } from "./pdf-own-walls-swings";
import type { RegisteredPageEvidence, SourcePointPx } from "./deterministic-evidence";

/**
 * A vector PDF page's own level and plumb lines and fills on a grid, for reading its walls from the drawing itself
 * (pdf-own-walls.ts, 13 Nov 2026). The grid's lines are the coordinates the drawing uses, so every cell is either
 * wholly inside or wholly outside each drawn shape and nothing is rounded: a cell is filled (inside a fill path) or
 * free, and a free cell's four sides say whether a drawn line runs along them. All lengths here are page pixels.
 */
export const PDF_OWN_WALL_LIMITS = {
  /** A level or plumb stroke shorter than this bounds no wall (lettering, ticks, symbol details). */
  minLineMm: 30,
  /** tan(0.5 deg): a stroke further off level or plumb is not a wall's line here. */
  maxSkew: 0.0087,
  /** Coordinates this close are one grid line (page pixels; a CAD plot's own rounding). */
  snapPx: 0.05,
  /** A wall is at most this thick (an external wall with its outer skin; the document's own limit); the thinnest
   * wall, and the jog between two thicknesses, is this thick. */
  maxWallMm: 600,
  minWallMm: 40,
  /** A closed strip between two lines is wall where it is no wider than this (wider: a cupboard, a counter, a room). */
  maxStripMm: 450,
  /** A closed strip is a wall where at least this share of it is no wider than a wall (the rest: its corners). */
  thinShare: 0.85,
  /** A line that stops this short of a line drawn across its path is taken to reach it (a plot's unclosed corner). */
  joinMm: 30,
  /** A filled shape this small is a dimension's dot or arrowhead. */
  markMaxMm: 150,
  /** A line with a dot or arrowhead within this of both its ends, or lying this near along a dimension the reader
   * measured, is a dimension line. */
  markReachMm: 60,
} as const;

export type AxisLine = { plumb: boolean; at: number; from: number; to: number };
export type FillPath = SourcePointPx[][];

export type WallGrid = {
  xs: Float64Array;
  ys: Float64Array;
  nx: number;
  ny: number;
  /** 1 where a drawn line runs along the left side of cell (i, j): index j * (nx + 1) + i, i up to nx. */
  plumb: Uint8Array;
  /** 1 where a drawn line runs along the top side of cell (i, j): index j * nx + i, j up to ny. */
  level: Uint8Array;
  /** 1 where the cell lies inside a fill path: index j * nx + i. */
  fill: Uint8Array;
};

type Stroke = { start: SourcePointPx; end: SourcePointPx; strokeWidthPx: number };
/** A stroked path with curves (a door's swing): its box, and the corner(s) of the box its curves bulge away from. */
export type Swing = { left: number; top: number; right: number; bottom: number; hinges: [number, number][] };

/** The page's own strokes and fill paths (each fill path's subpaths as rings), in page pixels. */
export function pageStrokesAndFills(page: RegisteredPageEvidence): { strokes: Stroke[]; fills: FillPath[]; swings: Swing[] } {
  const segments = new Map(page.vectorSegments.map((segment) => [segment.id, segment]));
  const strokes: Stroke[] = [], fills: FillPath[] = [], arcs: NonNullable<ReturnType<typeof arcOf>>[] = [];
  for (const path of page.vectorPaths) {
    if (path.evidenceKind === "raster_linework") continue;
    const stroked = path.paintOperation === "stroke" || path.paintOperation === "fill_stroke";
    const filled = path.paintOperation === "fill" || path.paintOperation === "fill_stroke";
    if (stroked) for (const id of path.segmentIds) { const s = segments.get(id); if (s) strokes.push(s); }
    const arc = stroked ? arcOf(path, segments) : null;
    if (arc) arcs.push(arc);
    // A light fill masks what lies under it (a window's frame filled white): its outline is drawn, it is not solid.
    if (!filled || path.fillLight) continue;
    const rings = (path.subpaths ?? [{ segmentIds: path.segmentIds }]).map((subpath) => {
      const points = subpath.segmentIds.flatMap((id) => { const s = segments.get(id); return s ? [s.start, s.end] : []; });
      return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
    }).filter((ring) => ring.length >= 3);
    if (rings.length) fills.push(rings);
  }
  return { strokes, fills, swings: pageSwings(arcs) };
}

function ringBox(rings: FillPath) {
  const xs = rings.flatMap((ring) => ring.map((p) => p.x)), ys = rings.flatMap((ring) => ring.map((p) => p.y));
  return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
}

/** A level or plumb line of at least the least length, or null. */
function axisLine(a: SourcePointPx, b: SourcePointPx, minPx: number): AxisLine | null {
  const dx = Math.abs(b.x - a.x), dy = Math.abs(b.y - a.y), length = Math.max(dx, dy);
  if (length < minPx || Math.min(dx, dy) > PDF_OWN_WALL_LIMITS.maxSkew * length) return null;
  return dy >= dx
    ? { plumb: true, at: (a.x + b.x) / 2, from: Math.min(a.y, b.y), to: Math.max(a.y, b.y) }
    : { plumb: false, at: (a.y + b.y) / 2, from: Math.min(a.x, b.x), to: Math.max(a.x, b.x) };
}

/**
 * Lines of one direction on one coordinate that touch or overlap, as one line each. A CAD plot breaks a wall's line
 * where another line meets it, so a piece of a wall's line can run from one dimension dot to the next; the whole line
 * does not.
 */
function joinedLines(pieces: AxisLine[]): AxisLine[] {
  // Coordinates within the snap of one another are one line's (162.42 and 162.43 on Tengah): group them first, then
  // join along each group in order. Sorting by the exact coordinate let a piece slip behind a far one and be lost.
  const { snapPx } = PDF_OWN_WALL_LIMITS, byAt = [...pieces].sort((a, b) => Number(a.plumb) - Number(b.plumb) || a.at - b.at);
  const group = new Map<AxisLine, number>();
  byAt.forEach((piece, k) => group.set(piece, k > 0 && byAt[k - 1].plumb === piece.plumb && piece.at - byAt[k - 1].at <= snapPx ? group.get(byAt[k - 1])! : k));
  const sorted = byAt.sort((a, b) => group.get(a)! - group.get(b)! || a.from - b.from), joined: AxisLine[] = [];
  let lastGroup = -1;
  for (const piece of sorted) {
    const last = joined[joined.length - 1];
    if (last && group.get(piece) === lastGroup && piece.from <= last.to + snapPx) last.to = Math.max(last.to, piece.to);
    else joined.push({ ...piece });
    lastGroup = group.get(piece)!;
  }
  return joined;
}

/** Whether a dimension's dot or arrowhead sits at the point (within the reach). */
function markAt(marks: SourcePointPx[], x: number, y: number, reach: number) {
  return marks.some((mark) => Math.abs(mark.x - x) <= reach && Math.abs(mark.y - y) <= reach);
}

/**
 * The lines that can bound a wall and the fills that can be one: the page's level and plumb strokes and fill edges,
 * without dimension lines (a line with a dot or arrowhead at both its ends, a short tick through a dot, or a line
 * along at least half of a dimension the reader measured between two stops) and without the dots themselves.
 */
export function wallLinesAndFills(page: RegisteredPageEvidence, millimetresPerPixel: number, dimensionSpans: [[number, number], [number, number]][] = []) {
  const { strokes, fills, swings } = pageStrokesAndFills(page);
  const px = (mm: number) => mm / millimetresPerPixel;
  // A dot or arrowhead has area: a fill with no width (a CAD plot's sliver along a column's edge, Tengah) is no mark.
  const isMark = (rings: FillPath) => {
    const b = ringBox(rings), w = b.right - b.left, h = b.bottom - b.top, max = px(PDF_OWN_WALL_LIMITS.markMaxMm), snap = PDF_OWN_WALL_LIMITS.snapPx;
    return w <= max && h <= max && w > snap && h > snap;
  };
  const marks: SourcePointPx[] = fills.filter(isMark).map((rings) => { const b = ringBox(rings); return { x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 }; });
  const solid = fills.filter((rings) => !isMark(rings));
  const reach = px(PDF_OWN_WALL_LIMITS.markReachMm), minPx = px(PDF_OWN_WALL_LIMITS.minLineMm);
  const pieces: AxisLine[] = strokes.flatMap((stroke) => axisLine(stroke.start, stroke.end, minPx) ?? []);
  for (const rings of solid) for (const ring of rings) ring.forEach((point, i) => { const line = axisLine(point, ring[(i + 1) % ring.length], minPx); if (line) pieces.push(line); });
  const candidates = joinedLines(pieces);
  const measured = (line: AxisLine) => dimensionSpans.some(([[x0, y0], [x1, y1]]) => {
    const [at, from, to] = line.plumb ? [(x0 + x1) / 2, Math.min(y0, y1), Math.max(y0, y1)] : [(y0 + y1) / 2, Math.min(x0, x1), Math.max(x0, x1)];
    const shared = Math.min(line.to, to) - Math.max(line.from, from);
    return (line.plumb ? Math.abs(x1 - x0) : Math.abs(y1 - y0)) <= reach && Math.abs(line.at - at) <= reach && shared >= 0.5 * (line.to - line.from) && shared >= 0.5 * (to - from);
  });
  // A short line through a dot (the dot between its ends) is the tick a dimension ends at.
  const tick = (line: AxisLine) => line.to - line.from <= px(PDF_OWN_WALL_LIMITS.maxWallMm) && marks.some((mark) => {
    const [across, along] = line.plumb ? [mark.x, mark.y] : [mark.y, mark.x];
    return Math.abs(across - line.at) <= reach && along > line.from + reach && along < line.to - reach;
  });
  const dimension = (line: AxisLine) => measured(line) || tick(line) || (line.plumb
    ? markAt(marks, line.at, line.from, reach) && markAt(marks, line.at, line.to, reach)
    : markAt(marks, line.from, line.at, reach) && markAt(marks, line.to, line.at, reach));
  const diagonals = strokes.filter(({ start, end }) => !axisLine(start, end, 0));
  // The pen the plan is drawn with: the middle one of its strokes' widths.
  const widths = strokes.map((stroke) => stroke.strokeWidthPx).sort((a, b) => a - b), penPx = widths[widths.length >> 1] ?? 0;
  return { lines: candidates.filter((line) => !dimension(line)), dimensionLines: candidates.filter(dimension), fills: solid, swings, diagonals, penPx };
}

/** Sorted values with those within the snap of one another made one. */
function gridCoordinates(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b), out: number[] = [];
  for (const value of sorted) if (!out.length || value - out[out.length - 1] > PDF_OWN_WALL_LIMITS.snapPx) out.push(value);
  return Float64Array.from(out);
}

/** The grid line nearest a coordinate. */
export function gridIndex(coordinates: Float64Array, value: number) {
  let lo = 0, hi = coordinates.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (coordinates[mid] <= value) lo = mid; else hi = mid; }
  return Math.abs(coordinates[hi] - value) < Math.abs(coordinates[lo] - value) ? hi : lo;
}

function inRing(ring: SourcePointPx[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.y > y !== b.y > y && x < a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y)) inside = !inside;
  }
  return inside;
}

/** Marks the cells whose centres a fill path covers (its subpaths by the even-odd rule). */
function markFill(grid: WallGrid, rings: FillPath) {
  const box = ringBox(rings);
  const i0 = gridIndex(grid.xs, box.left), i1 = gridIndex(grid.xs, box.right), j0 = gridIndex(grid.ys, box.top), j1 = gridIndex(grid.ys, box.bottom);
  for (let j = j0; j < j1; j += 1) {
    const y = (grid.ys[j] + grid.ys[j + 1]) / 2;
    for (let i = i0; i < i1; i += 1) {
      const x = (grid.xs[i] + grid.xs[i + 1]) / 2;
      if (rings.reduce((inside, ring) => inside !== inRing(ring, x, y), false)) grid.fill[j * grid.nx + i] = 1;
    }
  }
}

/** Marks a line's cell sides from grid line `first` to `last` along it. */
function markLine(grid: WallGrid, plumb: boolean, at: number, first: number, last: number) {
  for (let k = first; k < last; k += 1) { if (plumb) grid.plumb[k * (grid.nx + 1) + at] = 1; else grid.level[at * grid.nx + k] = 1; }
}

/**
 * Runs a line's two ends on to a line drawn across its path within `reachPx` (a plot's corner left a pen's width
 * open). Only to a line as it is drawn: two ends that would meet only if both ran on (a symbol's cut corner) stay apart.
 */
function closeCorners(grid: WallGrid, lines: AxisLine[], reachPx: number) {
  const { xs, ys, nx, ny } = grid, drawn = { plumb: grid.plumb.slice(), level: grid.level.slice() };
  // Whether a drawn line of the other direction touches the grid point `k` along the line at grid line `at`.
  const met = (plumb: boolean, at: number, k: number) => (plumb
    ? (at > 0 && drawn.level[k * nx + at - 1] === 1) || (at < nx && drawn.level[k * nx + at] === 1)
    : (at > 0 && drawn.plumb[(at - 1) * (nx + 1) + k] === 1) || (at < ny && drawn.plumb[at * (nx + 1) + k] === 1));
  for (const line of lines) {
    const along = line.plumb ? ys : xs, at = gridIndex(line.plumb ? xs : ys, line.at), first = gridIndex(along, line.from), last = gridIndex(along, line.to);
    for (let k = first - 1; k >= 0 && line.from - along[k] <= reachPx; k -= 1) if (met(line.plumb, at, k)) { markLine(grid, line.plumb, at, k, first); break; }
    for (let k = last + 1; k < along.length && along[k] - line.to <= reachPx; k += 1) if (met(line.plumb, at, k)) { markLine(grid, line.plumb, at, last, k); break; }
  }
}

/**
 * The grid of a page's wall lines and fills. A line stopping within `reachPx` of a line across its path is run on to
 * it; `cuts` are further coordinates the grid is to have (where a door stands between two walls).
 */
export function buildWallGrid(lines: AxisLine[], fills: FillPath[], widthPx: number, heightPx: number, reachPx = 0,
  cuts: { xs: number[]; ys: number[] } = { xs: [], ys: [] }): WallGrid {
  const xValues = [0, widthPx, ...cuts.xs], yValues = [0, heightPx, ...cuts.ys];
  for (const line of lines) {
    (line.plumb ? xValues : yValues).push(line.at);
    (line.plumb ? yValues : xValues).push(line.from, line.to);
  }
  for (const rings of fills) for (const ring of rings) for (const point of ring) { xValues.push(point.x); yValues.push(point.y); }
  const xs = gridCoordinates(xValues), ys = gridCoordinates(yValues), nx = xs.length - 1, ny = ys.length - 1;
  const grid: WallGrid = { xs, ys, nx, ny, plumb: new Uint8Array((nx + 1) * ny), level: new Uint8Array(nx * (ny + 1)), fill: new Uint8Array(nx * ny) };
  for (const line of lines) markLine(grid, line.plumb, gridIndex(line.plumb ? xs : ys, line.at), gridIndex(line.plumb ? ys : xs, line.from), gridIndex(line.plumb ? ys : xs, line.to));
  if (reachPx > 0) closeCorners(grid, lines, reachPx);
  for (const rings of fills) markFill(grid, rings);
  return grid;
}

/** Whether one may step from cell (i, j) to its neighbour without crossing a drawn line (both cells exist). */
export function openBetween(grid: WallGrid, i: number, j: number, di: number, dj: number) {
  if (di === -1) return !grid.plumb[j * (grid.nx + 1) + i];
  if (di === 1) return !grid.plumb[j * (grid.nx + 1) + i + 1];
  if (dj === -1) return !grid.level[j * grid.nx + i];
  return !grid.level[(j + 1) * grid.nx + i];
}

const STEPS = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;

/**
 * Labels the cells for which `member` holds into groups joined through `passable` neighbours (4-way). Returns the
 * label of every cell (-1 outside the set) and the number of groups.
 */
export function labelCells(nx: number, ny: number, member: (index: number) => boolean,
  passable: (i: number, j: number, di: number, dj: number) => boolean) {
  const labels = new Int32Array(nx * ny).fill(-1), stack: number[] = [];
  let count = 0;
  for (let start = 0; start < nx * ny; start += 1) {
    if (labels[start] >= 0 || !member(start)) continue;
    labels[start] = count;
    stack.push(start);
    while (stack.length) {
      const cell = stack.pop()!, i = cell % nx, j = (cell - i) / nx;
      for (const [di, dj] of STEPS) {
        const ni = i + di, nj = j + dj, next = nj * nx + ni;
        if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || labels[next] >= 0 || !member(next) || !passable(i, j, di, dj)) continue;
        labels[next] = count;
        stack.push(next);
      }
    }
    count += 1;
  }
  return { labels, count };
}

/**
 * For every cell of the set, the shorter of the two runs through it (along x and along y) that stay in the set and
 * cross no `blocked` side: how wide the set is at that cell.
 */
export function runThickness(grid: Pick<WallGrid, "xs" | "ys" | "nx" | "ny">, member: (index: number) => boolean,
  joined: (i: number, j: number, di: number, dj: number) => boolean) {
  const { xs, ys, nx, ny } = grid, across = new Float64Array(nx * ny).fill(Infinity), down = new Float64Array(nx * ny).fill(Infinity);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (!member(j * nx + i)) continue;
      let end = i;
      while (end + 1 < nx && member(j * nx + end + 1) && joined(end, j, 1, 0)) end += 1;
      for (let k = i; k <= end; k += 1) across[j * nx + k] = xs[end + 1] - xs[i];
      i = end;
    }
  }
  for (let i = 0; i < nx; i += 1) {
    for (let j = 0; j < ny; j += 1) {
      if (!member(j * nx + i)) continue;
      let end = j;
      while (end + 1 < ny && member((end + 1) * nx + i) && joined(i, end, 0, 1)) end += 1;
      for (let k = j; k <= end; k += 1) down[k * nx + i] = ys[end + 1] - ys[j];
      j = end;
    }
  }
  return across.map((value, index) => Math.min(value, down[index]));
}
