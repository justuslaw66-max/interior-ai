import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { compileCanonicalFloorPlanRenderModel, type CanonicalFloorPlanFloorRenderModel } from "@/lib/floor-plan-render-model";
import { getCanonicalRoomWalls } from "@/lib/furniture-canonical-walls";
import type { FurnitureRoomContext } from "@/lib/furniture-room-fit";
import { getBuiltInNeighbourWalls, type BuiltInPlanRooms } from "@/lib/room-built-in-faces";
import { isBuiltInItem } from "@/lib/room-finished-outline";
import type { DesignItem, RoomSnapshot } from "@/lib/room-types";
import { getRoomOutlineEdges } from "@/lib/room-wall-finish-depths";

/**
 * What furniture's clamp and containment know of its room (lib/furniture-room-fit.ts): the room's outline's edges, read from
 * the room itself; for a drawn room, the walls the 3D view draws for the rooms next door, from the plan's rooms (`planRooms`,
 * as #245's region reads them for built-ins: lib/room-built-in-faces.ts); for an imported plan's room, its walls and laminates
 * as its 3D view draws them, from the compiled plan's floors (`floors`: lib/furniture-canonical-walls.ts). A built-in has
 * none: it keeps the line's clamp and containment, as does an imported room whose compiled plan isn't to hand.
 */

type Floors = readonly CanonicalFloorPlanFloorRenderModel[];
const NO_ROOM: FurnitureRoomContext = Object.freeze({});
// One per room while its plan is the same: the 3D view's clamp keeps its identity, and the faces are kept by it.
const contexts = new WeakMap<RoomSnapshot, { planRooms: unknown; floors: unknown; context: FurnitureRoomContext }>();

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

export function getFurnitureRoomContext(room: RoomSnapshot, planRooms?: PlanRooms, floors?: Floors): FurnitureRoomContext {
  const known = contexts.get(room), edges = getRoomOutlineEdges(room);
  if (known && known.planRooms === planRooms && known.floors === floors && known.context.edges === edges) return known.context;
  const plan = edges && !edges.imported ? asPlanRooms(planRooms) : undefined;
  const walls = plan ? getBuiltInNeighbourWalls(room.id, plan) : [];
  const canonical = edges?.imported && floors ? getCanonicalRoomWalls(floors, room) : undefined;
  const context = edges ? { edges, ...(walls.length ? { neighbours: walls } : {}), ...(canonical ? { canonical } : {}) } : NO_ROOM;
  contexts.set(room, { planRooms, floors, context });
  return context;
}

/** An item's context: furniture's room, or none for a built-in, which keeps the line's clamp and containment. */
export function getItemRoomContext(
  item: Pick<DesignItem, "assetType">, room: RoomSnapshot, planRooms?: PlanRooms, floors?: Floors
): FurnitureRoomContext | undefined {
  return isBuiltInItem(item) ? undefined : getFurnitureRoomContext(room, planRooms, floors);
}

const compiled = new WeakMap<FloorPlanDocumentV2, Floors | null>();

/** The floors of an imported plan's compiled 3D model, once per document; none where it doesn't compile. */
export function getCompiledPlanFloors(document: FloorPlanDocumentV2 | null | undefined): Floors | undefined {
  if (!document) return undefined;
  if (!compiled.has(document)) {
    let floors: Floors | null = null;
    try {
      floors = compileCanonicalFloorPlanRenderModel(document).floors;
    } catch {
      floors = null;
    }
    compiled.set(document, floors);
  }
  return compiled.get(document) ?? undefined;
}
