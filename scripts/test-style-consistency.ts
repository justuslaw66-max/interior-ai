import assert from "node:assert/strict";
import { evaluateStyleConsistency } from "../lib/style-consistency";
import type { CatalogItemSchema, ProductVariant } from "../lib/catalog-schema";
import type { RoomSnapshot } from "../lib/room-types";

const makeItem = (
  id: string,
  category: CatalogItemSchema["category"],
  styleTags: CatalogItemSchema["styleTags"],
  toneTags: CatalogItemSchema["toneTags"],
  variant: ProductVariant
): CatalogItemSchema =>
  ({
    id,
    slug: id,
    title: id,
    category,
    dimsMm: { w: 1000, d: 600, h: 500 },
    bounds: { type: "aabb", size: { w: 1, d: 0.6, h: 0.5 }, center: [0, 0, 0] },
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
    toneTags,
    roomTags: ["living_room"],
    assets: {
      assetId: `${id}-asset`,
      modelUrl: "",
      thumbUrl: "",
      materialsProfile: { preset: "test" },
    },
    variants: [variant],
    defaultVariantId: variant.id,
    commerce: { type: "affiliate", data: { retailer: "Fixture", url: "https://example.com" } },
  }) as CatalogItemSchema;

const creamFabric: ProductVariant = {
  id: "cream",
  label: "Cream",
  colorHex: "#f4efe5",
  thumbnailUrl: "",
  finishLabel: "Cream linen",
  materialType: "Fabric",
};
const blackLeather: ProductVariant = {
  id: "black",
  label: "Black leather",
  colorHex: "#111111",
  thumbnailUrl: "",
  finishLabel: "Black leather",
  materialType: "Leather",
};
const mossFabric: ProductVariant = {
  id: "moss",
  label: "Moss",
  colorHex: "#66715a",
  thumbnailUrl: "",
  finishLabel: "Moss fabric",
  materialType: "Fabric",
};

const catalogItems = {
  sofa: makeItem("sofa", "sofa", ["modern"], ["neutral"], creamFabric),
  coffee: makeItem("coffee", "coffee_table", ["modern"], ["neutral"], creamFabric),
  side: makeItem("side", "side_table", ["modern"], ["neutral"], creamFabric),
  chair_bad: makeItem("chair_bad", "accent_chair", ["traditional"], ["dark"], blackLeather),
  chair_good: makeItem("chair_good", "accent_chair", ["modern"], ["neutral"], creamFabric),
  chair_ok: makeItem("chair_ok", "accent_chair", ["modern"], ["earth"], mossFabric),
};

const room: RoomSnapshot = {
  id: "living",
  name: "Living",
  roomType: "living",
  geometry: { width: 5, depth: 4 },
  items: [
    { instanceId: "sofa-1", productId: "sofa", variantId: "cream", position: [0, 0, -1] },
    { instanceId: "coffee-1", productId: "coffee", variantId: "cream", position: [0, 0, 0] },
    { instanceId: "side-1", productId: "side", variantId: "cream", position: [1, 0, 0] },
    { instanceId: "chair-1", productId: "chair_bad", variantId: "black", position: [-1, 0, 0] },
  ],
  zones: [],
  savedViews: [],
};

const clashing = evaluateStyleConsistency({
  room,
  selectedItem: room.items[3],
  catalogItems,
});
assert.ok(clashing);
assert.equal(clashing.status, "clashing");
assert.ok(clashing.findings.some((finding) => finding.kind === "style"));
assert.ok(clashing.findings.some((finding) => finding.kind === "tone"));
assert.ok(clashing.findings.some((finding) => finding.kind === "finish"));
assert.equal(clashing.alternatives[0].productId, "chair_good");

const cohesiveRoom: RoomSnapshot = {
  ...room,
  items: [
    ...room.items.slice(0, 3),
    { instanceId: "chair-2", productId: "chair_good", variantId: "cream", position: [-1, 0, 0] },
  ],
};
const cohesive = evaluateStyleConsistency({
  room: cohesiveRoom,
  selectedItem: cohesiveRoom.items[3],
  catalogItems,
});
assert.ok(cohesive);
assert.equal(cohesive.status, "cohesive");
assert.equal(cohesive.findings.length, 0);

console.log("Style consistency checks passed");
