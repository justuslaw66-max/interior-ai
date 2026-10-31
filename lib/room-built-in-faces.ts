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
import { findNearestBuiltInFit, type BuiltInFitObstacles } from "@/lib/built-in-nearest-fit";
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
 * it. A move that would leave it stops where it still stands, going from `from`. A turn (no `from`; `turnedFrom` its rotation
 * before) that leaves it goes to the nearest place where it fits, within how far its corners swing in the turn (TURN_REACH at
 * least): touching what stops it, a face or a solid on it (findNearestBuiltInFit). `nearestWithin` lets a placement whose start
 * doesn't fit (Place, or Save as copy, of a run with no fit or an old one) go to the nearest place it fits within that reach.
 * Where nothing does, it is left at the target, which containment refuses (the built-in stays where it was; a placement is
 * refused). In a room on furniture's rule, it is clamped as furniture is.
 */
export function clampBuiltInToRoom(
  room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY = 0,
  options: { from?: readonly [number, number]; planRooms?: BuiltInPlanRooms; bottom?: number; turnedFrom?: number; nearestWithin?: number } = {}
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
  const reach = from ? options.nearestWithin ?? 0 : Math.max(options.nearestWithin ?? 0, getTurnReach(width, depth, rotationY, options.turnedFrom));
  if (!(reach > 0)) return [x, z];
  // Nothing nearby fits: it stays at the target, which containment refuses (a turn is refused, the built-in where it was).
  return findNearestBuiltInFit(getBuiltInFitObstacles(faces, width, depth, rotationY, standOff), { x, z }, reach, fits, faces.outline) ?? [x, z];
}

/** How far (metres) a turn looks for the nearest place a built-in fits, at least: a unit's turn by a column or in a corner. */
const TURN_REACH = 0.6;

/**
 * How far a turned built-in may go to the nearest place it fits: as far as its corners swing in the turn (from `turnedFrom`),
 * so a long run turned on its wall turns as it did on the line, and TURN_REACH at least; a short one turned a little that
 * fits nowhere near is refused rather than thrown metres off.
 */
function getTurnReach(width: number, depth: number, rotationY: number, turnedFrom?: number): number {
  if (typeof turnedFrom !== "number" || !Number.isFinite(turnedFrom)) return TURN_REACH;
  const turn = Math.abs(Math.atan2(Math.sin(rotationY - turnedFrom), Math.cos(rotationY - turnedFrom)));
  return Math.max(TURN_REACH, 2 * (Math.hypot(width, depth) / 2) * Math.sin(turn / 2));
}

/**
 * What a built-in's footprint keeps clear of, for findNearestBuiltInFit, as builtInFootprintFits tests it: the region's solids for
 * the whole footprint, the baseboard's bands in front of the exposed faces for its back, and the outline's and columns' edges.
 * A solid or a band may touch the footprint (builtInFootprintFits shrinks it by a tenth of the contact tolerance), so their
 * footprints are that one, a nanometre larger, and a place found is just clear of them however narrow the gap it fits in. A
 * corner exactly on the outline may count as outside it, so the edges keep a further twentieth of the tolerance in hand.
 */
function getBuiltInFitObstacles(faces: BuiltInRoomFaces, width: number, depth: number, rotationY: number, standOff: number): BuiltInFitObstacles[] {
  const touching = BUILT_IN_CONTACT_TOLERANCE / 10 - 1e-9, clear = BUILT_IN_CONTACT_TOLERANCE / 20;
  const ringEdges = (ring: readonly Point[]) => ring.map((point, index) => [point, ring[(index + 1) % ring.length]]);
  const families: BuiltInFitObstacles[] = [
    { footprint: footprintCorners(0, 0, width, depth, rotationY, touching), obstacles: faces.solids },
    { footprint: footprintCorners(0, 0, width, depth, rotationY, clear), obstacles: [...ringEdges(faces.outline), ...faces.holes.flatMap(ringEdges)] },
  ];
  if (!(standOff > 0)) return families;
  const back = Math.min(standOff, depth) / 2;
  const bands = faces.faces.map(({ start, end, nx, nz }) =>
    [start, end, { x: end.x + nx * standOff, z: end.z + nz * standOff }, { x: start.x + nx * standOff, z: start.z + nz * standOff }]);
  return [...families, { footprint: footprintCorners(-Math.sin(rotationY) * back, -Math.cos(rotationY) * back, width, depth - 2 * back, rotationY, touching), obstacles: bands }];
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
