import { CATALOG_ITEMS_MAP } from "../lib/catalog";
import {
  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE,
  HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE,
} from "../lib/design-page-product-data";
import { buildCatalogDetailView } from "../lib/catalog/view-builders";

type SwatchTextureIssue = {
  catalogItemId: string;
  variantId: string;
  label: string;
  issue: string;
};

function normalizeKey(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-");
}

function resolveTextureUrl(keys: string[]): string | undefined {
  for (const key of keys) {
    if (!key) continue;
    const url =
      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[key] ??
      HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[key];
    if (url) return url;
  }
  return undefined;
}

function shouldRequireTexture(itemId: string, swatchGroup: string, variantCount: number): boolean {
  if (variantCount <= 1) return false;
  if (itemId.includes("hugg")) return true;
  return /(upholstery|fabric|wood|finish)/.test(swatchGroup);
}

const issues: SwatchTextureIssue[] = [];
let texturedVariants = 0;
let checkedVariants = 0;

const REQUIRED_SWATCH_TEXTURE_URL_PARTS: Record<string, string> = {
  "marche-cocoa": "LE-4023/Cocoa_Swatch",
  "marche-ivory": "LE-4021/Hamilton-Leather-Sofa-Ivory-Det_1",
  "performance-arvo-dune": "AR-4001/Sloane-Cane-Chair-Dune-Grey-Oak-Det_1",
  "infinity-boucle-moss": "w_800",
  "performance-infinity-boucle-moss": "w_800",
  "infinity-boucle-cream": "w_800",
  "infinity-boucle-white-quartz": "w_800",
  "infinity-boucle-ginger": "w_800",
  "natural-wood": "Mori-Side-Table-Square-Det_4",
  "walnut-wood": "S3-20230307-LTL406-WA-Det_1",
};

for (const [finishKey, urlPart] of Object.entries(REQUIRED_SWATCH_TEXTURE_URL_PARTS)) {
  const url = CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishKey];
  if (!url || !url.includes(urlPart)) {
    issues.push({
      catalogItemId: "global-swatch-map",
      variantId: finishKey,
      label: finishKey,
      issue: `expected swatch texture URL to include ${urlPart}`,
    });
  }
}

for (const [catalogItemId, item] of CATALOG_ITEMS_MAP.entries()) {
  const detail = buildCatalogDetailView(item);
  const seenFinishOptionIds = new Set<string>();
  for (const option of detail.finishOptions) {
    if (seenFinishOptionIds.has(option.id)) {
      issues.push({
        catalogItemId,
        variantId: option.variantId ?? option.id,
        label: option.label,
        issue: `duplicate detail finish option id: ${option.id}`,
      });
    }
    seenFinishOptionIds.add(option.id);
  }

  for (const variant of item.variants) {
    const swatchGroup = normalizeKey(variant.swatchGroup);
    const keys = [
      normalizeKey(variant.finishCode),
      normalizeKey(variant.finishLabel),
      normalizeKey(variant.label),
    ];
    const textureUrl = resolveTextureUrl(keys);
    if (textureUrl) texturedVariants += 1;

    if (shouldRequireTexture(catalogItemId, swatchGroup, item.variants.length)) {
      checkedVariants += 1;
      if (!textureUrl) {
        issues.push({
          catalogItemId,
          variantId: variant.id,
          label: variant.label,
          issue: `missing Castlery swatch texture for keys: ${keys.filter(Boolean).join(", ") || "(none)"}`,
        });
      }
    }
  }
}

console.log("Public catalog swatch texture summary");
console.log(`- public catalog items scanned: ${CATALOG_ITEMS_MAP.size}`);
console.log(`- texture-required variants checked: ${checkedVariants}`);
console.log(`- variants with mapped texture: ${texturedVariants}`);
console.log(`- texture issues: ${issues.length}`);

if (issues.length > 0) {
  for (const issue of issues) {
    console.log(`  - ${issue.catalogItemId} / ${issue.variantId} (${issue.label}): ${issue.issue}`);
  }
  throw new Error("Public catalog swatch texture audit failed");
}

console.log("Public catalog swatch texture audit passed");
