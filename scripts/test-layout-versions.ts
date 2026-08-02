import assert from "node:assert/strict";
import {
  appendLayoutVersion,
  compareLayoutVersion,
  createLayoutVersion,
  restoreLayoutVersion,
  summarizeLayoutVersionComparison,
} from "../lib/layout-versions";
import type { RoomSnapshot } from "../lib/room-types";

const room: RoomSnapshot = {
  id: "living",
  name: "Living",
  roomType: "living",
  geometry: { width: 5, depth: 4, wallThickness: 0.12 },
  items: [
    {
      instanceId: "sofa-1",
      productId: "sofa",
      variantId: "sofa-default",
      position: [0, 0, -1],
      rotationY: 0,
    },
    {
      instanceId: "coffee-1",
      productId: "coffee",
      variantId: "coffee-default",
      position: [0, 0, -0.2],
      rotationY: 0,
      materialOverrides: { colorHex: "#777777" },
    },
  ],
  zones: [
    {
      id: "seating-zone",
      type: "seating",
      itemIds: ["sofa-1", "coffee-1"],
      anchor: [0, 0, -0.6],
      source: "manual",
    },
  ],
  savedViews: [],
  layoutVersions: [],
};

const version = createLayoutVersion(room, {
  name: "Before TV wall",
  source: "manual",
  timestamp: 1_000,
});
assert.equal(version.name, "Before TV wall");
assert.equal(version.summary.itemCount, 2);
assert.equal(version.summary.zoneCount, 1);
assert.notEqual(version.items, room.items);
assert.notEqual(version.items[1].materialOverrides, room.items[1].materialOverrides);
assert.notEqual(version.zones[0].itemIds, room.zones[0].itemIds);

const changedRoom: RoomSnapshot = {
  ...room,
  items: [
    {
      ...room.items[0],
      position: [1, 0, -1],
      rotationY: Math.PI / 2,
    },
    {
      instanceId: "tv-1",
      productId: "tv",
      variantId: "tv-default",
      position: [0, 0, 1.6],
    },
  ],
  zones: [],
};

const comparison = compareLayoutVersion(changedRoom, version);
assert.equal(comparison.currentItemCount, 2);
assert.equal(comparison.savedItemCount, 2);
assert.equal(comparison.addedCount, 1);
assert.equal(comparison.removedCount, 1);
assert.equal(comparison.movedCount, 1);
assert.equal(comparison.rotatedCount, 1);
assert.equal(comparison.zoneDelta, -1);
const summary = summarizeLayoutVersionComparison(comparison);
assert.equal(summary.itemDeltaLabel, "same item count");
assert.equal(summary.movementLabel, "1 moved · 1 rotated · 1 added · 1 removed");
assert.equal(summary.zoneDeltaLabel, "saved has 1 more zone");
assert.equal(summary.restoreLabel, "Restore 2 items");

const roomWithVersion = appendLayoutVersion(room, version, 1);
assert.equal(roomWithVersion.layoutVersions?.length, 1);
assert.equal(roomWithVersion.layoutVersions?.[0].id, version.id);

const restored = restoreLayoutVersion(changedRoom, version);
assert.deepEqual(restored.items, room.items);
assert.deepEqual(restored.zones, room.zones);
assert.notEqual(restored.items, version.items);
assert.notEqual(restored.zones, version.zones);

console.log("Layout version checks passed");
