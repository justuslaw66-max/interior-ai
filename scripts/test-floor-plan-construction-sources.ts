import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { compileFloorPlanDocumentV2 } from "@/lib/floor-plan-compiler-v2";
import {
  assertFloorPlanConstructionSourceFormat,
  attachFloorPlanConstructionSource,
  FloorPlanConstructionSourceError,
  parseAttachedFloorPlanConstructionSources,
  removeFloorPlanConstructionSource,
} from "@/lib/floor-plan-imports/construction-sources";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";

const bundle = loadPingYiCourtV2ReviewSeedBundle();
const fixture = bundle.fixtures.find((entry) => entry.layoutId === "3gen");
assert.ok(fixture);
const document = structuredClone(fixture.document);
const primary = document.sources[0];
assert.ok(primary);
const geometryBefore = compileFloorPlanDocumentV2(document).geometryHash;
const sourceAsset = {
  id: "unit-as-built-source",
  fileName: "signed-unit-as-built.pdf",
  mimeType: "application/pdf",
  sha256: "a".repeat(64),
};

const attached = attachFloorPlanConstructionSource({
  document,
  primarySourceId: primary.id,
  evidenceKind: "as_built",
  sourceAsset,
});
assert.equal(
  attached.sources.find((source) => source.id === sourceAsset.id)?.kind,
  "as_built"
);
assert.equal(
  compileFloorPlanDocumentV2(attached).geometryHash,
  geometryBefore,
  "Authorizing evidence must not alter canonical geometry."
);
const removed = removeFloorPlanConstructionSource({
  document: attached,
  primarySourceId: primary.id,
  sourceAssetId: sourceAsset.id,
});
assert.equal(removed.sources.some((source) => source.id === sourceAsset.id), false);
assert.equal(compileFloorPlanDocumentV2(removed).geometryHash, geometryBefore);

const referenced = structuredClone(attached);
referenced.floors[0].vertices[0].provenance.evidence.push({
  sourceId: sourceAsset.id,
  basis: "as_built",
  confidence: 1,
  extractorVersion: "construction-source-test-v1",
  note: "Reviewed unit-specific coordinate.",
});
assert.throws(
  () =>
    removeFloorPlanConstructionSource({
      document: referenced,
      primarySourceId: primary.id,
      sourceAssetId: sourceAsset.id,
    }),
  (cause) =>
    cause instanceof FloorPlanConstructionSourceError &&
    cause.code === "SOURCE_REFERENCED"
);

assert.throws(
  () => assertFloorPlanConstructionSourceFormat("unit_cad", "application/pdf"),
  /unit CAD evidence must be DXF, DWG, IFC, or STEP/
);
assert.throws(
  () => assertFloorPlanConstructionSourceFormat("site_measurement", "application/dxf"),
  /signed PDF or image report/
);
assert.doesNotThrow(() =>
  assertFloorPlanConstructionSourceFormat("as_built", "application/pdf")
);

const persistedRow = {
  evidenceKind: "as_built",
  authorizedAt: "2026-07-17T00:00:00.000Z",
  authorizedByEmail: "reviewer@example.com",
  attachedToCandidateAt: "2026-07-17T00:00:00.000Z",
  sourceAsset: { ...sourceAsset, contentDeletedAt: null },
};
assert.deepEqual(
  parseAttachedFloorPlanConstructionSources([persistedRow]).map((entry) => ({
    id: entry.sourceAsset.id,
    actor: entry.authorizedByEmail,
  })),
  [{ id: sourceAsset.id, actor: "reviewer@example.com" }]
);
assert.throws(
  () =>
    parseAttachedFloorPlanConstructionSources([
      { ...persistedRow, authorizedByEmail: "   " },
    ]),
  /UNAUTHORIZED/,
  "A timestamp without an authorizing admin identity must fail closed."
);
assert.throws(
  () =>
    parseAttachedFloorPlanConstructionSources([
      {
        ...persistedRow,
        sourceAsset: {
          ...persistedRow.sourceAsset,
          contentDeletedAt: "2026-07-17T01:00:00.000Z",
        },
      },
    ]),
  /SOURCE_DELETED/
);
assert.throws(
  () =>
    parseAttachedFloorPlanConstructionSources([
      { ...persistedRow, evidenceKind: "address_binding_evidence" },
    ]),
  /INVALID_ROLE/
);

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

const uploadRoute = source(
  "app/api/admin/floor-plan-imports/[id]/construction-sources/route.ts"
);
assert.match(uploadRoute, /canAccessAdmin/);
assert.match(uploadRoute, /readBoundedRequestBody/);
assert.match(uploadRoute, /hasExpectedFloorPlanSignature/);
assert.match(uploadRoute, /candidateVersion/);
assert.match(uploadRoute, /preparedSource\.persist\(transaction\)/);
assert.match(uploadRoute, /preparedSource\.finalize\(\)/);
assert.match(uploadRoute, /preparedSource\.rollback\(cause\)/);
assert.match(uploadRoute, /authorizedByEmail/);
assert.match(uploadRoute, /revision: \{ is: null \}/);

const removalRoute = source(
  "app/api/admin/floor-plan-imports/[id]/construction-sources/[sourceId]/route.ts"
);
assert.match(removalRoute, /candidateVersion/);
assert.match(removalRoute, /removeFloorPlanConstructionSource/);
assert.match(removalRoute, /enqueueFloorPlanExternalDeletion/);
assert.match(removalRoute, /constructionUses: \{ none: \{\} \}/);

const assetRoute = source(
  "app/api/admin/floor-plan-imports/[id]/assets/[assetId]/route.ts"
);
assert.match(assetRoute, /floorPlanConstructionSource\.findFirst/);
assert.match(assetRoute, /jobId: id, sourceAssetId: assetId/);

for (const route of [
  "app/api/admin/floor-plan-imports/[id]/approve/route.ts",
  "app/api/admin/floor-plan-imports/[id]/publish/route.ts",
]) {
  const contents = source(route);
  assert.match(contents, /parseAttachedFloorPlanConstructionSources/);
  assert.match(contents, /durableSources: constructionSources\.map/);
  assert.doesNotMatch(
    contents,
    /durableSources:\s*\[\s*job\.sourceAsset/,
    "Primary extraction sources must not unlock construction verification."
  );
}

const serving = source("lib/floor-plan-imports/serving-integrity.ts");
assert.match(serving, /construction_sources_invalid/);
assert.match(serving, /durableSources: constructionSources\.map/);

const reviewModel = source(
  "app/admin/floor-plans/[id]/floorPlanReviewModel.ts"
);
assert.match(reviewModel, /confirmedEntityIds: \[\]/);
assert.doesNotMatch(reviewModel, /confirmedEntityIds,\s*\n/);

const retention = source("lib/floor-plan-imports/retention.ts");
assert.match(retention, /floorPlanConstructionSource\.findMany/);
assert.match(retention, /constructionUses/);
assert.match(retention, /constructionSources:/);

const roleMigration = source(
  "prisma/migrations/20260717063000_add_floor_plan_construction_sources/migration.sql"
);
assert.match(roleMigration, /FloorPlanConstructionSource_evidenceKind_check/);
assert.match(roleMigration, /FloorPlanConstructionSource_immutability_guard/);
const actorMigration = source(
  "prisma/migrations/20260717064500_require_floor_plan_construction_source_authorizer/migration.sql"
);
assert.match(actorMigration, /authorizedByEmail_check/);
assert.match(actorMigration, /NOT VALID/);
const cleanupMigration = source(
  "prisma/migrations/20260717070000_preserve_external_construction_source_cleanup/migration.sql"
);
assert.match(cleanupMigration, /deletion request/);

console.log("Floor-plan construction source lifecycle tests passed.");
