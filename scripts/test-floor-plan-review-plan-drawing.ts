import assert from "node:assert/strict";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { buildReviewPlanDrawing, projectPlanPath, reviewPlanDrawingSvg, roomLabelPoint } from "@/lib/floor-plan-review-plan-drawing";
import { FAITHFUL_TRACE_VERSION, faithfulDrawingPaths } from "@/lib/floor-plan-imports/source-trace-faithful";
import { sourceTraceAnnotations } from "@/lib/floor-plan-source-trace";

// The clean plan the review draws from the document (workstream 2, 8 Nov 2026): walls, doors, windows, typed room
// names and dimensions from the model, in the page's pixels; only the trace's fixtures kept beside them.

/** The apartment registered to a 1000 x 700 px page: x px = 50 + x mm / 10, y px = 50 + z mm / 10. */
function registered(): FloorPlanDocumentV2 {
  const document = authoredApartment();
  document.floors[0].calibrations = [{ id: "page-1", sourceId: "authored-source", pageNumber: 1, imageWidthPx: 1000, imageHeightPx: 700,
    controlPoints: [{ sourcePx: { x: 50, y: 50 }, planMm: { xMm: 0, zMm: 0 } }, { sourcePx: { x: 1050, y: 50 }, planMm: { xMm: 10000, zMm: 0 } }] }];
  return document;
}

/** Trace paths as the review stores them, from faithful-drawing items in page pixels (text boxes mark lettering). */
function traced(items: Array<{ kind: string; fill: boolean; points: Array<[number, number]> }>, textBoxes: Array<[number, number, number, number]> = []) {
  const paths = faithfulDrawingPaths({ version: "faithful-trace-r12",
    textBoxes: textBoxes.map(([left, top, right, bottom]) => ({ left, top, right, bottom })),
    items: items.map((item) => ({ kind: item.kind, fill: item.fill, strokeWidthPx: 1.5, tone: 40,
      commands: [...item.points.slice(1).map(() => "L" as const), ...(item.fill ? ["Z" as const] : [])],
      points: item.points.map(([x, y]) => ({ x, y })) })) });
  return sourceTraceAnnotations({ version: FAITHFUL_TRACE_VERSION, widthPx: 1000, heightPx: 700, paths,
    settings: {} as never, diagnostics: {} as never }, "authored-source", 1);
}

const input = (document: FloorPlanDocumentV2) => ({ document, floorId: "apartment", sourceId: "authored-source", pageNumber: 1, widthPx: 1000, heightPx: 700 });

function testProjection() {
  assert.equal(projectPlanPath("M 0 0 L 100 -20.5 C 1 2 3 4 5 6 Z", (p) => ({ x: p.xMm * 2, y: p.zMm + 1 })),
    "M 0 1 L 200 -19.5 C 2 3 6 5 10 7 Z", "every coordinate pair is projected; commands are kept");
  // An L-shaped room: its name goes in the wide arm, not in the notch's corner.
  const spot = roomLabelPoint([{ xMm: 0, zMm: 0 }, { xMm: 6000, zMm: 0 }, { xMm: 6000, zMm: 2000 }, { xMm: 2000, zMm: 2000 },
    { xMm: 2000, zMm: 6000 }, { xMm: 0, zMm: 6000 }]);
  assert.ok(spot && spot.clearanceMm > 900, "the label point is well inside the room");
  assert.ok(spot && !(spot.point.xMm > 2000 && spot.point.zMm > 2000), "never in the notch");
}

function testDrawing() {
  const document = registered();
  assert.equal(buildReviewPlanDrawing({ ...input(authoredApartment()) }), null, "no calibration to the page: no plan drawing (the trace shows)");
  const plan = buildReviewPlanDrawing(input(document));
  assert.ok(plan);
  const walls = plan.shapes.filter((shape) => shape.role === "wall");
  assert.ok(walls.length >= 7 && walls.every((shape) => shape.fill), "every wall is drawn, solid");
  assert.ok(plan.shapes.some((shape) => shape.role === "swing_arc" && /C/.test(shape.d)), "the door's swing is a curve");
  assert.ok(plan.shapes.some((shape) => shape.role === "fixed_panel"), "the window is drawn");
  assert.ok(!plan.shapes.some((shape) => shape.role === "host_span"), "the opening's host span (a hit target) is not drawn");
  const living = plan.labels.find((label) => label.lines.join(" ") === "Living");
  assert.ok(living && living.x > 50 && living.x < 450 && living.y > 50 && living.y < 650, "Living is typed inside the living room");
  assert.ok(plan.labels.some((label) => label.lines.join(" ") === "Bedroom"));
  const width = plan.labels.find((label) => label.role === "dimension");
  assert.equal(width?.lines[0], "9260", "the stated dimension is drawn");
  assert.equal(width?.rotateDeg, undefined, "a horizontal dimension reads level");
  // Walls are in page pixels: the west wall runs down x = 50.
  assert.ok(walls.some((shape) => /M 4[0-9](\.\d+)? /.test(shape.d) || / 4[0-9](\.\d+)? /.test(shape.d)), "walls are projected into page pixels");
  const svg = reviewPlanDrawingSvg(plan);
  assert.match(svg, /^<svg[^>]+viewBox="0 0 1000 700"/);
  assert.match(svg, />Living</);
}

function testTracedFixtures() {
  const document = registered();
  const trace = traced([
    // A kitchen counter inside the living room (mm 1500-2300 x 2500-3200): kept.
    { kind: "line", fill: false, points: [[200, 300], [280, 300], [280, 370], [200, 370], [200, 300]] },
    // A speck (50 mm across): left out.
    { kind: "fill", fill: true, points: [[300, 300], [305, 300], [305, 305], [300, 305]] },
    // A fixture-sized shape inside a text box: traced lettering, left out.
    { kind: "fill", fill: true, points: [[150, 500], [200, 500], [200, 540], [150, 540]] },
    // A line along the west wall (wall ink): left out.
    { kind: "line", fill: false, points: [[52, 100], [52, 600]] },
    // A door swing as the source draws it, round the shared wall's jamb: left out.
    { kind: "line", fill: false, points: [[450, 170], [360, 170]] },
    // A dimension line under the plan: off the plan, left out.
    { kind: "line", fill: false, points: [[50, 680], [976, 680]] },
    // A wardrobe's hatching that touches a wall at one end: kept (most of it is clear of the wall).
    { kind: "line", fill: false, points: [[60, 420], [160, 420]] },
    // The living room's floor tint (3.5 m across, filled): left out, the plan is drawn on white.
    { kind: "fill", fill: true, points: [[70, 70], [420, 70], [420, 600], [70, 600]] },
  ], [[140, 495, 210, 545]]);
  assert.ok(trace[2].geometry.kind === "source_drawing" && trace[2].geometry.groupId?.startsWith("faithful-letter-"), "lettering is marked");
  document.floors[0].annotations.push(...trace);
  const plan = buildReviewPlanDrawing(input(document));
  assert.ok(plan);
  assert.deepEqual(plan.traced.map((shape) => shape.id), [trace[0].id, trace[6].id], "only the fixtures are kept from the trace");
  assert.equal(plan.diagnostics.tracedLeft, 6);
  assert.equal(plan.traced[0].ink, "rgb(40,40,40)", "a kept shape keeps its grey");
  // The plan follows a correction: rename the room and the drawing's label changes.
  const renamed = structuredClone(document);
  renamed.floors[0].rooms[0].name = "Living / Dining";
  const again = buildReviewPlanDrawing(input(renamed));
  assert.ok(again?.labels.some((label) => label.lines.join(" ") === "Living / Dining"));
}

testProjection();
testDrawing();
testTracedFixtures();
console.log("floor-plan review plan drawing: ok");
