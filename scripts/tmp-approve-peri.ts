import { prisma } from "../lib/prisma";
import { updateImportJobStatus } from "../lib/import-jobs/update-import-job-status";

const ASSET_ID = "coffee-real-castlery-peri-120";
const CATALOG_ITEM_ID = "catalog-coffee-real-castlery-peri-120";

async function main() {
  // Find the import job for this asset
  const job = await prisma.importJob.findFirst({
    where: { normalizedAssetId: ASSET_ID },
    orderBy: { createdAt: "desc" },
  });

  if (!job) {
    // Try finding by source file name
    const job2 = await prisma.importJob.findFirst({
      where: { sourceFileName: { contains: "Peri" } },
      orderBy: { createdAt: "desc" },
    });
    if (!job2) throw new Error("No ImportJob found for Peri");
    console.log("Found job by filename:", job2.id, "status:", job2.status);
    await approveAndPublish(job2.id);
    return;
  }

  console.log("Found job:", job.id, "status:", job.status);
  await approveAndPublish(job.id);
}

async function approveAndPublish(jobId: string) {
  // Ensure CatalogItem exists
  const existing = await prisma.catalogItem.findUnique({ where: { id: CATALOG_ITEM_ID } });
  if (!existing) {
    const asset = await prisma.modelAsset.findUnique({ where: { id: ASSET_ID } });
    if (!asset) throw new Error(`ModelAsset ${ASSET_ID} not found`);
    await prisma.catalogItem.create({
      data: {
        id: CATALOG_ITEM_ID,
        assetId: ASSET_ID,
        title: "Peri Coffee Table",
        slug: "castlery-peri-coffee-table",
        category: "coffee_table",
        dimsWmm: 1200,
        dimsDmm: 700,
        dimsHmm: 300,
      },
    });
    console.log("Created CatalogItem:", CATALOG_ITEM_ID);
  } else {
    console.log("CatalogItem already exists:", CATALOG_ITEM_ID);
  }

  // Advance to approved
  await updateImportJobStatus({
    id: jobId,
    to: "approved",
    normalizedAssetId: ASSET_ID,
  });
  console.log("→ approved");

  // Advance to published
  await updateImportJobStatus({
    id: jobId,
    to: "published",
    normalizedAssetId: ASSET_ID,
    catalogItemId: CATALOG_ITEM_ID,
  });
  console.log("→ published");

  // Mark ModelAsset approved
  await prisma.modelAsset.update({
    where: { id: ASSET_ID },
    data: { approved: true },
  });
  console.log("ModelAsset.approved = true");

  await prisma.$disconnect();
  console.log("Done ✅");
}

main().catch((e) => { console.error(e); process.exit(1); });
