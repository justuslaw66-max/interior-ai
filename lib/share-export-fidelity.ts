import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { DesignItem, DesignSnapshot } from "@/lib/room-types";
import { migrateToV3 } from "@/lib/room-types";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";

export type ShareExportFidelitySummary = {
  fingerprint: string;
  roomCount: number;
  itemCount: number;
  openingCount: number;
  savedViewCount: number;
  checkoutReadyCount: number;
  retailerReadyCount: number;
  missingCommerceCount: number;
};

function getLinePrice(item: CatalogItemSchema, resolved: ReturnType<typeof resolveCatalogVariant>) {
  if (resolved.commerce.type === "affiliate") {
    return resolved.commerce.priceHint ?? item.metadata?.priceUsd ?? 0;
  }
  return item.metadata?.priceUsd ?? resolved.variant.priceHint ?? 0;
}

function classifyShoppingItem(
  designItem: DesignItem,
  catalogItems: Record<string, CatalogItemSchema | undefined>
) {
  const product = catalogItems[designItem.productId];
  if (!product) return "missing" as const;
  const resolved = resolveCatalogVariant(product, designItem.variantId);
  const price = getLinePrice(product, resolved);
  if (price <= 0) return "missing" as const;
  if (resolved.commerce.type === "shopify") {
    return resolved.commerce.variantId && resolved.commerce.available ? "checkout" : "missing";
  }
  if (resolved.commerce.type === "affiliate") {
    return resolved.commerce.url ? "retailer" : "missing";
  }
  return "missing" as const;
}

export function buildShareExportFidelitySummary(
  snapshot: DesignSnapshot,
  catalogItems: Record<string, CatalogItemSchema | undefined> = {}
): ShareExportFidelitySummary {
  const migrated = migrateToV3(snapshot);
  const items = migrated.rooms.flatMap((room) => room.items);
  const classifications = items.map((item) => classifyShoppingItem(item, catalogItems));

  return {
    fingerprint: fingerprintDesignSnapshot(migrated),
    roomCount: migrated.rooms.length,
    itemCount: items.length,
    openingCount: migrated.floorPlan?.openings?.length ?? 0,
    savedViewCount: migrated.rooms.reduce((sum, room) => sum + room.savedViews.length, 0),
    checkoutReadyCount: classifications.filter((entry) => entry === "checkout").length,
    retailerReadyCount: classifications.filter((entry) => entry === "retailer").length,
    missingCommerceCount: classifications.filter((entry) => entry === "missing").length,
  };
}
