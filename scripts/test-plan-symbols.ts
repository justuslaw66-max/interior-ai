import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PLAN_SYMBOLS, PLAN_SYMBOL_KINDS, buildPlanSymbol } from "../lib/plan-symbols/plan-symbol-library";
import {
  PLAN_SYMBOL_BASE_Y,
  PLAN_SYMBOL_LAYER_STEP,
  PLAN_SYMBOL_OVERLAY_Y,
  planSymbolShapesForItem,
} from "../lib/plan-symbols/plan-symbol-item";
import { resolvePlanSymbolKind } from "../lib/plan-symbols/plan-symbol-match";
import { tessellatePlanSymbol } from "../lib/plan-symbols/plan-symbol-tessellate";
import { planSymbolSvgDocument, planSymbolSvgGroup } from "../lib/plan-symbols/plan-symbol-svg";
import type { PlanSymbol, PlanSymbolPoint, PlanSymbolShape } from "../lib/plan-symbols/plan-symbol-types";
import { buildPlanSymbolSheet } from "./plan-symbol-sheet";

const TOLERANCE = 0.001;

function shapePoints(shape: PlanSymbolShape): PlanSymbolPoint[] {
  if (shape.type === "polyline") return shape.points;
  if (shape.type === "rect") {
    const hw = shape.width / 2;
    const hd = shape.depth / 2;
    return [[shape.cx - hw, shape.cz - hd], [shape.cx + hw, shape.cz + hd]];
  }
  if (shape.type === "ellipse") {
    return [[shape.cx - shape.rx, shape.cz - shape.rz], [shape.cx + shape.rx, shape.cz + shape.rz]];
  }
  return Array.from({ length: 33 }, (_, index) => {
    const degrees = shape.startDeg + ((shape.endDeg - shape.startDeg) * index) / 32;
    const radians = (degrees * Math.PI) / 180;
    return [shape.cx + shape.r * Math.cos(radians), shape.cz + shape.r * Math.sin(radians)] as const;
  });
}

function allNumbers(symbol: PlanSymbol): number[] {
  return JSON.stringify(symbol.shapes)
    .match(/-?\d+(\.\d+)?(e-?\d+)?|null/g)
    ?.map((value) => (value === "null" ? Number.NaN : Number(value))) ?? [];
}

function assertInsideFootprint(symbol: PlanSymbol, label: string) {
  const hw = symbol.width / 2 + TOLERANCE;
  const hd = symbol.depth / 2 + TOLERANCE;
  symbol.shapes.forEach((shape, index) => {
    for (const [x, z] of shapePoints(shape)) {
      assert.ok(Math.abs(x) <= hw && Math.abs(z) <= hd, `${label}: shape ${index} (${shape.type}) reaches ${x.toFixed(3)}, ${z.toFixed(3)}`);
    }
  });
}

function count(symbol: PlanSymbol, match: (shape: PlanSymbolShape) => boolean) {
  return symbol.shapes.filter(match).length;
}

// Every symbol draws, stays inside its footprint, and has an outline, from small to large products.
for (const kind of PLAN_SYMBOL_KINDS) {
  const { typical } = PLAN_SYMBOLS[kind];
  for (const factor of [0.75, 1, 1.3]) {
    const symbol = buildPlanSymbol(kind, typical.width * factor, typical.depth * factor);
    const label = `${kind} at ${factor}×`;
    assert.ok(symbol.shapes.length > 0, `${label}: draws something`);
    assert.ok(allNumbers(symbol).every(Number.isFinite), `${label}: every number is finite`);
    assertInsideFootprint(symbol, label);
    // A rug lies under the furniture, so it is drawn lighter.
    assert.ok(
      kind === "rug" || symbol.shapes.some((shape) => shape.stroke === "outline" || shape.dashed),
      `${label}: has a heavy outline, or is drawn dashed overhead`
    );
  }
  assert.deepEqual(buildPlanSymbol(kind, 1, 0.6), buildPlanSymbol(kind, 1, 0.6), `${kind}: the same size draws the same`);
  const tiny = buildPlanSymbol(kind, 0, Number.NaN);
  assert.ok(allNumbers(tiny).every(Number.isFinite), `${kind}: a missing or zero size still draws finite numbers`);
}

// Sofas gain seats with width; a seat count can be asked for.
const seatDividers = (width: number, seats?: number) =>
  count(buildPlanSymbol("sofa", width, 0.9, { seats }), (shape) => shape.type === "polyline" && !shape.closed);
assert.equal(seatDividers(1.5), 1, "a 1.5 m sofa has 2 seats");
assert.equal(seatDividers(2.1), 2, "a 2.1 m sofa has 3 seats");
assert.equal(seatDividers(2.1, 2), 1, "seats can be asked for");

// A sectional's chaise side mirrors it exactly.
const chaiseRight = buildPlanSymbol("sectional_sofa", 2.8, 1.6, { chaiseSide: "right" });
const chaiseLeft = buildPlanSymbol("sectional_sofa", 2.8, 1.6, { chaiseSide: "left" });
const pointsOf = (symbol: PlanSymbol, flip: number) =>
  symbol.shapes.map((shape) =>
    shape.type === "polyline" ? shape.points.map(([x, z]) => [Number((x * flip).toFixed(6)) + 0, z]) : []
  );
assert.deepEqual(pointsOf(chaiseLeft, 1), pointsOf(chaiseRight, -1), "a left chaise mirrors a right one");

// Dining sets: chairs follow the table, ends only once it is long; round sets are even.
const chairs = (symbol: PlanSymbol) => count(symbol, (shape) => shape.type === "polyline" && shape.closed) / 2;
assert.equal(chairs(buildPlanSymbol("dining_set", 1.85, 1.65)), 4, "a short set seats 4");
assert.equal(chairs(buildPlanSymbol("dining_set", 2.6, 1.75)), 8, "a 2.6 m set seats 8, with the ends");
assert.equal(chairs(buildPlanSymbol("dining_set", 2.6, 1.75, { chairs: 6 })), 6, "a chair count can be asked for");
for (const size of [1.2, 1.6, 1.9, 2.2]) {
  assert.equal(chairs(buildPlanSymbol("round_dining_set", size, size)) % 2, 0, `a ${size} m round set has an even count`);
}

// Beds: one pillow for a single, two from 1.2 m.
const pillows = (width: number) =>
  count(buildPlanSymbol("bed", width, 2.0), (shape) => shape.type === "polyline" && shape.closed);
assert.equal(pillows(0.95), 1, "a single bed has one pillow");
assert.equal(pillows(1.6), 2, "a queen bed has two");

// Hobs: burners from the size, or as asked.
const burners = (width: number, depth: number, requested?: number) =>
  count(buildPlanSymbol("hob", width, depth, { burners: requested }), (shape) => shape.type === "ellipse" && shape.stroke === "detail");
assert.equal(burners(0.3, 0.52), 2, "a domino hob has 2");
assert.equal(burners(0.75, 0.45), 2, "a 75 cm two-burner hob");
assert.equal(burners(0.86, 0.5), 3, "an 86 cm hob has 3");
assert.equal(burners(0.6, 0.52), 4, "a 60 cm square hob has 4");
assert.equal(burners(0.9, 0.52, 5), 5, "5 when asked");

// Sinks: a double bowl at 86 cm, a drainer beside one bowl from 1 m.
const bowls = (width: number) =>
  count(buildPlanSymbol("kitchen_sink", width, 0.48), (shape) => shape.type === "rect" && shape.stroke === "detail");
assert.equal(bowls(0.5), 1);
assert.equal(bowls(0.86), 2);
assert.equal(bowls(1.0), 1, "a 1 m sink is one bowl and a drainer");

// Categories and names find their symbol; things a plan doesn't draw find none.
const expectations: Array<[string, string, string | null]> = [
  ["sofa", "", "sofa"],
  ["sectional_sofa", "", "sectional_sofa"],
  ["accent_chair", "", "armchair"],
  ["chair", "", "dining_chair"],
  ["dining_table", "Seb dining set", "dining_set"],
  ["dining_table", "Seb dining table", "dining_table"],
  ["shelving", "", "bookshelf"],
  ["wall_art", "Canvas print", null],
  ["accessory", "Vase", null],
  ["other", "Samsung Bespoke Refrigerator", "fridge"],
  ["other", "Front-load washing machine 8kg", "washing_machine"],
  ["other", "Wall-hung water closet", "toilet"],
  ["other", "3-burner gas hob", "hob"],
  ["other", "Fiddle leaf fig plant", "plant"],
  ["", "Corner sofa with chaise", "sectional_sofa"],
];
for (const [category, name, expected] of expectations) {
  assert.equal(resolvePlanSymbolKind(category, name), expected, `"${category}" / "${name}"`);
}

// SVG: well formed, no NaN, one element per shape, scaled.
for (const kind of PLAN_SYMBOL_KINDS) {
  const symbol = buildPlanSymbol(kind, PLAN_SYMBOLS[kind].typical.width, PLAN_SYMBOLS[kind].typical.depth);
  const group = planSymbolSvgGroup(symbol, { pxPerMetre: 100 });
  assert.ok(!/NaN|undefined/.test(group), `${kind}: SVG has no NaN or undefined`);
  assert.equal((group.match(/\/>/g) ?? []).length, symbol.shapes.length, `${kind}: one element per shape`);
}
const toilet = planSymbolSvgDocument(buildPlanSymbol("toilet", 0.4, 0.68), { pxPerMetre: 1000 }, 4);
assert.match(toilet, /^<svg [^>]*width="408" height="688"/, "the document is the footprint plus its margin");
assert.match(toilet, /data-plan-symbol="toilet"/);

// The 2D plan's drawing: segments in pairs, paper layered in drawing order, and every
// symbol below the selection marks.
const layers = { baseY: PLAN_SYMBOL_BASE_Y, layerStep: PLAN_SYMBOL_LAYER_STEP };
for (const kind of PLAN_SYMBOL_KINDS) {
  const { typical } = PLAN_SYMBOLS[kind];
  const symbol = buildPlanSymbol(kind, typical.width * 1.3, typical.depth * 1.3);
  const drawing = tessellatePlanSymbol(symbol.shapes, layers);
  assert.ok(drawing.lines.length > 0, `${kind}: draws lines`);
  for (const batch of drawing.lines) {
    assert.equal(batch.segments.length % 2, 0, `${kind}: segments come in pairs`);
    assert.ok(batch.segments.flat().every(Number.isFinite), `${kind}: finite segments`);
  }
  assert.equal(drawing.fills.length, count(symbol, (shape) => Boolean(shape.fill)), `${kind}: one paper polygon per filled shape`);
  drawing.fills.forEach((fill, index) => {
    assert.ok(fill.points.length >= 3, `${kind}: paper ${index} is a polygon`);
    if (index > 0) assert.ok(fill.y > drawing.fills[index - 1].y, `${kind}: later paper sits higher`);
  });
  assert.ok(drawing.topY < PLAN_SYMBOL_OVERLAY_Y, `${kind}: the symbol stays under the selection marks (${drawing.topY})`);
}
const set = tessellatePlanSymbol(buildPlanSymbol("dining_set", 2.6, 1.75).shapes, layers);
const tablePaper = set.fills[set.fills.length - 1];
const chairLines = set.lines.find((batch) => batch.stroke === "detail");
assert.ok(chairLines, "a dining set has detail lines");
assert.ok(
  Math.min(...chairLines.segments.map(([, y]) => y)) < tablePaper.y,
  "the table's paper sits above its chairs' lines, so it covers the tucked-in part"
);
const unknown = planSymbolShapesForItem("wall_art", "Canvas print", 1.2, 0.04);
assert.equal(unknown.length, 1, "a product with no symbol draws one box");
assert.equal(unknown[0].type, "rect");
assert.deepEqual(
  planSymbolShapesForItem("sofa", "Auburn 3 Seater", 2.3, 0.93),
  buildPlanSymbol("sofa", 2.3, 0.93).shapes,
  "a placed sofa draws the sofa symbol at its footprint"
);

// The review sheet in the docs is what the code draws now.
const sheetPath = path.join(__dirname, "../docs/architecture/plan-symbol-sheet.svg");
assert.equal(
  readFileSync(sheetPath, "utf8"),
  buildPlanSymbolSheet(),
  "docs/architecture/plan-symbol-sheet.svg is stale: run npx tsx scripts/plan-symbol-sheet.ts docs/architecture/plan-symbol-sheet.svg"
);

console.log(`plan symbols: ${PLAN_SYMBOL_KINDS.length} symbols checked`);
