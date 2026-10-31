import { getFurnitureWallInset } from "@/lib/design-page-geometry";
import { ROOM_DIMENSION_DEFAULTS, type HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import {
  clampToRoomInsideFinishes,
  getBuiltInWallInset,
  getRoomPlanOutlinePoints,
} from "@/lib/room-finished-outline";
import {
  buildBuiltInRegion,
  isFootprintClearOfFaces,
  isFootprintInBuiltInRegion,
  type BuiltInNeighbourWalls,
  type BuiltInRegion,
} from "@/lib/room-built-in-region";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";

/**
 * Where a built-in cabinet may stand in a drawn room: in its finished region (lib/room-built-in-region.ts), inside its outline
 * and outside its walls and panels as the 3D view draws them, its back allowed against a face (J, 29 Oct 2026: "Face,
 * back flush"). Furniture's rule still holds wherever the region would refuse more. A room from an imported plan keeps
 * furniture's rule for now (its walls each have their own thickness, which its room doesn't carry), as does a room with no
 * exposed face (its walls fill it) or no wall thickness.
 */

type Point = RoomPlanPolygonPoint;

export type BuiltInRoomFaces = BuiltInRegion & {
  faceIds: string[];
  /** How far each wall's face stands in from its outline edge: half the wall, and its panel (or a thicker wall next door's). */
  insets: number[];
  /** The exposed faces end to end, in outline order: what Snap to wall measures from. */
  polygon: Point[];
  /** True when the room keeps furniture's rule for built-ins (no exposed face, or no wall thickness). */
  furnitureRule: boolean;
};

/** How far a built-in may reach into a face and still count as against it, in metres; the clamp keeps most of it in hand. */
export const BUILT_IN_CONTACT_TOLERANCE = 0.0005;

/** True for a room from an imported plan: only the import sets its exact floor elevation. */
export function isImportedPlanRoom(room: { floorElevationMm?: number }): boolean {
  return typeof room.floorElevationMm === "number";
}

/** The plan's rooms by id, as the 3D view draws them (the house plan's rooms, each where it stands). */
export type BuiltInPlanRooms = ReadonlyMap<string, HousePlanRoom2D>;

const NO_NEIGHBOURS: BuiltInNeighbourWalls = [];

/**
 * The walls the 3D view draws around a room, besides its own: those of the plan's other rooms on its floor (the same level and
 * floor elevation, which the 3D view joins its walls with), each at its own thickness, room-local.
 */
export function getBuiltInNeighbourWalls(roomId: string, planRooms?: BuiltInPlanRooms): BuiltInNeighbourWalls {
  const own = planRooms?.get(roomId);
  if (!own) return NO_NEIGHBOURS;
  return getBuiltInNeighbourRooms(roomId, planRooms)
    .map((other) => ({
      outline: getRoomPlanOutlinePoints({ shape: other.shape, polygon: other.polygon, w: other.w, d: other.d })
        .map((point) => ({ x: point.x + other.x - own.x, z: point.z + other.z - own.z })),
      // As the 3D view draws it (buildLegacyWallBandsForTest).
      thickness: Math.max(0.01, other.wallThickness ?? ROOM_DIMENSION_DEFAULTS.wallThickness),
    }));
}

/** The plan's other rooms on a room's floor (the same level and floor elevation, which the 3D view joins its walls with). */
export function getBuiltInNeighbourRooms(roomId: string, planRooms?: BuiltInPlanRooms): HousePlanRoom2D[] {
  const own = planRooms?.get(roomId);
  if (!planRooms || !own) return [];
  const level = (room: HousePlanRoom2D) => (typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel) ? room.floorLevel : 1);
  return [...planRooms.values()]
    .filter((other) => other.id !== roomId && level(other) === level(own) && other.floorElevationMm === own.floorElevationMm);
}

function isSameNeighbours(a: BuiltInNeighbourWalls, b: BuiltInNeighbourWalls): boolean {
  return a === b || (a.length === b.length && a.every((walls, index) => walls.thickness === b[index].thickness &&
    walls.outline.length === b[index].outline.length &&
    walls.outline.every((point, at) => point.x === b[index].outline[at].x && point.z === b[index].outline[at].z)));
}

function buildRoomBuiltInFaces(room: RoomSnapshot, size: { w: number; d: number }, neighbours: BuiltInNeighbourWalls): BuiltInRoomFaces {
  const shape = room.planShape ?? "rectangle";
  const outline = getRoomPlanOutlinePoints({ shape, polygon: room.planPolygon, w: size.w, d: size.d });
  const faceIds = getRoomWallFaceIds({ shape, polygon: room.planPolygon });
  const depths = getRoomWallFinishDepths(room);
  const thickness = 2 * getBuiltInWallInset(room.geometry.wallThickness);
  const panels = faceIds.map((faceId) => depths[faceId] ?? 0);
  const region = buildBuiltInRegion(outline, faceIds, panels, thickness, room.planHoles ?? [], neighbours);
  const insets = panels.map((panel, index) => region.exposed[index]?.inset ?? thickness / 2 + panel);
  const polygon: Point[] = [];
  const exposed = region.exposed.filter((face) => face !== null);
  exposed.forEach((face, order) => {
    const previous = exposed[(order - 1 + exposed.length) % exposed.length];
    if (Math.hypot(previous.end.x - face.start.x, previous.end.z - face.start.z) >= 1e-6) polygon.push(previous.end);
    polygon.push(face.start);
  });
  return { ...region, faceIds, insets, polygon, furnitureRule: !(thickness >= 0.001) || !exposed.length };
}

type FacesInputs = Pick<RoomSnapshot, "planShape" | "planPolygon" | "planHoles" | "surfaces" | "surfaceFinishes"> & {
  w: number; d: number; wall?: number; neighbours: BuiltInNeighbourWalls;
};

// One region per room outline, walls, surfaces and walls around it: containment runs on every frame of a drag, and a move or
// turn gives the room (and the plan) a new snapshot but keeps its geometry, outline and surfaces, and the walls around it.
const facesByGeometry = new WeakMap<RoomSnapshot["geometry"], { inputs: FacesInputs; faces: BuiltInRoomFaces }>();

function isSameInputs(a: FacesInputs, b: FacesInputs): boolean {
  return a.planShape === b.planShape && a.planPolygon === b.planPolygon && a.planHoles === b.planHoles &&
    a.surfaces === b.surfaces && a.surfaceFinishes === b.surfaceFinishes && a.w === b.w && a.d === b.d && a.wall === b.wall &&
    isSameNeighbours(a.neighbours, b.neighbours);
}

/**
 * The room's finished region and exposed faces; `size` is the drawn size of its rectangle or L-shape when it isn't its own, and
 * `planRooms` the plan's rooms (whose walls the 3D view draws around it).
 */
export function getRoomBuiltInFaces(
  room: RoomSnapshot,
  size: { w: number; d: number } = { w: room.geometry.width, d: room.geometry.depth },
  planRooms?: BuiltInPlanRooms
): BuiltInRoomFaces {
  const inputs: FacesInputs = {
    planShape: room.planShape, planPolygon: room.planPolygon, planHoles: room.planHoles, surfaces: room.surfaces,
    surfaceFinishes: room.surfaceFinishes, w: size.w, d: size.d, wall: room.geometry.wallThickness,
    neighbours: getBuiltInNeighbourWalls(room.id, planRooms),
  };
  const known = facesByGeometry.get(room.geometry);
  if (known && isSameInputs(known.inputs, inputs)) return known.faces;
  const faces = buildRoomBuiltInFaces(room, size, inputs.neighbours);
  facesByGeometry.set(room.geometry, { inputs, faces });
  return faces;
}

/** True when built-ins in `room` keep furniture's rule: an imported plan's room, or one with no exposed face. */
export function usesFurnitureRuleForBuiltIns(room: RoomSnapshot, size?: { w: number; d: number }, planRooms?: BuiltInPlanRooms): boolean {
  return isImportedPlanRoom(room) || getRoomBuiltInFaces(room, size, planRooms).furnitureRule;
}

function footprintCorners(x: number, z: number, width: number, depth: number, rotationY: number, tolerance: number): Point[] {
  const halfWidth = Math.max(0, width / 2 - tolerance), halfDepth = Math.max(0, depth / 2 - tolerance);
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
  return [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]]
    .map(([along, across]) => ({ x: x + along * cos + across * sin, z: z - along * sin + across * cos }));
}

/**
 * True when a built-in `width` × `depth` metres, centred at (x, z) and turned `rotationY`, stands in the room's finished
 * region by its real (turned) footprint, and keeps `standOff` metres (getBuiltInStandOff) off every exposed face, where a
 * recorded baseboard stands, as Fit stands a run's back off its face and keeps its ends from the end walls' baseboards. Its
 * front may stand over a baseboard, as Fit keeps nothing there (a run's front may stand up to a wall across). It may reach
 * `tolerance` into either.
 */
export function builtInFootprintFits(
  faces: BuiltInRoomFaces, x: number, z: number, width: number, depth: number, rotationY: number,
  tolerance = BUILT_IN_CONTACT_TOLERANCE, standOff = 0
): boolean {
  if (!isFootprintInBuiltInRegion(faces, footprintCorners(x, z, width, depth, rotationY, tolerance))) return false;
  if (!(standOff > 0)) return true;
  // Less a baseboard's depth at its front (+z when unturned): the back stays where it is.
  const back = Math.min(standOff, depth) / 2, [backX, backZ] = [-Math.sin(rotationY) * back, -Math.cos(rotationY) * back];
  return isFootprintClearOfFaces(faces, footprintCorners(x + backX, z + backZ, width, depth - 2 * back, rotationY, tolerance), standOff);
}

/**
 * How far a built-in keeps off the exposed faces, metres, as Fit stands it off (getCabinetBackOffsetMm): one standing on the
 * floor (its bottom `bottom` metres up: none) the recorded baseboard's depth, to the millimetre; a wall cabinet, hung above
 * the baseboard, none. Moves, turns, snaps and containment keep it, as Fit does.
 */
export function getBuiltInStandOff(room: RoomSnapshot, bottom = 0): number {
  return bottom > 0 ? 0 : Math.max(0, Math.round((room.geometry.baseboardDepth ?? 0) * 1000)) / 1000;
}

/** Furniture's clamp (half the wall plus 2 cm, inside each panel). */
function clampAsFurniture(room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY: number): [number, number] {
  return clampToRoomInsideFinishes(
    x, z, width, depth, room.geometry.width, room.geometry.depth, getFurnitureWallInset(room.geometry.wallThickness ?? 0.12),
    rotationY, room.planShape ?? "rectangle", room.planPolygon, room.planHoles, getRoomWallFinishDepths(room)
  );
}

/**
 * A built-in kept in its room's finished region, its back allowed against a face (or, standing on the floor, against the
 * recorded baseboard: getBuiltInStandOff, by its `bottom`). Where it stands in the region it stays put, as Fit to Space places
 * it; furniture's own room (half the wall plus 2 cm in) lies inside the region. A move that would leave it stops where it
 * still stands, going from `from`. A turn (no `from`) that leaves it goes to the nearest place along and out from the face it
 * stands against where it fits (turnAgainstFace). Where none does (nothing within TURN_REACH, or `from` doesn't fit either), it
 * is left at the target, which containment refuses: furniture's box clamp threw it metres off, into walls the region knows. In
 * a room on furniture's rule, it is clamped as furniture is.
 */
export function clampBuiltInToRoom(
  room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY = 0,
  options: { from?: readonly [number, number]; planRooms?: BuiltInPlanRooms; bottom?: number } = {}
): [number, number] {
  if (usesFurnitureRuleForBuiltIns(room, undefined, options.planRooms)) return clampAsFurniture(room, x, z, width, depth, rotationY);
  const faces = getRoomBuiltInFaces(room, undefined, options.planRooms), standOff = getBuiltInStandOff(room, options.bottom);
  // A tenth of the contact tolerance: a move stops within 0.05 mm of a face, and containment (0.5 mm) keeps it.
  const fits = (atX: number, atZ: number) =>
    builtInFootprintFits(faces, atX, atZ, width, depth, rotationY, BUILT_IN_CONTACT_TOLERANCE / 10, standOff);
  if (fits(x, z)) return [x, z];
  const from = options.from;
  if (from && fits(from[0], from[1])) {
    let reach = 0, beyond = 1;
    for (let step = 0; step < 24; step += 1) {
      const middle = (reach + beyond) / 2;
      if (fits(from[0] + (x - from[0]) * middle, from[1] + (z - from[1]) * middle)) reach = middle;
      else beyond = middle;
    }
    return [from[0] + (x - from[0]) * reach, from[1] + (z - from[1]) * reach];
  }
  // Nothing nearby fits: it stays at the target, which containment refuses (a turn is refused, the built-in where it was).
  return (from ? null : turnAgainstFace(faces, x, z, fits)) ?? [x, z];
}

/** How far (metres) a turn looks for the nearest place a built-in fits, along and out from its face, before giving up. */
const TURN_REACH = 0.6;

/**
 * A turned built-in at (x, z) that doesn't fit, moved to the nearest place where it does, along and out from the faces it
 * stands against (the two exposed faces nearest it: in a corner, either may be the one to slide along): the nearest of
 * nearestFitAlong's for each. Null when there is no exposed face, or it fits nowhere within TURN_REACH.
 */
function turnAgainstFace(faces: BuiltInRoomFaces, x: number, z: number, fits: (atX: number, atZ: number) => boolean): [number, number] | null {
  const distanceTo = ({ start, end }: { start: Point; end: Point }) => {
    const dx = end.x - start.x, dz = end.z - start.z, length = dx * dx + dz * dz;
    const t = length > 0 ? Math.max(0, Math.min(1, ((x - start.x) * dx + (z - start.z) * dz) / length)) : 0;
    return Math.hypot(x - start.x - dx * t, z - start.z - dz * t);
  };
  const nearest = faces.exposed.flatMap((face, index) => (face ? [{ wall: faces.walls[index], distance: distanceTo(face) }] : []))
    .sort((first, second) => first.distance - second.distance).slice(0, 2);
  const found = nearest.flatMap(({ wall }) => nearestFitAlong(wall, x, z, fits) ?? []).sort((first, second) => first.distance - second.distance);
  return found[0]?.at ?? null;
}

/**
 * The nearest place to (x, z) where `fits` holds, along and out from `wall`'s face: for each distance along it, the least
 * distance out from it that fits (to within the halving's thousandths of a mm, so touching what stops it: the face, or a solid
 * on it). Distances along are tried 10 mm apart, nearest first, then a millimetre apart about the best; within TURN_REACH.
 */
function nearestFitAlong(
  wall: BuiltInRoomFaces["walls"][number], x: number, z: number, fits: (atX: number, atZ: number) => boolean
): { at: [number, number]; distance: number } | null {
  const step = 0.01;
  const at = (along: number, out: number): [number, number] => [x + wall.dx * along + wall.nx * out, z + wall.dz * along + wall.nz * out];
  const found: { best: { along: number; out: number; distance: number } | null } = { best: null };
  const consider = (along: number) => {
    const limit = Math.sqrt(Math.max(0, (found.best?.distance ?? TURN_REACH) ** 2 - along ** 2));
    let outside: number | null = null;
    for (let out = 0; out <= limit + 1e-9; out += step) {
      if (!fits(...at(along, out))) {
        outside = out;
        continue;
      }
      let inside = out;
      for (let halving = 0; outside !== null && halving < 20; halving += 1) {
        const middle = (outside + inside) / 2;
        if (fits(...at(along, middle))) inside = middle;
        else outside = middle;
      }
      const distance = Math.hypot(along, inside);
      if (!found.best || distance < found.best.distance) found.best = { along, out: inside, distance };
      return;
    }
  };
  for (let k = 0; k * step <= TURN_REACH && k * step < (found.best?.distance ?? Number.POSITIVE_INFINITY); k += 1) {
    consider(k * step);
    if (k) consider(-k * step);
  }
  const coarse = found.best;
  if (!coarse) return null;
  for (let k = -9; k <= 9; k += 1) if (k) consider(coarse.along + k * 0.001);
  const best = found.best ?? coarse;
  return { at: at(best.along, best.out), distance: best.distance };
}

/**
 * Where Snap to wall sends a built-in: to the nearest side of its room's exposed faces along x or z, a floor-standing one the
 * baseboard's depth off it (their middle, for one wider than they stand apart). The move then takes it there if it fits
 * there, without checking what stands between (as for furniture), or else toward it as far as the clamp's halving search
 * finds it fits. A room on furniture's rule snaps as the
 * line did, half the wall plus 2 cm in from its rectangle, to its middle for one wider than that.
 */
export function getBuiltInSnapTarget(
  room: RoomSnapshot, position: readonly [number, number, number], width: number, depth: number, rotationY: number,
  planRooms?: BuiltInPlanRooms
): [number, number] {
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(width, depth, rotationY);
  const [x, , z] = position;
  const nearest = (candidates: Array<[number, number]>) => candidates.reduce((best, candidate) =>
    Math.hypot(candidate[0] - x, candidate[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? candidate : best);
  if (usesFurnitureRuleForBuiltIns(room, undefined, planRooms)) {
    const inset = getFurnitureWallInset(room.geometry.wallThickness ?? 0.12);
    const wallX = Math.max(0, room.geometry.width / 2 - inset - effectiveWidth / 2);
    const wallZ = Math.max(0, room.geometry.depth / 2 - inset - effectiveDepth / 2);
    return nearest([[-wallX, z], [wallX, z], [x, -wallZ], [x, wallZ]]);
  }
  const faces = getRoomBuiltInFaces(room, undefined, planRooms).polygon, xs = faces.map((point) => point.x), zs = faces.map((point) => point.z);
  // Its back against a face, or a floor-standing one's against the baseboard (getBuiltInStandOff, by its bottom).
  const standOff = getBuiltInStandOff(room, position[1]);
  const sides = (low: number, high: number, size: number) => low + standOff + size / 2 <= high - standOff - size / 2
    ? [low + standOff + size / 2, high - standOff - size / 2] : [(low + high) / 2, (low + high) / 2];
  const [west, east] = sides(Math.min(...xs), Math.max(...xs), effectiveWidth);
  const [north, south] = sides(Math.min(...zs), Math.max(...zs), effectiveDepth);
  return nearest([[west, z], [east, z], [x, north], [x, south]]);
}
