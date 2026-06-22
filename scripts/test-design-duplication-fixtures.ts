import assert from "node:assert/strict";
import {
  buildDuplicateTitle,
  buildDuplicatedDesignData,
} from "../lib/design-duplication";
import type { StoredDesign } from "../lib/room-persistence";

function runFixture(name: string, assertion: () => void) {
  try {
    assertion();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

runFixture("buildDuplicateTitle handles blank and normal titles", () => {
  assert.equal(buildDuplicateTitle("Cozy Loft"), "Cozy Loft (copy)");
  assert.equal(buildDuplicateTitle("   "), "Untitled Living Room (copy)");
});

runFixture("buildDuplicatedDesignData preserves snapshot fields and resets share", () => {
  const source = {
    title: "Client Living Room",
    roomWidth: 5.5,
    roomDepth: 4.3,
    items: [{ instanceId: "i1", productId: "p1" }],
    zones: [{ id: "z1", type: "seating", itemIds: ["i1"] }],
    savedViews: [{ id: "v1", name: "Top", cameraPosition: [0, 5, 0], cameraTarget: [0, 0, 0] }],
    style: "modern",
    budget: "mid",
    mode: "designer",
    notes: "Keep walkway clear",
  };

  const data = buildDuplicatedDesignData(source, "user_123");
  assert.equal(data.user.connect.id, "user_123");
  assert.equal(data.title, "Client Living Room (copy)");
  assert.equal(data.roomWidth, 5.5);
  assert.equal(data.roomDepth, 4.3);
  assert.deepEqual(data.items, source.items);
  assert.deepEqual(data.zones, source.zones);
  assert.deepEqual(data.savedViews, source.savedViews);
  assert.equal(data.style, "modern");
  assert.equal(data.budget, "mid");
  assert.equal(data.mode, "designer");
  assert.equal(data.notes, "Keep walkway clear");
  assert.equal(data.shareEnabled, false);
  assert.equal(data.shareToken, null);

  (source.items as Array<{ productId: string }>)[0].productId = "changed";
  assert.equal((data.items as Array<{ productId: string }>)[0].productId, "p1");
});

runFixture("buildDuplicatedDesignData derives legacy fields from valid snapshot", () => {
  const snapshot: StoredDesign = {
    version: 3,
    activeRoomId: "room_snapshot",
    rooms: [
      {
        id: "room_snapshot",
        name: "Snapshot Room",
        roomType: "living",
        geometry: { width: 6.4, depth: 3.8 },
        items: [
          {
            instanceId: "snapshot-item",
            productId: "snapshot-product",
            variantId: "snapshot-variant",
            position: [0, 0, 0],
          },
        ],
        zones: [{ id: "snapshot-zone", type: "seating", itemIds: ["snapshot-item"] }],
        savedViews: [
          {
            id: "snapshot-view",
            name: "Snapshot View",
            cameraPosition: [1, 2, 3],
            cameraTarget: [0, 0, 0],
          },
        ],
      },
    ],
  };

  const data = buildDuplicatedDesignData(
    {
      title: "Shared Design",
      roomWidth: 99,
      roomDepth: 99,
      items: [{ instanceId: "stale-item" }],
      zones: [{ id: "stale-zone" }],
      savedViews: [{ id: "stale-view" }],
      snapshot,
      style: null,
      budget: null,
      mode: null,
      notes: null,
    },
    "user_456"
  );

  assert.equal(data.roomWidth, 6.4);
  assert.equal(data.roomDepth, 3.8);
  assert.equal((data.items as Array<{ instanceId: string }>)[0].instanceId, "snapshot-item");
  assert.equal((data.zones as Array<{ id: string }>)[0].id, "snapshot-zone");
  assert.equal((data.savedViews as Array<{ id: string }>)[0].id, "snapshot-view");
  assert.equal((data.snapshot as unknown as StoredDesign).activeRoomId, "room_snapshot");

  snapshot.rooms[0].items[0].productId = "mutated";
  assert.equal((data.items as Array<{ productId: string }>)[0].productId, "snapshot-product");
});

runFixture("buildDuplicatedDesignData ignores invalid snapshots", () => {
  const data = buildDuplicatedDesignData(
    {
      title: "Legacy Design",
      roomWidth: 5,
      roomDepth: 4,
      items: [{ instanceId: "legacy-item", productId: "legacy-product" }],
      zones: [],
      savedViews: [],
      snapshot: { version: 3, activeRoomId: "missing", rooms: [] },
      style: null,
      budget: null,
      mode: null,
      notes: null,
    },
    "user_789"
  );

  assert.equal("snapshot" in data, false);
  assert.equal(data.roomWidth, 5);
  assert.equal((data.items as Array<{ instanceId: string }>)[0].instanceId, "legacy-item");
});

console.log("All design duplication fixtures passed.");
