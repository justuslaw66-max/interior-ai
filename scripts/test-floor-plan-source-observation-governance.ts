import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import type { FloorPlanDocumentV2 } from "@/lib/floor-plan-document-v2";
import {
  assertDistinctFloorPlanReviewerPublisher,
  canPublishPublicFloorPlans,
  canReviewPublicFloorPlans,
  requireFloorPlanPublisher,
  requireFloorPlanReviewer,
} from "@/lib/floor-plan-imports/publication-governance";
import {
  assertFloorPlanSourceObservationsComplete,
  evaluateFloorPlanSourceObservationCompleteness,
  floorPlanSourceObservationManifestSchema,
  floorPlanSourceObservationSubmissionSchema,
  type FloorPlanSourceObservationManifest,
} from "@/lib/floor-plan-imports/source-observation-manifest";

const provenance = {
  confidence: 1,
  extractionVersion: "source-observation-test",
  evidence: [],
  reviewHistory: [],
};
const anchoredProvenance = {
  ...provenance,
  evidence: [{
    sourceId: "source-1",
    basis: "vector_traced" as const,
    confidence: 1,
    extractorVersion: "source-observation-test",
    pageNumber: 1,
    calibrationId: "calibration-1",
    cropPx: { xPx: 10, yPx: 10, widthPx: 500, heightPx: 500 },
    sourceAnchors: [
      { role: "start" as const, sourcePx: { x: 20, y: 20 } },
      { role: "end" as const, sourcePx: { x: 400, y: 20 } },
    ],
  }],
};
const document: FloorPlanDocumentV2 = {
  schemaVersion: 2,
  units: "mm",
  id: "document-1",
  revisionId: "revision-1",
  createdAt: "2030-01-01T00:00:00.000Z",
  verification: { tier: "needs_review", criticalIssueIds: [] },
  sources: [{
    id: "source-1", kind: "pdf", name: "source.pdf",
    mimeType: "application/pdf", sha256: "a".repeat(64), pageCount: 1,
  }],
  floors: [{
    id: "floor-1", name: "Floor 1", levelIndex: 0, elevationMm: 0,
    storeyHeightMm: 2800, slabThicknessMm: 150,
    defaults: {
      wallHeight: { valueMm: 2600, evidence: "assumed", provenance },
      doorHeight: { valueMm: 2100, evidence: "assumed", provenance },
      windowHeight: { valueMm: 1200, evidence: "assumed", provenance },
      windowSillHeight: { valueMm: 900, evidence: "assumed", provenance },
    },
    calibrations: [],
    vertices: [
      { id: "vertex-1", xMm: 0, zMm: 0, provenance },
      { id: "vertex-2", xMm: 4000, zMm: 0, provenance },
    ],
    walls: [{
      id: "wall-1", path: { kind: "line", startVertexId: "vertex-1", endVertexId: "vertex-2" },
      thicknessMm: 200, classification: "exterior", adjacentRoomIds: ["room-1"], provenance: anchoredProvenance,
    }],
    rooms: [{ id: "room-1", name: "Living Room", roomType: "living", wallLoops: [], provenance }],
    openings: [{
      id: "opening-1", wallId: "wall-1", kind: "door", operation: "swing",
      offsetMm: 500, widthMm: 900, hinge: "start", handing: "left", provenance: anchoredProvenance,
    }],
    structures: [{
      id: "structure-1", name: "Ledge", kind: "ledge",
      vertexIds: ["vertex-1", "vertex-2"], baseOffsetMm: 0, heightMm: 500, locked: true, provenance,
    }],
    annotations: [],
    dimensions: [{
      id: "dimension-1", fromVertexId: "vertex-1", toVertexId: "vertex-2",
      axis: "horizontal", measuredMm: 4000, provenance,
    }],
  }],
};

const cropPx = { xPx: 10, yPx: 10, widthPx: 500, heightPx: 500 };
const lineAnchors = [
  { role: "start" as const, xPx: 20, yPx: 20 },
  { role: "end" as const, xPx: 400, yPx: 20 },
];
const manifest: FloorPlanSourceObservationManifest = {
  schemaVersion: 1,
  source: { assetId: "source-1", sha256: "a".repeat(64), mimeType: "application/pdf" },
  candidateVersion: 3,
  recordedByReviewerId: "reviewer@example.com",
  recordedAt: "2030-01-01T00:00:00.000Z",
  rightsEvidence: {
    status: "permission_confirmed",
    basis: "Written permission authorizes public derived floor-plan geometry.",
    evidenceReference: "permission-123",
    permitsDerivedFloorPlanPublication: true,
    sourceAssetRedistributionAllowed: false,
    expiresAt: null,
  },
  reviewerNotes: "Every visible critical entity was independently observed and mapped.",
  observations: [
    { id: "observation-wall", kind: "wall", floorId: "floor-1", canonicalEntityId: "wall-1", pageNumber: 1, cropPx, anchorsPx: lineAnchors },
    { id: "observation-opening", kind: "opening", floorId: "floor-1", canonicalEntityId: "opening-1", pageNumber: 1, cropPx, anchorsPx: lineAnchors },
    { id: "observation-structure", kind: "structure", floorId: "floor-1", canonicalEntityId: "structure-1", pageNumber: 1, cropPx, anchorsPx: [{ role: "center", xPx: 100, yPx: 100 }] },
    { id: "observation-label", kind: "label", floorId: "floor-1", canonicalEntityId: "room-1", pageNumber: 1, cropPx, anchorsPx: [{ role: "label", xPx: 100, yPx: 100 }], observedText: "LIVING ROOM" },
    { id: "observation-dimension", kind: "dimension", floorId: "floor-1", canonicalEntityId: "dimension-1", pageNumber: 1, cropPx, anchorsPx: lineAnchors, observedText: "4000", measuredMm: 4000 },
  ],
};
const context = {
  document,
  sourceAsset: { id: "source-1", sha256: "a".repeat(64), mimeType: "application/pdf" },
  renderedPages: [{ pageNumber: 1, widthPx: 1000, heightPx: 1000, assetKey: "page-1" }],
  now: new Date("2030-01-02T00:00:00.000Z"),
};

assert.doesNotThrow(() => floorPlanSourceObservationManifestSchema.parse(manifest));
const complete = evaluateFloorPlanSourceObservationCompleteness({ ...context, manifest });
assert.equal(complete.passed, true);
assert.equal(complete.observationCount, complete.canonicalTargetCount);
assert.doesNotThrow(() => assertFloorPlanSourceObservationsComplete(complete));

const missingWall = structuredClone(manifest);
missingWall.observations = missingWall.observations.filter((item) => item.kind !== "wall");
const missingWallResult = evaluateFloorPlanSourceObservationCompleteness({ ...context, manifest: missingWall });
assert.equal(missingWallResult.passed, false);
assert(missingWallResult.issues.some((issue) => issue.code === "CANONICAL_CRITICAL_ENTITY_UNOBSERVED" && issue.canonicalEntityId === "wall-1"));

const removedCanonicalOpening = structuredClone(document);
removedCanonicalOpening.floors[0].openings = [];
const extraObservationResult = evaluateFloorPlanSourceObservationCompleteness({
  ...context, document: removedCanonicalOpening, manifest,
});
assert(extraObservationResult.issues.some((issue) => issue.code === "OBSERVATION_TARGET_MISSING" && issue.observationId === "observation-opening"));

const wrongDimension = structuredClone(manifest);
wrongDimension.observations.find((item) => item.kind === "dimension")!.measuredMm = 3999;
assert(evaluateFloorPlanSourceObservationCompleteness({ ...context, manifest: wrongDimension }).issues.some((issue) => issue.code === "OBSERVED_DIMENSION_MISMATCH"));

const supportedLabelAlias = structuredClone(manifest);
supportedLabelAlias.observations.find((item) => item.kind === "label")!.observedText = "LIVING";
assert.equal(
  evaluateFloorPlanSourceObservationCompleteness({
    ...context,
    manifest: supportedLabelAlias,
  }).passed,
  true,
  "Only explicit label aliases should reconcile with canonical semantics"
);

const wrongLabel = structuredClone(manifest);
wrongLabel.observations.find((item) => item.kind === "label")!.observedText = "KITCHEN";
assert(
  evaluateFloorPlanSourceObservationCompleteness({
    ...context,
    manifest: wrongLabel,
  }).issues.some((issue) => issue.code === "OBSERVED_LABEL_MISMATCH"),
  "A visible kitchen label must not map to a different canonical room"
);

const mislabeledRoomTypeDocument = structuredClone(document);
mislabeledRoomTypeDocument.floors[0].rooms[0].name = "Kitchen";
mislabeledRoomTypeDocument.floors[0].rooms[0].roomType = "bedroom";
const kitchenLabel = structuredClone(manifest);
kitchenLabel.observations.find((item) => item.kind === "label")!.observedText = "KITCHEN";
assert(
  evaluateFloorPlanSourceObservationCompleteness({
    ...context,
    document: mislabeledRoomTypeDocument,
    manifest: kitchenLabel,
  }).issues.some((issue) => issue.code === "OBSERVED_LABEL_TYPE_MISMATCH"),
  "A matching display name must not conceal an incompatible canonical room type"
);

const mismatchedAnchor = structuredClone(manifest);
mismatchedAnchor.observations.find((item) => item.kind === "wall")!
  .anchorsPx[0].xPx += 0.25;
assert(
  evaluateFloorPlanSourceObservationCompleteness({
    ...context,
    manifest: mismatchedAnchor,
  }).issues.some(
    (issue) => issue.code === "OBSERVATION_PROVENANCE_ANCHOR_MISMATCH"
  ),
  "Independent and candidate-controlled anchors must match exactly"
);

const outOfBounds = structuredClone(manifest);
outOfBounds.observations[0].anchorsPx[0].xPx = 999;
assert(evaluateFloorPlanSourceObservationCompleteness({ ...context, manifest: outOfBounds }).issues.some((issue) => issue.code === "OBSERVATION_OUT_OF_BOUNDS"));

const expiredRights = structuredClone(manifest);
expiredRights.rightsEvidence.expiresAt = "2029-01-01T00:00:00.000Z";
assert(evaluateFloorPlanSourceObservationCompleteness({ ...context, manifest: expiredRights }).issues.some((issue) => issue.code === "PUBLICATION_RIGHTS_EXPIRED"));

assert.throws(() => floorPlanSourceObservationSubmissionSchema.parse({
  ...manifest,
  observations: [manifest.observations[0], { ...manifest.observations[0], id: "duplicate-target" }],
  source: undefined,
  candidateVersion: undefined,
  recordedByReviewerId: undefined,
  recordedAt: undefined,
}), /exactly one observation/);

const previousReviewerEmails = process.env.FLOOR_PLAN_REVIEWER_EMAILS;
const previousPublisherEmails = process.env.FLOOR_PLAN_PUBLISHER_EMAILS;
process.env.FLOOR_PLAN_REVIEWER_EMAILS = "reviewer@example.com";
process.env.FLOOR_PLAN_PUBLISHER_EMAILS = "publisher@example.com";
assert.equal(canReviewPublicFloorPlans("REVIEWER@example.com"), true);
assert.equal(canPublishPublicFloorPlans("publisher@example.com"), true);
assert.equal(requireFloorPlanReviewer("reviewer@example.com"), "reviewer@example.com");
assert.equal(requireFloorPlanPublisher("publisher@example.com"), "publisher@example.com");
assert.throws(() => requireFloorPlanPublisher("reviewer@example.com"), /publisher is required/);
assert.doesNotThrow(() => assertDistinctFloorPlanReviewerPublisher({ reviewerEmail: "reviewer@example.com", publisherEmail: "publisher@example.com" }));
assert.throws(() => assertDistinctFloorPlanReviewerPublisher({ reviewerEmail: "same@example.com", publisherEmail: "SAME@example.com" }), /different authenticated person/);
process.env.FLOOR_PLAN_REVIEWER_EMAILS = previousReviewerEmails;
process.env.FLOOR_PLAN_PUBLISHER_EMAILS = previousPublisherEmails;

const migration = fs.readFileSync(path.join(process.cwd(), "prisma/migrations/20260717013000_add_source_observation_governance/migration.sql"), "utf8");
assert.match(migration, /FloorPlanRevision_source_observation_required_guard/);
assert.match(migration, /FloorPlanRevision_maker_checker_guard/);
assert.match(migration, /sourceObservationManifestJson/);

const approvalRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/floor-plan-imports/[id]/approve/route.ts"), "utf8");
assert.match(approvalRoute, /floorPlanSourceObservationManifestSchema\.parse/);
assert.match(approvalRoute, /sourceObservationVersion/);
assert.doesNotMatch(approvalRoute, /sourceManifestSchema\.parse\(payload\.sourceManifest\)/);
assert.doesNotMatch(approvalRoute, /publishedByEmail:\s*approvedBy/);

const publishRoute = fs.readFileSync(path.join(process.cwd(), "app/api/admin/floor-plan-imports/[id]/publish/route.ts"), "utf8");
assert.match(publishRoute, /requireFloorPlanPublisher/);
assert.match(publishRoute, /assertDistinctFloorPlanReviewerPublisher/);
assert.match(publishRoute, /retirePublishedFloorPlanRevisionForSupersede/);

const adminWorkspace = [
  "app/admin/floor-plans/[id]/FloorPlanReviewWorkspace.tsx",
  "app/admin/floor-plans/[id]/FloorPlanApprovalPanel.tsx",
].map((fileName) => fs.readFileSync(path.join(process.cwd(), fileName), "utf8")).join("\n");
assert.match(adminWorkspace, /SourceObservationManifestEditor/);
assert.doesNotMatch(adminWorkspace, /collectFloorPlanCriticalEntityIds/);
assert.doesNotMatch(adminWorkspace, /collectFloorPlanPrintedDimensionIds/);

console.log("Floor-plan independent source observation and maker-checker checks passed.");
