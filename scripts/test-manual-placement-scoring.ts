import assert from "node:assert/strict";
import type { CatalogItemSchema, ProductVariant } from "../lib/catalog-schema";
import { CATALOG_ITEMS } from "../lib/catalog";
import { resolveCatalogPlacementQuality } from "../lib/catalog-placement-policy";
import { computeCirculationAnalysis } from "../lib/circulation-analysis";
import { scoreManualPlacement } from "../lib/manual-placement-scoring";
import { getBoxGapToFinishedOutline, getRoomFinishedOutline, getRoomWallClearance } from "../lib/room-finished-faces";
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

// A rectangle's walkway map, as on the line before L-shaped and drawn rooms were measured to their own walls: the same cells,
// clearances and levels (a 10 mm laminate on the east wall).
const rectangleMap = computeCirculationAnalysis({
  room: { ...room, items: [], surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { east: { materialId: "greenlam-woodgrains-5394" } } } } },
  items: [], catalogItems, openings: [],
});
assert.deepEqual(
  [rectangleMap.heatmap.length, rectangleMap.minClearanceM, rectangleMap.heatmap[0], rectangleMap.heatmap.at(-1)],
  [32, 0.225, { x: -2.215, z: -1.7149999999999999, clearanceM: 0.225, level: "tight" },
    { x: 1.835, z: 1.435, clearanceM: 0.5049999999999998, level: "warn" }]
);

// L-shaped and drawn rooms are measured to their own walls, the notch's included (lib/room-finished-faces.ts); they were
// measured as their bounding rectangle. The L: 4 m × 4 m, its notch the south-east quarter, 12 cm walls.
const ell: RoomSnapshot = {
  ...room, id: "ell", items: [], zones: [{ id: "tv-zone", type: "tv", itemIds: [], anchor: [-1, 0, -1], source: "manual" }],
  geometry: { width: 4, depth: 4, wallThickness: 0.12 }, planShape: "custom_polygon",
  planPolygon: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 }],
};
// A TV console with its back 2 cm off the notch's north wall (z = 0, its face at -0.06): 14 cm from the far east wall.
const notchConsole = { instanceId: "tv-2", productId: tv.id, variantId: tv.defaultVariantId, position: [1, 0, -0.06 - 0.02 - 0.21] as [number, number, number], rotationY: Math.PI };
assert.ok(
  scoreManualPlacement({ room: ell, item: notchConsole, dimsMm: tv.dimsMm, catalogItems }).warnings.includes("Too tight against the wall."),
  "2 cm off the notch's wall, which the bounding rectangle measured as 14 cm from the east wall"
);
// Catalog placement quality, with a catalog console (1.5 m × 0.4 m) 2 cm off the same wall.
const SLOANE = "tv-real-castlery-sloane-tv-console-150";
const placementQuality = (position: [number, number, number], rotationY = Math.PI) => resolveCatalogPlacementQuality({
  pendingPlacement: { productId: SLOANE, variantId: CATALOG_ITEMS[SLOANE].defaultVariantId, position, rotationY } as Parameters<typeof resolveCatalogPlacementQuality>[0]["pendingPlacement"],
  score: null, blocked: false, blockerLabel: null, targetRoom: ell, catalogItems: CATALOG_ITEMS,
})?.label;
assert.equal(placementQuality([1, 0, -0.06 - 0.02 - 0.2]), "Tight to wall");
assert.equal(placementQuality([-1, 0, 0.3], Math.PI / 2), "Good spacing", "turned along the west arm, 74 cm from both its walls");
assert.equal(placementQuality([-0.4, 0, 0.9], Math.PI / 2), "Usable spacing", "14 cm from the notch's west wall");
assert.ok(Math.abs(getRoomWallClearance(ell, { x: 1, z: -0.29 }, { w: 1.6, d: 0.42 }) - 0.02) < 1e-9);
// A drawn rectangle measures as the rectangle does.
const drawnRectangle: RoomSnapshot = { ...room, planShape: "custom_polygon", planPolygon: [{ x: -2.5, z: -2 }, { x: 2.5, z: -2 }, { x: 2.5, z: 2 }, { x: -2.5, z: 2 }] };
for (const center of [{ x: 0, z: 0 }, { x: 1.7, z: -1.1 }, { x: -2.2, z: 1.6 }]) {
  assert.ok(Math.abs(getRoomWallClearance(drawnRectangle, center, { w: 1, d: 0.6 }) - getRoomWallClearance(room, center, { w: 1, d: 0.6 })) < 1e-9);
}

// The walkway map paints only the room's own floor: no cell in the notch, and one beside the notch's wall is tight there.
const ellMap = computeCirculationAnalysis({ room: ell, items: [], catalogItems, openings: [] });
assert.ok(ellMap.heatmap.length > 0 && ellMap.heatmap.every((cell) => cell.x < -0.06 || cell.z < -0.06), "no cell in the notch");
const besideNotch = ellMap.heatmap.find((cell) => Math.abs(cell.x - 0.985) < 1e-6 && Math.abs(cell.z + 0.365) < 1e-6);
assert.ok(besideNotch && besideNotch.level === "tight" && Math.abs(besideNotch.clearanceM - 0.305) < 1e-9, "30.5 cm from the notch wall's face");
// The path goes round the notch: from a door in the west arm's south wall to the zone in the north-east.
const ellPath = computeCirculationAnalysis({
  room: { ...ell, zones: [{ id: "far", type: "tv", itemIds: [], anchor: [1.4, 0, -1.4], source: "manual" }] }, items: [], catalogItems,
  openings: [{ id: "door", roomId: "ell", wall: "south", offsetMm: -1000, widthMm: 900, kind: "door" }],
});
assert.equal(ellPath.pathValid, true);
// A sofa across the elbow cuts the north-east arm off.
const elbowSofa = { instanceId: "sofa-2", productId: sofa.id, variantId: sofa.defaultVariantId, position: [-0.9, 0, -1] as [number, number, number], rotationY: Math.PI / 2 };
assert.equal(computeCirculationAnalysis({
  room: { ...ell, zones: [{ id: "far", type: "tv", itemIds: [], anchor: [1.4, 0, -1.4], source: "manual" }] }, items: [elbowSofa], catalogItems,
  openings: [{ id: "door", roomId: "ell", wall: "south", offsetMm: -1000, widthMm: 900, kind: "door" }],
}).pathValid, false);

// The gap to a wall's corner is the straight-line distance; an item past a face, or with a wall's corner in it, is negative.
const ellFaces = getRoomFinishedOutline(ell, { w: 4, d: 4 }, 0.06);
assert.ok(ellFaces);
const gap = (minX: number, maxX: number, minZ: number, maxZ: number) => getBoxGapToFinishedOutline(ellFaces, { minX, maxX, minZ, maxZ });
assert.ok(Math.abs(gap(-1, -0.06 - 0.03, -1, -0.06 - 0.04) - 0.05) < 1e-9, "3 cm and 4 cm off the inside corner: 5 cm from it");
assert.ok(Math.abs(gap(-0.5, 0.3, -0.5, 0.3) + 0.36) < 1e-9, "across the inside corner, its own corner 36 cm into the notch");
assert.ok(Math.abs(gap(0.5, 1, 0.5, 1) + 1.06) < 1e-9, "in the notch: its far corner 1.06 m past the walls' faces");
// An imported room keeps the bare wall (its panels are the next PR), and a courtyard's walls stand out of it into the room.
const courtyard: RoomSnapshot = {
  ...room, id: "imported", floorElevationMm: 0, planShape: "custom_polygon", geometry: { width: 4, depth: 4, wallThickness: 0.2 },
  planPolygon: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
  planHoles: [[{ x: -0.5, z: -0.5 }, { x: 0.5, z: -0.5 }, { x: 0.5, z: 0.5 }, { x: -0.5, z: 0.5 }]],
  surfaces: { walls: { default: { materialId: "greenlam-woodgrains-5394" } } },
};
assert.ok(Math.abs(getRoomWallClearance(courtyard, { x: 1, z: 0 }, { w: 0.6, d: 0.6 }) - 0.1) < 1e-9, "10 cm from the courtyard wall's face");
assert.ok(getRoomWallClearance(courtyard, { x: 0.5, z: 0 }, { w: 0.6, d: 0.6 }) < 0, "in the courtyard wall");
assert.ok(Math.abs(getRoomWallClearance(courtyard, { x: 0, z: 0 }, { w: 1.5, d: 1.5 }) + 0.15) < 1e-9,
  "over the whole courtyard: its walls' corners stand 15 cm into the item");

console.log("Manual placement scoring checks passed");
