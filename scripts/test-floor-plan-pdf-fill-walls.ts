import assert from "node:assert/strict";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { addFillWalls, fillWallBands } from "@/lib/floor-plan-imports/pdf-fill-walls";
import { PdfFillGround } from "@/lib/floor-plan-imports/pdf-wall-faces";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";

// Walls the vectorizer missed, added from a vector PDF's black fill (8 Nov 2026). HDB fills its structural walls solid
// black; a long thin band of fill that no wall of the document runs along becomes a wall of its own. The apartment is
// 9260 x 6000 mm with a shared wall at x = 4000.

/** Fill ground with each [x0, z0, x1, z1] rectangle filled, as two triangles like the PDF draws it. */
function ground(...rects: Array<[number, number, number, number]>) {
  const fills = new PdfFillGround();
  for (const [x0, z0, x1, z1] of rects) {
    fills.addTriangle({ xMm: x0, zMm: z0 }, { xMm: x1, zMm: z0 }, { xMm: x1, zMm: z1 });
    fills.addTriangle({ xMm: x0, zMm: z0 }, { xMm: x1, zMm: z1 }, { xMm: x0, zMm: z1 });
  }
  return fills;
}

function errors(document: FloorPlanDocumentV2) {
  return validateFloorPlanDocumentV2(document).filter((issue) => issue.severity === "error").map((issue) => issue.code);
}

function testBands() {
  const bands = fillWallBands(ground([1000, 2900, 4000, 3100], [6000, 1000, 6300, 1300]));
  assert.equal(bands.length, 1, "a 300 mm square is a column, not a wall");
  const [band] = bands;
  assert.equal(band.axis, "z", "a band along x is a level wall");
  assert.equal(band.at, 3000);
  assert.equal(band.thicknessMm, 200);
  assert.ok(Math.abs(band.from - 1000) <= 20 && Math.abs(band.to - 4000) <= 20, `band runs ${band.from}-${band.to}`);
  const plumb = fillWallBands(ground([2000, 500, 2120, 2500]));
  assert.deepEqual(plumb.map((b) => [b.axis, b.at, b.thicknessMm]), [["x", 2060, 120]], "and one along z is plumb");
}

function testAddsTheMissingWall() {
  const document = authoredApartment();
  const floor = document.floors[0];
  const before = floor.walls.length;
  const result = addFillWalls(floor, ground([4000, 2900, 9260, 3100]));
  assert.deepEqual(result, { added: 1, refused: 0 });
  assert.equal(floor.walls.length, before + 1);
  const wall = floor.walls[floor.walls.length - 1];
  assert.equal(wall.classification, "structural", "an inside wall drawn black is structural");
  assert.equal(wall.thicknessMm, 200);
  assert.deepEqual(wall.adjacentRoomIds, [], "it bounds no room until the review closes one");
  assert.ok(wall.provenance.evidence.every((e) => e.basis === "vector_traced"));
  const [a, b] = [wall.path.startVertexId, wall.path.endVertexId].map((id) => floor.vertices.find((v) => v.id === id)!);
  assert.ok(a.zMm === 3000 && b.zMm === 3000);
  assert.ok(Math.min(a.xMm, b.xMm) > 4000 && Math.max(a.xMm, b.xMm) < 9260, "it stops short of the walls it meets, crossing none");
  assert.deepEqual(errors(document), [], "the document still passes the compiler");
}

function testLeavesWhatIsThere() {
  const document = authoredApartment();
  const before = JSON.stringify(document);
  const result = addFillWalls(document.floors[0], ground([0, -100, 9260, 100], [3950, 0, 4050, 6000]));
  assert.deepEqual(result, { added: 0, refused: 0 }, "fill along the document's own walls adds nothing");
  assert.equal(JSON.stringify(document), before);
}

function testIgnoresFillOffThePlan() {
  const document = authoredApartment();
  const result = addFillWalls(document.floors[0], ground([1000, 20_000, 5000, 20_200]));
  assert.deepEqual(result, { added: 0, refused: 0 }, "a black band far below the plan (a title block's) is not a wall");
}

function testOuterBandIsExterior() {
  const document = authoredApartment();
  const floor = document.floors[0];
  // A 300 mm black band just outside the east wall (a thicker outer skin the vectorizer read as the thin wall).
  const result = addFillWalls(floor, ground([9310, 1000, 9610, 3000]));
  assert.deepEqual(result, { added: 1, refused: 0 });
  assert.equal(floor.walls[floor.walls.length - 1].classification, "exterior", "a band on the plan's edge is exterior");
  assert.deepEqual(errors(document), []);
}

testBands();
testAddsTheMissingWall();
testLeavesWhatIsThere();
testIgnoresFillOffThePlan();
testOuterBandIsExterior();
console.log("floor-plan pdf fill walls: ok");
