// The score harness, step 1 of 2 (rebuilt 30 Oct 2026; the first version lived only in a cloud folder).
// Exporter evidence files through the app's own import stages - parse, register, solve the scale, build the topology,
// validate - into the FloorPlanDocumentV2 a reviewer would see, written as a short summary per file for corrections.py:
// the scale the app solved (and whether it is assumed), every room with its name, type and outline, and every opening
// with the rooms on either side of its wall.
// Where the app solves no scale at all, the summary stands in for the user's one scale correction: the exporter's own
// figure, else 10 mm/px (corrections.py counts that correction).
// The raster linework the app traces itself is stood in for by the evidence's own wall edges, as in
// scripts/test-floor-plan-vectorizer-evidence.ts and tools/appcheck/walls-from-evidence.ts.
// Run from the root of a checkout of the app (it supplies lib/ and node_modules):
//   cd <checkout> && npx ts-node --transpile-only --compiler-options '{"module":"CommonJS","moduleResolution":"node"}' \
//       -r tsconfig-paths/register services/floorplan-vectorizer/tools/score/document-from-evidence.ts <out.json> <evidence.json>...
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { isAssumedScale } from "@/lib/floor-plan-imports/assumed-scale";
import { isFloorPlanVoidRoom } from "@/lib/floor-plan-void-rooms";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import { parseFloorPlanVectorizerEvidence, registerVectorizerEvidence } from "@/lib/floor-plan-imports/vectorizer-evidence";

type Pt = [number, number];
type DocumentSummary = {
  file: string;
  stage: "schema" | "topology" | "built";
  error?: string;
  scale?: { mmPerPx: number; basis: string; assumed: boolean; solvedByApp: boolean; dimensionCount: number };
  rooms?: { id: string; name: string; roomType: string; void: boolean; outlinePx: Pt[] }[];
  openings?: { id: string; kind: string; operation: string; widthMm: number; roomIds: string[]; midPx: Pt }[];
  labels?: { text: string; atPx: Pt }[];
  walls?: number;
  issues?: string[];
};

const context = { jobId: "score-harness" } as unknown as FloorPlanAdapterContext;

function registeredPage(evidence: ReturnType<typeof parseFloorPlanVectorizerEvidence>, bytes: Buffer): RegisteredPageEvidence {
  const page: RegisteredPageEvidence = {
    pageNumber: 1,
    widthPx: evidence.page.widthPx,
    heightPx: evidence.page.heightPx,
    vectorSegments: evidence.wallEdges.map((edge, index) => ({
      id: `raster-${index + 1}`,
      pageNumber: 1,
      start: { x: edge.sourcePx[0][0], y: edge.sourcePx[0][1] },
      end: { x: edge.sourcePx[1][0], y: edge.sourcePx[1][1] },
      strokeWidthPx: 1,
      evidenceKind: "raster_linework" as const,
    })),
    vectorPaths: [],
    text: [],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  page.semantics = registerVectorizerEvidence(page, evidence, bytes);
  return page;
}

async function one(file: string): Promise<DocumentSummary> {
  const name = path.basename(file);
  const bytes = readFileSync(file);
  let evidence;
  try {
    evidence = parseFloorPlanVectorizerEvidence(JSON.parse(bytes.toString("utf8")));
  } catch (error) {
    return { file: name, stage: "schema", error: String(error instanceof Error ? error.message : error).slice(0, 300) };
  }
  const page = registeredPage(evidence, bytes);
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const solved = await adapter.solveScale({
    candidate: {
      kind: "floor_plan_deterministic_evidence_v1",
      source: { id: "source-score", fileName: "page.png", mimeType: "image/png", sha256: "0".repeat(64) },
      pages: [page],
      scale: null,
      scales: [],
    } as unknown as Record<string, unknown>,
    sourceManifest: null,
    reviewIssues: [],
  });
  const candidate = solved.candidate as { scale: { millimetresPerPixel: number; basis?: string; dimensionCount?: number } | null; scales?: unknown[] };
  let scale = candidate.scale;
  const solvedByApp = Boolean(scale?.millimetresPerPixel);
  if (!solvedByApp) {
    // The user's one scale correction, stood in for: the exporter's figure, else 10 mm/px.
    const raw = evidence.scale as { millimetresPerPixel?: number | null; estimate?: { millimetresPerPixel?: number } | null } | null;
    const mm = raw?.millimetresPerPixel ?? raw?.estimate?.millimetresPerPixel ?? 10;
    scale = { millimetresPerPixel: mm, basis: "stand_in_user_correction", dimensionCount: 0 };
    const stand = { pageNumber: 1, millimetresPerPixel: mm, dimensionCount: 0, rmsResidualMm: 0, confidence: 1, evidence: [], basis: "printed" };
    candidate.scale = stand;
    candidate.scales = [stand];
  }
  const mmPerPx = scale!.millimetresPerPixel;
  const built = await adapter.buildTopology(solved, context);
  const validated = await adapter.validate(built);
  const document = validated.candidate as unknown as FloorPlanDocumentV2;
  const floor = document.floors?.[0];
  if (!floor) return { file: name, stage: "topology", error: "no floor" };
  const vertex = new Map(floor.vertices.map((v) => [v.id, v]));
  const wall = new Map(floor.walls.map((w) => [w.id, w]));
  const px = (vertexId: string): Pt => {
    const v = vertex.get(vertexId)!;
    return [v.xMm / mmPerPx, v.zMm / mmPerPx];
  };
  const rooms = floor.rooms.map((room) => {
    const outer = room.wallLoops.find((loop) => loop.kind === "outer") ?? room.wallLoops[0];
    const outlinePx: Pt[] = (outer?.walls ?? []).map((ref) => {
      const w = wall.get(ref.wallId)!;
      return px(ref.direction === "forward" ? w.path.startVertexId : w.path.endVertexId);
    });
    return { id: room.id, name: room.name, roomType: room.roomType, void: isFloorPlanVoidRoom(room), outlinePx };
  });
  const openings = floor.openings.map((opening) => {
    const w = wall.get(opening.wallId);
    const a = w ? px(w.path.startVertexId) : ([0, 0] as Pt);
    const b = w ? px(w.path.endVertexId) : ([0, 0] as Pt);
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const t = (opening.offsetMm / mmPerPx + opening.widthMm / mmPerPx / 2) / len;
    return {
      id: opening.id,
      kind: opening.kind,
      operation: opening.operation,
      widthMm: opening.widthMm,
      roomIds: w ? [...w.adjacentRoomIds] : [],
      midPx: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as Pt,
    };
  });
  const labels = floor.annotations.flatMap((annotation) => {
    if (annotation.kind !== "label" || annotation.geometry.kind !== "point") return [];
    return [{ text: annotation.text, atPx: px(annotation.geometry.vertexId) }];
  });
  const issues = ((validated as { reviewIssues?: { code?: string; severity?: string }[] }).reviewIssues ?? [])
    .map((issue) => `${issue.severity ?? ""}:${issue.code ?? ""}`);
  return {
    file: name,
    stage: "built",
    scale: {
      mmPerPx,
      basis: scale!.basis ?? "printed",
      assumed: solvedByApp ? isAssumedScale(scale as never) : false,
      solvedByApp,
      dimensionCount: scale!.dimensionCount ?? 0,
    },
    rooms,
    openings,
    labels,
    walls: floor.walls.length,
    issues,
  };
}

async function main() {
  const [out, ...files] = process.argv.slice(2);
  if (!out || !files.length) {
    console.error("usage: document-from-evidence.ts <out.json> <evidence.json>...");
    process.exit(2);
  }
  const results: DocumentSummary[] = [];
  for (const file of files) {
    try {
      results.push(await one(file));
    } catch (error) {
      results.push({ file: path.basename(file), stage: "topology", error: String(error instanceof Error ? error.stack ?? error.message : error).slice(0, 600) });
    }
  }
  writeFileSync(out, JSON.stringify(results));
  const built = results.filter((r) => r.stage === "built").length;
  console.log(`documents: ${built} of ${results.length} evidence files built -> ${out}`);
}

void main();
