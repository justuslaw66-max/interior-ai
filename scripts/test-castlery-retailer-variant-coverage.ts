import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "../lib/catalog";
import { getFreshCatalogYamlMap, type CatalogYamlVariantEntry } from "../lib/catalog-yaml";
import { resolveCastleryVariantAffiliateUrl } from "../lib/catalog/castlery-retailer-links";
import { normalizeImportedVariants } from "../lib/catalog/imported-variant-normalization";

function rawColourCode(variant: CatalogYamlVariantEntry): string | null {
  const upholsteryCode = String(variant.upholstery_code ?? "").trim();
  if (upholsteryCode) return upholsteryCode;

  const finishCode = String(variant.finish_code ?? "").trim();
  if (!finishCode) return null;
  const swatchGroup = String(variant.swatch_group ?? "").trim().toLowerCase();
  return /(upholstery|fabric|leather|wood|finish|colou?r)/.test(swatchGroup) ? finishCode : null;
}

function commerceIdentity(value: string): string {
  const url = new URL(value);
  url.searchParams.delete("utm_source");
  url.searchParams.delete("utm_medium");
  url.searchParams.sort();
  return `${url.pathname}?${url.searchParams.toString()}`;
}

const auditedProducts: string[] = [];
let auditedVariants = 0;

for (const [productId, entry] of getFreshCatalogYamlMap()) {
  const variants = entry.variants ?? [];
  const authoredColourCodes = new Set(
    variants.map(rawColourCode).filter((value): value is string => Boolean(value)),
  );
  if (authoredColourCodes.size <= 1) continue;

  const normalized = normalizeImportedVariants({
    productId,
    sourceUrl: (entry as { source_url?: string }).source_url,
    variantEntries: variants,
    sharedUpholsteryOptions: entry.upholstery_options,
    fallbackThumbnailUrl: entry.assets?.thumbnail_url ?? `/assets/thumbs/${productId}.png`,
    fallbackGalleryImages: entry.assets?.gallery_images,
  });
  assert.ok(normalized.length > 1, `${productId} must normalize its selectable colours`);
  assert.ok(
    normalized.every((variant) => variant.affiliateUrl),
    `${productId} has a selectable colour without an exact retailer URL`,
  );

  const identityByFinish = new Map<string, string>();
  for (const variant of normalized) {
    assert.ok(variant.affiliateUrl, `${productId}/${variant.id} is missing its retailer URL`);
    const url = new URL(variant.affiliateUrl);
    assert.equal(url.hostname, "www.castlery.com", `${productId}/${variant.id} must use Castlery SG`);
    const finishCode = variant.finishCode ?? variant.id;
    const identity = commerceIdentity(variant.affiliateUrl);
    if (!identityByFinish.has(finishCode)) identityByFinish.set(finishCode, identity);
  }

  assert.equal(
    new Set(identityByFinish.values()).size,
    identityByFinish.size,
    `${productId} collapses multiple colours onto the same generic retailer identity`,
  );
  auditedProducts.push(productId);
  auditedVariants += normalized.length;
}

assert.ok(auditedProducts.length >= 50, `Expected at least 50 multi-colour products, got ${auditedProducts.length}`);
for (const productId of [
  "armchair-real-castlery-avery-performance-armchair",
  "armchair-real-castlery-lena-leather-armchair-cocoa-brass-legs",
  "coffee-real-castlery-harper-marble-rectangular-120",
  "dining-real-castlery-kelsey-marble-180",
  "sofa-real-castlery-dawson-chaise-sectional",
  "sofa-real-castlery-jaron-3s-wide-arm",
  "sofa-real-castlery-madison-3s",
]) {
  assert.ok(auditedProducts.includes(productId), `Coverage must include ${productId}`);
}
for (const productId of [
  "sofa-real-castlery-dawson-wide-chaise-sectional",
  "sofa-real-castlery-dawson-wide-chaise-sectional-left",
]) {
  const entry = getFreshCatalogYamlMap().get(productId);
  assert.equal(entry?.variants?.length, 22, `${productId} must expose only the live fabric palette`);
  assert.ok(
    entry?.variants?.every((variant) => !String(variant.upholstery_code ?? "").includes("leather")),
    `${productId} must not expose retired leather configurations`,
  );
}

const curatedMultiColourProducts = Object.values(CATALOG_ITEMS).filter(
  (item) => new Set(item.variants.map((variant) => variant.finishCode ?? variant.id)).size > 1,
);
for (const item of curatedMultiColourProducts) {
  assert.ok(item.variants.every((variant) => variant.affiliateUrl), `${item.id} must deep-link every colour`);
  const identityByFinish = new Map<string, string>();
  for (const variant of item.variants) {
    const finishCode = variant.finishCode ?? variant.id;
    if (!identityByFinish.has(finishCode)) {
      identityByFinish.set(finishCode, commerceIdentity(variant.affiliateUrl!));
    }
  }
  assert.equal(
    new Set(identityByFinish.values()).size,
    identityByFinish.size,
    `${item.id} must preserve each curated colour identity`,
  );
}
for (const productId of [
  "sofa-real-castlery-ollie-storage-ottoman",
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-closed",
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed",
]) {
  assert.ok(
    curatedMultiColourProducts.some((item) => item.id === productId),
    `Curated coverage must include ${productId}`,
  );
}

const representativeCases = [
  {
    name: "Dawson right chaise ginger",
    input: {
      productId: "sofa-real-castlery-dawson-chaise-sectional",
      sourceUrl: "https://www.castlery.com/sg/products/dawson-chaise-sectional-sofa",
      upholsteryCode: "infinity_boucle_ginger",
      materialType: "Fabric",
    },
    path: "/sg/products/dawson-chaise-sectional-sofa",
    params: { material: "performance_ginger", orientation: "right_facing", frame_cover: "removable" },
  },
  {
    name: "Dawson left chaise graphite leather",
    input: {
      productId: "sofa-real-castlery-dawson-chaise-sectional-left",
      sourceUrl: "https://www.castlery.com/sg/products/dawson-chaise-sectional-sofa",
      upholsteryCode: "marche_graphite_leather",
      materialType: "Leather",
    },
    path: "/sg/products/dawson-leather-chaise-sectional-sofa",
    params: { material: "marche_graphite", orientation: "left_facing" },
  },
  {
    name: "Dawson small ottoman graphite leather",
    input: {
      productId: "sofa-real-castlery-dawson-ottoman",
      sourceUrl: "https://www.castlery.com/sg/products/dawson-ottoman",
      upholsteryCode: "marche_graphite_leather",
      materialType: "Leather",
    },
    path: "/sg/products/dawson-leather-small-ottoman",
    params: { material: "marche_graphite" },
  },
  {
    name: "Avery ginger",
    input: {
      productId: "armchair-real-castlery-avery-performance-armchair",
      sourceUrl: "https://www.castlery.com/sg/products/avery-performance-boucle-armchair",
      upholsteryCode: "performance_infinity_boucle_ginger",
    },
    path: "/sg/products/avery-performance-boucle-armchair",
    params: { material: "performance_ginger", quantity: "single" },
  },
  {
    name: "Jaron wide-arm fabric",
    input: {
      productId: "sofa-real-castlery-jaron-3s-wide-arm",
      sourceUrl: "https://www.castlery.com/sg/products/jaron-leather-recliner-3-seater-sofa",
      upholsteryCode: "performance_arvo_dune",
      materialType: "Fabric",
    },
    path: "/sg/products/jaron-performance-fabric-recliner-3-seater-sofa",
    params: { material: "performance_dune", variant: "wide_arm", power_recliner_qty: "dual" },
  },
  {
    name: "Lena ginger with matte-black legs",
    input: {
      productId: "armchair-real-castlery-lena-leather-armchair-cocoa-brass-legs",
      sourceUrl: "https://www.castlery.com/sg/products/lena-performance-fabric-armchair",
      upholsteryCode: "infinity_boucle_ginger",
      legFinishCode: "matte_black",
      materialType: "Fabric",
    },
    path: "/sg/products/lena-performance-fabric-armchair",
    params: { material: "performance_ginger", leg_color: "black" },
  },
  {
    name: "Madison leather",
    input: {
      productId: "sofa-real-castlery-madison-3s",
      sourceUrl: "https://www.castlery.com/sg/products/madison-3-seater-sofa",
      upholsteryCode: "caramel_leather",
      materialType: "Leather",
    },
    path: "/sg/products/madison-leather-3-seater-sofa",
    params: { material: "caramel" },
  },
  {
    name: "Harper natural",
    input: {
      productId: "coffee-real-castlery-harper-marble-rectangular-120",
      sourceUrl: "https://www.castlery.com/sg/products/harper-marble-rectangular-coffee-table",
      finishCode: "natural",
    },
    path: "/sg/products/harper-marble-rectangular-coffee-table",
    params: { color_option: "light_oak" },
  },
  {
    name: "Kelsey dark walnut 180",
    input: {
      productId: "dining-real-castlery-kelsey-marble-180",
      sourceUrl: "https://www.castlery.com/sg/products/kelsey-marble-dining-table-white-wash",
      finishCode: "dark_walnut",
    },
    path: "/sg/products/kelsey-marble-dining-table-walnut-stain",
    params: { length: "1_8m" },
  },
] as const;

for (const testCase of representativeCases) {
  const resolved = resolveCastleryVariantAffiliateUrl(testCase.input);
  assert.ok(resolved, `${testCase.name} must resolve`);
  const url = new URL(resolved);
  assert.equal(url.pathname, testCase.path, `${testCase.name} path`);
  for (const [key, value] of Object.entries(testCase.params)) {
    assert.equal(url.searchParams.get(key), value, `${testCase.name} ${key}`);
  }
}

console.log(
  `PASS: ${auditedProducts.length} multi-colour products and ${auditedVariants} normalized variants preserve exact Castlery retailer identities`,
);
