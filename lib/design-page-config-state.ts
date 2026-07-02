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
import { buildProductDetailDimensionRows } from "@/lib/design-page-product-info";

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

type FullDimensionDetail = { label: string; value: string };

function formatDimensionNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function humanizeDimensionKey(key: string): string {
  const normalized = key
    .replace(/_(cm|mm|kg)$/i, "")
    .replace(/_/g, " ")
    .trim();
  if (!normalized) return "Detail";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function normalizeDimensionLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\btable top\b/g, "tabletop")
    .trim();
}

function buildDimensionsFromVariantData(args: {
  selectedProduct: CatalogItemSchema;
  selectedItem: DesignItem | null;
  selectedImportedCatalog: unknown;
}): FullDimensionDetail[] {
  const { selectedProduct, selectedItem, selectedImportedCatalog } = args;
  const activeVariant =
    selectedProduct.variants.find((variant) => variant.id === selectedItem?.variantId) ??
    selectedProduct.variants[0];
  const dims = activeVariant?.dimensionsMm ?? selectedProduct.dimsMm;
  const widthCm = Number(dims?.w ?? 0) / 10;
  const depthCm = Number(dims?.d ?? 0) / 10;
  const heightCm = Number(dims?.h ?? 0) / 10;

  if (!(widthCm > 0 && depthCm > 0 && heightCm > 0)) return [];

  const details: FullDimensionDetail[] = [
    {
      label: "Dimension",
      value: `W${formatDimensionNumber(widthCm)} x D${formatDimensionNumber(depthCm)} x H${formatDimensionNumber(heightCm)}cm`,
    },
  ];

  const catalog = selectedImportedCatalog as
    | {
        variants?: Array<{
          finish_code?: string;
          finish_label?: string;
          variant?: string;
          dimensions?: Record<string, unknown>;
        }>;
      }
    | null
    | undefined;

  const catalogVariants = Array.isArray(catalog?.variants) ? catalog.variants : [];
  if (!catalogVariants.length) return details;

  const activeFinishCode = String(activeVariant?.finishCode ?? "").trim().toLowerCase();
  const activeFinishLabel = String(activeVariant?.finishLabel ?? "").trim().toLowerCase();
  const matchedCatalogVariant =
    catalogVariants.find((entry) => {
      const code = String(entry?.finish_code ?? "").trim().toLowerCase();
      return Boolean(activeFinishCode && code && code === activeFinishCode);
    }) ??
    catalogVariants.find((entry) => {
      const label = String(entry?.finish_label ?? "").trim().toLowerCase();
      return Boolean(activeFinishLabel && label && label === activeFinishLabel);
    }) ??
    catalogVariants.find((entry) => {
      const variantLabel = String(entry?.variant ?? "").trim().toLowerCase();
      return Boolean(activeFinishLabel && variantLabel && variantLabel.includes(activeFinishLabel));
    }) ??
    catalogVariants[0];

  const rawDimensions = matchedCatalogVariant?.dimensions;
  if (!rawDimensions || typeof rawDimensions !== "object") return details;

  const extraDetails: FullDimensionDetail[] = [];
  for (const [rawKey, rawValue] of Object.entries(rawDimensions)) {
    const key = String(rawKey ?? "").trim().toLowerCase();
    if (!key || key === "width_cm" || key === "depth_cm" || key === "height_cm") continue;

    if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
      if (/_cm$/i.test(key)) {
        extraDetails.push({
          label: humanizeDimensionKey(key),
          value: `${formatDimensionNumber(rawValue)}cm`,
        });
        continue;
      }
      if (/_mm$/i.test(key)) {
        extraDetails.push({
          label: humanizeDimensionKey(key),
          value: `${formatDimensionNumber(rawValue / 10)}cm`,
        });
        continue;
      }
      if (/_kg$/i.test(key)) {
        extraDetails.push({
          label: humanizeDimensionKey(key),
          value: `${formatDimensionNumber(rawValue)}kg`,
        });
        continue;
      }
      extraDetails.push({
        label: humanizeDimensionKey(key),
        value: formatDimensionNumber(rawValue),
      });
      continue;
    }

    if (typeof rawValue === "string" && rawValue.trim().length > 0) {
      extraDetails.push({
        label: humanizeDimensionKey(key),
        value: rawValue.trim(),
      });
    }
  }

  const byLabel = new Set(details.map((entry) => normalizeDimensionLabel(entry.label)));
  for (const entry of extraDetails) {
    const labelKey = normalizeDimensionLabel(entry.label);
    if (byLabel.has(labelKey)) continue;
    byLabel.add(labelKey);
    details.push(entry);
  }

  return details;
}

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
  const fullDimensionsDetails = useMemo(() => {
    if (!selectedProduct) return null;

    const curated = FULL_DIMENSIONS_BY_PRODUCT_ID[selectedProduct.id];
    const importedProductDetails = buildProductDetailDimensionRows({
      selectedProduct,
      selectedItem,
      selectedImportedCatalog,
    });
    const synthesized = buildDimensionsFromVariantData({
      selectedProduct,
      selectedItem,
      selectedImportedCatalog,
    });

    if (importedProductDetails.length) {
      if (!synthesized.length) return importedProductDetails;
      const merged = [...importedProductDetails];
      const labelSet = new Set(importedProductDetails.map((entry) => normalizeDimensionLabel(entry.label)));
      for (const entry of synthesized) {
        const key = normalizeDimensionLabel(entry.label);
        if (labelSet.has(key)) continue;
        labelSet.add(key);
        merged.push(entry);
      }
      return merged;
    }

    if (curated?.length) {
      if (!synthesized.length) return curated;
      const merged = [...curated];
      const labelSet = new Set(curated.map((entry) => normalizeDimensionLabel(entry.label)));
      for (const entry of synthesized) {
        const key = normalizeDimensionLabel(entry.label);
        if (labelSet.has(key)) continue;
        labelSet.add(key);
        merged.push(entry);
      }
      return merged;
    }

    return synthesized.length ? synthesized : null;
  }, [selectedProduct, selectedItem, selectedImportedCatalog]);

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
