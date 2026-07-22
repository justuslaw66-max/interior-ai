import assert from "node:assert/strict";
import { getFreshCatalogYamlMap } from "../lib/catalog-yaml";
import { normalizeImportedVariants } from "../lib/catalog/imported-variant-normalization";

const PRODUCT_ID = "sofa-real-castlery-dawson-3s";
const entry = getFreshCatalogYamlMap().get(PRODUCT_ID);

assert.ok(entry, `Expected ${PRODUCT_ID} in the YAML catalog`);
assert.ok(entry.variants?.length, "Expected Dawson 3 Seater variants");
assert.equal(entry.variants.length, 28, "Expected the active Dawson 3 Seater palette");

for (const variant of entry.variants) {
  assert.match(
    variant.affiliate_url ?? "",
    /^https:\/\/www\.castlery\.com\/sg\/products\//,
    `${variant.upholstery_code} must have a Castlery variant URL`,
  );
}

const normalized = normalizeImportedVariants({
  productId: PRODUCT_ID,
  variantEntries: entry.variants,
  sharedUpholsteryOptions: entry.upholstery_options,
  fallbackThumbnailUrl: entry.assets?.thumbnail_url ?? "/assets/thumbs/sofa-real-castlery-dawson-3s.png",
  fallbackGalleryImages: entry.assets?.gallery_images,
});

assert.equal(normalized.length, 28, "Variant normalization must preserve the active palette");
assert.ok(normalized.every((variant) => variant.affiliateUrl), "Normalized variants must retain retailer URLs");

const expectedCases = [
  {
    finishCode: "beach-linen",
    pathname: "/sg/products/dawson-3-seater-sofa",
    material: "beach_linen",
    frameCover: "removable",
  },
  {
    finishCode: "infinity-boucle-ginger",
    pathname: "/sg/products/dawson-3-seater-sofa",
    material: "performance_ginger",
    frameCover: "removable",
  },
  {
    finishCode: "performance-twill-slate",
    pathname: "/sg/products/dawson-3-seater-sofa",
    material: "performance_twill_slate",
    frameCover: "removable",
  },
  {
    finishCode: "marche-graphite-leather",
    pathname: "/sg/products/dawson-leather-3-seater-sofa",
    material: "marche_graphite",
    frameCover: null,
  },
] as const;

for (const expected of expectedCases) {
  const variant = normalized.find((candidate) => candidate.finishCode === expected.finishCode);
  assert.ok(variant?.affiliateUrl, `Missing normalized URL for ${expected.finishCode}`);
  const url = new URL(variant.affiliateUrl);
  assert.equal(url.hostname, "www.castlery.com");
  assert.equal(url.pathname, expected.pathname);
  assert.equal(url.searchParams.get("material"), expected.material);
  assert.equal(url.searchParams.get("frame_cover"), expected.frameCover);
}

console.log("PASS: Dawson retailer links preserve the exact selected material and product family");
