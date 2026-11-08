// The blind A/B's other side for workstream 2 (8 Nov 2026): the clean plan the review draws from the document
// (lib/floor-plan-review-plan-drawing.ts), as an SVG of the page, for ab_pairs.py beside the faithful trace.
// Exporter evidence goes through the app's own import stages (as document-from-evidence.ts); the page's faithful trace
// (faithful_drawing.py's JSON, or "-" for none) is added as the review stores it, with the evidence's stage-1 text
// boxes marking its lettering (as the worker now keeps them). A page with nothing to draw the plan from is drawn by
// the faithful trace, as the review does (the SVG then holds that trace).
// Run from the root of a checkout of the app; FLOOR_PLAN_TOPOLOGY_CLEANUP=1 for the clean-up as the worker runs it:
//   npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
//       -r tsconfig-paths/register services/floorplan-vectorizer/tools/score/ab/model_drawing.ts <evidence.json> <faithful.json|-> <out.svg>
import { readFileSync, writeFileSync } from "node:fs";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import { FAITHFUL_TRACE_VERSION, faithfulDrawingPaths } from "@/lib/floor-plan-imports/source-trace-faithful";
import { parseFloorPlanVectorizerEvidence, registerVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-evidence";
import { buildReviewPlanDrawing, reviewPlanDrawingSvg } from "@/lib/floor-plan-review-plan-drawing";
import { sourceDrawingSvgPath } from "@/lib/floor-plan-source-drawing";
import { sourceTraceAnnotations } from "@/lib/floor-plan-source-trace";

type Box = [number, number, number, number];
type FaithfulItem = { kind: string; fill: boolean; strokeWidthPx: number; tone?: number; commands: Array<"M" | "L" | "C" | "Z">; points: number[][] };

async function documentOf(evidenceFile: string) {
  const bytes = readFileSync(evidenceFile);
  const evidence = parseFloorPlanVectorizerEvidence(JSON.parse(bytes.toString("utf8")));
  const page = { pageNumber: 1, widthPx: evidence.page.widthPx, heightPx: evidence.page.heightPx,
    vectorSegments: evidence.wallEdges.map((edge, index) => ({ id: `raster-${index + 1}`, pageNumber: 1,
      start: { x: edge.sourcePx[0][0], y: edge.sourcePx[0][1] }, end: { x: edge.sourcePx[1][0], y: edge.sourcePx[1][1] },
      strokeWidthPx: 1, evidenceKind: "raster_linework" as const })),
    vectorPaths: [], text: [], semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] } } as unknown as RegisteredPageEvidence;
  page.semantics = registerVectorizerEvidence(page, evidence, bytes);
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const solved = await adapter.solveScale({ candidate: { kind: "floor_plan_deterministic_evidence_v1",
    source: { id: "source-ab", fileName: "page.png", mimeType: "image/png", sha256: "0".repeat(64) },
    pages: [page], scale: null, scales: [] } as unknown as Record<string, unknown>, sourceManifest: null, reviewIssues: [] });
  const candidate = solved.candidate as { scale: { millimetresPerPixel: number } | null; scales?: unknown[] };
  if (!candidate.scale?.millimetresPerPixel) {
    // The user's one scale correction, stood in for (as document-from-evidence.ts): the exporter's figure, else 10 mm/px.
    const raw = evidence.scale as { millimetresPerPixel?: number | null; estimate?: { millimetresPerPixel?: number } | null } | null;
    const mm = raw?.millimetresPerPixel ?? raw?.estimate?.millimetresPerPixel ?? 10;
    const stand = { pageNumber: 1, millimetresPerPixel: mm, dimensionCount: 0, rmsResidualMm: 0, confidence: 1, evidence: [], basis: "printed" };
    Object.assign(candidate, { scale: stand, scales: [stand] });
  }
  const built = await adapter.buildTopology(solved, { jobId: "ab-harness" } as unknown as FloorPlanAdapterContext);
  const document = (await adapter.validate(built)).candidate as unknown as FloorPlanDocumentV2;
  return { document, widthPx: page.widthPx, heightPx: page.heightPx, textBoxes: (evidence.drawing?.textBoxes ?? []) as Box[] };
}

async function main() {
  const [evidenceFile, faithfulFile, out] = process.argv.slice(2);
  if (!evidenceFile || !faithfulFile || !out) throw new Error("usage: model_drawing.ts <evidence.json> <faithful.json|-> <out.svg>");
  const { document, widthPx, heightPx, textBoxes } = await documentOf(evidenceFile);
  const floor = document.floors[0], sourceId = floor?.calibrations[0]?.sourceId ?? document.sources[0]?.id ?? "source-ab";
  const raw = faithfulFile === "-" ? null : JSON.parse(readFileSync(faithfulFile, "utf8")) as { version?: string; items?: FaithfulItem[] };
  const paths = raw?.items ? faithfulDrawingPaths({ version: raw.version ?? "faithful-trace", items: raw.items.map((item) => ({ ...item,
    points: item.points.map(([x, y]) => ({ x, y })) })), textBoxes: textBoxes.map(([left, top, right, bottom]) => ({ left, top, right, bottom })) }) : [];
  const trace = sourceTraceAnnotations({ version: FAITHFUL_TRACE_VERSION, widthPx, heightPx, paths } as Parameters<typeof sourceTraceAnnotations>[0], sourceId, 1);
  floor?.annotations.push(...trace);
  const plan = floor ? buildReviewPlanDrawing({ document, floorId: floor.id, sourceId, pageNumber: 1, widthPx, heightPx }) : null;
  if (plan) {
    writeFileSync(out, reviewPlanDrawingSvg(plan));
    console.log(JSON.stringify({ drawn: "model", ...plan.diagnostics }));
    return;
  }
  // Nothing to draw the plan from: the review shows the faithful trace.
  const shapes = trace.flatMap((annotation) => {
    const g = annotation.geometry;
    if (g.kind !== "source_drawing") return [];
    const ink = `rgb(${g.tone ?? 0},${g.tone ?? 0},${g.tone ?? 0})`;
    return [g.fill ? `<path d="${sourceDrawingSvgPath(g)}" fill="${ink}" stroke="none"/>`
      : `<path d="${sourceDrawingSvgPath(g)}" fill="none" stroke="${ink}" stroke-width="${g.strokeWidthPx ?? 1}" stroke-linecap="butt"/>`];
  });
  const svg = [`<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}">`,
    `<rect width="${widthPx}" height="${heightPx}" fill="#fff"/>`, ...shapes, "</svg>"].join("\n");
  writeFileSync(out, svg);
  console.log(JSON.stringify({ drawn: "trace", paths: shapes.length }));
}

void main().catch((error) => { console.error(error); process.exit(1); });
