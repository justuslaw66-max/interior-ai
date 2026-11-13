import { PDF_OWN_WALL_LIMITS, type WallGrid } from "./pdf-own-walls-grid";
import { FILLED, FREE, floorPieces, isBarrier, type WallMass } from "./pdf-own-walls-mass";

/**
 * The rooms of a vector PDF page, from its wall mass and openings (pdf-own-walls-mass.ts): each room is the free floor
 * the mass and the openings enclose, and each of its sides is measured through the wall behind it - how thick the wall
 * is there, whether an opening or a window stands in it. All lengths are page pixels.
 */
export const PDF_OWN_ROOM_LIMITS = {
  /** Enclosed floor smaller than this is a duct or a box, not a room. */
  minRoomM2: 0.6,
  /** A stretch of wall shorter than this takes the thickness of the wall beside it (a door frame, a reveal). */
  shortStretchMm: 100,
  /** A stretch thicker than the wall on both sides of it is another wall meeting this one from behind (a door's jamb,
   * the end of a wall) where it is no longer than this, or shorter than twice what it stands out; it is left to that wall. */
  stubMm: 150,
  /** A stretch of several thin layers of which at most this share is solid, at least this long, is a window: glass
   * over a sill is about a quarter solid, a solid wall behind its outer skin about half. */
  windowMinMm: 400,
  windowLayers: 3,
  windowSolidShare: 0.35,
  /** A wall whose thickness is unknown (solid further back than any wall is thick) is drawn this thick. */
  defaultWallMm: 200,
} as const;

export type GridPoint = { i: number; j: number };

/** One stretch of a room's side: the wall (or opening, or window) behind it and how thick it is. */
export type FaceStretch = {
  /** "step": the end of a thicker piece of wall (drawn as the thinnest wall, just inside that piece). */
  kind: "wall" | "opening" | "window" | "step";
  closure: number;
  thicknessPx: number;
  /** Where it runs along the side, as grid-line indices in the side's direction of travel. */
  from: number;
  to: number;
};

export type RoomFace = {
  start: GridPoint;
  end: GridPoint;
  /** Direction of travel (the room on the inside of a clockwise outline, y down) and the way out of the room. */
  di: number; dj: number; ni: number; nj: number;
  stretches: FaceStretch[];
};

/** The free floor in groups: each enclosed group big enough to be a room, by its cell label. */
export function roomCells(grid: WallGrid, mass: WallMass, millimetresPerPixel: number) {
  const { labels, area, edge } = floorPieces(grid, mass);
  const minPx2 = (PDF_OWN_ROOM_LIMITS.minRoomM2 * 1e6) / (millimetresPerPixel * millimetresPerPixel);
  const rooms = Array.from(area, (_, label) => label).filter((label) => !edge[label] && area[label] >= minPx2);
  // The cells of any room's floor: what lies behind a wall with one of them beyond it is another room, not outdoors.
  const isRoom = new Uint8Array(area.length), indoors = new Uint8Array(labels.length);
  for (const label of rooms) isRoom[label] = 1;
  for (let index = 0; index < labels.length; index += 1) if (labels[index] >= 0 && isRoom[labels[index]]) indoors[index] = 1;
  return { labels, rooms, area, indoors };
}

/**
 * The room's floor with the walls that stand inside it: a run of wall (or opening) no thicker than a wall with this
 * room on both sides is a wall within the room - a stub, a screen, a column's side - not part of its outline.
 */
export function roomFloor(grid: WallGrid, mass: WallMass, labels: Int32Array, room: number, maxWallPx: number) {
  const { nx, ny, xs, ys } = grid, floor = new Uint8Array(nx * ny);
  for (let index = 0; index < nx * ny; index += 1) if (labels[index] === room) floor[index] = 1;
  const sweep = (level: boolean) => {
    const [nu, nv] = level ? [nx, ny] : [ny, nx], along = level ? xs : ys;
    const at = (u: number, v: number) => (level ? v * nx + u : u * nx + v);
    let changed = false;
    for (let v = 0; v < nv; v += 1) {
      for (let u = 1; u < nu; u += 1) {
        if (!floor[at(u - 1, v)] || floor[at(u, v)] || !isBarrier(mass, at(u, v))) continue;
        let end = u;
        while (end + 1 < nu && !floor[at(end + 1, v)] && isBarrier(mass, at(end + 1, v))) end += 1;
        if (end + 1 < nu && floor[at(end + 1, v)] && along[end + 1] - along[u] <= maxWallPx) {
          for (let k = u; k <= end; k += 1) floor[at(k, v)] = 1;
          changed = true;
        }
        u = end;
      }
    }
    return changed;
  };
  for (let pass = 0; pass < 4 && (sweep(true) || sweep(false)); pass += 1);
  return floor;
}

/** The outline of a set of cells as grid points, clockwise (y down), straight runs joined: its largest loop. */
export function floorOutline(grid: WallGrid, floor: Uint8Array): GridPoint[] {
  const { nx, ny, xs, ys } = grid, width = nx + 1;
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < nx && j < ny && floor[j * nx + i] === 1;
  const next = new Map<number, number[]>();
  const add = (i0: number, j0: number, i1: number, j1: number) => {
    const key = j0 * width + i0, list = next.get(key);
    if (list) list.push(j1 * width + i1); else next.set(key, [j1 * width + i1]);
  };
  for (let j = 0; j < ny; j += 1) {
    for (let i = 0; i < nx; i += 1) {
      if (!inside(i, j)) continue;
      if (!inside(i, j - 1)) add(i, j, i + 1, j);
      if (!inside(i + 1, j)) add(i + 1, j, i + 1, j + 1);
      if (!inside(i, j + 1)) add(i + 1, j + 1, i, j + 1);
      if (!inside(i - 1, j)) add(i, j + 1, i, j);
    }
  }
  let best: GridPoint[] = [], bestArea = 0;
  for (const start of [...next.keys()]) {
    const loop: GridPoint[] = [];
    let at = start;
    while (next.get(at)?.length) {
      loop.push({ i: at % width, j: Math.floor(at / width) });
      at = next.get(at)!.pop()!;
      if (at === start) break;
    }
    let area = 0;
    loop.forEach((p, k) => { const q = loop[(k + 1) % loop.length]; area += xs[p.i] * ys[q.j] - xs[q.i] * ys[p.j]; });
    if (Math.abs(area) > bestArea) { bestArea = Math.abs(area); best = loop; }
  }
  return best.filter((p, k) => {
    const a = best[(k + best.length - 1) % best.length], b = best[(k + 1) % best.length];
    return (p.i - a.i) * (b.j - p.j) !== (p.j - a.j) * (b.i - p.i);
  });
}

type Probe = { closure: number; depthPx: number; window: boolean };

type Floors = { /** This room's floor. */ own: Uint8Array; /** Every room's floor. */ indoors: Uint8Array };

/**
 * What stands behind one cell-width of a room's side: an opening or wall, how deep, and whether it is a window (thin
 * layers, little of them solid, or a casement drawn on the wall; with no room behind: between two rooms such layers are a wall or a door's own lines).
 */
function probe(grid: WallGrid, mass: WallMass, { own: floor, indoors }: Floors, i: number, j: number, ni: number, nj: number, maxWallPx: number): Probe {
  const { nx, ny, xs, ys } = grid, closure = mass.closure[j * nx + i], through = closure >= 0;
  const inGrid = () => i >= 0 && j >= 0 && i < nx && j < ny;
  // The probe stops at this room's floor, at anything that is no barrier, and where wall gives way to an opening.
  const stops = (index: number) => floor[index] === 1 || !isBarrier(mass, index) || (mass.closure[index] >= 0) !== through;
  let depth = 0, solid = 0, glass = 0, layers = 0, unit = -3;
  for (; inGrid() && !stops(j * nx + i); i += ni, j += nj) {
    const index = j * nx + i, filled = mass.kind[index] === FILLED, here = filled ? -2 : mass.region[index];
    const size = ni ? xs[i + 1] - xs[i] : ys[j + 1] - ys[j];
    depth += size;
    if (filled) solid += size;
    glass += mass.glazed[index] * size;
    if (here !== unit) { layers += 1; unit = here; }
    if (depth > maxWallPx + 1e-6) return { closure, depthPx: Infinity, window: false };
  }
  const outdoors = !inGrid() || indoors[j * nx + i] !== 1;
  // A window: a casement drawn on this piece of wall, or thin layers with little solid among them.
  const layered = layers >= PDF_OWN_ROOM_LIMITS.windowLayers && solid <= PDF_OWN_ROOM_LIMITS.windowSolidShare * depth;
  return { closure, depthPx: depth, window: !through && outdoors && ((glass > 0 && glass >= depth - 1e-6) || layered) };
}

/** The stretches of one side as probed, cell by cell, equal neighbours joined. */
function probedStretches(grid: WallGrid, mass: WallMass, floors: Floors, face: Omit<RoomFace, "stretches">, maxWallPx: number): FaceStretch[] {
  const { start, end, di, dj, ni, nj } = face, stretches: FaceStretch[] = [];
  const steps = Math.abs(end.i - start.i) + Math.abs(end.j - start.j);
  for (let step = 0; step < steps; step += 1) {
    // The cell just outside the room beside this cell-width of the side (see floorOutline's directions).
    const gi = start.i + di * step + (di < 0 ? -1 : 0), gj = start.j + dj * step + (dj < 0 ? -1 : 0);
    const ci = di !== 0 ? gi : (ni > 0 ? start.i : start.i - 1), cj = dj !== 0 ? gj : (nj > 0 ? start.j : start.j - 1);
    const found = probe(grid, mass, floors, ci, cj, ni, nj, maxWallPx);
    const kind = found.closure >= 0 ? "opening" : found.window ? "window" : "wall";
    const last = stretches[stretches.length - 1];
    if (last && last.kind === kind && last.closure === found.closure && (last.thicknessPx === found.depthPx || Math.abs(last.thicknessPx - found.depthPx) < 0.03)) last.to = step + 1;
    else stretches.push({ kind, closure: found.closure, thicknessPx: found.depthPx, from: step, to: step + 1 });
  }
  return stretches;
}

/** Length of a stretch along its side, in page pixels. */
function stretchLength(grid: WallGrid, face: Omit<RoomFace, "stretches">, stretch: Pick<FaceStretch, "from" | "to">) {
  const line = face.di !== 0 ? grid.xs : grid.ys, origin = face.di !== 0 ? face.start.i : face.start.j, sign = face.di + face.dj;
  return Math.abs(line[origin + sign * stretch.to] - line[origin + sign * stretch.from]);
}

/**
 * Joins neighbouring stretches of one kind whose thicknesses are so near that the jog between them would be too short
 * to keep: nearest pair first, the pair taking the longer one's thickness. The order is the same whichever way round
 * the side is walked, so the rooms either side of a wall settle it alike.
 */
function joinedStretches(stretches: FaceStretch[], length: (s: FaceStretch) => number, nearPx: number) {
  const joined = stretches.map((s) => ({ ...s }));
  for (;;) {
    let best = -1, gap = nearPx;
    for (let k = 0; k + 1 < joined.length; k += 1) {
      const a = joined[k], b = joined[k + 1], near = Math.abs(a.thicknessPx - b.thicknessPx);
      if (a.kind === b.kind && a.closure === b.closure && near < gap) { best = k; gap = near; }
    }
    if (best < 0) return joined;
    const a = joined[best], b = joined[best + 1];
    const keep = length(a) > length(b) || (length(a) === length(b) && a.thicknessPx >= b.thicknessPx) ? a : b;
    joined.splice(best, 2, { ...a, thicknessPx: keep.thicknessPx, to: b.to });
  }
}

/** Gives every stretch of wall of nearly one thickness beside another stretch that one's thickness: an opening's, else the longer one's. */
function evenedStretches(stretches: FaceStretch[], length: (s: FaceStretch) => number, nearPx: number) {
  // Openings first (their depth is fixed), then the longest: what is settled first gives its thickness to what is beside it.
  const fixed = (s: FaceStretch) => Number(s.kind === "opening");
  const order = stretches.map((_, k) => k).sort((p, q) => fixed(stretches[q]) - fixed(stretches[p]) || length(stretches[q]) - length(stretches[p]) || stretches[q].thicknessPx - stretches[p].thicknessPx);
  const settled = new Set<number>();
  for (const k of order) {
    settled.add(k);
    for (const n of [k - 1, k + 1]) {
      const other = stretches[n];
      // An opening keeps the depth of its gap: the rooms either side must see it alike.
      if (!other || settled.has(n) || other.kind === "step" || other.kind === "opening" || stretches[k].kind === "step") continue;
      if (Math.abs(other.thicknessPx - stretches[k].thicknessPx) < nearPx) other.thicknessPx = stretches[k].thicknessPx;
    }
  }
  return stretches;
}

/**
 * Settles a side's stretches. A short window is wall. A short stretch thicker than the wall on both sides of it is
 * another wall meeting this one from behind, and takes the thickness beside it. A stretch at the side's end, at an
 * inside corner of the room, with solid further back than any wall is thick is the end of a thicker piece of the wall
 * round the corner (a step). Any other stretch whose depth is unknown, and a short stretch of wall, takes the
 * thickness of the longest known stretch beside it (else of the
 * side's longest). A side with nothing known is a step where it is no longer than a wall is thick, else a wall of
 * the default thickness.
 */
function settledStretches(grid: WallGrid, face: Omit<RoomFace, "stretches">, raw: FaceStretch[], millimetresPerPixel: number, insideCorner: [boolean, boolean]): FaceStretch[] {
  const px = (mm: number) => mm / millimetresPerPixel, length = (s: FaceStretch) => stretchLength(grid, face, s);
  const maxWallPx = px(PDF_OWN_WALL_LIMITS.maxWallMm) + 1e-6, jogPx = px(PDF_OWN_WALL_LIMITS.minWallMm);
  const stretches = raw.map((s) => (s.kind === "window" && length(s) < px(PDF_OWN_ROOM_LIMITS.windowMinMm) ? { ...s, kind: "wall" as const } : { ...s }));
  stretches.forEach((s, k) => {
    const before = stretches[k - 1], after = stretches[k + 1];
    if (s.kind !== "wall" || !before || !after || ![s, before, after].every((n) => Number.isFinite(n.thicknessPx))) return;
    const beside = Math.max(before.thicknessPx, after.thicknessPx), out = s.thicknessPx - beside;
    if (out >= jogPx - 1e-6 && (length(s) <= px(PDF_OWN_ROOM_LIMITS.stubMm) || length(s) < 2 * out)) s.thicknessPx = beside;
  });
  const known = (s: FaceStretch) => s.kind !== "step" && Number.isFinite(s.thicknessPx) && (s.kind !== "wall" || length(s) >= px(PDF_OWN_ROOM_LIMITS.shortStretchMm));
  const longest = stretches.filter(known).sort((a, b) => length(b) - length(a))[0];
  if (!longest) {
    const whole = { ...stretches[0], to: stretches[stretches.length - 1].to }, step = length(whole) <= maxWallPx;
    return [{ kind: step ? "step" : "wall", closure: -1, thicknessPx: step ? jogPx : px(PDF_OWN_ROOM_LIMITS.defaultWallMm), from: whole.from, to: whole.to }];
  }
  // Only at an inside corner of the room: at an outside corner the solid behind the side's end is the wall round the
  // corner itself, seen along its length.
  [stretches[0], stretches[stretches.length - 1]].forEach((end, k) => {
    if (insideCorner[k] && end.kind === "wall" && !Number.isFinite(end.thicknessPx) && length(end) <= maxWallPx) { end.kind = "step"; end.thicknessPx = jogPx; }
  });
  stretches.forEach((s, k) => {
    if (known(s) || s.kind === "step" || (s.kind === "opening" && Number.isFinite(s.thicknessPx))) return;
    const beside = [stretches[k - 1], stretches[k + 1]].filter((n): n is FaceStretch => Boolean(n) && known(n)).sort((a, b) => length(b) - length(a))[0];
    s.thicknessPx = Math.min((beside ?? longest).thicknessPx, Number.isFinite(s.thicknessPx) && s.kind !== "wall" ? s.thicknessPx : Infinity);
  });
  // Two thicknesses under two jog-lengths apart would need a jog shorter than the import keeps.
  return evenedStretches(joinedStretches(stretches, length, px(18)), length, px(18));
}

/** A room's sides, in order round its outline, each with the wall behind it measured. */
export function roomFaces(grid: WallGrid, mass: WallMass, floors: Floors, outline: GridPoint[], millimetresPerPixel: number): RoomFace[] {
  const maxWallPx = PDF_OWN_WALL_LIMITS.maxWallMm / millimetresPerPixel;
  const travel = outline.map((start, k) => { const end = outline[(k + 1) % outline.length]; return { di: Math.sign(end.i - start.i), dj: Math.sign(end.j - start.j) }; });
  // The outline runs clockwise (y down): a right turn is an inside corner of the room.
  const inside = (a: { di: number; dj: number }, b: { di: number; dj: number }) => a.di * b.dj - a.dj * b.di > 0;
  return outline.map((start, k) => {
    const end = outline[(k + 1) % outline.length], { di, dj } = travel[k], before = travel[(k + outline.length - 1) % outline.length], after = travel[(k + 1) % outline.length];
    const face = { start, end, di, dj, ni: dj, nj: -di };
    return { ...face, stretches: settledStretches(grid, face, probedStretches(grid, mass, floors, face, maxWallPx), millimetresPerPixel, [inside(before, travel[k]), inside(travel[k], after)]) };
  });
}

/** Whether a cell is wall mass no room's side has claimed: kept for the walls that stand alone. */
export const isMass = (mass: WallMass, index: number) => mass.kind[index] !== FREE && mass.closure[index] < 0;
