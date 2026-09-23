import assert from "node:assert/strict";
import { assessFloorPlanServingIntegrity } from "../lib/floor-plan-imports/serving-integrity";

const result = assessFloorPlanServingIntegrity({
  id: "revision-corrupt",
  geometryHash: "0".repeat(64),
  verificationTier: "source_verified",
  publicationStatus: "published",
  publishedAt: new Date("2026-07-17T00:00:00.000Z"),
  approvedByEmail: "reviewer@example.com",
  publishedByEmail: "publisher@example.com",
  documentJson: { schemaVersion: 2 },
  sourceManifestJson: {},
  constructionEvidenceJson: null,
  sourceJob: {
    renderedPagesJson: [],
    sourceAsset: {
      id: "source-1",
      sha256: "1".repeat(64),
      mimeType: "application/pdf",
      contentDeletedAt: null,
    },
    supplementarySources: [],
    constructionSources: [],
  },
  addressBindings: [],
});

assert.equal(result.valid, false);
const codes = new Set(result.issues.map((issue) => issue.code));
assert.ok(codes.has("publication_evidence_invalid"));
assert.ok(codes.has("public_metadata_invalid"));
assert.ok(codes.has("canonical_document_invalid"));
assert.ok(codes.has("public_entity_ids_invalid"));
assert.ok(codes.has("rendered_pages_invalid"));
assert.ok(codes.has("no_valid_address_binding"));
assert.equal(result.validBindings, 0);

const invalidConstructionResult = assessFloorPlanServingIntegrity({
  id: "revision-construction-source-missing",
  geometryHash: "0".repeat(64),
  verificationTier: "construction_verified",
  publicationStatus: "published",
  publishedAt: new Date("2026-07-17T00:00:00.000Z"),
  approvedByEmail: "reviewer@example.com",
  publishedByEmail: "publisher@example.com",
  documentJson: { schemaVersion: 2 },
  sourceManifestJson: {},
  constructionEvidenceJson: null,
  sourceJob: {
    renderedPagesJson: [],
    sourceAsset: {
      id: "source-1",
      sha256: "1".repeat(64),
      mimeType: "application/pdf",
      contentDeletedAt: null,
    },
    supplementarySources: [],
    constructionSources: [],
  },
  addressBindings: [],
});
assert.ok(
  invalidConstructionResult.issues.some(
    (issue) => issue.code === "construction_evidence_invalid"
  ),
  "A construction-verified revision must retain valid durable unit evidence."
);

console.log("floor-plan serving integrity tests passed");
