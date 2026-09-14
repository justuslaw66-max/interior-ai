import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { applyFloorPlanTopologyMutationsV2 } from "@/lib/floor-plan-topology-mutations";
import { buildFloorPlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg, layoutFloorPlanVectorExport } from "@/lib/floor-plan-vector-export";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";

async function main() {
  const source = authoredApartment();
  const result = applyFloorPlanTopologyMutationsV2(source, [
    { kind: "remove_wall", floorId: "apartment", wallId: "shared", confirmedOpeningIds: ["door"], keepRoomId: "living" },
    { kind: "add_wall", floorId: "apartment", wallId: "replacement", startVertexId: "b", endVertexId: "e", thicknessMm: 120, newRoomId: "study", newRoomName: "Study" },
    { kind: "add_opening", floorId: "apartment", opening: { id: "new-door", wallId: "replacement", kind: "door", operation: "swing", widthMm: 850, offsetMm: 1700, hinge: "end", handing: "right" } },
  ], { mutationId: "proof", nextRevisionId: "proposed-proof", actorId: "fixture-author", mutatedAt: "2026-09-14T01:00:00Z" });
  const drawing = buildFloorPlanVectorDrawing(result.document, { floorId: "apartment", dimensions: true, labels: true, fixtures: true });
  assert.equal(drawing.geometryHash, compileCanonicalFloorPlanRenderModel(result.document).geometryHash);
  assert(drawing.primitives.some((p) => p.id.startsWith("replacement:wall")));
  assert(!drawing.primitives.some((p) => p.id.startsWith("shared:")));
  const options = { paper: "A4", orientation: "landscape", scale: 100 } as const;
  const layout = layoutFloorPlanVectorExport(drawing, options);
  assert.equal(9260 / layout.scale, 92.6);
  const bytes = await exportFloorPlanVectorPdf(drawing, options);
  assert.deepEqual(bytes, await exportFloorPlanVectorPdf(drawing, options));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert(Math.abs(pdf.getPage(0).getWidth() / (72 / 25.4) - 297) < 1e-9);
  const streams = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFRawStream ? [object] : []);
  assert(!streams.some((stream) => stream.dict.get(PDFName.of("Subtype"))?.toString() === "/Image"));
  const content = streams.map((stream) => Buffer.from(decodePDFRawStream(stream).decode()).toString()).join("\n");
  const count = (regex: RegExp) => [...content.matchAll(regex)].length;
  assert(count(/\bBT\b/g) >= 5, "Editable text operators must remain");
  assert(count(/\bm\b/g) >= 15, "Separate path components must remain");
  assert(count(/\bc\b/g) > 0, "Swing must contain a cubic curve");
  const svg = exportFloorPlanVectorSvg(drawing, options);
  assert(svg.includes("9260"));
  assert(!svg.includes("<image"));
  const output = process.env.SCAN_PLAN_ARTIFACT_DIR;
  if (output) {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "proposed-apartment.pdf"), bytes);
    await fs.writeFile(path.join(output, "proposed-apartment.svg"), svg);
    await fs.writeFile(path.join(output, "proposed-apartment.json"), JSON.stringify(result.document, null, 2));
    await fs.writeFile(path.join(output, "vector-inspection.json"), JSON.stringify({ layout, primitiveCount: drawing.primitives.length, pathCount: count(/\bm\b/g), textCount: count(/\bBT\b/g), cubicCount: count(/\bc\b/g), imageCount: 0, geometryHash: drawing.geometryHash, unsupported: drawing.unsupported }, null, 2));
  }
  console.log(`PASS: remove/add/opening/3D/vector PDF+SVG proof; ${drawing.primitives.length} primitives, ${count(/\bBT\b/g)} text objects, ${count(/\bc\b/g)} cubic curves, zero images, 92.6 mm physical scale.`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
