import assert from "node:assert/strict";
import type { RegisteredPageEvidence, SourceVectorPath, SourceVectorSegment } from "@/lib/floor-plan-imports/deterministic-evidence";
import { hasPdfOwnWalls, pdfOwnWallsEnabled, pdfOwnWallsModel, withPdfOwnWalls } from "@/lib/floor-plan-imports/pdf-own-walls";
import { parseFloorPlanVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-evidence";

/**
 * Walls from a vector PDF's own drawing (lib/floor-plan-imports/pdf-own-walls.ts). The page here is 1000 px square at
 * 10 mm a pixel: two rooms side by side inside one outer rectangle, every wall a closed strip 100 mm thick between
 * two lines, a gap in the wall between the rooms, and a window of three thin layers in the left room's outer wall.
 */
type Line = [number, number, number, number];

const segment = (id: string, [x0, y0, x1, y1]: Line): SourceVectorSegment =>
  ({ id, pageNumber: 1, start: { x: x0, y: y0 }, end: { x: x1, y: y1 }, strokeWidthPx: 1, evidenceKind: "pdf_vector" });

/**
 * The plan's lines, with the gap between the rooms from `gapTop` to `gapBottom`. With `walled`, the wall between the
 * rooms is not broken there: its two lines run on and the two lines across it are a door's jambs.
 */
function planLines(gapTop: number, gapBottom: number, walled = false): Line[] {
  const through: Line[] = walled ? [[395, gapTop, 395, gapBottom], [405, gapTop, 405, gapBottom]] : [];
  return [
    ...through,
    // The outer rectangle and the two rooms' own faces.
    [100, 100, 700, 100], [700, 100, 700, 400], [700, 400, 100, 400], [100, 400, 100, 100],
    [110, 110, 395, 110], [110, 390, 395, 390], [110, 110, 110, 390], [395, 110, 395, gapTop], [395, gapBottom, 395, 390],
    [405, 110, 690, 110], [405, 390, 690, 390], [690, 110, 690, 390], [405, 110, 405, gapTop], [405, gapBottom, 405, 390],
    // The wall between the rooms stops at the gap: its two ends.
    [395, gapTop, 405, gapTop], [395, gapBottom, 405, gapBottom],
    // The window: the outer wall's strip cut off at 200 and 300, with two more lines inside it.
    [100, 200, 110, 200], [100, 300, 110, 300], [103.3, 200, 103.3, 300], [106.7, 200, 106.7, 300],
  ];
}

/** A door's swing hinged at the gap's top jamb, 1500 mm across: a quarter circle from the open leaf's tip to the far jamb. */
const swing: SourceVectorPath = {
  id: "swing", pageNumber: 1, closed: false, segmentIds: [], bbox: { left: 400, top: 200, right: 550, bottom: 350 }, rectilinearScore: 0,
  evidenceKind: "pdf_vector", paintOperation: "stroke", containsCurves: true,
  curves: [{ id: "swing-c1", pageNumber: 1, sourceSubpathId: "swing-sub1", sourceCommandIndex: 1, command: "cubic", start: { x: 550, y: 200 },
    controlPoints: [{ x: 550, y: 283 }, { x: 483, y: 350 }], end: { x: 400, y: 350 } }],
};

/** A quarter-circle swing: hinge, the open leaf's tip and the shut leaf's tip. */
function arc(id: string, hinge: [number, number], open: [number, number], shut: [number, number]): SourceVectorPath {
  const corner = [open[0] + shut[0] - hinge[0], open[1] + shut[1] - hinge[1]], toward = (from: number[], k: number) => from[k] + 0.55 * (corner[k] - from[k]);
  const xs = [hinge[0], corner[0]], ys = [hinge[1], corner[1]];
  return { id, pageNumber: 1, closed: false, segmentIds: [], rectilinearScore: 0, evidenceKind: "pdf_vector", paintOperation: "stroke", containsCurves: true,
    bbox: { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs), bottom: Math.max(...ys) },
    curves: [{ id: `${id}-c1`, pageNumber: 1, sourceSubpathId: `${id}-sub1`, sourceCommandIndex: 1, command: "cubic", start: { x: open[0], y: open[1] },
      controlPoints: [{ x: toward(open, 0), y: toward(open, 1) }, { x: toward(shut, 0), y: toward(shut, 1) }], end: { x: shut[0], y: shut[1] } }] };
}

function page(lines: Line[], paths: SourceVectorPath[] = []): RegisteredPageEvidence {
  // Lettering elsewhere on the sheet: strokes too short to bound a wall, enough of them for a drawn page.
  const lettering: Line[] = Array.from({ length: 40 }, (_, k) => [100 + 10 * k, 900, 102 + 10 * k, 900]);
  const vectorSegments = [...lines, ...lettering].map((line, k) => segment(`s${k}`, line));
  const stroke: SourceVectorPath = { id: "strokes", pageNumber: 1, closed: false, segmentIds: vectorSegments.map((s) => s.id),
    bbox: { left: 0, top: 0, right: 1000, bottom: 1000 }, rectilinearScore: 1, evidenceKind: "pdf_vector", paintOperation: "stroke" };
  return { pageNumber: 1, widthPx: 1000, heightPx: 1000, text: [], vectorSegments, vectorPaths: [stroke, ...paths],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] } };
}

/** What the reader gives for the page: the scale from printed dimensions and the two rooms' names; no walls of its own. */
function reader(basis: "explicit_dimension" | "none" = "explicit_dimension") {
  return parseFloorPlanVectorizerEvidence({
    kind: "floorplan_vectorizer_evidence_v1", exporterVersion: "app-evidence-0.34.0",
    page: { widthPx: 1000, heightPx: 1000, coordinateSpace: "source_image_px" },
    scale: { millimetresPerPixel: basis === "none" ? null : 10, basis, dimensionCount: 2, needsReview: false },
    semantics: { unitSystem: "metric_mm", roomBoundaries: [], entrance: null,
      planRegion: { bbox: { leftRatio: 0.05, topRatio: 0.05, rightRatio: 0.8, bottomRatio: 0.5 }, rotationDegrees: 0, confidence: 0.9, evidenceKind: "vectorizer" }, dimensionLabels: [], openingSymbols: [], fixtureSymbols: [], notes: [],
      roomLabels: [
        { label: "LIVING", roomType: "living", centerXRatio: 0.25, centerYRatio: 0.25, confidence: 0.9, bbox: { leftRatio: 0.2, topRatio: 0.24, rightRatio: 0.3, bottomRatio: 0.26 } },
        { label: "KITCHEN", roomType: "kitchen", centerXRatio: 0.55, centerYRatio: 0.25, confidence: 0.9, bbox: { leftRatio: 0.5, topRatio: 0.24, rightRatio: 0.6, bottomRatio: 0.26 } },
      ] },
    wallEdges: [], rooms: [], diagnostics: {},
  });
}

const box = (points: { x: number; y: number }[]) => [Math.min(...points.map((p) => p.x)), Math.min(...points.map((p) => p.y)),
  Math.max(...points.map((p) => p.x)), Math.max(...points.map((p) => p.y))].map((value) => Math.round(value * 100) / 100);
const ends = (edge: { sourcePx: [[number, number], [number, number]] }) => [...edge.sourcePx].sort((a, b) => a[0] - b[0] || a[1] - b[1]);

function testRoomsOnCentreLines() {
  const drawn = page(planLines(200, 290)), evidence = withPdfOwnWalls(drawn, reader());
  assert.deepEqual(evidence.rooms.map((room) => room.label), ["LIVING", "KITCHEN"], "a room each side of the gap, named by the reader's lettering");
  assert.deepEqual(evidence.rooms.map((room) => box(room.sourcePoints)), [[105, 105, 400, 395], [400, 105, 695, 395]],
    "each room's outline lies on its walls' centre-lines, half a wall behind its faces");
  assert.ok(evidence.wallEdges.every((edge) => Math.abs(edge.thicknessPx - 10) < 1e-6), "every wall, opening and window is as thick as its strip is wide");
  parseFloorPlanVectorizerEvidence(evidence);
}

function testOpeningSharedJambToJamb() {
  const evidence = withPdfOwnWalls(page(planLines(200, 290)), reader());
  const byId = new Map(evidence.wallEdges.map((edge) => [edge.id, edge]));
  const passages = evidence.rooms.map((room) => room.edgeIds.map((id) => byId.get(id)!).filter((edge) => edge.opening?.kind === "open_passage"));
  assert.deepEqual(passages.map((list) => list.length), [1, 1], "each room has the gap as one opening");
  for (const [edge] of passages) {
    assert.deepEqual(ends(edge), [[400, 200], [400, 290]], "the opening runs jamb to jamb along the wall's middle, the same for both rooms");
    assert.equal(edge.opening?.widthMm, 900);
  }
}

function testWindow() {
  const evidence = withPdfOwnWalls(page(planLines(200, 290)), reader());
  const windows = evidence.wallEdges.filter((edge) => edge.opening?.kind === "window");
  assert.deepEqual(windows.map(ends), [[[105, 200], [105, 300]]], "thin layers in an outer wall with nothing solid among them are a window");
  assert.equal(windows[0].opening?.widthMm, 1000);
}

function testWideGapNeedsADoor() {
  // 1500 mm is wider than a doorway: with nothing drawn in it the two rooms are one.
  const open = withPdfOwnWalls(page(planLines(200, 350)), reader());
  assert.deepEqual(open.rooms.map((room) => room.label), ["LIVING / KITCHEN"]);
  // With a door's swing hinged at one jamb it is a door, and a room each side.
  const hung = withPdfOwnWalls(page(planLines(200, 350), [swing]), reader());
  assert.equal(hung.rooms.length, 2);
  const doors = hung.wallEdges.filter((edge) => edge.opening?.kind === "door");
  assert.ok(doors.length >= 1 && doors.every((edge) => edge.opening?.operation === "swing" && edge.opening.widthMm === 1500));
  assert.deepEqual(ends(doors[0]), [[400, 200], [400, 350]]);
}

function testDoorDrawnInsideTheWall() {
  // The wall between the rooms runs on through the door; two lines across it are the jambs, and the leaf hangs from one.
  const leaf = arc("leaf", [405, 200], [495, 200], [405, 290]);
  const evidence = withPdfOwnWalls(page(planLines(200, 290, true), [leaf]), reader());
  assert.equal(evidence.rooms.length, 2);
  const doors = evidence.wallEdges.filter((edge) => edge.opening?.kind === "door");
  assert.ok(doors.length >= 1 && doors.every((edge) => edge.opening?.operation === "swing" && edge.opening.widthMm === 900), "the piece of wall the leaf hangs on is a door");
  assert.deepEqual(ends(doors[0]), [[400, 200], [400, 290]]);
  // Without the leaf the piece is wall like the rest.
  const plain = withPdfOwnWalls(page(planLines(200, 290, true)), reader());
  assert.equal(plain.wallEdges.filter((edge) => edge.opening && edge.opening.kind !== "window").length, 0);
}

function testCasementInAnOutsideWall() {
  // A piece of the right room's outer wall between two lines across it, with a pair of even leaves opening outwards.
  const jambs: Line[] = [[690, 200, 700, 200], [690, 300, 700, 300]];
  const pair = [arc("upper", [700, 200], [750, 200], [700, 250]), arc("lower", [700, 300], [750, 300], [700, 250])];
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...jambs], pair), reader());
  const windows = evidence.wallEdges.filter((edge) => edge.opening?.kind === "window").map(ends);
  assert.deepEqual(windows.sort((a, b) => a[0][0] - b[0][0]), [[[105, 200], [105, 300]], [[695, 200], [695, 300]]], "an even pair of leaves in an outside wall is a casement window");
  assert.equal(evidence.wallEdges.filter((edge) => edge.opening?.kind === "door").length, 0);
}

function testLeftAsRead() {
  const drawn = page(planLines(200, 290)), read = reader();
  assert.equal(pdfOwnWallsEnabled({}), false, "off unless FLOOR_PLAN_PDF_OWN_WALLS=1");
  assert.equal(pdfOwnWallsEnabled({ FLOOR_PLAN_PDF_OWN_WALLS: "1" }), true);
  const unscaled = reader("none");
  assert.equal(withPdfOwnWalls(drawn, unscaled), unscaled, "a page with no scale from printed dimensions is left as the reader read it");
  const picture = page([]);
  assert.equal(pdfOwnWallsModel({ ...picture, vectorSegments: [] }, read), null, "a page with no drawing of its own is not read this way");
  const empty = page([[100, 100, 700, 100]]);
  assert.equal(withPdfOwnWalls(empty, read), read, "a drawing with no enclosed room is left as the reader read it");
}

function testMarksItsPages() {
  const drawn = page(planLines(200, 290)), read = reader();
  const registered = (diagnostics: Record<string, unknown>) => ({ ...drawn, vectorizer: { diagnostics } }) as unknown as RegisteredPageEvidence;
  assert.equal(hasPdfOwnWalls(registered(withPdfOwnWalls(drawn, read).diagnostics)), true, "the snap and the clean-up leave such a page's walls alone");
  assert.equal(hasPdfOwnWalls(registered(read.diagnostics)), false);
  assert.equal(hasPdfOwnWalls(drawn), false);
}

testRoomsOnCentreLines();
testOpeningSharedJambToJamb();
testWindow();
testWideGapNeedsADoor();
testDoorDrawnInsideTheWall();
testCasementInAnOutsideWall();
testLeftAsRead();
testMarksItsPages();
console.log("floor-plan PDF own walls: ok");
