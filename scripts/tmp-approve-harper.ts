import { prisma } from "../lib/prisma";
import { updateImportJobStatus } from "../lib/import-jobs/update-import-job-status";

type AssetConfig = {
  assetId: string;
  catalogItemId: string;
  slug: string;
  title: string;
  category: "coffee_table";
  dimsWmm: number;
  dimsDmm: number;
  dimsHmm: number;
};

const ASSETS: AssetConfig[] = [
  {
    assetId: "coffee-real-castlery-harper-marble-round-915",
    catalogItemId: "catalog-coffee-real-castlery-harper-marble-round-915",
    slug: "castlery-harper-marble-coffee-table-round",
    title: "Harper Marble Coffee Table Round",
    category: "coffee_table",
    dimsWmm: 915,
    dimsDmm: 915,
    dimsHmm: 380,
  },
  {
    assetId: "coffee-real-castlery-harper-marble-rectangular-120",
    catalogItemId: "catalog-coffee-real-castlery-harper-marble-rectangular-120",
    slug: "castlery-harper-marble-coffee-table-rectangular",
    title: "Harper Marble Coffee Table Rectangular",
    category: "coffee_table",
    dimsWmm: 1200,
    dimsDmm: 600,
    dimsHmm: 380,
  },
];

async function ensureCatalogItem(config: AssetConfig) {
  const existing = await prisma.catalogItem.findUnique({ where: { id: config.catalogItemId } });
  if (existing) return;

  const asset = await prisma.modelAsset.findUnique({ where: { id: config.assetId } });
  if (!asset) throw new Error(`ModelAsset not found: ${config.assetId}`);

  await prisma.catalogItem.create({
    data: {
      id: config.catalogItemId,
      assetId: config.assetId,
      title: config.title,
      slug: config.slug,
      category: config.category,
      dimsWmm: config.dimsWmm,
      dimsDmm: config.dimsDmm,
      dimsHmm: config.dimsHmm,
    },
  });
}

async function approveAndPublish(config: AssetConfig) {
  const job = await prisma.importJob.findFirst({
    where: { normalizedAssetId: config.assetId },
    orderBy: { createdAt: "desc" },
  });
  if (!job) throw new Error(`ImportJob not found for ${config.assetId}`);

  await ensureCatalogItem(config);

  await updateImportJobStatus({
    id: job.id,
    to: "approved",
    normalizedAssetId: config.assetId,
  });

  await updateImportJobStatus({
    id: job.id,
    to: "published",
    normalizedAssetId: config.assetId,
    catalogItemId: config.catalogItemId,
  });

  await prisma.modelAsset.update({
    where: { id: config.assetId },
    data: { approved: true },
  });

  console.log(`Published ${config.assetId}`);
}

async function main() {
  for (const asset of ASSETS) {
    await approveAndPublish(asset);
  }
  await prisma.$disconnect();
  console.log("Done");
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
