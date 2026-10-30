import { getFurnitureWallInset } from "@/lib/design-page-geometry";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import {
  clampToRoomInsideFinishes,
  getBuiltInWallInset,
  getRoomPlanOutlinePoints,
} from "@/lib/room-finished-outline";
import { buildBuiltInRegion, isFootprintInBuiltInRegion, type BuiltInRegion } from "@/lib/room-built-in-region";
import { getRoomWallFaceIds, getRoomWallFinishDepths } from "@/lib/room-wall-finish-depths";
import type { RoomPlanPolygonPoint, RoomSnapshot } from "@/lib/room-types";

/**
 * Where a built-in cabinet may stand in a drawn room: in its finished region (lib/room-built-in-region.ts), inside its outline
 * and outside its walls' solids and panels as the 3D view draws them, its back allowed against a face (J, 29 Oct 2026: "Face,
 * back flush"). Furniture's rule still holds wherever the region would refuse more. A room from an imported plan keeps
 * furniture's rule for now (its walls each have their own thickness, which its room doesn't carry), as does a room with no
 * exposed face (its walls fill it) or no wall thickness.
 */

type Point = RoomPlanPolygonPoint;

export type BuiltInRoomFaces = BuiltInRegion & {
  faceIds: string[];
  /** How far each wall's face stands in from its outline edge: half the wall, and its panel. */
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

function buildRoomBuiltInFaces(room: RoomSnapshot, size: { w: number; d: number }): BuiltInRoomFaces {
  const shape = room.planShape ?? "rectangle";
  const outline = getRoomPlanOutlinePoints({ shape, polygon: room.planPolygon, w: size.w, d: size.d });
  const faceIds = getRoomWallFaceIds({ shape, polygon: room.planPolygon });
  const depths = getRoomWallFinishDepths(room);
  const thickness = 2 * getBuiltInWallInset(room.geometry.wallThickness);
  const insets = faceIds.map((faceId) => thickness / 2 + (depths[faceId] ?? 0));
  const region = buildBuiltInRegion(outline, insets, thickness, room.planHoles ?? []);
  const polygon: Point[] = [];
  const exposed = region.exposed.filter((face) => face !== null);
  exposed.forEach((face, order) => {
    const previous = exposed[(order - 1 + exposed.length) % exposed.length];
    if (Math.hypot(previous.end.x - face.start.x, previous.end.z - face.start.z) >= 1e-6) polygon.push(previous.end);
    polygon.push(face.start);
  });
  return { ...region, faceIds, insets, polygon, furnitureRule: !(thickness >= 0.001) || !exposed.length };
}

type FacesInputs = Pick<RoomSnapshot, "planShape" | "planPolygon" | "planHoles" | "surfaces" | "surfaceFinishes"> & { w: number; d: number; wall?: number };

// One region per room outline, walls and surfaces: containment runs on every frame of a drag, and a move or turn gives the
// room a new snapshot but keeps its geometry, outline and surfaces.
const facesByGeometry = new WeakMap<RoomSnapshot["geometry"], { inputs: FacesInputs; faces: BuiltInRoomFaces }>();

function isSameInputs(a: FacesInputs, b: FacesInputs): boolean {
  return a.planShape === b.planShape && a.planPolygon === b.planPolygon && a.planHoles === b.planHoles &&
    a.surfaces === b.surfaces && a.surfaceFinishes === b.surfaceFinishes && a.w === b.w && a.d === b.d && a.wall === b.wall;
}

/** The room's finished region and exposed faces; `size` is the drawn size of its rectangle or L-shape when it isn't its own. */
export function getRoomBuiltInFaces(
  room: RoomSnapshot,
  size: { w: number; d: number } = { w: room.geometry.width, d: room.geometry.depth }
): BuiltInRoomFaces {
  const inputs: FacesInputs = {
    planShape: room.planShape, planPolygon: room.planPolygon, planHoles: room.planHoles, surfaces: room.surfaces,
    surfaceFinishes: room.surfaceFinishes, w: size.w, d: size.d, wall: room.geometry.wallThickness,
  };
  const known = facesByGeometry.get(room.geometry);
  if (known && isSameInputs(known.inputs, inputs)) return known.faces;
  const faces = buildRoomBuiltInFaces(room, size);
  facesByGeometry.set(room.geometry, { inputs, faces });
  return faces;
}

/** True when built-ins in `room` keep furniture's rule: an imported plan's room, or one with no exposed face. */
export function usesFurnitureRuleForBuiltIns(room: RoomSnapshot, size?: { w: number; d: number }): boolean {
  return isImportedPlanRoom(room) || getRoomBuiltInFaces(room, size).furnitureRule;
}

function footprintCorners(x: number, z: number, width: number, depth: number, rotationY: number, tolerance: number): Point[] {
  const halfWidth = Math.max(0, width / 2 - tolerance), halfDepth = Math.max(0, depth / 2 - tolerance);
  const cos = Math.cos(rotationY), sin = Math.sin(rotationY);
  return [[-halfWidth, -halfDepth], [halfWidth, -halfDepth], [halfWidth, halfDepth], [-halfWidth, halfDepth]]
    .map(([along, across]) => ({ x: x + along * cos + across * sin, z: z - along * sin + across * cos }));
}

/**
 * True when a built-in `width` × `depth` metres, centred at (x, z) and turned `rotationY`, stands in the room's finished
 * region by its real (turned) footprint. It may reach `tolerance` into a face.
 */
export function builtInFootprintFits(
  faces: BuiltInRoomFaces, x: number, z: number, width: number, depth: number, rotationY: number,
  tolerance = BUILT_IN_CONTACT_TOLERANCE
): boolean {
  return isFootprintInBuiltInRegion(faces, footprintCorners(x, z, width, depth, rotationY, tolerance));
}

/** Furniture's clamp (half the wall plus 2 cm, inside each panel). */
function clampAsFurniture(room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY: number): [number, number] {
  return clampToRoomInsideFinishes(
    x, z, width, depth, room.geometry.width, room.geometry.depth, getFurnitureWallInset(room.geometry.wallThickness ?? 0.12),
    rotationY, room.planShape ?? "rectangle", room.planPolygon, room.planHoles, getRoomWallFinishDepths(room)
  );
}

/**
 * A built-in kept in its room's finished region, its back allowed against a face. Where it stands in the region it stays put,
 * as Fit to Space places it; furniture's own room (half the wall plus 2 cm in) lies inside the region. A move that would leave
 * it stops where it still stands, going from `from`. Otherwise it is clamped with half the wall, by the box test furniture
 * uses; in a room on furniture's rule, as furniture is.
 */
export function clampBuiltInToRoom(
  room: RoomSnapshot, x: number, z: number, width: number, depth: number, rotationY = 0,
  options: { from?: readonly [number, number] } = {}
): [number, number] {
  if (usesFurnitureRuleForBuiltIns(room)) return clampAsFurniture(room, x, z, width, depth, rotationY);
  const faces = getRoomBuiltInFaces(room);
  // A tenth of the contact tolerance: a move stops within 0.05 mm of a face, and containment (0.5 mm) keeps it.
  const fits = (atX: number, atZ: number) => builtInFootprintFits(faces, atX, atZ, width, depth, rotationY, BUILT_IN_CONTACT_TOLERANCE / 10);
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
  return clampToRoomInsideFinishes(
    x, z, width, depth, room.geometry.width, room.geometry.depth, getBuiltInWallInset(room.geometry.wallThickness),
    rotationY, room.planShape ?? "rectangle", room.planPolygon, room.planHoles, getRoomWallFinishDepths(room)
  );
}

/**
 * Where Snap to wall sends a built-in: to the nearest side of its room's exposed faces along x or z (the move then stops at
 * the first face it meets). A room on furniture's rule snaps as furniture does, half the wall plus 2 cm in from its rectangle.
 */
export function getBuiltInSnapTarget(
  room: RoomSnapshot, position: readonly [number, number, number], width: number, depth: number, rotationY: number
): [number, number] {
  const [effectiveWidth, effectiveDepth] = getRotatedFootprint(width, depth, rotationY);
  const faces = usesFurnitureRuleForBuiltIns(room) ? [] : getRoomBuiltInFaces(room).polygon;
  const inset = getFurnitureWallInset(room.geometry.wallThickness ?? 0.12);
  const points = faces.length ? faces
    : [{ x: -room.geometry.width / 2 + inset, z: -room.geometry.depth / 2 + inset }, { x: room.geometry.width / 2 - inset, z: room.geometry.depth / 2 - inset }];
  const xs = points.map((point) => point.x), zs = points.map((point) => point.z);
  const [x, , z] = position;
  const candidates: Array<[number, number]> = [
    [Math.min(...xs) + effectiveWidth / 2, z], [Math.max(...xs) - effectiveWidth / 2, z],
    [x, Math.min(...zs) + effectiveDepth / 2], [x, Math.max(...zs) - effectiveDepth / 2],
  ];
  return candidates.reduce((best, candidate) =>
    Math.hypot(candidate[0] - x, candidate[1] - z) < Math.hypot(best[0] - x, best[1] - z) ? candidate : best);
}
