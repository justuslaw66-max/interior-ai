export type CatalogItemForFinishGate = {
  id: string;
  variantsJson: unknown;
  brandFinishes: Array<{ id: string }>;
  finishMappings: Array<{
    id: string;
    variantId: string;
    component: string;
    brandFinishId: string;
    needsReview: boolean;
  }>;
};

export type CatalogFinishIssueCode =
  | "MISSING_VARIANTS"
  | "MISSING_BRAND_FINISHES"
  | "UNMAPPED_BRAND_FINISH"
  | "UNMAPPED_VARIANT"
  | "MAPPINGS_NEED_REVIEW";

export type CatalogFinishIssue = {
  code: CatalogFinishIssueCode;
  message: string;
};

export type CatalogFinishCoverage = {
  catalogItemId: string;
  variantIds: string[];
  mappedVariantIds: string[];
  totalBrandFinishes: number;
  mappedBrandFinishCount: number;
  issues: CatalogFinishIssue[];
  complete: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseVariantIds(variantsJson: unknown): string[] {
  if (!Array.isArray(variantsJson)) return [];
  return variantsJson
    .filter(isRecord)
    .map((entry) => asString(entry.id))
    .filter((id) => Boolean(id));
}

export function evaluateCatalogFinishCoverage(
  item: CatalogItemForFinishGate
): CatalogFinishCoverage {
  const variantIds = parseVariantIds(item.variantsJson);
  const mappedVariantIdsSet = new Set(item.finishMappings.map((m) => m.variantId).filter(Boolean));
  const mappedBrandIdsSet = new Set(item.finishMappings.map((m) => m.brandFinishId));
  const issues: CatalogFinishIssue[] = [];

  if (variantIds.length === 0) {
    issues.push({
      code: "MISSING_VARIANTS",
      message: "Catalog item has no variants for finish mapping.",
    });
  }

  if (item.brandFinishes.length === 0) {
    issues.push({
      code: "MISSING_BRAND_FINISHES",
      message: "No raw supplier finishes are stored for this catalog item.",
    });
  }

  if (item.brandFinishes.length > 0) {
    const unmappedBrandFinishes = item.brandFinishes.filter(
      (brandFinish) => !mappedBrandIdsSet.has(brandFinish.id)
    );
    if (unmappedBrandFinishes.length > 0) {
      issues.push({
        code: "UNMAPPED_BRAND_FINISH",
        message: `${unmappedBrandFinishes.length} supplier finish(es) are not mapped to normalized finishes.`,
      });
    }
  }

  if (variantIds.length > 0) {
    const unmappedVariants = variantIds.filter((variantId) => !mappedVariantIdsSet.has(variantId));
    if (unmappedVariants.length > 0) {
      issues.push({
        code: "UNMAPPED_VARIANT",
        message: `${unmappedVariants.length} variant(s) are missing finish mappings.`,
      });
    }
  }

  if (item.finishMappings.some((mapping) => mapping.needsReview)) {
    issues.push({
      code: "MAPPINGS_NEED_REVIEW",
      message: "Some finish mappings are marked as needing admin review.",
    });
  }

  return {
    catalogItemId: item.id,
    variantIds,
    mappedVariantIds: Array.from(mappedVariantIdsSet),
    totalBrandFinishes: item.brandFinishes.length,
    mappedBrandFinishCount: mappedBrandIdsSet.size,
    issues,
    complete: issues.length === 0,
  };
}

export function isCatalogFinishPublishReady(item: CatalogItemForFinishGate): boolean {
  return evaluateCatalogFinishCoverage(item).complete;
}
