import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { registeredImportUnderlay } from "@/lib/floor-plan-imports/registered-underlay";
import { vectorUnderlayCorners, vectorUnderlayPlacement } from "@/lib/floor-plan-vector-underlay";
import { applyFloorPlanScaleCalibration, mapUnderlayWorldPointToPixels } from "@/lib/floor-plan-calibration";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { buildFloorPlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg } from "@/lib/floor-plan-vector-export";
import { authoredReferenceImage } from "./test-scan-plan-vector-underlay";
import { authoredRegisteredUnderlayDocument, authoredSourcePoint } from "./fixtures/scan-to-editable-plan/registered-underlay";
import { vectorExportFontBytes, vectorPdfPageContent } from "./fixtures/scan-to-editable-plan/pdf-vector-inspection";
import { physicalDimensionLineMm } from "./fixtures/scan-to-editable-plan/pdf-physical-scale";

async function main() {
  const document = authoredRegisteredUnderlayDocument(), before = JSON.stringify(document);
  const input = { document, jobId: "authored-registration", sourceAsset: { id: "authored-source", sha256: "a".repeat(64), fileName: "private-reference.png", mimeType: "image/png" },
    renderedPages: [{ pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "authored-image" }] };
  const underlay = registeredImportUnderlay(input)!;
  assert.equal(underlay.flipY, true); assert.ok(Math.abs(underlay.skewX!) > 0.01);
  const pixels = [[0, 0], [1000, 0], [1000, 800], [0, 800]];
  const expected = pixels.map(([x, y]) => authoredSourcePoint(x, y));
  const placement = vectorUnderlayPlacement(underlay, "apartment"), corners = vectorUnderlayCorners(placement);
  corners.forEach((point, index) => {
    assert.ok(Math.hypot(point.xMm - expected[index].xMm, point.zMm - expected[index].zMm) <= 0.00001);
    const sourcePixel = mapUnderlayWorldPointToPixels(underlay, { x: expected[index].xMm / 1000, z: expected[index].zMm / 1000 })!;
    assert.ok(sourcePixel.x === pixels[index][0] && sourcePixel.y === pixels[index][1]);
  });
  const stored = snapshotToStored(canonicalFloorPlanToDesignSnapshot(document, { underlay }).snapshot);
  assert.deepEqual(storedToSnapshot(JSON.parse(JSON.stringify(stored))).floorPlan!.underlay, underlay);
  assert.equal(JSON.stringify(document), before);
  assert.throws(() => registeredImportUnderlay({ ...input, renderedPages: [{ ...input.renderedPages[0], widthPx: 999 }] }), /dimensions changed/);
  const first = authoredSourcePoint(0, 0), second = authoredSourcePoint(1000, 0);
  const calibrated = applyFloorPlanScaleCalibration({ underlay, points: [{ x: first.xMm / 1000, z: first.zMm / 1000 }, { x: second.xMm / 1000, z: second.zMm / 1000 }],
    referenceLengthMeters: 2 * Math.hypot(second.xMm - first.xMm, second.zMm - first.zMm) / 1000 })!;
  assert.equal(calibrated.skewX, underlay.skewX); assert.equal(calibrated.flipY, underlay.flipY);
  assert.ok(Math.abs(calibrated.widthMeters - 2 * underlay.widthMeters) <= 0.0005);
  assert.ok(Math.abs(calibrated.depthMeters - 2 * underlay.depthMeters) <= 0.0005);
  const drawing = buildFloorPlanVectorDrawing(document, { floorId: "apartment", dimensions: true, labels: true, fixtures: true });
  const options = { paper: "A4", orientation: "landscape", scale: 100 } as const;
  const pngBytes = await sharp(await authoredReferenceImage()).resize(1000, 800, { fit: "fill" }).png().toBuffer();
  const resources = { fontBytes: await vectorExportFontBytes(), underlay: { ...placement, pngBytes } };
  const pdfBytes = await exportFloorPlanVectorPdf(drawing, options, resources), pdf = await PDFDocument.load(pdfBytes);
  const content = vectorPdfPageContent(pdf), svg = await exportFloorPlanVectorSvg(drawing, options, resources);
  assert.equal((content.match(/\bDo\b/g) ?? []).length, 1);
  assert.ok(Math.abs(physicalDimensionLineMm(content, 9260)! - 92.6) <= 0.01);
  assert.ok(svg.includes(`matrix(1 0 ${underlay.skewX} -1 0 0)`));
  const output = process.env.SCAN_PLAN_ARTIFACT_DIR;
  if (output) {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "registered-reference.pdf"), pdfBytes);
    await fs.writeFile(path.join(output, "registered-reference.svg"), svg);
    await fs.writeFile(path.join(output, "registered-reference.json"), JSON.stringify({ underlay, expected, corners }, null, 2));
  }
  console.log("PASS: independently authored affine/reflected registration, all four image corners, inverse pixel mapping, persisted reload, uniform recalibration and separate fixed-scale PDF/SVG.");
}
void main().catch((cause) => { console.error(cause); process.exitCode = 1; });
