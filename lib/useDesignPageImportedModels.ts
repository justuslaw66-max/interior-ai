import { useCallback, useEffect, useMemo, useState } from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import {
  buildImportedModelOptions,
  normalizeImportedFamilyName,
  shouldRefreshImportedCatalogItem,
  type ImportedModelCatalog,
  type ImportedModelEntry,
  type ImportedModelOption,
  upsertImportedCatalogItem,
} from "@/lib/catalog/imported-model-assembly";
import {
  ARM_STYLE_OPTIONS_BY_PRODUCT_ID,
  LENGTH_OPTIONS_BY_PRODUCT_ID,
  MODEL_FAMILY_BY_PRODUCT_ID,
  MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID,
  ORIENTATION_OPTIONS_BY_PRODUCT_ID,
} from "@/lib/design-page-model-maps";
import {
  IMPORTED_PRODUCT_CONFIG_BY_ID,
  IMPORTED_VARIANT_BY_PRODUCT_ID,
  IMPORTED_VARIANTS_BY_PRODUCT_ID,
} from "@/lib/design-page-product-data";

export type ImportedFamilyOption = {
  familyKey: string;
  familyLabel: string;
};

function isCuratedHuggNestingProductId(productId: string): boolean {
  return /^coffee-real-castlery-hugg-nesting-(square|rectangular|side-table)-performance-/.test(
    productId
  );
}

function canReplaceCatalogItem(option: ImportedModelOption): boolean {
  const existing = CATALOG_ITEMS[option.id];
  const isImportedExisting = Boolean(
    existing && String(existing.defaultVariantId ?? "").startsWith("imported-")
  );
  const supportsConfigurableStates = Boolean(
    option.catalog?.configurableMetadata?.is_configurable ||
      (option.catalog?.configurations?.length ?? 0) > 0
  );
  if (
    existing &&
    !isImportedExisting &&
    isCuratedHuggNestingProductId(option.id) &&
    !supportsConfigurableStates
  ) {
    return false;
  }
  return !existing || isImportedExisting || supportsConfigurableStates;
}

function upsertImportedOption(option: ImportedModelOption): void {
  if (!canReplaceCatalogItem(option)) return;
  upsertImportedCatalogItem({
    productId: option.id,
    imported: option,
    importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
    importedVariantByProductId: IMPORTED_VARIANT_BY_PRODUCT_ID,
    importedVariantsByProductId: IMPORTED_VARIANTS_BY_PRODUCT_ID,
  });
}

export function buildFurnishCatalogItems(
  catalogItemsById: Readonly<Record<string, CatalogItemSchema>>
): CatalogItemSchema[] {
  return Object.values(catalogItemsById);
}

export function useDesignPageImportedModels() {
  const [selectedFamilyKey, setSelectedFamilyKey] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [modelOptions, setModelOptions] = useState<ImportedModelOption[]>([]);
  const [catalogByProductId, setCatalogByProductId] = useState<
    Record<string, ImportedModelCatalog>
  >({});
  const [catalogItemsById, setCatalogItemsById] = useState(() => ({
    ...CATALOG_ITEMS,
  }));
  const [modelUrlByAssetId, setModelUrlByAssetId] = useState<Record<string, string>>({});

  const modelById = useMemo(
    () => new Map(modelOptions.map((option) => [option.id, option])),
    [modelOptions]
  );

  const ensureCatalogItem = useCallback(
    (productId: string) => {
      const imported = modelById.get(productId);
      if (!imported) return;
      upsertImportedOption(imported);
      setCatalogItemsById({ ...CATALOG_ITEMS });
    },
    [modelById]
  );

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const response = await fetch("/api/models/imported", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({ models: [] }))) as {
          models?: ImportedModelEntry[];
        };
        if (cancelled) return;

        const models = payload.models ?? [];
        const assembled = buildImportedModelOptions({
          models,
          importedProductConfigById: IMPORTED_PRODUCT_CONFIG_BY_ID,
        });
        for (const option of assembled.options) {
          const existing = CATALOG_ITEMS[option.id];
          if (shouldRefreshImportedCatalogItem(existing, option)) {
            upsertImportedOption(option);
          }
        }
        const nextCatalogByProductId: Record<string, ImportedModelCatalog> = {};
        for (const model of models) {
          const id = String(model.id ?? "").trim();
          if (!id || !model.catalog) continue;
          nextCatalogByProductId[id] = model.catalog;

          const assetId = String(
            model.catalog.assets?.assetId ?? model.catalog.assets?.asset_id ?? ""
          ).trim();
          if (assetId) nextCatalogByProductId[assetId] = model.catalog;
        }

        setCatalogByProductId(nextCatalogByProductId);
        setCatalogItemsById({ ...CATALOG_ITEMS });
        setModelUrlByAssetId(assembled.modelUrlByAssetId);
        setModelOptions(assembled.options);
      } catch {
        if (cancelled) return;
        setCatalogByProductId({});
        setModelUrlByAssetId({});
        setModelOptions([]);
      }
    };

    void hydrate();
    const refreshOnFocus = () => void hydrate();
    window.addEventListener("focus", refreshOnFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshOnFocus);
    };
  }, []);

  const familyOptions = useMemo(() => {
    const seen = new Set<string>();
    return modelOptions
      .filter((option) => {
        if (!option.familyKey || seen.has(option.familyKey)) return false;
        seen.add(option.familyKey);
        return true;
      })
      .map<ImportedFamilyOption>((option) => ({
        familyKey: option.familyKey,
        familyLabel: option.familyLabel,
      }));
  }, [modelOptions]);

  const effectiveSelectedFamilyKey = familyOptions.some(
    (option) => option.familyKey === selectedFamilyKey
  )
    ? selectedFamilyKey
    : familyOptions[0]?.familyKey ?? "";

  const visibleModelOptions = useMemo(() => {
    if (!effectiveSelectedFamilyKey) return modelOptions;
    const matching = modelOptions.filter(
      (option) => option.familyKey === effectiveSelectedFamilyKey
    );
    return matching.length > 0 ? matching : modelOptions;
  }, [effectiveSelectedFamilyKey, modelOptions]);

  const effectiveSelectedProductId = visibleModelOptions.some(
    (option) => option.id === selectedProductId
  )
    ? selectedProductId
    : visibleModelOptions[0]?.id ?? "";

  const selectFamily = useCallback(
    (familyKey: string) => {
      setSelectedFamilyKey(familyKey);
      const matching = modelOptions.filter((option) => option.familyKey === familyKey);
      const nextVisible = matching.length > 0 ? matching : modelOptions;
      setSelectedProductId((current) =>
        nextVisible.some((option) => option.id === current)
          ? current
          : nextVisible[0]?.id ?? ""
      );
    },
    [modelOptions]
  );

  const getRelatedProductIds = useCallback(
    (productId: string) => {
      const related = new Set<string>([productId]);

      for (const id of MODEL_FAMILY_BY_PRODUCT_ID[productId] ?? []) related.add(id);
      for (const option of ARM_STYLE_OPTIONS_BY_PRODUCT_ID[productId] ?? []) {
        if (option.productId) related.add(option.productId);
      }
      for (const option of LENGTH_OPTIONS_BY_PRODUCT_ID[productId] ?? []) {
        if (option.productId) related.add(option.productId);
      }
      for (const id of MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[productId] ?? []) related.add(id);
      for (const option of ORIENTATION_OPTIONS_BY_PRODUCT_ID[productId] ?? []) {
        if (option.productId) related.add(option.productId);
      }

      const source = modelOptions.find((option) => option.id === productId);
      const sourceFamily = normalizeImportedFamilyName(
        source?.catalog?.productFamily ?? ""
      ).toLowerCase();
      const linkedNames = (source?.catalog?.compatibility?.related_products ?? [])
        .map((entry) => String(entry?.product_name ?? "").trim().toLowerCase())
        .filter(Boolean);
      for (const option of modelOptions) {
        const optionFamily = normalizeImportedFamilyName(
          option.catalog?.productFamily ?? ""
        ).toLowerCase();
        const optionName = option.catalog?.productName?.trim().toLowerCase();
        if (sourceFamily && optionFamily === sourceFamily) {
          related.add(option.id);
        } else if (optionName && linkedNames.includes(optionName)) {
          related.add(option.id);
        }
      }

      return Array.from(related);
    },
    [modelOptions]
  );

  const catalogItems = useMemo(
    () => buildFurnishCatalogItems(catalogItemsById),
    [catalogItemsById]
  );

  return {
    state: {
      selectedFamilyKey: effectiveSelectedFamilyKey,
      selectedProductId: effectiveSelectedProductId,
      modelOptions,
      catalogByProductId,
      modelUrlByAssetId,
      modelById,
      familyOptions,
      visibleModelOptions,
      catalogItems,
      catalogItemsById,
    },
    actions: {
      setSelectedFamilyKey: selectFamily,
      setSelectedProductId,
      ensureCatalogItem,
      getRelatedProductIds,
    },
  };
}
