import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";

function walk(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];

  while (stack.length > 0) {
    const cur = stack.pop()!;
    const entries = fs.readdirSync(cur, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(cur, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }

  return out;
}

async function main() {
  const sourceArg = process.argv[2];
  if (!sourceArg) {
    console.error("Usage: npx tsx scripts/restore-model-assets.ts <source-dir>");
    process.exit(1);
  }

  const sourceDir = path.resolve(process.cwd(), sourceArg);
  if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error(`Source directory not found: ${sourceDir}`);
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), "public/assets/models");
  fs.mkdirSync(targetDir, { recursive: true });

  const files = walk(sourceDir).filter((f) => f.toLowerCase().endsWith(".glb"));
  const byBaseName = new Map<string, string>();
  for (const file of files) {
    const base = path.basename(file);
    if (!byBaseName.has(base)) {
      byBaseName.set(base, file);
    }
  }

  const rows = await prisma.modelAsset.findMany({
    select: { id: true, modelUrl: true },
    orderBy: { updatedAt: "desc" },
  });

  let copied = 0;
  let alreadyPresent = 0;
  const missing: Array<{ id: string; modelUrl: string }> = [];

  for (const row of rows) {
    if (!row.modelUrl || !row.modelUrl.startsWith("/assets/models/")) continue;

    const base = path.basename(row.modelUrl);
    const target = path.join(targetDir, base);

    if (fs.existsSync(target)) {
      alreadyPresent += 1;
      continue;
    }

    const source = byBaseName.get(base);
    if (!source) {
      missing.push({ id: row.id, modelUrl: row.modelUrl });
      continue;
    }

    fs.copyFileSync(source, target);
    copied += 1;
  }

  console.log(`Model assets checked: ${rows.length}`);
  console.log(`Already present: ${alreadyPresent}`);
  console.log(`Copied: ${copied}`);
  console.log(`Still missing: ${missing.length}`);

  if (missing.length > 0) {
    console.log("Missing entries:");
    for (const row of missing) {
      console.log(`- ${row.id} -> ${row.modelUrl}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  try {
    await prisma.$disconnect();
  } catch {
    // ignore disconnect errors in failure path
  }
  process.exit(1);
});
