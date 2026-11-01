import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { FurnitureRoomContext } from "@/lib/furniture-room-fit";
import { getBuiltInNeighbourWalls, type BuiltInPlanRooms } from "@/lib/room-built-in-faces";
import { isBuiltInItem } from "@/lib/room-finished-outline";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { getRoomOutlineEdges } from "@/lib/room-wall-finish-depths";

/**
 * What furniture's clamp and containment know of its room (lib/furniture-room-fit.ts): the room's outline's edges, read from
 * the room itself, and the walls the 3D view draws for the rooms next door, from the plan's rooms (`planRooms`, as #245's region
 * reads them for built-ins: lib/room-built-in-faces.ts). A built-in has none: it keeps the line's clamp and containment.
 */

const NO_ROOM: FurnitureRoomContext = Object.freeze({});
// One per room while its plan is the same: the 3D view's clamp keeps its identity, and the faces are kept by it.
const contexts = new WeakMap<RoomSnapshot, { planRooms: unknown; context: FurnitureRoomContext }>();

/** The plan's rooms, by id, as given or as a list (buildHousePlan2D's). */
type PlanRooms = ReadonlyMap<string, object> | readonly HousePlanRoom2D[];
const roomsById = new WeakMap<readonly HousePlanRoom2D[], BuiltInPlanRooms>();

/** The plan rooms as the plan's own rooms (their outlines and walls), or none where they say only where each room stands. */
function asPlanRooms(planRooms: PlanRooms | undefined): BuiltInPlanRooms | undefined {
  if (!planRooms) return undefined;
  if (!(planRooms instanceof Map)) {
    const list = planRooms as readonly HousePlanRoom2D[], known = roomsById.get(list) ?? new Map(list.map((room) => [room.id, room]));
    roomsById.set(list, known);
    return known;
  }
  const first = planRooms.values().next().value as Partial<HousePlanRoom2D> | undefined;
  const isPlan = first && typeof first.shape === "string" && typeof first.w === "number" && typeof first.d === "number";
  return isPlan ? (planRooms as BuiltInPlanRooms) : undefined;
}

export function getFurnitureRoomContext(room: RoomSnapshot, planRooms?: PlanRooms): FurnitureRoomContext {
  const known = contexts.get(room), edges = getRoomOutlineEdges(room);
  if (known && known.planRooms === planRooms && known.context.edges === edges) return known.context;
  const plan = edges && !edges.imported ? asPlanRooms(planRooms) : undefined;
  const walls = plan ? getBuiltInNeighbourWalls(room.id, plan) : [];
  const context = edges ? { edges, ...(walls.length ? { neighbours: walls } : {}) } : NO_ROOM;
  contexts.set(room, { planRooms, context });
  return context;
}

/** An item's context: furniture's room, or none for a built-in, which keeps the line's clamp and containment. */
export function getItemRoomContext(
  item: Pick<DesignItem, "assetType">, room: RoomSnapshot, planRooms?: PlanRooms
): FurnitureRoomContext | undefined {
  return isBuiltInItem(item) ? undefined : getFurnitureRoomContext(room, planRooms);
}
