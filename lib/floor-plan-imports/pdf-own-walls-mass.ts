import { PDF_OWN_WALL_LIMITS, gridIndex, labelCells, openBetween, runThickness, type WallGrid } from "./pdf-own-walls-grid";

/**
 * A vector PDF page's wall mass, on the grid of its own lines (pdf-own-walls-grid.ts): the cells inside a fill (HDB
 * draws structural walls and columns solid black) and the cells of every closed strip between two lines (its other
 * walls, its windows, the outer skin of an external wall). Then the door-sized gaps between two pieces of that mass:
 * the openings that close a room.
 */
export const PDF_OWN_OPENING_LIMITS = {
  /** A gap between two pieces of wall narrower than this is no way through: it is closed as wall. */
  slotMm: 300,
  /** A gap between two wall ends up to this wide is a doorway even with nothing drawn in it. */
  doorwayMm: 1300,
  /** An opening has floor along at least this share of each of its two sides (else it is a recess in a wall). */
  floorShare: 0.5,
  /** A wider gap, up to this, is an opening only with a door drawn in it (a swing, sliding panels, the reader's own). */
  maxOpeningMm: 3600,
  /** A piece of wall mass whose longer side is under this is a symbol's detail, not a wall. */
  minMassMm: 400,
} as const;

/** A cell's kind: free; solid (inside a fill, or inked over by the lines either side of it); or a closed strip. */
export const FREE = 0, FILLED = 1, STRIP = 2;

export type WallMass = {
  /** FREE, FILLED or STRIP per cell. */
  kind: Uint8Array;
  /** The closed region of the drawing each free-or-strip cell lies in (-1 for a filled cell). */
  region: Int32Array;
  /** Index into `closures` of the opening a cell lies in, else -1. */
  closure: Int32Array;
  closures: Closure[];
};

export type Closure = {
  /** Cell ranges [i0, i1) by [j0, j1). */
  i0: number; i1: number; j0: number; j1: number;
  /** The gap runs along x (the wall it stands in is level). */
  level: boolean;
  /** The gap between the two pieces of wall, and how deep the pieces face each other, in page pixels. */
  lengthPx: number;
  depthPx: number;
  /** Both pieces end at the gap (a gap in one straight wall), rather than one of them running past it. */
  endToEnd: boolean;
  /** One piece stops at one side of the gap and the other at the other side: two walls that stop short of each
   * other (a gap in one straight wall is this too). */
  staggered: boolean;
};

/** What is drawn at a gap: a door at a gap no deeper than a wall; in a deeper gap, the band across it a door stands in. */
export type GapSigns = {
  drawn(gap: Closure): boolean;
  deep(gap: Closure): { from: number; to: number; keep(part: Closure): void } | null;
};

type Box = { left: number; top: number; right: number; bottom: number };

/** The closed strips: bounded regions of the drawing nearly all of which is no wider than a wall. */
function stripRegions(grid: WallGrid, maxStripPx: number) {
  const { nx, ny, xs, ys } = grid;
  const free = (index: number) => !grid.fill[index];
  const passable = (i: number, j: number, di: number, dj: number) => openBetween(grid, i, j, di, dj);
  const { labels, count } = labelCells(nx, ny, free, passable);
  const thickness = runThickness(grid, free, passable);
  const area = new Float64Array(count), thin = new Float64Array(count), border = new Uint8Array(count);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const label = labels[j * nx + i];
      if (label < 0) continue;
      const cell = (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      area[label] += cell;
      if (thickness[j * nx + i] <= maxStripPx) thin[label] += cell;
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) border[label] = 1;
    }
  }
  const strip = Array.from({ length: count }, (_, label) => !border[label] && thin[label] >= PDF_OWN_WALL_LIMITS.thinShare * area[label]);
  return { labels, strip, thickness };
}

/** Drops mass thinner than a wall, and pieces of mass too small to be one or outside the plan's area. */
function pruneMass(grid: WallGrid, kind: Uint8Array, millimetresPerPixel: number, planArea: Box | null) {
  const { nx, ny, xs, ys } = grid, px = (mm: number) => mm / millimetresPerPixel;
  const solid = (index: number) => kind[index] !== FREE, always = () => true;
  const thickness = runThickness(grid, solid, always);
  for (let index = 0; index < nx * ny; index += 1) if (solid(index) && thickness[index] < px(PDF_OWN_WALL_LIMITS.minWallMm) - 1e-6) kind[index] = FREE;
  const { labels, count } = labelCells(nx, ny, solid, always);
  const box = Array.from({ length: count }, () => ({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }));
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const b = box[labels[j * nx + i]];
      if (!b) continue;
      b.left = Math.min(b.left, xs[i]); b.right = Math.max(b.right, xs[i + 1]); b.top = Math.min(b.top, ys[j]); b.bottom = Math.max(b.bottom, ys[j + 1]);
    }
  }
  const keep = box.map((b) => Math.max(b.right - b.left, b.bottom - b.top) >= px(PDF_OWN_OPENING_LIMITS.minMassMm)
    && (!planArea || (b.right > planArea.left && b.left < planArea.right && b.bottom > planArea.top && b.top < planArea.bottom)));
  for (let index = 0; index < nx * ny; index += 1) if (labels[index] >= 0 && !keep[labels[index]]) kind[index] = FREE;
}

/**
 * A strip is wider than a wall only at its corners, each no bigger than the strip is wide. A wider part bigger than
 * that both ways is a bay the strip runs into with no line between them (a duct, a recess): it is not wall.
 */
function clearBays(grid: WallGrid, kind: Uint8Array, thickness: Float64Array, maxStripPx: number) {
  const { nx, ny, xs, ys } = grid, wide = (index: number) => kind[index] === STRIP && thickness[index] > maxStripPx + 1e-6;
  const { labels, count } = labelCells(nx, ny, wide, (i, j, di, dj) => openBetween(grid, i, j, di, dj));
  const box = Array.from({ length: count }, () => ({ left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity }));
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const b = box[labels[j * nx + i]];
      if (!b) continue;
      b.left = Math.min(b.left, xs[i]); b.right = Math.max(b.right, xs[i + 1]); b.top = Math.min(b.top, ys[j]); b.bottom = Math.max(b.bottom, ys[j + 1]);
    }
  }
  const bay = box.map((b) => b.right - b.left > maxStripPx + 1e-6 && b.bottom - b.top > maxStripPx + 1e-6);
  for (let index = 0; index < nx * ny; index += 1) if (labels[index] >= 0 && bay[labels[index]]) kind[index] = FREE;
}

/**
 * The page's wall mass: its fills and its closed strips, without slivers and stray pieces. A strip no wider than the
 * pen that drew its two lines is inked solid (some plots black a wall in with lines drawn side by side, not a fill).
 */
export function wallMass(grid: WallGrid, millimetresPerPixel: number, planArea: Box | null, penPx: number): WallMass {
  const { labels, strip, thickness } = stripRegions(grid, PDF_OWN_WALL_LIMITS.maxStripMm / millimetresPerPixel);
  const kind = new Uint8Array(grid.nx * grid.ny), inked = penPx + PDF_OWN_WALL_LIMITS.snapPx;
  for (let index = 0; index < kind.length; index += 1) kind[index] = grid.fill[index] ? FILLED : !strip[labels[index]] ? FREE : thickness[index] <= inked ? FILLED : STRIP;
  clearBays(grid, kind, thickness, PDF_OWN_WALL_LIMITS.maxStripMm / millimetresPerPixel);
  pruneMass(grid, kind, millimetresPerPixel, planArea);
  return { kind, region: labels, closure: new Int32Array(kind.length).fill(-1), closures: [] };
}

type Gap = Closure;

/**
 * The gaps along one axis: runs of free cells with mass at both ends, the same over a band of rows (or columns). A
 * piece of wall stops at one side of the band where, beside the band there, nothing solid stands within a wall's
 * thickness of the gap (a step in the wall's face is not its end).
 */
function gapsAlong(grid: WallGrid, kind: Uint8Array, level: boolean, maxWallPx: number): Gap[] {
  const { nx, ny, xs, ys } = grid, [nu, nv] = level ? [nx, ny] : [ny, nx];
  const solid = (u: number, v: number) => u >= 0 && v >= 0 && u < nu && v < nv && kind[level ? v * nx + u : u * nx + v] !== FREE;
  const along = level ? xs : ys, across = level ? ys : xs;
  const gaps: Gap[] = [];
  let open = new Map<number, number>();
  const close = (key: number, v0: number, v1: number) => {
    const a = Math.floor(key / (nu + 1)), b = key % (nu + 1);
    // Whether each piece (the cell before the gap, the cell after) stops at the band's low side and at its high side.
    const stops = (u: number, step: number, v: number) => {
      for (let k = u, edge = along[step < 0 ? u + 1 : u]; k >= 0 && k < nu && Math.abs(along[step < 0 ? k : k + 1] - edge) <= maxWallPx + 1e-6; k += step) if (solid(k, v)) return false;
      return true;
    };
    const aLow = stops(a - 1, -1, v0 - 1), aHigh = stops(a - 1, -1, v1), bLow = stops(b, 1, v0 - 1), bHigh = stops(b, 1, v1);
    gaps.push({ i0: level ? a : v0, i1: level ? b : v1, j0: level ? v0 : a, j1: level ? v1 : b, level,
      lengthPx: along[b] - along[a], depthPx: across[v1] - across[v0], endToEnd: aLow && aHigh && bLow && bHigh, staggered: (aLow && bHigh) || (aHigh && bLow) });
  };
  for (let v = 0; v <= nv; v += 1) {
    const now = new Map<number, number>();
    for (let u = 0, last = -1; v < nv && u < nu; u += 1) {
      if (!solid(u, v)) continue;
      if (last >= 0 && u - last > 1) { const key = (last + 1) * (nu + 1) + u; now.set(key, open.get(key) ?? v); }
      last = u;
    }
    for (const [key, v0] of open) if (!now.has(key)) close(key, v0, v);
    open = now;
  }
  return gaps;
}

const gapCells = (gap: Closure, nx: number) => {
  const out: number[] = [];
  for (let j = gap.j0; j < gap.j1; j += 1) for (let i = gap.i0; i < gap.i1; i += 1) out.push(j * nx + i);
  return out;
};

/** Whether floor lies along both sides of the gap (a gap with wall along one side is a recess, not a way through). */
function floorBothSides(grid: WallGrid, mass: WallMass, gap: Closure) {
  const { nx, ny, xs, ys } = grid, along = gap.level ? xs : ys, [u0, u1, v0, v1] = gap.level ? [gap.i0, gap.i1, gap.j0, gap.j1] : [gap.j0, gap.j1, gap.i0, gap.i1];
  const share = (v: number) => {
    if (v < 0 || v >= (gap.level ? ny : nx)) return 0;
    let free = 0;
    for (let u = u0; u < u1; u += 1) if (!isBarrier(mass, gap.level ? v * nx + u : u * nx + v)) free += along[u + 1] - along[u];
    return free / gap.lengthPx;
  };
  return share(v0 - 1) >= PDF_OWN_OPENING_LIMITS.floorShare && share(v1) >= PDF_OWN_OPENING_LIMITS.floorShare;
}

/** The part of a deep gap that lies in a band across it, or the grid coordinates that band still needs. */
function bandOf(grid: WallGrid, gap: Closure, band: { from: number; to: number }): { part: Closure } | { cuts: number[] } {
  const across = gap.level ? grid.ys : grid.xs, v0 = gridIndex(across, band.from), v1 = gridIndex(across, band.to);
  const missing = [[v0, band.from], [v1, band.to]].filter(([v, value]) => Math.abs(across[v] - value) > PDF_OWN_WALL_LIMITS.snapPx).map(([, value]) => value);
  if (missing.length || v1 <= v0) return { cuts: missing };
  return { part: { ...gap, ...(gap.level ? { j0: v0, j1: v1 } : { i0: v0, i1: v1 }), depthPx: across[v1] - across[v0], endToEnd: false, staggered: false } };
}

/** In a deep gap, the band a door is drawn in; `cuts` takes the grid coordinates that band still needs. */
function deepDoor(grid: WallGrid, gap: Closure, signs: GapSigns, cuts: { xs: number[]; ys: number[] }): { part: Closure; keep(): void } | null {
  const band = signs.deep(gap), found = band && bandOf(grid, gap, band);
  if (!band || !found) return null;
  if ("part" in found) return { part: found.part, keep: () => band.keep(found.part) };
  (gap.level ? cuts.ys : cuts.xs).push(...found.cuts);
  return null;
}

/**
 * Finds the gaps between pieces of wall and closes them: a slot too narrow to pass becomes wall; a door-sized gap
 * becomes an opening where two walls stop short of each other (up to a doorway's width) or a door is drawn there (up
 * to the widest opening). Where the two pieces face each other deeper than a wall is thick, only the band a door is
 * drawn in is the opening. Smaller gaps first; a gap crossing one already closed is left, and so is a recess. Returns
 * the grid coordinates such bands still need: with any, the grid is to be built again with them and this run again.
 */
export function closeGaps(grid: WallGrid, mass: WallMass, millimetresPerPixel: number, signs: GapSigns): { xs: number[]; ys: number[] } {
  const { nx } = grid, px = (mm: number) => mm / millimetresPerPixel, cuts = { xs: [] as number[], ys: [] as number[] };
  const maxDepth = px(PDF_OWN_WALL_LIMITS.maxWallMm) + 1e-6, minDepth = px(PDF_OWN_WALL_LIMITS.minWallMm) - 1e-6;
  const gaps = [...gapsAlong(grid, mass.kind, true, maxDepth), ...gapsAlong(grid, mass.kind, false, maxDepth)]
    .filter((gap) => gap.depthPx >= minDepth && gap.lengthPx <= px(PDF_OWN_OPENING_LIMITS.maxOpeningMm))
    .sort((a, b) => a.lengthPx - b.lengthPx);
  const taken = (index: number) => mass.kind[index] !== FREE || mass.closure[index] >= 0;
  const doorway = (gap: Closure) => gap.staggered && gap.lengthPx <= px(PDF_OWN_OPENING_LIMITS.doorwayMm);
  for (const gap of gaps) {
    const inside = gapCells(gap, nx), deep = gap.depthPx > maxDepth, slot = gap.lengthPx < px(PDF_OWN_OPENING_LIMITS.slotMm);
    if (inside.some(taken) || (deep && slot)) continue;
    if (slot) { for (const index of inside) mass.kind[index] = FILLED; continue; }
    const found = deep ? deepDoor(grid, gap, signs, cuts) : { part: gap, keep: () => undefined };
    if (!found || !floorBothSides(grid, mass, found.part)) continue;
    // What is drawn is asked before the bare doorway test: a door found is kept for the gap and its swing used up.
    if (!deep && !signs.drawn(gap) && !doorway(gap)) continue;
    for (const index of gapCells(found.part, nx)) mass.closure[index] = mass.closures.length;
    mass.closures.push(found.part);
    found.keep();
  }
  return cuts;
}

/** The pieces of floor the wall mass and the openings leave: each cell's piece, each piece's area, and whether it runs off the page. */
export function floorPieces(grid: WallGrid, mass: WallMass) {
  const { nx, ny, xs, ys } = grid;
  const { labels, count } = labelCells(nx, ny, (index) => !isBarrier(mass, index), () => true);
  const area = new Float64Array(count), edge = new Uint8Array(count);
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const label = labels[j * nx + i];
      if (label < 0) continue;
      area[label] += (xs[i + 1] - xs[i]) * (ys[j + 1] - ys[j]);
      if (i === 0 || j === 0 || i === nx - 1 || j === ny - 1) edge[label] = 1;
    }
  }
  return { labels, area, edge };
}

/**
 * Takes back the openings that only cut a pocket off a room: the floor either side of an opening is a room's or the
 * outside's, never an enclosed piece smaller than a room (`minRoomPx2`, in square page pixels).
 */
export function dropPocketOpenings(grid: WallGrid, mass: WallMass, minRoomPx2: number) {
  const { nx, ny } = grid, beside = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (;;) {
    const { labels, area, edge } = floorPieces(grid, mass), cut = new Set<number>();
    const pocket = (i: number, j: number) => {
      const label = i < 0 || j < 0 || i >= nx || j >= ny ? -1 : labels[j * nx + i];
      return label >= 0 && !edge[label] && area[label] < minRoomPx2;
    };
    mass.closure.forEach((closure, index) => {
      const i = index % nx, j = (index - i) / nx;
      if (closure >= 0 && beside.some(([di, dj]) => pocket(i + di, j + dj))) cut.add(closure);
    });
    if (!cut.size) return;
    const kept = mass.closures.map((_, index) => index).filter((index) => !cut.has(index)), renumbered = new Map(kept.map((index, k) => [index, k]));
    mass.closures = kept.map((index) => mass.closures[index]);
    mass.closure.forEach((closure, index) => { if (closure >= 0) mass.closure[index] = renumbered.get(closure) ?? -1; });
  }
}

/** A cell that stops a room: wall mass or an opening. */
export const isBarrier = (mass: WallMass, index: number) => mass.kind[index] !== FREE || mass.closure[index] >= 0;
