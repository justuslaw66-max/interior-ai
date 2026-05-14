import { CATALOG_ITEMS_MAP } from "../lib/catalog";
import { runVariantResolutionAudit, type VariantAuditIssue } from "../lib/catalog/variant-audit";

function printIssues(title: string, issues: VariantAuditIssue[], limit = 30) {
  if (issues.length === 0) return;
  console.log(`\n${title} (${issues.length})`);
  for (const issue of issues.slice(0, limit)) {
    console.log(`- ${issue.catalogItemId}/${issue.variantId}: ${issue.issue}`);
  }
  if (issues.length > limit) {
    console.log(`- ... ${issues.length - limit} more`);
  }
}

function main() {
  const scanItems = Array.from(CATALOG_ITEMS_MAP.values());
  if (scanItems.length === 0) {
    throw new Error("Catalog media health audit found no catalog items to scan");
  }

  const qualityTargetIds = new Set(
    scanItems
      .filter((item) => /sofa|sectional|recliner|armchair|ottoman/i.test(`${item.id} ${item.title}`))
      .map((item) => item.id)
  );

  const audit = runVariantResolutionAudit(scanItems);

  console.log("Catalog media health summary");
  console.log(`- items scanned: ${audit.itemsScanned}`);
  console.log(`- variants scanned: ${audit.variantsScanned}`);
  console.log(`- seating-like targets: ${qualityTargetIds.size}`);
  console.log(`- parity mismatches: ${audit.mediaParityMismatches.length}`);
  console.log(`- low-quality media: ${audit.lowQualityMedia.length}`);
  console.log(`- duplicate variant media: ${audit.duplicateVariantMedia.length}`);
  console.log(`- invalid media URLs: ${audit.invalidMediaUrls.length}`);
  console.log(`- missing media: ${audit.missingMedia.length}`);

  const blockingParity = audit.mediaParityMismatches.filter((issue) => qualityTargetIds.has(issue.catalogItemId));
  const blockingInvalid = audit.invalidMediaUrls;
  const blockingMissing = audit.missingMedia;
  const blockingQuality = audit.lowQualityMedia.filter((issue) => qualityTargetIds.has(issue.catalogItemId));

  printIssues("Parity mismatches", blockingParity);
  printIssues("Low-quality media", blockingQuality);
  printIssues("Invalid media URLs", blockingInvalid);
  printIssues("Missing media", blockingMissing);

  const hasBlockingIssues =
    blockingParity.length > 0 ||
    blockingInvalid.length > 0 ||
    blockingMissing.length > 0;

  if (hasBlockingIssues) {
    throw new Error("Catalog media health audit failed");
  }

  console.log("\nCatalog media health audit passed");
}

try {
  main();
} catch (error) {
  console.error(error);
  process.exit(1);
}
