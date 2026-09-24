import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { acceptedPhotoFixture } from "./fixtures/scan-to-editable-plan/photo-calibration";
import { vectorExportFontBytes, vectorPdfPageContent } from "./fixtures/scan-to-editable-plan/pdf-vector-inspection";
import { replaceSourceTrace } from "../lib/floor-plan-source-trace";
import { sourceArtworkDrawing } from "../lib/floor-plan-source-trace-export";
import { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg } from "../lib/floor-plan-vector-export";
import { TRACE_SETTINGS } from "../lib/floor-plan-imports/source-trace-mask";
async function main() {
  const input = acceptedPhotoFixture(), sourceId = input.sources[0].id;
  input.floors[0].calibrations = [];
  const document = replaceSourceTrace(input, {
    version: TRACE_SETTINGS.version, settings: TRACE_SETTINGS, widthPx: 1000, heightPx: 1000,
    diagnostics: { inkPixels: 0, removedSpeckPixels: 0, rawChains: 1, fillContours: 0, curves: 1, elapsedMs: 0, glyphPixels: 0 },
    paths: [{ points: [{x:20,y:20},{x:40,y:20},{x:80,y:50},{x:80,y:90}], commands: ["C"], fill: false, strokeWidthPx: 1, groupId: "curve" }],
  }, sourceId, 1);
  const before = JSON.stringify(document), drawing = sourceArtworkDrawing(document, sourceId, 1);
  assert.equal(drawing.primitives.length, 1, "Raw candidates and architecture cannot leak into final artwork export");
  assert.equal(drawing.coordinateSpace, "source_pixels");
  const resources = { fontBytes: await vectorExportFontBytes() };
  const options = { paper: "A4", orientation: "portrait", scale: 100 } as const;
  const svg = await exportFloorPlanVectorSvg(drawing, options, resources);
  assert.ok(svg.includes("uncalibrated image coordinates | no physical scale"));
  assert.ok(!svg.includes(" | 1:100 | ") && !svg.includes("<image"));
  const pdf = await PDFDocument.load(await exportFloorPlanVectorPdf(drawing, options, resources));
  assert.equal(pdf.getPageCount(), 1);
  assert.ok(vectorPdfPageContent(pdf).match(/\bc\b/), "Native cubic paths survive PDF export");
  for (const [, object] of pdf.context.enumerateIndirectObjects()) if (object instanceof PDFRawStream) {
    assert.notEqual(object.dict.get(PDFName.of("Subtype"))?.toString(), "/Image");
  }
  assert.equal(JSON.stringify(document), before);
  console.log("PASS: uncalibrated source-only export, native curves, zero raster images, truthful scale label and immutable input.");
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
