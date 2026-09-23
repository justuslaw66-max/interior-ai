import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { getRelativeCatalogPath, runCatalogQualityAudit } from "../lib/catalog-audit";

function assertHamiltonControlledVocabularyBoundary() {
  const sourcePath = join(
    process.cwd(),
    "catalog/furniture/sofas/hamilton_chaise_sectional_sofa_bed_left/catalog.yaml",
  );
  const source = readFileSync(sourcePath, "utf8");
  const tempRoot = mkdtempSync(join(tmpdir(), "hamilton-catalog-vocabulary-"));
  const fixturePath = join(tempRoot, "catalog.yaml");

  try {
    writeFileSync(fixturePath, source);
    assert.equal(
      runCatalogQualityAudit(tempRoot).failureCount,
      0,
      "bedroom must be accepted while the independent spatial footprint remains unrejected",
    );

    const guestRoomFixture = source.replace(
      'room_compatibility: ["living_room", "family_room", "open_plan", "bedroom"]',
      'room_compatibility: ["living_room", "family_room", "open_plan", "guest_room"]',
    );
    assert.notEqual(guestRoomFixture, source, "Hamilton bedroom fixture must be mutable");
    writeFileSync(fixturePath, guestRoomFixture);
    assert.deepEqual(
      runCatalogQualityAudit(tempRoot).audits[0]?.failures,
      ['room_compatibility[3] has invalid value "guest_room".'],
      "guest_room must remain rejected at the controlled room boundary",
    );

    const topLevelShapeFixture = source.replace(
      /^shape: "rectangular"$/m,
      'shape: "l_shaped"',
    );
    assert.notEqual(topLevelShapeFixture, source, "Hamilton shape fixture must be mutable");
    writeFileSync(fixturePath, topLevelShapeFixture);
    assert.deepEqual(
      runCatalogQualityAudit(tempRoot).audits[0]?.failures,
      ['shape has invalid value "l_shaped".'],
      "top-level l_shaped must remain rejected independently of the spatial footprint",
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function main() {
  const strict = process.env.CATALOG_STRICT_VALIDATION === "true";
  const result = runCatalogQualityAudit();

  console.log("Catalog quality audit summary");
  console.log(`- mode: ${strict ? "strict" : "standard"}`);
  console.log(`- files scanned: ${result.files.length}`);
  console.log(`- files with failures: ${result.failingFiles.length}`);
  console.log(`- files with warnings: ${result.warningFiles.length}`);
  console.log(`- total failures: ${result.failureCount}`);
  console.log(`- total warnings: ${result.warningCount}`);
  console.log(`- duplicate asset ids: ${result.duplicates.size}`);

  if (result.duplicates.size > 0) {
    console.log("\nDuplicate asset ids:");
    for (const [assetId, origins] of result.duplicates.entries()) {
      console.log(`- ${assetId}`);
      origins.forEach((origin) => console.log(`  - ${getRelativeCatalogPath(origin)}`));
    }
  }

  for (const audit of result.audits) {
    if (audit.failures.length === 0 && audit.warnings.length === 0) continue;
    console.log(`\n${getRelativeCatalogPath(audit.filePath)}`);
    audit.failures.forEach((entry) => console.log(`  FAIL: ${entry}`));
    audit.warnings.forEach((entry) => console.log(`  WARN: ${entry}`));
  }

  if (result.hasFailures) {
    throw new Error("Catalog quality audit failed");
  }

  if (strict && result.warningCount > 0) {
    throw new Error("Strict catalog quality audit failed: warnings are beta blockers");
  }

  assertHamiltonControlledVocabularyBoundary();

  console.log("\nCatalog quality audit passed");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
