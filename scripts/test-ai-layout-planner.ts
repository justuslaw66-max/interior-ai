import assert from "node:assert/strict";
import {
  buildDeterministicLayoutPlan,
  buildDeterministicLivingRoomLayoutPlan,
} from "@/lib/ai/layout-planner";

const catalog = [
  { id: "budget-sofa", category: "sofa", price: 900, styleTags: ["modern"], dimensions: { w: 2, d: 0.9, h: 0.8 } },
  { id: "premium-sofa", category: "sectional_sofa", price: 2600, styleTags: ["modern"], dimensions: { w: 2.8, d: 1, h: 0.8 } },
  { id: "rug-1", category: "rug", price: 300, styleTags: ["modern"], dimensions: { w: 2, d: 1.5, h: 0.02 } },
  { id: "rug-2", category: "rug", price: 700, styleTags: ["modern"], dimensions: { w: 2.8, d: 2, h: 0.02 } },
  { id: "coffee-1", category: "coffee_table", price: 500, styleTags: ["modern"], dimensions: { w: 1.1, d: 0.6, h: 0.4 } },
  { id: "coffee-2", category: "coffee_table", price: 800, styleTags: ["modern"], dimensions: { w: 1.4, d: 0.7, h: 0.4 } },
  { id: "console-1", category: "sideboard", price: 900, styleTags: ["modern"], dimensions: { w: 1.8, d: 0.45, h: 0.7 } },
  { id: "chair-1", category: "armchair", price: 650, styleTags: ["modern"], dimensions: { w: 0.8, d: 0.85, h: 0.8 } },
  { id: "lamp-1", category: "floor_lamp", price: 220, styleTags: ["modern"], dimensions: { w: 0.35, d: 0.35, h: 1.6 } },
];

const livingPlan = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 5.6,
  roomDepth: 5.2,
  style: "Modern",
  budget: "$$$",
  seed: 1234,
  catalog,
});

assert.equal(livingPlan.meta.roomType, "living");
assert.equal(livingPlan.meta.supportedRoomType, true);
assert.equal(livingPlan.picks.sofa, "premium-sofa");
assert.equal(livingPlan.picks.tv_console, "console-1");
assert.equal(livingPlan.picks.accent_chair, "chair-1");
assert.equal(livingPlan.quality.fitRisk, "low");
assert.deepEqual(livingPlan.quality.requiredMissing, []);

const compactPlan = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 3,
  roomDepth: 2.8,
  style: "Modern",
  budget: "$",
  seed: 1234,
  catalog,
});

assert.equal(compactPlan.picks.sofa, "budget-sofa");
assert.equal(compactPlan.quality.fitRisk, "high");
assert.ok(compactPlan.quality.warnings.some((warning) => warning.includes("compact")));

const tooWidePlan = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 3.2,
  roomDepth: 4.2,
  style: "Modern",
  budget: "$$$",
  seed: 1234,
  catalog,
});

assert.equal(tooWidePlan.picks.sofa, "premium-sofa");
assert.equal(tooWidePlan.quality.fitRisk, "high");
assert.ok(tooWidePlan.quality.warnings.some((warning) => warning.includes("side clearance")));

const tooDeepPlan = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 5.6,
  roomDepth: 2.8,
  style: "Modern",
  budget: "$$$",
  seed: 1234,
  catalog,
});

assert.equal(tooDeepPlan.quality.fitRisk, "high");
assert.ok(tooDeepPlan.quality.warnings.some((warning) => warning.includes("media wall")));

const unsupported = buildDeterministicLayoutPlan({
  roomWidth: 3.6,
  roomDepth: 3,
  roomType: "kitchen",
  style: "Modern",
  budget: "$$",
  seed: 1234,
  catalog,
});

assert.equal("code" in unsupported ? unsupported.code : null, "unsupported_room_type");
assert.equal(unsupported.meta.roomType, "kitchen");

const incomplete = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 5,
  roomDepth: 4,
  style: "Modern",
  budget: "$$",
  seed: 1234,
  catalog: [{ id: "sofa-only", category: "sofa", price: 900, styleTags: ["modern"] }],
});

assert.deepEqual(incomplete.quality.requiredMissing, ["coffee_table"]);
assert.ok(incomplete.quality.completeness < 1);

const noRugCatalogPlan = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 5,
  roomDepth: 4,
  style: "Modern",
  budget: "$$",
  seed: 1234,
  catalog: catalog.filter((item) => item.category !== "rug"),
});

assert.equal(noRugCatalogPlan.picks.rug, null);
assert.deepEqual(noRugCatalogPlan.quality.requiredMissing, []);
assert.equal(noRugCatalogPlan.intent.rug, "optional_when_catalog_has_live_rugs");

const briefPlan = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 5.6,
  roomDepth: 5.2,
  style: "Modern",
  budget: "$$$",
  seed: 1234,
  catalog,
  requestedRoles: ["sofa", "coffee_table", "tv_console"],
});

assert.deepEqual(briefPlan.meta.requestedRoles, ["sofa", "coffee_table", "tv_console"]);
assert.equal(briefPlan.picks.sofa, "premium-sofa");
assert.equal(briefPlan.picks.coffee_table, "coffee-2");
assert.equal(briefPlan.picks.tv_console, "console-1");
assert.equal(briefPlan.picks.rug, null);
assert.equal(briefPlan.picks.accent_chair, null);
assert.equal(briefPlan.picks.floor_lamp, null);
assert.equal(briefPlan.quality.completeness, 1);
assert.deepEqual(briefPlan.quality.requestedMissing, []);

const missingOptionalBriefPlan = buildDeterministicLivingRoomLayoutPlan({
  roomWidth: 5.6,
  roomDepth: 5.2,
  style: "Modern",
  budget: "$$$",
  seed: 1234,
  catalog: catalog.filter((item) => item.category !== "floor_lamp"),
  requestedRoles: ["sofa", "coffee_table", "floor_lamp"],
});

assert.deepEqual(missingOptionalBriefPlan.meta.requestedRoles, [
  "sofa",
  "coffee_table",
  "floor_lamp",
]);
assert.deepEqual(missingOptionalBriefPlan.quality.requiredMissing, []);
assert.deepEqual(missingOptionalBriefPlan.quality.requestedMissing, ["floor_lamp"]);
assert.equal(missingOptionalBriefPlan.quality.completeness, 0.67);

console.log("AI layout planner fixtures passed");
