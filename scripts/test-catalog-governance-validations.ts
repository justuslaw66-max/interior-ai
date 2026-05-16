import { prisma } from "../lib/prisma";
import { getRelativeCatalogPath, runCatalogGovernanceAudit } from "../lib/catalog-audit";

async function run(): Promise<void> {
  const result = await runCatalogGovernanceAudit();

  console.log("Catalog governance validation summary");
  console.log(`- approved assets: ${result.approvedAssets.length}`);
  console.log(`- approved imported assets: ${result.approvedImportedAssets.length}`);
  console.log(`- catalog asset IDs: ${result.catalogIds.size}`);
  console.log(`- missing catalog mappings: ${result.missingCatalog.length}`);
  console.log(`- duplicate catalog asset IDs: ${result.duplicateIds.size}`);
  console.log(`- parse-error catalog files: ${result.parseErrorFiles.length}`);
  console.log(`- catalog files missing assets.asset_id (warning): ${result.missingAssetIdFiles.length}`);
  console.log(`- orphan catalog asset IDs (warning): ${result.orphanCatalogIds.length}`);

  if (result.missingCatalog.length > 0) {
    console.log("\nMissing catalog entries for approved imported assets:");
    for (const asset of result.missingCatalog) {
      console.log(`  - ${asset.id}`);
    }
  }

  if (result.duplicateIds.size > 0) {
    console.log("\nDuplicate catalog asset_id values:");
    for (const [assetId, files] of result.duplicateIds.entries()) {
      console.log(`  - ${assetId}`);
      for (const filePath of files) {
        console.log(`    - ${getRelativeCatalogPath(filePath)}`);
      }
    }
  }

  if (result.parseErrorFiles.length > 0) {
    console.log("\nCatalog files with YAML parse errors:");
    for (const filePath of result.parseErrorFiles) {
      console.log(`  - ${getRelativeCatalogPath(filePath)}`);
    }
  }

  if (result.missingAssetIdFiles.length > 0) {
    console.log("\nWarning: catalog files missing top-level assets.asset_id:");
    for (const filePath of result.missingAssetIdFiles) {
      console.log(`  - ${getRelativeCatalogPath(filePath)}`);
    }
  }

  if (result.orphanCatalogIds.length > 0) {
    console.log("\nWarning: catalog asset_id values without approved ModelAsset rows:");
    for (const assetId of result.orphanCatalogIds) {
      console.log(`  - ${assetId}`);
    }
  }

  await prisma.$disconnect();

  if (result.hasFailures) {
    process.exitCode = 1;
    throw new Error("Catalog governance validation failed");
  }

  console.log("\nCatalog governance validations passed");
}

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
