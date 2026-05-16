import { prisma } from "@/lib/prisma";
import { evaluateCatalogFinishCoverage, parseVariantIds } from "@/lib/finish-gate";

export type ImportStatus = "draft" | "validated" | "needs_fix" | "ready_for_review";
export type FinishMappingStatus = "unmapped" | "partial" | "mapped" | "needs_review";
export type CommerceStatus = "missing" | "mapped" | "not_buyable";
export type AssetQaStatus = "missing_thumb" | "missing_bounds" | "oversized" | "approved";
export type ApprovalStatus = "draft" | "needs_fix" | "approved";
export type LiveStatus = "not_live" | "live" | "blocked";

export type BlockerCode =
  | "missing_asset"
  | "missing_thumb"
  | "missing_bounds"
  | "invalid_dimensions"
  | "missing_finish_mapping"
  | "missing_normalized_finish"
  | "missing_commerce"
  | "missing_default_variant"
  | "not_approved"
  | "live_gate_failed";

export const BLOCKER_LABELS: Record<BlockerCode, string> = {
  missing_asset: "Missing model asset",
  missing_thumb: "Missing thumbnail",
  missing_bounds: "Missing or invalid bounds",
  invalid_dimensions: "Invalid dimensions",
  missing_finish_mapping: "Finish mapping incomplete",
  missing_normalized_finish: "Missing normalized finish",
  missing_commerce: "Missing commerce mapping",
  missing_default_variant: "Missing default variant",
  not_approved: "Asset status not approved",
  live_gate_failed: "Live gate failed",
};

export type CompletenessReport = {
  score: number;
  blockers: string[];
  warnings: string[];
  checks: {
    assetReady: boolean;
    finishReady: boolean;
    catalogReady: boolean;
    commerceReady: boolean;
    approvalReady: boolean;
  };
};

export type CatalogOpsRow = {
  catalogItemId: string;
  title: string;
  brand: string | null;
  category: string;
  thumbUrl: string | null;
  assetId: string;
  importDate: string;
  importStatus: ImportStatus;
  approvalStatus: ApprovalStatus;
  finishStatus: FinishMappingStatus;
  commerceStatus: CommerceStatus;
  assetQaStatus: AssetQaStatus;
  liveStatus: LiveStatus;
  completenessScore: number;
  blockerCount: number;
  blockers: string[];
  blockerCodes: BlockerCode[];
  warnings: string[];
  updatedAt: string;
  searchableText: string;
};

type CatalogOpsSummary = {
  totalImports: number;
  readyForReview: number;
  blocked: number;
  live: number;
  needsMapping: number;
  needsQa: number;
  readyToApprove: number;
  blockedFromPublish: number;
  liveCatalogCount: number;
};

type CatalogOpsData = {
  rows: CatalogOpsRow[];
  summary: CatalogOpsSummary;
};

export type RawItem = {
  id: string;
  title: string;
  category: string;
  slug: string;
  tags: string[];
  variantsJson: unknown;
  defaultVariantId: string | null;
  createdAt: Date;
  updatedAt: Date;
  assetId: string;
  asset: {
    id: string;
    modelUrl: string;
    thumbUrl: string;
    notes: string | null;
    approved: boolean;
    dimsWmm: number;
    dimsDmm: number;
    dimsHmm: number;
    aabbSizeX: number;
    aabbSizeY: number;
    aabbSizeZ: number;
  } | null;
  commerce: {
    type: "shopify" | "affiliate" | "not_buyable";
    shopifyVariantId: string | null;
    affiliateUrl: string | null;
  } | null;
  brandFinishes: Array<{
    id: string;
    brandName: string;
    sourceLabel: string;
    materialFamily: string | null;
  }>;
  finishMappings: Array<{
    id: string;
    variantId: string;
    component: string;
    brandFinishId: string;
    normalizedFinishId: string;
    needsReview: boolean;
  }>;
};

export type DuplicateContext = {
  duplicateAssetIds: Set<string>;
  duplicateBrandTitleKeys: Set<string>;
  duplicateBrandSkuKeys: Set<string>;
  repeatedFinishLabelKeys: Set<string>;
};

const prismaCompat = prisma as unknown as {
  catalogItem: {
    findMany: (args: unknown) => Promise<RawItem[]>;
    findUnique: (args: unknown) => Promise<RawItem | null>;
  };
};

function hasNeedsFixNote(notes: string | null | undefined): boolean {
  const text = notes ?? "";
  return text.includes("[STATUS:needs_fix]") || text.includes("[QA]");
}

function hasOversizedSignal(notes: string | null | undefined): boolean {
  const text = (notes ?? "").toLowerCase();
  return text.includes("file_too_large") || text.includes("oversized");
}

function validBounds(asset: RawItem["asset"]): boolean {
  if (!asset) return false;
  return asset.aabbSizeX > 0 && asset.aabbSizeY > 0 && asset.aabbSizeZ > 0;
}

function validDims(asset: RawItem["asset"]): boolean {
  if (!asset) return false;
  return asset.dimsWmm > 0 && asset.dimsDmm > 0 && asset.dimsHmm > 0;
}

export function buildDuplicateContext(items: RawItem[]): DuplicateContext {
  const assetCounts = new Map<string, number>();
  const brandTitleCounts = new Map<string, number>();
  const brandSkuCounts = new Map<string, number>();
  const finishLabelCounts = new Map<string, number>();

  for (const item of items) {
    assetCounts.set(item.assetId, (assetCounts.get(item.assetId) ?? 0) + 1);

    const brand = item.brandFinishes[0]?.brandName?.trim().toLowerCase() ?? "unknown";
    const titleKey = `${brand}::${item.title.trim().toLowerCase()}`;
    brandTitleCounts.set(titleKey, (brandTitleCounts.get(titleKey) ?? 0) + 1);

    const skuCandidate = item.defaultVariantId?.trim().toLowerCase() || item.slug.trim().toLowerCase();
    const skuKey = `${brand}::${skuCandidate}`;
    brandSkuCounts.set(skuKey, (brandSkuCounts.get(skuKey) ?? 0) + 1);

    for (const finish of item.brandFinishes) {
      const key = `${finish.brandName.trim().toLowerCase()}::${finish.sourceLabel.trim().toLowerCase()}`;
      finishLabelCounts.set(key, (finishLabelCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    duplicateAssetIds: new Set(
      Array.from(assetCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([assetId]) => assetId)
    ),
    duplicateBrandTitleKeys: new Set(
      Array.from(brandTitleCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
    ),
    duplicateBrandSkuKeys: new Set(
      Array.from(brandSkuCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
    ),
    repeatedFinishLabelKeys: new Set(
      Array.from(finishLabelCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([key]) => key)
    ),
  };
}

function deriveFinishStatus(item: RawItem): FinishMappingStatus {
  if (item.finishMappings.some((mapping) => mapping.needsReview)) {
    return "needs_review";
  }
  if (item.brandFinishes.length === 0 && item.finishMappings.length === 0) {
    return "unmapped";
  }
  const coverage = evaluateCatalogFinishCoverage(item);
  if (coverage.complete) return "mapped";
  if (item.finishMappings.length > 0) return "partial";
  return "unmapped";
}

function deriveCommerceStatus(item: RawItem): CommerceStatus {
  if (!item.commerce) return "missing";
  if (item.commerce.type === "not_buyable") return "not_buyable";
  if (item.commerce.type === "shopify") {
    return item.commerce.shopifyVariantId ? "mapped" : "missing";
  }
  if (item.commerce.type === "affiliate") {
    return item.commerce.affiliateUrl ? "mapped" : "missing";
  }
  return "missing";
}

function deriveAssetQaStatus(item: RawItem): AssetQaStatus {
  if (!item.asset || !item.asset.thumbUrl) return "missing_thumb";
  if (!validBounds(item.asset)) return "missing_bounds";
  if (hasOversizedSignal(item.asset.notes)) return "oversized";
  return "approved";
}

export function buildBlockers(item: RawItem, finishStatus: FinishMappingStatus, commerceStatus: CommerceStatus): BlockerCode[] {
  const blockers: BlockerCode[] = [];

  if (!item.asset || !item.asset.modelUrl) blockers.push("missing_asset");
  if (!item.asset || !item.asset.thumbUrl) blockers.push("missing_thumb");
  if (!validBounds(item.asset)) blockers.push("missing_bounds");
  if (!validDims(item.asset)) blockers.push("invalid_dimensions");
  if (!item.defaultVariantId) blockers.push("missing_default_variant");

  if (finishStatus === "unmapped" || finishStatus === "partial" || finishStatus === "needs_review") {
    blockers.push("missing_finish_mapping");
  }

  if (item.finishMappings.some((mapping) => !mapping.normalizedFinishId)) {
    blockers.push("missing_normalized_finish");
  }

  if (commerceStatus === "missing") blockers.push("missing_commerce");

  const approved = item.asset?.approved === true;
  if (!approved) blockers.push("not_approved");

  const liveGateFailed = blockers.some((code) => code !== "not_approved");
  if (liveGateFailed) blockers.push("live_gate_failed");

  return Array.from(new Set(blockers));
}

function buildWarnings(item: RawItem, duplicates: DuplicateContext): string[] {
  const warnings: string[] = [];

  const brand = item.brandFinishes[0]?.brandName?.trim().toLowerCase() ?? "unknown";
  const titleKey = `${brand}::${item.title.trim().toLowerCase()}`;
  const skuCandidate = item.defaultVariantId?.trim().toLowerCase() || item.slug.trim().toLowerCase();
  const skuKey = `${brand}::${skuCandidate}`;

  if (duplicates.duplicateAssetIds.has(item.assetId)) {
    warnings.push("Possible duplicate asset");
  }
  if (duplicates.duplicateBrandTitleKeys.has(titleKey)) {
    warnings.push("Possible duplicate title for brand");
  }
  if (duplicates.duplicateBrandSkuKeys.has(skuKey)) {
    warnings.push("Possible duplicate SKU");
  }

  for (const finish of item.brandFinishes) {
    const key = `${finish.brandName.trim().toLowerCase()}::${finish.sourceLabel.trim().toLowerCase()}`;
    if (duplicates.repeatedFinishLabelKeys.has(key)) {
      warnings.push("Repeated finish term");
      break;
    }
  }

  if (hasNeedsFixNote(item.asset?.notes)) {
    warnings.push("Needs fix flag present from QA notes");
  }

  return Array.from(new Set(warnings));
}

export function buildCompleteness(item: RawItem, blockers: BlockerCode[], finishStatus: FinishMappingStatus, commerceStatus: CommerceStatus): CompletenessReport {
  const variants = parseVariantIds(item.variantsJson);
  const checks = {
    assetReady:
      Boolean(item.asset?.modelUrl) &&
      Boolean(item.asset?.thumbUrl) &&
      validBounds(item.asset) &&
      validDims(item.asset) &&
      !hasOversizedSignal(item.asset?.notes),
    finishReady: finishStatus === "mapped",
    catalogReady:
      Boolean(item.title.trim()) &&
      Boolean(item.category) &&
      item.tags.length > 0 &&
      variants.length > 0 &&
      Boolean(item.defaultVariantId),
    commerceReady: commerceStatus === "mapped" || commerceStatus === "not_buyable",
    approvalReady: item.asset?.approved === true && !blockers.some((code) => code !== "not_approved"),
  };

  const passCount = Object.values(checks).filter(Boolean).length;
  const score = Math.round((passCount / 5) * 100);

  return {
    score,
    blockers: blockers.map((code) => BLOCKER_LABELS[code]),
    warnings: [],
    checks,
  };
}

export function buildCatalogOpsRow(item: RawItem, duplicates: DuplicateContext): CatalogOpsRow {
  const finishStatus = deriveFinishStatus(item);
  const commerceStatus = deriveCommerceStatus(item);
  const assetQaStatus = deriveAssetQaStatus(item);
  const blockers = buildBlockers(item, finishStatus, commerceStatus);
  const warnings = buildWarnings(item, duplicates);
  const completeness = buildCompleteness(item, blockers, finishStatus, commerceStatus);

  let approvalStatus: ApprovalStatus = "draft";
  if (item.asset?.approved) {
    approvalStatus = "approved";
  } else if (hasNeedsFixNote(item.asset?.notes)) {
    approvalStatus = "needs_fix";
  }

  let importStatus: ImportStatus = "draft";
  if (approvalStatus === "approved") {
    importStatus = "validated";
  } else if (approvalStatus === "needs_fix") {
    importStatus = "needs_fix";
  } else if (!blockers.some((code) => code !== "not_approved")) {
    importStatus = "ready_for_review";
  }

  const liveStatus: LiveStatus =
    blockers.some((code) => code !== "not_approved")
      ? "blocked"
      : item.asset?.approved
        ? "live"
        : "not_live";

  const brand = item.brandFinishes[0]?.brandName ?? null;
  const sourceLabels = item.brandFinishes.map((finish) => finish.sourceLabel);
  const variantIds = parseVariantIds(item.variantsJson);

  const searchableText = [
    item.title,
    item.slug,
    item.id,
    brand ?? "",
    item.assetId,
    item.defaultVariantId ?? "",
    ...variantIds,
    ...sourceLabels,
  ]
    .join(" ")
    .toLowerCase();

  return {
    catalogItemId: item.id,
    title: item.title,
    brand,
    category: item.category,
    thumbUrl: item.asset?.thumbUrl ?? null,
    assetId: item.assetId,
    importDate: item.createdAt.toISOString(),
    importStatus,
    approvalStatus,
    finishStatus,
    commerceStatus,
    assetQaStatus,
    liveStatus,
    completenessScore: completeness.score,
    blockerCount: blockers.length,
    blockers: completeness.blockers,
    blockerCodes: blockers,
    warnings,
    updatedAt: item.updatedAt.toISOString(),
    searchableText,
  };
}

export function getCatalogOpsSummary(rows: CatalogOpsRow[]): CatalogOpsSummary {
  return {
    totalImports: rows.length,
    readyForReview: rows.filter((row) => row.importStatus === "ready_for_review").length,
    blocked: rows.filter((row) => row.liveStatus === "blocked").length,
    live: rows.filter((row) => row.liveStatus === "live").length,
    needsMapping: rows.filter((row) => row.finishStatus !== "mapped").length,
    needsQa: rows.filter((row) => row.assetQaStatus !== "approved").length,
    readyToApprove: rows.filter(
      (row) => row.approvalStatus !== "approved" && !row.blockerCodes.some((code) => code !== "not_approved")
    ).length,
    blockedFromPublish: rows.filter((row) => row.blockerCodes.some((code) => code !== "not_approved")).length,
    liveCatalogCount: rows.filter((row) => row.liveStatus === "live").length,
  };
}

async function fetchRawCatalogOpsItems(): Promise<RawItem[]> {
  return prismaCompat.catalogItem.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      asset: {
        select: {
          id: true,
          modelUrl: true,
          thumbUrl: true,
          notes: true,
          approved: true,
          dimsWmm: true,
          dimsDmm: true,
          dimsHmm: true,
          aabbSizeX: true,
          aabbSizeY: true,
          aabbSizeZ: true,
        },
      },
      commerce: {
        select: {
          type: true,
          shopifyVariantId: true,
          affiliateUrl: true,
        },
      },
      brandFinishes: {
        select: {
          id: true,
          brandName: true,
          sourceLabel: true,
          materialFamily: true,
        },
      },
      finishMappings: {
        select: {
          id: true,
          variantId: true,
          component: true,
          brandFinishId: true,
          normalizedFinishId: true,
          needsReview: true,
        },
      },
    },
  });
}

export async function getCatalogOpsData(): Promise<CatalogOpsData> {
  const items = await fetchRawCatalogOpsItems();
  const duplicates = buildDuplicateContext(items);
  const rows = items.map((item) => buildCatalogOpsRow(item, duplicates));
  return {
    rows,
    summary: getCatalogOpsSummary(rows),
  };
}

export async function getCatalogOpsRowById(catalogItemId: string): Promise<CatalogOpsRow | null> {
  const items = await fetchRawCatalogOpsItems();
  const duplicates = buildDuplicateContext(items);
  const target = items.find((item) => item.id === catalogItemId);
  if (!target) return null;
  return buildCatalogOpsRow(target, duplicates);
}

// Convenience alias for callers that want a builder-style API by id.
export async function buildCatalogOpsRowByCatalogItemId(
  catalogItemId: string
): Promise<CatalogOpsRow | null> {
  return getCatalogOpsRowById(catalogItemId);
}
