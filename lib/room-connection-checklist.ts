import {
  buildHouseRoomAdjacencyGuides,
  buildHouseRoomConnectivityReport,
  buildHouseRoomDoorwaySuggestions,
  type HousePlanRoom2D,
  type HouseRoomAdjacencyGuide,
  type HouseRoomConnectionChecklistItem,
  type HouseRoomConnectionOpening,
  type HouseRoomDoorwaySuggestion,
} from "@/lib/design-page-house-plan";

// Which rooms need a door (UX phase 4g, audit ST9). A door counts anywhere on the wall two rooms
// share, not only near its middle. A pair without a door needs one only when a room can't be
// reached through doors: from a room with an outside door, or, with none, from the largest group
// of rooms joined by doors. The fewest doors that reach every room are "Needs a door"; the other
// pairs without one read "Reached through other rooms".

type Wall = HouseRoomConnectionOpening["wall"];
type SharedWallSpan = { roomId: string; wall: Wall; centerMeters: number; halfLengthMeters: number };
type RoomPair = {
  guide: HouseRoomAdjacencyGuide;
  hasDoor: boolean;
  suggestions: HouseRoomDoorwaySuggestion[];
};

const SPAN_TOLERANCE_METERS = 0.05;

/** The shared wall on each of its two rooms: which wall, and its stretch from the room's centre. */
function sharedWallSpans(guide: HouseRoomAdjacencyGuide, rooms: readonly HousePlanRoom2D[]): SharedWallSpan[] {
  return guide.roomIds.flatMap((roomId) => {
    const room = rooms.find((entry) => entry.id === roomId);
    if (!room) return [];
    const vertical = guide.orientation === "vertical";
    const wall: Wall = vertical
      ? room.x < guide.labelPosition.x ? "east" : "west"
      : room.z < guide.labelPosition.z ? "south" : "north";
    const centerMeters = vertical ? guide.labelPosition.z - room.z : guide.labelPosition.x - room.x;
    return [{ roomId, wall, centerMeters, halfLengthMeters: guide.lengthMeters / 2 }];
  });
}

/** A door on the room's shared wall, with its centre anywhere along the shared stretch. */
export function doorIsOnSharedWall(span: SharedWallSpan, opening: HouseRoomConnectionOpening): boolean {
  return (
    opening.kind === "door" &&
    opening.roomId === span.roomId &&
    opening.wall === span.wall &&
    Math.abs(opening.offsetMm / 1000 - span.centerMeters) <= span.halfLengthMeters + SPAN_TOLERANCE_METERS
  );
}

/** Rooms joined into groups by the pairs given (union–find over room ids). */
function groupsOf(rooms: readonly HousePlanRoom2D[], pairs: readonly RoomPair[]): Map<string, string> {
  const parent = new Map(rooms.map((room) => [room.id, room.id]));
  const find = (id: string): string => {
    const next = parent.get(id) ?? id;
    if (next === id) return id;
    const root = find(next);
    parent.set(id, root);
    return root;
  };
  for (const { guide } of pairs) parent.set(find(guide.roomIds[0]), find(guide.roomIds[1]));
  return new Map(rooms.map((room) => [room.id, find(room.id)]));
}

/** Rooms with a door that isn't on a wall shared with another room: the way in from outside. */
function entranceRoomIds(
  rooms: readonly HousePlanRoom2D[],
  openings: readonly HouseRoomConnectionOpening[],
  spans: readonly SharedWallSpan[]
): Set<string> {
  return new Set(
    openings
      .filter((opening) => opening.kind === "door" && opening.roomId && rooms.some((room) => room.id === opening.roomId))
      .filter((opening) => !spans.some((span) => doorIsOnSharedWall(span, opening)))
      .map((opening) => opening.roomId as string)
  );
}

/** Where each group of touching rooms is entered from: its entrances, or its largest door group. */
function startingRoomIds(rooms: readonly HousePlanRoom2D[], pairs: readonly RoomPair[], entrances: ReadonlySet<string>) {
  const touching = groupsOf(rooms, pairs);
  const doorGroups = groupsOf(rooms, pairs.filter((pair) => pair.hasDoor));
  const start = new Set<string>();
  for (const group of new Set(touching.values())) {
    const members = rooms.filter((room) => touching.get(room.id) === group);
    const withEntrance = members.filter((room) => entrances.has(room.id));
    if (withEntrance.length > 0) {
      withEntrance.forEach((room) => start.add(room.id));
      continue;
    }
    const sizes = new Map<string, number>();
    for (const room of members) sizes.set(doorGroups.get(room.id)!, (sizes.get(doorGroups.get(room.id)!) ?? 0) + 1);
    const largest = members.reduce((best, room) =>
      (sizes.get(doorGroups.get(room.id)!) ?? 0) > (sizes.get(doorGroups.get(best.id)!) ?? 0) ? room : best
    );
    start.add(largest.id);
  }
  return start;
}

/** Spreads through doors from the reached rooms. */
function spreadThroughDoors(reached: Set<string>, pairs: readonly RoomPair[]) {
  let grew = true;
  while (grew) {
    grew = false;
    for (const { guide, hasDoor } of pairs) {
      const [first, second] = guide.roomIds;
      if (!hasDoor || reached.has(first) === reached.has(second)) continue;
      reached.add(first);
      reached.add(second);
      grew = true;
    }
  }
}

/** The pairs that need a door: each reaches one more room, a pair with room for a door first, then the longest wall. */
function pairsNeedingDoors(rooms: readonly HousePlanRoom2D[], openings: readonly HouseRoomConnectionOpening[], pairs: readonly RoomPair[]) {
  const spans = pairs.flatMap((pair) => sharedWallSpans(pair.guide, rooms));
  const reached = startingRoomIds(rooms, pairs, entranceRoomIds(rooms, openings, spans));
  const needed = new Set<string>();
  spreadThroughDoors(reached, pairs);
  for (;;) {
    const frontier = pairs.filter(
      ({ guide }) => !needed.has(guide.id) && reached.has(guide.roomIds[0]) !== reached.has(guide.roomIds[1])
    );
    if (frontier.length === 0) return needed;
    const next = frontier.reduce((best, pair) => {
      const room = Number(pair.suggestions.length > 0) - Number(best.suggestions.length > 0);
      return room > 0 || (room === 0 && pair.guide.lengthMeters > best.guide.lengthMeters) ? pair : best;
    });
    needed.add(next.guide.id);
    next.guide.roomIds.forEach((roomId) => reached.add(roomId));
    spreadThroughDoors(reached, pairs);
  }
}

function connectivityWarnings(rooms: readonly HousePlanRoom2D[]): HouseRoomConnectionChecklistItem[] {
  const warnings: HouseRoomConnectionChecklistItem[] = [];
  const roomsByFloor = new Map<number, HousePlanRoom2D[]>();
  for (const room of rooms) {
    const floorLevel = typeof room.floorLevel === "number" && Number.isFinite(room.floorLevel) ? room.floorLevel : 1;
    roomsByFloor.set(floorLevel, [...(roomsByFloor.get(floorLevel) ?? []), room]);
  }
  for (const [floorLevel, floorRooms] of roomsByFloor) {
    const connectivity = buildHouseRoomConnectivityReport(floorRooms);
    for (const roomId of connectivity.detachedRoomIds) {
      const room = floorRooms.find((entry) => entry.id === roomId);
      if (!room) continue;
      warnings.push({ id: `floor-${floorLevel}-${roomId}-detached`, roomIds: [roomId], roomNames: [room.name], sharedWallLengthMeters: 0, status: "detached" });
    }
    for (const group of connectivity.disconnectedGroups) {
      const groupRooms = group.flatMap((roomId) => floorRooms.filter((entry) => entry.id === roomId));
      if (groupRooms.length <= 1) continue;
      warnings.push({
        id: `floor-${floorLevel}-${group.join("-")}-disconnected`,
        roomIds: groupRooms.map((room) => room.id),
        roomNames: groupRooms.map((room) => room.name),
        sharedWallLengthMeters: 0,
        status: "disconnected_group",
      });
    }
  }
  return warnings;
}

export function buildHouseRoomConnectionChecklist(
  rooms: HousePlanRoom2D[],
  openings: HouseRoomConnectionOpening[],
  activeRoomId?: string | null
): HouseRoomConnectionChecklistItem[] {
  const suggestions = buildHouseRoomDoorwaySuggestions(rooms);
  const pairs: RoomPair[] = buildHouseRoomAdjacencyGuides(rooms).map((guide) => ({
    guide,
    hasDoor: sharedWallSpans(guide, rooms).some((span) => openings.some((opening) => doorIsOnSharedWall(span, opening))),
    suggestions: suggestions.filter(
      (suggestion) => guide.roomIds.includes(suggestion.roomId) && guide.roomIds.includes(suggestion.adjacentRoomId)
    ),
  }));
  const needed = pairsNeedingDoors(rooms, openings, pairs);
  const pairItems = pairs.map(({ guide, hasDoor, suggestions: pairSuggestions }): HouseRoomConnectionChecklistItem => {
    const status = hasDoor ? "connected" : needed.has(guide.id) ? "needs_doorway" : "reachable";
    const doorwaySuggestion = status === "needs_doorway"
      ? pairSuggestions.find((suggestion) => suggestion.roomId === activeRoomId) ?? pairSuggestions[0]
      : undefined;
    return {
      id: guide.id,
      roomIds: guide.roomIds,
      roomNames: guide.roomIds.map((roomId) => rooms.find((room) => room.id === roomId)?.name ?? "Room"),
      sharedWallLengthMeters: guide.lengthMeters,
      status,
      doorwaySuggestion,
    };
  });
  return [...pairItems, ...connectivityWarnings(rooms)];
}

/** Needs a door, is detached or is apart from the plan: "Reached through other rooms" is fine. */
export function isConnectionBlocker(item: Pick<HouseRoomConnectionChecklistItem, "status">): boolean {
  return item.status !== "connected" && item.status !== "reachable";
}

/** The canvas's "Add door here" chips: only where the checklist says a door is needed. */
export function neededDoorwaySuggestions(
  rooms: HousePlanRoom2D[],
  openings: HouseRoomConnectionOpening[],
  activeRoomId?: string | null
): HouseRoomDoorwaySuggestion[] {
  const needed = buildHouseRoomConnectionChecklist(rooms, openings).filter((item) => item.status === "needs_doorway");
  return buildHouseRoomDoorwaySuggestions(rooms, activeRoomId).filter((suggestion) =>
    needed.some((item) => item.roomIds.includes(suggestion.roomId) && item.roomIds.includes(suggestion.adjacentRoomId))
  );
}
