import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  compileFloorPlanDocumentV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "@/lib/floor-plan-imports/deterministic-evidence";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import {
  PythonFloorPlanVectorizerProvider,
  floorPlanVectorizerRuntimeConfiguration,
  registerVectorizerEvidence,
} from "@/lib/floor-plan-imports/vectorizer-evidence";

/**
 * One plan image through the real vectorizer provider and the adapter's scale,
 * topology and validation stages, without the app, the database or the worker:
 *
 *   npm run floor-plan:vectorizer -- /path/to/plan.png
 *
 * Uses the same FLOOR_PLAN_VECTORIZER_* settings as the worker (the enabled
 * flag is not needed here). The adapter's own raster linework is replaced by
 * the vectorizer's wall edges, as in the evidence test.
 */
async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: npm run floor-plan:vectorizer -- /path/to/plan.png");
  const bytes = readFileSync(file);
  const config = floorPlanVectorizerRuntimeConfiguration();
  console.log(`python: ${config.pythonPath}\nprograms: ${config.directory}\ntimeout: ${config.timeoutMs} ms`);
  if (path.isAbsolute(config.pythonPath) && !existsSync(config.pythonPath)) {
    console.error(`There is no Python program at ${config.pythonPath} (FLOOR_PLAN_VECTORIZER_PYTHON). Give the full path of services/floorplan-vectorizer/.venv/bin/python3.`);
    process.exit(1);
  }
  for (const program of ["floorplan_vectorize.py", "app_evidence.py"]) {
    if (!existsSync(path.join(config.directory, program))) {
      console.error(`${program} is not in ${config.directory} (FLOOR_PLAN_VECTORIZER_DIR).`);
      process.exit(1);
    }
  }
  const started = Date.now();
  const evidence = await new PythonFloorPlanVectorizerProvider(config).analyzePage(
    {
      pageNumber: 1,
      widthPx: 0,
      heightPx: 0,
      mimeType: file.toLowerCase().endsWith(".webp") ? "image/webp" : "image/png",
      bytes,
    },
    { timeoutMs: config.timeoutMs }
  );
  console.log(
    `vectorizer: ${((Date.now() - started) / 1000).toFixed(1)} s, ${evidence.rooms.length} rooms, ` +
      `${evidence.semantics.dimensionLabels.length} dimensions, ${evidence.semantics.openingSymbols.length} openings, scale basis ${evidence.scale.basis}`
  );
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
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const solved = await adapter.solveScale({
    candidate: {
      kind: "floor_plan_deterministic_evidence_v1",
      source: { id: "source-cli", fileName: path.basename(file), mimeType: "image/png", sha256: "0".repeat(64) },
      pages: [page],
      scale: null,
      scales: [],
    } as unknown as Record<string, unknown>,
    sourceManifest: null,
    reviewIssues: [],
  });
  const scale = (solved.candidate as { scale: { millimetresPerPixel: number; dimensionCount: number } | null }).scale;
  console.log(
    scale
      ? `scale: accepted ${scale.millimetresPerPixel.toFixed(3)} mm/px from ${scale.dimensionCount} spans (vectorizer said ${evidence.scale.millimetresPerPixel})`
      : "scale: NOT accepted (no printed dimensions, or they disagree) - the app would ask the user to calibrate"
  );
  const built = await adapter.validate(
    await adapter.buildTopology(solved, { jobId: "vectorizer-cli" } as unknown as FloorPlanAdapterContext)
  );
  const document = built.candidate as unknown as FloorPlanDocumentV2;
  const floor = document.floors[0];
  for (const room of floor.rooms) console.log(`  room  ${room.name}  (${room.roomType})`);
  console.log(
    `document: ${floor.rooms.length} rooms, ${floor.walls.length} walls, ${floor.openings.length} openings ` +
      `(${floor.openings.filter((opening) => opening.kind === "door").length} doors, ${floor.openings.filter((opening) => opening.kind === "window").length} windows), ${floor.dimensions.length} dimensions`
  );
  const errors = validateFloorPlanDocumentV2(document).filter((issue) => issue.severity === "error");
  for (const issue of errors.slice(0, 20)) console.log(`  ERROR ${issue.code} ${issue.path} ${issue.message}`);
  console.log(`canonical validation: ${errors.length} errors`);
  if (!errors.length && floor.rooms.length) {
    compileFloorPlanDocumentV2(document);
    console.log("compiles: yes");
  }
  for (const issue of built.reviewIssues.filter((entry) => entry.severity === "critical")) {
    console.log(`  review (critical): ${issue.code}`);
  }
}

main().catch((cause) => {
  console.error(cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
