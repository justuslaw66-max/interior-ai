import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  CATEGORY_DEFAULTS,
  type CatalogItemSchema,
  type ProductCategory,
  type ProductVariant,
} from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import type {
  DesignItem,
  DesignSnapshot,
  PersistedProductSnapshot,
} from "@/lib/room-types";

function isCatalogCategory(value: string): value is ProductCategory {
  return Object.prototype.hasOwnProperty.call(CATEGORY_DEFAULTS, value);
}

export function createPersistedProductSnapshot(
  product: CatalogItemSchema,
  requestedVariantId: string
): PersistedProductSnapshot {
  const resolved = resolveCatalogVariant(product, requestedVariantId);
  return {
    schemaVersion: 1,
    productId: product.id,
    variantId: resolved.variantId,
    name: product.title,
    category: product.category,
    dimensionsMm: { ...resolved.dimsMm },
    variantLabel: resolved.variant.label,
    finish: {
      code: resolved.finish.code,
      label: resolved.finish.label,
      colorHex: resolved.finish.swatchHex ?? resolved.variant.colorHex,
    },
    assets: {
      assetId: product.assets.assetId || undefined,
      modelUrl:
        resolved.variant.modelUrl ?? product.assets.modelUrl ?? undefined,
      thumbnailUrl:
        resolved.media.thumbUrl ?? product.assets.thumbUrl ?? undefined,
      materialPreset: product.assets.materialsProfile.preset || undefined,
    },
    ...(product.lighting
      ? {
          lighting: {
            ...product.lighting,
            localOffsetMeters: [...product.lighting.localOffsetMeters],
            direction: [...product.lighting.direction],
            ...(product.lighting.emissiveMeshNames
              ? {
                  emissiveMeshNames: [
                    ...product.lighting.emissiveMeshNames,
                  ],
                }
              : {}),
          },
        }
      : {}),
  };
}

export function enrichDesignItemProductSnapshot(
  item: DesignItem,
  catalogItems: typeof CATALOG_ITEMS = CATALOG_ITEMS
): DesignItem {
  if (item.assetType === "parametric_cabinet") return item;
  if (
    item.productSnapshot?.productId === item.productId &&
    item.productSnapshot.variantId === item.variantId
  ) {
    return item;
  }
  const product = catalogItems[item.productId];
  if (!product) return item;
  return {
    ...item,
    productSnapshot: createPersistedProductSnapshot(product, item.variantId),
  };
}

export function enrichDesignSnapshotProductSnapshots(
  snapshot: DesignSnapshot,
  catalogItems: typeof CATALOG_ITEMS = CATALOG_ITEMS
): DesignSnapshot {
  return {
    ...snapshot,
    rooms: snapshot.rooms.map((room) => ({
      ...room,
      items: room.items.map((item) =>
        enrichDesignItemProductSnapshot(item, catalogItems)
      ),
    })),
  };
}

function buildSavedVariant(
  snapshot: PersistedProductSnapshot,
  liveVariant?: ProductVariant
): ProductVariant {
  return {
    ...liveVariant,
    id: snapshot.variantId,
    label: snapshot.variantLabel,
    colorHex:
      snapshot.finish?.colorHex ?? liveVariant?.colorHex ?? "#9ca3af",
    finishCode: snapshot.finish?.code,
    finishLabel: snapshot.finish?.label,
    thumbnailUrl:
      snapshot.assets.thumbnailUrl ?? liveVariant?.thumbnailUrl ?? "",
    dimensionsMm: { ...snapshot.dimensionsMm },
    modelUrl: snapshot.assets.modelUrl ?? liveVariant?.modelUrl,
  };
}

/**
 * Resolve the immutable visual representation for an item. Commerce callers
 * must continue to resolve the current catalog entry directly.
 */
export function resolveDesignItemVisualProduct(
  item: DesignItem,
  catalogItems: typeof CATALOG_ITEMS = CATALOG_ITEMS
): CatalogItemSchema | null {
  const live = catalogItems[item.productId];
  const snapshot = item.productSnapshot;
  if (!snapshot || snapshot.productId !== item.productId) return live ?? null;

  const category = isCatalogCategory(snapshot.category)
    ? snapshot.category
    : live?.category ?? "other";
  const defaults = CATEGORY_DEFAULTS[category];
  const liveVariant = live?.variants.find(
    (variant) => variant.id === snapshot.variantId
  );
  const savedVariant = buildSavedVariant(snapshot, liveVariant);
  const variants = live
    ? [
        savedVariant,
        ...live.variants.filter((variant) => variant.id !== savedVariant.id),
      ]
    : [savedVariant];
  const dimensions = { ...snapshot.dimensionsMm };

  return {
    ...(live ?? {
      id: snapshot.productId,
      slug: snapshot.productId,
      title: snapshot.name,
      category,
      defaultRotation: 0,
      placementRules: defaults.placement,
      clearanceRules: defaults.clearance,
      styleTags: [],
      toneTags: [],
      roomTags: [],
      commerce: {
        type: "not_buyable" as const,
        reason: "Catalog item is no longer available",
      },
      pivot: { offsetX: 0, offsetZ: 0, groundAligned: true },
    }),
    id: snapshot.productId,
    slug: live?.slug ?? snapshot.productId,
    title: snapshot.name,
    category,
    dimsMm: dimensions,
    dimensionsMm: dimensions,
    bounds: {
      type: "aabb",
      size: {
        w: dimensions.w / 1000,
        d: dimensions.d / 1000,
        h: dimensions.h / 1000,
      },
      center: [0, dimensions.h / 2000, 0],
    },
    assets: {
      assetId:
        snapshot.assets.assetId ?? live?.assets.assetId ?? snapshot.productId,
      modelUrl: snapshot.assets.modelUrl ?? live?.assets.modelUrl ?? "",
      thumbUrl: snapshot.assets.thumbnailUrl ?? live?.assets.thumbUrl ?? "",
      materialsProfile: {
        ...(live?.assets.materialsProfile ?? {}),
        preset:
          snapshot.assets.materialPreset ??
          live?.assets.materialsProfile.preset ??
          "default",
      },
    },
    lighting: snapshot.lighting ?? live?.lighting,
    variants,
    defaultVariantId: snapshot.variantId,
  };
}
