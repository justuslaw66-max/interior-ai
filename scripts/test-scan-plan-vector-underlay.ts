import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import type { PlanVectorDrawing } from "@/lib/floor-plan-vector-drawing";
import { exportFloorPlanVectorPdf, exportFloorPlanVectorSvg } from "@/lib/floor-plan-vector-export";
import { vectorUnderlayCorners, vectorUnderlayPlacement } from "@/lib/floor-plan-vector-underlay";
import { loadVectorUnderlay, vectorUnderlaySource } from "@/lib/floor-plan-vector-underlay-source";
import { mapUnderlayWorldPointToPixels } from "@/lib/floor-plan-calibration";
import type { FloorPlanUnderlay } from "@/lib/floor-plan-types";
import { vectorPdfPageContent } from "./fixtures/scan-to-editable-plan/pdf-vector-inspection";
import { physicalDimensionLineMm } from "./fixtures/scan-to-editable-plan/pdf-physical-scale";

export async function authoredReferenceImage() {
  const data = Buffer.alloc(80 * 60 * 3);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 80; x++) {
    const rgb = y < 30 ? (x < 40 ? [255, 0, 0] : [0, 255, 0]) : (x < 40 ? [0, 0, 255] : [255, 255, 0]);
    rgb.forEach((value, channel) => { data[(y * 80 + x) * 3 + channel] = value; });
  }
  return sharp(data, { raw: { width: 80, height: 60, channels: 3 } }).withMetadata({ exif: { IFD0: { Artist: "PRIVATE_METADATA_SENTINEL" } } }).png().toBuffer();
}

export function authoredUnderlay(assetUrl: string): FloorPlanUnderlay {
  return { id: "private-underlay-name", floorId: "apartment", name: "PRIVATE_FILENAME_SENTINEL.png", assetUrl, mimeType: "image/png",
    widthPx: 80, heightPx: 60, position: { x: 4.63, z: 3 }, widthMeters: 12, depthMeters: 9,
    opacity: 0.35, rotationDeg: 30, visible: false, locked: true };
}

async function testUnderlayAccess(source: FloorPlanUnderlay) {
  assert.throws(() => vectorUnderlaySource({ ...source, assetUrl: "https://unrequested.invalid/private.png" }), /unavailable/);
  assert.throws(() => vectorUnderlaySource({ ...source, sourceJobId: "deleted-import" }), /refresh its private/);
  assert.throws(() => vectorUnderlaySource(source, "linked-import"), /refresh its private/);
  const linked = { ...source, assetUrl: "/api/floor-plan-imports/owner-job/assets/image-id", sourceJobId: "owner-job" };
  assert.equal(vectorUnderlaySource(linked).jobId, "owner-job");
  const originalFetch = globalThis.fetch, requests: string[] = [];
  try {
    globalThis.fetch = async (input) => { requests.push(String(input)); return new Response("{}", { status: 403 }); };
    await assert.rejects(loadVectorUnderlay(linked, "apartment", new AbortController().signal), /unavailable/);
    assert.deepEqual(requests, ["/api/floor-plan-imports/owner-job"], "Denied ownership never reads the asset or stale local bytes.");
    globalThis.fetch = async () => new Response(JSON.stringify({ job: { id: "owner-job", sourceDeletionRequestedAt: "2026-09-15", sourceAsset: { contentDeletedAt: null } } }));
    await assert.rejects(loadVectorUnderlay(linked, "apartment", new AbortController().signal), /deleted, changed/);
  } finally { globalThis.fetch = originalFetch; }
}

export async function testVectorUnderlay(drawing: PlanVectorDrawing, resources: { fontBytes: Uint8Array }) {
  const originalPng = await authoredReferenceImage(), source = authoredUnderlay(`data:image/png;base64,${originalPng.toString("base64")}`);
  const before = JSON.stringify(source), placement = vectorUnderlayPlacement(source, "apartment");
  assert.throws(() => vectorUnderlayPlacement(source, "other-floor"), /different floor/);
  const rotated = vectorUnderlayCorners({ ...placement, rotationDeg: 90 });
  assert.deepEqual(rotated.map(({ xMm, zMm }) => [Math.round(xMm), Math.round(zMm)]), [[130, 9000], [130, -3000], [9130, -3000], [9130, 9000]]);
  const corners = vectorUnderlayCorners(placement);
  const expectedPixels = [[0, 0], [80, 0], [80, 60], [0, 60]];
  corners.forEach(({ xMm, zMm }, index) => {
    const pixel = mapUnderlayWorldPointToPixels(source, { x: xMm / 1000, z: zMm / 1000 })!;
    assert(pixel.x === expectedPixels[index][0] && pixel.y === expectedPixels[index][1], "Exact source-pixel corners must agree, including equivalent signed zero.");
  });
  await testUnderlayAccess(source);
  // Fixture pixels are independently normalized here; browser coverage tests the app's decoder.
  const pngBytes = await sharp(originalPng).png().toBuffer(), underlay = { ...placement, pngBytes };
  const options = { paper: "A4", orientation: "landscape", scale: 100 } as const;
  const bytes = await exportFloorPlanVectorPdf(drawing, options, { ...resources, underlay }), pdf = await PDFDocument.load(bytes);
  const images = pdf.context.enumerateIndirectObjects().flatMap(([, object]) => object instanceof PDFRawStream && object.dict.get(PDFName.of("Subtype"))?.toString() === "/Image" ? [object] : []);
  assert.equal(images.length, 1, "Only the explicit underlay is raster; architecture remains separate paths.");
  const content = vectorPdfPageContent(pdf);
  assert.equal((content.match(/\bDo\b/g) ?? []).length, 1);
  assert.equal((content.match(/\bm\b/g) ?? []).length, drawing.primitives.filter(({ kind }) => kind === "path").length);
  assert(Math.abs(physicalDimensionLineMm(content, 9260)! - 92.6) <= 0.01);
  const svg = await exportFloorPlanVectorSvg(drawing, options, { ...resources, underlay });
  assert(svg.indexOf('id="reference-underlay"') < svg.indexOf("<path"));
  assert(svg.includes("rotate(-30)"));
  assert.equal((svg.match(/<image /g) ?? []).length, 1);
  assert.deepEqual(Buffer.from(/href="data:image\/png;base64,([^"]+)"/.exec(svg)![1], "base64"), pngBytes, "SVG embedding must preserve every normalized image byte.");
  assert(!svg.includes("PRIVATE_FILENAME_SENTINEL") && !svg.includes("private-underlay-name") && !Buffer.from(pngBytes).includes(Buffer.from("PRIVATE_METADATA_SENTINEL")));
  await assert.rejects(exportFloorPlanVectorPdf(drawing, options, { ...resources, underlay: { ...underlay, widthMm: 100_000 } }), /will not fit/);
  assert.equal(JSON.stringify(source), before);
  const output = process.env.SCAN_PLAN_ARTIFACT_DIR;
  if (output) {
    await fs.mkdir(output, { recursive: true });
    await fs.writeFile(path.join(output, "reference-underlay.pdf"), bytes);
    await fs.writeFile(path.join(output, "reference-underlay.svg"), svg);
  }
  console.log("PASS: separate rotated underlay, scene transform parity, fixed scale, metadata exclusion, access denial and deletion guards.");
}
