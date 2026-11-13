import { PDF_OWN_WALL_LIMITS, gridIndex, type Swing, type WallGrid } from "./pdf-own-walls-grid";
import { FILLED, FREE, floorPieces, type Closure, type WallMass } from "./pdf-own-walls-mass";

/**
 * Doors and casement windows drawn inside a wall's own lines (pdf-own-walls.ts). Many plans do not break the wall at
 * a door: the wall's two lines run on, two short lines across them mark the jambs, and the leaf's swing (or a folding
 * door's two slanted leaves) hangs from that piece. Such a piece is wall mass like the wall beside it, so no gap is
 * found there. Here each swing no gap has used, and each pair of slanted leaves, is matched to the piece of wall it
 * hangs on: not solid, as wide as the leaf (or the pair of leaves), with a line across the wall at both its ends.
 */
const LEAF_SIGNS = {
  /** A door is between these wide (a pair of leaves up to `pairMaxMm`); one leaf of a pair may be as narrow as `halfMinMm`. A swing's box is about square
   * (its shorter side this share of its longer). */
  minMm: 600, maxMm: 1250, pairMaxMm: 1900, halfMinMm: 200, square: 0.7,
  /** The piece's ends lie this near the hinge and the leaf's tip, as a share of the leaf's width. */
  reach: 0.15,
  /** At most this share of the piece is solid: a door's own lines, not the wall carried through. */
  solidShare: 0.2,
  /** Folding leaves are two slanted strokes from one point, each at least this long, their far ends on the wall. */
  foldMinMm: 250,
  /** A pair of leaves is a casement where neither is under this share of the two together, neither is wider than a
   * window's leaf, and one side is outdoors (two door-wide leaves are a double door, outdoors or not). */
  evenShare: 0.35, casementLeafMaxMm: 800,
} as const;

export type WallLeaf = {
  /** The piece of wall the leaf hangs on, as an opening's cells. */
  part: Closure;
  kind: "swing" | "folding" | "casement";
  /** The swings used (indices into the drawing's swings). */
  swings: number[];
};

type Point = { x: number; y: number };
type Slant = { start: Point; end: Point };
/** A leaf (or pair) as drawn: the wall's direction, the line the hinges stand on, the span along it, the side it opens to. */
type Hung = { level: boolean; at: number; from: number; to: number; side: number; kind: WallLeaf["kind"]; swings: number[] };

const solid = (mass: WallMass, index: number) => mass.kind[index] !== FREE && mass.closure[index] < 0;

/** Cells along a wall (u) and across it (v), whichever way the wall runs. */
type Lattice = { along: Float64Array; across: Float64Array; rows: number; cell(u: number, v: number): number; crossed(u: number, v: number): boolean };

const latticeOf = (grid: WallGrid, level: boolean): Lattice => (level
  ? { along: grid.xs, across: grid.ys, rows: grid.ny, cell: (u, v) => v * grid.nx + u, crossed: (u, v) => grid.plumb[v * (grid.nx + 1) + u] === 1 }
  : { along: grid.ys, across: grid.xs, rows: grid.nx, cell: (u, v) => u * grid.nx + v, crossed: (u, v) => grid.level[u * grid.nx + v] === 1 });

/** The rows of wall at the hinge line over the leaf's whole width: [v0, v1), or null where no wall stands there. */
function wallRows(lattice: Lattice, mass: WallMass, hung: Hung, u0: number, u1: number, reach: number): [number, number] | null {
  const row = (v: number) => {
    if (v < 0 || v >= lattice.rows) return false;
    for (let u = u0; u < u1; u += 1) if (!solid(mass, lattice.cell(u, v))) return false;
    return true;
  };
  // The first row of wall behind the hinge line (away from the swing) within reach of it, else the row on the
  // swing's side of the line.
  const line = gridIndex(lattice.across, hung.at), back = hung.side > 0 ? -1 : 1, behind = hung.side > 0 ? line - 1 : line;
  if (Math.abs(lattice.across[line] - hung.at) > reach) return null;
  const near = (v: number) => v >= 0 && v < lattice.rows && Math.abs(lattice.across[back < 0 ? v + 1 : v] - hung.at) <= reach;
  let start = behind;
  while (near(start) && !row(start)) start += back;
  if (!near(start)) start = behind - back;
  if (!row(start)) return null;
  let v0 = start, v1 = start + 1;
  while (row(v0 - 1)) v0 -= 1;
  while (row(v1)) v1 += 1;
  return [v0, v1];
}

/** Whether a piece of wall is a door's own: a line across the wall at both its ends and next to nothing solid in it. */
function doorPiece(lattice: Lattice, mass: WallMass, u0: number, u1: number, v0: number, v1: number) {
  let area = 0, filled = 0;
  for (let v = v0; v < v1; v += 1) {
    if (!lattice.crossed(u0, v) || !lattice.crossed(u1, v)) return false;
    for (let u = u0; u < u1; u += 1) {
      const size = (lattice.along[u + 1] - lattice.along[u]) * (lattice.across[v + 1] - lattice.across[v]);
      area += size;
      if (mass.kind[lattice.cell(u, v)] === FILLED) filled += size;
    }
  }
  return filled <= LEAF_SIGNS.solidShare * area;
}

/**
 * Folding leaves stand folded on part of their door's width: the door's piece of wall runs from the folded leaves
 * out to the first line across the wall on either side. Null where the wall stops first.
 */
function foldSpan(lattice: Lattice, mass: WallMass, hung: Hung, reach: number): { u0: number; u1: number; rows: [number, number] } | null {
  const { along } = lattice, middle = (hung.from + hung.to) / 2, nearest = gridIndex(along, middle), um = along[nearest] > middle ? nearest - 1 : nearest;
  const rows = um < 0 || um >= along.length - 1 ? null : wallRows(lattice, mass, hung, um, um + 1, reach);
  if (!rows) return null;
  const [v0, v1] = rows, span = (u: number) => Array.from({ length: v1 - v0 }, (_, k) => v0 + k).every((v) => lattice.crossed(u, v));
  const wall = (u: number) => u >= 0 && u < along.length - 1 && Array.from({ length: v1 - v0 }, (_, k) => v0 + k).every((v) => solid(mass, lattice.cell(u, v)));
  let u0 = um, u1 = um + 1;
  while (!span(u0) && wall(u0 - 1)) u0 -= 1;
  while (!span(u1) && wall(u1)) u1 += 1;
  return along[u0] <= hung.from + reach && along[u1] >= hung.to - reach ? { u0, u1, rows } : null;
}

/**
 * A swing's piece of wall runs from its hinge to the tip of its shut leaf (for a pair, hinge to hinge): at each end,
 * the line across the wall nearest it (a door frame's own line can stand a little short of the wall's faces).
 */
function swingSpan(lattice: Lattice, mass: WallMass, hung: Hung, reach: number): { u0: number; u1: number; rows: [number, number] } | null {
  const { along } = lattice, s0 = gridIndex(along, hung.from), s1 = gridIndex(along, hung.to);
  if (s1 <= s0 || Math.abs(along[s0] - hung.from) > reach || Math.abs(along[s1] - hung.to) > reach) return null;
  const rows = wallRows(lattice, mass, hung, s0, s1, reach);
  if (!rows) return null;
  const crossed = (u: number) => Array.from({ length: rows[1] - rows[0] }, (_, k) => rows[0] + k).every((v) => lattice.crossed(u, v));
  const jamb = (snapped: number, end: number) => {
    let best = -1;
    for (let u = snapped; u >= 0 && Math.abs(along[u] - end) <= reach; u -= 1) if (crossed(u)) { best = u; break; }
    for (let u = snapped + 1; u < along.length && Math.abs(along[u] - end) <= reach; u += 1) {
      if (crossed(u)) { if (best < 0 || Math.abs(along[u] - end) < Math.abs(along[best] - end)) best = u; break; }
    }
    return best;
  };
  const u0 = jamb(s0, hung.from), u1 = jamb(s1, hung.to);
  return u0 >= 0 && u1 > u0 ? { u0, u1, rows } : null;
}

/** The piece of wall a hung leaf stands on: its cells, or null where there is no such piece of wall there. */
function wallPiece(grid: WallGrid, mass: WallMass, hung: Hung, millimetresPerPixel: number): Closure | null {
  const lattice = latticeOf(grid, hung.level), { along, across } = lattice, px = (mm: number) => mm / millimetresPerPixel;
  const reach = LEAF_SIGNS.reach * (hung.to - hung.from);
  const found = hung.kind === "folding" ? foldSpan(lattice, mass, hung, reach) : swingSpan(lattice, mass, hung, reach);
  if (!found) return null;
  const { u0, u1, rows: [v0, v1] } = found, depth = across[v1] - across[v0], width = along[u1] - along[u0];
  const sized = depth >= px(PDF_OWN_WALL_LIMITS.minWallMm) - 1e-6 && depth <= px(PDF_OWN_WALL_LIMITS.maxWallMm) + 1e-6 && width >= px(LEAF_SIGNS.minMm) && width <= px(hung.swings.length > 1 ? LEAF_SIGNS.pairMaxMm : LEAF_SIGNS.maxMm);
  if (!sized || !doorPiece(lattice, mass, u0, u1, v0, v1)) return null;
  return { ...(hung.level ? { i0: u0, i1: u1, j0: v0, j1: v1 } : { i0: v0, i1: v1, j0: u0, j1: u1 }), level: hung.level,
    lengthPx: along[u1] - along[u0], depthPx: depth, endToEnd: false, staggered: false };
}

type Leaf = { index: number; level: boolean; at: number; hinge: number; tip: number; side: number; width: number };

/** Each unused swing as a leaf on a level wall and as one on a plumb wall: hinge, tip of the shut leaf, opening side. */
function leaves(swings: Swing[], used: Set<number>, millimetresPerPixel: number): Leaf[] {
  return swings.flatMap((swing, index) => {
    const w = swing.right - swing.left, h = swing.bottom - swing.top, width = Math.max(w, h), mm = width * millimetresPerPixel;
    if (used.has(index) || Math.min(w, h) < LEAF_SIGNS.square * width || mm < LEAF_SIGNS.halfMinMm || mm > LEAF_SIGNS.maxMm) return [];
    return swing.hinges.flatMap(([x, y]) => {
      const dx = x === swing.left ? 1 : -1, dy = y === swing.top ? 1 : -1;
      return [{ index, level: true, at: y, hinge: x, tip: x + dx * w, side: dy, width: w }, { index, level: false, at: x, hinge: y, tip: y + dy * h, side: dx, width: h }];
    });
  });
}

/** The swings as hung leaves: each alone, and each with a second leaf hinged where its own tip shuts (a pair). */
function hungSwings(swings: Swing[], used: Set<number>, millimetresPerPixel: number): Hung[] {
  const all = leaves(swings, used, millimetresPerPixel), hung: Hung[] = [];
  for (const a of all) {
    for (const b of all) {
      const meets = b.index !== a.index && b.level === a.level && b.side === a.side && Math.sign(b.tip - b.hinge) === -Math.sign(a.tip - a.hinge);
      const near = LEAF_SIGNS.reach * (a.width + b.width);
      if (!meets || a.hinge > b.hinge || Math.abs(a.at - b.at) > near || Math.abs(a.tip - b.tip) > near) continue;
      const even = Math.min(a.width, b.width) >= LEAF_SIGNS.evenShare * (a.width + b.width) && Math.max(a.width, b.width) * millimetresPerPixel <= LEAF_SIGNS.casementLeafMaxMm;
      hung.push({ level: a.level, at: (a.at + b.at) / 2, from: a.hinge, to: b.hinge, side: a.side, kind: even ? "casement" : "swing", swings: [a.index, b.index] });
    }
    hung.push({ level: a.level, at: a.at, from: Math.min(a.hinge, a.tip), to: Math.max(a.hinge, a.tip), side: a.side, kind: "swing", swings: [a.index] });
  }
  return hung;
}

/** Folding doors: two slanted strokes from one point whose far ends lie on one level or plumb line, a door's width apart. */
function hungFolds(slants: Slant[], millimetresPerPixel: number): Hung[] {
  const px = (mm: number) => mm / millimetresPerPixel, long = slants.filter(({ start, end }) => Math.hypot(end.x - start.x, end.y - start.y) >= px(LEAF_SIGNS.foldMinMm));
  const byPoint = new Map<string, { far: Point; near: Point }[]>();
  for (const { start, end } of long) {
    for (const [near, far] of [[start, end], [end, start]]) {
      const key = `${Math.round(near.x)}:${Math.round(near.y)}`, list = byPoint.get(key);
      if (list) list.push({ near, far }); else byPoint.set(key, [{ near, far }]);
    }
  }
  // Two far ends on one level or plumb line, a door's width apart, with the shared point to one side of that line.
  const fold = (a: Point, b: Point, apex: Point): Hung[] => [true, false].flatMap((level): Hung[] => {
    const [a0, a1, at0, at1, tip] = level ? [a.x, b.x, a.y, b.y, apex.y] : [a.y, b.y, a.x, b.x, apex.x], width = Math.abs(a1 - a0);
    if (width < px(LEAF_SIGNS.halfMinMm) || width > px(LEAF_SIGNS.maxMm) || Math.abs(at1 - at0) > LEAF_SIGNS.reach * width) return [];
    return [{ level, at: (at0 + at1) / 2, from: Math.min(a0, a1), to: Math.max(a0, a1), side: Math.sign(tip - at0), kind: "folding", swings: [] }];
  });
  return [...byPoint.values()].flatMap((list) => list.flatMap((first, p) => list.slice(p + 1).flatMap((second) => fold(first.far, second.far, first.near))));
}

/** Whether the floor on either side of a piece of wall runs off the page: the piece stands in an outside wall. */
function outside(grid: WallGrid, pieces: ReturnType<typeof floorPieces>, part: Closure) {
  const { nx, ny } = grid, i = (part.i0 + part.i1 - 1) >> 1, j = (part.j0 + part.j1 - 1) >> 1;
  const beside = part.level ? [[i, part.j0 - 1], [i, part.j1]] : [[part.i0 - 1, j], [part.i1, j]];
  return beside.some(([ci, cj]) => {
    const label = ci < 0 || cj < 0 || ci >= nx || cj >= ny ? -1 : pieces.labels[cj * nx + ci];
    return label < 0 || pieces.edge[label] === 1;
  });
}

/**
 * The doors and casements drawn inside the wall mass: pairs of leaves before single ones (a pair's leaf alone would
 * fit half its piece), each swing and each piece of wall used once. An even pair in an outside wall is a casement
 * window; an even pair between two rooms, a door and a half, a single leaf and folding leaves are doors.
 */
export function wallLeaves(grid: WallGrid, mass: WallMass, drawing: { swings: Swing[]; diagonals: Slant[] }, millimetresPerPixel: number, used: Set<number>): WallLeaf[] {
  const hung = [...hungSwings(drawing.swings, used, millimetresPerPixel), ...hungFolds(drawing.diagonals, millimetresPerPixel)]
    .sort((a, b) => b.swings.length - a.swings.length);
  const pieces = floorPieces(grid, mass), taken = new Set<number>(), claimed = new Set<number>(), found: WallLeaf[] = [];
  for (const leaf of hung) {
    if (leaf.swings.some((index) => claimed.has(index))) continue;
    const part = wallPiece(grid, mass, leaf, millimetresPerPixel);
    if (!part) continue;
    const cells: number[] = [];
    for (let j = part.j0; j < part.j1; j += 1) for (let i = part.i0; i < part.i1; i += 1) cells.push(j * grid.nx + i);
    if (cells.some((index) => taken.has(index))) continue;
    for (const index of cells) taken.add(index);
    for (const index of leaf.swings) claimed.add(index);
    found.push({ part, kind: leaf.kind === "casement" && !outside(grid, pieces, part) ? "swing" : leaf.kind, swings: leaf.swings });
  }
  return found;
}
