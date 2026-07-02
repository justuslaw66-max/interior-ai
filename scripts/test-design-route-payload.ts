import assert from "node:assert/strict";
import {
  buildDesignUpdatePayload,
  parseDesignClaimPayload,
  parseDesignCreatePayload,
} from "@/lib/design-route-payload";
import type { StoredDesign } from "@/lib/room-persistence";

function makeSnapshot(): StoredDesign {
  return {
    version: 3,
    activeRoomId: "room_1",
    title: "Beta Room",
    style: "modern",
    budget: "$$",
    rooms: [
      {
        id: "room_1",
        name: "Living Room",
        roomType: "living",
        floorLevel: 1,
        floorLabel: "Level 1",
        geometry: {
          width: 5,
          depth: 4,
          wallThickness: 0.12,
          height: 2.7,
          slabThickness: 0.18,
        },
        surfaceFinishes: {
          floorMaterialId: "oak-natural",
          floorRotationDeg: 90,
          floorScale: 1,
          ceilingColor: "#f8f8f6",
        },
        surfaceOpacity: {
          floor: 1,
          wall: 0.8,
          ceiling: 0.9,
        },
        ceilingVisible: true,
        items: [],
        zones: [],
        savedViews: [],
      },
    ],
  };
}

function runFixture(name: string, assertion: () => void) {
  try {
    assertion();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

runFixture("create payload accepts canonical v3 snapshots", () => {
  const sourceSnapshot = makeSnapshot();
  const result = parseDesignCreatePayload({
    title: "Client Room",
    roomWidth: 5,
    roomDepth: 4,
    items: [{ instanceId: "i1", productId: "p1" }],
    zones: [{ id: "zone_1" }],
    savedViews: [{ name: "Hero" }],
    snapshot: sourceSnapshot,
    style: "Japandi",
    budget: "$$$",
    mode: "designer",
    notes: "Keep rug optional",
    ignored: "nope",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.value.title, "Client Room");
  assert.equal(result.value.roomWidth, 5);
  assert.equal(result.value.roomDepth, 4);
  assert.equal(result.value.mode, "designer");
  assert.equal(result.value.snapshot?.rooms[0]?.surfaceOpacity?.wall, 0.8);

  sourceSnapshot.rooms[0].name = "Mutated";
  assert.equal(result.value.snapshot?.rooms[0]?.name, "Living Room");
});

runFixture("create payload derives legacy fields from active snapshot room", () => {
  const snapshot = makeSnapshot();
  snapshot.rooms[0].geometry.width = 7;
  snapshot.rooms[0].geometry.depth = 3.5;
  snapshot.rooms[0].items = [
    {
      instanceId: "snapshot-item",
      productId: "snapshot-product",
      variantId: "snapshot-variant",
      position: [1, 0, 1],
    },
  ];
  snapshot.rooms[0].zones = [{ id: "snapshot-zone", type: "seating", itemIds: ["snapshot-item"] }];
  snapshot.rooms[0].savedViews = [
    {
      id: "snapshot-view",
      name: "Snapshot View",
      cameraPosition: [1, 2, 3],
      cameraTarget: [0, 0, 0],
    },
  ];

  const result = parseDesignCreatePayload({
    title: "Canonical Room",
    roomWidth: 99,
    roomDepth: 99,
    items: [{ instanceId: "stale-item", productId: "stale-product" }],
    zones: [{ id: "stale-zone" }],
    savedViews: [{ id: "stale-view" }],
    snapshot,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.roomWidth, 7);
  assert.equal(result.value.roomDepth, 3.5);
  assert.equal((result.value.items as Array<{ instanceId: string }>)[0].instanceId, "snapshot-item");
  assert.equal((result.value.zones as Array<{ id: string }>)[0].id, "snapshot-zone");
  assert.equal((result.value.savedViews as Array<{ id: string }>)[0].id, "snapshot-view");
});

runFixture("create payload rejects malformed base payloads", () => {
  const result = parseDesignCreatePayload({
    roomWidth: "5",
    roomDepth: 4,
    items: [],
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.equal(
    result.error,
    "Invalid payload: roomWidth and roomDepth must be numbers, items must be array"
  );
});

runFixture("create payload rejects non-v3 snapshots", () => {
  const result = parseDesignCreatePayload({
    roomWidth: 5,
    roomDepth: 4,
    items: [],
    snapshot: { version: 2, rooms: [] },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "Invalid payload: snapshot must be a v3 design snapshot");
});

runFixture("create payload rejects snapshots with missing active rooms", () => {
  const snapshot = makeSnapshot();
  snapshot.activeRoomId = "missing-room";
  const result = parseDesignCreatePayload({
    roomWidth: 5,
    roomDepth: 4,
    items: [],
    snapshot,
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "Invalid payload: snapshot must be a v3 design snapshot");
});

runFixture("claim payload derives legacy fields from active v3 snapshot", () => {
  const snapshot = makeSnapshot();
  snapshot.rooms[0].geometry.width = 8.5;
  snapshot.rooms[0].geometry.depth = 4.25;
  snapshot.rooms[0].items = [
    {
      instanceId: "claimed-snapshot-item",
      productId: "claimed-product",
      variantId: "claimed-variant",
      position: [0, 0, 0],
    },
  ];
  snapshot.rooms[0].zones = [{ id: "claimed-zone", type: "seating", itemIds: ["claimed-snapshot-item"] }];
  snapshot.rooms[0].savedViews = [
    {
      id: "claimed-view",
      name: "Claimed View",
      cameraPosition: [2, 2, 2],
      cameraTarget: [0, 0, 0],
    },
  ];

  const result = parseDesignClaimPayload({
    anonymousId: " anon-123 ",
    roomType: "living_room",
    itemsCount: 1,
    designSnapshot: {
      title: "Guest Claim",
      roomWidth: 99,
      roomDepth: 99,
      items: [{ instanceId: "stale-claim-item" }],
      zones: [{ id: "stale-claim-zone" }],
      savedViews: [{ id: "stale-claim-view" }],
      snapshot,
      style: "modern",
      budget: "$$",
      mode: "homeowner",
      notes: "Claim me",
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.anonymousId, "anon-123");
  assert.equal(result.value.roomType, "living_room");
  assert.equal(result.value.itemsCount, 1);
  assert.equal(result.value.design.roomWidth, 8.5);
  assert.equal(result.value.design.roomDepth, 4.25);
  assert.equal((result.value.design.items as Array<{ instanceId: string }>)[0].instanceId, "claimed-snapshot-item");
  assert.equal((result.value.design.zones as Array<{ id: string }>)[0].id, "claimed-zone");
  assert.equal((result.value.design.savedViews as Array<{ id: string }>)[0].id, "claimed-view");
});

runFixture("claim payload rejects invalid anonymous ids and snapshots", () => {
  const missingAnonymous = parseDesignClaimPayload({
    anonymousId: "",
    designSnapshot: {
      roomWidth: 5,
      roomDepth: 4,
      items: [],
    },
  });
  assert.equal(missingAnonymous.ok, false);
  if (!missingAnonymous.ok) {
    assert.equal(missingAnonymous.error, "Invalid claim payload");
  }

  const invalidSnapshot = parseDesignClaimPayload({
    anonymousId: "anon-456",
    designSnapshot: {
      roomWidth: 5,
      roomDepth: 4,
      items: [],
      snapshot: { version: 3, activeRoomId: "missing", rooms: [] },
    },
  });
  assert.equal(invalidSnapshot.ok, false);
  if (!invalidSnapshot.ok) {
    assert.equal(invalidSnapshot.error, "Invalid payload: snapshot must be a v3 design snapshot");
  }
});

runFixture("update payload writes only known fields and clones JSON", () => {
  const items = [{ instanceId: "i1", productId: "p1" }];
  const result = buildDesignUpdatePayload({
    title: "Updated Room",
    items,
    unsafeField: "ignored",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.title, "Updated Room");
  assert.equal(result.value.unsafeField, undefined);
  assert.equal(Array.isArray(result.value.items), true);

  items[0].productId = "changed";
  assert.equal((result.value.items as Array<{ productId: string }>)[0].productId, "p1");
});

runFixture("update payload derives legacy fields from active snapshot room", () => {
  const snapshot = makeSnapshot();
  snapshot.rooms[0].geometry.width = 6.25;
  snapshot.rooms[0].geometry.depth = 4.75;
  snapshot.rooms[0].items = [
    {
      instanceId: "updated-snapshot-item",
      productId: "snapshot-product",
      variantId: "snapshot-variant",
      position: [0, 0, 0],
    },
  ];

  const result = buildDesignUpdatePayload({
    roomWidth: 2,
    roomDepth: 2,
    items: [{ instanceId: "stale-update-item" }],
    snapshot,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.roomWidth, 6.25);
  assert.equal(result.value.roomDepth, 4.75);
  assert.equal(
    (result.value.items as Array<{ instanceId: string }>)[0].instanceId,
    "updated-snapshot-item"
  );
});

runFixture("update payload rejects invalid snapshots", () => {
  const result = buildDesignUpdatePayload({
    notes: "Valid field",
    snapshot: { version: 3, activeRoomId: "", rooms: [] },
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error, "Invalid payload: snapshot must be a v3 design snapshot");
});

console.log("Design route payload fixtures passed");
