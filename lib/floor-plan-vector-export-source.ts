import type { DesignItem } from "@/lib/room-types";
import type { CatalogItemSchema, DimensionsMm } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";

type FurnitureResolvers = {
  resolveItemConfigurationEntry: (item: DesignItem) => unknown;
  resolveConfiguredVisualDimsMm: (item: DesignItem, product: CatalogItemSchema) => DimensionsMm;
};

/** Match the scene's configuration-before-variant dimension choice, without inspecting unsaved preview controls. */
export function resolveVectorFurnitureDimensions(item: DesignItem, product: CatalogItemSchema, resolvers: FurnitureResolvers): DimensionsMm | null {
  if (resolvers.resolveItemConfigurationEntry(item)) return resolvers.resolveConfiguredVisualDimsMm(item, product);
  if (item.configurationCode) return null;
  return resolveCatalogVariant(product, item.variantId).dimsMm;
}
