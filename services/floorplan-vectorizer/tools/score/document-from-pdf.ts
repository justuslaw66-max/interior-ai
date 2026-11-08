// The score harness for vector PDF pages (8 Nov 2026): a PDF through the app's own import stages as the live app runs
// it - the PDF's own vector evidence and text, then the local vectorizer on the rendered page where the page's own
// linework closes no room - written as document-from-evidence.ts's summaries for corrections.py and topology.py.
// The vectorizer is not run here: its evidence for the rendered page (the worker's stage 1, name reader and exporter on
// that same PNG) is handed back by a stand-in provider, so a run is fast and repeatable. Render the page as the app
// does (2x the PDF's points, at most 16 MP: `pdftoppm -r 144` for an A4 page).
// Optionally writes the whole FloorPlanDocumentV2 beside the summary (--documents=<dir>).
// Run from the root of a checkout of the app:
//   npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
//       -r tsconfig-paths/register services/floorplan-vectorizer/tools/score/document-from-pdf.ts \
//       <out.json> [--documents=<dir>] <name>=<plan.pdf>,<page.png>,<evidence.json>[,<pageNumber>] ...
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import { parseFloorPlanVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-evidence";
import type { FloorPlanVectorizerProvider } from "@/lib/floor-plan-imports/vectorizer-provider";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { type PdfFace, pdfPageDrawing } from "@/lib/floor-plan-imports/pdf-wall-faces";
import { facePairFor, wallRuns } from "@/lib/floor-plan-imports/pdf-wall-snap";
import { type DocumentSummary, summarizeBuilt } from "./document-from-evidence";

/**
 * How well the document's walls sit on the PDF's: for each level or plumb run of walls with a PDF face pair along it,
 * how far its middle is from the pair's middle and its thickness from theirs (medians, and the share within 5 mm).
 * Walls the PDF draws that the document lacks are not counted here: a PDF's long strokes include lettering, dimension
 * and leader lines, so its walls cannot be told apart by their lines alone.
 */
function pdfWallFit(document: FloorPlanDocumentV2, faces: PdfFace[]) {
  const runs = wallRuns(document.floors[0]);
  const offsets: number[] = [], thicknesses: number[] = [];
  for (const run of runs) {
    const pair = facePairFor(run, faces);
    if (!pair) continue;
    offsets.push(Math.abs(pair.middle - run.at));
    thicknesses.push(Math.abs(pair.thickness - run.thicknessMm));
  }
  const median = (values: number[]) => values.length ? Math.round([...values].sort((p, q) => p - q)[Math.floor(values.length / 2)]) : null;
  const within = (values: number[]) => values.length ? Math.round((100 * values.filter((v) => v <= 5).length) / values.length) : null;
  return { runs: runs.length, matched: offsets.length, medianOffsetMm: median(offsets), offsetWithin5mmPct: within(offsets),
    medianThicknessErrorMm: median(thicknesses), thicknessWithin5mmPct: within(thicknesses) };
}

type Job = { name: string; pdf: string; png: string; evidence: string; pageNumber: number };

function pngSize(bytes: Buffer) {
  return { widthPx: bytes.readUInt32BE(16), heightPx: bytes.readUInt32BE(20) };
}

async function one(job: Job, documents: string | null): Promise<DocumentSummary> {
  const pdf = new Uint8Array(readFileSync(job.pdf));
  const png = readFileSync(job.png);
  const evidence = parseFloorPlanVectorizerEvidence(JSON.parse(readFileSync(job.evidence, "utf8")));
  const { widthPx, heightPx } = pngSize(png);
  const provider: FloorPlanVectorizerProvider = { id: "score-harness-evidence", analyzePage: async () => evidence };
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: provider });
  const context = {
    jobId: `score-${job.name}`,
    store: { readDerivative: async () => ({ mimeType: "image/png", bytes: new Uint8Array(png) }) },
    privacy: { trainingBenchmarkOptIn: false, trainingBenchmarkOptInAt: null, trainingBenchmarkConsentVersion: null,
      trainingBenchmarkRevokedAt: null, sourceRetentionExpiresAt: new Date(Date.now() + 86_400_000), sourceDeletionRequestedAt: null },
  } as unknown as FloorPlanAdapterContext;
  const source = { id: "source-score", fileName: path.basename(job.pdf), mimeType: "application/pdf", sha256: "0".repeat(64),
    byteLength: pdf.length, bytes: pdf } as unknown as Parameters<PdfRasterFloorPlanSourceAdapter["extract"]>[0];
  const rendered = [{ pageNumber: job.pageNumber, widthPx, heightPx, assetKey: `page-${job.pageNumber}` }];
  const extracted = await adapter.extract(source, rendered, context);
  const solved = await adapter.solveScale(extracted);
  const scale = (solved.candidate as { scale?: { millimetresPerPixel: number; basis?: string; dimensionCount?: number } | null }).scale;
  if (!scale?.millimetresPerPixel) return { file: job.name, stage: "topology", error: "no scale solved (the user would set one)" };
  const built = await adapter.buildTopology(solved, context);
  const validated = await adapter.validate(built);
  if (documents) writeFileSync(path.join(documents, `${job.name}.document.json`), JSON.stringify(validated.candidate));
  const summary = summarizeBuilt(job.name, built, validated, { mmPerPx: scale.millimetresPerPixel, basis: scale.basis ?? "printed",
    assumed: false, solvedByApp: true, dimensionCount: scale.dimensionCount ?? 0 });
  const document = validated.candidate as unknown as FloorPlanDocumentV2;
  const pages = (solved.candidate as { pages: Parameters<typeof pdfPageDrawing>[0][] }).pages;
  const page = pages.find((p) => p.pageNumber === job.pageNumber);
  const drawing = page ? pdfPageDrawing(page, document.floors[0]?.calibrations.find((c) => c.pageNumber === job.pageNumber)) : null;
  const snap = String((built.metrics as Record<string, unknown>).pdfWallSnap ?? "off");
  return { ...summary, pdfWallSnap: snap, pdfWallFit: drawing && document.floors[0] ? pdfWallFit(document, drawing.faces) : null } as DocumentSummary;
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.shift();
  const documents = args.find((arg) => arg.startsWith("--documents="))?.slice("--documents=".length) ?? null;
  const jobs = args.filter((arg) => !arg.startsWith("--")).map((arg): Job => {
    const [name, rest] = arg.split("=");
    const [pdf, png, evidence, page] = (rest ?? "").split(",");
    return { name, pdf, png, evidence, pageNumber: Number(page ?? 1) };
  });
  if (!out || !jobs.length || jobs.some((job) => !job.pdf || !job.png || !job.evidence)) {
    console.error("usage: document-from-pdf.ts <out.json> [--documents=<dir>] <name>=<plan.pdf>,<page.png>,<evidence.json>[,<page>] ...");
    process.exit(2);
  }
  if (documents) mkdirSync(documents, { recursive: true });
  const results: DocumentSummary[] = [];
  for (const job of jobs) {
    try {
      results.push(await one(job, documents));
    } catch (error) {
      results.push({ file: job.name, stage: "topology", error: String(error instanceof Error ? error.stack ?? error.message : error).slice(0, 600) });
    }
  }
  writeFileSync(out, JSON.stringify(results));
  console.log(`documents: ${results.filter((r) => r.stage === "built").length} of ${results.length} PDF pages built -> ${out}`);
}

void main();
