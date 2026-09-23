import assert from "node:assert/strict";
import type { CatalogItemSchema, ProductVariant } from "../lib/catalog-schema";
import { scoreManualPlacement } from "../lib/manual-placement-scoring";
import type { RoomSnapshot } from "../lib/room-types";

const makeCatalogItem = (
  id: string,
  category: CatalogItemSchema["category"],
  dimsMm = { w: 1000, d: 600, h: 500 },
  styleTags: CatalogItemSchema["styleTags"] = ["modern"],
  variants: ProductVariant[] = [
    {
      id: `${id}-default`,
      label: "Default",
      colorHex: "#999999",
      thumbnailUrl: "",
    } as ProductVariant,
  ]
): CatalogItemSchema =>
  ({
    id,
    slug: id,
    title: id,
    category,
    dimsMm,
    bounds: { type: "aabb", size: { w: dimsMm.w / 1000, d: dimsMm.d / 1000, h: dimsMm.h / 1000 }, center: [0, 0, 0] },
    pivot: { offsetX: 0, offsetZ: 0, groundAligned: true },
    defaultRotation: 0,
    placementRules: {
      floorOnly: true,
      wallSnappable: true,
      wallMountable: false,
      minWallGapMm: 0,
      allowRugOverlap: true,
      snapMarginMm: 50,
    },
    clearanceRules: {
      walkwayMinMm: 760,
      coffeeGapMinMm: 350,
      coffeeGapMaxMm: 1050,
      sofaClearanceMm: 500,
      wallClearanceMm: 100,
    },
    styleTags,
    toneTags: ["neutral"],
    roomTags: ["living_room"],
    assets: { modelUrl: "", thumbnailUrl: "" },
    variants,
    defaultVariantId: variants[0].id,
    commerce: { type: "affiliate", retailer: "Fixture", url: "https://example.com" },
  }) as unknown as CatalogItemSchema;

const sofa = makeCatalogItem("sofa", "sofa", { w: 2200, d: 900, h: 820 });
const coffee = makeCatalogItem("coffee", "coffee_table", { w: 900, d: 600, h: 380 }, ["modern"], [
  { id: "coffee-large", label: "Large", colorHex: "#999999", thumbnailUrl: "", dimensionsMm: { w: 1200, d: 700, h: 380 } },
  { id: "coffee-small", label: "Small", colorHex: "#888888", thumbnailUrl: "", dimensionsMm: { w: 700, d: 450, h: 360 } },
]);
const tv = makeCatalogItem("tv", "tv_console", { w: 1600, d: 420, h: 500 });
const sideTable = makeCatalogItem("side", "side_table", { w: 450, d: 450, h: 500 }, ["traditional"]);

const catalogItems = {
  sofa,
  coffee,
  tv,
  side: sideTable,
};

const room: RoomSnapshot = {
  id: "living",
  name: "Living",
  roomType: "living",
  geometry: { width: 5, depth: 4, wallThickness: 0.12 },
  items: [
    {
      instanceId: "sofa-1",
      productId: sofa.id,
      variantId: sofa.defaultVariantId,
      position: [0, 0, -0.9],
    },
  ],
  zones: [
    {
      id: "seating-zone",
      type: "seating",
      itemIds: ["sofa-1"],
      anchor: [0, 0, -0.75],
      source: "auto",
    },
  ],
  savedViews: [],
};

const goodCoffee = scoreManualPlacement({
  room,
  item: {
    instanceId: "coffee-1",
    productId: coffee.id,
    variantId: "coffee-large",
    position: [0, 0, -0.15],
  },
  dimsMm: { w: 1200, d: 700, h: 380 },
  catalogItems,
});
assert.equal(goodCoffee.label, "Great");
assert.equal(goodCoffee.relationship, "good");
assert.ok(goodCoffee.actions.includes("try_smaller_variant"));

const wrongZone = scoreManualPlacement({
  room,
  item: {
    instanceId: "tv-1",
    productId: tv.id,
    variantId: tv.defaultVariantId,
    position: [0, 0, -0.7],
  },
  dimsMm: tv.dimsMm,
  catalogItems,
});
assert.equal(wrongZone.label, "Wrong zone");

const byDoor = scoreManualPlacement({
  room,
  item: {
    instanceId: "side-1",
    productId: sideTable.id,
    variantId: sideTable.defaultVariantId,
    position: [0, 0, 1.85],
  },
  dimsMm: sideTable.dimsMm,
  catalogItems,
  openings: [{ id: "door-1", roomId: "living", wall: "south", offsetMm: 0, widthMm: 900, kind: "door" }],
});
assert.equal(byDoor.label, "Blocks path");
assert.match(byDoor.summary, /door/i);

const blocked = scoreManualPlacement({
  room,
  item: {
    instanceId: "side-2",
    productId: sideTable.id,
    variantId: sideTable.defaultVariantId,
    position: [0, 0, -0.85],
  },
  dimsMm: sideTable.dimsMm,
  catalogItems,
  blocker: room.items[0],
});
assert.equal(blocked.label, "Blocks path");
assert.ok(blocked.actions.includes("move_blocker_aside"));
assert.ok(blocked.actions.includes("place_beside_blocker"));

console.log("Manual placement scoring checks passed");
