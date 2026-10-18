import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { applyAISuggestionAction, type AISuggestionEditor } from "@/lib/ai/applySuggestion";
import { parseDesignNotesInput, parseDesignNotesOutput } from "@/lib/ai/design-notes-contract";
import { createAiSuggestionEditor } from "@/lib/ai/design-notes-editor";
import {
  buildDesignNotesUserContent,
  buildFallbackDesignNotes,
  DESIGN_NOTES_RESPONSE_SCHEMA,
  parseCheckedDesignNotes,
} from "@/lib/ai/design-notes-prompt";
import { buildDesignNotesRequest } from "@/lib/ai/design-notes-request";
import {
  buildDesignNotesRoom,
  describeDesignNotesRoom,
  floorSwapProblem,
  hasDesignNotesFinish,
  parseDesignNotesRoom,
} from "@/lib/ai/design-notes-room";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { getItemPrice } from "@/lib/design-page-utils";
import { DEFAULT_FLOOR_MATERIAL_ID } from "@/lib/floor-materials";
import { buildFloorSurfaceIssues, getSlipClassNumber, type SurfaceCheckRoom } from "@/lib/floor-plan-surface-checks";
import type { DesignItem, RoomType } from "@/lib/room-types";
import { getFloorSwapCandidates, isFloorSwapCandidate } from "@/lib/surface-floor-swaps";
import { getRuntimeSurfaceMaterialById, SURFACE_MATERIAL_RENDER_REGISTRY } from "@/lib/surface-material-runtime";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

function designItem(productId: string, instanceId: string, qty?: number): DesignItem {
  const product = CATALOG_ITEMS[productId];
  assert.ok(product, `catalogue has ${productId}`);
  return { instanceId, productId, variantId: product.defaultVariantId ?? product.variants[0]?.id ?? "default", position: [0, 0, 0], qty };
}

// 1. The page tells AI notes what each product is (18 Oct 2026). Before, the page sent productId, quantity and price, and
//    the contract kept only the price.
function testItemsReachTheModel() {
  const bed = Object.values(CATALOG_ITEMS).find((item) => item.category === "bed");
  const table = Object.values(CATALOG_ITEMS).find((item) => item.category === "coffee_table");
  assert.ok(bed && table, "the catalogue has a bed and a coffee table");
  const body = buildDesignNotesRequest({
    designId: "design-1",
    items: [designItem(bed.id, "bed-1", 2), designItem(table.id, "table-1")],
    room: null,
    catalog: CATALOG_ITEMS,
    designerMode: false,
  });
  const parsed = parseDesignNotesInput(JSON.parse(JSON.stringify(body)));
  assert.ok(parsed, "the page's request passes the contract");
  const [first, second] = parsed.design.items;
  assert.deepEqual(
    {
      id: first.id,
      productId: first.productId,
      name: first.name,
      category: first.category,
      quantity: first.quantity,
      price: first.price,
      locked: first.locked,
    },
    {
      id: "bed-1",
      productId: bed.id,
      name: bed.title,
      category: "bed",
      quantity: 2,
      price: getItemPrice(bed),
      locked: false,
    },
    "the bed keeps its instance id, product, name, category, quantity and price"
  );
  assert.deepEqual(first.size, { width: bed.dimsMm.w / 1000, height: bed.dimsMm.h / 1000, depth: bed.dimsMm.d / 1000 });
  assert.equal(second.quantity, 1, "a product without a quantity counts once");
  assert.deepEqual(parsed.design.categories, ["bed", "coffee_table"]);
  assert.equal(parsed.design.budget, String(getItemPrice(bed) * 2 + getItemPrice(table)));
  assert.equal(parsed.mode, "homeowner");

  for (const quantity of [0, 1.5, 1000, "2"]) {
    assert.equal(
      parseDesignNotesInput({ design: { items: [{ id: "a", quantity }] } }),
      null,
      `quantity ${JSON.stringify(quantity)} is refused`
    );
  }
  assert.equal(
    parseDesignNotesInput({ design: { items: [{ name: "x".repeat(121) }] } })?.design.items[0].name,
    undefined,
    "a name over 120 characters is left out"
  );

  assert.match(read("lib/useDesignPageAiNotes.ts"), /buildDesignNotesRequest\(\{ designId, items, room: notesRoom, catalog: CATALOG_ITEMS, designerMode/);
  const route = read("app/api/ai/design-notes/route.ts");
  for (const key of ["productId", "name", "quantity"]) {
    assert.match(route, new RegExp(`${key}: i\\.${key},`), `the cache hash includes each item's ${key}`);
  }
}

// Real catalogue entries, as in test-floor-plan-surface-checks.ts.
const LUCE_R9 = "gardenia-flooring-luce-acciaio-0006083-120x120-nat";
const CAMOUFLAGE_R10_B = "gardenia-flooring-camouflage-ecru-beton-0016235-120x280-nat";
const ANIMA_OUTDOOR_R11 = "gardenia-flooring-anima-beige-0006354-60x120-r11";
const GIOIA_WHITE_BODY_WALL = "gardenia-wall-tile-gioia-beige-pf60008230-60x120-90227-0";

function checkRoom(roomType: RoomType, floorMaterialId: string | null, wallMaterialIds: string[] = []): SurfaceCheckRoom {
  return { id: `room-${roomType}`, name: roomType === "toilet" ? "Bathroom" : "Balcony", roomType, floorMaterialId, wallMaterialIds };
}

// 2. Floor swap candidates: published floors that clear the room's checks and whose sheet says they suit it.
function testFloorSwapCandidates() {
  const bathroom = checkRoom("toilet", LUCE_R9);
  const candidates = getFloorSwapCandidates(bathroom);
  assert.equal(candidates.length, 3, "an R9 bathroom floor gets three candidates");
  for (const record of candidates) {
    const facts = record.suitability;
    assert.equal(record.import_governance.publish_status, "published");
    assert.equal(record.surface_material.surface_category, "flooring");
    assert.ok((getSlipClassNumber(facts?.slip_rating) ?? 0) >= 10, `${record.surface_material.material_id} is R10 or more`);
    assert.ok(facts?.barefoot_slip_rating?.split("+").includes("B"), `${record.surface_material.material_id} is barefoot B`);
    assert.deepEqual(buildFloorSurfaceIssues({ ...bathroom, floorMaterialId: record.surface_material.material_id }), []);
  }
  const luce = getRuntimeSurfaceMaterialById(LUCE_R9);
  assert.ok(candidates.every((record) => record.classification.color_family === luce?.classification.color_family),
    "the nearest come first: Luce has no R10 floor, so the same colour family leads");
  assert.deepEqual(
    candidates.map((record) => record.surface_material.material_id),
    getFloorSwapCandidates(bathroom).map((record) => record.surface_material.material_id),
    "the order is stable"
  );
  assert.deepEqual(getFloorSwapCandidates(checkRoom("toilet", CAMOUFLAGE_R10_B)), [], "a floor the checks don't flag gets none");
  assert.deepEqual(getFloorSwapCandidates(checkRoom("living", LUCE_R9)), [], "R9 is fine in a living room");

  const balcony = getFloorSwapCandidates(checkRoom("balcony", CAMOUFLAGE_R10_B));
  assert.equal(balcony.length, 3);
  assert.ok(balcony.every((record) => record.suitability?.outdoor_floor), "a balcony gets floors in ABK's outdoor range");
  assert.ok(getFloorSwapCandidates(checkRoom("balcony", DEFAULT_FLOOR_MATERIAL_ID)).length > 0, "the starter floor on a balcony too");

  const draft = SURFACE_MATERIAL_RENDER_REGISTRY.find((record) =>
    record.import_governance.publish_status === "draft" && record.surface_material.surface_category === "flooring") ?? null;
  assert.ok(draft);
  assert.equal(isFloorSwapCandidate(checkRoom("balcony", LUCE_R9), draft), false, "never a draft");
  assert.equal(isFloorSwapCandidate(checkRoom("balcony", LUCE_R9), getRuntimeSurfaceMaterialById(GIOIA_WHITE_BODY_WALL)), false,
    "never a wall tile");
  assert.equal(isFloorSwapCandidate(checkRoom("balcony", ANIMA_OUTDOOR_R11), getRuntimeSurfaceMaterialById(ANIMA_OUTDOOR_R11)), false,
    "never the floor already laid");
  const factless = SURFACE_MATERIAL_RENDER_REGISTRY.find((record) =>
    record.import_governance.publish_status === "published" && record.surface_material.surface_category === "flooring" && !record.suitability);
  if (factless) {
    assert.equal(isFloorSwapCandidate(checkRoom("toilet", LUCE_R9), factless), false, "a floor without facts never qualifies");
  }
}

// 3. The room in the request: the page sends its type and material ids; the server parses them strictly.
function testRoomInTheRequest() {
  const designRoom = {
    id: "bath-1",
    name: "Bathroom",
    roomType: "toilet" as const,
    surfaces: { floorMaterialId: LUCE_R9, walls: { default: { materialId: GIOIA_WHITE_BODY_WALL }, faces: { north: { materialId: GIOIA_WHITE_BODY_WALL } } } },
  };
  const room = buildDesignNotesRoom(designRoom);
  assert.deepEqual(room, {
    id: "bath-1",
    name: "Bathroom",
    roomType: "toilet",
    floorMaterialId: LUCE_R9,
    wallMaterialIds: [GIOIA_WHITE_BODY_WALL],
  }, "one id per wall material");
  const body = buildDesignNotesRequest({ designId: null, items: [], room, catalog: CATALOG_ITEMS, designerMode: true });
  assert.deepEqual(parseDesignNotesInput(JSON.parse(JSON.stringify(body)))?.design.room, room, "the room survives the contract");

  assert.equal(parseDesignNotesRoom({ ...room, roomType: "garage" }), null, "an unknown room type is dropped");
  assert.equal(parseDesignNotesRoom({ ...room, roomType: "toString" }), null);
  assert.equal(parseDesignNotesRoom({ ...room, name: "x".repeat(121) }), null);
  assert.equal(parseDesignNotesRoom({ ...room, wallMaterialIds: Array.from({ length: 65 }, () => "a") }), null);
  assert.equal(parseDesignNotesRoom({ ...room, floorMaterialId: 7 }), null);
  assert.deepEqual(parseDesignNotesRoom({ ...room, floorMaterialId: null })?.floorMaterialId, null);
  assert.equal(parseDesignNotesInput({ design: { items: [], room: "bath" } })?.design.room, null);

  assert.equal(hasDesignNotesFinish(buildDesignNotesRoom({ id: "r", name: "Living", roomType: "living" })), false);
  assert.equal(hasDesignNotesFinish(checkRoom("living", DEFAULT_FLOOR_MATERIAL_ID)), false, "the starter floor isn't a finish");
  assert.equal(hasDesignNotesFinish(checkRoom("living", null, [GIOIA_WHITE_BODY_WALL])), true, "a catalogue wall is");
  assert.equal(hasDesignNotesFinish(checkRoom("living", LUCE_R9)), true, "a catalogue floor is");
}

// 4. What the model is told: the server's own facts, the findings and the candidates.
function testModelContext() {
  const room = checkRoom("toilet", LUCE_R9, [GIOIA_WHITE_BODY_WALL]);
  const context = describeDesignNotesRoom(room);
  assert.equal(context.floor && "slipClass" in context.floor ? context.floor.slipClass : null, "R9");
  assert.equal(context.walls[0] && "whiteBodyWallTile" in context.walls[0] ? context.walls[0].whiteBodyWallTile : null, true);
  assert.deepEqual(context.surfaceFindings.map((finding) => finding.title), ["Bathroom: the floor is R9"]);
  assert.match(context.surfaceFindings[0].detail, /homes aren't regulated/);
  assert.deepEqual(
    context.floorSwapCandidates.map((candidate) => candidate.materialId),
    getFloorSwapCandidates(room).map((record) => record.surface_material.material_id)
  );
  assert.deepEqual(describeDesignNotesRoom(checkRoom("living", DEFAULT_FLOOR_MATERIAL_ID)).floor, { fromTileCatalogue: false });
  const content = JSON.parse(buildDesignNotesUserContent({ design: { id: null, room, items: [], categories: [], budget: null }, mode: "designer" }));
  assert.equal(content.design.room.id, room.id, "the model gets the room id SWAP_SURFACE names");
  const actionSchema = DESIGN_NOTES_RESPONSE_SCHEMA.schema.properties.suggestions.items.properties.action;
  assert.ok(actionSchema.properties.type.enum.includes("SWAP_SURFACE"));
  assert.deepEqual(actionSchema.properties.surface.enum, ["floor"], "J, 18 Oct: floors only");
}

// 5. The server keeps a floor swap only for one of the room's candidates, and records the floor it replaces.
function testServerKeepsCheckedSwaps() {
  const room = checkRoom("toilet", LUCE_R9);
  const [best] = getFloorSwapCandidates(room);
  const bestId = best.surface_material.material_id;
  const answer = (action: Record<string, unknown>) => ({
    summary: ["One", "Two", "Three"],
    rationale: "Because.",
    suggestions: [
      { id: "rug", label: "Resize the rug", action: { type: "RUG_RESIZE_TO_SOFA" } },
      { id: "swap", label: "Swap the floor", action },
    ],
  });
  const kept = parseCheckedDesignNotes(answer({ type: "SWAP_SURFACE", roomId: room.id, surface: "floor", materialId: bestId }), room);
  assert.deepEqual(kept?.suggestions[1].action, {
    type: "SWAP_SURFACE",
    roomId: room.id,
    surface: "floor",
    materialId: bestId,
    fromMaterialId: LUCE_R9,
  });
  for (const [why, action] of [
    ["a tile that isn't a candidate", { type: "SWAP_SURFACE", roomId: room.id, surface: "floor", materialId: CAMOUFLAGE_R10_B }],
    ["another room", { type: "SWAP_SURFACE", roomId: "elsewhere", surface: "floor", materialId: bestId }],
    ["walls", { type: "SWAP_SURFACE", roomId: room.id, surface: "walls", materialId: bestId }],
  ] as const) {
    const checked = parseCheckedDesignNotes(answer(action), room);
    assert.deepEqual(checked?.suggestions.map((suggestion) => suggestion.id), ["rug"], `drops a swap to ${why}`);
  }
  assert.deepEqual(
    parseCheckedDesignNotes(answer({ type: "SWAP_SURFACE", roomId: room.id, surface: "floor", materialId: bestId }), null)
      ?.suggestions.map((suggestion) => suggestion.id),
    ["rug"],
    "no room, no swap"
  );
  assert.equal(parseDesignNotesOutput(answer({ type: "SWAP_SURFACE", roomId: room.id, surface: "floor" })), null,
    "a swap without a tile is outside the contract");
  const route = read("app/api/ai/design-notes/route.ts");
  assert.match(route, /parseCheckedDesignNotes\(cached\.resultJson, design\.room\)/, "cached notes are checked again");
  assert.match(route, /parseCheckedDesignNotes\(JSON\.parse\(textContent\) as unknown, design\.room\)/);
  assert.doesNotMatch(route, /parseDesignNotesOutput/, "the route never reads notes unchecked");

  const fallback = buildFallbackDesignNotes({ id: null, room, items: [], categories: [], budget: null });
  assert.deepEqual(fallback.suggestions.map((suggestion) => suggestion.action), [
    { type: "SWAP_SURFACE", roomId: room.id, surface: "floor", materialId: bestId, fromMaterialId: LUCE_R9 },
  ], "without a provider: the nearest candidate, and no furniture suggestions for a room without products");
  assert.match(fallback.suggestions[0].label, /^Bathroom: the floor is R9\. Swap it for /);
}

// 6. The page checks a swap again against the room as it is now, then lays it with the floor action.
async function testPageAppliesCheckedSwaps() {
  const designRoom = { id: "room-toilet", name: "Bathroom", roomType: "toilet" as const, surfaces: { floorMaterialId: LUCE_R9 } };
  const room = buildDesignNotesRoom(designRoom);
  const [best] = getFloorSwapCandidates(room!);
  const action = { type: "SWAP_SURFACE" as const, roomId: designRoom.id, surface: "floor" as const, materialId: best.surface_material.material_id, fromMaterialId: LUCE_R9 };
  assert.equal(floorSwapProblem(room, action), null);
  assert.match(floorSwapProblem(room, { ...action, roomId: "other" }) ?? "", /another room/);
  assert.match(floorSwapProblem(buildDesignNotesRoom({ ...designRoom, surfaces: { floorMaterialId: CAMOUFLAGE_R10_B } }), action) ?? "",
    /floor has changed/);
  assert.match(floorSwapProblem(room, { ...action, materialId: GIOIA_WHITE_BODY_WALL }) ?? "", /no longer suits/);

  const laid: Array<[string, string | null | undefined]> = [];
  const toasts: string[] = [];
  const editor: AISuggestionEditor = createAiSuggestionEditor({
    getItems: () => [],
    resizeRugToSofa: () => undefined,
    makeRoomCheaper: () => undefined,
    addItem: () => undefined,
    commitItems: () => undefined,
    showToast: (message) => toasts.push(message),
    applyFloorMaterialToRoom: (materialId, roomId) => laid.push([materialId, roomId]),
  }, designRoom);
  await applyAISuggestionAction({ action, editor });
  assert.deepEqual(laid, [[action.materialId, designRoom.id]], "the floor action lays the tile in that room");
  await assert.rejects(
    applyAISuggestionAction({ action: { ...action, fromMaterialId: CAMOUFLAGE_R10_B }, editor }),
    /floor has changed/
  );
  assert.equal(laid.length, 1, "a refused swap lays nothing");
  assert.match(read("lib/useDesignPageAiWorkspaceRegistration.ts"), /applyFloorMaterialToRoom: surfaceWorkspace\.actions\.applyFloorMaterialToRoom/);
}

async function main() {
  testItemsReachTheModel();
  testFloorSwapCandidates();
  testRoomInTheRequest();
  testModelContext();
  testServerKeepsCheckedSwaps();
  await testPageAppliesCheckedSwaps();
  console.log("AI notes checks passed: items, the room's surfaces and checked floor swaps.");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
