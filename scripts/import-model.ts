// scripts/import-model.ts
import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { prisma } from "../lib/prisma";

type ImportInput = {
  srcGlbPath: string;         // local file path
  assetId?: string;           // optional; else derived
  dimsMm?: { w: number; d: number; h: number }; // optional fallback
  aabb?: {
    size: { x: number; y: number; z: number };
    center: { x: number; y: number; z: number };
  }; // optional fallback
  approved?: boolean;
};

function hashFile(filepath: string) {
  const buf = fs.readFileSync(filepath);
  return crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);
}

async function main() {
  const jsonPath = process.argv[2];
  if (!jsonPath) throw new Error("Usage: ts-node scripts/import-model.ts <import.json>");

  const absJson = path.resolve(jsonPath);
  const raw = fs.readFileSync(absJson, "utf8");
  const input: ImportInput = JSON.parse(raw);

  const src = path.resolve(input.srcGlbPath);
  if (!fs.existsSync(src)) throw new Error(`Missing srcGlbPath: ${src}`);

  const fileHash = hashFile(src);
  const assetId = input.assetId ?? `asset_${fileHash}`;

  const modelsDir = path.resolve("public/assets/models");
  const thumbsDir = path.resolve("public/assets/thumbs");
  fs.mkdirSync(modelsDir, { recursive: true });
  fs.mkdirSync(thumbsDir, { recursive: true });

  const destGlb = path.join(modelsDir, `${assetId}.glb`);
  fs.copyFileSync(src, destGlb);

  // Placeholder thumb for now (upgrade later with real renderer)
  const destThumb = path.join(thumbsDir, `${assetId}.png`);
  if (!fs.existsSync(destThumb)) {
    // 1x1 transparent PNG (tiny placeholder) so pipeline is consistent
    const png1x1 = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIW2P4//8/AwAI/AL+X7m7WQAAAABJRU5ErkJggg==",
      "base64"
    );
    fs.writeFileSync(destThumb, png1x1);
  }

  // Fallback geometry if not computed yet
  const dims = input.dimsMm ?? { w: 2000, d: 900, h: 800 };
  const aabb = input.aabb ?? {
    size: { x: dims.w / 1000, y: dims.h / 1000, z: dims.d / 1000 }, // if your scene units are meters
    center: { x: 0, y: (dims.h / 1000) / 2, z: 0 },
  };

  const modelUrl = `/assets/models/${assetId}.glb`;
  const thumbUrl = `/assets/thumbs/${assetId}.png`;

  await prisma.modelAsset.upsert({
    where: { id: assetId },
    create: {
      id: assetId,
      modelUrl,
      thumbUrl,

      dimsWmm: Math.round(dims.w),
      dimsDmm: Math.round(dims.d),
      dimsHmm: Math.round(dims.h),

      aabbSizeX: aabb.size.x,
      aabbSizeY: aabb.size.y,
      aabbSizeZ: aabb.size.z,
      aabbCenterX: aabb.center.x,
      aabbCenterY: aabb.center.y,
      aabbCenterZ: aabb.center.z,

      pivotOffsetX: 0,
      pivotOffsetZ: 0,
      groundAligned: true,

      approved: input.approved ?? false,
    },
    update: {
      modelUrl,
      thumbUrl,
      dimsWmm: Math.round(dims.w),
      dimsDmm: Math.round(dims.d),
      dimsHmm: Math.round(dims.h),
      aabbSizeX: aabb.size.x,
      aabbSizeY: aabb.size.y,
      aabbSizeZ: aabb.size.z,
      aabbCenterX: aabb.center.x,
      aabbCenterY: aabb.center.y,
      aabbCenterZ: aabb.center.z,
      approved: input.approved ?? false,
    },
  });

  console.log(`✅ Imported ModelAsset ${assetId}`);
  console.log(`   modelUrl=${modelUrl}`);
  console.log(`   thumbUrl=${thumbUrl}`);

  await prisma.$disconnect();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

