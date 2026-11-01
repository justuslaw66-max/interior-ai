import { PLAN_OPENING_DEFAULT_HEIGHT_METERS } from "@/lib/design-page-plan-overlays";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import { resolveDesignPageOpeningHosts } from "@/lib/design-page-opening-host";
import type { RoomOpening2D } from "@/lib/editorScene";
import { getBuiltInNeighbourRooms, type BuiltInPlanRooms } from "@/lib/room-built-in-faces";
import type { RoomSnapshot } from "@/lib/room-types";

/**
 * Doors and windows as Fit to Space's hosts see them (features/cabinetry/roomCabinetHosts.ts): the room's own, and a drawn
 * room's where the plan and 3D view draw them; and those of the rooms next door, which the 3D view cuts into this room's
 * walls along the same line.
 */

/** The room's openings as Fit sees them; a roomless one (from an older design) belongs to the only room. */
export function getRoomHostOpenings(roomId: string, planRoomCount: number, planOpenings: RoomOpening2D[]) {
  return planOpenings.filter((opening) => opening.roomId === roomId || (planRoomCount <= 1 && !opening.roomId)).map(toHostOpening);
}

function toHostOpening(opening: RoomOpening2D) {
  return {
    id: opening.id,
    wall: opening.wall,
    kind: opening.kind,
    offsetMm: opening.offsetMm,
    widthMm: opening.widthMm,
    heightMm: opening.heightMm ?? Math.round(PLAN_OPENING_DEFAULT_HEIGHT_METERS * 1000),
    bottomMm: opening.kind === "window" ? opening.bottomMm ?? 900 : 0,
    label: opening.kind === "door" ? "Door" : "Window",
  };
}

/**
 * A drawn room's doors and windows on its outline's walls where the plan and 3D view draw them (resolveDesignPageOpeningHosts:
 * a cardinal one at the middle of the room's wall facing that way that holds it, plus its offset), measured from each wall's
 * middle; one the plan doesn't draw doesn't cut its wall. Taken from the room's middle instead (as the line's
 * mapCabinetCardinalOpeningsToPolygonWalls does), one stood off where it is drawn wherever that wall's middle isn't the
 * room's: a straight wall in two pieces, an L's notch, a chamfered corner. Resolved over the plan's rooms, as the plan does.
 */
export function getDrawnOutlineOpenings(
  room: RoomSnapshot, outline: ReadonlyArray<{ x: number; z: number }>, planOpenings: RoomOpening2D[], openings: ReturnType<typeof getRoomHostOpenings>,
  planRooms: BuiltInPlanRooms | undefined
) {
  const plan: HousePlanRoom2D = {
    id: room.id, name: room.name, roomType: room.roomType, shape: room.planShape ?? "rectangle", polygon: room.planPolygon, holes: room.planHoles,
    x: 0, z: 0, w: room.geometry.width, d: room.geometry.depth, wallThickness: room.geometry.wallThickness,
  };
  const own = planRooms?.get(room.id), origin = own ?? plan;
  const byId = new Map(planOpenings.map((opening) => [opening.id, opening]));
  const drawn = resolveDesignPageOpeningHosts(openings.flatMap((opening) => byId.get(opening.id) ?? []), own && planRooms ? [...planRooms.values()] : [plan]);
  return openings.flatMap((opening) => {
    const resolution = drawn.find((entry) => entry.opening.id === opening.id)?.resolution;
    if (resolution?.status !== "resolved") return [];
    const { worldCenter, tangent } = resolution.host;
    return toOutlineOpening(outline, opening, { x: worldCenter.x - origin.x, z: worldCenter.z - origin.z }, tangent);
  });
}

type Point = { x: number; z: number };

/**
 * The outline edge a door or window drawn at `center` (room-local) along `tangent` stands on: the one nearest it that holds it,
 * of those running along it (a door centred on a corner lies on both walls there, and is the one it runs along).
 */
function findOutlineEdge(outline: readonly Point[], center: Point, tangent: Point) {
  const edges = outline.map((start, index) => {
    const end = outline[(index + 1) % outline.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    const along = ((center.x - start.x) * (end.x - start.x) + (center.z - start.z) * (end.z - start.z)) / (length || 1);
    const across = Math.abs((center.x - start.x) * (end.z - start.z) - (center.z - start.z) * (end.x - start.x)) / (length || 1);
    const runsAlong = Math.abs((end.x - start.x) * tangent.z - (end.z - start.z) * tangent.x) / (length || 1) < 1e-6;
    return { index, along, across, length, runsAlong };
  }).filter(({ along, across, length }) => length > 1e-9 && across < 0.001 && along >= -0.001 && along <= length + 0.001);
  const better = (first: (typeof edges)[number], second: (typeof edges)[number]) =>
    first.runsAlong !== second.runsAlong ? first.runsAlong : first.across < second.across;
  return edges.reduce<(typeof edges)[number] | null>((best, candidate) => (best === null || better(candidate, best) ? candidate : best), null);
}

/** A door or window drawn at `center` along `tangent` (room-local), on the outline wall it stands on, from that wall's middle. */
function toOutlineOpening<T extends object>(outline: readonly Point[], opening: T, center: Point, tangent: Point) {
  const edge = findOutlineEdge(outline, center, tangent);
  return edge ? [{ ...opening, wallId: `wall-${edge.index}`, offsetMm: Number(((edge.along - edge.length / 2) * 1000).toFixed(3)) }] : [];
}

/**
 * The doors and windows of the rooms on `room`'s floor, where the plan draws them (resolveDesignPageOpeningHosts over the
 * plan's rooms), room-local: the 3D view cuts each into every wall of this room it overlaps along the same line
 * (findMirroredEdges).
 */
export function getSharedOpenings(room: RoomSnapshot, planRooms: BuiltInPlanRooms | undefined, planOpenings: RoomOpening2D[]) {
  const own = planRooms?.get(room.id), next = new Set(getBuiltInNeighbourRooms(room.id, planRooms).map((other) => other.id));
  const others = planOpenings.filter((opening) => opening.roomId && next.has(opening.roomId));
  if (!planRooms || !own || !others.length) return [];
  return resolveDesignPageOpeningHosts(others, [...planRooms.values()]).flatMap(({ opening, resolution }) => {
    if (resolution.status !== "resolved") return [];
    const { worldCenter, tangent } = resolution.host;
    return [{ opening: toHostOpening(opening), center: { x: worldCenter.x - own.x, z: worldCenter.z - own.z }, tangent }];
  });
}

/**
 * The outline edges another room's door or window, drawn at `center` along `tangent` and `width` wide, is cut into, as the 3D
 * view mirrors it onto this room's walls (getWallOpenings in house-plan-3d/legacyWallOpenings.ts): each edge running along it
 * (to 0.01), its line within 2 mm of the door's centre, and the door over some of it (its centre within half the edge and half
 * the door of the edge's middle). With the door's centre along each.
 */
export function findMirroredEdges(outline: readonly Point[], center: Point, tangent: Point, width: number) {
  return outline.flatMap((start, index) => {
    const end = outline[(index + 1) % outline.length], length = Math.hypot(end.x - start.x, end.z - start.z);
    if (!(length > 1e-9)) return [];
    const [dx, dz] = [(end.x - start.x) / length, (end.z - start.z) / length];
    const along = (center.x - start.x) * dx + (center.z - start.z) * dz, across = Math.abs((center.x - start.x) * dz - (center.z - start.z) * dx);
    const parallel = Math.abs(dx * tangent.z - dz * tangent.x) <= 0.01;
    return parallel && across <= 0.002 && Math.abs(along - length / 2) <= length / 2 + width / 2 ? [{ index, along, length }] : [];
  });
}
