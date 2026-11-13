import { PDF_OWN_WALL_LIMITS, gridIndex, type Swing, type WallGrid } from "./pdf-own-walls-grid";
import { BAY_GLASS, FILLED, STRIP, floorPieces, stripRegionBoxes, type WallMass } from "./pdf-own-walls-mass";

/**
 * Bay windows (14 Nov 2026). An older HDB bedroom's bay is a platform outside the room's wall, its casement leaves
 * drawn on it, and its frame and sill lines split it into thin strips: read as wall mass it is deeper than any wall
 * (Blk 88's is about 800 mm) and was built as a full-height block standing outside the room. J chose the window at
 * the room's face: the room's own wall line is the window, and the bay (platform, frame, leaves) is left out.
 */
export const PDF_OWN_BAY_LIMITS = {
  /** A casement leaf on a bay is at least this and at most this wide. */
  minLeafMm: 200,
  maxLeafMm: 800,
  /** At least this share of a leaf's box is thin-strip wall mass (none of it solid): the leaf lies on the bay. */
  onBay: 0.8,
  /** Leaves this near one another are one bay; a strip wholly within this of a bay's leaves is its frame. */
  joinMm: 600,
  frameMm: 200,
  /** A room at least this big: the bay is the strips that touch no room's floor. */
  minRoomM2: 0.6,
} as const;

type Box = { left: number; top: number; right: number; bottom: number };

/** The cells of the grid inside a box (page px): [i0, i1) by [j0, j1). */
function cellsIn(grid: WallGrid, box: Box) {
  return { i0: gridIndex(grid.xs, box.left), i1: gridIndex(grid.xs, box.right), j0: gridIndex(grid.ys, box.top), j1: gridIndex(grid.ys, box.bottom) };
}

/** The indices of the cells inside a box (page px). */
function cellIndices(grid: WallGrid, box: Box) {
  const { i0, i1, j0, j1 } = cellsIn(grid, box), out: number[] = [];
  for (let j = j0; j < j1; j += 1) for (let i = i0; i < i1; i += 1) out.push(j * grid.nx + i);
  return out;
}

/** Whether a leaf's box lies on thin-strip wall mass: most of it strip, none of it solid. */
function onMass(grid: WallGrid, mass: WallMass, box: Box) {
  const { i0, i1, j0, j1 } = cellsIn(grid, box);
  let area = 0, strip = 0;
  for (let j = j0; j < j1; j += 1) {
    for (let i = i0; i < i1; i += 1) {
      const size = (grid.xs[i + 1] - grid.xs[i]) * (grid.ys[j + 1] - grid.ys[j]), kind = mass.kind[j * grid.nx + i];
      if (kind === FILLED) return false;
      area += size;
      if (kind === STRIP && mass.closure[j * grid.nx + i] < 0) strip += size;
    }
  }
  return area > 0 && strip >= PDF_OWN_BAY_LIMITS.onBay * area;
}

/** The leaves lying on wall mass, in groups of near ones: each group's boxes. */
function bayLeaves(grid: WallGrid, mass: WallMass, swings: Swing[], millimetresPerPixel: number): Box[][] {
  const px = (mm: number) => mm / millimetresPerPixel, L = PDF_OWN_BAY_LIMITS;
  const boxes = swings.filter((s) => {
    const long = Math.max(s.right - s.left, s.bottom - s.top), leaf = s.hinges.length === 2 ? long / 2 : long;
    return leaf >= px(L.minLeafMm) && leaf <= px(L.maxLeafMm);
  }).filter((s) => onMass(grid, mass, s));
  const near = (a: Box, b: Box) => a.left - px(L.joinMm) <= b.right && b.left - px(L.joinMm) <= a.right && a.top - px(L.joinMm) <= b.bottom && b.top - px(L.joinMm) <= a.bottom;
  const groups: Box[][] = [];
  for (const box of boxes) {
    const joined = groups.filter((group) => group.some((other) => near(box, other)));
    const merged = [box, ...joined.flat()];
    for (const group of joined) groups.splice(groups.indexOf(group), 1);
    groups.push(merged);
  }
  return groups;
}

/** The strip regions that touch a room's floor (the room's own wall lines): never part of a bay. */
function regionsBesideRooms(grid: WallGrid, mass: WallMass, millimetresPerPixel: number) {
  const { labels, area, edge } = floorPieces(grid, mass), minPx2 = (PDF_OWN_BAY_LIMITS.minRoomM2 * 1e6) / millimetresPerPixel ** 2;
  const room = (index: number) => labels[index] >= 0 && !edge[labels[index]] && area[labels[index]] >= minPx2;
  const beside = new Set<number>(), { nx, ny } = grid;
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      const index = j * nx + i;
      if (mass.kind[index] !== STRIP) continue;
      if ((i > 0 && room(index - 1)) || (i + 1 < nx && room(index + 1)) || (j > 0 && room(index - nx)) || (j + 1 < ny && room(index + nx))) beside.add(mass.region[index]);
    }
  }
  return beside;
}

/** Marks BAY_GLASS from the seed cells through their four neighbours that `takes` allows. */
function flood(grid: WallGrid, mass: WallMass, seeds: number[], takes: (index: number, i: number, j: number) => boolean) {
  const { nx, ny } = grid, queue = [...seeds];
  for (const index of queue) mass.glazed[index] = BAY_GLASS;
  while (queue.length) {
    const index = queue.pop()!, i = index % nx, j = Math.floor(index / nx);
    for (const [ci, cj] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
      const next = cj * nx + ci;
      if (ci < 0 || cj < 0 || ci >= nx || cj >= ny || mass.glazed[next] === BAY_GLASS || !takes(next, ci, cj)) continue;
      mass.glazed[next] = BAY_GLASS;
      queue.push(next);
    }
  }
}

const boxAround = (boxes: Box[], margin: number): Box => ({ left: Math.min(...boxes.map((b) => b.left)) - margin, top: Math.min(...boxes.map((b) => b.top)) - margin,
  right: Math.max(...boxes.map((b) => b.right)) + margin, bottom: Math.max(...boxes.map((b) => b.bottom)) + margin });

/**
 * Marks each bay's cells BAY_GLASS: from the leaves lying on wall mass, through neighbouring thin strips that touch no
 * room's floor, within the box round the bay's leaves; a strip lying wholly within `frameMm` of that box (the bay's
 * frame, its sill) is taken whole. Returns how many bays it found.
 */
export function markBays(grid: WallGrid, mass: WallMass, swings: Swing[], millimetresPerPixel: number): number {
  const groups = bayLeaves(grid, mass, swings, millimetresPerPixel);
  if (!groups.length) return 0;
  const besideRooms = regionsBesideRooms(grid, mass, millimetresPerPixel), regions = stripRegionBoxes(grid, mass);
  const bay = (index: number) => mass.kind[index] === STRIP && mass.closure[index] < 0 && !besideRooms.has(mass.region[index]);
  for (const leaves of groups) {
    const core = cellsIn(grid, boxAround(leaves, PDF_OWN_WALL_LIMITS.snapPx)), frame = cellsIn(grid, boxAround(leaves, PDF_OWN_BAY_LIMITS.frameMm / millimetresPerPixel));
    const inCore = (i: number, j: number) => i >= core.i0 && i < core.i1 && j >= core.j0 && j < core.j1;
    const inFrame = (index: number) => {
      const box = regions.get(mass.region[index]);
      return Boolean(box) && box![0] >= frame.i0 && box![1] < frame.i1 && box![2] >= frame.j0 && box![3] < frame.j1;
    };
    const seeds = leaves.flatMap((box) => cellIndices(grid, box).filter(bay));
    flood(grid, mass, seeds, (index, i, j) => bay(index) && (inCore(i, j) || inFrame(index)));
  }
  return groups.length;
}
