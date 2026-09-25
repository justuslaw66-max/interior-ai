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
  testVisionOnlyLabelSetAside();
  testUnpairedLabelsSupportOnly();
}

/** Seven printed dimensions with raster tick support agree on 10 mm/px; one more label, read by the external vision
 *  reader alone, says 3650 where its ticks span 320 px (the plan prints 3620). d12 behaved like this on 25 Sep 2026:
 *  one misread digit sank the whole page. The label is set aside as a review item; an OCR reading of the same number
 *  still vetoes, and so does a vision label when the cluster is thin. */
function testVisionOnlyLabelSetAside() {
  const W = 2000, H = 1500;
  const spans: Array<[number, [number, number], [number, number]]> = [
    [900, [100, 100], [190, 100]], [900, [200, 100], [290, 100]], [2920, [300, 100], [592, 100]], [2040, [600, 100], [804, 100]],
    [4490, [50, 200], [50, 649]], [1830, [50, 700], [50, 883]], [1285, [50, 900], [50, 1028.5]],
  ];
  const tickLabel = (valueMm: number, a: [number, number], b: [number, number], kind: "vision" | "ocr" | "vectorizer" = "vectorizer"): SemanticDimensionLabel => ({
    valueMm, centerXRatio: (a[0] + b[0]) / 2 / W, centerYRatio: (a[1] + b[1]) / 2 / H, orientation: a[0] === b[0] ? "vertical" : "horizontal",
    confidence: kind === "vision" ? 0.55 : 0.85, evidenceKind: kind, rawText: String(valueMm),
    extensionStart: { xRatio: a[0] / W, yRatio: a[1] / H }, extensionEnd: { xRatio: b[0] / W, yRatio: b[1] / H } });
  const build = (kind: "vision" | "ocr", supported = spans) => {
    const labels = supported.map(([mm, a, b]) => tickLabel(mm, a, b));
    labels.push(tickLabel(3650, [1000, 100], [1320, 100], kind));
    const page: RegisteredPageEvidence = { pageNumber: 1, widthPx: W, heightPx: H, vectorPaths: [], text: [],
      vectorSegments: [...supported, [3650, [1000, 100], [1320, 100]] as const].map(([, a, b], index) => ({
        id: `seg-${index}`, pageNumber: 1, start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] }, strokeWidthPx: 1, evidenceKind: "raster_linework" as const })),
      semantics: { roomLabels: [], openingSymbols: [], notes: [], dimensionLabels: labels } };
    page.dimensionSpanEvidence = { coordinateSpace: "rendered_px", imageSha256: "b".repeat(64),
      observations: labels.map((entry, labelIndex) => {
        const [, a, b] = labelIndex < supported.length ? supported[labelIndex] : [3650, [1000, 100], [1320, 100]] as const;
        const start = { x: a[0], y: a[1] }, end = { x: b[0], y: b[1] };
        return { labelIndex, valueMm: entry.valueMm, status: "source_supported" as const, hintStart: start, hintEnd: end, start, end, lineCoverage: 1, reason: null };
      }) };
    return page;
  };
  const vision = build("vision");
  const diagnosis = diagnoseSourceScale(vision);
  assert.equal(diagnosis.status, "accepted", "Seven confirmed spans outvote one vision-only misread");
  assert.ok(Math.abs(diagnosis.candidate!.millimetresPerPixel - 10) < 0.05);
  assert.deepEqual(diagnosis.setAsideLabelIndexes, [7]);
  assert.equal(diagnosis.conflicts.length, 0);
  assert.ok(vision.semantics.notes.some((note) => note.startsWith("Printed dimension set aside: 3650 mm")));
  assert.ok(Math.abs(solveCrossCheckedScale(vision)!.millimetresPerPixel - 10) < 0.05);
  const ocr = build("ocr");
  assert.equal(diagnoseSourceScale(ocr).status, "rejected_associations", "A locally read contradiction still vetoes");
  assert.equal(solveCrossCheckedScale(ocr), null);
  const thin = build("vision", spans.slice(0, 3));
  assert.equal(diagnoseSourceScale(thin).status, "rejected_associations", "Three spans are not enough to outvote a reader");
  console.log("Vision-only dimension misread set aside by a well-supported cluster; OCR readings and thin clusters still veto PASS");
}

/** Numbers the vectorizer read but could not pair with two stops (`unpaired`, hint-found span): they may add support
 *  to the scale the paired labels found, never change it or veto it, and they may find a scale only where the paired
 *  labels found none. */
function testUnpairedLabelsSupportOnly() {
  const W = 2000, H = 1500;
  type Span = [number, [number, number], [number, number]];
  const paired: Span[] = [[900, [100, 100], [190, 100]], [2920, [300, 100], [592, 100]], [4490, [50, 200], [50, 649]]];
  const label = (mm: number, a: [number, number], b: [number, number], unpaired: boolean): SemanticDimensionLabel => ({
    valueMm: mm, centerXRatio: (a[0] + b[0]) / 2 / W, centerYRatio: (a[1] + b[1]) / 2 / H, orientation: a[0] === b[0] ? "vertical" : "horizontal",
    confidence: unpaired ? 0.7 : 0.85, evidenceKind: "vectorizer", extensionEvidenceKind: "vectorizer", rawText: String(mm), ...(unpaired ? { unpaired } : {}),
    extensionStart: { xRatio: a[0] / W, yRatio: a[1] / H }, extensionEnd: { xRatio: b[0] / W, yRatio: b[1] / H } });
  // `found` is where the tick finder put each label's span (the hint is the label's own extension).
  const build = (pairedSpans: Span[], unpairedSpans: Span[], found: Map<number, [number, number]> = new Map()) => {
    const all = [...pairedSpans, ...unpairedSpans];
    const labels = all.map(([mm, a, b], index) => label(mm, a, b, index >= pairedSpans.length));
    const page: RegisteredPageEvidence = { pageNumber: 1, widthPx: W, heightPx: H, vectorPaths: [], text: [],
      vectorSegments: all.map(([, a, b], index) => ({ id: `seg-${index}`, pageNumber: 1, start: { x: a[0], y: a[1] }, end: { x: b[0], y: b[1] },
        strokeWidthPx: 1, evidenceKind: "raster_linework" as const })),
      semantics: { roomLabels: [], openingSymbols: [], notes: [], dimensionLabels: labels } };
    // Hints are laid out from the label's ratios exactly as the tick finder does, so they compare equal.
    page.dimensionSpanEvidence = { coordinateSpace: "rendered_px", imageSha256: "c".repeat(64), observations: all.map(([mm, a, b], labelIndex) => {
      const { extensionStart, extensionEnd } = labels[labelIndex];
      const hintStart = { x: extensionStart!.xRatio * W, y: extensionStart!.yRatio * H }, hintEnd = { x: extensionEnd!.xRatio * W, y: extensionEnd!.yRatio * H };
      const ends = found.get(labelIndex);
      const start = ends ? { x: ends[0], y: a[1] } : hintStart, end = ends ? { x: ends[1], y: b[1] } : hintEnd;
      return { labelIndex, valueMm: mm, status: "source_supported" as const, hintStart, hintEnd, start, end, lineCoverage: 1, reason: null };
    }) };
    return page;
  };
  const alone = diagnoseSourceScale(build(paired, []));
  assert.equal(alone.status, "accepted"); assert.equal(alone.candidate!.dimensionCount, 3);
  // Agreeing unpaired labels strengthen the answer.
  const helped = diagnoseSourceScale(build(paired, [[3030, [700, 100], [1003, 100]], [1520, [1100, 100], [1252, 100]]]));
  assert.equal(helped.status, "accepted"); assert.equal(helped.candidate!.dimensionCount, 5, "two agreeing unpaired labels join the three paired ones");
  assert.ok(Math.abs(helped.candidate!.millimetresPerPixel - 10) < 0.02); assert.deepEqual(helped.setAsideLabelIndexes, []);
  // A disagreeing unpaired label (its hint-found span 4 % short) is set aside as a review item, never a veto.
  const off = build(paired, [[3030, [700, 100], [1003, 100]], [1520, [1100, 100], [1252, 100]]], new Map([[4, [1100, 1246]]]));
  const aside = diagnoseSourceScale(off);
  assert.equal(aside.status, "accepted", "an unpaired disagreement does not veto"); assert.equal(aside.candidate!.dimensionCount, 4);
  assert.deepEqual(aside.setAsideLabelIndexes, [4]); assert.equal(aside.conflicts.length, 0);
  assert.ok(off.semantics.notes.some((note) => note.startsWith("Printed dimension set aside: 1520 mm read on the plan but not matched to two stops")));
  // A paired label the seed already accepted at the edge of tolerance is not tipped into a conflict by the widened
  // median: the paired answer is kept, the unpaired labels add nothing.
  const edge: Span[] = [[900, [100, 100], [190, 100]], [2920, [300, 100], [592, 100]], [4490, [50, 200], [50, 649]], [2000, [1300, 100], [1502.9, 100]]];
  const nudged = diagnoseSourceScale(build(edge, [[3030, [700, 100], [1003, 100]], [1520, [1100, 100], [1252, 100]], [2500, [1600, 100], [1850, 100]]]));
  assert.equal(nudged.status, "accepted", "the paired answer stands"); assert.equal(nudged.conflicts.length, 0);
  assert.ok(nudged.candidate!.dimensionCount >= 4);
  // Where the paired labels reach no answer, the unpaired ones may find one.
  const rescued = diagnoseSourceScale(build([[900, [100, 100], [190, 100]]], [[3030, [700, 100], [1003, 100]], [1520, [1100, 100], [1252, 100]]]));
  assert.equal(rescued.status, "accepted"); assert.equal(rescued.candidate!.dimensionCount, 3);
  console.log("Unpaired vectorizer numbers add support to the paired scale, never change or veto it, and find one only where the paired labels found none PASS");
}
