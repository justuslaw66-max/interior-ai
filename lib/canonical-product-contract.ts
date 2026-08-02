import type {
  CatalogAssetQualityStatus,
  CatalogItemSchema,
  CatalogLicensingStatus,
  ProductCategory,
} from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";

export const CANONICAL_PRODUCT_CONTRACT_VERSION = 1 as const;
export const CANONICAL_DIMENSION_UNIT = "mm" as const;

export type CanonicalProductVariant = {
  variantId: string;
  name: string;
  dimensions: { unit: "mm"; width: number; depth: number; height: number };
  finish: {
    code: string;
    label: string;
    colorHex: string;
    materialType: string | null;
  };
  images: string[];
  asset: { modelUrl: string };
};

export type LiveProductCommerceData = {
  currency: string;
  currentPrice: number | null;
  stock: "available" | "unavailable" | "unknown";
  deliveryInformation: string | null;
  purchaseDestination: {
    type: "shopify_checkout" | "affiliate";
    url: string;
  } | null;
  promotions: string[];
  availableVariantIds: string[];
  lastSynchronizedAt: string | null;
};

export type CanonicalProductContract = {
  schemaVersion: typeof CANONICAL_PRODUCT_CONTRACT_VERSION;
  productId: string;
  merchantId: string;
  productName: string;
  brand: string;
  category: ProductCategory;
  dimensions: { unit: "mm"; width: number; depth: number; height: number };
  images: string[];
  asset: {
    assetId: string;
    modelUrl: string;
  };
  variants: CanonicalProductVariant[];
  liveCommerce: LiveProductCommerceData;
  licensing: {
    status: CatalogLicensingStatus;
    licenseId: string | null;
    sourceUrl: string | null;
    attribution: string | null;
    usageNotes: string | null;
    verifiedAt: string | null;
  };
  assetQuality: {
    status: CatalogAssetQualityStatus;
    validatorVersion: string | null;
    validatedAt: string | null;
  };
};

export type CanonicalProductContractIssue = {
  severity: "error" | "warning";
  code: string;
  field: string;
  message: string;
};

function uniqueUrls(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function normalizeTimestamp(value: string | number | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const timestamp = new Date(value).toISOString();
    return Number.isNaN(Date.parse(timestamp)) ? null : timestamp;
  }
  if (typeof value === "string" && value.trim() && !Number.isNaN(Date.parse(value))) {
    return new Date(value).toISOString();
  }
  return null;
}

function resolveMerchantId(item: CatalogItemSchema) {
  if (item.metadata?.merchantId?.trim()) return item.metadata.merchantId.trim();
  if (item.commerce.type === "shopify") return item.commerce.data.productId;
  if (item.commerce.type === "affiliate") {
    return `${item.commerce.data.retailer.trim().toLowerCase()}:${item.slug}`;
  }
  return `catalog:${item.id}`;
}

function resolveBrand(item: CatalogItemSchema) {
  if (item.metadata?.brand?.trim()) return item.metadata.brand.trim();
  if (item.commerce.type === "affiliate" && item.commerce.data.retailer.trim()) {
    return item.commerce.data.retailer.trim();
  }
  return "Unspecified brand";
}

function resolveLiveCommerce(item: CatalogItemSchema): LiveProductCommerceData {
  const defaultResolved = resolveCatalogVariant(item, item.defaultVariantId);
  const currency = item.metadata?.currencyCode?.trim().toUpperCase() || "USD";
  const currentPrice =
    defaultResolved.commerce.type === "affiliate"
      ? defaultResolved.commerce.priceHint ?? item.metadata?.priceUsd ?? null
      : item.metadata?.priceUsd ?? defaultResolved.variant.priceHint ?? null;
  const purchaseDestination =
    defaultResolved.commerce.type === "affiliate" && defaultResolved.commerce.url
      ? { type: "affiliate" as const, url: defaultResolved.commerce.url }
      : defaultResolved.commerce.type === "shopify" && defaultResolved.commerce.variantId
        ? { type: "shopify_checkout" as const, url: "/api/shopify/checkout" }
        : null;
  const availableVariantIds = item.variants.flatMap((variant) => {
    const resolved = resolveCatalogVariant(item, variant.id);
    return resolved.commerce.type === "not_buyable" || !resolved.commerce.available
      ? []
      : [resolved.variantId];
  });
  const stock =
    defaultResolved.commerce.type === "not_buyable"
      ? "unknown"
      : defaultResolved.commerce.available
        ? "available"
        : "unavailable";

  return {
    currency,
    currentPrice,
    stock,
    deliveryInformation: item.metadata?.deliveryInformation?.trim() || null,
    purchaseDestination,
    promotions: item.metadata?.promotions?.filter((entry) => entry.trim().length > 0) ?? [],
    availableVariantIds,
    lastSynchronizedAt: normalizeTimestamp(
      item.metadata?.lastSynchronizedAt ?? item.updatedAt ?? item.createdAt
    ),
  };
}

export function buildCanonicalProductContract(item: CatalogItemSchema): CanonicalProductContract {
  const brand = resolveBrand(item);
  const licensing = item.metadata?.licensing;
  const assetQuality = item.metadata?.assetQuality;

  return {
    schemaVersion: CANONICAL_PRODUCT_CONTRACT_VERSION,
    productId: item.id,
    merchantId: resolveMerchantId(item),
    productName: item.title,
    brand,
    category: item.category,
    dimensions: {
      unit: CANONICAL_DIMENSION_UNIT,
      width: item.dimsMm.w,
      depth: item.dimsMm.d,
      height: item.dimsMm.h,
    },
    images: uniqueUrls([
      item.assets.thumbUrl,
      ...(item.metadata?.galleryImages ?? []),
      ...item.variants.flatMap((variant) => [variant.thumbnailUrl, ...(variant.galleryImages ?? [])]),
    ]),
    asset: {
      assetId: item.assets.assetId,
      modelUrl: item.assets.modelUrl,
    },
    variants: item.variants.map((variant) => {
      const resolved = resolveCatalogVariant(item, variant.id);
      return {
        variantId: resolved.variantId,
        name: resolved.variant.label,
        dimensions: {
          unit: CANONICAL_DIMENSION_UNIT,
          width: resolved.dimsMm.w,
          depth: resolved.dimsMm.d,
          height: resolved.dimsMm.h,
        },
        finish: {
          code: resolved.finish.code,
          label: resolved.finish.label,
          colorHex: resolved.finish.swatchHex ?? resolved.variant.colorHex,
          materialType: resolved.variant.materialType ?? null,
        },
        images: uniqueUrls([
          resolved.media.thumbUrl,
          ...resolved.media.galleryImages,
        ]),
        asset: {
          modelUrl: resolved.variant.modelUrl ?? item.assets.modelUrl,
        },
      };
    }),
    liveCommerce: resolveLiveCommerce(item),
    licensing: {
      status: licensing?.status ?? "unverified",
      licenseId: licensing?.licenseId?.trim() || null,
      sourceUrl: licensing?.sourceUrl?.trim() || null,
      attribution: licensing?.attribution?.trim() || brand || null,
      usageNotes: licensing?.usageNotes?.trim() || null,
      verifiedAt: normalizeTimestamp(licensing?.verifiedAt),
    },
    assetQuality: {
      status: assetQuality?.status ?? "needs_review",
      validatorVersion: assetQuality?.validatorVersion?.trim() || null,
      validatedAt: normalizeTimestamp(assetQuality?.validatedAt),
    },
  };
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

export function validateCanonicalProductContract(
  contract: CanonicalProductContract
): CanonicalProductContractIssue[] {
  const issues: CanonicalProductContractIssue[] = [];
  const error = (code: string, field: string, message: string) =>
    issues.push({ severity: "error", code, field, message });
  const warning = (code: string, field: string, message: string) =>
    issues.push({ severity: "warning", code, field, message });

  if (!contract.productId.trim()) error("PRODUCT_ID_MISSING", "productId", "Stable product ID is required.");
  if (!contract.merchantId.trim()) error("MERCHANT_ID_MISSING", "merchantId", "Merchant ID is required.");
  if (!contract.productName.trim()) error("PRODUCT_NAME_MISSING", "productName", "Product name is required.");
  if (!contract.brand.trim()) error("BRAND_MISSING", "brand", "Brand is required.");
  if (
    !isPositiveInteger(contract.dimensions.width) ||
    !isPositiveInteger(contract.dimensions.depth) ||
    !isPositiveInteger(contract.dimensions.height)
  ) {
    error("DIMENSIONS_INVALID", "dimensions", "Canonical dimensions must be positive whole millimetres.");
  }
  if (contract.dimensions.unit !== CANONICAL_DIMENSION_UNIT) {
    error("UNIT_INVALID", "dimensions.unit", "Canonical product dimensions must use millimetres.");
  }
  if (contract.images.length === 0) error("PRODUCT_IMAGES_MISSING", "images", "At least one product image is required.");
  if (!contract.asset.assetId.trim() || !contract.asset.modelUrl.trim()) {
    error("MODEL_ASSET_MISSING", "asset", "A stable asset ID and 3D model URL are required.");
  }
  if (contract.variants.length === 0) error("VARIANTS_MISSING", "variants", "At least one variant is required.");
  if (!/^[A-Z]{3}$/.test(contract.liveCommerce.currency)) {
    error("CURRENCY_INVALID", "liveCommerce.currency", "Currency must use an ISO-style three-letter code.");
  }
  if (
    contract.liveCommerce.purchaseDestination &&
    contract.liveCommerce.currentPrice !== null &&
    !(contract.liveCommerce.currentPrice > 0)
  ) {
    error("PRICE_INVALID", "liveCommerce.currentPrice", "Buyable products need a positive current price.");
  }
  if (!contract.liveCommerce.lastSynchronizedAt) {
    warning("SYNC_TIME_UNKNOWN", "liveCommerce.lastSynchronizedAt", "Last commerce synchronization time is unknown.");
  }
  if (contract.licensing.status !== "verified") {
    warning("LICENSE_UNVERIFIED", "licensing.status", "Asset licensing requires explicit verification.");
  }
  if (!contract.licensing.attribution) {
    warning("ATTRIBUTION_MISSING", "licensing.attribution", "Asset attribution metadata is missing.");
  }
  if (contract.assetQuality.status !== "approved") {
    warning("ASSET_QUALITY_REVIEW", "assetQuality.status", "Asset quality has not been explicitly approved.");
  }

  return issues;
}
