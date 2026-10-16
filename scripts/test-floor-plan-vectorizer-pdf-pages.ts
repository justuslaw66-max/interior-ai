import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import { pageGeometryBasis } from "@/lib/floor-plan-imports/mixed-pdf-evidence";
import { PdfRasterFloorPlanSourceAdapter, registerSupportedPageTopology } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import { mergeSemantics } from "@/lib/floor-plan-imports/semantic-merge";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import { parseFloorPlanVectorizerEvidence, registerVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-evidence";
import {
  ownLineworkClosesRooms,
  vectorizerCandidatePages,
  vectorizerReadingsLead,
} from "@/lib/floor-plan-imports/vectorizer-pdf-pages";

/**
 * A drawn vector PDF whose own linework closes no room (an HDB floor-plan PDF: clean paths the
 * deterministic topology cannot pair into walls) is read by the local vectorizer like an image;
 * a vector page whose linework closes its rooms is not, and its exact text stays in front.
 */

const context = { jobId: "vectorizer-pdf-pages-test" } as unknown as FloorPlanAdapterContext;
const fixtureDirectory = path.join(__dirname, "fixtures", "floor-plan-vectorizer");

function segment(id: string, from: [number, number], to: [number, number], evidenceKind: "pdf_vector" | "raster_linework") {
  return { id, pageNumber: 1, start: { x: from[0], y: from[1] }, end: { x: to[0], y: to[1] }, strokeWidthPx: 1, evidenceKind };
}

function page(pageNumber: number, evidenceKind: "pdf_vector" | "raster_linework"): RegisteredPageEvidence {
  return {
    pageNumber, widthPx: 100, heightPx: 100,
    vectorSegments: [segment(`s${pageNumber}`, [0, 0], [10, 0], evidenceKind)],
    vectorPaths: [], text: [],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
}

function testCandidatePages() {
  const raster = page(1, "raster_linework"), closed = page(2, "pdf_vector"), open = page(3, "pdf_vector");
  const asked: number[] = [];
  const closes = (p: RegisteredPageEvidence) => { asked.push(p.pageNumber); return p === closed; };
  assert.deepEqual(vectorizerCandidatePages([raster, closed, open], [raster], closes).map((p) => p.pageNumber), [1, 3],
    "raster pages always; a vector page only when its own linework closes no room");
  assert.deepEqual(asked, [2, 3], "the raster page is not judged again");
  assert.deepEqual(vectorizerCandidatePages([raster], [raster], () => assert.fail("no vector page to judge")).map((p) => p.pageNumber), [1]);
  assert.equal(vectorizerReadingsLead(raster), true, "on a raster page the vectorizer's readings lead");
  assert.equal(vectorizerReadingsLead(open), false, "on a vector page the PDF's own text leads");
}

function testGeometryBasis() {
  const vector = page(1, "pdf_vector");
  const measured = [{ registrationKind: "vectorizer_wall_topology" }];
  assert.equal(pageGeometryBasis(vector, "application/pdf"), "vector_traced");
  assert.equal(pageGeometryBasis(vector, "application/pdf", [{ registrationKind: "assembled_wall_topology" }]), "vector_traced");
  assert.equal(pageGeometryBasis(vector, "application/pdf", measured), "raster_traced",
    "rooms the vectorizer measured on the rendered page are raster-traced");
  assert.equal(pageGeometryBasis(page(1, "raster_linework"), "image/png"), "raster_traced");
}

/** d12's real exporter output, on a stand-in vector PDF page: its own linework (single wall lines) closes no room. */
async function testVectorPageReadByTheVectorizer() {
  const bytes = readFileSync(path.join(fixtureDirectory, "d12.evidence.json"));
  const evidence = parseFloorPlanVectorizerEvidence(JSON.parse(bytes.toString("utf8")));
  const vector: RegisteredPageEvidence = {
    pageNumber: 1, widthPx: evidence.page.widthPx, heightPx: evidence.page.heightPx,
    vectorSegments: evidence.wallEdges.map((edge, i) =>
      segment(`pdf-${i + 1}`, edge.sourcePx[0] as [number, number], edge.sourcePx[1] as [number, number], "pdf_vector")),
    vectorPaths: [], text: [],
    semantics: { roomLabels: [{ label: "LIVING/DINING", roomType: "living", centerXRatio: 0.5, centerYRatio: 0.5, confidence: 0.98 }],
      dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  assert.equal(ownLineworkClosesRooms(vector, registerSupportedPageTopology), false, "its own linework closes no room");
  assert.deepEqual(vectorizerCandidatePages([vector], [], (p) => ownLineworkClosesRooms(p, registerSupportedPageTopology)), [vector]);
  assert.equal(vector.semantics.notes.length, 0, "judging the page leaves no scale notes on it");

  const pdfLabel = vector.semantics.roomLabels[0];
  vector.semantics = mergeSemantics(vector.semantics, registerVectorizerEvidence(vector, evidence, bytes), vectorizerReadingsLead(vector));
  assert.deepEqual(vector.semantics.roomLabels[0], pdfLabel, "the PDF's own label stays first and unchanged");
  assert.ok(vector.vectorizer?.rooms.length, "the vectorizer's rooms are on the page");

  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const extracted = {
    candidate: {
      kind: "floor_plan_deterministic_evidence_v1",
      source: { id: "source-hdb-pdf", fileName: "plan.pdf", mimeType: "application/pdf", sha256: "0".repeat(64) },
      pages: [vector], scale: null, scales: [],
    } as unknown as Record<string, unknown>,
    sourceManifest: null, reviewIssues: [],
  };
  const solved = await adapter.solveScale(extracted);
  const built = await adapter.buildTopology(solved, context);
  const document = (await adapter.validate(built)).candidate as unknown as FloorPlanDocumentV2;
  const rooms = document.floors[0]?.rooms ?? [];
  assert.equal(rooms.length, evidence.rooms.length, "every room the vectorizer measured reaches the plan");
  const bases = new Set(document.floors[0].walls.flatMap((wall) => wall.provenance.evidence.map((item) => item.basis)));
  assert.deepEqual([...bases], ["raster_traced"], "its walls are recorded as traced from the rendered page");
}

async function main() {
  testCandidatePages();
  testGeometryBasis();
  await testVectorPageReadByTheVectorizer();
  console.log("floor-plan vectorizer on vector PDF pages: ok");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
