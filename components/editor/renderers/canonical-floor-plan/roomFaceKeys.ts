import type { CanonicalFloorPlanWallRenderModel, CanonicalFloorPlanWallSolid } from "@/lib/floor-plan-render-model";
import type { RoomWallFinishDepths } from "@/lib/room-wall-finish-depths";

/**
 * Keys for roomFaceLimits.ts's caches, by value: an imported room's faces are kept by what they are built from, and a slice's
 * trims and 2D strip by the slice's shape, so a plan rebuilt with new objects but the same values finds them again.
 */

type Wall = CanonicalFloorPlanWallRenderModel;
type Solid = CanonicalFloorPlanWallSolid;
type PlanPoint = { x: number; z: number };
/** Another wall's slice, in plan, which a face stops at where it runs into it (a T-junction's stem poking through, say). */
export type Footprint = { points: PlanPoint[]; bottomMm: number; topMm: number };
const metres = (point: { xMm: number; zMm: number }) => ({ x: point.xMm / 1000, z: point.zMm / 1000 });

/**
 * A cache of what was used lately: this generation's entries and the last one's, each generation up to `size` (as `weigh`
 * counts an entry). One found in the last is carried into this one, so the entries in use stay while a drag's passing ones
 * are let go, and the cache never holds more than two generations.
 */
export function recentCache<V>(size: number, weigh: (value: V) => number = () => 1) {
  let recent = new Map<string, V>(), older = new Map<string, V>(), weight = 0;
  const set = (key: string, value: V) => {
    if (weight + weigh(value) > size && recent.size) [older, recent, weight] = [recent, new Map(), 0];
    recent.set(key, value);
    weight += weigh(value);
  };
  const get = (key: string): V | undefined => {
    const kept = recent.get(key);
    if (kept !== undefined) return kept;
    const old = older.get(key);
    if (old !== undefined) set(key, old);
    return old;
  };
  return { get, set };
}

// Values by number, so a cache key names a wall or a slice by what it is rather than by which object holds it: a plan rebuilt
// after an edit (or for the plan review) has new walls and slices, the same as before wherever the edit didn't reach. The
// dense 100-wall test plan has about 400 values (its walls and their slices). Numbers are never reused, so forgetting a value
// only costs a miss.
const valueIds = recentCache<number>(1024);
let nextValueId = 0;
function valueId(value: string): number {
  let id = valueIds.get(value);
  if (id === undefined) {
    id = nextValueId++;
    valueIds.set(value, id);
  }
  return id;
}
const wallIds = new WeakMap<Wall, number>();
const solidIds = new WeakMap<Solid, number>();

/** A wall by what a room's faces read of it. */
function wallValueId(wall: Wall): number {
  let id = wallIds.get(wall);
  if (id === undefined) {
    const { id: wallId, path, thicknessMm, baseOffsetMm, roomSides, centerlineSegments, solids } = wall;
    id = valueId(JSON.stringify([wallId, path, thicknessMm, baseOffsetMm, roomSides, centerlineSegments, solids.map(solidValueId)]));
    wallIds.set(wall, id);
  }
  return id;
}

/** A slice by its value: two slices with the same number are the same shape. */
export function solidValueId(solid: Solid): number {
  let id = solidIds.get(solid);
  if (id === undefined) {
    id = valueId(JSON.stringify(solid));
    solidIds.set(solid, id);
  }
  return id;
}

/**
 * What a room's faces are built from: its id, edges and outline where it stands, its panel depths, and its own walls and
 * those near them (any slice within a metre and a wall's thickness of its walls' centre lines, more than footprintsNear
 * reads), in the plan's order.
 */
export function facesValueKey(room: { id: string }, edges: readonly string[], vertices: readonly PlanPoint[], depths: RoomWallFinishDepths,
  walls: readonly Wall[]): string {
  const own = new Set(edges);
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (const wall of walls) {
    if (!own.has(wall.id)) continue;
    const reach = wall.thicknessMm / 1000 + 1;
    for (const segment of wall.centerlineSegments) for (const point of [segment.start, segment.end]) {
      const { x, z } = metres(point);
      [minX, maxX, minZ, maxZ] = [Math.min(minX, x - reach), Math.max(maxX, x + reach), Math.min(minZ, z - reach), Math.max(maxZ, z + reach)];
    }
  }
  const box = [minX, maxX, minZ, maxZ];
  const near = new Set(planFootprints(walls).filter(({ points }) => inBox(points, box)).map(({ wallId }) => wallId));
  const read = walls.filter((wall) => own.has(wall.id) || near.has(wall.id));
  return JSON.stringify([room.id, edges, vertices, depths, read.map(wallValueId)]);
}

/**
 * Each wall's slices in plan, in the plan's order, read once per plan (every face of every room looks through them) and
 * shared by the faces that stop at them.
 */
export type PlanFootprint = Footprint & { wallId: string };
const footprintsByWalls = new WeakMap<readonly Wall[], PlanFootprint[]>();
export function planFootprints(walls: readonly Wall[]): PlanFootprint[] {
  let known = footprintsByWalls.get(walls);
  if (!known) {
    known = walls.flatMap((wall) => wall.solids.map((solid) => ({
      wallId: wall.id, bottomMm: solid.bottomMm, topMm: solid.topMm,
      points: [solid.footprint.startLeft, solid.footprint.endLeft, solid.footprint.endRight, solid.footprint.startRight].map(metres),
    })));
    footprintsByWalls.set(walls, known);
  }
  return known;
}
export const inBox = (points: readonly PlanPoint[], [minX, maxX, minZ, maxZ]: readonly number[]) =>
  points.some(({ x, z }) => x >= minX && x <= maxX && z >= minZ && z <= maxZ);
