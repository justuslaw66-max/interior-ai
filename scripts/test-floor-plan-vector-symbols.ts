import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";

import type { PlanDrawingPrimitive, PlanVectorDrawing } from "../lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg } from "../lib/floor-plan-vector-export";
import type { FurnitureScheduleEntry } from "../lib/floor-plan-vector-furniture";
import {
  furnitureSymbolPrimitives,
  furnitureTagPrimitive,
  type FurnitureSymbolPlacement,
} from "../lib/floor-plan-vector-furniture-symbols";
import { buildPlanSymbol } from "../lib/plan-symbols/plan-symbol-library";
import { vectorExportFontBytes, vectorPdfPageContent } from "./fixtures/scan-to-editable-plan/pdf-vector-inspection";

const sofa: FurnitureSymbolPlacement = {
  id: "sofa-1", category: "sofa", name: "Madison Sofa", widthMm: 2100, depthMm: 920,
  centre: { xMm: 2000, zMm: 2500 }, rotationY: Math.PI / 2,
};
const fan: FurnitureSymbolPlacement = {
  id: "fan-1", category: "other", name: "Ceiling fan 52 inch", widthMm: 1320, depthMm: 1320,
  centre: { xMm: 2600, zMm: 1500 }, rotationY: 0,
};

// The symbol's shapes become paths in world millimetres, one per shape, with paper weights.
const sofaPaths = furnitureSymbolPrimitives(sofa);
assert.equal(sofaPaths.length, buildPlanSymbol("sofa", 2.1, 0.92).shapes.length, "every shape of the sofa symbol is its own path");
for (const primitive of sofaPaths) {
  assert.equal(primitive.kind, "path");
  if (primitive.kind !== "path") continue;
  assert.equal(primitive.role, "furniture-symbol");
  assert.ok(primitive.paperStrokeMm !== undefined && primitive.paperStrokeMm > 0, "symbol lines carry a paper weight");
  for (const point of primitive.points) {
    // Turned 90°, the 2.1 m sofa runs along z: within 460 mm of the centre on x, 1050 mm on z.
    assert.ok(Math.abs(point.xMm - 2000) <= 461 && Math.abs(point.zMm - 2500) <= 1051, `sofa stays in its turned footprint (${point.xMm}, ${point.zMm})`);
  }
}
const outlinePath = sofaPaths[0];
assert.ok(outlinePath.kind === "path" && outlinePath.paperFill && outlinePath.paperStrokeMm === 0.25, "the sofa's outline is paper-filled at 0.25 mm");
// Rotation follows the scene: the sofa's back (local −z) turns to −x at 90°.
const backBand = sofaPaths.find((primitive) => primitive.kind === "path" && primitive.paperStrokeMm === 0.18);
assert.ok(backBand && backBand.kind === "path", "the sofa has detail lines");

const fanPaths = furnitureSymbolPrimitives(fan);
assert.ok(fanPaths.some((primitive) => primitive.kind === "path" && primitive.paperDashMm), "a ceiling fan's sweep is dashed (matched by name)");

const tag = furnitureTagPrimitive(sofa, 3);
assert.deepEqual(tag, { id: "furniture:sofa-1:tag", kind: "text", text: "3", point: sofa.centre, role: "furniture-tag" });

// Both exporters draw paper, weights, dashes and tags; the PDF adds the schedule page.
const room = [{ xMm: 0, zMm: 0 }, { xMm: 4000, zMm: 0 }, { xMm: 4000, zMm: 3000 }, { xMm: 0, zMm: 3000 }, { xMm: 0, zMm: 0 }];
const schedule: FurnitureScheduleEntry[] = [
  { tag: 1, name: "Madison Sofa", variant: "2 Seater", sizeMm: { w: 2100, d: 920, h: 820 }, quantity: 1, rooms: ["Living Room"] },
  { tag: 2, name: "Ceiling fan 52 inch", sizeMm: { w: 1320, d: 1320, h: 400 }, quantity: 1, rooms: ["Living Room"] },
];
const roomOutline: PlanDrawingPrimitive = {
  id: "room", kind: "path", path: room.map((p, i) => `${i ? "L" : "M"} ${p.xMm} ${p.zMm}`).join(" "), fill: false, points: room, role: "fixture",
};
const drawing: PlanVectorDrawing = {
  geometryHash: "test",
  primitives: [
    roomOutline,
    ...sofaPaths,
    ...fanPaths,
    furnitureTagPrimitive(sofa, 1),
    furnitureTagPrimitive(fan, 2),
  ],
  unsupported: [],
  schedule,
};

async function main() {
  const fontBytes = new Uint8Array(await vectorExportFontBytes());
  const options = { paper: "A4" as const, orientation: "landscape" as const, scale: 50 as const, title: "Living room layout" };
  const svg = await exportFloorPlanVectorSvg(drawing, options, { fontBytes });
  assert.match(svg, /id="furniture:sofa-1:symbol:0"[^>]*fill="white"[^>]*stroke-width="12.5"/, "SVG: paper fill and 0.25 mm at 1:50");
  assert.match(svg, /id="furniture:fan-1:symbol:0"[^>]*stroke-dasharray="60 40"/, "SVG: the fan's sweep dashed 1.2/0.8 mm at 1:50");
  assert.match(svg, /<g id="furniture:sofa-1:tag"><circle [^>]*r="105" fill="white"/, "SVG: a tag is a paper circle of 2.1 mm");
  assert.match(svg, />1<\/text><\/g>/, "SVG: the tag's number");

  const bytes = await exportFloorPlanVectorPdf(drawing, options, { fontBytes });
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2, "PDF: the plan, then the furniture schedule");
  const content = vectorPdfPageContent(pdf);
  assert.match(content, /\[\s*60 40\s*\] 0 d/, "PDF: dashed sweep in paper millimetres");
  assert.match(content, /1 1 1 rg/, "PDF: symbols painted paper-white");

  const long: FurnitureScheduleEntry[] = Array.from({ length: 40 }, (_, index) => ({ ...schedule[0], tag: index + 1 }));
  const longPdf = await PDFDocument.load(await exportFloorPlanVectorPdf({ ...drawing, schedule: long }, options, { fontBytes }));
  assert.ok(longPdf.getPageCount() >= 3, "PDF: a long schedule continues on further pages");
  const plain = await PDFDocument.load(await exportFloorPlanVectorPdf({ ...drawing, schedule: undefined }, options, { fontBytes }));
  assert.equal(plain.getPageCount(), 1, "PDF: no schedule page without furniture");
  console.log("floor-plan vector symbols: paths, tags, SVG and PDF (with schedule) checked");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
