import assert from "node:assert/strict";
import { validateFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence, SourceVectorPath, SourceVectorSegment } from "@/lib/floor-plan-imports/deterministic-evidence";
import { PdfFillGround, type PdfFace, pdfPageDrawing } from "@/lib/floor-plan-imports/pdf-wall-faces";
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

function testAfterARefusal() {
  // Two short walls on nearly the same line, not joined, both lying between one face pair: the first snaps onto it,
  // the second would then overlap the first without a shared corner, so the app's wall rules refuse it. The runs after
  // that refusal must still take their thickness (the floor is restored from a copy, so walls are found again by id).
  const document = authoredApartment();
  const floor = document.floors[0];
  const provenance = floor.vertices[0].provenance;
  floor.vertices.push({ id: "pa", xMm: 500, zMm: 3000, provenance }, { id: "pb", xMm: 1500, zMm: 3000, provenance },
    { id: "pc", xMm: 800, zMm: 3060, provenance }, { id: "pd", xMm: 1800, zMm: 3060, provenance });
  const template = floor.walls[0];
  floor.walls.unshift({ ...structuredClone(template), id: "extra-a", path: { kind: "line", startVertexId: "pa", endVertexId: "pb" }, thicknessMm: 100, adjacentRoomIds: [] },
    { ...structuredClone(template), id: "extra-b", path: { kind: "line", startVertexId: "pc", endVertexId: "pd" }, thicknessMm: 100, adjacentRoomIds: [] });
  const faces = [...facesFor(authoredApartment(), 0, (id) => (id === "shared" ? 90 : 210)),
    { axis: "z" as const, at: 2980, from: 400, to: 1900 }, { axis: "z" as const, at: 3080, from: 400, to: 1900 }];
  const log = snapWallsToPdf(floor, faces, null);
  assert.ok(log.refused >= 1, "the second short wall is refused");
  assert.ok(floor.walls.filter((w) => !w.id.startsWith("extra") && w.id !== "shared").every((w) => w.thicknessMm === 210),
    "walls snapped after the refusal take the drawing's thickness");
  assert.equal(floor.walls.find((w) => w.id === "shared")?.thicknessMm, 90);
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

function testDimensionLines() {
  // A page at 10 mm a pixel: a wall face at y = 300 and a dimension line at y = 100 with a filled dot at each end. The
  // dimension line is left out, so it can never pair with a wall's face beside it.
  const line = (id: string, x0: number, y0: number, x1: number, y1: number): SourceVectorSegment =>
    ({ id, pageNumber: 1, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, strokeWidthPx: 1, evidenceKind: "pdf_vector" });
  const dot = (id: string, x: number, y: number) => [line(`${id}-1`, x - 3, y - 3, x + 3, y - 3), line(`${id}-2`, x + 3, y - 3, x + 3, y + 3),
    line(`${id}-3`, x + 3, y + 3, x - 3, y + 3)];
  const dots = [dot("dot-a", 100, 100), dot("dot-b", 600, 100)];
  const fill = (id: string, segments: SourceVectorSegment[]): SourceVectorPath => ({ id, pageNumber: 1, closed: true, segmentIds: segments.map((s) => s.id),
    bbox: { left: 0, top: 0, right: 0, bottom: 0 }, rectilinearScore: 1, evidenceKind: "pdf_vector", paintOperation: "fill" });
  const page: RegisteredPageEvidence = {
    pageNumber: 1, widthPx: 1000, heightPx: 1000, text: [],
    vectorSegments: [line("dimension", 100, 100, 600, 100), line("wall-face", 100, 300, 600, 300), ...dots.flat()],
    vectorPaths: dots.map((segments, i) => fill(`dot-${i}`, segments)),
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  const calibration = { id: "c", sourceId: "s", pageNumber: 1, imageWidthPx: 1000, imageHeightPx: 1000, controlPoints: [
    { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } }, { sourcePx: { x: 1000, y: 0 }, planMm: { xMm: 10_000, zMm: 0 } },
    { sourcePx: { x: 0, y: 1000 }, planMm: { xMm: 0, zMm: 10_000 } }] };
  const drawing = pdfPageDrawing(page, calibration)!;
  assert.deepEqual(drawing.faces.map((f) => [f.axis, Math.round(f.at)]), [["z", 3000]], "only the wall's face is kept");
  assert.equal(drawing.dimensionLines, 1);
}

function testSwitch() {
  const document = authoredApartment();
  assert.equal(snapImportedWallsToPdf(document, [], {}), "off", "off unless FLOOR_PLAN_PDF_WALL_SNAP=1");
  assert.equal(snapImportedWallsToPdf(document, [], { FLOOR_PLAN_PDF_WALL_SNAP: "1" }), "off", "and only on a vector page the vectorizer read");
}

testPairChoice();
testSnap();
testAfterARefusal();
testLeftAsRead();
testStructural();
testDimensionLines();
testSwitch();
console.log("floor-plan PDF wall snap: ok");
