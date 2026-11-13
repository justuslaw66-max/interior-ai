import assert from "node:assert/strict";
import type { RegisteredPageEvidence, SourceVectorPath, SourceVectorSegment } from "@/lib/floor-plan-imports/deterministic-evidence";
import { hasPdfOwnWalls, pdfOwnWallsEnabled, pdfOwnWallsModel, withPdfOwnWalls } from "@/lib/floor-plan-imports/pdf-own-walls";
import { parseFloorPlanVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-evidence";
import { widenSetBackOpenings } from "@/lib/floor-plan-imports/pdf-own-walls-openings";
import { FILLED, FREE, type Closure, type WallMass } from "@/lib/floor-plan-imports/pdf-own-walls-mass";
import type { WallGrid } from "@/lib/floor-plan-imports/pdf-own-walls-grid";

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

function page(lines: Line[], paths: SourceVectorPath[] = [], solids: Line[] = []): RegisteredPageEvidence {
  // Lettering elsewhere on the sheet: strokes too short to bound a wall, enough of them for a drawn page.
  const lettering: Line[] = Array.from({ length: 40 }, (_, k) => [100 + 10 * k, 900, 102 + 10 * k, 900]);
  const vectorSegments = [...lines, ...lettering].map((line, k) => segment(`s${k}`, line));
  const stroke: SourceVectorPath = { id: "strokes", pageNumber: 1, closed: false, segmentIds: vectorSegments.map((s) => s.id),
    bbox: { left: 0, top: 0, right: 1000, bottom: 1000 }, rectilinearScore: 1, evidenceKind: "pdf_vector", paintOperation: "stroke" };
  // Solid fills (a column, a concrete wall): each rectangle [left, top, right, bottom] a closed filled path.
  const filled = solids.map(([l, t, r, b], k): SourceVectorPath => {
    const ring = [[l, t, r, t], [r, t, r, b], [r, b, l, b], [l, b, l, t]] as Line[], ids = ring.map((_, e) => `f${k}-${e}`);
    ring.forEach((edge, e) => vectorSegments.push(segment(ids[e], edge)));
    return { id: `fill${k}`, pageNumber: 1, closed: true, segmentIds: ids, bbox: { left: l, top: t, right: r, bottom: b }, rectilinearScore: 1, evidenceKind: "pdf_vector", paintOperation: "fill" };
  });
  return { pageNumber: 1, widthPx: 1000, heightPx: 1000, text: [], vectorSegments, vectorPaths: [stroke, ...filled, ...paths],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] } };
}

/** What the reader gives for the page: the scale from printed dimensions and the two rooms' names; no walls of its own. */
function reader(basis: "explicit_dimension" | "none" = "explicit_dimension", left = "LIVING") {
  return parseFloorPlanVectorizerEvidence({
    kind: "floorplan_vectorizer_evidence_v1", exporterVersion: "app-evidence-0.34.0",
    page: { widthPx: 1000, heightPx: 1000, coordinateSpace: "source_image_px" },
    scale: { millimetresPerPixel: basis === "none" ? null : 10, basis, dimensionCount: 2, needsReview: false },
    semantics: { unitSystem: "metric_mm", roomBoundaries: [], entrance: null,
      planRegion: { bbox: { leftRatio: 0.05, topRatio: 0.05, rightRatio: 0.8, bottomRatio: 0.5 }, rotationDegrees: 0, confidence: 0.9, evidenceKind: "vectorizer" }, dimensionLabels: [], openingSymbols: [], fixtureSymbols: [], notes: [],
      roomLabels: [
        { label: left, roomType: "living", centerXRatio: 0.25, centerYRatio: 0.25, confidence: 0.9, bbox: { leftRatio: 0.2, topRatio: 0.24, rightRatio: 0.3, bottomRatio: 0.26 } },
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

function testGlazedPieceOfAnOutsideWall() {
  // A piece of the right room's top wall between two lines across it, split lengthwise by one glass line.
  const glazed: Line[] = [[500, 100, 500, 110], [600, 100, 600, 110], [500, 105, 600, 105]];
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...glazed]), reader());
  const windows = evidence.wallEdges.filter((edge) => edge.opening?.kind === "window").map(ends);
  assert.ok(windows.some(([a, b]) => a[0] === 500 && b[0] === 600 && a[1] === 105 && b[1] === 105), "two layers and nothing solid, with plain wall either side, are a window");
  assert.equal(windows.length, 2);
}

/** A row of dashes 100 mm long, 50 mm apart, along y = `at` from x = `from` to x = `to` (page px at 10 mm a pixel). */
const dashes = (at: number, from: number, to: number): Line[] => Array.from({ length: Math.round((to - from + 5) / 15) }, (_, k) => [from + 15 * k, at, Math.min(from + 15 * k + 10, to), at]);

function testDashedGlassLine() {
  // A piece of the right room's top wall between two lines across it, with a dashed glass line down its middle (HDB's bathroom windows).
  const jambs: Line[] = [[500, 100, 500, 110], [595, 100, 595, 110]];
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...jambs, ...dashes(105, 500, 595)]), reader());
  const windows = evidence.wallEdges.filter((edge) => edge.opening?.kind === "window");
  assert.ok(windows.some((edge) => JSON.stringify(ends(edge)) === JSON.stringify([[500, 105], [595, 105]])), "a dashed glass line down a piece of wall is a window, jamb to jamb");
  assert.equal(windows.length, 2);
  // Without the dashes the piece is wall like the rest.
  const plain = withPdfOwnWalls(page([...planLines(200, 290), ...jambs]), reader());
  assert.equal(plain.wallEdges.filter((edge) => edge.opening?.kind === "window").length, 1);
}

function testDashedGlassBehindAnOuterSkin() {
  // An outer skin 200 mm out along the whole top wall: the window is as thick as the wall beside it, skin and all.
  const skin: Line[] = [[100, 80, 700, 80], [100, 80, 100, 100], [700, 80, 700, 100]];
  const jambs: Line[] = [[500, 100, 500, 110], [595, 100, 595, 110]];
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...skin, ...jambs, ...dashes(105, 500, 595)]), reader());
  const top = evidence.wallEdges.filter((edge) => ends(edge)[0][1] === 95 && ends(edge)[1][1] === 95);
  const window = top.find((edge) => edge.opening?.kind === "window");
  assert.ok(window, "the dashed piece is a window with the skin outside it");
  assert.deepEqual(ends(window), [[500, 95], [595, 95]]);
  assert.ok(top.every((edge) => Math.abs(edge.thicknessPx - 30) < 1e-6), "window and wall beside it alike 300 mm thick: no jog");
}

function testDashedLineInARoomIsNotGlass() {
  // An overhead line (a beam, a cabinet above) dashed across the right room: no wall either side of it, not a window.
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...dashes(250, 500, 595)]), reader());
  assert.equal(evidence.wallEdges.filter((edge) => edge.opening?.kind === "window").length, 1);
  assert.equal(evidence.rooms.length, 2);
}

function testGlassBetweenSolidColumnsIsWall() {
  // The right room's top wall: two solid columns with a piece split by one line between them (J: an infill, Blk 670).
  const columns: Line[] = [[480, 100, 500, 110], [600, 100, 620, 110]];
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), [500, 105, 600, 105]], [], columns), reader());
  assert.equal(evidence.wallEdges.filter((edge) => edge.opening?.kind === "window").length, 1, "only the left room's layered window");
}

function testBalconySideIsParapet() {
  // The left room lettered BALCONY: the same three thin layers in its outer wall are its parapet, not a window.
  const balcony = withPdfOwnWalls(page(planLines(200, 290)), reader("explicit_dimension", "BALCONY"));
  assert.equal(balcony.wallEdges.filter((edge) => edge.opening?.kind === "window").length, 0);
}

function testCasementPairDrawnAsOnePath() {
  // A pair of casement leaves drawn as one path with two hinges (Blk 670's living room onto its air-con ledge).
  const jambs: Line[] = [[690, 200, 700, 200], [690, 300, 700, 300]];
  const pair: SourceVectorPath = { id: "pair", pageNumber: 1, closed: false, segmentIds: [], rectilinearScore: 0, evidenceKind: "pdf_vector",
    paintOperation: "stroke", containsCurves: true, bbox: { left: 700, top: 200, right: 750, bottom: 300 },
    curves: [
      { id: "pair-c1", pageNumber: 1, sourceSubpathId: "pair-s", sourceCommandIndex: 1, command: "cubic", start: { x: 750, y: 200 }, controlPoints: [{ x: 740, y: 215 }, { x: 745, y: 240 }], end: { x: 700, y: 250 } },
      { id: "pair-c2", pageNumber: 1, sourceSubpathId: "pair-s", sourceCommandIndex: 2, command: "cubic", start: { x: 700, y: 250 }, controlPoints: [{ x: 745, y: 260 }, { x: 740, y: 285 }], end: { x: 750, y: 300 } },
    ] };
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...jambs], [pair]), reader());
  const windows = evidence.wallEdges.filter((edge) => edge.opening?.kind === "window").map(ends);
  assert.ok(windows.some(([a, b]) => a[0] === 695 && b[0] === 695 && a[1] === 200 && b[1] === 300), "the one-path pair is a casement window");
}

function testBayWindowAtTheRoomFace() {
  // A bay 600 mm deep outside the right room's wall: its frame and sill lines split it into thin strips, its two
  // casement leaves hung on the bay's outer line. The room's own wall is the window; the bay is not built as wall.
  const bay: Line[] = [[700, 200, 760, 200], [700, 300, 760, 300], [760, 200, 760, 300], [720, 200, 720, 300], [740, 200, 740, 300]];
  const leaves = [arc("bay-upper", [760, 200], [710, 200], [760, 250]), arc("bay-lower", [760, 300], [710, 300], [760, 250])];
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...bay], leaves), reader());
  const windows = evidence.wallEdges.filter((edge) => edge.opening?.kind === "window");
  const bayWindow = windows.find((edge) => ends(edge)[0][0] === 695 && ends(edge)[1][0] === 695);
  assert.ok(bayWindow && Math.abs(bayWindow.thicknessPx - 10) < 1e-6, "the window is the room's own 100 mm wall line");
  assert.deepEqual(ends(bayWindow), [[695, 200], [695, 300]]);
  assert.ok(evidence.wallEdges.every((edge) => edge.sourcePx.every(([x]) => x <= 700 + 1e-6)), "nothing is built on the bay");
}

function testRackOnAnOutsideFaceIsNotWall() {
  // A clothes-drying rack: a box 50 mm deep and 1000 mm long standing on the right room's top wall.
  const rack: Line[] = [[500, 95, 600, 95], [500, 95, 500, 100], [600, 95, 600, 100]];
  const evidence = withPdfOwnWalls(page([...planLines(200, 290), ...rack]), reader());
  const top = evidence.wallEdges.filter((edge) => edge.sourcePx.every(([x, y]) => y < 120 && x >= 400));
  assert.ok(top.length > 0 && top.every((edge) => Math.abs(edge.thicknessPx - 10) < 1e-6), "the top wall keeps one thickness along the rack");
  assert.ok(evidence.wallEdges.every((edge) => edge.sourcePx.every(([, y]) => y >= 100 - 1e-6)), "nothing is built on the rack");
}

function testLinesOnOneCoordinateJoinInOrder() {
  // The right room's face along its bottom wall drawn as two pieces 0.01 px apart in height, the far one first in
  // height (Tengah's 162.42 and 162.43): both stay; the room keeps its bottom face.
  const lines = planLines(200, 290).filter(([x0, y0, x1, y1]) => !(x0 === 405 && y0 === 390 && x1 === 690 && y1 === 390));
  const split: Line[] = [[600, 389.99, 690, 389.99], [405, 390, 550, 390]];
  const evidence = withPdfOwnWalls(page([...lines, ...split, [550, 390, 600, 390]]), reader());
  assert.deepEqual(evidence.rooms.map((room) => box(room.sourcePoints)), [[105, 105, 400, 395], [400, 105, 695, 395]]);
}

function testFillWithNoWidthIsNoDimensionDot() {
  // A fill with no width on a jamb line (a CAD plot's sliver along a column's edge, Tengah): the line is a wall's.
  const sliver: Line = [400, 195, 400, 205];
  const evidence = withPdfOwnWalls(page(planLines(200, 290), [], [sliver]), reader());
  assert.deepEqual(evidence.rooms.map((room) => room.label), ["LIVING", "KITCHEN"], "the jamb still closes the wall's end");
}

/**
 * An opening in a level wall on a hand-made grid (10 mm a pixel): columns are wall, opening, opening, wall; rows from
 * the top are `rows` (`rowPx` high; F free floor between free ends, W free floor between wall ends) and then the
 * opening's two rows.
 */
function setBackCase(rows: ("F" | "W")[], rowPx = 5) {
  const ys = [0, ...rows.map((_, k) => rowPx * (k + 1)), rowPx * rows.length + 10, rowPx * rows.length + 20];
  const grid = { xs: Float64Array.from([0, 10, 20, 30, 40]), ys: Float64Array.from(ys), nx: 4, ny: ys.length - 1 } as unknown as WallGrid;
  const cells = grid.nx * grid.ny, kind = new Uint8Array(cells), closure = new Int32Array(cells).fill(-1);
  const gap: Closure = { i0: 1, i1: 3, j0: rows.length, j1: rows.length + 2, level: true, lengthPx: 20, depthPx: 20, endToEnd: true, staggered: false };
  for (let j = 0; j < grid.ny; j += 1) {
    const walled = j >= rows.length || rows[j] === "W";
    for (const i of [0, 3]) kind[j * 4 + i] = walled ? FILLED : FREE;
    if (j >= rows.length) for (const i of [1, 2]) closure[j * 4 + i] = 0;
  }
  const mass = { kind, region: new Int32Array(cells).fill(-1), closure, closures: [gap], glazed: new Uint8Array(cells) } as WallMass;
  return { widened: widenSetBackOpenings(grid, mass, 10), gap };
}

function testOpeningSetBackFromTheWallFaces() {
  // The frame 50 mm back from the walls' faces, the walls ending there (Tengah's entrance): the opening runs to them.
  const { widened, gap } = setBackCase(["F", "W"]);
  assert.equal(widened, 1);
  assert.deepEqual([gap.j0, gap.j1, gap.depthPx], [1, 4, 25]);
  // The walls running on past the band (a corridor's sides): the opening is left as it is.
  const corridor = setBackCase(["W", "W", "W", "W"]);
  assert.equal(corridor.widened, 0);
  // A band thinner than the least jog (Fernvale's 13 mm) is not taken in.
  assert.equal(setBackCase(["F", "W"], 1.3).widened, 0);
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
testGlazedPieceOfAnOutsideWall();
testDashedGlassLine();
testDashedGlassBehindAnOuterSkin();
testDashedLineInARoomIsNotGlass();
testGlassBetweenSolidColumnsIsWall();
testBalconySideIsParapet();
testCasementPairDrawnAsOnePath();
testBayWindowAtTheRoomFace();
testRackOnAnOutsideFaceIsNotWall();
testLinesOnOneCoordinateJoinInOrder();
testFillWithNoWidthIsNoDimensionDot();
testOpeningSetBackFromTheWallFaces();
testLeftAsRead();
testMarksItsPages();
console.log("floor-plan PDF own walls: ok");
