import type { ResolvedCatalogVariant } from "@/lib/catalog/variant-resolver";
import { track } from "@/lib/analytics";

type VariantIssueContext = {
  surface: string;
  requestedVariantId?: string;
};

const seenKeys = new Set<string>();

export function trackVariantIssues(resolved: ResolvedCatalogVariant, context: VariantIssueContext) {
  if (typeof window === "undefined") return;

  const issueKeys = new Set<string>();
  if (!resolved.matchedRequestedVariant && context.requestedVariantId) {
    issueKeys.add(`requested_variant_missing:${context.requestedVariantId}`);
  }
  if (!resolved.media.thumbUrl) {
    issueKeys.add("missing_thumb");
  }
  for (const issue of resolved.issues) {
    issueKeys.add(issue);
  }

  for (const issue of issueKeys) {
    const dedupeKey = [context.surface, resolved.catalogItemId, resolved.variantId, issue].join(":");
    if (seenKeys.has(dedupeKey)) continue;
    seenKeys.add(dedupeKey);
    track("catalog_variant_resolution_issue", {
      surface: context.surface,
      catalog_item_id: resolved.catalogItemId,
      variant_id: resolved.variantId,
      requested_variant_id: context.requestedVariantId ?? resolved.requestedVariantId ?? null,
      matched_requested_variant: resolved.matchedRequestedVariant,
      issue,
      media_thumb_present: Boolean(resolved.media.thumbUrl),
      commerce_type: resolved.commerce.type,
      availability_source: resolved.availabilityReference.source,
      price_source: resolved.priceReference.source,
    });
  }
}