import assert from "node:assert/strict";
import {
  buildNewFloorRooms,
  clonePlanOpeningsForRoomMap,
  duplicateFloorRooms,
  formatFloorLevel,
  getDeletedFloorRoomIds,
  resolveActiveFloorLevel,
  resolveFloorOptions,
  resolveNextActiveRoomAfterFloorDelete,
  resolveNextFloorLevel,
} from "@/lib/floor-manager-logic";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { DesignItem, RoomSnapshot, ZoneMin } from "@/lib/room-types";

function makeItem(id: string): DesignItem {
  return {
    instanceId: id,
    productId: "sofa",
    variantId: "default",
    position: [0, 0, 0],
  };
}

function makeRoom(id: string, floorLevel: number, name = "Living Room"): RoomSnapshot {
  const item = makeItem(`${id}_item`);
  const zone: ZoneMin = {
    id: `${id}_zone`,
    type: "seating",
    itemIds: [item.instanceId],
  };

  return {
    id,
    name,
    roomType: "living",
    floorLevel,
    floorLabel: formatFloorLevel(floorLevel),
    geometry: {
      width: 5,
      depth: 4,
      height: 2.6,
      wallThickness: 0.12,
      slabThickness: 0.1,
    },
    planPosition: { x: 0, z: 0 },
    planShape: "rectangle",
    surfaceFinishes: { floorMaterialId: "oak", floorRotationDeg: 90 },
    surfaceOpacity: { wall: 0.8, floor: 0.9, ceiling: 1 },
    ceilingVisible: true,
    items: [item],
    zones: [zone],
    savedViews: [
      {
        id: `${id}_view`,
        name: "View",
        cameraPosition: [1, 2, 3],
        cameraTarget: [0, 0, 0],
      },
    ],
  };
}

const firstFloor = makeRoom("room_1", 1, "Living Room");
const secondFloor = makeRoom("room_2", 2, "Bedroom");
const basement = makeRoom("room_b1", 0, "Storage");
const rooms = [firstFloor, secondFloor, basement];

assert.equal(formatFloorLevel(1), "1F");
assert.equal(formatFloorLevel(3), "3F");
assert.equal(formatFloorLevel(0), "B1");
assert.equal(formatFloorLevel(-1), "B2");

assert.equal(resolveActiveFloorLevel(firstFloor), 1);
assert.equal(resolveActiveFloorLevel(null), 1);

assert.deepEqual(resolveFloorOptions(rooms), [
  { level: 0, label: "B1", roomCount: 1 },
  { level: 1, label: "1F", roomCount: 1 },
  { level: 2, label: "2F", roomCount: 1 },
]);

assert.equal(resolveNextFloorLevel(rooms, 1, "upper"), 3);
assert.equal(resolveNextFloorLevel(rooms, 1, "lower"), -1);

const blankFloor = buildNewFloorRooms({
  activeFloorLevel: 1,
  activeRoom: firstFloor,
  creationMode: "blank",
  direction: "upper",
  roomDepth: 4,
  roomHeight: 2.8,
  rooms,
  roomWidth: 5,
  timestamp: 100,
  wallThickness: 0.15,
});
assert.equal(blankFloor.nextLevel, 3);
assert.equal(blankFloor.nextFloorLabel, "3F");
assert.equal(blankFloor.nextRooms.length, 1);
assert.equal(blankFloor.nextRooms[0].id, "room_100");
assert.equal(blankFloor.nextRooms[0].items.length, 0);
assert.equal(blankFloor.nextRooms[0].surfaceFinishes?.floorMaterialId, "oak");
assert.equal(blankFloor.nextRooms[0].surfaceOpacity?.wall, 0.8);

const copiedWalls = buildNewFloorRooms({
  activeFloorLevel: 1,
  activeRoom: firstFloor,
  creationMode: "walls",
  direction: "upper",
  roomDepth: 4,
  roomHeight: 2.6,
  rooms,
  roomWidth: 5,
  timestamp: 200,
  wallThickness: 0.12,
});
assert.equal(copiedWalls.nextRooms.length, 1);
assert.equal(copiedWalls.nextRooms[0].items.length, 0);
assert.equal(copiedWalls.nextRooms[0].zones.length, 0);
assert.equal(copiedWalls.roomIdMap.get("room_1"), "room_200_0");

const copiedLayout = buildNewFloorRooms({
  activeFloorLevel: 1,
  activeRoom: firstFloor,
  creationMode: "layout",
  direction: "lower",
  roomDepth: 4,
  roomHeight: 2.6,
  rooms,
  roomWidth: 5,
  timestamp: 300,
  wallThickness: 0.12,
});
assert.equal(copiedLayout.nextLevel, -1);
assert.equal(copiedLayout.nextRooms[0].items[0].instanceId, "room_1_item_floor_300_0");
assert.deepEqual(copiedLayout.nextRooms[0].zones[0].itemIds, ["room_1_item_floor_300_0"]);
assert.equal(copiedLayout.nextRooms[0].savedViews[0].id, "room_1_view_floor_300_0");

const openings: RoomOpening2D[] = [
  { id: "door_1", roomId: "room_1", kind: "door", wall: "north", offsetMm: 1000, widthMm: 900 },
  { id: "window_2", roomId: "room_2", kind: "window", wall: "east", offsetMm: 1200, widthMm: 1200 },
];
assert.deepEqual(clonePlanOpeningsForRoomMap(openings, copiedLayout.roomIdMap, "floor_300"), [
  {
    id: "door_1_floor_300_0",
    roomId: "room_300_0",
    kind: "door",
    wall: "north",
    offsetMm: 1000,
    widthMm: 900,
  },
]);

const duplicated = duplicateFloorRooms({
  activeFloorLevel: 1,
  rooms,
  timestamp: 400,
});
assert.equal(duplicated.nextLevel, 3);
assert.equal(duplicated.nextRooms[0].floorLabel, "3F Copy");
assert.equal(duplicated.nextRooms[0].items[0].instanceId, "room_1_item_copy_400_0");
assert.deepEqual(duplicated.nextRooms[0].zones[0].itemIds, ["room_1_item_copy_400_0"]);
assert.deepEqual(clonePlanOpeningsForRoomMap(openings, duplicated.roomIdMap, "copy_400"), [
  {
    id: "door_1_copy_400_0",
    roomId: "room_400_0",
    kind: "door",
    wall: "north",
    offsetMm: 1000,
    widthMm: 900,
  },
]);

assert.deepEqual(Array.from(getDeletedFloorRoomIds(rooms, 1)), ["room_1"]);
assert.equal(resolveNextActiveRoomAfterFloorDelete(rooms, 1)?.id, "room_2");
assert.equal(resolveNextActiveRoomAfterFloorDelete([firstFloor], 1), null);

console.log("Floor manager logic tests passed");
