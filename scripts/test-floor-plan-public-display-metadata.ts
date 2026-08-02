import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertFloorPlanPublicMetadataApprovalIntegrity,
  floorPlanPublicDisplayMetadataSchema,
  projectFloorPlanPublicDisplayMetadata,
} from "@/lib/floor-plan-imports/public-display-metadata";

const valid = {
  projectName: "Ping Yi Court",
  label: "4-room Type A",
  flatType: "4-room",
  floorAreaSqm: 93.25,
  previewUrl: "/floor-plan-previews/ping-yi-4-room.webp",
  sourceUrl: "https://www.hdb.gov.sg/residential/example",
  sourceTitle: "Ping Yi Court sales brochure",
  sourcePage: 5,
  publisher: "Housing and Development Board",
};

assert.deepEqual(floorPlanPublicDisplayMetadataSchema.parse(valid), valid);
assert.doesNotThrow(() => floorPlanPublicDisplayMetadataSchema.parse({
  ...valid,
  previewUrl: "https://cdn.example.com/previews/revision.webp",
}));
for (const previewUrl of [
  "http://cdn.example.com/plan.png",
  "https://localhost/plan.png",
  "https://127.0.0.1/plan.png",
  "https://192.168.1.10/plan.png",
  "//private.example/plan.png",
  "data:image/png;base64,AA==",
]) {
  assert.throws(
    () => floorPlanPublicDisplayMetadataSchema.parse({ ...valid, previewUrl }),
    /Preview URL/
  );
}
assert.throws(
  () => floorPlanPublicDisplayMetadataSchema.parse({
    ...valid,
    sourceUrl: "https://10.0.0.2/source.pdf",
  }),
  /Source URL/
);
assert.throws(
  () => floorPlanPublicDisplayMetadataSchema.parse({
    ...valid,
    sourceTitle: null,
  }),
  /supplied together/
);
assert.throws(
  () => floorPlanPublicDisplayMetadataSchema.parse({
    ...valid,
    floorAreaSqm: 93.257,
  })
);
assert.throws(
  () => floorPlanPublicDisplayMetadataSchema.parse({
    ...valid,
    uploadFileName: "private-home.pdf",
    reviewerNotes: "private homeowner note",
  }),
  /Unrecognized key/
);

const persisted = {
  ...valid,
  approvedAt: new Date("2030-01-01T00:00:00.000Z"),
  approvedByEmail: "reviewer@example.com",
};
assert.deepEqual(projectFloorPlanPublicDisplayMetadata(persisted), valid);
assert.deepEqual(
  assertFloorPlanPublicMetadataApprovalIntegrity({
    metadata: persisted,
    revisionApprovedAt: "2030-01-01T00:00:00.000Z",
    revisionApprovedByEmail: "REVIEWER@example.com",
  }),
  valid
);
assert.throws(
  () => assertFloorPlanPublicMetadataApprovalIntegrity({
    metadata: persisted,
    revisionApprovedAt: "2030-01-01T00:00:00.000Z",
    revisionApprovedByEmail: "different-reviewer@example.com",
  }),
  /REVIEW_MISMATCH/
);
assert.throws(
  () => assertFloorPlanPublicMetadataApprovalIntegrity({
    metadata: null,
    revisionApprovedAt: "2030-01-01T00:00:00.000Z",
    revisionApprovedByEmail: "reviewer@example.com",
  }),
  /PUBLIC_METADATA_REQUIRED/
);

const migration = fs.readFileSync(
  path.join(
    process.cwd(),
    "prisma/migrations/20260717073000_add_floor_plan_public_display_metadata/migration.sql"
  ),
  "utf8"
);
assert.match(migration, /CREATE TABLE "FloorPlanRevisionPublicMetadata"/);
assert.match(migration, /FloorPlanRevisionPublicMetadata_immutability_guard/);
assert.match(migration, /FloorPlanRevision_public_metadata_required_guard/);
assert.match(migration, /FLOOR_PLAN_PUBLIC_METADATA_REQUIRED/);
assert.match(migration, /FLOOR_PLAN_PUBLIC_METADATA_REVIEW_MISMATCH/);

const approvalRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/floor-plan-imports/[id]/approve/route.ts"),
  "utf8"
);
assert.match(approvalRoute, /floorPlanPublicDisplayMetadataSchema\.parse/);
assert.match(approvalRoute, /publicMetadata:\s*\{\s*create:/);
assert.match(approvalRoute, /projectFloorPlanPublicDisplayMetadata/);

const publishRoute = fs.readFileSync(
  path.join(process.cwd(), "app/api/admin/floor-plan-imports/[id]/publish/route.ts"),
  "utf8"
);
assert.match(publishRoute, /assertFloorPlanPublicMetadataApprovalIntegrity/);
assert.match(publishRoute, /publicMetadata:\s*true/);

const repository = fs.readFileSync(
  path.join(process.cwd(), "lib/floor-plan-catalog-repository.ts"),
  "utf8"
);
assert.match(repository, /revision\.publicMetadata/);
assert.match(repository, /extractPublicRoomMetadata\(revision\.documentJson\)/);
assert.doesNotMatch(repository, /extractRevisionDisplayMetadata/);
assert.doesNotMatch(repository, /reviewerMetadata\.display/);

console.log("Floor-plan public display metadata checks passed.");
