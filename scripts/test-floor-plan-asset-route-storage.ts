import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

const consumerRoute = read(
  "app/api/floor-plan-imports/[id]/assets/[assetId]/route.ts"
);
const adminRoute = read(
  "app/api/admin/floor-plan-imports/[id]/assets/[assetId]/route.ts"
);
const retryRoute = read("app/api/floor-plan-imports/[id]/retry/route.ts");

assert.ok(
  consumerRoute.indexOf("const session = await auth()") <
    consumerRoute.indexOf("floorPlanDerivedAsset.findFirst") &&
    consumerRoute.indexOf("floorPlanDerivedAsset.findFirst") <
      consumerRoute.indexOf(".readDerivative(assetId)"),
  "consumer previews must authorize the owning user and job before reading private bytes"
);
assert.match(
  consumerRoute,
  /id:\s*assetId,[\s\S]*?jobId:\s*id,[\s\S]*?contentDeletedAt:\s*null,[\s\S]*?job:\s*\{\s*userId:\s*session\.user\.id\s*\}/
);
assert.match(
  consumerRoute,
  /new PrismaFloorPlanSourceStore\(\)\.readDerivative\(assetId\)/
);
assert.match(consumerRoute, /cause instanceof FloorPlanObjectStorageError/);
assert.match(consumerRoute, /status:\s*503/);
assert.doesNotMatch(consumerRoute, /externalUrl/);
assert.doesNotMatch(consumerRoute, /\bfetch\s*\(/);
assert.doesNotMatch(consumerRoute, /NextResponse\.redirect/);

assert.ok(
  adminRoute.indexOf("canAccessAdmin") <
    adminRoute.indexOf("floorPlanImportJob.findUnique") &&
    adminRoute.indexOf("floorPlanImportJob.findUnique") <
      adminRoute.indexOf('kind: "source", assetId: job.sourceAsset.id'),
  "admin source downloads must authorize before resolving private source bytes"
);
assert.match(adminRoute, /jobId:\s*id,\s*sourceAssetId:\s*assetId/);
assert.match(
  adminRoute,
  /floorPlanDerivedAsset\.findFirst\([\s\S]*?id:\s*assetId,\s*jobId:\s*id,\s*contentDeletedAt:\s*null/
);
assert.match(adminRoute, /store\.readSource\(input\.assetId\)/);
assert.match(adminRoute, /store\.readDerivative\(input\.assetId\)/);
assert.match(adminRoute, /cause instanceof FloorPlanObjectStorageError/);
assert.doesNotMatch(adminRoute, /externalUrl/);
assert.doesNotMatch(adminRoute, /\bfetch\s*\(/);
assert.doesNotMatch(adminRoute, /NextResponse\.redirect/);

assert.match(
  retryRoute,
  /sourceAsset:\s*\{[\s\S]*?contentDeletedAt:\s*null,[\s\S]*?bytes:\s*\{\s*not:\s*null\s*\}[\s\S]*?storageProvider:\s*"external"/
);
assert.match(
  retryRoute,
  /sourceAsset:\s*\{[\s\S]*?select:\s*\{[\s\S]*?storageProvider:\s*true,[\s\S]*?storageKey:\s*true/
);
assert.ok(
  retryRoute.indexOf("id,\n      userId") < retryRoute.indexOf(".readSource(") &&
    retryRoute.indexOf(".readSource(") < retryRoute.indexOf("repository.create"),
  "retry must authorize ownership and verify stored source bytes before creating a new job"
);
assert.match(retryRoute, /cause instanceof FloorPlanObjectStorageError/);
assert.match(retryRoute, /temporarily unavailable; retry later",\s*503/);
assert.doesNotMatch(retryRoute, /externalUrl/);

console.log("floor-plan private asset route storage tests passed");
