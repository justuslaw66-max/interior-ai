import assert from "node:assert/strict";
import {
  LineCapStyle, PDFDocument, PDFOperator, PDFOperatorNames, StandardFonts, clip, closePath, endPath, fill, grayscale, lineTo, moveTo,
  popGraphicsState, pushGraphicsState, rectangle, setFillingGrayscaleColor,
} from "pdf-lib";
import { attachSourceArtwork } from "@/lib/floor-plan-imports/raster-page-evidence";
import { dashed, evenOddAsNonZero, PDF_OWN_DRAWING_VERSION, pdfOwnDrawings } from "@/lib/floor-plan-imports/pdf-own-drawing";
import type { DrawnCommand, DrawnShape } from "@/lib/floor-plan-imports/pdf-drawing-recorder";
import { cssTone, svgCommands } from "@/lib/floor-plan-imports/pdf-drawing-recorder";
import { simplifiedCurves } from "@/lib/floor-plan-imports/pdf-own-curves";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import type { FloorPlanAdapterContext, StoredFloorPlanSource } from "@/lib/floor-plan-imports/source-adapter";
import type { TracePath } from "@/lib/floor-plan-imports/source-trace-fit";
import { sourceTraceAnnotations } from "@/lib/floor-plan-source-trace";
import { sourceDrawingGeometryError, sourceDrawingStroke, type FloorPlanSourceDrawingGeometryV2 } from "@/lib/floor-plan-source-drawing";

// A 1 x 1 grey PNG: a page with a picture on it keeps the picture-based trace.
const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==", "base64");

/** Page 1: the drawing to keep. Page 2: a picture. Page 3: a clip cutting a shape. Pages are 300 x 200 points. */
async function fixturePdf() {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([300, 200]);
  page.drawLine({ start: { x: 20, y: 180 }, end: { x: 120, y: 180 }, thickness: 3, lineCap: LineCapStyle.Round });
  page.drawRectangle({ x: 20, y: 100, width: 60, height: 40, color: grayscale(0.5) });
  page.drawRectangle({ x: 30, y: 110, width: 10, height: 10, color: grayscale(1) }); // white over grey: kept
  page.drawRectangle({ x: 200, y: 20, width: 20, height: 20, color: grayscale(1) }); // white on blank paper: nothing
  page.drawLine({ start: { x: 20, y: 60 }, end: { x: 120, y: 60 }, thickness: 1, dashArray: [10, 10] });
  page.drawSvgPath("M 0 0 C 30 -40 60 -40 90 0", { x: 150, y: 160, borderWidth: 2, borderColor: grayscale(0) });
  // A square with a square hole, both drawn the same way round, filled even-odd.
  page.pushOperators(pushGraphicsState(), setFillingGrayscaleColor(0), moveTo(150, 20), lineTo(190, 20), lineTo(190, 60), lineTo(150, 60),
    closePath(), moveTo(160, 30), lineTo(180, 30), lineTo(180, 50), lineTo(160, 50), closePath(), PDFOperator.of(PDFOperatorNames.FillEvenOdd),
    popGraphicsState());
  page.drawText("AB 12", { x: 200, y: 100, size: 20, font });
  // A solid square drawn as two triangles turning opposite ways, as CAD draws a wall's solid.
  page.pushOperators(pushGraphicsState(), setFillingGrayscaleColor(0.2), moveTo(240, 140), lineTo(270, 140), lineTo(270, 170), closePath(), fill(),
    moveTo(240, 140), lineTo(240, 170), lineTo(270, 170), closePath(), fill(), popGraphicsState());
  const picture = pdf.addPage([300, 200]);
  picture.drawImage(await pdf.embedPng(PIXEL_PNG), { x: 10, y: 10, width: 50, height: 50 });
  picture.drawLine({ start: { x: 100, y: 100 }, end: { x: 200, y: 100 }, thickness: 1 });
  const clipped = pdf.addPage([300, 200]);
  clipped.pushOperators(pushGraphicsState(), rectangle(0, 0, 100, 100), clip(), endPath());
  clipped.drawRectangle({ x: 50, y: 50, width: 100, height: 100, color: grayscale(0) });
  clipped.pushOperators(popGraphicsState());
  return pdf.save();
}

const signedArea = (ring: Array<[number, number]>) => ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
const rings = (commands: DrawnCommand[]) => {
  const out: Array<Array<[number, number]>> = [];
  for (const c of commands) { if (c.op === "M") out.push([c.p]); else if (c.op === "L") out[out.length - 1].push(c.p); }
  return out;
};
const pathRings = (path: TracePath) => {
  const out: Array<Array<{ x: number; y: number }>> = [[path.points[0]]];
  let i = 1;
  for (const c of path.commands) {
    if (c === "M") out.push([path.points[i++]]); else if (c === "L") out[out.length - 1].push(path.points[i++]); else if (c === "C") i += 3;
  }
  return out;
};
const inBox = (path: TracePath, [l, t, r, b]: number[]) => path.points.every((p) => p.x >= l && p.x <= r && p.y >= t && p.y <= b);

async function testPageDrawing(bytes: Uint8Array) {
  const drawings = await pdfOwnDrawings(bytes, [1, 2, 3].map((pageNumber) => ({ pageNumber, widthPx: 600, heightPx: 400 })));
  const first = drawings.get(1);
  assert.ok(first && "trace" in first, `page 1 is drawn from the PDF (${first && "reason" in first ? first.reason : "missing"})`);
  const trace = first.trace;
  assert.equal(trace.version, PDF_OWN_DRAWING_VERSION);
  assert.equal(trace.widthPx, 600);
  const strokes = trace.paths.filter((p) => !p.fill), fills = trace.paths.filter((p) => p.fill);
  // The thick line: twice the PDF's 3 points at the page picture's scale, round ends, where the PDF put it.
  const thick = strokes.find((p) => p.strokeWidthPx === 6);
  assert.ok(thick && thick.lineCap === "round" && thick.tone === 0, "the thick line keeps its width, round ends and black");
  assert.ok(inBox(thick, [39, 39, 241, 41]), "the thick line lies where the PDF draws it (y flipped, scale 2)");
  // The dashed line: ten-point dashes and gaps become five dashes of 20 px.
  const dashedLine = strokes.find((p) => p.strokeWidthPx === 2 && inBox(p, [39, 279, 241, 281]));
  assert.ok(dashedLine, "the dashed line is kept");
  assert.equal(dashedLine.commands.filter((c) => c === "M").length + 1, 5, "five dashes");
  assert.ok(strokes.some((p) => p.commands.includes("C") && p.strokeWidthPx === 4), "the curve stays a curve at its own width");
  // Fills: the grey rectangle, the white square over it (the one on blank paper is left out), the even-odd ring.
  assert.ok(fills.some((p) => p.tone === 128 && inBox(p, [39, 119, 161, 201])), "the grey fill keeps its grey");
  const white = fills.filter((p) => p.tone === 255);
  assert.equal(white.length, 1, "white painted on blank paper changes nothing and is left out");
  assert.ok(inBox(white[0], [59, 159, 81, 181]), "the white square over the grey is kept");
  const ring = fills.find((p) => p.tone === 0 && !p.groupId.startsWith("pdf-letter-") && inBox(p, [299, 279, 381, 361]));
  assert.ok(ring, "the even-odd ring is kept");
  const [outer, hole] = pathRings(ring).map((r) => signedArea(r.map((p): [number, number] => [p.x, p.y])));
  assert.ok(outer * hole < 0, "the hole turns the other way, so the non-zero rule leaves it empty");
  // The two triangles are one path, turned the same way, so the views draw no seam along their shared edge.
  const solid = fills.filter((p) => inBox(p, [479, 59, 541, 121]));
  assert.equal(solid.length, 1, "touching one-outline fills of one grey are one path");
  const halves = pathRings(solid[0]).map((r) => signedArea(r.map((p): [number, number] => [p.x, p.y])));
  assert.ok(halves.length === 2 && halves[0] * halves[1] > 0, "both halves turn the same way");
  // The lettering: Helvetica's own outlines, as letters, where the text is.
  const letters = trace.paths.filter((p) => p.groupId.startsWith("pdf-letter-"));
  assert.ok(letters.length >= 1 && letters.every((p) => p.fill && inBox(p, [399, 160, 512, 202])), "the text is drawn as letter outlines");
  assert.ok(letters.reduce((n, p) => n + p.commands.filter((c) => c === "M").length + 1, 0) >= 5, "every outline of A, B, 1 and 2 is drawn");
  const annotations = sourceTraceAnnotations(trace, "source-1", 1);
  for (const annotation of annotations) {
    assert.equal(annotation.geometry.kind, "source_drawing");
    if (annotation.geometry.kind === "source_drawing") assert.equal(sourceDrawingGeometryError(annotation.geometry), null);
    assert.equal(annotation.provenance.evidence[0]?.basis, "vector_traced");
    assert.match(annotation.provenance.evidence[0]?.note ?? "", /PDF's own drawing/);
  }
  const pictureReason = drawings.get(2), clipReason = drawings.get(3);
  assert.ok(pictureReason && "reason" in pictureReason && /picture/.test(pictureReason.reason), "a page with a picture keeps its trace");
  assert.ok(clipReason && "reason" in clipReason && /clip/.test(clipReason.reason), "a shape cut by a clip keeps the page's trace");
}

async function testAttachSourceArtwork(bytes: Uint8Array) {
  const page = (pageNumber: number, picture: boolean): RegisteredPageEvidence => ({ pageNumber, widthPx: 600, heightPx: 400, vectorSegments: [],
    vectorPaths: [{ id: "p", pageNumber, closed: false, segmentIds: [], bbox: { left: 0, top: 0, right: 1, bottom: 1 }, rectilinearScore: 0 }],
    rasterRegions: picture ? [[{ x: 0, y: 0 }]] : [], text: [],
    semantics: { planRegion: null, unitSystem: "unknown", roomLabels: [], roomBoundaries: [], dimensionLabels: [], openingSymbols: [], fixtureSymbols: [], entrance: null, notes: [] } });
  const pages = [page(1, false), page(2, true)];
  const source: StoredFloorPlanSource = { id: "source-1", fileName: "plan.pdf", mimeType: "application/pdf", byteLength: bytes.length, sha256: "a".repeat(64), bytes };
  const context: FloorPlanAdapterContext = { jobId: "job", store: { putSource: async () => source, readSource: async () => null, putDerivative: async () => "key" },
    privacy: { trainingBenchmarkOptIn: false, trainingBenchmarkOptInAt: null, trainingBenchmarkConsentVersion: null, trainingBenchmarkRevokedAt: null,
      sourceRetentionExpiresAt: new Date("2030-01-31T00:00:00.000Z"), sourceDeletionRequestedAt: null } };
  await attachSourceArtwork(pages, pages, [], context, true, source);
  assert.equal(pages[0].sourceArtwork?.version, PDF_OWN_DRAWING_VERSION, "a vector page is drawn from the PDF, even with the faithful trace on");
  assert.equal(pages[1].sourceArtwork, undefined, "a page with a picture is left to the tracers");
  await attachSourceArtwork([page(1, false)], [], [], context, false, source);
}

function testGeometry() {
  const square = (x: number, size: number): DrawnCommand[] => [{ op: "M", p: [x, x] }, { op: "L", p: [x + size, x] },
    { op: "L", p: [x + size, x + size] }, { op: "L", p: [x, x + size] }, { op: "Z" }];
  const [outer, hole, island] = rings(evenOddAsNonZero([...square(0, 30), ...square(5, 20), ...square(10, 10)])).map(signedArea);
  assert.ok(outer * hole < 0 && outer * island > 0, "outline, hole and island alternate their turn");
  const line: DrawnShape = { kind: "stroke", commands: [{ op: "M", p: [0, 0] }, { op: "L", p: [100, 0] }], evenOdd: false, tone: 0, widthPx: 1,
    cap: "butt", join: "miter", dash: [10, 5], dashOffset: 0, bbox: [0, 0, 100, 0], letter: false };
  assert.equal(dashed(line)[0].commands.filter((c) => c.op === "M").length, 7, "100 px of 10-on 5-off is seven dashes");
  const solid = { ...line, dash: [] };
  assert.equal(dashed(solid)[0], solid, "a solid line is unchanged");
  // A circle drawn in eight cubics is redrawn in fewer, within the tolerance; a corner stays a corner.
  const k = 0.2652, circle: DrawnCommand[] = [{ op: "M", p: [10, 0] }];
  for (let i = 0; i < 8; i++) {
    const a0 = (i * Math.PI) / 4, a1 = ((i + 1) * Math.PI) / 4, c = (a: number) => [10 * Math.cos(a), 10 * Math.sin(a)];
    const [x0, y0] = c(a0), [x3, y3] = c(a1);
    circle.push({ op: "C", p: [x0 - k * 10 * Math.sin(a0), y0 + k * 10 * Math.cos(a0), x3 + k * 10 * Math.sin(a1), y3 - k * 10 * Math.cos(a1), x3, y3] });
  }
  const fewer = simplifiedCurves(circle, 0.08).filter((c) => c.op === "C");
  assert.ok(fewer.length < 8 && fewer.length >= 2, `a smooth circle needs fewer curves (${fewer.length})`);
  const corner: DrawnCommand[] = [{ op: "M", p: [0, 0] }, { op: "C", p: [3, 0, 7, 0, 10, 0] }, { op: "C", p: [10, 3, 10, 7, 10, 10] }];
  assert.equal(simplifiedCurves(corner, 0.08).filter((c) => c.op === "C").length, 2, "a corner between curves is kept");
  assert.deepEqual(cssTone("#808080"), { tone: 128, alpha: 1 });
  assert.equal(cssTone({ pattern: true }), null);
  assert.deepEqual(svgCommands("M1 2L3 4Q5 6 7 8Z").map((c) => c.op), ["M", "L", "Q", "Z"]);
}

function testViewsDrawLineEnds() {
  const geometry: FloorPlanSourceDrawingGeometryV2 = { kind: "source_drawing", sourceId: "s", pageNumber: 1, widthPx: 10, heightPx: 10,
    command: "path", pathCommands: ["L"], points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], strokeWidthPx: 2, lineCap: "round", lineJoin: "round" };
  assert.deepEqual(sourceDrawingStroke(geometry, true), { strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" });
  assert.deepEqual(sourceDrawingStroke(geometry, false), { strokeWidth: 1.5, vectorEffect: "non-scaling-stroke" }, "review marks are unchanged");
  assert.equal(sourceDrawingGeometryError(geometry), null);
  assert.equal(sourceDrawingGeometryError(Object.assign({}, geometry, { lineCap: "pointed" })), "Invalid source line ends.");
}

async function main() {
  const bytes = await fixturePdf();
  await testPageDrawing(bytes);
  await testAttachSourceArtwork(bytes);
  testGeometry();
  testViewsDrawLineEnds();
  console.log("floor-plan PDF own drawing tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
