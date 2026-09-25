import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  compileFloorPlanDocumentV2,
  validateFloorPlanDocumentV2,
} from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import type {
  RegisteredPageEvidence,
  SemanticOpeningSymbol,
} from "@/lib/floor-plan-imports/deterministic-evidence";
import { PdfRasterFloorPlanSourceAdapter } from "@/lib/floor-plan-imports/pdf-raster-adapter";
import type { FloorPlanAdapterContext } from "@/lib/floor-plan-imports/source-adapter";
import {
  PythonFloorPlanVectorizerProvider,
  floorPlanVectorizerRuntimeConfiguration,
  mergeVectorizerDimensionSpans,
  parseFloorPlanVectorizerEvidence,
  registerVectorizerEvidence,
  swingAgainstWall,
} from "@/lib/floor-plan-imports/vectorizer-evidence";

/**
 * Vectorizer evidence → accepted scale → registered rooms → canonical
 * document, through the adapter's own stages and the canonical validator.
 * Fixtures are real exporter output for four drawing styles; no Python runs.
 */

const fixtureDirectory = path.join(__dirname, "fixtures", "floor-plan-vectorizer");
const context = { jobId: "vectorizer-evidence-test" } as unknown as FloorPlanAdapterContext;

// The provider is off unless explicitly enabled, and its timeout is bounded.
assert.equal(floorPlanVectorizerRuntimeConfiguration({}).enabled, false);
assert.equal(floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_ENABLED: "true" }).enabled, false);
assert.equal(floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_ENABLED: "1" }).enabled, true);
assert.equal(
  floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_TIMEOUT_MS: "5" }).timeoutMs,
  10_000
);

// Hinge end and handing follow the direction of the hosting wall.
const hinged = { hingeSourcePx: { x: 0, y: 0 }, swingTowardSourcePx: { x: 0, y: 5 } };
assert.deepEqual(swingAgainstWall({ x: 0, y: 0 }, { x: 10, y: 0 }, hinged), { hinge: "start", handing: "left" });
assert.deepEqual(swingAgainstWall({ x: 10, y: 0 }, { x: 0, y: 0 }, hinged), { hinge: "end", handing: "right" });
assert.deepEqual(swingAgainstWall({ x: 0, y: 0 }, { x: 10, y: 0 }, {}), { hinge: "unknown", handing: "unknown" });
assert.deepEqual(swingAgainstWall({ x: 0, y: 0 }, { x: 10, y: 0 }, { double: true }), { hinge: "none", handing: "double" });

// Evidence that is not the exporter's shape is refused at the process boundary.
assert.throws(() => parseFloorPlanVectorizerEvidence({ kind: "something_else" }));

async function importFixture(name: string, guessedOpenings: SemanticOpeningSymbol[] = [], linework: "walls" | "walls+bar" = "walls") {
  const bytes = readFileSync(path.join(fixtureDirectory, `${name}.evidence.json`));
  const evidence = parseFloorPlanVectorizerEvidence(JSON.parse(bytes.toString("utf8")));
  const page: RegisteredPageEvidence = {
    pageNumber: 1,
    widthPx: evidence.page.widthPx,
    heightPx: evidence.page.heightPx,
    // Stand-in for the adapter's own raster linework (the scale solver refuses a page without any): the wall sides,
    // plus the drawn scale bar where the fixture has one (the raster pass traces that line like any other).
    vectorSegments: [
      ...evidence.wallEdges.map((edge) => edge.sourcePx),
      ...(linework === "walls+bar"
        ? evidence.semantics.dimensionLabels.flatMap((label) => /m$/.test(label.rawText ?? "") && label.spanSourcePx ? [label.spanSourcePx] : [])
        : []),
    ].map((span, index) => ({
      id: `raster-${index + 1}`,
      pageNumber: 1,
      start: { x: span[0][0], y: span[0][1] },
      end: { x: span[1][0], y: span[1][1] },
      strokeWidthPx: 1,
      evidenceKind: "raster_linework" as const,
    })),
    vectorPaths: [],
    text: [],
    semantics: { roomLabels: [], dimensionLabels: [], openingSymbols: [], notes: [] },
  };
  page.semantics = registerVectorizerEvidence(page, evidence, bytes);
  page.semantics.openingSymbols.push(...guessedOpenings);
  assert.equal(page.semantics.roomLabels.every((label) => label.confidence <= 0.85), true);
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null, vectorizerProvider: null });
  const extracted = {
    candidate: {
      kind: "floor_plan_deterministic_evidence_v1",
      source: { id: `source-${name}`, fileName: `${name}.png`, mimeType: "image/png", sha256: "0".repeat(64) },
      pages: [page],
      scale: null,
      scales: [],
    } as unknown as Record<string, unknown>,
    sourceManifest: null,
    reviewIssues: [],
  };
  const solved = await adapter.solveScale(extracted);
  const built = await adapter.buildTopology(solved, context);
  const validated = await adapter.validate(built);
  return {
    evidence,
    page,
    metrics: solved.metrics,
    scale: (solved.candidate as { scale: { millimetresPerPixel: number; dimensionCount: number } | null }).scale,
    document: validated.candidate as unknown as FloorPlanDocumentV2,
    issues: validated.reviewIssues,
  };
}

async function main() {
  const summary: string[] = [];
  for (const name of ["room4", "h1", "d12"]) {
    const { evidence, page, scale, document, issues } = await importFixture(name);
    assert.ok(scale, `${name}: the adapter's cross-checked solver accepts a scale from the vectorizer spans`);
    assert.ok(
      Math.abs(scale.millimetresPerPixel / (evidence.scale.millimetresPerPixel ?? 1) - 1) <= 0.01,
      `${name}: accepted scale ${scale.millimetresPerPixel} agrees with the vectorizer's ${evidence.scale.millimetresPerPixel}`
    );
    assert.ok(scale.dimensionCount >= 2);
    assert.equal(
      page.dimensionSpanEvidence?.observations.every((entry) => entry.status === "source_supported"),
      true
    );
    // Numbers the vectorizer read but could not pair with two stops arrive as unpaired labels with a search hint at
    // the printed length; without the raster tick finder (not run here) they neither support nor veto the scale.
    const unpaired = page.semantics.dimensionLabels.filter((label) => label.unpaired);
    assert.equal(unpaired.length, evidence.semantics.dimensionLabels.filter((label) => !label.spanSourcePx).length);
    assert.ok(unpaired.every((label) => label.extensionStart && label.extensionEnd && label.confidence < 0.85));
    assert.ok(scale.dimensionCount <= evidence.semantics.dimensionLabels.length - unpaired.length, `${name}: the paired spans alone carry the scale`);
    const floor = document.floors[0];
    assert.equal(floor.rooms.length, evidence.rooms.length, `${name}: every vectorizer room becomes a canonical room`);
    const validation = validateFloorPlanDocumentV2(document);
    const errors = validation.filter((issue) => issue.severity === "error");
    if (process.env.FLOOR_PLAN_VECTORIZER_TEST_REPORT === "1") {
      const byCode = new Map<string, number>();
      for (const issue of errors) byCode.set(issue.code, (byCode.get(issue.code) ?? 0) + 1);
      console.log(name, "rooms", floor.rooms.length, "walls", floor.walls.length, JSON.stringify([...byCode]));
      for (const issue of errors.slice(0, 60)) console.log("   ", issue.code, issue.path, issue.message);
      continue;
    }
    assert.deepEqual(errors, [], `${name}: canonical validation reports no errors`);
    const scene = compileFloorPlanDocumentV2(document);
    assert.equal(scene.floors[0].rooms.length, floor.rooms.length);
    // Measured, not assumed: walls carry more than one thickness, swings carry a hinge end and a hand.
    assert.ok(new Set(floor.walls.map((wall) => wall.thicknessMm)).size >= 2, `${name}: measured wall thickness`);
    const swings = floor.openings.filter((opening) => opening.kind === "door" && opening.operation === "swing");
    assert.ok(swings.length >= 2, `${name}: swing doors`);
    assert.equal(
      swings.every((opening) =>
        opening.handing === "double"
          ? opening.hinge === "none"
          : (opening.hinge === "start" || opening.hinge === "end") &&
            (opening.handing === "left" || opening.handing === "right")
      ),
      true,
      `${name}: every single swing carries its hinge end and hand`
    );
    assert.ok(floor.openings.some((opening) => opening.kind === "window"));
    assert.ok(floor.walls.some((wall) => wall.adjacentRoomIds.length === 2), `${name}: rooms share walls`);
    assert.ok(issues.some((issue) => issue.code === "rooms_confirmation"));
    assert.equal(document.verification.tier, "needs_review");
    summary.push(
      `${name}: ${floor.rooms.length} rooms, ${floor.walls.length} walls (${floor.walls.filter((wall) => wall.adjacentRoomIds.length === 2).length} shared), ` +
        `${floor.openings.length} openings, ${floor.dimensions.length} dimensions, scale ${scale.millimetresPerPixel.toFixed(3)} mm/px from ${scale.dimensionCount} spans, ` +
        `${validation.length} validation notes`
    );
  }

  // A page with no written dimensions but a graphic scale bar: the bar's labelled stops arrive as printed dimensions,
  // so the scale is accepted exactly like a dimensioned plan and the rooms are promoted.
  const bar = await importFixture("c23", [], "walls+bar");
  assert.equal(bar.evidence.scale.basis, "explicit_dimension");
  assert.equal(bar.evidence.semantics.dimensionLabels.length, 4, "0-1, 1-3, 3-6 and 0-6 m from the bar");
  assert.ok(bar.scale, "c23: the scale bar's spans are accepted as a scale");
  assert.ok(Math.abs(bar.scale.millimetresPerPixel / (bar.evidence.scale.millimetresPerPixel ?? 1) - 1) <= 0.01);
  assert.ok(bar.document.floors[0].rooms.length >= 8, `c23: rooms promoted (${bar.document.floors[0].rooms.length})`);
  assert.deepEqual(validateFloorPlanDocumentV2(bar.document).filter((issue) => issue.severity === "error"), []);
  summary.push(`c23: scale ${bar.scale.millimetresPerPixel.toFixed(2)} mm/px accepted from the graphic scale bar, ${bar.document.floors[0].rooms.length} rooms promoted`);

  // A vision guess ("window" behind the sofa, no jamb or frame pixels) on a wall the vectorizer measured as solid
  // stays an editable suggestion; it never cuts the wall.
  const measured = await importFixture("d12");
  const guessed = await importFixture("d12", [
    {
      kind: "window",
      operation: "fixed",
      centerXRatio: 2475 / 2774,
      centerYRatio: 650 / 1786,
      spanStart: { xRatio: 2475 / 2774, yRatio: 520 / 1786 },
      spanEnd: { xRatio: 2475 / 2774, yRatio: 780 / 1786 },
      confidence: 0.6,
      evidenceKind: "vision",
    },
  ]);
  assert.equal(guessed.document.floors[0].openings.length, measured.document.floors[0].openings.length);
  assert.ok(
    guessed.document.floors[0].annotations.some(
      (annotation) =>
        annotation.configurationId === "source-opening-suggestion" && annotation.geometry.kind === "wall_span"
    ),
    "the guess is kept as a suggestion on its wall"
  );
  summary.push("d12: a vision-only window guess on a measured wall becomes a suggestion, not an opening");

  // A plan without printed dimensions: the estimated scale is never a confirmed scale, but it carries the geometry so
  // the reviewer sees the rooms at once - marked assumed, with the scale issue still blocking until a width is confirmed.
  const estimated = await importFixture("c22");
  assert.equal(estimated.evidence.scale.basis, "estimated_door_leaf");
  assert.equal(mergeVectorizerDimensionSpans(estimated.page), 0);
  assert.ok(estimated.scale, "c22: the estimate stands in for the scale");
  assert.equal((estimated.scale as { basis?: string }).basis, "assumed_opening_width");
  assert.equal(estimated.scale.dimensionCount, 0);
  assert.ok(estimated.document.floors[0].rooms.length >= 8, `c22: rooms placed at the estimated scale (${estimated.document.floors[0].rooms.length})`);
  const calibration = estimated.document.floors[0].calibrations[0];
  assert.equal(calibration?.primaryMeasurement?.basis, "assumed_opening_width", "the calibration says its width was assumed");
  assert.equal(calibration?.primaryMeasurement?.confirmedLengthMm, 970, "the first door opening at the width its offer shows");
  assert.equal((estimated.metrics as { scaleSolved?: boolean } | undefined)?.scaleSolved, false, "an assumed scale does not count as solved");
  const unresolved = estimated.issues.find((issue) => issue.code === "scale_unresolved" && issue.severity === "critical");
  assert.ok(unresolved);
  // ...and the reviewer is told what the estimate rests on and gets the door openings to confirm it against.
  assert.match(unresolved.message, /estimates about 11\.3 mm per pixel from 4 door swings/);
  assert.match(unresolved.message, /placed at that estimated scale/);
  const marks = estimated.document.floors[0].annotations.filter(
    (annotation) => annotation.configurationId === "source-scale-estimate"
  );
  assert.equal(marks.length, 5, "one reference mark per door opening the estimate offers");
  assert.ok(marks.every((mark) => mark.scope === "reference" && mark.geometry.kind === "source_drawing"));
  assert.match(marks[0].text, /about 970 mm if the estimated scale holds/);
  summary.push(
    `c22: no printed dimension; ${estimated.document.floors[0].rooms.length} rooms placed at the vectorizer's estimated scale, marked assumed; scale_unresolved stays critical, 5 door openings are offered to confirm the width`
  );

  // The process boundary, with stand-in programs (the real ones need OpenCV and Tesseract): two programs run in a
  // private temporary folder, the evidence file is parsed, the folder is removed, a slow program is killed.
  if (spawnSync("python3", ["--version"]).status === 0) {
    const directory = mkdtempSync(path.join(tmpdir(), "vectorizer-standin-"));
    try {
      const fixture = path.join(fixtureDirectory, "room4.evidence.json");
      writeFileSync(
        path.join(directory, "floorplan_vectorize.py"),
        "import sys, os\nassert os.path.getsize(sys.argv[1]) > 0\nopen(sys.argv[2] + '.json', 'w').write('{}')\n"
      );
      writeFileSync(
        path.join(directory, "app_evidence.py"),
        `import sys, shutil\nshutil.copyfile(${JSON.stringify(fixture)}, sys.argv[2])\n`
      );
      const config = { ...floorPlanVectorizerRuntimeConfiguration({ FLOOR_PLAN_VECTORIZER_ENABLED: "1" }), directory };
      const before = readdirSync(tmpdir()).filter((entry) => entry.startsWith("floor-plan-vectorizer-")).length;
      const evidence = await new PythonFloorPlanVectorizerProvider(config).analyzePage(
        { pageNumber: 1, widthPx: 828, heightPx: 957, mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
        { timeoutMs: 30_000 }
      );
      assert.equal(evidence.rooms.length > 0, true);
      assert.equal(
        readdirSync(tmpdir()).filter((entry) => entry.startsWith("floor-plan-vectorizer-")).length,
        before,
        "the private page copy is removed"
      );
      writeFileSync(path.join(directory, "floorplan_vectorize.py"), "import time\ntime.sleep(30)\n");
      await assert.rejects(
        new PythonFloorPlanVectorizerProvider(config).analyzePage(
          { pageNumber: 1, widthPx: 1, heightPx: 1, mimeType: "image/png", bytes: new Uint8Array([1]) },
          { timeoutMs: 400 }
        ),
        /exceeded 400 ms/
      );
      summary.push("provider: stand-in programs run, evidence parsed, temporary folder removed, slow program killed");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }

  for (const line of summary) console.log(line);
  console.log("floor-plan vectorizer evidence: ok");
}

main().catch((cause) => {
  console.error(cause);
  process.exit(1);
});
