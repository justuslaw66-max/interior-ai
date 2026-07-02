/* eslint-disable @typescript-eslint/no-explicit-any */

import assert from "node:assert/strict";
import {
  buildAutoZones,
  normalizeItemsToRoom,
  normalizeZones,
  zonesEqual,
} from "../lib/design-page-zone-layout";
import {
  buildAutoSeatingZone,
  buildManualZoneFromSelection,
} from "../lib/design-page-zone-orchestration";
import { buildItemPlanningBoundsByInstanceId } from "../lib/design-page-config-state";
import {
  buildEditorScene2D,
  createPlanAnnotation,
} from "../lib/design-page-plan-scene";
import {
  mapPlanAnnotationsToRoomRenderer,
  mapPlanFixedElementsToRoomRenderer,
  mapPlanOpeningsToRoomRenderer,
  movePlanAnnotation,
  movePlanFixedElement,
  movePlanOpening,
} from "../lib/design-page-plan-overlays";

function runFixture(name: string, assertion: () => void) {
  try {
    assertion();
    console.log(`PASS: ${name}`);
  } catch (error) {
    console.error(`FAIL: ${name}`);
    throw error;
  }
}

runFixture("normalizeItemsToRoom clamps by planning footprint", () => {
  const items: any[] = [
    {
      instanceId: "chair-1",
      productId: "chair",
      variantId: "v1",
      position: [99, 0, -99],
      rotationY: 0,
    },
  ];
  const catalogItems: any = {
    chair: {
      id: "chair",
      dimsMm: { w: 1000, d: 1000, h: 900 },
      variants: [{ id: "v1", dimensionsMm: { w: 1000, d: 1000, h: 900 } }],
    },
  };

  const next = normalizeItemsToRoom({
    items,
    width: 4,
    depth: 4,
    wall: 0.1,
    catalogItems,
    resolveConfiguredPlanningDimsMm: () => ({ w: 1000, d: 1000, h: 900 }),
  });

  assert.deepEqual(next[0].position, [1.4, 0, -1.4]);
});

runFixture("buildAutoZones creates reading and tv zones and respects manual assignments", () => {
  const allItems: any[] = [
    { instanceId: "chair-a", productId: "chair", position: [0, 0, 0] },
    { instanceId: "lamp-a", productId: "lamp", position: [0.5, 0, 0] },
    { instanceId: "tv-a", productId: "tv", position: [2, 0, 2] },
    { instanceId: "chair-b", productId: "chair", position: [6, 0, 6] },
    { instanceId: "lamp-b", productId: "lamp", position: [6.4, 0, 6] },
  ];
  const catalogItems: any = {
    chair: { category: "accent_chair" },
    lamp: { category: "floor_lamp" },
    tv: { category: "tv_console" },
  };

  const manualZones: any[] = [
    {
      id: "manual-zone",
      type: "reading",
      source: "manual",
      itemIds: ["chair-b"],
      anchor: [6, 0, 6],
    },
  ];

  const autoZones = buildAutoZones({ allItems, manualZones, catalogItems });
  assert.equal(autoZones.length, 2);

  const reading = autoZones.find((zone) => zone.type === "reading");
  const tv = autoZones.find((zone) => zone.type === "tv");
  assert.ok(reading);
  assert.ok(tv);
  assert.deepEqual(reading?.itemIds.sort(), ["chair-a", "lamp-a"].sort());
  assert.deepEqual(tv?.itemIds, ["tv-a"]);
});

runFixture("normalizeZones removes missing items and recomputes anchor", () => {
  const allItems: any[] = [
    { instanceId: "a", position: [0, 0, 0] },
    { instanceId: "b", position: [2, 0, 2] },
  ];
  const zones: any[] = [
    { id: "z1", type: "reading", itemIds: ["a", "missing"], source: "manual" },
    { id: "z2", type: "tv", itemIds: ["missing"], source: "manual" },
  ];

  const normalized = normalizeZones(zones, allItems);
  assert.equal(normalized.length, 1);
  assert.deepEqual(normalized[0].itemIds, ["a"]);
  assert.deepEqual(normalized[0].anchor, [0, 0, 0]);
});

runFixture("zonesEqual checks ids/types/order-sensitive item ids", () => {
  const left: any[] = [{ id: "z1", type: "tv", itemIds: ["a", "b"] }];
  const same: any[] = [{ id: "z1", type: "tv", itemIds: ["a", "b"] }];
  const differentOrder: any[] = [{ id: "z1", type: "tv", itemIds: ["b", "a"] }];

  assert.equal(zonesEqual(left, same), true);
  assert.equal(zonesEqual(left, differentOrder), false);
});

runFixture("buildManualZoneFromSelection prunes selected ids from existing manual zones", () => {
  const selectedItems: any[] = [
    { instanceId: "i1", position: [0, 0, 0] },
    { instanceId: "i2", position: [2, 0, 0] },
  ];
  const selectedSet = new Set(["i1", "i2"]);
  const existingZones: any[] = [
    {
      id: "old-manual",
      type: "reading",
      source: "manual",
      itemIds: ["i1", "x1"],
      anchor: [0, 0, 0],
    },
    {
      id: "old-auto",
      type: "tv",
      source: "auto",
      itemIds: ["tv1"],
      anchor: [5, 0, 5],
    },
  ];

  const result = buildManualZoneFromSelection({
    selectedSet,
    selectedItems,
    pendingZoneType: "seating",
    existingZones,
  });

  assert.ok(result);
  assert.equal(result?.zones.length, 2);
  assert.deepEqual(result?.zones[0].itemIds, ["x1"]);
  assert.deepEqual(result?.zones[1].itemIds.sort(), ["i1", "i2"].sort());
});

runFixture("buildAutoSeatingZone creates one zone and ignores additional requests", () => {
  const sofa: any = { instanceId: "sofa-1", position: [1, 0, 1] };
  const initial = buildAutoSeatingZone({ sofaItem: sofa, existingZones: [] });
  assert.ok(initial);
  assert.equal(initial?.zones.length, 1);

  const secondAttempt = buildAutoSeatingZone({
    sofaItem: sofa,
    existingZones: initial?.zones ?? [],
  });
  assert.equal(secondAttempt, null);
});

runFixture("buildItemPlanningBoundsByInstanceId prefers variant dims without config override", () => {
  const items: any[] = [
    {
      instanceId: "item-1",
      productId: "p1",
      variantId: "variant-1",
      position: [0, 0, 0],
    },
    {
      instanceId: "item-2",
      productId: "p1",
      variantId: "variant-2",
      position: [0, 0, 0],
    },
  ];

  const catalogItems: any = {
    p1: {
      variants: [
        { id: "variant-1", dimensionsMm: { w: 1200, d: 800, h: 600 } },
        { id: "variant-2", dimensionsMm: { w: 0, d: 0, h: 0 } },
      ],
    },
  };

  const bounds = buildItemPlanningBoundsByInstanceId({
    items,
    catalogItems,
    resolveConfiguredPlanningDimsMm: () => ({ w: 999, d: 777, h: 555 }),
    resolveItemConfigurationEntry: (item) =>
      item?.instanceId === "item-2" ? { configurationCode: "something" } : null,
  });

  assert.deepEqual(bounds["item-1"], { w: 1200, d: 800, h: 600 });
  assert.deepEqual(bounds["item-2"], { w: 999, d: 777, h: 555 });
});

runFixture("buildEditorScene2D maps room and item planning bounds", () => {
  const scene = buildEditorScene2D({
    roomWidth: 4.2,
    roomDepth: 3.6,
    items: [
      {
        instanceId: "inst-1",
        productId: "p1",
        variantId: "v1",
        position: [1.2, 0, -0.8],
        rotationY: Math.PI / 2,
      } as any,
    ],
    catalogItems: {
      p1: {
        title: "Demo Product",
        category: "sofa",
        dimsMm: { w: 2000, d: 900, h: 800 },
      },
    } as any,
    itemPlanningBoundsByInstanceId: {
      "inst-1": { w: 2100, d: 950, h: 810 },
    },
    selectedInstanceId: "inst-1",
    planAnnotations: [],
    planOpenings: [],
    planFixedElements: [],
  });

  assert.equal(scene.room.widthMm, 4200);
  assert.equal(scene.room.depthMm, 3600);
  assert.equal(scene.items[0].widthMm, 2100);
  assert.equal(scene.items[0].depthMm, 950);
  assert.equal(scene.items[0].heightMm, 810);
  assert.equal(scene.items[0].rotationDeg, 90);
  assert.deepEqual(scene.items[0].positionMm, { x: 1200, z: -800 });
  assert.equal(scene.selectedItemId, "inst-1");
});

runFixture("createPlanAnnotation applies callout anchor defaults", () => {
  const note = createPlanAnnotation({ id: "a1", kind: "note", text: "  Keep clear  " });
  assert.deepEqual(note, {
    id: "a1",
    xMm: 0,
    zMm: 0,
    text: "Keep clear",
    kind: "note",
  });

  const callout = createPlanAnnotation({ id: "a2", kind: "callout", text: "  Door swing  " });
  assert.deepEqual(callout, {
    id: "a2",
    xMm: 450,
    zMm: 450,
    text: "Door swing",
    kind: "callout",
    anchorXMm: 0,
    anchorZMm: 0,
  });
});

runFixture("plan overlay mapper converts mm scene overlays to meters", () => {
  const mappedOpenings = mapPlanOpeningsToRoomRenderer([
    {
      id: "o1",
      wall: "north",
      kind: "door",
      offsetMm: 1200,
      widthMm: 900,
    },
  ]);
  assert.deepEqual(mappedOpenings, [
    {
      id: "o1",
      wall: "north",
      kind: "door",
      offset: 1.2,
      width: 0.9,
    },
  ]);

  const mappedFixed = mapPlanFixedElementsToRoomRenderer([
    {
      id: "f1",
      kind: "wardrobe",
      xMm: 250,
      zMm: -500,
      widthMm: 700,
      depthMm: 400,
      rotationDeg: 0,
      label: "Storage",
    },
  ]);
  assert.deepEqual(mappedFixed, [
    {
      id: "f1",
      x: 0.25,
      z: -0.5,
      w: 0.7,
      d: 0.4,
      label: "Storage",
    },
  ]);

  const mappedAnnotations = mapPlanAnnotationsToRoomRenderer([
    {
      id: "n1",
      xMm: 300,
      zMm: 450,
      text: "Flow",
      kind: "callout",
      anchorXMm: 0,
      anchorZMm: -200,
    },
  ]);
  assert.deepEqual(mappedAnnotations, [
    {
      id: "n1",
      x: 0.3,
      z: 0.45,
      text: "Flow",
      kind: "callout",
      anchorX: 0,
      anchorZ: -0.2,
    },
  ]);
});

runFixture("plan overlay move helpers update only targeted item", () => {
  const openings = movePlanOpening(
    [
      { id: "o1", wall: "north", kind: "door", offsetMm: 0, widthMm: 900 },
      { id: "o2", wall: "south", kind: "window", offsetMm: 100, widthMm: 600 },
    ],
    "o2",
    1.25
  );
  assert.equal(openings[0].offsetMm, 0);
  assert.equal(openings[1].offsetMm, 1250);

  const fixed = movePlanFixedElement(
    [
      {
        id: "f1",
        kind: "island",
        xMm: 0,
        zMm: 0,
        widthMm: 1000,
        depthMm: 600,
        rotationDeg: 0,
      },
      {
        id: "f2",
        kind: "wardrobe",
        xMm: 400,
        zMm: -300,
        widthMm: 800,
        depthMm: 500,
        rotationDeg: 0,
      },
    ],
    "f1",
    0.66,
    -0.2
  );
  assert.deepEqual(
    { xMm: fixed[0].xMm, zMm: fixed[0].zMm },
    { xMm: 660, zMm: -200 }
  );
  assert.deepEqual(
    { xMm: fixed[1].xMm, zMm: fixed[1].zMm },
    { xMm: 400, zMm: -300 }
  );

  const notes = movePlanAnnotation(
    [
      { id: "n1", xMm: 0, zMm: 0, text: "A", kind: "note" },
      { id: "n2", xMm: 100, zMm: 200, text: "B", kind: "room_tag" },
    ],
    "n2",
    0.05,
    0.45
  );
  assert.deepEqual(
    { xMm: notes[0].xMm, zMm: notes[0].zMm },
    { xMm: 0, zMm: 0 }
  );
  assert.deepEqual(
    { xMm: notes[1].xMm, zMm: notes[1].zMm },
    { xMm: 50, zMm: 450 }
  );
});

console.log("All Phase C module fixtures passed.");
