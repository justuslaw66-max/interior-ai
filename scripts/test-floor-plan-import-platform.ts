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
  parseAddressBindings,
  parseReviewIssues,
  sourceManifestSchema,
} from "@/lib/floor-plan-imports/validation";

function makeJob(id: string): FloorPlanImportJobRecord {
  return {
    id,
    userId: "user-1",
    sourceAssetId: "source-1",
    status: "received",
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
        dimensions: [],
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

async function testSourceCompletenessCannotBeWaived() {
  const repository = new MemoryRepository(makeJob("source-completeness"));
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
        makeMinimalDocument(),
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

async function main() {
  await testHappyPipeline();
  await testCriticalIssueStopsPipeline();
  await testSourceCompletenessCannotBeWaived();
  await testCorrectedCandidateResumesValidation();
  await testEveryPersistedProcessingStageResumes();
  console.log("Floor-plan import platform tests passed");
}

void main();
