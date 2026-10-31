import {
  getPointClearanceInFinishedOutline,
  getPointSquareClearanceInFinishedOutline,
  getSegmentClearanceInFinishedOutline,
  segmentTouchesBox,
  type RoomFinishedOutline,
} from "@/lib/room-finished-faces";

/**
 * The walkway map's floor in an L-shaped, drawn or imported room (lib/circulation-analysis.ts): which grid cells are on it,
 * where each is walked from, and how a walk may go between two neighbours. A rectangle's cells are all its floor and walked
 * from their centres, half a cell from every wall; a shaped room's grid isn't lined up with its walls, so each cell finds a
 * spot of its own as far from them.
 */

export type PlanPoint = { x: number; z: number };

/** The painted rectangle, where it isn't the 0.42 m square at the walk spot: inside the floor and the cell's own square. */
export type WalkPaint = { x: number; z: number; w: number; d: number };

/** Where a floor cell is walked from, its clearance to the walls' faces, and where it's painted when that differs. */
export type WalkSpot = { x: number; z: number; clearance: number; paint?: WalkPaint };

export type ShapedFloor = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  spotAt: (xIndex: number, zIndex: number) => WalkSpot | null;
  /**
   * Whether a walk between two neighbouring floor cells can go by a way that stays half a cell clear of every wall and that
   * `blocked` (the items' walk zones) doesn't stop.
   */
  canWalk: (xIndex: number, zIndex: number, nextX: number, nextZ: number, blocked: (route: readonly PlanPoint[]) => boolean) => boolean;
};

const PAINTED_SIDE = 0.42;

/** Each grid cell's walk over the area, in the order the grid is built, so a table and the grid agree cell for cell. */
export function forEachCell(
  area: { minX: number; maxX: number; minZ: number; maxZ: number }, gridSizeM: number,
  visit: (x: number, z: number, xIndex: number, zIndex: number) => void
) {
  for (let z = area.minZ, zIndex = 0; z <= area.maxZ + 0.001; z += gridSizeM, zIndex += 1) {
    for (let x = area.minX, xIndex = 0; x <= area.maxX + 0.001; x += gridSizeM, xIndex += 1) visit(x, z, xIndex, zIndex);
  }
}

// The spots in a cell tried for its walk spot, a quarter cell apart and inside the cell (the outer ones a millimetre in from
// its edge, so two cells never share one), in rings by their distance from the centre.
const SPOT_RINGS = (() => {
  const steps = [-2, -1, 0, 1, 2].flatMap((dx) => [-2, -1, 0, 1, 2].map((dz) => [dx, dz] as const));
  const rings = new Map<number, (readonly [number, number])[]>();
  for (const step of steps) rings.set(step[0] ** 2 + step[1] ** 2, [...(rings.get(step[0] ** 2 + step[1] ** 2) ?? []), step]);
  return [...rings.entries()].sort(([a], [b]) => a - b).map(([, ring]) => ring);
})();

function spotOffset(step: number, gridSizeM: number): number {
  return Math.sign(step) * Math.min((Math.abs(step) * gridSizeM) / 4, gridSizeM / 2 - 0.001);
}

/** The painted rectangle: the largest square on the spot inside the faces, within the cell's own 0.42 m square. */
function paintFor(outline: RoomFinishedOutline, cell: PlanPoint, spot: PlanPoint, clearance: number): WalkPaint | undefined {
  const half = PAINTED_SIDE / 2;
  const reach = clearance < half * Math.SQRT2 ? Math.min(half, getPointSquareClearanceInFinishedOutline(outline, spot)) : half;
  if (reach === half && spot.x === cell.x && spot.z === cell.z) return undefined;
  const minX = Math.max(spot.x - reach, cell.x - half), maxX = Math.min(spot.x + reach, cell.x + half);
  const minZ = Math.max(spot.z - reach, cell.z - half), maxZ = Math.min(spot.z + reach, cell.z + half);
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, w: Math.max(0, maxX - minX), d: Math.max(0, maxZ - minZ) };
}

/**
 * A cell's walk spot: its centre when that is half a cell clear of every face, as every rectangle's cell is, or else the
 * spot nearest the centre that is, the clearest of those as near (so the choice doesn't lean to one side, and a mirrored
 * cell gets the mirrored spot unless two are exactly as clear), so long as the centre is inside the faces.
 */
function findWalkSpot(outline: RoomFinishedOutline, cell: PlanPoint, gridSizeM: number): WalkSpot | null {
  const clear = gridSizeM / 2 - 0.001;
  if (getPointClearanceInFinishedOutline(outline, cell) === null) return null;
  for (const ring of SPOT_RINGS) {
    let best: { spot: PlanPoint; clearance: number } | null = null;
    for (const [dx, dz] of ring) {
      const spot = { x: cell.x + spotOffset(dx, gridSizeM), z: cell.z + spotOffset(dz, gridSizeM) };
      const clearance = getPointClearanceInFinishedOutline(outline, spot);
      if (clearance !== null && clearance >= clear && (!best || clearance > best.clearance)) best = { spot, clearance };
    }
    if (best) {
      const paint = paintFor(outline, cell, best.spot, best.clearance);
      return { ...best.spot, clearance: best.clearance, ...(paint ? { paint } : {}) };
    }
  }
  return null;
}

/**
 * The ways a walk from one cell's spot to its neighbour's may go: straight; along the plan's axes by either corner (round a
 * passage's mouth); or out sideways by a quarter or half a cell and back (through an opening in a thin wall that the two
 * cells' spots don't line up with).
 */
function getWalkRoutes(from: PlanPoint, to: PlanPoint, alongX: boolean, gridSizeM: number): PlanPoint[][] {
  const routes: PlanPoint[][] = [[from, to], [from, { x: to.x, z: from.z }, to], [from, { x: from.x, z: to.z }, to]];
  for (const shift of [-2, -1, 1, 2].map((step) => (step * gridSizeM) / 4)) {
    routes.push(alongX
      ? [from, { x: from.x, z: from.z + shift }, { x: to.x, z: from.z + shift }, to]
      : [from, { x: from.x + shift, z: from.z }, { x: from.x + shift, z: to.z }, to]);
  }
  return routes;
}

/** Whether a walk along a route runs into an item's walk zone (the item grown by the walker's reach). */
export function routeEntersBoxes(route: readonly PlanPoint[], boxes: readonly { minX: number; maxX: number; minZ: number; maxZ: number }[]) {
  return route.some((point, index) => index > 0 && boxes.some((box) => segmentTouchesBox(route[index - 1], point, box)));
}

// An outline's floor is measured once per grid size, and each walk between neighbours when first asked for: the room's faces
// are kept per drawn outline (lib/room-finished-faces.ts), and placement builds a map for dozens of candidate spots in a room.
const floorsByOutline = new WeakMap<RoomFinishedOutline, Map<number, ShapedFloor>>();

/**
 * A shaped room's floor cells and the walks between them. A cell is walked from its walk spot (findWalkSpot), at least half
 * a cell from every face, as a rectangle's cells are, and items are measured from there; a walk between two neighbouring
 * cells counts where it stays half a cell clear of every face, by one of getWalkRoutes' ways, and (circulation-analysis.ts)
 * clear of every item's walk zone. So a gap under 45 cm clear is never walked through, and a walk past an item needs at least
 * 56.5 cm between it and a wall, as in a rectangle. The grid isn't lined up with a shaped room's faces, so a gap 45 to 56.5
 * cm clear is walked through at some offsets; one along the plan's axes 56.5 cm or more (a passage, or an opening in a thin
 * wall) always is, wherever it falls against the grid, and a 45° corridor 64 cm or more.
 */
export function getShapedFloor(outline: RoomFinishedOutline, gridSizeM: number): ShapedFloor {
  const known = floorsByOutline.get(outline)?.get(gridSizeM);
  if (known) return known;
  const { bounds } = outline;
  const extent = {
    minX: bounds.minX + gridSizeM / 2, maxX: bounds.maxX - gridSizeM / 2,
    minZ: bounds.minZ + gridSizeM / 2, maxZ: bounds.maxZ - gridSizeM / 2,
  };
  const spots: (WalkSpot | null)[][] = [];
  forEachCell(extent, gridSizeM, (x, z, xIndex, zIndex) => { (spots[zIndex] ??= [])[xIndex] = findWalkSpot(outline, { x, z }, gridSizeM); });
  // Each way is tried in turn, its walls only when the items let it by, and kept: the straight one nearly always does.
  const ways = new Map<string, { routes: PlanPoint[][]; clear: (boolean | undefined)[] }>();
  const canWalk: ShapedFloor["canWalk"] = (xIndex, zIndex, nextX, nextZ, blocked) => {
    const from = spots[zIndex]?.[xIndex], to = spots[nextZ]?.[nextX];
    if (!from || !to) return false;
    const key = `${Math.min(xIndex, nextX)}:${Math.min(zIndex, nextZ)}:${nextX !== xIndex ? "x" : "z"}`;
    let known = ways.get(key);
    if (!known) ways.set(key, (known = { routes: getWalkRoutes(from, to, nextX !== xIndex, gridSizeM), clear: [] }));
    const { routes, clear } = known;
    // A straight walk between two spots both far enough from the walls (every point on it is within half its length of one
    // of them) needs no test.
    const need = gridSizeM / 2 - 0.001;
    clear[0] ??= Math.min(from.clearance, to.clearance) - Math.hypot(to.x - from.x, to.z - from.z) / 2 >= need || undefined;
    return routes.some((route, index) => {
      if (blocked(route)) return false;
      clear[index] ??= route.every((point, leg) =>
        leg === 0 || getSegmentClearanceInFinishedOutline(outline, route[leg - 1], point) >= need);
      return clear[index];
    });
  };
  const floor: ShapedFloor = { ...extent, spotAt: (xIndex, zIndex) => spots[zIndex]?.[xIndex] ?? null, canWalk };
  floorsByOutline.set(outline, (floorsByOutline.get(outline) ?? new Map()).set(gridSizeM, floor));
  return floor;
}
