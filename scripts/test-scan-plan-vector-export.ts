import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { authoredApartment } from "./fixtures/scan-to-editable-plan/apartment";
import { applyFloorPlanTopologyMutationsV2 } from "@/lib/floor-plan-topology-mutations";
import { buildFloorPlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg, layoutFloorPlanVectorExport } from "@/lib/floor-plan-vector-export";
import { compileCanonicalFloorPlanRenderModel } from "@/lib/floor-plan-render-model";
import { physicalDimensionLineMm } from "./fixtures/scan-to-editable-plan/pdf-physical-scale";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { loadPlanVectorFont } from "@/lib/floor-plan-vector-font";
import { vectorExportFontBytes, vectorPdfEmbeddedFonts, vectorPdfPageContent } from "./fixtures/scan-to-editable-plan/pdf-vector-inspection";
import { testVectorUnderlay } from "./test-scan-plan-vector-underlay";
import { testVectorInk, testVectorJunctions } from "./test-scan-plan-vector-junctions";

function testFurnitureDrawing(document: ReturnType<typeof authoredApartment>) {
  const snapshot = canonicalFloorPlanToDesignSnapshot(document).snapshot, room = snapshot.rooms[0];
  room.items = [{ instanceId: "independent-sofa", productId: "offline-sofa", variantId: "authored", position: [1, 0, 1], rotationY: Math.PI / 2,
    productSnapshot: { schemaVersion: 1, productId: "offline-sofa", variantId: "authored", name: "Authored sofa", category: "sofa",
      dimensionsMm: { w: 1000, d: 600, h: 800 }, variantLabel: "Authored", assets: {} } }];
  const options = { floorId: "apartment", dimensions: true, labels: true, fixtures: true }, source = { rooms: snapshot.rooms };
  const before = JSON.stringify({ document, snapshot });
  const drawing = buildFloorPlanVectorDrawing(document, options, source), furniture = drawing.primitives.filter((primitive) => primitive.role === "furniture");
  assert.equal(furniture.length, 1, "A placed item must be a separate editable path.");
  const outline = furniture[0]; assert.equal(outline.kind, "path");
  if (outline.kind !== "path") throw new Error("Expected furniture outline");
  const x = (room.planPosition!.x + 1) * 1000, z = (room.planPosition!.z + 1) * 1000;
  assert.deepEqual(outline.points.map((point) => [Math.round(point.xMm), Math.round(point.zMm)]),
    [[x - 300, z + 500], [x - 300, z - 500], [x + 300, z - 500], [x + 300, z + 500]], "Independent 90-degree corners must retain item world position and dimensions.");
  assert.equal(JSON.stringify({ document, snapshot }), before, "Export cannot alter accepted or original design state.");
  assert(!buildFloorPlanVectorDrawing(document, { ...options, fixtures: false }, source).primitives.some((primitive) => primitive.role === "furniture"));
  room.items[0].configurationCode = "missing-config";
  assert(buildFloorPlanVectorDrawing(document, options, source).unsupported.some((note) => note.includes("dimensions unresolved")), "Unknown configuration must be reported instead of exporting a guessed footprint.");
  delete room.items[0].configurationCode; delete room.items[0].productSnapshot;
  assert(buildFloorPlanVectorDrawing(document, options, source).unsupported.some((note) => note.includes("dimensions unresolved")), "Unavailable offline dimensions must not disappear silently.");
}

async function main() {
  const source = authoredApartment();
  const result = applyFloorPlanTopologyMutationsV2(source, [
    { kind: "remove_wall", floorId: "apartment", wallId: "shared", confirmedOpeningIds: ["door"], keepRoomId: "living" },
    { kind: "add_wall", floorId: "apartment", wallId: "replacement", startVertexId: "b", endVertexId: "e", thicknessMm: 120, newRoomId: "study", newRoomName: "Study" },
    { kind: "add_opening", floorId: "apartment", opening: { id: "new-door", wallId: "replacement", kind: "door", operation: "swing", widthMm: 850, offsetMm: 1700, hinge: "end", handing: "right" } },
    { kind: "add_structure", floorId: "apartment", structure: { id: "fixture-column", kind: "column", name: "Authored column", locked: true, vertexIds: ["col-a", "col-b", "col-c", "col-d"], baseOffsetMm: 0, heightMm: 2600 },
      vertices: [{ id: "col-a", xMm: 7800, zMm: 4400 }, { id: "col-b", xMm: 8150, zMm: 4400 }, { id: "col-c", xMm: 8150, zMm: 4650 }, { id: "col-d", xMm: 7800, zMm: 4650 }] },
  ], { mutationId: "proof", nextRevisionId: "proposed-proof", actorId: "fixture-author", mutatedAt: "2026-09-14T01:00:00Z" });
  const drawing = buildFloorPlanVectorDrawing(result.document, { floorId: "apartment", dimensions: true, labels: true, fixtures: true });
  testVectorJunctions(result.document);
  testFurnitureDrawing(result.document);
  assert.equal(drawing.geometryHash, compileCanonicalFloorPlanRenderModel(result.document).geometryHash);
  assert(drawing.primitives.some((p) => p.id.startsWith("replacement:wall")));
  assert(!drawing.primitives.some((p) => p.id.startsWith("shared:")));
  const options = { paper: "A4", orientation: "landscape", scale: 100 } as const;
  const resources = { fontBytes: await vectorExportFontBytes() }, font = await loadPlanVectorFont(resources.fontBytes);
  await testVectorUnderlay(drawing, resources);
  const layout = layoutFloorPlanVectorExport(drawing, options, font.font);
  assert.equal(9260 / layout.scale, 92.6);
  const bytes = await exportFloorPlanVectorPdf(drawing, options, resources);
  assert.deepEqual(bytes, await exportFloorPlanVectorPdf(drawing, options, resources));
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert(Math.abs(pdf.getPage(0).getWidth() / (72 / 25.4) - 297) < 1e-9);
  const streams = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFRawStream ? [object] : []);
  assert(!streams.some((stream) => stream.dict.get(PDFName.of("Subtype"))?.toString() === "/Image"));
  assert.deepEqual(vectorPdfEmbeddedFonts(pdf), [resources.fontBytes], "The licensed font program must be embedded intact, not replaced by outlines or a missing external font.");
  const content = vectorPdfPageContent(pdf);
  const count = (regex: RegExp) => [...content.matchAll(regex)].length;
  const measuredPaperMm = physicalDimensionLineMm(content, 9260);
  assert(measuredPaperMm !== undefined && Math.abs(measuredPaperMm - 92.6) <= 0.01, "Actual PDF path after all emitted transforms must measure 92.6 mm");
  assert(count(/\bBT\b/g) >= 5, "Editable text operators must remain");
  assert(count(/\bm\b/g) >= 15, "Separate path components must remain");
  assert(count(/\bc\b/g) > 0, "Swing must contain a cubic curve");
  const svg = await exportFloorPlanVectorSvg(drawing, options, resources);
  testVectorInk(svg, 100);
  testVectorInk(await exportFloorPlanVectorSvg(drawing, { ...options, scale: 50 }, resources), 50);
  assert(svg.includes("data:font/ttf;base64,"), "SVG keeps text and carries the matching display font.");
  const label = { id: "unicode", kind: "text", text: "Café Ω", point: { xMm: 2500, zMm: 1700 }, role: "annotation-text" } as const;
  const unicodeDrawing = { ...drawing, primitives: [...drawing.primitives, label] };
  const unicodePdf = await exportFloorPlanVectorPdf(unicodeDrawing, options, resources);
  const invalid = { ...drawing, primitives: [{ ...label, text: "卧室" }] };
  await assert.rejects(exportFloorPlanVectorPdf(invalid, options, resources), /does not contain/);
  assert.throws(() => layoutFloorPlanVectorExport({ ...drawing, primitives: [{ ...label, text: "W".repeat(150) }] }, options, font.font), /will not fit/, "A label cannot fit merely because its anchor is on the page.");
  assert.throws(() => layoutFloorPlanVectorExport(drawing, { ...options, title: "W".repeat(150) }, font.font), /title will not fit/);
  assert(svg.includes("9260"));
  assert(!svg.includes("<image"));
  const output = process.env.SCAN_PLAN_ARTIFACT_DIR;
  if (output) {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "proposed-apartment.pdf"), bytes);
    await fs.writeFile(path.join(output, "proposed-apartment.svg"), svg);
    await fs.writeFile(path.join(output, "editable-font-unicode.pdf"), unicodePdf);
    await fs.writeFile(path.join(output, "proposed-apartment.json"), JSON.stringify(result.document, null, 2));
    await fs.writeFile(path.join(output, "drawing-manifest.json"), JSON.stringify({ layout, drawing }, null, 2));
    await fs.writeFile(path.join(output, "vector-inspection.json"), JSON.stringify({ layout, measuredPaperMm, primitiveCount: drawing.primitives.length, pathCount: count(/\bm\b/g), textCount: count(/\bBT\b/g), cubicCount: count(/\bc\b/g), imageCount: 0, geometryHash: drawing.geometryHash, unsupported: drawing.unsupported }, null, 2));
  }
  console.log(`PASS: remove/add/opening/3D/vector PDF+SVG proof; ${drawing.primitives.length} primitives, ${count(/\bBT\b/g)} text objects, ${count(/\bc\b/g)} cubic curves, zero images, 92.6 mm physical scale.`);
}
main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
