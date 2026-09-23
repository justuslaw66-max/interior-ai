import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import { applyFloorPlanAddressTransformV2 } from "@/lib/floor-plan-legacy-adapters";
import {
  assertNoFloorPlanAddressBindingConflicts,
  floorPlanAddressBindingsOverlap,
} from "@/lib/floor-plan-imports/address-binding-conflicts";
import { assertFloorPlanRevisionMutationAllowed } from "@/lib/floor-plan-imports/revision-immutability";
import { validateFloorPlanSourceEvidenceBounds } from "@/lib/floor-plan-imports/source-evidence-bounds";
import { parseRenderedPages } from "@/lib/floor-plan-imports/validation";

const renderedPages = [
  { pageNumber: 1, widthPx: 1000, heightPx: 800, assetKey: "page-1" },
];

function makeDocument(): FloorPlanDocumentV2 {
  const provenance = {
    confidence: 0.9,
    extractionVersion: "test-1",
    evidence: [
      {
        sourceId: "source-1",
        basis: "vector_traced" as const,
        confidence: 0.9,
        extractorVersion: "test-1",
        pageNumber: 1,
        cropPx: { xPx: 100, yPx: 120, widthPx: 40, heightPx: 30 },
      },
    ],
    reviewHistory: [],
  };
  const measured = (valueMm: number) => ({
    valueMm,
    evidence: "source_documented" as const,
    provenance: structuredClone(provenance),
  });
  return {
    schemaVersion: 2,
    units: "mm",
    id: "bounds-test",
    revisionId: "bounds-test-r1",
    createdAt: "2026-07-16T00:00:00.000Z",
    verification: { tier: "needs_review", criticalIssueIds: [] },
    sources: [
      {
        id: "source-1",
        kind: "pdf",
        name: "Source",
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
        calibrations: [
          {
            id: "calibration-1",
            sourceId: "source-1",
            pageNumber: 1,
            imageWidthPx: 1000,
            imageHeightPx: 800,
            controlPoints: [
              { sourcePx: { x: 0, y: 0 }, planMm: { xMm: 0, zMm: 0 } },
              { sourcePx: { x: 1000, y: 800 }, planMm: { xMm: 10000, zMm: 8000 } },
            ],
            rmsErrorPx: 0.25,
          },
        ],
        vertices: [
          { id: "v1", xMm: 0, zMm: 0, provenance: structuredClone(provenance) },
        ],
        walls: [],
        rooms: [],
        openings: [],
        structures: [],
        annotations: [],
        dimensions: [],
      },
    ],
  };
}

assert.deepEqual(
  validateFloorPlanSourceEvidenceBounds({
    document: makeDocument(),
    sourceId: "source-1",
    renderedPages,
  }),
  []
);

const cropOverflow = makeDocument();
cropOverflow.floors[0].vertices[0].provenance.evidence[0].cropPx = {
  xPx: 990,
  yPx: 10,
  widthPx: 20,
  heightPx: 20,
};
assert(
  validateFloorPlanSourceEvidenceBounds({
    document: cropOverflow,
    sourceId: "source-1",
    renderedPages,
  }).some((issue) => issue.code === "SOURCE_CROP_OUT_OF_BOUNDS")
);

const calibrationMismatch = makeDocument();
calibrationMismatch.floors[0].calibrations[0].imageWidthPx = 999;
calibrationMismatch.floors[0].calibrations[0].controlPoints[1].sourcePx.x = 1001;
const calibrationIssues = validateFloorPlanSourceEvidenceBounds({
  document: calibrationMismatch,
  sourceId: "source-1",
  renderedPages,
});
assert(calibrationIssues.some((issue) => issue.code === "SOURCE_PAGE_DIMENSIONS_MISMATCH"));
assert(calibrationIssues.some((issue) => issue.code === "SOURCE_POINT_OUT_OF_BOUNDS"));

const missingPage = makeDocument();
missingPage.sources[0].pageCount = 2;
missingPage.floors[0].vertices[0].provenance.evidence[0].pageNumber = 2;
const missingPageIssues = validateFloorPlanSourceEvidenceBounds({
  document: missingPage,
  sourceId: "source-1",
  renderedPages,
});
assert(missingPageIssues.some((issue) => issue.code === "SOURCE_PAGE_COUNT_MISMATCH"));
assert(missingPageIssues.some((issue) => issue.code === "SOURCE_PAGE_NOT_RENDERED"));

const addressTransformSource = makeDocument();
addressTransformSource.floors[0].vertices.push({
  id: "v2",
  xMm: 10_000,
  zMm: 8_000,
  provenance: structuredClone(addressTransformSource.floors[0].vertices[0].provenance),
});
addressTransformSource.floors[0].calibrations[0].controlPoints[1].planMm = {
  xMm: 10_000,
  zMm: 8_000,
};
const mirroredAddressPlan = applyFloorPlanAddressTransformV2(
  addressTransformSource,
  "mirror_x"
);
assert.deepEqual(
  mirroredAddressPlan.floors[0].calibrations[0].controlPoints.map(
    (point) => point.planMm
  ),
  [
    { xMm: 10_000, zMm: 0 },
    { xMm: 0, zMm: 8_000 },
  ],
  "Address transforms must keep persisted source registration aligned with transformed geometry."
);

const unboundSecondarySource = makeDocument();
unboundSecondarySource.sources.push({
  id: "source-2",
  kind: "raster",
  name: "Unstored secondary scan",
  mimeType: "image/png",
  pageCount: 1,
});
unboundSecondarySource.floors[0].vertices[0].provenance.evidence.push({
  sourceId: "source-2",
  basis: "raster_traced",
  confidence: 0.9,
  extractorVersion: "test-1",
  pageNumber: 1,
  cropPx: { xPx: 0, yPx: 0, widthPx: 10, heightPx: 10 },
});
assert(
  validateFloorPlanSourceEvidenceBounds({
    document: unboundSecondarySource,
    sourceId: "source-1",
    renderedPages,
  }).some((issue) => issue.code === "SOURCE_METADATA_UNAVAILABLE")
);

assert.throws(() =>
  parseRenderedPages([
    ...renderedPages,
    { pageNumber: 1, widthPx: 500, heightPx: 400, assetKey: "duplicate-page-1" },
  ])
);

const binding = {
  countryCode: "SG",
  addressNormalized: "810A Chai Chee Street",
  block: "810A",
  street: "Chai Chee Street",
  postalCode: null,
  stack: "509",
  floorMin: 2,
  floorMax: 10,
  transform: "normal" as const,
};
assert.equal(
  floorPlanAddressBindingsOverlap(binding, {
    ...binding,
    addressNormalized: "810a chai chee street.",
    floorMin: 10,
    floorMax: 15,
  }),
  true,
  "Inclusive floor ranges must conflict at their shared boundary"
);
assert.equal(
  floorPlanAddressBindingsOverlap(binding, { ...binding, floorMin: 11, floorMax: 15 }),
  false
);
assert.equal(
  floorPlanAddressBindingsOverlap(binding, { ...binding, stack: "527" }),
  false
);
assert.equal(
  floorPlanAddressBindingsOverlap(binding, { ...binding, stack: null }),
  false,
  "An address-only candidate may coexist with exact-unit plans at that address"
);
assert.throws(
  () =>
    assertNoFloorPlanAddressBindingConflicts({
      incoming: [binding],
      existing: [{ ...binding, revisionId: "existing-revision" }],
    }),
  /ADDRESS_BINDING_CONFLICT/
);

assert.doesNotThrow(() =>
  assertFloorPlanRevisionMutationAllowed(
    { publicationStatus: "approved", geometryHash: "hash-a" },
    { publicationStatus: "published" }
  )
);
assert.throws(
  () =>
    assertFloorPlanRevisionMutationAllowed(
      { publicationStatus: "approved" },
      { publicationStatus: "draft" }
    ),
  /FLOOR_PLAN_REVISION_IMMUTABLE/
);
assert.throws(
  () =>
    assertFloorPlanRevisionMutationAllowed(
      { publicationStatus: "approved", geometryHash: "hash-a" },
      { geometryHash: "hash-b" }
    ),
  /FLOOR_PLAN_REVISION_IMMUTABLE/
);
assert.throws(
  () =>
    assertFloorPlanRevisionMutationAllowed(
      { publicationStatus: "published" },
      { publicationStatus: "approved" }
    ),
  /FLOOR_PLAN_REVISION_IMMUTABLE/
);

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260716144000_add_floor_plan_import_platform/migration.sql"
  ),
  "utf8"
);
assert.match(migration, /FloorPlanRevision_immutability_guard/);
assert.match(migration, /FloorPlanAddressBinding_overlap_guard/);
assert.match(migration, /documentJson[\s\S]*IS DISTINCT FROM/);
assert.match(migration, /floorMin[\s\S]*floorMax/);

const lifecycleMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260716173000_harden_floor_plan_revision_lifecycle/migration.sql"
  ),
  "utf8"
);
assert.match(
  lifecycleMigration,
  /publicationStatus" = 'approved'[\s\S]*NOT IN \('approved', 'published', 'retired'\)/
);

const approvalRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/floor-plan-imports/[id]/approve/route.ts"),
  "utf8"
);
assert.match(
  approvalRoute,
  /status: "ready"[\s\S]*candidateVersion: expectedCandidateVersion[\s\S]*revision: \{ is: null \}/,
  "Approval must atomically claim the exact unapproved candidate version."
);
assert.match(
  approvalRoute,
  /floorPlanRevision\.findUnique[\s\S]*persistedDocument\.scene\.geometryHash[\s\S]*REVISION_PERSISTENCE_MISMATCH/,
  "Approval must verify the canonical revision after its real database JSON round trip."
);
const confirmRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/floor-plan-imports/[id]/confirm/route.ts"),
  "utf8"
);
assert.match(
  confirmRoute,
  /if \(job\.revision\)[\s\S]*reserved for its approved public revision/,
  "A public revision job cannot race into the private applied terminal state."
);
assert.match(
  confirmRoute,
  /created\.snapshot[\s\S]*hashCanonicalJson\(created\.snapshot\)[\s\S]*DESIGN_PERSISTENCE_MISMATCH/,
  "Consumer confirmation must verify the saved design snapshot before applying the import."
);

console.log("Floor-plan verification hardening tests passed");
