import { PDF_OWN_WALL_LIMITS, gridIndex, type WallGrid } from "./pdf-own-walls-grid";
import { FREE, floorPieces, takeBackOpenings, type Closure, type WallMass } from "./pdf-own-walls-mass";

/**
 * Openings shallower than the walls either side of them (14 Nov 2026). Tengah's entrance door frame stands about
 * 90 mm back from the faces of the walls either side, with a small jamb post at each end: the opening found between
 * the two walls was only the frame's band, the band in front of it stayed floor, and the room's side jogged in and out
 * at the door (its centre-lines came out backwards and the living room was not built). An opening runs through the
 * wall's whole thickness: it is widened across a band beside it, up to `maxMm`, where the walls either side reach.
 */
export const PDF_OWN_SET_BACK_LIMITS = {
  /** An opening is widened by at most this much on each side. */
  maxMm: 150,
  /** A band is open where at least this share of its length across the opening is free floor (the rest: jamb posts). */
  openShare: 0.7,
} as const;

/**
 * One band across an opening: "open" (free floor between walls that reach out either side within `reachPx`),
 * "unwalled" (free floor with no wall beside it: the walls end before it) or "blocked".
 */
function band(grid: WallGrid, mass: WallMass, gap: Closure, v: number, reachPx: number): "open" | "unwalled" | "blocked" {
  const { nx, ny, xs, ys } = grid, [along, count, rows] = gap.level ? [xs, nx, ny] : [ys, ny, nx];
  const [u0, u1] = gap.level ? [gap.i0, gap.i1] : [gap.j0, gap.j1];
  if (v < 0 || v >= rows) return "blocked";
  const at = (u: number) => (gap.level ? v * nx + u : u * nx + v), wall = (u: number) => mass.kind[at(u)] !== FREE && mass.closure[at(u)] < 0;
  let free = 0;
  for (let u = u0; u < u1; u += 1) if (mass.kind[at(u)] === FREE && mass.closure[at(u)] < 0) free += along[u + 1] - along[u];
  if (free < PDF_OWN_SET_BACK_LIMITS.openShare * (along[u1] - along[u0])) return "blocked";
  const reaches = (from: number, step: number, edge: number) => {
    for (let u = from; u >= 0 && u < count && Math.abs(along[step < 0 ? u + 1 : u] - edge) <= reachPx; u += step) if (wall(u)) return true;
    return false;
  };
  const before = reaches(u0 - 1, -1, along[u0]), after = reaches(u1, 1, along[u1]);
  return before && after ? "open" : !before && !after ? "unwalled" : "blocked";
}

/**
 * How far an opening reaches on one side (`step` -1: before its first band, +1: after its last): across the open
 * bands up to `maxPx`, kept only where both walls either side end there (their faces) and the room begins, and the
 * bands are no thinner than the least jog (Fernvale's bath doors' 13 mm): walls that run on, or anything in the way,
 * leave the opening as it is (Fernvale's entrance opens into a corridor; Blk 670's balcony door).
 */
function reach(grid: WallGrid, mass: WallMass, gap: Closure, step: -1 | 1, limits: { maxPx: number; minPx: number }) {
  const across = gap.level ? grid.ys : grid.xs, edge = step < 0 ? (gap.level ? gap.j0 : gap.i0) : (gap.level ? gap.j1 : gap.i1);
  const next = (v: number) => (step < 0 ? v - 1 : v), depth = (v: number) => Math.abs(across[v] - across[edge]);
  let v = edge;
  while (depth(v + step) <= limits.maxPx + 1e-6 && band(grid, mass, gap, next(v), limits.maxPx) === "open") v += step;
  return band(grid, mass, gap, next(v), limits.maxPx) === "unwalled" && depth(v) >= limits.minPx ? v : edge;
}

/** Widens each opening across the open bands beside it where the walls either side reach on. Returns how many it widened. */
export function widenSetBackOpenings(grid: WallGrid, mass: WallMass, millimetresPerPixel: number): number {
  const limits = { maxPx: PDF_OWN_SET_BACK_LIMITS.maxMm / millimetresPerPixel, minPx: PDF_OWN_WALL_LIMITS.minWallMm / millimetresPerPixel };
  let widened = 0;
  mass.closures.forEach((gap, k) => {
    const a = reach(grid, mass, gap, -1, limits), b = reach(grid, mass, gap, 1, limits), [v0, v1] = gap.level ? [gap.j0, gap.j1] : [gap.i0, gap.i1];
    if (a === v0 && b === v1) return;
    if (gap.level) { gap.j0 = a; gap.j1 = b; } else { gap.i0 = a; gap.i1 = b; }
    gap.depthPx = (gap.level ? grid.ys : grid.xs)[b] - (gap.level ? grid.ys : grid.xs)[a];
    for (let j = gap.j0; j < gap.j1; j += 1) for (let i = gap.i0; i < gap.i1; i += 1) mass.closure[j * grid.nx + i] = k;
    widened += 1;
  });
  return widened;
}

/** For each enclosed piece of floor, how much of its edge is an opening and how much in all (page pixels). */
function edgeShares(grid: WallGrid, mass: WallMass, labels: Int32Array, count: number) {
  const { nx, ny, xs, ys } = grid, opening = new Float64Array(count), all = new Float64Array(count);
  for (let index = 0; index < nx * ny; index += 1) {
    const label = labels[index], i = index % nx, j = (index - i) / nx;
    if (label < 0) continue;
    for (const [di, dj] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ni = i + di, nj = j + dj, next = nj * nx + ni;
      if (ni < 0 || nj < 0 || ni >= nx || nj >= ny || labels[next] === label) continue;
      const side = di ? ys[j + 1] - ys[j] : xs[i + 1] - xs[i];
      all[label] += side;
      if (mass.closure[next] >= 0) opening[label] += side;
    }
  }
  return { opening, all };
}

/**
 * Takes back the openings with no door drawn that close off a piece of floor whose edge is at least half openings:
 * a stretch of corridor between doors, not a room (Tengah: the passage between bedroom 2's, the main bedroom's and
 * bath 2's doors was closed across the corridor). Returns those taken back.
 */
export function dropCorridorOpenings(grid: WallGrid, mass: WallMass, undrawn: (gap: Closure) => boolean): Closure[] {
  const { labels, area, edge } = floorPieces(grid, mass), { opening, all } = edgeShares(grid, mass, labels, area.length);
  const corridor = (label: number) => label >= 0 && !edge[label] && opening[label] >= 0.5 * all[label];
  const { nx, ny } = grid, cut = new Set<number>();
  mass.closure.forEach((closure, index) => {
    if (closure < 0 || cut.has(closure) || !undrawn(mass.closures[closure])) return;
    const i = index % nx, j = (index - i) / nx;
    const beside = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([ci, cj]) => ci >= 0 && cj >= 0 && ci < nx && cj < ny);
    if (beside.some(([ci, cj]) => corridor(labels[cj * nx + ci]))) cut.add(closure);
  });
  return cut.size ? takeBackOpenings(mass, cut) : [];
}

/** The grid cell a page point lies in (gridIndex gives the nearest grid line). */
function cellAt(grid: WallGrid, x: number, y: number) {
  const i = gridIndex(grid.xs, x), j = gridIndex(grid.ys, y);
  return (j - (grid.ys[j] > y ? 1 : 0)) * grid.nx + (i - (grid.xs[i] > x ? 1 : 0));
}

/**
 * A door drawn shut (one line across an opening, J 14 Nov 2026) stands between two named spaces: a WC and its yard,
 * a kitchen and its dining. A line across a shower or a bath (its screen) cuts off a piece of floor that holds no
 * name: such an opening is taken back.
 */
export function dropUnnamedShutDoors(grid: WallGrid, mass: WallMass, shut: (gap: Closure) => boolean, names: { x: number; y: number }[]): Closure[] {
  const { labels } = floorPieces(grid, mass), named = new Set<number>();
  for (const { x, y } of names) {
    const index = cellAt(grid, x, y);
    if (index >= 0 && index < labels.length && labels[index] >= 0) named.add(labels[index]);
  }
  const { nx, ny } = grid, cut = new Set<number>();
  mass.closure.forEach((closure, index) => {
    if (closure < 0 || cut.has(closure) || !shut(mass.closures[closure])) return;
    const i = index % nx, j = (index - i) / nx;
    const beside = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([ci, cj]) => ci >= 0 && cj >= 0 && ci < nx && cj < ny)
      .map(([ci, cj]) => labels[cj * nx + ci]).filter((label) => label >= 0);
    if (beside.some((label) => !named.has(label))) cut.add(closure);
  });
  return cut.size ? takeBackOpenings(mass, cut) : [];
}
