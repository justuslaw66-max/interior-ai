import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertFloorPlanAddressBindingMutationAllowed,
  buildFloorPlanRevisionAuditRecord,
  snapshotFloorPlanAddressBindings,
} from "@/lib/floor-plan-imports/revision-audit";
import { assertFloorPlanRevisionMutationAllowed } from "@/lib/floor-plan-imports/revision-immutability";

const bindings = [
  {
    id: "binding-b",
    countryCode: "sg",
    addressNormalized: "811B Chai Chee St",
    block: "811B",
    street: "Chai Chee St",
    postalCode: null,
    stack: "559",
    floorMin: 2,
    floorMax: 15,
    transform: "mirror_x",
    sourceEvidenceJson: { sourcePage: 8, evidenceType: "source_observed" },
  },
  {
    id: "binding-a",
    countryCode: "SG",
    addressNormalized: "810A Chai Chee St",
    block: "810A",
    street: "Chai Chee St",
    stack: "509",
    floorMin: 2,
    floorMax: 15,
    transform: "normal",
    sourceEvidence: { sourcePage: 7, evidenceType: "source_observed" },
  },
] as const;

const snapshot = snapshotFloorPlanAddressBindings(bindings);
assert.deepEqual(
  snapshot.map((binding) => binding.id),
  ["binding-a", "binding-b"],
  "audit snapshots must be deterministically ordered"
);
assert.equal(snapshot[0].countryCode, "SG");
assert.deepEqual(snapshot[0].sourceEvidence, {
  sourcePage: 7,
  evidenceType: "source_observed",
});

const occurredAt = new Date("2026-07-16T09:00:00.000Z");
const approvalAudit = buildFloorPlanRevisionAuditRecord({
  eventType: "revision_approved",
  revisionId: "revision-1",
  sourceJobId: "job-1",
  actorEmail: " reviewer@example.com ",
  occurredAt,
  previousStatus: null,
  nextStatus: "approved",
  geometryHash: "a".repeat(64),
  sourceManifest: { inventory: ["wall-1", "opening-1"] },
  sourceAsset: {
    id: "source-1",
    sha256: "b".repeat(64),
    mimeType: "application/pdf",
    fileName: "source.pdf",
  },
  addressBindings: bindings,
  candidateVersion: 4,
});
assert.equal(approvalAudit.actorEmail, "reviewer@example.com");
assert.equal(approvalAudit.occurredAt, occurredAt);
assert.equal(approvalAudit.sourceEvidence.sourceManifestHash.length, 64);
assert.equal(approvalAudit.sourceEvidence.addressBindings.length, 2);
assert.deepEqual(approvalAudit.metadata, {
  previousStatus: null,
  nextStatus: "approved",
  geometryHash: "a".repeat(64),
  candidateVersion: 4,
  addressBindingCount: 2,
});

assert.doesNotThrow(() =>
  assertFloorPlanAddressBindingMutationAllowed("draft", "update")
);
for (const status of ["approved", "published", "retired"] as const) {
  assert.throws(
    () => assertFloorPlanAddressBindingMutationAllowed(status, "delete"),
    /FLOOR_PLAN_ADDRESS_BINDING_IMMUTABLE:.*new revision/
  );
}

const approvedAt = new Date("2026-07-16T09:00:00.000Z");
assert.throws(
  () =>
    assertFloorPlanRevisionMutationAllowed(
      {
        publicationStatus: "approved",
        approvedAt,
        approvedByEmail: "reviewer@example.com",
      },
      { approvedByEmail: "other@example.com" }
    ),
  /approvedByEmail cannot change/
);
assert.throws(
  () =>
    assertFloorPlanRevisionMutationAllowed(
      { id: "revision-1", publicationStatus: "approved" },
      { id: "revision-2" }
    ),
  /id cannot change after approval/
);
assert.doesNotThrow(() =>
  assertFloorPlanRevisionMutationAllowed(
    {
      publicationStatus: "approved",
      approvedAt,
      approvedByEmail: "reviewer@example.com",
    },
    {
      publicationStatus: "published",
      publishedAt: new Date("2026-07-16T10:00:00.000Z"),
      publishedByEmail: "publisher@example.com",
    }
  )
);
assert.throws(
  () =>
    assertFloorPlanRevisionMutationAllowed(
      {
        publicationStatus: "published",
        publishedAt: new Date("2026-07-16T10:00:00.000Z"),
        publishedByEmail: "publisher@example.com",
      },
      { publishedAt: new Date("2026-07-16T11:00:00.000Z") }
    ),
  /publishedAt cannot change/
);

const migrationPath = path.join(
  process.cwd(),
  "prisma/migrations/20260716181500_audit_floor_plan_address_bindings/migration.sql"
);
const migration = fs.readFileSync(migrationPath, "utf8");
assert.match(migration, /CREATE TABLE "FloorPlanRevisionAuditEvent"/);
assert.match(migration, /FloorPlanRevisionAuditEvent_append_only_guard/);
assert.match(migration, /FloorPlanAddressBinding_immutability_guard/);
assert.match(migration, /FLOOR_PLAN_ADDRESS_BINDING_IMMUTABLE: create a new revision/);
assert.match(migration, /FloorPlanRevision_audit_required_guard/);
assert.match(migration, /DEFERRABLE INITIALLY DEFERRED/);
assert.match(migration, /ON DELETE RESTRICT ON UPDATE CASCADE/);
assert.match(migration, /WHERE revision\."publicationStatus" IN \('approved', 'published', 'retired'\)/);

for (const routePath of [
  "app/api/admin/floor-plan-imports/[id]/approve/route.ts",
  "app/api/admin/floor-plan-imports/[id]/publish/route.ts",
]) {
  const route = fs.readFileSync(path.join(process.cwd(), routePath), "utf8");
  assert.match(route, /\$transaction\(async \(tx\) =>/);
  assert.match(route, /tx\.floorPlanRevisionAuditEvent\.create/);
  assert.match(route, /buildFloorPlanRevisionAuditRecord/);
}

const adminDetailRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/floor-plan-imports/[id]/route.ts"),
  "utf8"
);
assert.match(adminDetailRoute, /auditEvents: \{ orderBy:/);

console.log("Floor-plan address binding audit tests passed.");
