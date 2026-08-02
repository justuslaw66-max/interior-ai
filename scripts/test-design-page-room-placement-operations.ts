import assert from "node:assert/strict";

import { CATALOG_ITEMS } from "@/lib/catalog";
import { computeAABB } from "@/lib/snapGuides";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type {
  DesignItem,
  DesignSnapshot,
  RoomSnapshot,
} from "@/lib/room-types";
import { transferDesignPageItemToRoom } from "@/lib/useDesignPageCrossRoomItemTransfer";
import {
  clampToPlacementRoom,
  findPlacementBlockerInRoom,
  isPlacementContainedInRoom,
  placementCollidesInRoom,
} from "@/lib/useDesignPagePlacementRoomQueries";

function makeRoom(
  id: string,
  name: string,
  items: DesignItem[] = []
): RoomSnapshot {
  return {
    id,
    name,
    roomType: "living",
    geometry: {
      width: 4,
      depth: 4,
      height: 2.8,
      wallThickness: 0.1,
    },
    items,
    zones: [],
    savedViews: [],
  };
}

function runPlacementRoomQueryTests() {
  const product = Object.values(CATALOG_ITEMS).find(
    (entry) => entry.category === "bed"
  );
  assert.ok(product, "Expected at least one bed catalog item");

  const blocker: DesignItem = {
    instanceId: "blocker",
    productId: product.id,
    variantId: product.defaultVariantId,
    position: [0, 0, 0],
  };
  const room = makeRoom("living", "Living Room", [blocker]);
  const getItemAABB = (item: DesignItem) =>
    computeAABB(item.position, 1, 1);
  const query = {
    room,
    productId: product.id,
    position: [0, 0, 0] as [number, number, number],
    rotationY: 0,
    dimensions: { w: 1000, d: 1000 },
    getItemAABB,
  };

  assert.equal(placementCollidesInRoom(query), true);
  assert.equal(
    placementCollidesInRoom({ ...query, excludedItems: "blocker" }),
    false
  );
  assert.equal(
    placementCollidesInRoom({ ...query, excludedItems: ["blocker"] }),
    false
  );
  assert.equal(findPlacementBlockerInRoom(query)?.instanceId, "blocker");

  assert.equal(
    isPlacementContainedInRoom({
      room,
      position: [0, 0, 0],
      rotationY: 0,
      dimensions: { w: 800, d: 800 },
    }),
    true
  );
  assert.equal(
    isPlacementContainedInRoom({
      room,
      position: [2, 0, 0],
      rotationY: 0,
      dimensions: { w: 800, d: 800 },
    }),
    false
  );

  const customRoom = makeRoom("custom", "Custom Room");
  const customHouseRoom = {
    id: customRoom.id,
    name: customRoom.name,
    shape: "custom_polygon",
    polygon: [
      { x: -2, z: -2 },
      { x: 2, z: -2 },
      { x: -2, z: 2 },
    ],
    x: 0,
    z: 0,
    w: 4,
    d: 4,
  } as HousePlanRoom2D;
  assert.equal(
    isPlacementContainedInRoom({
      room: customRoom,
      houseRoom: customHouseRoom,
      position: [-1, 0, -1],
      rotationY: 0,
      dimensions: { w: 200, d: 200 },
    }),
    true
  );
  assert.equal(
    isPlacementContainedInRoom({
      room: customRoom,
      houseRoom: customHouseRoom,
      position: [1.5, 0, 1.5],
      rotationY: 0,
      dimensions: { w: 200, d: 200 },
    }),
    false
  );

  const [clampedX, clampedZ] = clampToPlacementRoom(
    room,
    10,
    -10,
    1,
    1
  );
  assert.equal(clampedX, 1.43);
  assert.equal(clampedZ, -1.43);
  assert.equal(
    isPlacementContainedInRoom({
      room,
      position: [clampedX, 0, clampedZ],
      rotationY: 0,
      dimensions: { w: 1000, d: 1000 },
    }),
    true,
    "A placement snapped to the inner wall face clearance must remain valid."
  );
  assert.equal(
    isPlacementContainedInRoom({
      room,
      position: [clampedX + 0.01, 0, clampedZ],
      rotationY: 0,
      dimensions: { w: 1000, d: 1000 },
    }),
    false,
    "Containment must reject a placement beyond the shared wall clearance."
  );
}

function runCrossRoomTransferTest() {
  const product = Object.values(CATALOG_ITEMS).find(
    (entry) => entry.category === "bed"
  );
  assert.ok(product, "Expected at least one bed catalog item");

  const movedItem: DesignItem = {
    instanceId: "moving-item",
    productId: product.id,
    variantId: product.defaultVariantId,
    position: [0.5, 0, 0.5],
  };
  const sourceRoom = makeRoom("living", "Living Room", [movedItem]);
  sourceRoom.zones = [
    {
      id: "moving-zone",
      type: "seating",
      itemIds: [movedItem.instanceId],
    },
  ];
  const targetRoom = makeRoom("bedroom", "Bedroom");
  const snapshot: DesignSnapshot = {
    version: 3,
    activeRoomId: sourceRoom.id,
    rooms: [sourceRoom, targetRoom],
  };
  const refs = {
    designSnapshot: { current: snapshot },
    activeItems: { current: sourceRoom.items },
    dragCommit: { current: true },
  };
  const historyEvents: string[] = [];
  const toasts: string[] = [];
  let selectedIds = new Set<string>();
  let selectedPrimaryId: string | null = null;
  let committedSnapshot: DesignSnapshot = snapshot;
  const houseRoomById = new Map<string, HousePlanRoom2D>([
    [
      sourceRoom.id,
      {
        id: sourceRoom.id,
        name: sourceRoom.name,
        x: 0,
        z: 0,
        w: 4,
        d: 4,
        shape: "rectangle",
      } as HousePlanRoom2D,
    ],
    [
      targetRoom.id,
      {
        id: targetRoom.id,
        name: targetRoom.name,
        x: 5,
        z: 0,
        w: 4,
        d: 4,
        shape: "rectangle",
      } as HousePlanRoom2D,
    ],
  ]);

  const transferred = transferDesignPageItemToRoom({
    instanceId: movedItem.instanceId,
    sourceRoomId: sourceRoom.id,
    targetRoom,
    worldPosition: [5, 0, 0],
    configuration: { houseRoomById },
    refs,
    actions: {
      getPlanningDimensions: (_item, catalogProduct) => catalogProduct.dimsMm,
      clampToCatalogPlacementRoom: (
        _room,
        x,
        z
      ) => [x, z],
      isCatalogPlacementContainedInRoom: () => true,
      findCatalogPlacementBlockerInRoom: () => null,
      getItemDisplayName: () => null,
      setDesignSnapshot: (next) => {
        committedSnapshot =
          typeof next === "function" ? next(refs.designSnapshot.current) : next;
        refs.designSnapshot.current = committedSnapshot;
      },
      updateSelection: (next, primaryId) => {
        selectedIds = next;
        selectedPrimaryId = primaryId;
      },
      history: {
        rollbackContinuousCommand: (id) =>
          historyEvents.push(`rollback-continuous:${id}`),
        executeCommand: (command) => {
          historyEvents.push(`execute:${command.description}`);
          return command.execute(structuredClone(command.input));
        },
      },
      showToast: (message) => toasts.push(message),
    },
  });

  assert.equal(transferred, true);
  assert.deepEqual(historyEvents, [
    "rollback-continuous:scene-item-drag",
    "execute:Move item to Bedroom",
  ]);
  assert.equal(refs.dragCommit.current, false);
  assert.equal(committedSnapshot.activeRoomId, targetRoom.id);
  assert.equal(
    committedSnapshot.rooms.find((room) => room.id === sourceRoom.id)?.items
      .length,
    0
  );
  assert.equal(
    committedSnapshot.rooms.find((room) => room.id === sourceRoom.id)?.zones
      .length,
    0
  );
  assert.equal(
    committedSnapshot.rooms.find((room) => room.id === targetRoom.id)?.items[0]
      ?.position[0],
    0
  );
  assert.equal(refs.activeItems.current[0]?.instanceId, movedItem.instanceId);
  assert.deepEqual([...selectedIds], [movedItem.instanceId]);
  assert.equal(selectedPrimaryId, movedItem.instanceId);
  assert.deepEqual(toasts, ["Moved to Bedroom"]);
}

runPlacementRoomQueryTests();
runCrossRoomTransferTest();

console.log("Design-page placement room operation tests passed.");
