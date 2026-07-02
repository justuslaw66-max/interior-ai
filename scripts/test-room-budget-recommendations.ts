import assert from "node:assert/strict";
import { buildRoomBudgetRecommendations } from "../lib/room-budget-recommendations";
import type { CatalogItemSchema } from "../lib/catalog-schema";

const makeItem = (
  id: string,
  category: CatalogItemSchema["category"],
  price: number,
  styleTags: CatalogItemSchema["styleTags"] = ["modern"],
  dimsMm = { w: 900, d: 600, h: 500 }
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
    assets: {
      assetId: `${id}-asset`,
      modelUrl: "",
      thumbUrl: "",
      materialsProfile: { preset: "test" },
    },
    variants: [{ id: `${id}-default`, label: "Default", colorHex: "#999999", thumbnailUrl: "" }],
    defaultVariantId: `${id}-default`,
    commerce: { type: "affiliate", data: { retailer: "Fixture", url: "https://example.com", priceHint: price } },
  }) as CatalogItemSchema;

const recommendations = buildRoomBudgetRecommendations({
  catalogItems: [
    makeItem("sofa", "sofa", 1800),
    makeItem("coffee", "coffee_table", 450),
    makeItem("rug", "rug", 700),
    makeItem("lamp", "floor_lamp", 250),
    makeItem("duplicate-side", "side_table", 200),
    makeItem("premium-coffee", "coffee_table", 1800),
  ],
  currentSubtotal: 1600,
  budgetTarget: 2600,
  categoryCounts: { sofa: 1, side_table: 1 },
  recommendedCategories: ["sofa", "coffee_table", "rug", "side_table", "floor_lamp"],
  nextActionCategories: ["coffee_table", "rug", "floor_lamp"],
  roomWidth: 4,
  roomDepth: 4,
  activeStyle: "modern",
  productQuantities: { "duplicate-side": 1 },
  limit: 4,
});

assert.equal(recommendations[0].productId, "coffee");
assert.equal(recommendations[0].overBudget, false);
assert.equal(recommendations[0].remainingAfterAdd, 550);
assert.ok(recommendations.some((entry) => entry.productId === "rug"));
assert.ok(recommendations.findIndex((entry) => entry.productId === "premium-coffee") > 0);
assert.ok(!recommendations.some((entry) => entry.productId === "duplicate-side"));

console.log("Room budget recommendation checks passed");
