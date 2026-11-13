import { PDF_OWN_WALL_LIMITS, gridIndex, runThickness, type WallGrid } from "./pdf-own-walls-grid";
import { isBay, type Closure, type WallMass } from "./pdf-own-walls-mass";
import { isMass, type FaceStretch, type RoomFace } from "./pdf-own-walls-rooms";

/**
 * A room's sides as wall centre-lines (pdf-own-walls-rooms.ts measures them): each stretch of a side lies half its
 * wall's thickness behind the side, and where two stretches of one side differ in thickness a short jog joins their
 * centre-lines. The jog is the thinnest wall, placed half its own thickness inside the thicker piece: the app's wall
 * joins (square corners, lib/floor-plan-wall-square-corners.ts) then carry the thicker wall exactly to where it ends,
 * the thinner one in under it, and the jog across the thicker wall's full thickness - no gap and no fin. Then the
 * wall mass no room's side accounts for, as walls that stand alone. All lengths are page pixels.
 */
export type OwnWallEdge = {
  kind: "wall" | "opening" | "window";
  closure: number;
  thicknessPx: number;
  start: [number, number];
  end: [number, number];
};

/** The import joins corners this close into one (half a page pixel): an edge may come out this far backwards. */
const MIN_EDGE_PX = 0.5;
/** An edge shorter than this is empty. A short edge is kept: dropping it would leave the outline open by its length. */
const EMPTY_PX = 1e-6;

type Line = { plumb: boolean; at: number; kind: FaceStretch["kind"]; closure: number; thicknessPx: number;
  /** Where a stretch meets the next stretch of its side at the same thickness (no jog between them). */
  meetsNextAt?: number;
  /** Direction of travel along the line, for a side's own stretches (+1 or -1); 0 for a jog. */
  travel: number };

/** The centre-lines of one side's stretches, with a jog between two of different thickness. */
function sideLines(grid: WallGrid, face: RoomFace, jogPx: number): Line[] {
  const level = face.di !== 0, sign = face.di + face.dj;
  const along = level ? grid.xs : grid.ys, origin = level ? face.start.i : face.start.j;
  const faceAt = level ? grid.ys[face.start.j] : grid.xs[face.start.i], out = level ? face.nj : face.ni;
  const lines: Line[] = [];
  let previous: FaceStretch | null = null;
  for (const stretch of face.stretches) {
    const current = stretch;
    const boundary = along[origin + sign * current.from];
    if (previous && previous.thicknessPx !== current.thicknessPx) {
      // The jog sits half its thickness inside the thicker of the two stretches; beside an opening, inside the wall,
      // so the opening keeps its whole width.
      const walled = (previous.kind === "opening") !== (current.kind === "opening");
      const intoPrevious = walled ? current.kind === "opening" : previous.thicknessPx > current.thicknessPx;
      lines.push({ plumb: level, at: boundary + ((intoPrevious ? -sign : sign) * jogPx) / 2, kind: "wall", closure: -1, thicknessPx: jogPx, travel: 0 });
    } else if (previous) {
      lines[lines.length - 1].meetsNextAt = boundary;
    }
    lines.push({ plumb: !level, at: faceAt + (out * current.thicknessPx) / 2, kind: current.kind, closure: current.closure, thicknessPx: current.thicknessPx, travel: sign });
    previous = current;
  }
  return lines;
}

/**
 * An opening's edge as every room beside it must have it: exactly the gap, jamb to jamb, along the middle of the two
 * pieces of wall it lies between - the import puts an opening on a wall only where the rooms either side give that
 * wall the same two ends. What the room's own corners add beyond a jamb is a short piece of wall.
 */
function openingEdges(grid: WallGrid, gap: Closure, edge: OwnWallEdge): OwnWallEdge[] {
  const { xs, ys } = grid, level = gap.level;
  const [from, to, at] = level ? [xs[gap.i0], xs[gap.i1], (ys[gap.j0] + ys[gap.j1]) / 2] : [ys[gap.j0], ys[gap.j1], (xs[gap.i0] + xs[gap.i1]) / 2];
  const [a, b, own] = level ? [edge.start[0], edge.end[0], edge.start[1]] : [edge.start[1], edge.end[1], edge.start[0]];
  const [first, last] = b >= a ? [from, to] : [to, from], forward = Math.sign(b - a);
  // A corner inside the gap, or an edge off the gap's middle, is left as the room has it.
  if ((first - a) * forward < -MIN_EDGE_PX || (b - last) * forward < -MIN_EDGE_PX || Math.abs(own - at) > MIN_EDGE_PX) return [edge];
  const point = (along: number): [number, number] => (level ? [along, own] : [own, along]);
  const wall = (start: number, end: number): OwnWallEdge[] => (Math.abs(end - start) < EMPTY_PX ? [] : [{ ...edge, kind: "wall", closure: -1, start: point(start), end: point(end) }]);
  return [...wall(a, first), { ...edge, start: point(first), end: point(last) }, ...wall(last, b)];
}

/**
 * The room's outline along its walls' centre-lines: one edge per stretch and per jog, corner to corner, an opening
 * jamb to jamb. Null where a stretch comes out backwards or empty (a side shorter than the walls beside it are
 * thick): the room is left to the reader's own reading.
 */
export function roomCentreLines(grid: WallGrid, mass: WallMass, faces: RoomFace[], millimetresPerPixel: number): OwnWallEdge[] | null {
  const jogPx = PDF_OWN_WALL_LIMITS.minWallMm / millimetresPerPixel;
  const lines = faces.flatMap((face) => sideLines(grid, face, jogPx));
  const corner = (a: Line, b: Line): [number, number] | null => {
    if (a.plumb !== b.plumb) return a.plumb ? [a.at, b.at] : [b.at, a.at];
    if (a.meetsNextAt === undefined || a.at !== b.at) return null;
    return a.plumb ? [a.at, a.meetsNextAt] : [a.meetsNextAt, a.at];
  };
  const corners = lines.map((line, k) => corner(line, lines[(k + 1) % lines.length]));
  if (corners.some((point) => !point)) return null;
  const edges: OwnWallEdge[] = [];
  for (let k = 0; k < lines.length; k += 1) {
    const line = lines[k], start = corners[(k + lines.length - 1) % lines.length]!, end = corners[k]!;
    const run = line.plumb ? end[1] - start[1] : end[0] - start[0];
    // A stretch that comes out empty joins the walls either side of it at one point (a thin wall centred on a thicker
    // one: the step between their faces is half the difference each side, and their centre-lines are one line).
    if (Math.abs(run) < EMPTY_PX) continue;
    // A step that comes out backwards by no more than two jogs is a door stop's detail at a corner (Tengah): left out.
    if (line.kind === "step" && run * line.travel < 0 && Math.abs(run) <= 2 * jogPx) continue;
    if (line.travel !== 0 && run * line.travel < -MIN_EDGE_PX) return null;
    const edge: OwnWallEdge = { kind: line.kind === "step" ? "wall" : line.kind, closure: line.closure, thicknessPx: line.thicknessPx, start, end };
    edges.push(...(edge.kind === "opening" && mass.closures[edge.closure] ? openingEdges(grid, mass.closures[edge.closure], edge) : [edge]));
  }
  return edges;
}

/** Marks the cells an edge's wall covers as the app draws it: its own thickness, run on half the walls it meets. */
function claimEdge(grid: WallGrid, claimed: Uint8Array, edge: OwnWallEdge, beforePx: number, afterPx: number) {
  const { xs, ys, nx } = grid, half = edge.thicknessPx / 2, level = edge.start[1] === edge.end[1];
  const [a, b] = level ? [edge.start[0], edge.end[0]] : [edge.start[1], edge.end[1]];
  const lo = Math.min(a, b) - (a <= b ? beforePx : afterPx) / 2, hi = Math.max(a, b) + (a <= b ? afterPx : beforePx) / 2;
  const centre = level ? edge.start[1] : edge.start[0];
  const [left, right, top, bottom] = level ? [lo, hi, centre - half, centre + half] : [centre - half, centre + half, lo, hi];
  for (let j = gridIndex(ys, top); j < gridIndex(ys, bottom); j += 1) {
    for (let i = gridIndex(xs, left); i < gridIndex(xs, right); i += 1) claimed[j * nx + i] = 1;
  }
}

/** The wall mass no room's edge covers, in rows: each run of leftover cells the same over a band of rows is a block. */
function leftoverBlocks(grid: WallGrid, leftover: Uint8Array) {
  const { nx, ny } = grid, blocks: { i0: number; i1: number; j0: number; j1: number }[] = [];
  let open = new Map<number, number>();
  for (let j = 0; j <= ny; j += 1) {
    const now = new Map<number, number>();
    for (let i = 0; j < ny && i < nx; i += 1) {
      if (!leftover[j * nx + i]) continue;
      let end = i;
      while (end + 1 < nx && leftover[j * nx + end + 1]) end += 1;
      const key = i * (nx + 1) + end + 1;
      now.set(key, open.get(key) ?? j);
      i = end;
    }
    for (const [key, j0] of open) if (!now.has(key)) blocks.push({ i0: Math.floor(key / (nx + 1)), i1: key % (nx + 1), j0, j1: j });
    open = now;
  }
  return blocks;
}

/** Whether any cell beside a block of cells is a bay's (pdf-own-walls-bays.ts). */
function touchesBay(grid: WallGrid, mass: WallMass, block: { i0: number; i1: number; j0: number; j1: number }) {
  const { nx, ny } = grid, bay = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && isBay(mass, j * nx + i);
  for (let i = block.i0; i < block.i1; i += 1) if (bay(i, block.j0 - 1) || bay(i, block.j1)) return true;
  for (let j = block.j0; j < block.j1; j += 1) if (bay(block.i0 - 1, j) || bay(block.i1, j)) return true;
  return false;
}

/**
 * The walls that stand alone: wall mass that no room's edge covers (a wall inside a room, a parapet, a wall past the
 * last room), each block of it as one wall along its longer side. Slivers thinner than a wall are left out, and
 * short pieces beside a bay.
 */
export function standaloneWalls(grid: WallGrid, mass: WallMass, rooms: OwnWallEdge[][], millimetresPerPixel: number): OwnWallEdge[] {
  const { nx, ny, xs, ys } = grid, claimed = new Uint8Array(nx * ny), minPx = PDF_OWN_WALL_LIMITS.minWallMm / millimetresPerPixel - 1e-6;
  for (const edges of rooms) {
    edges.forEach((edge, k) => {
      // A wall shorter than it is thick is drawn as its own rectangle: it does not run on under the walls it meets.
      const stub = Math.abs(edge.end[0] - edge.start[0]) + Math.abs(edge.end[1] - edge.start[1]) < edge.thicknessPx;
      claimEdge(grid, claimed, edge, stub ? 0 : edges[(k + edges.length - 1) % edges.length].thicknessPx, stub ? 0 : edges[(k + 1) % edges.length].thicknessPx);
    });
  }
  const leftover = new Uint8Array(nx * ny);
  for (let index = 0; index < nx * ny; index += 1) if (isMass(mass, index) && !claimed[index]) leftover[index] = 1;
  const thickness = runThickness(grid, (index) => leftover[index] === 1, () => true);
  for (let index = 0; index < nx * ny; index += 1) if (leftover[index] && thickness[index] < minPx) leftover[index] = 0;
  const maxWallPx = PDF_OWN_WALL_LIMITS.maxWallMm / millimetresPerPixel;
  return leftoverBlocks(grid, leftover).flatMap((block): OwnWallEdge[] => {
    const left = xs[block.i0], right = xs[block.i1], top = ys[block.j0], bottom = ys[block.j1], wide = right - left, tall = bottom - top;
    if (Math.min(wide, tall) < minPx || Math.max(wide, tall) < 2 * minPx) return [];
    // A short piece beside a bay is the end of the bay's frame (Blk 88): left out with the bay.
    if (Math.max(wide, tall) <= maxWallPx && touchesBay(grid, mass, block)) return [];
    return wide >= tall
      ? [{ kind: "wall", closure: -1, thicknessPx: tall, start: [left, (top + bottom) / 2], end: [right, (top + bottom) / 2] }]
      : [{ kind: "wall", closure: -1, thicknessPx: wide, start: [(left + right) / 2, top], end: [(left + right) / 2, bottom] }];
  });
}
