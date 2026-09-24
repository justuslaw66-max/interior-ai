import assert from "node:assert/strict";
import sharp from "sharp";
import { detectRasterDimensionSpans } from "@/lib/floor-plan-imports/raster-dimension-spans";
import { inspectScaleFromRegisteredEvidence, type RegisteredPageEvidence, type SemanticDimensionLabel } from "@/lib/floor-plan-imports/deterministic-evidence";
import { diagnoseSourceScale, solveCrossCheckedScale } from "@/lib/floor-plan-imports/source-scale-cross-check";
import { mergeDimensionLabels } from "@/lib/floor-plan-imports/semantic-dimension-merge";
import { sourceProposalAnnotations } from "@/lib/floor-plan-imports/source-proposal-annotations";

const width = 600, height = 500;
const label = (valueMm: number, first: [number, number], second: [number, number]): SemanticDimensionLabel => ({ valueMm,
  centerXRatio: (first[0] + second[0]) / 2 / width, centerYRatio: (first[1] + second[1]) / 2 / height,
  orientation: first[0] === second[0] ? "vertical" : "horizontal", confidence: 0.55, evidenceKind: "vision",
  extensionStart: { xRatio: first[0] / width, yRatio: first[1] / height }, extensionEnd: { xRatio: second[0] / width, yRatio: second[1] / height } });

async function raster(extra = "", angle = 0) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="500"><rect width="600" height="500" fill="white"/><g transform="rotate(${angle} 300 250)">
  <path d="M90 80H490M90 66V94M290 66V94M490 66V94M55 120V420M41 120H69M41 420H69" fill="none" stroke="#aaa"/>
  <g fill="#444"><circle cx="90" cy="80" r="2"/><circle cx="290" cy="80" r="2"/><circle cx="490" cy="80" r="2"/>
  <circle cx="55" cy="120" r="2"/><circle cx="55" cy="420" r="2"/></g>${extra}</g></svg>`;
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { width, height, data };
}

export async function testRasterDimensionAssociations() {
  const page: RegisteredPageEvidence = { pageNumber: 1, widthPx: width, heightPx: height, vectorPaths: [], text: [],
    vectorSegments: [{ id: "short-fragment", pageNumber: 1, start: { x: 90, y: 80 }, end: { x: 140, y: 80 }, strokeWidthPx: 1, evidenceKind: "raster_linework" },
      { id: "adjacent-chain", pageNumber: 1, start: { x: 90, y: 80 }, end: { x: 490, y: 80 }, strokeWidthPx: 1, evidenceKind: "raster_linework" }],
    semantics: { roomLabels: [], openingSymbols: [], notes: [], dimensionLabels: [label(2000, [92, 81], [292, 81]),
      label(2000, [291, 81], [491, 81]), label(3000, [56, 121], [56, 421])] } };
  const pixels = await raster();
  const observed = detectRasterDimensionSpans(page, pixels);
  assert.equal(observed.length, 3);
  for (const span of observed) assert.equal(span.status, "source_supported");
  assert.ok(Math.abs(observed[0].start!.x - 90) < 1);
  assert.ok(Math.abs(observed[0].end!.x - 290) < 1, "An adjacent dimension cannot extend the measured span to the whole chain.");
  page.dimensionSpanEvidence = { coordinateSpace: "rendered_px", imageSha256: "a".repeat(64), observations: observed };
  const inspection = inspectScaleFromRegisteredEvidence(page);
  assert.equal(inspection.candidates.length, 3);
  assert.ok(inspection.candidates.every((entry) => entry.segmentId.startsWith("raster-ticks:")));
  assert.ok(Math.abs(solveCrossCheckedScale(page)!.millimetresPerPixel - 10) < 0.03);
  const tilted = structuredClone(page), angle = 2 * Math.PI / 180;
  const rotate = (point: { xRatio: number; yRatio: number }) => {
    const x = point.xRatio * width - 300, y = point.yRatio * height - 250;
    return { xRatio: (300 + x * Math.cos(angle) - y * Math.sin(angle)) / width,
      yRatio: (250 + x * Math.sin(angle) + y * Math.cos(angle)) / height };
  };
  for (const dimension of tilted.semantics.dimensionLabels) {
    dimension.extensionStart = rotate(dimension.extensionStart!); dimension.extensionEnd = rotate(dimension.extensionEnd!);
  }
  const tiltedSpans = detectRasterDimensionSpans(tilted, await raster("", 2));
  assert.ok(tiltedSpans.every((entry) => entry.status === "source_supported"), "Slanted ticks must stay in the registered pixel frame.");
  assert.ok(Math.abs(Math.hypot(tiltedSpans[0].end!.x - tiltedSpans[0].start!.x, tiltedSpans[0].end!.y - tiltedSpans[0].start!.y) - 200) < 1);
  const stale = structuredClone(page);
  stale.semantics.dimensionLabels[0].extensionStart!.xRatio += 0.01;
  assert.ok(inspectScaleFromRegisteredEvidence(stale).candidates.every((entry) => entry.segmentId !== "raster-ticks:1:0"), "Changed endpoint hints cannot reuse stale pixel associations.");
  const conflict = structuredClone(page);
  conflict.semantics.dimensionLabels[2].valueMm = 3300;
  conflict.dimensionSpanEvidence!.observations[2].valueMm = 3300;
  assert.equal(solveCrossCheckedScale(conflict), null, "A contradictory complete span cannot be silently excluded from the cross-check.");
  assert.equal(diagnoseSourceScale(conflict).sourceSpanScaleInterval?.feasible, false);
  const blank = { width, height, data: new Uint8Array(width * height).fill(255) };
  page.dimensionSpanEvidence.observations = detectRasterDimensionSpans(page, blank);
  assert.ok(page.dimensionSpanEvidence.observations.every((entry) => entry.status === "needs_review"));
  assert.equal(inspectScaleFromRegisteredEvidence(page).candidates.length, 0, "Missing pixel support cannot fall back to the tempting short fragment.");
  assert.throws(() => detectRasterDimensionSpans(page, { ...pixels, width: width / 2 }), /coordinate space/);
  const ambiguous = await raster('<path d="M100 66V94" stroke="#aaa"/><circle cx="100" cy="80" r="2" fill="#444"/>');
  page.semantics.dimensionLabels[0] = label(2000, [95, 80], [290, 80]);
  assert.equal(detectRasterDimensionSpans(page, ambiguous)[0].reason, "ambiguous_ticks");
  delete page.dimensionSpanEvidence;
  assert.ok(inspectScaleFromRegisteredEvidence(page).candidates.every((entry) => entry.segmentId !== "short-fragment" && entry.segmentId !== "adjacent-chain"));
  const vision = label(4000, [90, 80], [490, 80]);
  const ocr = { ...vision, confidence: 0.72, evidenceKind: "ocr" as const, extensionStart: undefined, extensionEnd: undefined };
  const merged = mergeDimensionLabels([ocr], [vision, { ...vision, valueMm: 4040 }]);
  assert.equal(merged.length, 2, "Nearby different printed values must remain contradictory observations.");
  assert.equal(merged[0].confidence, 0.72);
  assert.equal(merged[0].evidenceKind, "ocr");
  assert.equal(merged[0].extensionEvidenceKind, "vision");
  assert.equal(ocr.extensionStart, undefined, "The original OCR evidence remains immutable.");
  const annotations = sourceProposalAnnotations(page, "synthetic-source", "test");
  assert.equal(annotations.length, 3);
  assert.ok(annotations.every((entry) => entry.scope === "reference" && entry.geometry.kind === "source_drawing" && entry.provenance.confidence === 0));
  console.log("Raster dimension associations: full ticks, adjacent spans, missing/ambiguous support, coordinates, contradictions and provenance PASS");
}
