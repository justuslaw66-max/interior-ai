import assert from "node:assert/strict";

import { type CATALOG_ITEMS } from "@/lib/catalog";
import { normalizeDesignPageLocalBackup } from "@/lib/design-page-local-backup";

const instanceId = "persisted-live-catalog-item";
let planningResolverCalls = 0;

const restored = normalizeDesignPageLocalBackup({
  rawBackup: JSON.stringify({
    version: 3,
    activeRoomId: "room_living",
    rooms: [
      {
        id: "room_living",
        name: "Living Room",
        roomType: "living",
        geometry: { width: 5, depth: 4, wallThickness: 0.2 },
        items: [
          {
            instanceId,
            productId: "live-catalog-product",
            variantId: "live-catalog-variant",
            position: [0.5, 0, -0.25],
          },
        ],
        zones: [
          {
            id: "seating-zone",
            type: "seating",
            source: "manual",
            itemIds: [instanceId],
          },
        ],
        savedViews: [],
      },
    ],
  }),
  state: {
    activeRoomId: "room_living",
    roomWidth: 5,
    roomDepth: 4,
    wallThickness: 0.2,
  },
  configuration: {
    catalogItems: {} as typeof CATALOG_ITEMS,
    resolveConfiguredPlanningDimsMm: () => {
      planningResolverCalls += 1;
      return { w: 1000, d: 1000, h: 1000 };
    },
  },
});

assert.equal(restored.format, "v3");
assert.ok(restored.snapshot, "The v3 backup should produce a snapshot");
assert.equal(restored.snapshot.rooms.length, 1);
assert.deepEqual(restored.snapshot.rooms[0].items, [
  {
    instanceId,
    productId: "live-catalog-product",
    variantId: "live-catalog-variant",
    position: [0.5, 0, -0.25],
    qty: 1,
    includeInCheckout: true,
    locked: false,
  },
]);
assert.deepEqual(restored.snapshot.rooms[0].zones, [
  {
    id: "seating-zone",
    type: "seating",
    source: "manual",
    itemIds: [instanceId],
  },
]);
assert.equal(
  planningResolverCalls,
  0,
  "Unknown live-catalog products should retain their persisted transform without catalog-dependent clamping"
);

console.log("Design-page local-backup compatibility checks passed.");
