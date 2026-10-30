import assert from "node:assert/strict";
import type { CatalogItemSchema, ProductVariant } from "../lib/catalog-schema";
import { CATALOG_ITEMS } from "../lib/catalog";
import { resolveCatalogPlacementQuality } from "../lib/catalog-placement-policy";
import { computeCirculationAnalysis } from "../lib/circulation-analysis";
import { scoreManualPlacement } from "../lib/manual-placement-scoring";
import { getShapedRoomDoorPoints } from "../lib/room-door-points";
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
// A drawn rectangle measures as the rectangle does, inside and past its walls: a corner past two walls stands past them by
// the larger of its two overhangs, as the rectangle's four sides measure it, and not by the straight line to the corner.
const DEEP_LAMINATE = { materialId: "greenlam-woodgrains-5394", panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } } as const;
const rectangleWithPanel: RoomSnapshot = { ...room, surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { east: DEEP_LAMINATE } } } };
const drawnRectangle: RoomSnapshot = {
  ...room, planShape: "custom_polygon", planPolygon: [{ x: -2.5, z: -2 }, { x: 2.5, z: -2 }, { x: 2.5, z: 2 }, { x: -2.5, z: 2 }],
  surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "wall-1": DEEP_LAMINATE } } },
};
const cornerOverhang = { x: 2.5 - 0.06 - 0.044 - 0.5 + 0.1, z: -2 + 0.06 + 0.3 - 0.1 };
assert.ok(Math.abs(getRoomWallClearance(drawnRectangle, cornerOverhang, { w: 1, d: 0.6 }) + 0.1) < 1e-9, "10 cm past both walls: -10 cm");
for (let x = -3; x <= 3; x += 0.23) {
  for (let z = -2.5; z <= 2.5; z += 0.29) {
    const drawn = getRoomWallClearance(drawnRectangle, { x, z }, { w: 1, d: 0.6 });
    assert.ok(Math.abs(drawn - getRoomWallClearance(rectangleWithPanel, { x, z }, { w: 1, d: 0.6 })) < 1e-9, `at ${x}, ${z}`);
  }
}
// One narrower than its walls has no floor: every item stands past its faces, as in a rectangle that narrow.
const sliver = (shape: "rectangle" | "custom_polygon"): RoomSnapshot => ({
  ...room, geometry: { width: 0.1, depth: 2, wallThickness: 0.12 }, planShape: shape,
  planPolygon: shape === "rectangle" ? undefined : [{ x: -0.05, z: -1 }, { x: 0.05, z: -1 }, { x: 0.05, z: 1 }, { x: -0.05, z: 1 }],
});
assert.ok(Math.abs(getRoomWallClearance(sliver("custom_polygon"), { x: 0, z: 0 }, { w: 0.02, d: 0.5 }) -
  getRoomWallClearance(sliver("rectangle"), { x: 0, z: 0 }, { w: 0.02, d: 0.5 })) < 1e-9);
assert.equal(computeCirculationAnalysis({ room: sliver("custom_polygon"), items: [], catalogItems, openings: [] }).heatmap.length, 0);
// A north wall drawn with a slight kink, with a 44 mm laminate on its west half: a console 2 cm off the painted east half
// is 2 cm off it. The two halves' faces meet in a step at the kink, not 440 m away.
const kinkedRoom: RoomSnapshot = {
  ...room, geometry: { width: 4, depth: 3, wallThickness: 0.12 }, planShape: "custom_polygon",
  planPolygon: [{ x: -2, z: -1.5 }, { x: 0, z: -1.5001 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }],
  surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "wall-0": DEEP_LAMINATE } } },
};
assert.ok(Math.abs(getRoomWallClearance(kinkedRoom, { x: 1, z: -1.5 + 0.06 + 0.02 + 0.25 }, { w: 1, d: 0.5 }) - 0.02) < 1e-4);
assert.ok(Math.abs(getRoomWallClearance(kinkedRoom, { x: -1, z: -1.5 + 0.06 + 0.044 + 0.02 + 0.25 }, { w: 1, d: 0.5 }) - 0.02) < 1e-4);
const kinkedFaces = getRoomFinishedOutline(kinkedRoom, { w: 4, d: 3 }, 0.06);
assert.ok(kinkedFaces && kinkedFaces.bounds.maxX <= 2 && kinkedFaces.bounds.minX >= -2, "the walkway grid stays within the room");

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

// An L-shaped room's doors are where the plan and the 3D view put them, on the wall they resolve to: its wall names repeat,
// and the bounding rectangle's south side put this door 1.05 m east of where it is, at the notch.
const builtInL: RoomSnapshot = {
  ...room, id: "bl", items: [], zones: [{ id: "far", type: "tv", itemIds: [], anchor: [1.8, 0, -1.4], source: "manual" }],
  geometry: { width: 5, depth: 4, wallThickness: 0.12 }, planShape: "l_shape",
};
const southDoor = { id: "door-s", roomId: "bl", wall: "south" as const, offsetMm: 1200, widthMm: 900, kind: "door" as const };
const [lDoor] = getShapedRoomDoorPoints(builtInL, [southDoor]) ?? [];
assert.ok(lDoor && Math.abs(lDoor.center.x - 0.15) < 1e-9 && lDoor.center.z === 2 && lDoor.inward.z === -1, JSON.stringify(lDoor));
const besideLDoor = scoreManualPlacement({
  room: builtInL, item: { instanceId: "side-3", productId: sideTable.id, variantId: sideTable.defaultVariantId, position: [0.15, 0, 1.4] },
  dimsMm: sideTable.dimsMm, catalogItems, openings: [southDoor],
});
assert.ok(besideLDoor.warnings.includes("Too close to a door or its swing."));
// A door no wall takes (the plan marks it as not attached) is put on the wall nearest to where it asked to be: the L's east
// wall at its notch corner, not 1.2 m inside the notch, where the bounding rectangle's east side put it.
const [looseDoor] = getShapedRoomDoorPoints(builtInL, [{ ...southDoor, id: "door-e", wall: "east", offsetMm: 1500 }]) ?? [];
assert.ok(looseDoor && looseDoor.center.x === 2.5 && Math.abs(looseDoor.center.z - 0.32) < 1e-9, JSON.stringify(looseDoor));

console.log("Manual placement scoring checks passed");
