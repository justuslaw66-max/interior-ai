import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  HOUSE_PLAN_TEMPLATES,
  type HousePlanTemplate,
  type HousePlanTemplateDoorway,
  type HousePlanTemplateWindow,
} from "@/lib/design-page-house-plan";
import {
  buildFloorPlanQualityReport,
  type QualityPlanItem,
} from "@/lib/floor-plan-quality";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";

function templateRooms(template: HousePlanTemplate): HousePlanRoom2D[] {
  return template.rooms.map((room) => ({
    id: room.id,
    name: room.name,
    roomType: room.roomType,
    shape: room.shape,
    x: room.x,
    z: room.z,
    w: room.width,
    d: room.depth,
  }));
}

function doorwayOpening(doorway: HousePlanTemplateDoorway, index: number): RoomOpening2D {
  return {
    id: `door-${index}`,
    roomId: doorway.fromRoomId,
    wall: doorway.wall,
    offsetMm: Math.round((doorway.offsetMeters ?? 0) * 1000),
    widthMm: Math.round((doorway.widthMeters ?? 0.9) * 1000),
    kind: "door",
  };
}

function windowOpening(window: HousePlanTemplateWindow, index: number): RoomOpening2D {
  return {
    id: `window-${index}`,
    roomId: window.roomId,
    wall: window.wall,
    offsetMm: Math.round((window.offsetMeters ?? 0) * 1000),
    widthMm: Math.round((window.widthMeters ?? 1.2) * 1000),
    kind: "window",
  };
}

function templateOpenings(template: HousePlanTemplate): RoomOpening2D[] {
  return [
    ...template.doorways.map(doorwayOpening),
    ...template.windows.map(windowOpening),
  ];
}

const starterTemplate = HOUSE_PLAN_TEMPLATES[0];
const starterReport = buildFloorPlanQualityReport({
  rooms: templateRooms(starterTemplate),
  openings: templateOpenings(starterTemplate),
  items: [],
  activeRoomId: starterTemplate.rooms[0]?.id,
});

assert.ok(starterReport.score > 0, "Starter templates should produce a nonzero score.");
assert.ok(
  starterReport.strengths.some((strength) => strength.includes("exterior light")),
  "Starter templates should expose natural-light strengths when windows are present."
);
assert.ok(
  starterReport.aiPlanningContext.roomGraph.nodes.length === starterTemplate.rooms.length,
  "AI planning context should expose one room graph node per template room."
);

const bedroomTemplate = HOUSE_PLAN_TEMPLATES.find((template) =>
  template.rooms.some((room) => room.roomType === "bedroom")
);
assert.ok(bedroomTemplate, "At least one starter template should include a bedroom.");
const bedroomRoom = bedroomTemplate.rooms.find((room) => room.roomType === "bedroom");
assert.ok(bedroomRoom, "Bedroom template should include a bedroom room.");
const fullBedroomReport = buildFloorPlanQualityReport({
  rooms: templateRooms(bedroomTemplate),
  openings: templateOpenings(bedroomTemplate),
  items: [],
  activeRoomId: bedroomRoom.id,
});
const missingBedroomWindowReport = buildFloorPlanQualityReport({
  rooms: templateRooms(bedroomTemplate),
  openings: templateOpenings(bedroomTemplate).filter(
    (opening) => !(opening.kind === "window" && opening.roomId === bedroomRoom.id)
  ),
  items: [],
  activeRoomId: bedroomRoom.id,
});
assert.ok(
  missingBedroomWindowReport.categoryScores.naturalLight < fullBedroomReport.categoryScores.naturalLight,
  "Removing a bedroom window should lower the light score."
);
assert.ok(
  missingBedroomWindowReport.issues.some((issue) => issue.action === "add_window"),
  "Missing bedroom light should create an add-window improvement."
);

const adjacentRooms: HousePlanRoom2D[] = [
  {
    id: "living",
    name: "Living Room",
    roomType: "living",
    shape: "rectangle",
    x: 0,
    z: 0,
    w: 4,
    d: 4,
  },
  {
    id: "bedroom",
    name: "Bedroom",
    roomType: "bedroom",
    shape: "rectangle",
    x: 4,
    z: 0,
    w: 4,
    d: 4,
  },
];
const missingDoorReport = buildFloorPlanQualityReport({
  rooms: adjacentRooms,
  openings: [
    {
      id: "living-window",
      roomId: "living",
      wall: "west",
      offsetMm: 0,
      widthMm: 1200,
      kind: "window",
    },
    {
      id: "bedroom-window",
      roomId: "bedroom",
      wall: "east",
      offsetMm: 0,
      widthMm: 1200,
      kind: "window",
    },
  ],
  items: [],
  activeRoomId: "living",
});
assert.ok(
  missingDoorReport.issues.some((issue) => issue.action === "add_doorway"),
  "Adjacent rooms without a doorway should create an improvement."
);

assert.ok(
  missingDoorReport.issues.some((issue) => issue.action === "add_storage"),
  "Plans without entry, storage, laundry, or utility signals should get a friendly storage tip."
);

const crampedProduct = Object.values(CATALOG_ITEMS).find((product) => product.dimsMm.w > 0 && product.dimsMm.d > 0);
assert.ok(crampedProduct, "Catalog should include at least one measurable product.");
const crampedItems: QualityPlanItem[] = [
  {
    instanceId: "cramped-item",
    productId: crampedProduct.id,
    variantId: crampedProduct.defaultVariantId,
    position: [1.95, 0, 0],
    rotationY: 0,
    roomId: "living",
  },
];
const crampedReport = buildFloorPlanQualityReport({
  rooms: [adjacentRooms[0]],
  openings: [],
  items: crampedItems,
  activeRoomId: "living",
});
assert.ok(
  crampedReport.issues.some((issue) => issue.action === "review_furniture_fit"),
  "Cramped furniture should create fit warnings."
);

assert.deepEqual(
  buildFloorPlanQualityReport({
    rooms: adjacentRooms,
    openings: [],
    items: [],
    activeRoomId: "living",
  }).aiPlanningContext,
  buildFloorPlanQualityReport({
    rooms: adjacentRooms,
    openings: [],
    items: [],
    activeRoomId: "living",
  }).aiPlanningContext,
  "AI planning context should be stable for the same deterministic inputs."
);

const planPanelSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "DesignControlsPlanPanel.tsx"),
  "utf8"
);
const controlsPanelSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "DesignControlsPanel.tsx"),
  "utf8"
);
const designPageSource = fs.readFileSync(
  path.join(process.cwd(), "app", "design", "page.tsx"),
  "utf8"
);
const qualitySource = fs.readFileSync(
  path.join(process.cwd(), "lib", "floor-plan-quality.ts"),
  "utf8"
);

assert.match(
  designPageSource,
  /buildFloorPlanQualityReport\(\{[\s\S]*?rooms: housePlan2D\.rooms[\s\S]*?openings: planOpenings[\s\S]*?activeRoomId: designSnapshot\.activeRoomId/,
  "Design page should compute quality from rooms, openings, items, and active room."
);
assert.match(
  controlsPanelSource,
  /floorPlanQualityReport\?: FloorPlanQualityReport \| null[\s\S]*?floorPlanQualityReport=\{floorPlanQualityReport\}/,
  "DesignControlsPanel should receive and pass the floor-plan quality report."
);
assert.match(
  planPanelSource,
  /data-testid="plan-quality-card"[\s\S]*?Plan quality[\s\S]*?data-testid="plan-quality-fixes"[\s\S]*?data-testid="plan-quality-primary-action"/,
  "Plan sidebar should render a compact quality card with fixes and a primary CTA."
);
assert.match(
  qualitySource,
  /"Add window"[\s\S]*?"Add doorway"[\s\S]*?"Review furniture fit"[\s\S]*?"Add storage"/,
  "Quality report CTAs should use friendly labels."
);
assert.match(
  designPageSource,
  /track\("floor_plan_quality_changed"[\s\S]*?track\("floor_plan_quality_fix_clicked"/,
  "Quality score changes and suggested-fix clicks should be tracked."
);
assert.match(
  designPageSource,
  /\/api\/ai\/layout/,
  "Existing AI layout flow should remain in place for future quality-context consumption."
);

console.log("Floor plan quality checks passed.");
