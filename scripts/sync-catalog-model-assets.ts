import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

import { isLiveCatalogEntry } from "../lib/catalog-publication";
import { validateDeploymentEnvironmentOrThrow } from "../lib/config";
import { prisma } from "../lib/prisma";

type CatalogAssetDoc = {
  status?: string;
  publication_state?: string;
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

type SyncCandidate = {
  assetId: string;
  modelUrl: string;
  thumbUrl: string;
  widthCm: number;
  depthCm: number;
  heightCm: number;
  filePath: string;
};

function findCatalogFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...findCatalogFiles(fullPath));
      continue;
    }
    if (entry.name === "catalog.yaml") {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function toMillimeters(valueCm: number): number {
  return Math.round(valueCm * 10);
}

function readCandidate(filePath: string): SyncCandidate | null {
  const parsed = parse(fs.readFileSync(filePath, "utf8")) as CatalogAssetDoc;
  if (!isLiveCatalogEntry(parsed)) return null;

  const assetId = parsed.assets?.asset_id?.trim();
  const modelUrl = parsed.assets?.model_url?.trim();
  const thumbUrl = parsed.assets?.thumbnail_url?.trim();
  const widthCm = Number(parsed.dimensions?.width_cm ?? 0);
  const depthCm = Number(parsed.dimensions?.depth_cm ?? 0);
  const heightCm = Number(parsed.dimensions?.height_cm ?? 0);

  if (!assetId || !modelUrl || !thumbUrl || !widthCm || !depthCm || !heightCm) {
    throw new Error(`Live catalog entry is missing model asset sync fields: ${path.relative(process.cwd(), filePath)}`);
  }

  return {
    assetId,
    modelUrl,
    thumbUrl,
    widthCm,
    depthCm,
    heightCm,
    filePath,
  };
}

async function upsertCandidate(candidate: SyncCandidate): Promise<void> {
  const sizeX = Number((candidate.widthCm / 100).toFixed(4));
  const sizeY = Number((candidate.heightCm / 100).toFixed(4));
  const sizeZ = Number((candidate.depthCm / 100).toFixed(4));
  const notes = `Synced from ${path.relative(process.cwd(), candidate.filePath)} for catalog governance`;

  await prisma.modelAsset.upsert({
    where: { id: candidate.assetId },
    create: {
      id: candidate.assetId,
      modelUrl: candidate.modelUrl,
      thumbUrl: candidate.thumbUrl,
      notes,
      approved: true,
      aabbCenterX: 0,
      aabbCenterY: Number((sizeY / 2).toFixed(4)),
      aabbCenterZ: 0,
      aabbSizeX: sizeX,
      aabbSizeY: sizeY,
      aabbSizeZ: sizeZ,
      dimsWmm: toMillimeters(candidate.widthCm),
      dimsDmm: toMillimeters(candidate.depthCm),
      dimsHmm: toMillimeters(candidate.heightCm),
      groundAligned: true,
      pivotOffsetX: 0,
      pivotOffsetZ: 0,
    },
    update: {
      modelUrl: candidate.modelUrl,
      thumbUrl: candidate.thumbUrl,
      notes,
      approved: true,
      aabbCenterX: 0,
      aabbCenterY: Number((sizeY / 2).toFixed(4)),
      aabbCenterZ: 0,
      aabbSizeX: sizeX,
      aabbSizeY: sizeY,
      aabbSizeZ: sizeZ,
      dimsWmm: toMillimeters(candidate.widthCm),
      dimsDmm: toMillimeters(candidate.depthCm),
      dimsHmm: toMillimeters(candidate.heightCm),
      groundAligned: true,
      pivotOffsetX: 0,
      pivotOffsetZ: 0,
    },
  });
}

async function run(): Promise<void> {
  validateDeploymentEnvironmentOrThrow();
  const rootDir = path.join(process.cwd(), "catalog", "furniture");
  const candidates = findCatalogFiles(rootDir)
    .map(readCandidate)
    .filter((candidate): candidate is SyncCandidate => candidate !== null);

  for (const candidate of candidates) {
    await upsertCandidate(candidate);
  }

  console.log(`Synced ${candidates.length} live catalog ModelAsset rows`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
