import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CATALOG_ITEMS } from "../lib/catalog";
import type { CatalogItemSchema } from "../lib/catalog-schema";
import {
  HOUSE_PLAN_TEMPLATES,
  buildHousePlan2D,
  type HousePlanRoom2D,
  type HousePlanTemplate,
  type HousePlanTemplateFurnishingIntent,
  type HousePlanTemplateFurnishingPackId,
} from "../lib/design-page-house-plan";
import { resolveTemplateFurnishingProduct } from "../lib/design-page-template-furnishings";
import type { RoomOpening2D } from "../lib/editorScene";
import { buildFloorPlanQualityReport } from "../lib/floor-plan-quality";
import { buildPlanTemplateDocument } from "../lib/plan-template-document";
import {
  buildHouseRoomConnectionChecklist,
  isConnectionBlocker,
  neededDoorwaySuggestions,
} from "../lib/room-connection-checklist";
import { buildRoomHealthSummary, resolveDesignPageRoomHealthReviewTarget } from "../lib/room-health-summary";
import { BLANK_ROOM_TEMPLATE } from "../lib/start-design";
import { SINGLE_ROOM_TEMPLATES } from "../lib/single-room-templates";
import { fitTemplateFurnishing } from "../lib/template-furnishing-layout";

// UX phase 4g (audit ST9): the templates pass their own review. Every template, Empty and with
// each furnished pack, applied as the app applies it (`buildPlanTemplateDocument`), shows no review
// or improvement issue with any room active, needs no door, skips no furniture and has no
// furniture-fit issue.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

// The app picks the cheapest shoppable product per category. Sofas, floor lamps, dining benches
// and sideboards come only from the imported catalogue, so they stand in here at the size of a
// large one; the packs fit each piece to whatever size it gets.
const LARGE: Partial<Record<HousePlanTemplateFurnishingIntent["category"], [number, number]>> = {
  bed: [1.9, 2.2],
  sofa: [2.2, 0.95],
  floor_lamp: [0.45, 0.45],
  dining_bench: [1.5, 0.4],
  sideboard: [1.6, 0.45],
};
const sample = Object.values(CATALOG_ITEMS)[0];
function standIn(category: HousePlanTemplateFurnishingIntent["category"]): CatalogItemSchema | null {
  const size = LARGE[category];
  if (!size || !sample) return null;
  const id = `template-review-${category}`;
  // Registered as the runtime registers imported products, so the review can measure it.
  CATALOG_ITEMS[id] ??= {
    ...sample,
    id,
    title: `Large ${category}`,
    category,
    dimsMm: { ...sample.dimsMm, w: size[0] * 1000, d: size[1] * 1000 },
    bounds: { type: "aabb", size: { w: size[0], d: size[1], h: 0.8 } },
  } as CatalogItemSchema;
  return CATALOG_ITEMS[id];
}
const resolveProduct = (intent: HousePlanTemplateFurnishingIntent) =>
  resolveTemplateFurnishingProduct(intent) ?? standIn(intent.category);

function review(template: HousePlanTemplate, furnishingPackId?: HousePlanTemplateFurnishingPackId) {
  const name = `${template.label}${furnishingPackId ? ` (${furnishingPackId})` : " (Empty)"}`;
  const built = buildPlanTemplateDocument(template, {
    timestamp: 1,
    wallThickness: 0.12,
    roomHeight: 2.7,
    furnishingPackId,
    resolveProduct,
  });
  assert.deepEqual(built.skippedFurnishings, [], `${name} skips no furniture.`);
  if (furnishingPackId) assert.ok(built.furnishedItemCount > 0, `${name} places its furniture.`);
  const rooms = buildHousePlan2D(built.rooms, 8, 8).rooms;
  const items = built.rooms.flatMap((room) => room.items.map((item) => ({ ...item, roomId: room.id })));
  const checklist = buildHouseRoomConnectionChecklist(rooms, built.openings);
  assert.deepEqual(checklist.filter(isConnectionBlocker).map((item) => item.roomNames.join(" and ")), [], `${name}: every room is reached.`);
  for (const room of built.rooms) {
    const report = buildFloorPlanQualityReport({ rooms, openings: built.openings, items, activeRoomId: room.id });
    const issues = report.issues.filter((issue) => issue.severity !== "tip").map((issue) => issue.title);
    assert.deepEqual(issues, [], `${name} with ${room.name} active has no review or improvement issue.`);
    assert.equal(report.label, "Looks good", `${name} looks good.`);
  }
}

const templates = [...HOUSE_PLAN_TEMPLATES, ...SINGLE_ROOM_TEMPLATES, BLANK_ROOM_TEMPLATE];
assert.equal(HOUSE_PLAN_TEMPLATES.length, 13);
for (const template of templates) {
  review(template);
  for (const pack of template.furnishingPacks) review(template, pack.id);
}
for (const template of templates) {
  for (const pack of template.furnishingPacks) {
    assert.ok(!pack.intents.some((intent) => intent.category === "rug"), `${template.label}: rugs have no model, so packs have none.`);
  }
}

// A door counts anywhere on the shared wall, not only near its middle.
const room = (id: string, roomType: HousePlanRoom2D["roomType"], x: number, z: number, w: number, d: number): HousePlanRoom2D =>
  ({ id, name: id, roomType, shape: "rectangle", x, z, w, d }) as HousePlanRoom2D;
const door = (roomId: string, wall: RoomOpening2D["wall"], offsetMm: number): RoomOpening2D =>
  ({ id: `${roomId}-${wall}-${offsetMm}`, roomId, wall, offsetMm, widthMm: 800, kind: "door" });
const pair = [room("living", "living", 0, 0, 4, 4), room("bedroom", "bedroom", 4, 0, 4, 4)];
const statusOf = (rooms: HousePlanRoom2D[], openings: RoomOpening2D[]) =>
  buildHouseRoomConnectionChecklist(rooms, openings).map((item) => `${item.roomIds.join("-")}:${item.status}`);
assert.deepEqual(statusOf(pair, [door("bedroom", "west", 1500)]), ["living-bedroom:connected"], "A door near the wall's end counts.");
assert.deepEqual(statusOf(pair, [door("bedroom", "west", 2300)]), ["living-bedroom:needs_doorway"], "A door past the shared wall doesn't.");
assert.deepEqual(statusOf(pair, [door("bedroom", "north", 0)]), ["living-bedroom:needs_doorway"]);

// "Needs a door" only for rooms no door reaches: from a room with an outside door, or else the
// largest group joined by doors. The fewest doors that reach every room are asked for.
const lShape = [
  room("living", "living", 0, 0, 4, 4),
  room("bedroom", "bedroom", 4, 0, 4, 4),
  room("bath", "toilet", 4, 3.5, 4, 3),
  room("hall", "living", 0, 3.5, 4, 3),
];
const doors = [door("living", "east", 0), door("bedroom", "south", 0), door("hall", "north", 0)];
assert.deepEqual(statusOf(lShape, doors), [
  "living-bedroom:connected",
  "living-hall:connected",
  "bedroom-bath:connected",
  "bath-hall:reachable",
]);
const bathCut = statusOf(lShape, [doors[0], doors[2]]);
assert.deepEqual(bathCut.filter((status) => status.endsWith("needs_doorway")).length, 1, "One door reaches the bathroom.");
assert.deepEqual(bathCut, ["living-bedroom:connected", "living-hall:connected", "bedroom-bath:needs_doorway", "bath-hall:reachable"]);
// With an outside door into the bathroom only, the rest is reached from it: one door asked for.
const fromBath = statusOf(lShape, [door("bath", "east", 0), doors[0], doors[2]]);
assert.deepEqual(fromBath.filter((status) => status.endsWith("needs_doorway")).length, 1);
assert.equal(isConnectionBlocker({ status: "reachable" }), false);
assert.equal(isConnectionBlocker({ status: "needs_doorway" }), true);
// The canvas's "Add door here" chips follow the checklist.
assert.deepEqual(neededDoorwaySuggestions(lShape, doors), []);
assert.deepEqual(
  [...new Set(neededDoorwaySuggestions(lShape, [doors[0], doors[2]]).map((suggestion) => [suggestion.roomId, suggestion.adjacentRoomId].sort().join("-")))],
  ["bath-bedroom"]
);

// "Narrow" is for rooms people spend time in, as an improvement.
const narrow = (roomType: HousePlanRoom2D["roomType"]) =>
  buildFloorPlanQualityReport({ rooms: [room("r", roomType, 0, 0, 2, 3)], openings: [], items: [], activeRoomId: "r" })
    .issues.filter((issue) => issue.id === "narrow-room-r").map((issue) => issue.severity);
assert.deepEqual(narrow("toilet"), []);
assert.deepEqual(narrow("kitchen"), []);
assert.deepEqual(narrow("bedroom"), ["improvement"]);

// An empty room isn't "Blocked": it has no badge, and says what to do.
const [emptyRoom] = buildPlanTemplateDocument(BLANK_ROOM_TEMPLATE, { timestamp: 1, wallThickness: 0.12, roomHeight: 2.7 }).rooms;
const emptyHealth = buildRoomHealthSummary({ room: emptyRoom, catalogItems: CATALOG_ITEMS });
assert.equal(emptyHealth.level, "empty");
assert.equal(emptyHealth.nextAction, "Add furniture to start this room.");
assert.equal(resolveDesignPageRoomHealthReviewTarget(emptyHealth), null);
for (const file of ["components/editor/RoomPlanStatusBar.tsx", "components/editor/design-page/DesignPageEditorCommandBar.tsx"]) {
  assert.doesNotMatch(read(file), /=== "empty"/, `${file} shows no badge for an empty room (no label for it).`);
}

// A pack's piece fits its product: inside the room, a sofa's back to the wall, a lamp beside it.
const livingRoom = { width: 4.2, depth: 4.8, wallThickness: 0.12 };
const sofa = fitTemplateFurnishing({ category: "sofa", x: -1.25, z: -1.15, w: 2.2, d: 0.95 }, [], livingRoom);
assert.ok(sofa.x - sofa.w / 2 >= -livingRoom.width / 2, "The sofa stays inside the room.");
assert.equal(sofa.z, -1.845, "The sofa's back is against the wall (2.4 m, less the wall's 0.08 m, less half its depth).");
const lamp = fitTemplateFurnishing({ category: "floor_lamp", x: -2, z: -1.55, w: 0.45, d: 0.45 }, [sofa], livingRoom);
assert.ok(Math.abs(lamp.x - sofa.x) >= (sofa.w + lamp.w) / 2, "The lamp stands beside the sofa, not in it.");
const table = fitTemplateFurnishing({ category: "coffee_table", x: -1.25, z: -0.15, w: 1.2, d: 0.7 }, [sofa, lamp], livingRoom);
assert.equal(table.x, sofa.x);
assert.equal(Math.round((table.z - table.d / 2 - (sofa.z + sofa.d / 2)) * 100) / 100, 0.45, "The coffee table is a knee's width in front.");

// Wiring: the controller applies the pure document; Blank room has the first visit's openings.
const controller = read("lib/useDesignPageFloorPlanUnderlayController.ts");
assert.match(controller, /const built = buildPlanTemplateDocument\(template, \{\s*timestamp,\s*wallThickness,\s*roomHeight,\s*furnishingPackId: options\?\.furnishingPackId,\s*\}\);/);
assert.doesNotMatch(controller, /createRoom\(|resolveTemplateFurnishingProduct|isTemplateFurnishingNearDoorway/);
assert.deepEqual(
  buildPlanTemplateDocument(BLANK_ROOM_TEMPLATE, { timestamp: 1, wallThickness: 0.12, roomHeight: 2.7 }).openings.map(
    (opening) => [opening.kind, opening.wall, opening.offsetMm, opening.widthMm]
  ),
  [["door", "east", 0, 900], ["window", "west", 0, 1200]]
);
assert.match(read("components/editor/RoomConnectionChecklist.tsx"), /reachable: "Reached through other rooms",/);
assert.match(read("components/editor/renderers/RoomRenderer2D.tsx"), /return neededDoorwaySuggestions\(rooms, connectionOpenings, activeRoomId\)/);
for (const file of ["components/editor/DesignControlsPlanPanel.tsx", "lib/useDesignPagePlanPresentationModel.ts"]) {
  assert.doesNotMatch(read(file), /item\.status !== "connected"/, `${file} counts blockers with isConnectionBlocker.`);
}

console.log("Template review checks passed: 13 templates, the one-room Living room and Bedroom, and Blank room, Empty and furnished.");
