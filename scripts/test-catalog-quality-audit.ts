import { getRelativeCatalogPath, runCatalogQualityAudit } from "../lib/catalog-audit";

function main() {
  const result = runCatalogQualityAudit();

  console.log("Catalog quality audit summary");
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

  console.log("\nCatalog quality audit passed");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}