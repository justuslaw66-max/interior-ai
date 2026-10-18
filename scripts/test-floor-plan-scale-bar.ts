import assert from "node:assert/strict";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { RegisteredPageEvidence, SourceTextEvidence, SourceVectorSegment } from "@/lib/floor-plan-imports/deterministic-evidence";
import { calibrationScaleFields, fallbackPageScales, scaleEvidenceMakesDimensions } from "@/lib/floor-plan-imports/assumed-scale";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import {
  applyScaleBarEvidence,
  findScaleBarGeometry,
  readScaleBar,
  scaleBarLabelStrips,
  scaleBarWordsFromText,
  type ScaleBarStripReader,
  type ScaleBarWord,
} from "@/lib/floor-plan-imports/scale-bar-evidence";
import { SCALE_BAR_MEASUREMENT_ID } from "@/lib/floor-plan-imports/scale-bar-scale";
import type { FloorPlanAdapterContext, StoredFloorPlanSource } from "@/lib/floor-plan-imports/source-adapter";

/**
 * Brochure plans print no dimensions but often a scale bar ("0 1 2 3 4 5 METRES" over a ruled bar). Its numbers land
 * on exact vector ticks, so the scale follows without a reviewer: from the PDF's text, or from local OCR of the strip
 * beside the bar when the numbers were outlined. Rows of numbers that are not a bar are left alone.
 */

const STEP = 60; // pixels per metre on the synthetic pages
const LEFT = 300, BAR_TOP = 1500, BAR_BOTTOM = 1512, LABEL_Y = 1490;
let segmentCount = 0;

function segment(x1: number, y1: number, x2: number, y2: number): SourceVectorSegment {
  return { id: `s${++segmentCount}`, pageNumber: 1, start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, strokeWidthPx: 1, evidenceKind: "pdf_vector" };
}

function text(value: string, centerX: number, widthPx = 7, centerY = LABEL_Y): SourceTextEvidence {
  return { id: `t-${value}-${centerX}`, pageNumber: 1, text: value, center: { x: centerX, y: centerY }, widthPx, heightPx: 12, evidenceKind: "positioned_text" };
}

function page(segments: SourceVectorSegment[], labels: SourceTextEvidence[] = []): RegisteredPageEvidence {
  return { pageNumber: 1, widthPx: 1200, heightPx: 1700, vectorSegments: segments, vectorPaths: [], text: labels,
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] } };
}

/** A ruled bar: a frame, a tick at every metre and the first metre in quarters. */
function ruledBar(step = STEP): SourceVectorSegment[] {
  const right = LEFT + 5 * step;
  return [
    segment(LEFT, BAR_TOP, right, BAR_TOP), segment(LEFT, BAR_BOTTOM, right, BAR_BOTTOM),
    ...[0, 1, 2, 3, 4, 5].map((metre) => segment(LEFT + metre * step, BAR_TOP, LEFT + metre * step, BAR_BOTTOM)),
    segment(LEFT + step / 4, BAR_TOP, LEFT + step / 4, BAR_BOTTOM),
  ];
}

/** A bar of filled triangles, one per division: only the right side of each division has a vertical edge. */
function triangleBar(): SourceVectorSegment[] {
  return [0, 1, 2, 3, 4].flatMap((metre) => {
    const x0 = LEFT + metre * STEP, x1 = x0 + STEP;
    return [segment(x0, BAR_TOP, x1, BAR_TOP), segment(x1, BAR_TOP, x1, BAR_BOTTOM), segment(x1, BAR_BOTTOM, x0, BAR_TOP)];
  });
}

function separateLabels(unit = "METRES"): SourceTextEvidence[] {
  return [...[0, 1, 2, 3, 4].map((metre) => text(String(metre), LEFT + metre * STEP)),
    text(`5 ${unit}`, LEFT + 5 * STEP + 26, 59)];
}

function testTextLabels() {
  const reading = readScaleBar(page(ruledBar(), separateLabels()), scaleBarWordsFromText(separateLabels()), "pdf_text");
  assert.ok(reading, "numbers in the PDF's text over a ruled bar give the scale");
  assert.deepEqual(reading.values, [0, 1, 2, 3, 4, 5]);
  assert.equal(reading.unit, "m");
  assert.ok(Math.abs(reading.millimetresPerPixel - 1000 / STEP) < 1e-6, "one metre is one division");
  assert.equal(reading.lengthMm, 5000);
  assert.ok(Math.abs(reading.start.x - LEFT) < 1e-6 && Math.abs(reading.end.x - (LEFT + 5 * STEP)) < 1e-6, "the span runs tick to tick");
  assert.ok(reading.rmsResidualPx < 0.01);
  assert.equal(reading.labelSource, "pdf_text");
}

function testOneTextRun() {
  const run = [text("0 1 2 3 4 5 m", LEFT + 2.5 * STEP + 6, 5 * STEP + 22)];
  const reading = readScaleBar(page(ruledBar(), run), scaleBarWordsFromText(run), "pdf_text");
  assert.ok(reading, "a single text run is split into its numbers");
  assert.deepEqual(reading.values, [0, 1, 2, 3, 4, 5]);
  assert.ok(Math.abs(reading.millimetresPerPixel - 1000 / STEP) < 1e-6, "positions inside the run only need to land near the ticks");
}

function testTriangleBar() {
  const reading = readScaleBar(page(triangleBar(), separateLabels()), scaleBarWordsFromText(separateLabels()), "pdf_text");
  assert.ok(reading, "a bar drawn as triangles is read");
  assert.deepEqual(reading.values, [0, 1, 2, 3, 4, 5], "the 0 tick, with no vertical edge, is found from the edge ends");
  assert.ok(Math.abs(reading.start.x - LEFT) < 1e-6);
}

function testRowsThatAreNotBars() {
  const noUnit = [0, 1, 2, 3, 4, 5].map((metre) => text(String(metre), LEFT + metre * STEP));
  assert.equal(readScaleBar(page(ruledBar(), noUnit), scaleBarWordsFromText(noUnit), "pdf_text"), null, "no unit, no bar");
  const twoAndUnit = [3, 4, 5].map((value) => text(String(value), LEFT + value * STEP)).concat(text("m", LEFT + 5 * STEP + 20));
  assert.equal(readScaleBar(page(ruledBar(), twoAndUnit), scaleBarWordsFromText(twoAndUnit), "pdf_text"), null,
    "three numbers need the 0 to count as a bar");
  const withoutZero = [1, 2, 3, 4].map((value) => text(String(value), LEFT + value * STEP)).concat(text("5 METRES", LEFT + 5 * STEP + 26, 59));
  assert.deepEqual(readScaleBar(page(ruledBar(), withoutZero), scaleBarWordsFromText(withoutZero), "pdf_text")?.values, [1, 2, 3, 4, 5],
    "an OCR reading that missed the 0 still reads from the five numbers it has");
  assert.equal(readScaleBar(page([], separateLabels()), scaleBarWordsFromText(separateLabels()), "pdf_text"), null,
    "numbers without ticks under them are not a bar");
  const offTicks = [0, 1, 2, 3, 4].map((metre) => text(String(metre), LEFT + metre * 45)).concat(text("5 METRES", LEFT + 5 * 45 + 26, 59));
  assert.equal(readScaleBar(page(ruledBar(), offTicks), scaleBarWordsFromText(offTicks), "pdf_text"), null,
    "numbers that do not sit on the ticks are not read as the bar");
}

function testGeometry() {
  const bars = findScaleBarGeometry(page(ruledBar()));
  assert.equal(bars.length, 1, "a ruled bar is found from geometry alone");
  assert.deepEqual(bars[0].ticks, [0, 1, 2, 3, 4, 5].map((metre) => LEFT + metre * STEP), "the quarter tick is passed over");
  const strips = scaleBarLabelStrips(page(ruledBar()), bars[0]);
  assert.equal(strips.length, 2, "numbers are looked for above, then below");
  assert.ok(strips[0].bottom <= BAR_TOP && strips[0].top < LABEL_Y && strips[1].top >= BAR_BOTTOM);
  assert.ok(strips[0].right >= LEFT + 5 * STEP + 3 * STEP, "the strip reaches the unit word");
  const treads = Array.from({ length: 10 }, (_, index) => segment(500 + index * 14, 800, 500 + index * 14, 860))
    .concat(segment(500, 800, 626, 800), segment(500, 860, 626, 860));
  assert.deepEqual(findScaleBarGeometry(page(treads)), [], "stair treads are tall for their spacing, not a bar");
}

async function testOcrFallback() {
  const asked: number[] = [];
  let closed = 0;
  const words: ScaleBarWord[] = [0, 1, 2, 3, 4, 5].map((metre) => ({ text: String(metre), center: { x: LEFT + metre * STEP, y: LABEL_Y }, widthPx: 6, heightPx: 10 }))
    .concat({ text: "metres", center: { x: LEFT + 5 * STEP + 30, y: LABEL_Y }, widthPx: 40, heightPx: 10 });
  const reader: ScaleBarStripReader = {
    async read(_page, strip) { asked.push(strip.top); return strip.bottom <= BAR_TOP ? words : []; },
    async close() { closed += 1; },
  };
  const outlined = page(ruledBar());
  const plain = page([segment(100, 100, 400, 100)]);
  await applyScaleBarEvidence([plain, outlined], reader);
  assert.equal(plain.scaleBar, undefined, "a page without a bar is left alone and costs no OCR");
  assert.equal(outlined.scaleBar?.labelSource, "local_ocr", "outlined numbers are read from the strip above the bar");
  assert.deepEqual(outlined.scaleBar?.values, [0, 1, 2, 3, 4, 5]);
  assert.equal(asked.length, 1, "the first strip read is enough");
  assert.equal(closed, 1, "the reader is closed once");

  const labelled = page(ruledBar(), separateLabels());
  const untouched: ScaleBarStripReader = { async read() { return assert.fail("text labels need no OCR"); }, async close() {} };
  await applyScaleBarEvidence([labelled], untouched);
  assert.equal(labelled.scaleBar?.labelSource, "pdf_text");
  const failing: ScaleBarStripReader = { async read() { throw new Error("ocr down"); }, async close() { throw new Error("close down"); } };
  const unread = page(ruledBar());
  await applyScaleBarEvidence([unread], failing);
  assert.equal(unread.scaleBar, undefined, "an OCR failure leaves the page for the reviewer");
}

function testScaleAndCalibration() {
  const withBar = page(ruledBar(), separateLabels());
  withBar.scaleBar = readScaleBar(withBar, scaleBarWordsFromText(withBar.text), "pdf_text")!;
  const [scale] = fallbackPageScales([page([]), withBar]);
  assert.equal(scale.basis, "scale_bar", "a bar ranks above the door-width estimate");
  assert.equal(scale.dimensionCount, 6);
  assert.equal(scale.evidence?.[0].valueMm, 5000);
  assert.deepEqual(fallbackPageScales([page([])]), [], "no bar and no estimate: no scale");
  const fields = calibrationScaleFields(withBar, scale);
  assert.equal(fields.primaryMeasurement?.id, SCALE_BAR_MEASUREMENT_ID, "the calibration keeps the bar as its measurement");
  assert.equal(fields.primaryMeasurement?.confirmedLengthMm, 5000);
  assert.equal(fields.primaryMeasurement?.basis, undefined, "a bar is printed, not assumed");
  assert.equal(scaleEvidenceMakesDimensions(scale, []), true, "the bar's span is kept even before walls exist");
  assert.equal(scaleEvidenceMakesDimensions({ ...scale, basis: "printed" }, []), false);
}

/** A vector PDF page: a room, and a 0–5 m bar of 30 pt divisions labelled in the PDF's own text. */
async function barPdf(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const sheet = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  sheet.drawRectangle({ x: 150, y: 400, width: 300, height: 200, borderWidth: 3, borderColor: rgb(0, 0, 0) });
  for (let metre = 0; metre < 5; metre += 1) {
    sheet.drawRectangle({ x: 200 + metre * 30, y: 100, width: 30, height: 4, color: metre % 2 ? rgb(1, 1, 1) : rgb(0, 0, 0),
      borderWidth: 0.5, borderColor: rgb(0, 0, 0) });
  }
  for (let metre = 0; metre <= 5; metre += 1) {
    const label = String(metre);
    sheet.drawText(label, { x: 200 + metre * 30 - font.widthOfTextAtSize(label, 6) / 2, y: 108, size: 6, font });
  }
  sheet.drawText("METRES", { x: 200 + 150 + 6, y: 108, size: 6, font });
  return pdf.save();
}

async function testPdfImport() {
  const bytes = await barPdf();
  const derivatives = new Map<string, { mimeType: string; bytes: Uint8Array }>();
  const store = {
    async putSource() { throw new Error("unused"); }, async readSource() { return null; },
    async putDerivative(input: { mimeType: string; bytes: Uint8Array }) { const key = `d${derivatives.size + 1}`; derivatives.set(key, input); return key; },
    async readDerivative(key: string) { return derivatives.get(key) ?? null; },
  };
  const context = { jobId: "scale-bar-test", store, privacy: { trainingBenchmarkOptIn: false, trainingBenchmarkOptInAt: null,
    trainingBenchmarkConsentVersion: null, trainingBenchmarkRevokedAt: null, sourceRetentionExpiresAt: new Date("2030-01-01"),
    sourceDeletionRequestedAt: null } } as unknown as FloorPlanAdapterContext;
  const source = { id: "bar-source", fileName: "bar.pdf", mimeType: "application/pdf", byteLength: bytes.length,
    sha256: "c".repeat(64), bytes } as StoredFloorPlanSource;
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const rendered = await adapter.render(source, context);
  const extracted = await adapter.extract(source, rendered, context);
  const envelope = extracted.candidate as { pages: RegisteredPageEvidence[]; selectedPageNumber?: number | null };
  const pixelsPerMetre = 30 * (rendered[0].widthPx / 595);
  const bar = envelope.pages[0].scaleBar;
  assert.ok(bar, "the PDF's bar is read during extraction");
  assert.deepEqual(bar.values, [0, 1, 2, 3, 4, 5]);
  assert.ok(Math.abs(bar.millimetresPerPixel - 1000 / pixelsPerMetre) / (1000 / pixelsPerMetre) < 0.005, "scale within half a percent");
  envelope.selectedPageNumber = 1;
  const solved = await adapter.solveScale(extracted, context);
  const scale = (solved.candidate as { scale: { basis?: string } | null }).scale;
  assert.equal(scale?.basis, "scale_bar", "no printed dimension: the bar sets the scale");
  const validated = await adapter.validate(await adapter.buildTopology(solved, context));
  const floor = (validated.candidate as unknown as { floors: Array<{ calibrations: Array<{ primaryMeasurement?: { id: string } }>; dimensions: Array<{ measuredMm: number }> }> }).floors[0];
  assert.equal(floor.calibrations[0]?.primaryMeasurement?.id, SCALE_BAR_MEASUREMENT_ID, "the floor is calibrated from the bar");
  assert.deepEqual(floor.dimensions.map((dimension) => dimension.measuredMm), [5000], "the bar's 5 m is kept as the plan's printed dimension");
  const codes = validated.reviewIssues.map((issue) => issue.code);
  for (const code of ["scale_unresolved", "source_registration_incomplete", "source_dimension_missing"]) {
    assert.ok(!codes.includes(code), `${code} is not raised once the bar sets the scale`);
  }
}

async function main() {
  testTextLabels();
  testOneTextRun();
  testTriangleBar();
  testRowsThatAreNotBars();
  testGeometry();
  await testOcrFallback();
  testScaleAndCalibration();
  await testPdfImport();
  console.log("floor-plan scale bar: all checks passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
