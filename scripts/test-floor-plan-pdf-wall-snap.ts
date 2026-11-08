import assert from "node:assert/strict";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { PdfFillGround, type PdfFace } from "@/lib/floor-plan-imports/pdf-wall-faces";
import { facePairFor, snapImportedWallsToPdf, snapWallsToPdf, wallRuns } from "@/lib/floor-plan-imports/pdf-wall-snap";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";

// Walls snapped to a vector PDF's own lines (8 Nov 2026): each straight run of level or plumb walls moves onto the
// middle of the PDF face pair it lies between and takes their distance apart as its thickness; an interior wall the
// PDF fills black is marked structural. The apartment: outer walls 200 mm, the shared wall at x = 4000 100 mm.

/** The PDF's faces for the apartment as drawn, every line `off` mm from where the document has it, `thickness` apart. */
function facesFor(document: FloorPlanDocumentV2, off: number, thickness: (wallId: string) => number): PdfFace[] {
  const floor = document.floors[0];
  return wallRuns(floor).flatMap((run) => {
    const t = thickness(run.walls[0].id);
    return [-t / 2, t / 2].map((side) => ({ axis: run.axis, at: run.at + off + side, from: run.from, to: run.to }));
  });
}

function errors(document: FloorPlanDocumentV2) {
  return validateFloorPlanDocumentV2(document).filter((issue) => issue.severity === "error").map((issue) => issue.code);
}

function testPairChoice() {
  const run = { axis: "x" as const, at: 1000, from: 0, to: 3000, thicknessMm: 200, walls: [], vertexIds: new Set<string>() };
  const face = (at: number, from = 0, to = 3000): PdfFace => ({ axis: "x", at, from, to });
  assert.deepEqual(facePairFor(run, [face(905), face(1085)]), { middle: 995, thickness: 180, cost: facePairFor(run, [face(905), face(1085)])?.cost });
  assert.equal(facePairFor(run, [face(905)]), null, "one face is not a wall");
  assert.equal(facePairFor(run, [face(1500), face(1650)]), null, "a pair beyond the run's reach is another wall's");
  assert.equal(facePairFor(run, [face(905, 0, 300), face(1085, 0, 300)]), null, "faces along under 30 % of the run are not its own");
  assert.equal(facePairFor(run, [face(990), face(1010)]), null, "20 mm apart is a line's two edges, not a wall");
  const chosen = facePairFor(run, [face(850), face(905), face(1085), face(1250)]);
  assert.equal(chosen?.middle, 995, "of several pairs, the one the run lies between");
}

function testSnap() {
  const document = authoredApartment();
  const floor = document.floors[0];
  const log = snapWallsToPdf(floor, facesFor(document, 23, (id) => (id === "shared" ? 90 : 210)), null);
  assert.equal(log.unmatched, 0);
  assert.equal(log.refused, 0);
  assert.equal(log.snapped, log.runs);
  assert.deepEqual(errors(document), [], "the snapped document passes the compiler (whole millimetres, no crossings)");
  assert.ok(floor.vertices.every((v) => Number.isInteger(v.xMm) && Number.isInteger(v.zMm)));
  assert.equal(floor.walls.find((w) => w.id === "shared")?.thicknessMm, 90, "the shared wall takes the drawing's thickness");
  assert.ok(floor.walls.filter((w) => w.id !== "shared").every((w) => w.thicknessMm === 210));
  const shared = floor.walls.find((w) => w.id === "shared")!;
  const a = floor.vertices.find((v) => v.id === shared.path.startVertexId)!;
  assert.equal(a.xMm, 4023, "and moves onto the drawing's line");
  assert.ok(log.shiftsMm.every((shift) => shift === 23));
}

function testLeftAsRead() {
  const document = authoredApartment();
  const before = JSON.stringify(document);
  const log = snapWallsToPdf(document.floors[0], [], null);
  assert.equal(log.snapped, 0);
  assert.equal(log.unmatched, log.runs, "with no PDF lines every run is left as read");
  assert.equal(JSON.stringify(document), before);
}

function testStructural() {
  const document = authoredApartment();
  const fills = new PdfFillGround();
  // The PDF fills the shared wall's band black (x 3950-4050, the whole length) and the west outer wall's.
  for (const [x0, x1] of [[3950, 4050], [-100, 100]]) {
    fills.addTriangle({ xMm: x0, zMm: -100 }, { xMm: x1, zMm: -100 }, { xMm: x1, zMm: 6100 });
    fills.addTriangle({ xMm: x0, zMm: -100 }, { xMm: x1, zMm: 6100 }, { xMm: x0, zMm: 6100 });
  }
  const log = snapWallsToPdf(document.floors[0], [], fills);
  const shared = document.floors[0].walls.find((w) => w.id === "shared")!;
  assert.equal(shared.classification, "structural", "an interior wall drawn solid black is structural");
  assert.ok(document.floors[0].walls.filter((w) => w.id !== "shared").every((w) => w.classification === "exterior"),
    "an outer wall stays exterior, black or not (the 3D cut-away treats structural walls as interior)");
  assert.equal(log.structural, 1);
}

function testSwitch() {
  const document = authoredApartment();
  assert.equal(snapImportedWallsToPdf(document, [], {}), "off", "off unless FLOOR_PLAN_PDF_WALL_SNAP=1");
  assert.equal(snapImportedWallsToPdf(document, [], { FLOOR_PLAN_PDF_WALL_SNAP: "1" }), "off", "and only on a vector page the vectorizer read");
}

testPairChoice();
testSnap();
testLeftAsRead();
testStructural();
testSwitch();
console.log("floor-plan PDF wall snap: ok");
