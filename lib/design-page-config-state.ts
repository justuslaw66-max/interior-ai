import { useCallback, useMemo } from "react";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { DesignItem } from "@/lib/room-types";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import {
  resolveItemConfigurationCode as _resolveItemConfigurationCode,
  resolveItemConfigurationEntry as _resolveItemConfigurationEntry,
  resolveConfiguredVisualDimsMm as _resolveConfiguredVisualDimsMm,
  resolveConfiguredPlanningDimsMm as _resolveConfiguredPlanningDimsMm,
  resolveConfiguredNodeTransforms as _resolveConfiguredNodeTransforms,
  resolveConfiguredModelUrl as _resolveConfiguredModelUrl,
} from "@/lib/design-page-config-resolvers";
import { FULL_DIMENSIONS_BY_PRODUCT_ID } from "@/lib/design-page-product-data";

type UseDesignPageConfigStateParams = {
  importedModelOptions: ImportedModelOption[];
  itemConfigurationByInstanceId: Record<string, string>;
  importedModelUrlByAssetId: Record<string, string>;
  selectedItem: DesignItem | null;
  items: DesignItem[];
  catalogItems: typeof CATALOG_ITEMS;
};

type BuildItemPlanningBoundsByInstanceIdParams = {
  items: DesignItem[];
  catalogItems: typeof CATALOG_ITEMS;
  resolveConfiguredPlanningDimsMm: (
    item: DesignItem,
    fallbackProduct: CatalogItemSchema
  ) => { w: number; d: number; h: number };
  resolveItemConfigurationEntry: (item: DesignItem | null | undefined) => unknown;
};

export function buildItemPlanningBoundsByInstanceId({
  items,
  catalogItems,
  resolveConfiguredPlanningDimsMm,
  resolveItemConfigurationEntry,
}: BuildItemPlanningBoundsByInstanceIdParams): Record<string, { w: number; d: number; h: number }> {
  return Object.fromEntries(
    items.map((item) => {
      const product = catalogItems[item.productId];
      if (!product) return [item.instanceId, { w: 0, d: 0, h: 0 }];
      const variant = product.variants.find((v) => v.id === item.variantId) ?? product.variants[0];
      const configured = resolveConfiguredPlanningDimsMm(item, product);
      const hasConfigurationOverride = Boolean(resolveItemConfigurationEntry(item));
      const variantDims = variant?.dimensionsMm;
      const dims =
        !hasConfigurationOverride &&
        variantDims &&
        Number(variantDims.w) > 0 &&
        Number(variantDims.d) > 0
          ? {
              w: variantDims.w,
              d: variantDims.d,
              h: Number(variantDims.h) > 0 ? variantDims.h : configured.h,
            }
          : configured;
      return [item.instanceId, dims];
    })
  );
}

export function useDesignPageConfigState(params: UseDesignPageConfigStateParams) {
  const {
    importedModelOptions,
    itemConfigurationByInstanceId,
    importedModelUrlByAssetId,
    selectedItem,
    items,
    catalogItems,
  } = params;

  const importedModelById = useMemo(
    () => new Map(importedModelOptions.map((option) => [option.id, option])),
    [importedModelOptions]
  );

  const resolveItemConfigurationCode = useCallback((item: DesignItem | null | undefined) => {
    return _resolveItemConfigurationCode(item, { importedModelById, itemConfigurationByInstanceId });
  }, [importedModelById, itemConfigurationByInstanceId]);

  const resolveItemConfigurationEntry = useCallback((item: DesignItem | null | undefined) => {
    return _resolveItemConfigurationEntry(item, { importedModelById, itemConfigurationByInstanceId });
  }, [importedModelById, itemConfigurationByInstanceId]);

  const resolveConfiguredVisualDimsMm = useCallback((
    item: DesignItem,
    fallbackProduct: CatalogItemSchema
  ): { w: number; d: number; h: number } => {
    return _resolveConfiguredVisualDimsMm(item, fallbackProduct, { importedModelById, itemConfigurationByInstanceId });
  }, [importedModelById, itemConfigurationByInstanceId]);

  const resolveConfiguredPlanningDimsMm = useCallback((
    item: DesignItem,
    fallbackProduct: CatalogItemSchema
  ): { w: number; d: number; h: number } => {
    return _resolveConfiguredPlanningDimsMm(item, fallbackProduct, { importedModelById, itemConfigurationByInstanceId });
  }, [importedModelById, itemConfigurationByInstanceId]);

  const resolveConfiguredNodeTransforms = useCallback((item: DesignItem | null | undefined) => {
    return _resolveConfiguredNodeTransforms(item, { importedModelById, itemConfigurationByInstanceId });
  }, [importedModelById, itemConfigurationByInstanceId]);

  const resolveConfiguredModelUrl = useCallback((
    item: DesignItem,
    fallbackModelUrl: string | undefined,
    variantId: string
  ) => {
    return _resolveConfiguredModelUrl(item, fallbackModelUrl, variantId, {
      importedModelById,
      itemConfigurationByInstanceId,
      importedModelUrlByAssetId,
      catalogItems,
    });
  }, [importedModelById, itemConfigurationByInstanceId, importedModelUrlByAssetId, catalogItems]);

  const selectedProduct = selectedItem ? catalogItems[selectedItem.productId] : null;
  const selectedImportedCatalog = selectedProduct
    ? importedModelById.get(selectedProduct.id)?.catalog ?? null
    : null;
  const selectedConfigurationCode = resolveItemConfigurationCode(selectedItem);
  const selectedConfigUi = selectedImportedCatalog?.configurableMetadata?.configuration_ui;
  const selectedConfigOptions = selectedConfigUi?.options ?? [];
  const selectedConfigEntry = selectedItem ? resolveItemConfigurationEntry(selectedItem) : null;
  const selectedConfigBehavior = selectedImportedCatalog?.configurableMetadata?.configuration_behavior;
  const fullDimensionsDetails = selectedProduct
    ? FULL_DIMENSIONS_BY_PRODUCT_ID[selectedProduct.id] ?? null
    : null;

  const itemPlanningBoundsByInstanceId = useMemo(
    () =>
      buildItemPlanningBoundsByInstanceId({
        items,
        catalogItems,
        resolveConfiguredPlanningDimsMm,
        resolveItemConfigurationEntry,
      }),
    [items, catalogItems, resolveConfiguredPlanningDimsMm, resolveItemConfigurationEntry]
  );

  return {
    importedModelById,
    resolveItemConfigurationCode,
    resolveItemConfigurationEntry,
    resolveConfiguredVisualDimsMm,
    resolveConfiguredPlanningDimsMm,
    resolveConfiguredNodeTransforms,
    resolveConfiguredModelUrl,
    selectedProduct,
    selectedImportedCatalog,
    selectedConfigurationCode,
    selectedConfigUi,
    selectedConfigOptions,
    selectedConfigEntry,
    selectedConfigBehavior,
    fullDimensionsDetails,
    itemPlanningBoundsByInstanceId,
  };
}
