import fs from "node:fs";
import path from "node:path";
import { generateModelThumbnail } from "../lib/asset-pipeline/generate-thumbnail";

const ASSET_IDS = [
  "dining-real-castlery-forma-oval-150",
  "dining-real-castlery-forma-round-120",
  "dining-real-castlery-forma-round-90",
  "dining-real-castlery-kelsey-marble-160",
  "dining-real-castlery-kelsey-marble-180",
  "dining-real-castlery-brighton-oval-180",
  "dining-real-castlery-sloane-travertine-180",
  "dining-real-castlery-sloane-bench-150-no-cushion",
  "dining-real-castlery-sloane-bench-150-leather-cushion",
  "dining-real-castlery-sloane-bench-180-no-cushion",
  "dining-real-castlery-sloane-bench-180-leather-cushion",
  "tv-real-castlery-casa-tv-console-150",
  "tv-real-castlery-casa-tv-console-200",
  "tv-real-castlery-sawyer-tv-console-200",
  "tv-real-castlery-seb-tv-console-150",
  "tv-real-castlery-seb-tv-console-200",
  "tv-real-castlery-sloane-tv-console-150",
  "tv-real-castlery-sloane-tv-console-200",
  "accessory-real-castlery-blanc-arched-table-lamp",
  "accessory-real-castlery-faro-sculptural-floor-lamp",
  "accessory-real-castlery-faro-table-lamp",
  "accessory-real-castlery-cedric-floor-lamp",
  "accessory-real-castlery-cedric-floor-lamp-with-table",
  "accessory-real-castlery-cedric-table-lamp-28-8cm-curved",
  "accessory-real-castlery-cedric-table-lamp-53cm-curved",
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed",
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened",
  "coffee-real-castlery-hugg-nesting-square-performance-dune-closed",
  "coffee-real-castlery-hugg-nesting-square-performance-dune-opened",
  "coffee-real-castlery-vento-coffee-table-120",
] as const;

async function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const modelsDir = path.join(projectRoot, "public", "assets", "models");
  const thumbsDir = path.join(projectRoot, "public", "assets", "thumbs");
  fs.mkdirSync(thumbsDir, { recursive: true });

  const summary: Array<{ id: string; status: string; detail?: string }> = [];

  for (const id of ASSET_IDS) {
    const modelPath = path.join(modelsDir, `${id}.glb`);
    const thumbPath = path.join(thumbsDir, `${id}.png`);

    if (!fs.existsSync(modelPath)) {
      summary.push({ id, status: "skipped", detail: "model missing" });
      continue;
    }

    const result = await generateModelThumbnail(modelPath, thumbPath, 512);
    if (result.ok) {
      summary.push({ id, status: "generated", detail: `/assets/thumbs/${id}.png` });
    } else {
      summary.push({ id, status: "failed", detail: result.reason ?? "unknown" });
    }
  }

  const generated = summary.filter((x) => x.status === "generated").length;
  const failed = summary.filter((x) => x.status === "failed").length;
  const skipped = summary.filter((x) => x.status === "skipped").length;

  console.log(`Generated: ${generated}, Failed: ${failed}, Skipped: ${skipped}`);
  for (const row of summary) {
    console.log(`${row.status.toUpperCase()} ${row.id}${row.detail ? ` -> ${row.detail}` : ""}`);
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
