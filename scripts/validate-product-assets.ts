import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  buildCanonicalProductContract,
  validateCanonicalProductContract,
} from "@/lib/canonical-product-contract";
import { inspectProductModelAsset } from "@/lib/product-asset-inspector";
import { validateProductAsset } from "@/lib/product-asset-validation";

const strict = process.argv.includes("--strict");
const outputArgumentIndex = process.argv.indexOf("--output");
const outputPath = path.resolve(
  outputArgumentIndex >= 0 && process.argv[outputArgumentIndex + 1]
    ? process.argv[outputArgumentIndex + 1]
    : path.join(".local", "product-asset-validation.json")
);
const publicRoot = path.join(process.cwd(), "public");

function safeLocalPublicPath(url: string) {
  const clean = url.split("?")[0].split("#")[0];
  if (!clean.startsWith("/")) return null;
  const root = path.resolve(publicRoot);
  const resolved = path.resolve(root, clean.replace(/^\/+/, ""));
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

async function thumbnailMetadata(url: string) {
  const filePath = safeLocalPublicPath(url);
  if (!filePath || !fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  const metadata = await sharp(filePath).metadata();
  if (!metadata.width || !metadata.height) return null;
  return { width: metadata.width, height: metadata.height, bytes: stats.size };
}

function rendererDisposalIsVerified() {
  const source = fs.readFileSync(
    path.join(process.cwd(), "components", "scene", "GLBScaledModel.tsx"),
    "utf8"
  );
  return (
    /geometry\?\.dispose\(\)/.test(source) &&
    /material\.dispose\(\)/.test(source) &&
    /value\.dispose\(\)/.test(source)
  );
}

async function main() {
  const memoryDisposalVerified = rendererDisposalIsVerified();
  const rows = [];

  for (const item of Object.values(CATALOG_ITEMS).sort((left, right) => left.id.localeCompare(right.id))) {
    const contract = buildCanonicalProductContract(item);
    const contractIssues = validateCanonicalProductContract(contract);
    const inspection = inspectProductModelAsset(item.assets.modelUrl, publicRoot);
    const thumbnail = await thumbnailMetadata(item.assets.thumbUrl);
    const validation = validateProductAsset({
      item,
      contract,
      inspection,
      thumbnail,
      memoryDisposalVerified,
    });
    const variantAssets = Array.from(new Set(contract.variants.map((variant) => variant.asset.modelUrl))).map(
      (modelUrl) => {
        const result = inspectProductModelAsset(modelUrl, publicRoot);
        return {
          modelUrl,
          source: result.source,
          validGlb: result.validGlb,
          error: result.error,
        };
      }
    );
    const variantAssetErrors = variantAssets.filter(
      (entry) => entry.source === "missing" || entry.source === "invalid" || entry.validGlb === false
    );
    rows.push({
      productId: item.id,
      contract,
      contractIssues,
      validation,
      variantAssets,
      variantAssetErrors,
    });
  }

  const contractErrors = rows.reduce(
    (count, row) => count + row.contractIssues.filter((issue) => issue.severity === "error").length,
    0
  );
  const contractWarnings = rows.reduce(
    (count, row) => count + row.contractIssues.filter((issue) => issue.severity === "warning").length,
    0
  );
  const assetErrors = rows.reduce((count, row) => count + row.validation.qa.blockers.length, 0);
  const assetWarnings = rows.reduce((count, row) => count + row.validation.qa.warnings.length, 0);
  const variantAssetErrors = rows.reduce((count, row) => count + row.variantAssetErrors.length, 0);
  const report = {
    format: "interior_ai.product_asset_validation.v1",
    generatedAt: new Date().toISOString(),
    strict,
    productCount: rows.length,
    summary: {
      contractErrors,
      contractWarnings,
      assetErrors,
      assetWarnings,
      variantAssetErrors,
      memoryDisposalVerified,
    },
    rows,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);

  console.log("Phase 14 product asset validation");
  console.log(`- products: ${report.productCount}`);
  console.log(`- canonical contract errors: ${contractErrors}`);
  console.log(`- canonical contract warnings: ${contractWarnings}`);
  console.log(`- asset errors: ${assetErrors}`);
  console.log(`- asset warnings: ${assetWarnings}`);
  console.log(`- invalid variant assets: ${variantAssetErrors}`);
  console.log(`- renderer memory disposal verified: ${memoryDisposalVerified ? "yes" : "no"}`);
  console.log(`- report: ${path.relative(process.cwd(), outputPath)}`);

  if (strict && contractErrors + assetErrors + variantAssetErrors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
