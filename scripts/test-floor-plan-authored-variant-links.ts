import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  parseFloorPlanAuthoredVariantApprovalRequest,
  projectPublicFloorPlanAuthoredVariantGroups,
  validateFloorPlanAuthoredVariantApproval,
  type FloorPlanAuthoredVariantApprovalRequest,
  type FloorPlanAuthoredVariantRevisionSnapshot,
  type PersistedFloorPlanAuthoredVariantGroup,
} from "@/lib/floor-plan-authored-variant-links";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";
import {
  findFloorPlanAddressBindingConflicts,
} from "@/lib/floor-plan-imports/address-binding-conflicts";

const bundle = loadPingYiCourtV2ReviewSeedBundle();
const seedGroup = bundle.configurationGroups[0];
assert.ok(seedGroup);

const request = parseFloorPlanAuthoredVariantApprovalRequest({
  groupId: seedGroup.groupId,
  label: seedGroup.label,
  variants: seedGroup.variants.map((variant, index) => ({
    optionId: variant.optionId,
    label: variant.label,
    revisionId: variant.artifact.revisionId,
    addressBindingId: `binding-${index + 1}`,
    geometryHash: variant.artifact.geometryHash,
    sourceId: variant.artifact.sourceId,
    pageNumber: variant.artifact.pageNumber,
    defaultSelected: variant.defaultSelected,
  })),
});

function snapshots(
  approval: FloorPlanAuthoredVariantApprovalRequest
): FloorPlanAuthoredVariantRevisionSnapshot[] {
  return approval.variants.map((variant, index) => {
    const fixture = bundle.fixtures.find(
      (entry) => entry.document.revisionId === variant.revisionId
    );
    assert.ok(fixture);
    return {
      id: variant.revisionId,
      geometryHash: variant.geometryHash,
      verificationTier: "source_verified",
      publicationStatus: "published",
      publishedAt: new Date("2026-07-17T00:00:00.000Z"),
      document: fixture.document,
      servingIntegrityValid: true,
      addressBinding: {
        id: variant.addressBindingId,
        revisionId: variant.revisionId,
        countryCode: "SG",
        addressNormalized: "810a chai chee street",
        block: "810A",
        street: "Chai Chee Street",
        postalCode: "461810",
        stack: "509",
        floorMin: 2,
        floorMax: 15,
        transform: index === 0 ? "normal" : "mirror_x",
        role: variant.defaultSelected ? "catalog" : "authored_variant",
      },
    };
  });
}

assert.equal(
  validateFloorPlanAuthoredVariantApproval({ request, revisions: snapshots(request) }).groupId,
  request.groupId
);

const corruptIntegrity = snapshots(request);
corruptIntegrity[1].servingIntegrityValid = false;
assert.throws(
  () => validateFloorPlanAuthoredVariantApproval({ request, revisions: corruptIntegrity }),
  /serving-integrity-valid publication/
);
const wrongUnit = snapshots(request);
wrongUnit[1].addressBinding.stack = "527";
assert.throws(
  () => validateFloorPlanAuthoredVariantApproval({ request, revisions: wrongUnit }),
  /same address, stack and floor range/
);
const wrongRole = snapshots(request);
wrongRole[1].addressBinding.role = "catalog";
assert.throws(
  () => validateFloorPlanAuthoredVariantApproval({ request, revisions: wrongRole }),
  /non-searchable authored-variant bindings/
);

const overlappingCatalog = snapshots(request)[0].addressBinding;
const overlappingVariant = snapshots(request)[1].addressBinding;
assert.equal(
  findFloorPlanAddressBindingConflicts({
    incoming: [{ ...overlappingVariant, role: "authored_variant" }],
    existing: [{ ...overlappingCatalog, role: "catalog" }],
  }).length,
  0,
  "a non-searchable authored variant must be publishable beside its catalog default"
);
assert.equal(
  findFloorPlanAddressBindingConflicts({
    incoming: [{ ...overlappingVariant, role: "catalog" }],
    existing: [{ ...overlappingCatalog, role: "catalog" }],
  }).length,
  1,
  "two searchable catalog bindings must still conflict"
);

const persisted: PersistedFloorPlanAuthoredVariantGroup = {
  groupKey: request.groupId,
  label: request.label,
  publicationStatus: "published",
  approvedByEmail: "reviewer@example.com",
  publishedAt: new Date("2026-07-17T01:00:00.000Z"),
  publishedByEmail: "publisher@example.com",
  options: request.variants.map((variant, index) => ({
    optionKey: variant.optionId,
    label: variant.label,
    revisionId: variant.revisionId,
    addressBindingId: variant.addressBindingId,
    geometryHash: variant.geometryHash,
    sourceId: variant.sourceId,
    sourcePage: variant.pageNumber ?? null,
    defaultSelected: variant.defaultSelected,
    sourceEvidenceJson: {
      basis: "direct_source_configuration",
      sourceId: variant.sourceId,
      pageNumber: variant.pageNumber ?? null,
      revisionId: variant.revisionId,
      geometryHash: variant.geometryHash,
    },
    revision: {
      id: variant.revisionId,
      geometryHash: variant.geometryHash,
      verificationTier: "source_verified",
      publicationStatus: "published",
      publishedAt: new Date("2026-07-17T00:00:00.000Z"),
    },
    addressBinding: {
      id: variant.addressBindingId,
      revisionId: variant.revisionId,
      transform: index === 0 ? "normal" : "mirror_x",
      role: variant.defaultSelected ? "catalog" : "authored_variant",
    },
  })),
};
const publicGroups = projectPublicFloorPlanAuthoredVariantGroups(
  [persisted],
  request.variants[0].revisionId
);
assert.equal(publicGroups.length, 1);
assert.equal(publicGroups[0].options.length, 2);
assert.equal(publicGroups[0].defaultOptionId, request.variants[0].optionId);
const publicJson = JSON.stringify(publicGroups);
assert.doesNotMatch(publicJson, /sourceId|sourceEvidenceJson|approvedByEmail|publishedByEmail/);
assert.match(publicJson, /sourcePage/);
assert.equal(
  projectPublicFloorPlanAuthoredVariantGroups(
    [persisted],
    request.variants[0].revisionId,
    "another-unit-binding"
  ).length,
  0,
  "a variant group must not leak onto another address binding for the same revision"
);

assert.equal(
  projectPublicFloorPlanAuthoredVariantGroups(
    [{ ...persisted, publishedByEmail: persisted.approvedByEmail }],
    request.variants[0].revisionId
  ).length,
  0,
  "maker-checker failure must remove the group from the public projection"
);
const retired = structuredClone(persisted);
retired.options[1].revision.publicationStatus = "retired";
assert.equal(
  projectPublicFloorPlanAuthoredVariantGroups([retired], request.variants[0].revisionId).length,
  0,
  "a retired alternate revision must fail closed"
);

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260717043000_add_floor_plan_authored_variant_links/migration.sql"
  ),
  "utf8"
);
assert.match(migration, /one_default_per_group/);
assert.match(migration, /authored variant groups are immutable/i);
const lifecycleMigration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260717050000_fix_floor_plan_authored_variant_lifecycle/migration.sql"
  ),
  "utf8"
);
assert.match(lifecycleMigration, /FloorPlanAddressBindingRole/);
assert.match(lifecycleMigration, /BEFORE INSERT OR UPDATE OR DELETE/);
assert.match(lifecycleMigration, /publicationStatus" = 'draft'/);
assert.match(lifecycleMigration, /publicationStatus" = 'retired'/);
assert.match(lifecycleMigration, /defaultSelected" AND binding\."role" <> 'catalog'/);
assert.match(lifecycleMigration, /NOT option\."defaultSelected" AND binding\."role" <> 'authored_variant'/);

const addressSearch = fs.readFileSync(
  path.join(process.cwd(), "components/editor/FloorPlanAddressSearch.tsx"),
  "utf8"
);
assert.match(addressSearch, /buildCanonicalFloorPlanTemplateForAuthoredVariant/);
assert.match(addressSearch, /onChoosePublicVariant/);
assert.match(addressSearch, /startAsNewDesign: pendingApplication\.startAsNewDesign/);
assert.doesNotMatch(addressSearch, /cannot be switched here/);

const adminCreateRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/floor-plan-variant-groups/route.ts"),
  "utf8"
);
assert.match(adminCreateRoute, /publicationStatus: "draft"/);
assert.match(adminCreateRoute, /floorPlanAuthoredVariantOption\.createMany/);
assert.match(adminCreateRoute, /publicationStatus: "approved"/);
const adminLifecycleRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/floor-plan-variant-groups/[id]/route.ts"),
  "utf8"
);
assert.match(adminLifecycleRoute, /export async function DELETE/);
assert.match(adminLifecycleRoute, /publicationStatus: "retired"/);
const publicRevisionRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/floor-plans/revisions/[id]/route.ts"),
  "utf8"
);
assert.match(publicRevisionRoute, /Variant-only revision has no published authored relationship/);

console.log("Published floor-plan authored variant link checks passed.");
