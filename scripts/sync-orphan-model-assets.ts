import fs from "fs";
import path from "path";
import { parse } from "yaml";

import { prisma } from "../lib/prisma";

type CatalogAssetDoc = {
  dimensions?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  assets?: {
    asset_id?: string;
    model_url?: string;
    thumbnail_url?: string;
  };
};

const TARGET_FILES = [
  "catalog/furniture/sideboards/sloane_sideboard_150/catalog.yaml",
  "catalog/furniture/sideboards/sloane_sideboard_180/catalog.yaml",
  "catalog/furniture/tv_consoles/casa_tv_console_150/catalog.yaml",
  "catalog/furniture/tv_consoles/casa_tv_console_200/catalog.yaml",
  "catalog/furniture/tv_consoles/seb_tv_console_150/catalog.yaml",
  "catalog/furniture/tv_consoles/seb_tv_console_200/catalog.yaml",
  "catalog/furniture/tv_consoles/sloane_tv_console_150/catalog.yaml",
  "catalog/furniture/tv_consoles/sloane_tv_console_200/catalog.yaml",
] as const;

function toMillimeters(valueCm: number): number {
  return Math.round(valueCm * 10);
}

async function run(): Promise<void> {
  for (const relativePath of TARGET_FILES) {
    const filePath = path.join(process.cwd(), relativePath);
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = parse(raw) as CatalogAssetDoc;

    const assetId = parsed.assets?.asset_id?.trim();
    const modelUrl = parsed.assets?.model_url?.trim();
    const thumbUrl = parsed.assets?.thumbnail_url?.trim();
    const widthCm = Number(parsed.dimensions?.width_cm ?? 0);
    const depthCm = Number(parsed.dimensions?.depth_cm ?? 0);
    const heightCm = Number(parsed.dimensions?.height_cm ?? 0);

    if (!assetId || !modelUrl || !thumbUrl || !widthCm || !depthCm || !heightCm) {
      console.log(`SKIP missing required fields: ${relativePath}`);
      continue;
    }

    const sizeX = Number((widthCm / 100).toFixed(4));
    const sizeY = Number((heightCm / 100).toFixed(4));
    const sizeZ = Number((depthCm / 100).toFixed(4));

    await prisma.modelAsset.upsert({
      where: { id: assetId },
      create: {
        id: assetId,
        modelUrl,
        thumbUrl,
        notes: "Auto-synced from catalog YAML for governance consistency",
        approved: true,
        aabbCenterX: 0,
        aabbCenterY: Number((sizeY / 2).toFixed(4)),
        aabbCenterZ: 0,
        aabbSizeX: sizeX,
        aabbSizeY: sizeY,
        aabbSizeZ: sizeZ,
        dimsWmm: toMillimeters(widthCm),
        dimsDmm: toMillimeters(depthCm),
        dimsHmm: toMillimeters(heightCm),
        groundAligned: true,
        pivotOffsetX: 0,
        pivotOffsetZ: 0,
      },
      update: {
        modelUrl,
        thumbUrl,
        notes: "Auto-synced from catalog YAML for governance consistency",
        approved: true,
        aabbCenterX: 0,
        aabbCenterY: Number((sizeY / 2).toFixed(4)),
        aabbCenterZ: 0,
        aabbSizeX: sizeX,
        aabbSizeY: sizeY,
        aabbSizeZ: sizeZ,
        dimsWmm: toMillimeters(widthCm),
        dimsDmm: toMillimeters(depthCm),
        dimsHmm: toMillimeters(heightCm),
        groundAligned: true,
        pivotOffsetX: 0,
        pivotOffsetZ: 0,
      },
    });

    console.log(`UPSERT ${assetId}`);
  }

  await prisma.$disconnect();
}

run().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
