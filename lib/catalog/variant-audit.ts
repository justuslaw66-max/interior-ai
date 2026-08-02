import type { CatalogItemSchema } from "../catalog-schema";
import { resolveCatalogVariant } from "./variant-resolver";
import { CATALOG_MEDIA_PRESENTATION_PRESETS } from "./media-policy";

export type VariantAuditIssue = {
  catalogItemId: string;
  variantId: string;
  issue: string;
};

export type VariantAuditSummary = {
  itemsScanned: number;
  variantsScanned: number;
  issuesCount: number;
  itemsWithIssues: number;
  variantsWithIssues: number;
  missingMedia: VariantAuditIssue[];
  missingCommerceMapping: VariantAuditIssue[];
  unavailableCommerce: VariantAuditIssue[];
  requestedFallbacks: VariantAuditIssue[];
  mediaParityMismatches: VariantAuditIssue[];
  lowQualityMedia: VariantAuditIssue[];
  duplicateVariantMedia: VariantAuditIssue[];
  invalidMediaUrls: VariantAuditIssue[];
  issues: VariantAuditIssue[];
};

function isLikelyLifestyleImage(url: string): boolean {
  return /(lifestyle|square[-_ ]set|cover|room|detail|closeup|in[-_ ]room|context)/i.test(url);
}

function isLikelyPackshotImage(url: string): boolean {
  return /(front|back|side|angle)/i.test(url);
}

function isValidUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/")) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function asIssue(catalogItemId: string, variantId: string, issue: string): VariantAuditIssue {
  return { catalogItemId, variantId, issue };
}

export function runVariantResolutionAudit(items: Iterable<CatalogItemSchema>): VariantAuditSummary {
  const allIssues: VariantAuditIssue[] = [];
  const missingMedia: VariantAuditIssue[] = [];
  const missingCommerceMapping: VariantAuditIssue[] = [];
  const unavailableCommerce: VariantAuditIssue[] = [];
  const requestedFallbacks: VariantAuditIssue[] = [];
  const mediaParityMismatches: VariantAuditIssue[] = [];
  const lowQualityMedia: VariantAuditIssue[] = [];
  const duplicateVariantMedia: VariantAuditIssue[] = [];
  const invalidMediaUrls: VariantAuditIssue[] = [];
  let itemsScanned = 0;
  let variantsScanned = 0;

  const minGalleryImages = CATALOG_MEDIA_PRESENTATION_PRESETS.catalog_detail_gallery.minGalleryImages;
  const minLifestyleImages = CATALOG_MEDIA_PRESENTATION_PRESETS.catalog_detail_gallery.minLifestyleImages;

  for (const item of items) {
    itemsScanned += 1;
    const perItemGalleryCounts: number[] = [];

    for (const variant of item.variants) {
      variantsScanned += 1;
      const resolved = resolveCatalogVariant(item, variant.id);
      const gallery = resolved.media.galleryImages;
      perItemGalleryCounts.push(gallery.length);

      for (const issue of resolved.issues) {
        const normalized = asIssue(item.id, variant.id, issue);
        allIssues.push(normalized);
        if (issue.startsWith("Requested variant")) {
          requestedFallbacks.push(normalized);
        }
      }

      if (!resolved.media.thumbUrl) {
        const issue = asIssue(item.id, variant.id, "Missing resolved thumbUrl");
        missingMedia.push(issue);
        allIssues.push(issue);
      }

      if (resolved.commerce.type === "shopify" && !resolved.commerce.variantId) {
        const issue = asIssue(item.id, variant.id, "Missing Shopify variant mapping");
        missingCommerceMapping.push(issue);
        allIssues.push(issue);
      }

      if (resolved.commerce.type === "affiliate" && !resolved.commerce.url) {
        const issue = asIssue(item.id, variant.id, "Missing affiliate URL");
        missingCommerceMapping.push(issue);
        allIssues.push(issue);
      }

      if (!resolved.availabilityReference.available && resolved.commerce.type !== "not_buyable") {
        const issue = asIssue(item.id, variant.id, "Resolved commerce unavailable");
        unavailableCommerce.push(issue);
        allIssues.push(issue);
      }

      const uniqueCount = new Set(gallery).size;
      if (uniqueCount !== gallery.length) {
        const issue = asIssue(item.id, variant.id, "Duplicate URLs in resolved gallery");
        duplicateVariantMedia.push(issue);
        allIssues.push(issue);
      }

      const invalidUrls = gallery.filter((url) => !isValidUrl(url));
      if (invalidUrls.length > 0) {
        const issue = asIssue(item.id, variant.id, `Invalid media URLs detected (${invalidUrls.length})`);
        invalidMediaUrls.push(issue);
        allIssues.push(issue);
      }

      const lifestyleCount = gallery.filter(isLikelyLifestyleImage).length;
      const packshotCount = gallery.filter(isLikelyPackshotImage).length;
      if (gallery.length < minGalleryImages) {
        const issue = asIssue(item.id, variant.id, `Gallery below minimum count (${gallery.length} < ${minGalleryImages})`);
        lowQualityMedia.push(issue);
        allIssues.push(issue);
      }
      if (lifestyleCount < minLifestyleImages && packshotCount >= gallery.length) {
        const issue = asIssue(item.id, variant.id, `Likely packshot-only gallery (${packshotCount}/${gallery.length})`);
        lowQualityMedia.push(issue);
        allIssues.push(issue);
      }

    }

    if (perItemGalleryCounts.length > 1) {
      const max = Math.max(...perItemGalleryCounts);
      const min = Math.min(...perItemGalleryCounts);
      if (max - min >= 2) {
        const issue = asIssue(
          item.id,
          "*",
          `Variant media parity mismatch (min=${min}, max=${max}, delta=${max - min})`
        );
        mediaParityMismatches.push(issue);
        allIssues.push(issue);
      }
    }
  }

  const itemsWithIssues = new Set(allIssues.map((entry) => entry.catalogItemId)).size;
  const variantsWithIssues = new Set(allIssues.map((entry) => `${entry.catalogItemId}:${entry.variantId}`)).size;

  return {
    itemsScanned,
    variantsScanned,
    issuesCount: allIssues.length,
    itemsWithIssues,
    variantsWithIssues,
    missingMedia,
    missingCommerceMapping,
    unavailableCommerce,
    requestedFallbacks,
    mediaParityMismatches,
    lowQualityMedia,
    duplicateVariantMedia,
    invalidMediaUrls,
    issues: allIssues,
  };
}