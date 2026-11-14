import type { WallGrid } from "./pdf-own-walls-grid";
import { FREE, floorPieces, stripRegionBoxes, type WallMass } from "./pdf-own-walls-mass";

/**
 * Fittings drawn on the outside face of an outside wall (14 Nov 2026). HDB draws the external clothes-drying rack of a
 * service yard or balcony as a thin box or bar standing just off the wall, with its brackets (J: "a strip with two
 * short cross pieces is a external cloths hanger"; Blk 670's service balcony, Fernvale's service yard). Its lines
 * close thin strips that read as wall mass, so the wall came out thicker along just the rack: a notch in 3D. A thin
 * bump on an outside face, shorter than the wall it stands on, is not wall: it is left out and the wall keeps one
 * thickness.
 */
export const PDF_OWN_RACK_LIMITS = {
  /** A bump at most this deep (Blk 670's rack box is about 50 mm, Fernvale's bar and its gap about 90 mm). */
  maxDepthMm: 100,
  /** and between these long. */
  minLengthMm: 500,
  maxLengthMm: 3500,
} as const;

type CellBox = { i0: number; i1: number; j0: number; j1: number };
type RegionBox = [number, number, number, number];

/** The strip regions no deeper than a bump and no longer than a rack, by their cell boxes. */
function thinRegions(grid: WallGrid, mass: WallMass, millimetresPerPixel: number) {
  const { xs, ys } = grid, boxes = stripRegionBoxes(grid, mass), px = (mm: number) => mm / millimetresPerPixel, thin = new Map<number, RegionBox>();
  for (const [region, box] of boxes) {
    const w = xs[box[1] + 1] - xs[box[0]], h = ys[box[3] + 1] - ys[box[2]];
    if (Math.min(w, h) <= px(PDF_OWN_RACK_LIMITS.maxDepthMm) + 1e-6 && Math.max(w, h) <= px(PDF_OWN_RACK_LIMITS.maxLengthMm)) thin.set(region, box);
  }
  return thin;
}

/** Whether two thin pieces are one bump: they run the same way and together are no deeper than a bump. */
function together(grid: WallGrid, p: RegionBox, q: RegionBox, maxDepthPx: number) {
  const { xs, ys } = grid, level = (b: RegionBox) => xs[b[1] + 1] - xs[b[0]] >= ys[b[3] + 1] - ys[b[2]];
  if (level(p) !== level(q)) return false;
  return level(p) ? ys[Math.max(p[3], q[3]) + 1] - ys[Math.min(p[2], q[2])] <= maxDepthPx : xs[Math.max(p[1], q[1]) + 1] - xs[Math.min(p[0], q[0])] <= maxDepthPx;
}

/** Groups of neighbouring thin strip regions that are one bump, each as its regions and its cell box (inclusive). */
function thinClusters(grid: WallGrid, mass: WallMass, millimetresPerPixel: number) {
  const { nx, ny } = grid, thin = thinRegions(grid, mass, millimetresPerPixel), maxDepthPx = PDF_OWN_RACK_LIMITS.maxDepthMm / millimetresPerPixel + 1e-6;
  const parent = new Map([...thin.keys()].map((region) => [region, region]));
  const find = (r: number): number => { while (parent.get(r) !== r) r = parent.get(r)!; return r; };
  const join = (a: number, next: number) => {
    const b = mass.kind[next] !== FREE ? mass.region[next] : -1;
    if (thin.has(b) && find(a) !== find(b) && together(grid, thin.get(a)!, thin.get(b)!, maxDepthPx)) parent.set(find(a), find(b));
  };
  for (let index = 0; index < nx * ny; index += 1) {
    const a = mass.region[index];
    if (!thin.has(a) || mass.kind[index] === FREE) continue;
    if ((index % nx) + 1 < nx) join(a, index + 1);
    if (index + nx < nx * ny) join(a, index + nx);
  }
  const clusters = new Map<number, { regions: Set<number>; box: CellBox }>();
  for (const [region, [i0, i1, j0, j1]] of thin) {
    const root = find(region), c = clusters.get(root);
    if (!c) clusters.set(root, { regions: new Set([region]), box: { i0, i1, j0, j1 } });
    else { c.regions.add(region); c.box = { i0: Math.min(c.box.i0, i0), i1: Math.max(c.box.i1, i1), j0: Math.min(c.box.j0, j0), j1: Math.max(c.box.j1, j1) }; }
  }
  return [...clusters.values()];
}

/** A cell box seen along its longer side: the range along (u) and across (v), and the cell at (u, v). */
function alongBox(grid: WallGrid, box: CellBox) {
  const { nx, ny, xs, ys } = grid, level = xs[box.i1 + 1] - xs[box.i0] >= ys[box.j1 + 1] - ys[box.j0];
  const [u0, u1, v0, v1] = level ? [box.i0, box.i1, box.j0, box.j1] : [box.j0, box.j1, box.i0, box.i1];
  const along = level ? xs : ys, across = level ? ys : xs, [nu, nv] = level ? [nx, ny] : [ny, nx];
  return { u0, u1, v0, v1, length: along[u1 + 1] - along[u0], depth: across[v1 + 1] - across[v0], inside: u0 >= 1 && v0 >= 1 && u1 + 1 < nu && v1 + 1 < nv,
    at: (u: number, v: number) => (level ? v * nx + u : u * nx + v) };
}

/**
 * Whether a cluster is a bump on an outside face: thin and rack-long; wall all along one long side and past both its
 * ends; open air (floor running off the page) all along the other long side and at both its ends.
 */
function isBump(grid: WallGrid, mass: WallMass, outdoors: (index: number) => boolean, box: CellBox, millimetresPerPixel: number) {
  const px = (mm: number) => mm / millimetresPerPixel, L = PDF_OWN_RACK_LIMITS, { u0, u1, v0, v1, length, depth, inside, at } = alongBox(grid, box);
  if (!inside || depth > px(L.maxDepthMm) + 1e-6 || length < px(L.minLengthMm) || length > px(L.maxLengthMm)) return false;
  const wall = (index: number) => mass.kind[index] !== FREE;
  const row = (v: number, test: (index: number) => boolean, from: number, to: number) => { for (let u = from; u <= to; u += 1) if (!test(at(u, v))) return false; return true; };
  const ends = () => { for (let v = v0; v <= v1; v += 1) if (!outdoors(at(u0 - 1, v)) || !outdoors(at(u1 + 1, v))) return false; return true; };
  const onWall = (wallSide: number, airSide: number) => row(wallSide, wall, u0 - 1, u1 + 1) && row(airSide, outdoors, u0, u1);
  return ends() && (onWall(v0 - 1, v1 + 1) || onWall(v1 + 1, v0 - 1));
}

/** Frees the thin bumps on the outside faces of outside walls. Returns how many it found. */
export function dropWallFittings(grid: WallGrid, mass: WallMass, millimetresPerPixel: number): number {
  const pieces = floorPieces(grid, mass), outdoors = (index: number) => mass.kind[index] === FREE && (pieces.labels[index] < 0 || pieces.edge[pieces.labels[index]] === 1);
  const bumps = thinClusters(grid, mass, millimetresPerPixel).filter((c) => isBump(grid, mass, outdoors, c.box, millimetresPerPixel));
  const regions = new Set(bumps.flatMap((c) => [...c.regions]));
  for (let index = 0; index < mass.kind.length; index += 1) if (mass.kind[index] !== FREE && regions.has(mass.region[index]) && mass.closure[index] < 0) mass.kind[index] = FREE;
  return bumps.length;
}
