import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import type { CatalogItemSchema, ProductVariant } from "@/lib/catalog-schema";

export type CatalogCommerceIssueKind =
  | "missing-price"
  | "invalid-retailer-url"
  | "missing-shopify-variant"
  | "not-buyable"
  | "replacement-ineligible";

export type CatalogCommerceIssue = {
  productId: string;
  title: string;
  kind: CatalogCommerceIssueKind;
  detail: string;
};

export type CatalogCommerceReadinessSummary = {
  totalProducts: number;
  checkoutEligibleCount: number;
  retailerEligibleCount: number;
  replacementEligibleCount: number;
  missingPriceCount: number;
  invalidRetailerUrlCount: number;
  notBuyableCount: number;
  replacementIneligibleCount: number;
  issues: CatalogCommerceIssue[];
};

function isValidHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getVariantPrice(item: CatalogItemSchema, variant: ProductVariant) {
  const price =
    variant.priceHint ??
    (item.commerce.type === "affiliate" ? item.commerce.data.priceHint : undefined) ??
    item.metadata?.priceUsd ??
    0;
  return Number.isFinite(price) ? price : 0;
}

function hasAnyPositivePrice(item: CatalogItemSchema) {
  return item.variants.some((variant) => getVariantPrice(item, variant) > 0);
}

function getCommerceUrl(item: CatalogItemSchema, variant: ProductVariant) {
  return variant.affiliateUrl ?? (item.commerce.type === "affiliate" ? item.commerce.data.url : undefined);
}

function isCheckoutEligible(item: CatalogItemSchema) {
  return item.variants.some((variant) => {
    const resolved = resolveCatalogVariant(item, variant.id);
    return resolved.commerce.type === "shopify" && Boolean(resolved.commerce.variantId && resolved.commerce.available);
  });
}

function isRetailerEligible(item: CatalogItemSchema) {
  return item.variants.some((variant) => {
    const resolved = resolveCatalogVariant(item, variant.id);
    return resolved.commerce.type === "affiliate" && Boolean(resolved.commerce.url && resolved.commerce.available);
  });
}

function isReplacementEligible(item: CatalogItemSchema) {
  return item.variants.some((variant) => {
    const price = getVariantPrice(item, variant);
    if (price <= 0) return false;
    const resolved = resolveCatalogVariant(item, variant.id);
    if (resolved.commerce.type === "shopify") {
      return Boolean(resolved.commerce.variantId && resolved.commerce.available);
    }
    return isValidHttpUrl(getCommerceUrl(item, variant));
  });
}

export function buildCatalogCommerceReadiness(
  catalogItems: CatalogItemSchema[]
): CatalogCommerceReadinessSummary {
  const issues: CatalogCommerceIssue[] = [];
  let checkoutEligibleCount = 0;
  let retailerEligibleCount = 0;
  let replacementEligibleCount = 0;

  for (const item of catalogItems) {
    const hasPrice = hasAnyPositivePrice(item);
    const checkoutEligible = isCheckoutEligible(item);
    const retailerEligible = isRetailerEligible(item);
    const replacementEligible = isReplacementEligible(item);

    if (checkoutEligible) checkoutEligibleCount += 1;
    if (retailerEligible) retailerEligibleCount += 1;
    if (replacementEligible) replacementEligibleCount += 1;

    if (!hasPrice) {
      issues.push({
        productId: item.id,
        title: item.title,
        kind: "missing-price",
        detail: "No variant has a positive price hint or catalog price.",
      });
    }

    if (item.commerce.type === "affiliate") {
      const itemAffiliateUrl = item.commerce.data.url;
      const urls = item.variants.map((variant) => getCommerceUrl(item, variant) ?? itemAffiliateUrl);
      if (!urls.some(isValidHttpUrl)) {
        issues.push({
          productId: item.id,
          title: item.title,
          kind: "invalid-retailer-url",
          detail: "Affiliate commerce has no valid HTTP retailer URL.",
        });
      }
    }

    if (item.commerce.type === "shopify" && !checkoutEligible) {
      issues.push({
        productId: item.id,
        title: item.title,
        kind: "missing-shopify-variant",
        detail: "Shopify commerce has no available resolved variant ID.",
      });
    }

    if (item.commerce.type === "not_buyable") {
      issues.push({
        productId: item.id,
        title: item.title,
        kind: "not-buyable",
        detail: item.commerce.reason ?? "Catalog item is marked not buyable.",
      });
    }

    if (!replacementEligible) {
      issues.push({
        productId: item.id,
        title: item.title,
        kind: "replacement-ineligible",
        detail: "Product cannot appear as a shoppable replacement until price and commerce are valid.",
      });
    }
  }

  return {
    totalProducts: catalogItems.length,
    checkoutEligibleCount,
    retailerEligibleCount,
    replacementEligibleCount,
    missingPriceCount: issues.filter((issue) => issue.kind === "missing-price").length,
    invalidRetailerUrlCount: issues.filter((issue) => issue.kind === "invalid-retailer-url").length,
    notBuyableCount: issues.filter((issue) => issue.kind === "not-buyable").length,
    replacementIneligibleCount: issues.filter((issue) => issue.kind === "replacement-ineligible").length,
    issues,
  };
}
