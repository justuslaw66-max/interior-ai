import { solveCrossCheckedScale } from "@/lib/floor-plan-imports/source-scale-cross-check";
import assert from "node:assert/strict";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { registerEmptyPlanScaleCalibration } from "@/lib/floor-plan-import-review-geometry";
import { applyFloorPlanTopologyMutationV2 } from "@/lib/floor-plan-topology-mutations";
import { PDFDocument, degrees } from "pdf-lib";
import { mergeMixedPdfEvidence } from "@/lib/floor-plan-imports/mixed-pdf-evidence";
import {
  registerRoomRectangles,
  type RegisteredPageEvidence,
} from "@/lib/floor-plan-imports/deterministic-evidence";
import {
  PdfRasterFloorPlanSourceAdapter,
  rankFloorPlanSemanticPages,
} from "@/lib/floor-plan-imports/pdf-raster-adapter";
import {
  extractRasterLinework,
  normalizeRasterForLinework,
} from "@/lib/floor-plan-imports/raster-linework";
import type {
  FloorPlanSourceStore,
  StoredFloorPlanSource,
} from "@/lib/floor-plan-imports/source-adapter";

type RasterFixture = {
  width: number;
  height: number;
  pixels: Uint8Array;
};

function testRelevantPageRanking() {
  const pages: RegisteredPageEvidence[] = Array.from({ length: 12 }, (_, index) => ({
    pageNumber: index + 1,
    widthPx: 1000,
    heightPx: 800,
    vectorSegments: [],
    vectorPaths: [],
    text: [],
    semantics: {
      roomLabels: [],
      dimensionLabels: [],
      openingSymbols: [],
      entrance: null,
      notes: [],
    },
  }));
  pages[8].vectorSegments = Array.from({ length: 20 }, (_, index) => ({
    id: `p9-segment-${index}`,
    pageNumber: 9,
    start: { x: 100, y: 100 + index },
    end: { x: 500, y: 100 + index },
    strokeWidthPx: 2,
  }));
  pages[8].vectorPaths = [
    {
      id: "p9-room-cycle",
      pageNumber: 9,
      closed: true,
      segmentIds: pages[8].vectorSegments.slice(0, 4).map((entry) => entry.id),
      bbox: { left: 100, top: 100, right: 500, bottom: 500 },
      rectilinearScore: 1,
    },
  ];
  assert.ok(
    rankFloorPlanSemanticPages(pages)
      .slice(0, 8)
      .some((page) => page.pageNumber === 9),
    "A likely plan on page 9 must outrank brochure pages instead of being skipped by the eight-page budget."
  );
}

function fixture(width = 640, height = 480): RasterFixture {
  const pixels = new Uint8Array(width * height);
  pixels.fill(255);
  return { width, height, pixels };
}

function setInk(image: RasterFixture, x: number, y: number, value = 0) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  image.pixels[y * image.width + x] = value;
}

function horizontal(
  image: RasterFixture,
  x1: number,
  x2: number,
  y: number,
  thickness = 5,
  value = 0
) {
  const radius = Math.floor(thickness / 2);
  for (let row = y - radius; row <= y + radius; row += 1) {
    for (let x = x1; x <= x2; x += 1) setInk(image, x, row, value);
  }
}

function vertical(
  image: RasterFixture,
  x: number,
  y1: number,
  y2: number,
  thickness = 5,
  value = 0
) {
  const radius = Math.floor(thickness / 2);
  for (let column = x - radius; column <= x + radius; column += 1) {
    for (let y = y1; y <= y2; y += 1) setInk(image, column, y, value);
  }
}

function diagonal(
  image: RasterFixture,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  thickness = 3
) {
  const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / Math.max(1, steps);
    const x = Math.round(x1 + (x2 - x1) * ratio);
    const y = Math.round(y1 + (y2 - y1) * ratio);
    for (let dx = -thickness; dx <= thickness; dx += 1) {
      for (let dy = -thickness; dy <= thickness; dy += 1) {
        if (dx * dx + dy * dy <= thickness * thickness) {
          setInk(image, x + dx, y + dy);
        }
      }
    }
  }
}

async function png(image: RasterFixture) {
  const { default: sharp } = await import("sharp");
  return new Uint8Array(
    await sharp(Buffer.from(image.pixels), {
      raw: { width: image.width, height: image.height, channels: 1 },
    })
      .png()
      .toBuffer()
  );
}

function asPage(
  result: Awaited<ReturnType<typeof extractRasterLinework>>,
  withRoomLabel: boolean
): RegisteredPageEvidence {
  return {
    pageNumber: result.pageNumber,
    widthPx: result.widthPx,
    heightPx: result.heightPx,
    vectorSegments: result.vectorSegments,
    vectorPaths: result.vectorPaths,
    text: [],
    semantics: {
      roomLabels: withRoomLabel
        ? [
            {
              label: "Living / Dining",
              roomType: "living",
              centerXRatio: 0.5,
              centerYRatio: 0.5,
              confidence: 0.96,
            },
          ]
        : [],
      dimensionLabels: [],
      openingSymbols: [],
      entrance: null,
      notes: [],
    },
  };
}

async function testCleanRasterAndDeterminism() {
  const image = fixture();
  horizontal(image, 120, 520, 90);
  horizontal(image, 120, 520, 390);
  vertical(image, 120, 90, 390);
  vertical(image, 520, 90, 390);
  const bytes = await png(image);
  const first = await extractRasterLinework(bytes, {
    pageNumber: 1,
    expectedWidthPx: image.width,
    expectedHeightPx: image.height,
  });
  const second = await extractRasterLinework(bytes, {
    pageNumber: 1,
    expectedWidthPx: image.width,
    expectedHeightPx: image.height,
  });

  assert.deepEqual(second, first, "Raster source coordinates must be deterministic.");
  assert.ok(first.vectorSegments.length >= 4);
  assert.equal(first.vectorPaths.length, 1);
  assert.deepEqual(first.vectorPaths[0].bbox, {
    left: 120,
    top: 90,
    right: 520,
    bottom: 390,
  });
  assert.equal(first.vectorPaths[0].evidenceKind, "raster_linework");
  assert.ok((first.vectorPaths[0].confidence ?? 0) >= 0.72);

  assert.deepEqual(
    registerRoomRectangles(asPage(first, true)).map((room) => room.label),
    ["Living / Dining"],
    "A semantic label may register to proven raster linework without supplying coordinates."
  );
  assert.equal(
    registerRoomRectangles(asPage(first, false)).length,
    0,
    "Linework alone must never invent a room."
  );
}

async function testSkewAndNoiseRejection() {
  const image = fixture();
  diagonal(image, 130, 80, 520, 120);
  diagonal(image, 520, 120, 485, 390);
  diagonal(image, 485, 390, 95, 350);
  diagonal(image, 95, 350, 130, 80);
  let state = 0x5f3759df;
  for (let index = 0; index < 1_200; index += 1) {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const x = state % image.width;
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const y = state % image.height;
    setInk(image, x, y, 80);
  }
  const result = await extractRasterLinework(await png(image), { pageNumber: 1 });
  assert.equal(
    result.vectorPaths.length,
    0,
    "Skewed/noisy contours must not be promoted to rectilinear closed cycles."
  );
}

async function testIncompleteLineworkDoesNotCloseRoom() {
  const image = fixture();
  horizontal(image, 90, 550, 100);
  horizontal(image, 90, 550, 350);
  vertical(image, 90, 100, 260);
  horizontal(image, 150, 490, 430, 1, 125);
  const result = await extractRasterLinework(await png(image), { pageNumber: 3 });
  assert.equal(result.vectorPaths.length, 0);
  assert.equal(registerRoomRectangles(asPage(result, true)).length, 0);
  assert.equal(result.diagnostics.weakReason, "no_conservative_closed_cycle");
}

async function testSmallSkewRecovery() {
  const image = fixture();
  horizontal(image, 120, 520, 90);
  horizontal(image, 120, 520, 390);
  vertical(image, 120, 90, 390);
  vertical(image, 520, 90, 390);
  const { default: sharp } = await import("sharp");
  const skewed = new Uint8Array(
    await sharp(await png(image))
      .rotate(2, { background: "#ffffff" })
      .png()
      .toBuffer()
  );
  const normalized = await normalizeRasterForLinework(skewed);
  assert.equal(
    normalized.normalization.applied,
    true,
    "A small, well-supported skew should be corrected in the rendered derivative."
  );
  assert.ok(
    Math.abs(normalized.normalization.detectedSkewDegrees - 2) <= 0.5
  );
  assert.ok(
    Math.abs(normalized.normalization.appliedRotationDegrees + 2) <= 0.5
  );
  const [a, b, c, d, e, f] = normalized.normalization.sourceToRendered;
  const sourceCenterX = (normalized.normalization.sourceWidthPx - 1) / 2;
  const sourceCenterY = (normalized.normalization.sourceHeightPx - 1) / 2;
  assert.ok(
    Math.abs(
      a * sourceCenterX + c * sourceCenterY + e -
        (normalized.widthPx - 1) / 2
    ) <= 1
  );
  assert.ok(
    Math.abs(
      b * sourceCenterX + d * sourceCenterY + f -
        (normalized.heightPx - 1) / 2
    ) <= 1
  );
  const result = await extractRasterLinework(normalized.bytes, {
    pageNumber: 1,
    expectedWidthPx: normalized.widthPx,
    expectedHeightPx: normalized.heightPx,
    normalization: normalized.normalization,
  });
  assert.ok(result.vectorPaths.length >= 1);
  assert.equal(result.diagnostics.normalization?.applied, true);
}

async function testAmbiguousPerspectiveIsNotDeskewed() {
  const image = fixture();
  diagonal(image, 120, 90, 520, 115, 2);
  diagonal(image, 520, 115, 560, 360, 2);
  diagonal(image, 560, 360, 80, 390, 2);
  diagonal(image, 80, 390, 120, 90, 2);
  const normalized = await normalizeRasterForLinework(await png(image));
  assert.equal(
    normalized.normalization.applied,
    false,
    "Conflicting perspective slopes must not be coerced into one deskew transform."
  );
}

async function testDenseGridCycleSearchIsBounded() {
  const image = fixture(5000, 1000);
  for (let coordinate = 80; coordinate <= 920; coordinate += 8) {
    horizontal(image, 80, 4920, coordinate, 1);
  }
  // These connectors are dense enough to make a naive O(n^4) search costly,
  // but their total span is below the conservative minimum room width so they
  // cannot produce a valid cycle.
  for (let coordinate = 200; coordinate <= 468; coordinate += 4) {
    vertical(image, coordinate, 80, 920, 1);
  }
  const result = await extractRasterLinework(await png(image), { pageNumber: 5 });
  assert.equal(result.diagnostics.cycleSearchCapped, true);
  assert.ok(result.diagnostics.cycleCandidateChecks <= 300_000);
  assert.equal(
    result.diagnostics.cycleSearchLimitReason,
    "candidate_check_limit"
  );
  assert.equal(
    result.vectorPaths.length,
    0,
    "A capped search must discard partial cycles and fall back to review/tracing."
  );
  assert.equal(result.diagnostics.weakReason, "cycle_search_limit_exceeded");
}

async function testRasterAdapterIntegration(mode: "raster" | "pdf" | "mixed" = "raster") {
  const image = fixture();
  horizontal(image, 120, 520, 90);
  horizontal(image, 120, 520, 390);
  vertical(image, 120, 90, 390);
  vertical(image, 520, 90, 390);
  if (mode !== "raster") {
    image.pixels.fill(255);
    horizontal(image, 100, 540, 240, 3); // Deliberately open linework: never a room.
  }
  let bytes: Uint8Array = await png(image);
  if (mode !== "raster") {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([640, 480]);
    page.drawImage(await pdf.embedPng(bytes), { x: 0, y: 0, width: 640, height: 480 });
    if (mode === "mixed") {
      page.drawRectangle({ x: 30, y: 30, width: 60, height: 30, borderWidth: 1 });
      page.drawText("Native reference", { x: 100, y: 400, size: 12 });
      page.drawText("Vertical reference", { x: 120, y: 300, size: 12, rotate: degrees(90) });
    }
    bytes = await pdf.save();
  }
  const source: StoredFloorPlanSource = {
    id: "raster-source-1",
    fileName: mode === "raster" ? "home.png" : "home.pdf",
    mimeType: mode === "raster" ? "image/png" : "application/pdf",
    byteLength: bytes.byteLength,
    sha256: "a".repeat(64),
    bytes,
  };
  const derivatives = new Map<
    string,
    { fileName: string; mimeType: string; bytes: Uint8Array }
  >();
  const store: FloorPlanSourceStore = {
    async putSource() {
      return source;
    },
    async readSource(id) {
      return id === source.id ? source : null;
    },
    async putDerivative(input) {
      const id = `derivative-${derivatives.size + 1}`;
      derivatives.set(id, {
        fileName: input.fileName,
        mimeType: input.mimeType,
        bytes: input.bytes,
      });
      return id;
    },
    async readDerivative(id) {
      const derivative = derivatives.get(id);
      return derivative
        ? {
            id,
            fileName: derivative.fileName,
            mimeType: derivative.mimeType,
            byteLength: derivative.bytes.byteLength,
            sha256: "b".repeat(64),
            bytes: derivative.bytes,
          }
        : null;
    },
  };
  const context = {
    jobId: "raster-job-1",
    store,
    privacy: {
      trainingBenchmarkOptIn: false,
      trainingBenchmarkOptInAt: null,
      trainingBenchmarkConsentVersion: null,
      trainingBenchmarkRevokedAt: null,
      sourceRetentionExpiresAt: new Date("2030-01-31T00:00:00.000Z"),
      sourceDeletionRequestedAt: null,
    },
  };
  const previousVisionFlag = process.env.FLOOR_PLAN_VISION_DISABLED;
  process.env.FLOOR_PLAN_VISION_DISABLED = "1";
  try {
    const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null });
    const rendered = await adapter.render(source, context);
    const extracted = await adapter.extract(source, rendered, context);
    const envelope = extracted.candidate as {
      renderedPages?: Array<{ pageNumber: number; assetKey: string }>;
      pages: RegisteredPageEvidence[];
    };
    assert.equal(
      envelope.renderedPages?.length,
      1,
      "The confirmed-page stage must retain its derivative reference for the original-detail second vision pass."
    );
    const page = envelope.pages[0];
    if (mode === "raster") assert.equal(page.vectorPaths.length, 1);
    else assert.equal(page.vectorPaths.filter((path) => path.evidenceKind === "raster_linework").length, 0);
    assert.ok(page.vectorSegments.some((segment) => segment.evidenceKind === "raster_linework"), "Open raster strokes must survive PDF extraction even without a room cycle");
    if (mode === "mixed") {
      assert.ok(page.vectorSegments.some((segment) => segment.evidenceKind === "pdf_vector"));
      assert.ok(page.text.some((entry) => entry.text === "Native reference"));
      const verticalText = page.text.find((entry) => entry.text === "Vertical reference")!;
      assert.ok(verticalText.widthPx < verticalText.heightPx, "Native rotated text keeps its source orientation");
      assert.ok(verticalText.center.x >= 228 && verticalText.center.x <= 240 && verticalText.center.y < 360,
        "Native text centre must follow the actual rotated baseline, not a horizontal bounding box");
      const original = JSON.stringify(page);
      const native = page.vectorSegments.find((segment) => segment.evidenceKind === "pdf_vector")!;
      const duplicate = { ...page, vectorSegments: [{ ...native, id: "raster-copy", evidenceKind: "raster_linework" as const }], vectorPaths: [] };
      const merged = mergeMixedPdfEvidence(page, duplicate);
      assert.equal(merged.vectorSegments.length, page.vectorSegments.length, "Raster copies of native vectors must be deduplicated");
      assert.equal(JSON.stringify(page), original, "Evidence merging does not mutate native paths or text");
    }
    const manifest = extracted.sourceManifest as {
      privacy: { trainingOptIn: boolean };
      pages: Array<{ lineworkEvidenceKind: string }>;
    };
    assert.equal(manifest.privacy.trainingOptIn, false);
    assert.equal(manifest.pages[0].lineworkEvidenceKind, mode === "mixed" ? "mixed" : "raster_linework");
    const built = await adapter.buildTopology(await adapter.solveScale(extracted, context), context);
    const candidate = built.candidate as unknown as FloorPlanDocumentV2;
    const scene = compileFloorPlanDocumentV2(candidate);
    assert.equal(scene.floors[0].walls.length, 0, "Uncalibrated strokes must not become walls");
    assert.ok(scene.floors[0].annotations.length > 0, "Unclassified source drawing must survive failed topology");
    const sourceGeometry = candidate.floors[0].annotations.map((annotation) => annotation.geometry);
    const calibrated = registerEmptyPlanScaleCalibration({ document: candidate, floorId: "floor-1", sourceId: source.id,
      pageNumber: 1, pageWidthPx: page.widthPx, pageHeightPx: page.heightPx,
      first: { x: 100, y: 100 }, second: { x: 400, y: 100 }, printedMm: 3000 });
    assert.deepEqual(calibrated.floors[0].annotations.map((annotation) => annotation.geometry), sourceGeometry,
      "Calibration must preserve exact source pixels; it cannot rescale the stored artwork");
    assert.equal(calibrated.verification.tier, "needs_review");
    if (mode === "mixed") {
      const text = candidate.floors[0].annotations.find((annotation) => annotation.text === "Native reference")!;
      const changed = applyFloorPlanTopologyMutationV2(calibrated,
        { kind: "update_annotation_text", floorId: "floor-1", annotationId: text.id, text: "Corrected reference" },
        { mutationId: "artwork-test", nextRevisionId: "artwork-corrected", actorId: "test-reviewer", mutatedAt: "2026-09-15T00:00:00Z" });
      assert.equal(changed.document.floors[0].annotations.find((annotation) => annotation.id === text.id)?.text, "Corrected reference");
      assert.equal(text.text, "Native reference");
      assert.deepEqual(changed.document.floors[0].walls, calibrated.floors[0].walls);
      assert.deepEqual(changed.document.floors[0].annotations.map((annotation) => annotation.geometry), sourceGeometry);
    }
  } finally {
    if (previousVisionFlag === undefined) {
      delete process.env.FLOOR_PLAN_VISION_DISABLED;
    } else {
      process.env.FLOOR_PLAN_VISION_DISABLED = previousVisionFlag;
    }
  }
}

async function testPageScaleIsolation() {
  const pageOne: RegisteredPageEvidence = {
    pageNumber: 1,
    widthPx: 1000,
    heightPx: 800,
    vectorSegments: [
      {
        id: "dimension-1",
        pageNumber: 1,
        start: { x: 100, y: 100 },
        end: { x: 500, y: 100 },
        strokeWidthPx: 1,
      },
      {
        id: "dimension-2",
        pageNumber: 1,
        start: { x: 100, y: 700 },
        end: { x: 400, y: 700 },
        strokeWidthPx: 1,
      },
    ],
    vectorPaths: [],
    text: [],
    semantics: {
      roomLabels: [],
      dimensionLabels: [
        {
          valueMm: 4000,
          centerXRatio: 0.3,
          centerYRatio: 0.125,
          orientation: "horizontal",
          confidence: 0.99,
        },
        {
          valueMm: 3000,
          centerXRatio: 0.25,
          centerYRatio: 0.875,
          orientation: "horizontal",
          confidence: 0.99,
        },
      ],
      openingSymbols: [],
      entrance: null,
      notes: [],
    },
  };
  const pageTwo: RegisteredPageEvidence = {
    pageNumber: 2,
    widthPx: 1000,
    heightPx: 800,
    vectorSegments: [
      [120, 200, 520, 200],
      [520, 200, 520, 520],
      [520, 520, 120, 520],
      [120, 520, 120, 200],
    ].map(([x1, y1, x2, y2], index) => ({
      id: `room-${index + 1}`,
      pageNumber: 2,
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      strokeWidthPx: 8,
      evidenceKind: "pdf_vector" as const,
    })),
    vectorPaths: [
      {
        id: "page-2-room",
        pageNumber: 2,
        closed: true,
        segmentIds: ["room-1", "room-2", "room-3", "room-4"],
        bbox: { left: 120, top: 200, right: 520, bottom: 520 },
        rectilinearScore: 1,
        evidenceKind: "pdf_vector",
      },
    ],
    text: [],
    semantics: {
      roomLabels: [
        {
          label: "Living / Dining",
          roomType: "living",
          centerXRatio: 0.3,
          centerYRatio: 0.45,
          confidence: 0.99,
        },
      ],
      dimensionLabels: [],
      openingSymbols: [],
      entrance: null,
      notes: [],
    },
  };
  const adapter = new PdfRasterFloorPlanSourceAdapter({ localOcrProvider: null });
  const context = {
    jobId: "page-scale-isolation",
    store: {} as FloorPlanSourceStore,
    privacy: {
      trainingBenchmarkOptIn: false,
      trainingBenchmarkOptInAt: null,
      trainingBenchmarkConsentVersion: null,
      trainingBenchmarkRevokedAt: null,
      sourceRetentionExpiresAt: new Date("2030-01-31T00:00:00.000Z"),
      sourceDeletionRequestedAt: null,
    },
  };
  const scaled = await adapter.solveScale({
      candidate: {
        kind: "floor_plan_deterministic_evidence_v1",
        source: {
          id: "source-1",
          fileName: "brochure.pdf",
          mimeType: "application/pdf",
          sha256: "a".repeat(64),
        },
        pages: [pageOne, pageTwo],
        scale: null,
        scales: [],
      },
      sourceManifest: null,
      reviewIssues: [],
      metrics: {},
    });
  const built = await adapter.buildTopology(scaled, context);
  const candidate = built.candidate as {
    floors: Array<{
      calibrations: unknown[];
      vertices: Array<{ xMm: number; zMm: number }>;
    }>;
  };
  assert.deepEqual(
    candidate.floors[0].calibrations,
    [],
    "A scale solved on one brochure page must not register a plan from another page."
  );
  assert.equal(
    candidate.floors[0].vertices.length,
    0,
    "An uncalibrated page retains source artwork without inventing model millimetres from another page's scale."
  );
  assert.ok(
    built.reviewIssues.some(
      (issue) =>
        issue.code === "scale_unresolved" &&
        issue.message.includes("page 1") &&
        issue.message.includes("page 2")
    ),
    "The review must explain the page-specific scale conflict."
  );
}

function testIndependentScaleConflict() {
  const page: RegisteredPageEvidence = { pageNumber: 1, widthPx: 1000, heightPx: 800,
    vectorPaths: [], text: [],
    vectorSegments: [
      { id: "dimension-a", pageNumber: 1, start: { x: 100, y: 100 }, end: { x: 500, y: 100 }, strokeWidthPx: 1 },
      { id: "dimension-b", pageNumber: 1, start: { x: 800, y: 100 }, end: { x: 800, y: 500 }, strokeWidthPx: 1 },
      { id: "dimension-c", pageNumber: 1, start: { x: 100, y: 600 }, end: { x: 500, y: 600 }, strokeWidthPx: 1 },
    ],
    semantics: { roomLabels: [], openingSymbols: [], notes: [], dimensionLabels: [
      { valueMm: 4000, centerXRatio: 0.3, centerYRatio: 90 / 800, orientation: "horizontal", confidence: 0.9 },
      { valueMm: 4000, centerXRatio: 0.81, centerYRatio: 300 / 800, orientation: "vertical", confidence: 0.9 },
      { valueMm: 4000, centerXRatio: 0.3, centerYRatio: 590 / 800, orientation: "horizontal", confidence: 0.9 },
    ] },
  };
  assert.equal(solveCrossCheckedScale(page)?.millimetresPerPixel, 10);
  page.semantics.dimensionLabels[2].valueMm = 4400;
  assert.equal(solveCrossCheckedScale(page), null, "A two-dimension cluster cannot silence a clear independent contradiction");
  assert.ok(page.semantics.notes.some((note) => note.includes("4400 mm differs by 40.0 source pixels")));
}

async function main() {
  testRelevantPageRanking();
  testIndependentScaleConflict();
  await testCleanRasterAndDeterminism();
  await testSkewAndNoiseRejection();
  await testIncompleteLineworkDoesNotCloseRoom();
  await testSmallSkewRecovery();
  await testAmbiguousPerspectiveIsNotDeskewed();
  await testDenseGridCycleSearchIsBounded();
  await testRasterAdapterIntegration();
  await testRasterAdapterIntegration("pdf");
  await testRasterAdapterIntegration("mixed");
  await testPageScaleIsolation();
  console.log("Floor-plan raster linework tests passed");
}

main().catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
