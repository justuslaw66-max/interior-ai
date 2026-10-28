import assert from "node:assert/strict";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import {
  canTransitionFloorPlanImport,
  FLOOR_PLAN_IMPORT_PROGRESS,
} from "@/lib/floor-plan-imports/status";
import {
  FloorPlanSourceAdapterRegistry,
  type FloorPlanSourceAdapter,
  type FloorPlanSourceStore,
  type StoredFloorPlanSource,
} from "@/lib/floor-plan-imports/source-adapter";
import {
  resumeFloorPlanImportValidation,
  runFloorPlanImportPipeline,
  type FloorPlanImportJobPatch,
  type FloorPlanImportJobRepository,
} from "@/lib/floor-plan-imports/pipeline";
import type {
  FloorPlanImportJobRecord,
  FloorPlanImportStatus,
  FloorPlanReviewIssue,
  FloorPlanSourceDescriptor,
} from "@/lib/floor-plan-imports/types";
import {
  compileCandidateFloorPlanDocumentV2,
  hasUnresolvedCriticalIssues,
  hasExpectedFloorPlanSignature,
  MAX_FLOOR_PLAN_CANDIDATE_BYTES,
  parseAddressBindings,
  parseCandidate,
  parseReviewIssues,
  sourceManifestSchema,
} from "@/lib/floor-plan-imports/validation";
import {
  packFloorPlanCandidate,
  packFloorPlanCandidateForStorage,
  sourceDrawingBudget,
  STORE_SOURCE_DRAWING_PACKED,
  unpackFloorPlanCandidate,
} from "@/lib/floor-plan-imports/candidate-storage";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";

function makeJob(id: string): FloorPlanImportJobRecord {
  return {
    id,
    userId: "user-1",
    sourceAssetId: "source-1",
    status: "received",
    statusChangedAt: null,
    adapterId: null,
    extractionVersion: null,
    renderedPages: [],
    candidate: null,
    sourceManifest: null,
    reviewIssues: [],
    progress: FLOOR_PLAN_IMPORT_PROGRESS.received,
    errorMessage: null,
    privacy: {
      trainingBenchmarkOptIn: false,
      trainingBenchmarkOptInAt: null,
      trainingBenchmarkConsentVersion: null,
      trainingBenchmarkRevokedAt: null,
      sourceRetentionExpiresAt: new Date("2030-01-31T00:00:00.000Z"),
      sourceDeletionRequestedAt: null,
    },
    attemptCount: 0,
    retryCount: 0,
    maxAttempts: 5,
    nextAttemptAt: null,
    lastAttemptAt: null,
    lastErrorAt: null,
    lastRecoveredAt: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
  };
}

class MemoryRepository implements FloorPlanImportJobRepository {
  public job: FloorPlanImportJobRecord;
  readonly transitions: string[] = [];

  constructor(job: FloorPlanImportJobRecord) {
    this.job = job;
  }

  async getById(id: string) {
    return id === this.job.id ? this.job : null;
  }

  async transition(
    id: string,
    from: FloorPlanImportStatus,
    to: FloorPlanImportStatus,
    patch: FloorPlanImportJobPatch = {}
  ) {
    assert.equal(id, this.job.id);
    assert.equal(this.job.status, from);
    this.transitions.push(`${from}->${to}`);
    this.job = { ...this.job, ...patch, status: to };
    return this.job;
  }
}

const source: StoredFloorPlanSource = {
  id: "source-1",
  fileName: "home.pdf",
  mimeType: "application/pdf",
  byteLength: 8,
  sha256: "a".repeat(64),
  bytes: new TextEncoder().encode("%PDF-1.7"),
};

const store: FloorPlanSourceStore = {
  async putSource(): Promise<FloorPlanSourceDescriptor> {
    return source;
  },
  async readSource(id) {
    return id === source.id ? source : null;
  },
  async putDerivative() {
    return "derivative-1";
  },
};

function adapterWithIssue(
  issue: FloorPlanReviewIssue | null,
  candidate = makeMinimalDocument(),
  sourceManifest: Record<string, unknown> = { pages: [1] }
): FloorPlanSourceAdapter {
  const result = (issues: FloorPlanReviewIssue[] = []) => ({
    candidate,
    sourceManifest,
    reviewIssues: issues,
  });
  return {
    id: "test-adapter",
    extractionVersion: "1.0.0",
    supports(input) {
      return input.mimeType === "application/pdf";
    },
    async render() {
      return [{ pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "page-1" }];
    },
    async extract() {
      return result(issue ? [issue] : []);
    },
    async solveScale(previous) {
      return previous;
    },
    async buildTopology(previous) {
      return previous;
    },
    async validate(previous) {
      return previous;
    },
  };
}

function makeMinimalDocument(): Record<string, unknown> {
  const provenance = {
    confidence: 0.5,
    extractionVersion: "test-adapter-1",
    evidence: [
      {
        sourceId: "source-1",
        basis: "inferred",
        confidence: 0.5,
        extractorVersion: "test-adapter-1",
        pageNumber: 1,
      },
    ],
    reviewHistory: [],
  };
  const measured = (valueMm: number) => ({
    valueMm,
    evidence: "assumed",
    provenance,
  });
  return {
    schemaVersion: 2,
    units: "mm",
    id: "test-document",
    revisionId: "test-revision",
    createdAt: "2026-07-16T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [
      {
        id: "source-1",
        kind: "pdf",
        name: "Test source",
        mimeType: "application/pdf",
        sha256: "a".repeat(64),
        pageCount: 1,
      },
    ],
    floors: [
      {
        id: "floor-1",
        name: "Level 1",
        levelIndex: 0,
        elevationMm: 0,
        storeyHeightMm: 2800,
        slabThicknessMm: 150,
        defaults: {
          wallHeight: measured(2600),
          doorHeight: measured(2100),
          windowHeight: measured(1200),
          windowSillHeight: measured(900),
        },
        calibrations: [{
          id: "calibration-1",
          sourceId: "source-1",
          pageNumber: 1,
          imageWidthPx: 1000,
          imageHeightPx: 800,
          controlPoints: [
            { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
            { sourcePx: { x: 1000, y: 800 }, planMm: { xMm: 4000, zMm: 3000 } },
          ],
          rmsErrorPx: 0,
        }],
        vertices: [
          { id: "vertex-1", xMm: 0, zMm: 0, provenance },
          { id: "vertex-2", xMm: 4000, zMm: 0, provenance },
          { id: "vertex-3", xMm: 4000, zMm: 3000, provenance },
          { id: "vertex-4", xMm: 0, zMm: 3000, provenance },
        ],
        walls: [
          ["wall-1", "vertex-1", "vertex-2"],
          ["wall-2", "vertex-2", "vertex-3"],
          ["wall-3", "vertex-3", "vertex-4"],
          ["wall-4", "vertex-4", "vertex-1"],
        ].map(([id, startVertexId, endVertexId]) => ({
          id,
          path: { kind: "line", startVertexId, endVertexId },
          thicknessMm: 100,
          classification: "exterior",
          adjacentRoomIds: ["room-1"],
          provenance,
        })),
        rooms: [{
          id: "room-1",
          name: "Living room",
          roomType: "living",
          wallLoops: [{
            kind: "outer",
            walls: ["wall-1", "wall-2", "wall-3", "wall-4"].map((wallId) => ({
              wallId,
              direction: "forward",
            })),
          }],
          provenance,
        }],
        openings: [],
        structures: [],
        annotations: [],
        dimensions: [{
          id: "dimension-1",
          fromVertexId: "vertex-1",
          toVertexId: "vertex-2",
          axis: "horizontal",
          measuredMm: 4000,
          provenance,
        }],
      },
    ],
  };
}

async function testHappyPipeline() {
  const repository = new MemoryRepository(makeJob("happy"));
  const result = await runFloorPlanImportPipeline({
    jobId: "happy",
    repository,
    store,
    adapters: new FloorPlanSourceAdapterRegistry([adapterWithIssue(null)]),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.progress, 100);
  assert.deepEqual(repository.transitions, [
    "received->rendered",
    "rendered->extracted",
    "extracted->scale_solved",
    "scale_solved->topology_built",
    "topology_built->validating",
    "validating->ready",
  ]);
}

async function testCriticalIssueStopsPipeline() {
  const repository = new MemoryRepository(makeJob("review"));
  const result = await runFloorPlanImportPipeline({
    jobId: "review",
    repository,
    store,
    adapters: new FloorPlanSourceAdapterRegistry([
      adapterWithIssue({
        id: "scale-unknown",
        code: "scale_unknown",
        message: "Confirm a printed dimension",
        severity: "critical",
        resolved: false,
      }),
    ]),
  });
  assert.equal(result.status, "needs_review");
  assert.deepEqual(repository.transitions, [
    "received->rendered",
    "rendered->extracted",
    "extracted->needs_review",
  ]);
}

async function testMultiPageImportPausesForSelection() {
  const repository = new MemoryRepository(makeJob("page-selection"));
  const envelope = {
    kind: "floor_plan_deterministic_evidence_v2",
    source: {
      id: "source-1",
      fileName: "home.pdf",
      mimeType: "application/pdf",
      sha256: "a".repeat(64),
    },
    pages: [{ pageNumber: 1 }, { pageNumber: 2 }],
    pageCandidates: [
      {
        pageNumber: 2,
        rank: 1,
        score: 100,
        widthPx: 1000,
        heightPx: 800,
        roomLabelCount: 3,
        dimensionLabelCount: 2,
        openingSymbolCount: 1,
        vectorPathCount: 10,
        vectorSegmentCount: 40,
      },
      {
        pageNumber: 1,
        rank: 2,
        score: 20,
        widthPx: 1000,
        heightPx: 800,
        roomLabelCount: 0,
        dimensionLabelCount: 0,
        openingSymbolCount: 0,
        vectorPathCount: 2,
        vectorSegmentCount: 8,
      },
    ],
    selectedPageNumber: null,
    scale: null,
    scales: [],
  };
  const canonical = makeMinimalDocument();
  const adapter: FloorPlanSourceAdapter = {
    id: "page-selection-adapter",
    extractionVersion: "2.0.0",
    supports: () => true,
    async render() {
      return [
        { pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "page-1" },
        { pageNumber: 2, widthPx: 1000, heightPx: 800, assetKey: "page-2" },
      ];
    },
    async extract() {
      return {
        candidate: envelope,
        sourceManifest: { pages: [] },
        reviewIssues: [],
      };
    },
    async solveScale() {
      return {
        candidate: canonical,
        sourceManifest: { pages: [] },
        reviewIssues: [],
      };
    },
    async buildTopology(previous) {
      return previous;
    },
    async validate(previous) {
      return previous;
    },
  };
  const paused = await runFloorPlanImportPipeline({
    jobId: repository.job.id,
    repository,
    store,
    adapters: new FloorPlanSourceAdapterRegistry([adapter]),
  });
  assert.equal(paused.status, "selecting_page");
  assert.deepEqual(repository.transitions, [
    "received->rendered",
    "rendered->extracted",
    "extracted->selecting_page",
  ]);

  repository.job = {
    ...repository.job,
    candidate: { ...envelope, selectedPageNumber: 2 },
  };
  const completed = await runFloorPlanImportPipeline({
    jobId: repository.job.id,
    repository,
    store,
    adapters: new FloorPlanSourceAdapterRegistry([adapter]),
  });
  assert.equal(completed.status, "ready");
  assert.deepEqual(repository.transitions.slice(3), [
    "selecting_page->scale_solved",
    "scale_solved->topology_built",
    "topology_built->validating",
    "validating->ready",
  ]);
}

async function testSourceCompletenessCannotBeWaived() {
  const repository = new MemoryRepository(makeJob("source-completeness"));
  const incompleteDocument = makeMinimalDocument();
  (
    incompleteDocument.floors as Array<Record<string, unknown>>
  )[0].dimensions = [];
  const result = await runFloorPlanImportPipeline({
    jobId: "source-completeness",
    repository,
    store,
    adapters: new FloorPlanSourceAdapterRegistry([
      adapterWithIssue(
        {
          id: "source-room-coverage-incomplete",
          code: "source_room_coverage_incomplete",
          message: "Previously waived source coverage",
          severity: "critical",
          resolved: true,
          resolution: "I checked only the visible room and accepted it.",
        },
        incompleteDocument,
        {
          pages: [{
            pageNumber: 1,
            selectedForSemanticClassification: true,
            semanticRoomLabelCount: 2,
            semanticDimensionCount: 1,
          }],
        }
      ),
    ]),
  });
  assert.equal(result.status, "needs_review");
  assert.equal(repository.transitions.at(-1), "topology_built->needs_review");
  assert.ok(
    result.reviewIssues.some(
      (entry) =>
        entry.code === "source_room_coverage_incomplete" && !entry.resolved
    ),
    "A resolution note must not waive a missing indicated room."
  );
  assert.ok(
    result.reviewIssues.some(
      (entry) =>
        entry.code === "source_dimension_coverage_incomplete" && !entry.resolved
    ),
    "A detected printed dimension must exist in canonical geometry before ready."
  );
}

async function testCorrectedCandidateResumesValidation() {
  const repository = new MemoryRepository({
    ...makeJob("resume"),
    status: "validating",
    adapterId: "test-adapter",
    candidate: makeMinimalDocument(),
    reviewIssues: [
      {
        id: "orientation",
        code: "orientation_unknown",
        message: "Confirm orientation",
        severity: "critical",
        resolved: true,
        resolution: "Matched the entrance against the source plan",
      },
    ],
  });
  const result = await resumeFloorPlanImportValidation({
    jobId: "resume",
    repository,
    store,
    adapters: new FloorPlanSourceAdapterRegistry([adapterWithIssue(null)]),
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(repository.transitions, ["validating->ready"]);
}

async function testEveryPersistedProcessingStageResumes() {
  const cases: Array<{
    status: FloorPlanImportStatus;
    firstTransition: string;
    expectedCalls: string[];
  }> = [
    {
      status: "rendered",
      firstTransition: "rendered->extracted",
      expectedCalls: ["extract", "solveScale", "buildTopology", "validate"],
    },
    {
      status: "extracted",
      firstTransition: "extracted->scale_solved",
      expectedCalls: ["solveScale", "buildTopology", "validate"],
    },
    {
      status: "scale_solved",
      firstTransition: "scale_solved->topology_built",
      expectedCalls: ["buildTopology", "validate"],
    },
    {
      status: "topology_built",
      firstTransition: "topology_built->validating",
      expectedCalls: ["validate"],
    },
    {
      status: "validating",
      firstTransition: "validating->ready",
      expectedCalls: ["validate"],
    },
  ];

  for (const testCase of cases) {
    const calls: string[] = [];
    const baseAdapter = adapterWithIssue(null);
    const adapter: FloorPlanSourceAdapter = {
      ...baseAdapter,
      async render(...args) {
        calls.push("render");
        return baseAdapter.render(...args);
      },
      async extract(...args) {
        calls.push("extract");
        return baseAdapter.extract(...args);
      },
      async solveScale(...args) {
        calls.push("solveScale");
        return baseAdapter.solveScale(...args);
      },
      async buildTopology(...args) {
        calls.push("buildTopology");
        return baseAdapter.buildTopology(...args);
      },
      async validate(...args) {
        calls.push("validate");
        return baseAdapter.validate(...args);
      },
    };
    const repository = new MemoryRepository({
      ...makeJob(`resume-${testCase.status}`),
      status: testCase.status,
      adapterId: adapter.id,
      renderedPages: [
        { pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "page-1" },
      ],
      ...(testCase.status === "rendered"
        ? {}
        : {
            candidate: makeMinimalDocument(),
            sourceManifest: { pages: [1] },
          }),
    });
    const result = await runFloorPlanImportPipeline({
      jobId: repository.job.id,
      repository,
      store,
      adapters: new FloorPlanSourceAdapterRegistry([adapter]),
    });
    assert.equal(result.status, "ready", `${testCase.status} should resume to ready`);
    assert.equal(repository.transitions[0], testCase.firstTransition);
    assert.deepEqual(calls, testCase.expectedCalls);
  }
}

assert.equal(canTransitionFloorPlanImport("received", "rendered"), true);
assert.equal(canTransitionFloorPlanImport("needs_review", "ready"), false);
assert.equal(canTransitionFloorPlanImport("published", "failed"), false);

assert.equal(
  hashCanonicalJson({ walls: [1], name: "Home" }),
  hashCanonicalJson({ name: "Home", walls: [1] })
);
assert.equal(
  hasExpectedFloorPlanSignature(new TextEncoder().encode("%PDF-1.7"), "application/pdf"),
  true
);
assert.equal(
  hasExpectedFloorPlanSignature(new TextEncoder().encode("not a pdf"), "application/pdf"),
  false
);

sourceManifestSchema.parse({
  pages: [1],
  sourceInventory: {
    pageNumbers: [1],
    visibleCriticalEntityIds: ["wall-1", "room-1"],
    printedDimensionIds: ["dimension-1"],
    licenseStatus: "permission_confirmed",
    reviewerNotes: "Reviewed against the registered source overlay.",
  },
});
assert.throws(() =>
  sourceManifestSchema.parse({
    sourceInventory: {
      pageNumbers: [1],
      visibleCriticalEntityIds: ["wall-1"],
      printedDimensionIds: ["dimension-1"],
      licenseStatus: "permission_confirmed",
      reviewerNotes: "Reviewed against the source.",
    },
    publicationChecks: {
      dimensionsExact: true,
      criticalElementsAccountedFor: true,
      topologyValid: true,
      overlayRegistered: true,
      renderParityVerified: true,
      persistenceRoundTripVerified: true,
    },
  })
);
assert.throws(() =>
  parseReviewIssues([
    {
      id: "critical-1",
      code: "wall_uncertain",
      message: "Wall position uncertain",
      severity: "critical",
      resolved: true,
    },
  ])
);
assert.equal(hasUnresolvedCriticalIssues([{
  id: "room-names",
  code: "rooms_confirmation",
  message: "Room names can be reviewed later",
  severity: "critical",
  resolved: false,
}]), false);
assert.equal(hasUnresolvedCriticalIssues([{
  id: "scale",
  code: "scale_unresolved",
  message: "Scale is required",
  severity: "critical",
  resolved: false,
}]), true);
assert.doesNotThrow(() => parseReviewIssues([{
  id: "room-names",
  code: "rooms_confirmation",
  message: "Room names can be reviewed later",
  severity: "critical",
  resolved: true,
}]));
assert.equal(
  parseAddressBindings([
    {
      countryCode: "sg",
      addressNormalized: "810A Chai Chee Street",
      block: "810A",
      street: "Chai Chee Street",
      stack: "509",
      transform: "mirror_x_rotate_90",
    },
  ])[0].transform,
  "mirror_x_rotate_90"
);
assert.equal(
  parseAddressBindings([{
    countryCode: "sg",
    addressNormalized: "810A Chai Chee Street",
    block: "",
    street: "",
    postalCode: "460810",
    stack: null,
    floorMin: null,
    floorMax: null,
    transform: "normal",
  }])[0].postalCode,
  "460810"
);
assert.throws(() =>
  compileCandidateFloorPlanDocumentV2({ schemaVersion: 2, units: "mm", floors: [] })
);

type Json = Record<string, unknown>;
const jsonBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");
const packedFloor = (value: unknown) => (value as { floors: Json[] }).floors[0];

/** A source-drawing mark as the import writes one (source-drawing-annotations.ts, floor-plan-source-trace.ts). */
function sourceMark(
  id: string,
  command: "line" | "cubic" | "text" | "path",
  points: Array<Record<string, number>>,
  extra: Json = {},
  options: { text?: string; corrected?: boolean } = {}
): Json {
  return {
    id,
    kind: command === "text" ? "label" : "note",
    text: options.text ?? "Unclassified source stroke",
    scope: "reference",
    ...(command === "path" ? { configurationId: "source-artwork-trace-v1" } : {}),
    geometry: {
      kind: "source_drawing", sourceId: "source-1", pageNumber: 1, widthPx: 1000, heightPx: 800,
      command, points, ...extra,
    },
    provenance: {
      confidence: 0,
      extractionVersion: "test-adapter-1",
      reviewHistory: options.corrected
        ? [{ id: "review-1", action: "corrected", reviewerId: "user-1", reviewedAt: "2026-10-28T00:00:00.000Z" }]
        : [],
      evidence: [{
        sourceId: "source-1", pageNumber: 1, basis: command === "path" ? "raster_traced" : "vector_traced",
        confidence: 0, extractorVersion: "test-adapter-1",
        note: "Unclassified reference artwork; no building meaning, scale or verification is inferred.",
      }],
    },
  };
}

function keptAnnotation(id: string, geometry: Json): Json {
  return {
    id, kind: "label", text: `Kept ${id}`,
    geometry,
    provenance: { confidence: 0.5, extractionVersion: "test-adapter-1", evidence: [], reviewHistory: [] },
  };
}

/** Kept annotations between source marks, every packed field, an edited mark and one whose points can't be packed. */
function documentWithSourceDrawing(): Json {
  const document = makeMinimalDocument();
  const path = (id: string, corrected = false) => sourceMark(id, "path",
    [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 25, y: 12 }, { x: 28, y: 18 }, { x: 30, y: 30 }],
    { pathCommands: ["L", "C", "Z"], strokeWidthPx: 1.5, fill: false, groupId: "faithful-0", tone: 64 },
    { text: "Automatically traced source artwork; no building meaning or metric scale inferred.", corrected });
  (packedFloor(document) as { annotations: Json[] }).annotations = [
    keptAnnotation("label-1", { kind: "point", vertexId: "vertex-1" }),
    sourceMark("source-artwork:1:1", "line", [{ x: 0.5, y: 1.25 }, { x: 100, y: 1.25 }]),
    sourceMark("source-artwork:1:2", "line", [{ x: 100, y: 1.25 }, { x: 100, y: 80 }]),
    sourceMark("source-artwork:1:3", "cubic", [{ x: 0, y: 0 }, { x: 5, y: -2 }, { x: 9, y: -2 }, { x: 12, y: 0 }]),
    keptAnnotation("label-2", { kind: "polygon", vertexIds: ["vertex-1", "vertex-2", "vertex-3"] }),
    sourceMark("source-artwork:1:4", "text", [{ x: 400, y: 300 }], { textRotationDegrees: 90 }, { text: "BEDROOM 1" }),
    path("source-trace:1:0"),
    path("source-trace:1:1", true),
    sourceMark("source-artwork:1:5", "line", [{ y: 3, x: 1 }, { x: 4, y: 3 }]),
    sourceMark("source-artwork:1:6", "line", [{ x: 1, y: 700 }, { x: 900, y: 700 }]),
  ];
  return document;
}

function testStoredCandidatePacking() {
  const document = documentWithSourceDrawing();
  const original = JSON.stringify(document);
  const packed = packFloorPlanCandidate(document);
  const floor = packedFloor(packed);
  const pack = floor.sourceDrawingPack as { templates: Json[]; texts: string[]; runs: number[][]; marks: unknown[][] };

  // The marks leave annotations; kept annotations (and the mark whose point keys are out of order) stay in order.
  assert.deepEqual((floor.annotations as Json[]).map((annotation) => annotation.id),
    ["label-1", "label-2", "source-artwork:1:5"]);
  assert.equal(pack.marks.length, 7);
  assert.deepEqual(pack.runs, [[1, 3], [5, 3], [9, 1]]);
  // line, cubic, text, path, and the edited path with its own review history.
  assert.equal(pack.templates.length, 5);
  assert.equal(pack.texts.length, 3);
  assert.equal(JSON.stringify(document), original, "Packing doesn't change its input.");

  // Unpacking gives back the same JSON, key order included; packing again changes nothing.
  assert.equal(JSON.stringify(unpackFloorPlanCandidate(packed)), original);
  assert.equal(JSON.stringify(packFloorPlanCandidate(packed)), JSON.stringify(packed));
  assert.equal(JSON.stringify(packFloorPlanCandidate(unpackFloorPlanCandidate(packed))), JSON.stringify(packed));
  assert.equal(JSON.stringify(unpackFloorPlanCandidate(JSON.parse(JSON.stringify(packed)))), original);

  // Readers compile the canonical document from either form.
  const fromPacked = compileCandidateFloorPlanDocumentV2(packed);
  const fromOriginal = compileCandidateFloorPlanDocumentV2(document);
  assert.equal(JSON.stringify(fromPacked.document), original);
  assert.equal(fromPacked.scene.geometryHash, fromOriginal.scene.geometryHash);
  assert.equal(fromPacked.scene.floors[0].annotations.length, 10);

  // An app that predates the pack compiles a packed candidate without its source drawing, rather than failing.
  const olderApp = compileFloorPlanDocumentV2(packed as unknown as FloorPlanDocumentV2);
  assert.equal(olderApp.floors[0].annotations.length, 3);

  // That app may save the floor with the pack kept but other annotations removed: every mark still comes back.
  const drifted = JSON.parse(JSON.stringify(packed)) as Json;
  (packedFloor(drifted).annotations as Json[]).splice(0, 2);
  const recovered = (packedFloor(unpackFloorPlanCandidate(drifted)).annotations as Json[]).map((annotation) => annotation.id);
  assert.equal(recovered.length, 8);
  for (const mark of pack.marks) assert.ok(recovered.includes(mark[1] as string), `${mark[1]} survives`);

  // Values that aren't packed candidates pass through.
  for (const value of [null, "candidate", [], { floors: "none" }, { kind: "floor_plan_deterministic_evidence_v2", pageCandidates: [] }]) {
    assert.equal(unpackFloorPlanCandidate(value), value);
    assert.deepEqual(packFloorPlanCandidate(value), value);
  }
  const plain = makeMinimalDocument();
  assert.equal(unpackFloorPlanCandidate(plain), plain);
  assert.equal(JSON.stringify(packFloorPlanCandidate(plain)), JSON.stringify(plain));

  // Storage packs only once STORE_SOURCE_DRAWING_PACKED is on; until then it gives either form back unpacked.
  const storedForm = STORE_SOURCE_DRAWING_PACKED ? JSON.stringify(packed) : original;
  assert.equal(JSON.stringify(packFloorPlanCandidateForStorage(document)), storedForm);
  assert.equal(JSON.stringify(packFloorPlanCandidateForStorage(packed)), storedForm);
}

function testMalformedSourceDrawingPacks() {
  const packed = packFloorPlanCandidate(documentWithSourceDrawing());
  const broken = (change: (pack: Json & { marks: unknown[][]; runs: number[][]; templates: Json[] }) => void) => {
    const copy = JSON.parse(JSON.stringify(packed)) as Json;
    change(packedFloor(copy).sourceDrawingPack as Json & { marks: unknown[][]; runs: number[][]; templates: Json[] });
    return copy;
  };
  const cases: Array<[string, Json]> = [
    ["unknown format", broken((pack) => { pack.format = "source-drawing-pack-v0"; })],
    ["missing template", broken((pack) => { pack.marks[0][0] = 99; })],
    ["template index as text", broken((pack) => { pack.marks[0][0] = "0"; })],
    ["text point", broken((pack) => { (pack.marks[0][3] as unknown[])[0] = "0.5"; })],
    ["odd point count", broken((pack) => { (pack.marks[0][3] as unknown[]).pop(); })],
    ["more marks in runs than packed", broken((pack) => { pack.runs[2][1] = 2; })],
    ["fewer marks in runs than packed", broken((pack) => { pack.runs.pop(); })],
    ["missing path commands", broken((pack) => { delete (pack.marks[4][4] as Json).c; })],
    ["unknown path command", broken((pack) => { (pack.marks[4][4] as Json).c = "LQZ"; })],
    ["a template that isn't a source mark", broken((pack) => { (pack.templates[0].geometry as Json).kind = "polygon"; })],
    ["annotations missing", (() => {
      const copy = JSON.parse(JSON.stringify(packed)) as Json;
      delete packedFloor(copy).annotations;
      return copy;
    })()],
  ];
  for (const [label, candidate] of cases) {
    assert.throws(() => unpackFloorPlanCandidate(candidate), /Malformed source drawing pack/, label);
    assert.throws(() => parseCandidate(candidate), /Malformed source drawing pack/, label);
  }

  // A small pack can't expand without bound: one large template repeated past the unpacked limit is refused.
  const expanding = broken((pack) => {
    (pack.templates[0].provenance as Json).padding = "x".repeat(1024 * 1024);
    pack.marks = Array.from({ length: 40 }, (_, index) => [0, `mark-${index}`, 0, [0, 0, 1, 1]]);
    pack.runs = [[0, 40]];
  });
  assert.ok(jsonBytes(expanding) < MAX_FLOOR_PLAN_CANDIDATE_BYTES);
  assert.throws(() => parseCandidate(expanding), /expands past the unpacked limit/);

  // The limit is the candidate's, across its floors: floors that each stay under it can't add up past it.
  const floorOfSixMegabytes = packedFloor(broken((pack) => {
    (pack.templates[0].provenance as Json).padding = "x".repeat(300 * 1024);
    pack.marks = Array.from({ length: 20 }, (_, index) => [0, `mark-${index}`, 0, [0, 0, 1, 1]]);
    pack.runs = [[0, 20]];
  }));
  const withFloors = (count: number) => ({
    ...(packed as Json),
    floors: Array.from({ length: count }, (_, index) => ({ ...floorOfSixMegabytes, id: `floor-${index + 1}` })),
  });
  assert.doesNotThrow(() => unpackFloorPlanCandidate(withFloors(2)));
  assert.throws(() => unpackFloorPlanCandidate(withFloors(3)), /expands past the unpacked limit/);
  // One budget can cover several documents (a design's two): together they can't pass it either.
  const shared = sourceDrawingBudget();
  assert.doesNotThrow(() => unpackFloorPlanCandidate(withFloors(2), shared));
  assert.throws(() => unpackFloorPlanCandidate(withFloors(1), shared), /expands past the unpacked limit/);
  const spent = sourceDrawingBudget();
  spent.spent = spent.limit;
  const unpackedAgain = unpackFloorPlanCandidate(packed);
  assert.equal(packFloorPlanCandidate(unpackedAgain, spent), unpackedAgain, "Past a shared budget, packing leaves it unpacked.");

  // A text shared by many marks counts in full for each, escapes included: 1,000 marks sharing 16,000 control
  // characters would be 96 MB of JSON, and are refused well before that.
  const escaping = broken((pack) => {
    pack.texts = ["\u0001".repeat(16_000)];
    pack.marks = Array.from({ length: 1_000 }, (_, index) => [0, `mark-${index}`, 0, [0, 0, 1, 1]]);
    pack.runs = [[0, 1_000]];
  });
  assert.ok(jsonBytes(escaping) < 200 * 1024);
  const started = Date.now();
  assert.throws(() => unpackFloorPlanCandidate(escaping), /expands past the unpacked limit/);
  assert.ok(Date.now() - started < 2_000, "Refused without building the expansion.");

  // What couldn't be read back isn't packed: marks that would expand past the limit stay as they are.
  const oversized = documentWithSourceDrawing();
  const longText = "x".repeat(6 * 1024 * 1024);
  for (const annotation of (packedFloor(oversized) as { annotations: Json[] }).annotations) {
    if ((annotation.geometry as Json).kind === "source_drawing") annotation.text = longText;
  }
  const notPacked = packFloorPlanCandidate(oversized);
  assert.equal(packedFloor(notPacked).sourceDrawingPack, undefined);
  assert.equal(unpackFloorPlanCandidate(notPacked), notPacked);
}

function testCandidateCapIsOnTheUnpackedCandidate() {
  // The cap is on the canonical document every reader gets (a design keeps it whole), packed or not.
  const dense = (count: number) => {
    const document = makeMinimalDocument();
    (packedFloor(document) as { annotations: Json[] }).annotations = Array.from({ length: count }, (_, index) =>
      sourceMark(`source-artwork:1:${index + 1}`, "line", [{ x: index % 1000, y: 1 }, { x: index % 1000, y: 700 }]));
    return document;
  };
  const under = dense(8_000);
  const over = dense(10_000);
  assert.ok(jsonBytes(under) < MAX_FLOOR_PLAN_CANDIDATE_BYTES, `${jsonBytes(under)} bytes`);
  assert.ok(jsonBytes(over) > MAX_FLOOR_PLAN_CANDIDATE_BYTES, `${jsonBytes(over)} bytes`);
  assert.ok(jsonBytes(packFloorPlanCandidate(over)) * 5 < MAX_FLOOR_PLAN_CANDIDATE_BYTES);
  assert.equal(JSON.stringify(parseCandidate(under)), JSON.stringify(under));
  assert.equal(JSON.stringify(parseCandidate(packFloorPlanCandidate(under))), JSON.stringify(under));
  assert.throws(() => parseCandidate(over), /candidate is larger than 5 MB/);
  assert.throws(() => parseCandidate(packFloorPlanCandidate(over)), /candidate is larger than 5 MB/);
}

async function main() {
  await testHappyPipeline();
  await testCriticalIssueStopsPipeline();
  await testMultiPageImportPausesForSelection();
  await testSourceCompletenessCannotBeWaived();
  await testCorrectedCandidateResumesValidation();
  await testEveryPersistedProcessingStageResumes();
  testStoredCandidatePacking();
  testMalformedSourceDrawingPacks();
  testCandidateCapIsOnTheUnpackedCandidate();
  console.log("Floor-plan import platform tests passed");
}

void main();
