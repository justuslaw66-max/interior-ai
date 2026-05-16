import { useMemo } from "react";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { DesignItem } from "@/lib/room-types";
import {
  ARM_STYLE_OPTIONS_BY_PRODUCT_ID,
  LENGTH_OPTIONS_BY_PRODUCT_ID,
  MODEL_FAMILY_BY_PRODUCT_ID,
  MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID,
  MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID,
  ORIENTATION_OPTIONS_BY_PRODUCT_ID,
  SHAPE_OPTIONS_BY_PRODUCT_ID,
} from "@/lib/design-page-model-maps";
import {
  getSloaneBenchOptionFromProductId,
  SLOANE_BENCH_PRODUCT_IDS,
  SLOANE_TABLE_PRODUCT_IDS,
  SLOANE_TABLE_TO_BENCH_RECOMMENDATION,
} from "@/lib/design-page-product-data";
import { parseVariantLabel } from "@/lib/design-page-utils";
import {
  inferMaterialTypeFromText,
  shouldShowCollectionGrouping,
} from "@/lib/catalog/variant-normalization";

type MaterialType = "Fabric" | "Leather";

export type StructuredVariantEntry = {
  variant: CatalogItemSchema["variants"][number];
  colourLabel: string;
  materialLabel: MaterialType;
  materialType: MaterialType;
  collectionType: string;
};

type Params = {
  selectedProduct: CatalogItemSchema | null;
  selectedItem: DesignItem | null;
  items: DesignItem[];
  catalogItems: typeof CATALOG_ITEMS;
};

export function useDesignPageProductSelectorState({
  selectedProduct,
  selectedItem,
  items,
  catalogItems,
}: Params) {
  const selectedBrand = useMemo(() => {
    if (!selectedProduct) return null;
    const metadataBrand = selectedProduct.metadata?.brand?.trim();
    if (metadataBrand) return metadataBrand;
    if (selectedProduct.title.startsWith("Castlery ")) return "Castlery";
    return null;
  }, [selectedProduct]);

  const selectedModelTitle = useMemo(() => {
    if (!selectedProduct) return "";
    const metadataName = selectedProduct.metadata?.productName?.trim();
    if (metadataName) return metadataName;
    if (selectedBrand && selectedProduct.title.startsWith(`${selectedBrand} `)) {
      return selectedProduct.title.slice(selectedBrand.length + 1);
    }
    return selectedProduct.title;
  }, [selectedProduct, selectedBrand]);

  const modelOptionProductIds = useMemo(
    () =>
      selectedProduct
        ? (MODEL_FAMILY_BY_PRODUCT_ID[selectedProduct.id] ?? [selectedProduct.id]).filter(
            (id) => Boolean(catalogItems[id])
          )
        : [],
    [selectedProduct, catalogItems]
  );

  const armStyleOptions = useMemo(() => {
    if (!selectedProduct) return null;

    const direct = ARM_STYLE_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (direct) return direct;

    for (const options of Object.values(ARM_STYLE_OPTIONS_BY_PRODUCT_ID)) {
      if (options.some((option) => option.productId === selectedProduct.id)) {
        return options;
      }
    }

    return null;
  }, [selectedProduct]);

  const hasStructuredVariantLabels = Boolean(
    selectedProduct?.variants.some((v) => Boolean(v.finishLabel?.trim()) || /\(([^)]+)\)/.test(v.label))
  );

  const modelSelectorProductIds = useMemo(() => {
    if (!selectedProduct) return [] as string[];
    const explicit = MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID[selectedProduct.id];
    if (explicit?.length) {
      return explicit.filter((id) => Boolean(catalogItems[id]));
    }
    if (!armStyleOptions?.length) return modelOptionProductIds;

    const slimOption = armStyleOptions.find(
      (option) => /slim\s*arm/i.test(option.label) && option.productId
    );
    if (slimOption?.productId && catalogItems[slimOption.productId]) {
      return [slimOption.productId];
    }

    return [selectedProduct.id];
  }, [selectedProduct, armStyleOptions, modelOptionProductIds, catalogItems]);

  const selectedModelProductId = useMemo(() => {
    if (!selectedProduct) return null;
    if (modelSelectorProductIds.includes(selectedProduct.id)) return selectedProduct.id;

    const representativeModelId = MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID[selectedProduct.id];
    if (representativeModelId && modelSelectorProductIds.includes(representativeModelId)) {
      return representativeModelId;
    }

    if (armStyleOptions?.length) {
      const slimOption = armStyleOptions.find(
        (option) => /slim\s*arm/i.test(option.label) && option.productId
      );
      if (slimOption?.productId && modelSelectorProductIds.includes(slimOption.productId)) {
        return slimOption.productId;
      }
    }

    return modelSelectorProductIds[0] ?? selectedProduct.id;
  }, [selectedProduct, modelSelectorProductIds, armStyleOptions]);

  const lengthOptions = useMemo(() => {
    if (!selectedProduct) return null;
    const direct = LENGTH_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (direct?.length) return direct;
    if (selectedModelProductId) {
      const fromModel = LENGTH_OPTIONS_BY_PRODUCT_ID[selectedModelProductId];
      if (fromModel?.length) return fromModel;
    }
    return null;
  }, [selectedProduct, selectedModelProductId]);

  const shapeOptions = useMemo(() => {
    if (!selectedProduct) return null;
    const direct = SHAPE_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (direct?.length) return direct;
    if (selectedModelProductId) {
      const fromModel = SHAPE_OPTIONS_BY_PRODUCT_ID[selectedModelProductId];
      if (fromModel?.length) return fromModel;
    }
    return null;
  }, [selectedProduct, selectedModelProductId]);

  const orientationOptions = useMemo(() => {
    if (!selectedProduct) return null;
    const direct = ORIENTATION_OPTIONS_BY_PRODUCT_ID[selectedProduct.id];
    if (!direct?.length) return null;
    return direct;
  }, [selectedProduct]);

  const structuredVariants = useMemo(() => {
    if (!selectedProduct) return [] as StructuredVariantEntry[];
    return selectedProduct.variants.map((variant) => {
      const parts = parseVariantLabel(variant.label);
      const materialType =
        variant.materialType ??
        inferMaterialTypeFromText(
          variant.finishLabel,
          variant.finishCode,
          variant.swatchGroup,
          parts.materialLabel,
          variant.label
        );
      const collectionType = String(variant.collectionType ?? "").trim().toLowerCase();
      return {
        variant,
        colourLabel: variant.label.trim() || parts.colourLabel,
        materialLabel: materialType,
        materialType,
        collectionType,
      } as StructuredVariantEntry;
    });
  }, [selectedProduct]);

  const activeStructuredVariant = useMemo(() => {
    if (!structuredVariants.length) return null;
    return (
      structuredVariants.find((x) => x.variant.id === selectedItem?.variantId) ??
      structuredVariants[0]
    );
  }, [structuredVariants, selectedItem?.variantId]);

  const activeMaterialLabel = activeStructuredVariant?.materialLabel ?? null;
  const activeMaterialType = activeStructuredVariant?.materialType ?? null;
  const activeVariantLabel = activeStructuredVariant?.variant.label ?? null;
  const activeVariantColorHex = activeStructuredVariant?.variant.colorHex ?? null;
  const activeColourLabel = activeStructuredVariant?.colourLabel ?? null;

  const showFabricGroupingDebug = process.env.NODE_ENV !== "production";
  const selectedModelLabel = selectedProduct?.metadata?.modelLabel?.trim() ?? null;
  const selectedCategoryDebugLabel = selectedProduct
    ? selectedProduct.category.replace(/_/g, " ")
    : null;
  const selectedFamily = selectedProduct?.metadata?.productFamily?.trim().toLowerCase() ?? "";
  const selectedName = selectedProduct?.metadata?.productName?.trim().toLowerCase() ?? "";

  const isCasaTvConsoleSelected =
    selectedFamily === "casa" &&
    selectedProduct?.category === "tv_console" &&
    selectedName.includes("tv console");
  const isSebTvConsoleSelected =
    selectedFamily === "seb" &&
    selectedProduct?.category === "tv_console" &&
    selectedName.includes("tv console");
  const isSloaneTvConsoleSelected =
    selectedFamily === "sloane" &&
    selectedProduct?.category === "tv_console" &&
    selectedName.includes("tv console");

  const isSloaneTableSelected =
    Boolean(
      selectedProduct &&
        SLOANE_TABLE_PRODUCT_IDS.includes(
          selectedProduct.id as (typeof SLOANE_TABLE_PRODUCT_IDS)[number]
        )
    ) ||
    (selectedFamily === "sloane" && selectedProduct?.category === "dining_table");
  const isSloaneBenchSelected =
    Boolean(selectedProduct && SLOANE_BENCH_PRODUCT_IDS.includes(selectedProduct.id)) ||
    (selectedFamily === "sloane" && selectedName.includes("bench"));

  const selectedSloaneCompanionBenchItem = useMemo(() => {
    return items.find((it) => SLOANE_BENCH_PRODUCT_IDS.includes(it.productId)) ?? null;
  }, [items]);
  const selectedSloaneCompanionTableItem = useMemo(() => {
    return (
      items.find((it) =>
        SLOANE_TABLE_PRODUCT_IDS.includes(
          it.productId as (typeof SLOANE_TABLE_PRODUCT_IDS)[number]
        )
      ) ?? null
    );
  }, [items]);

  const selectedBenchOption = selectedProduct
    ? getSloaneBenchOptionFromProductId(selectedProduct.id)
    : null;
  const companionBenchOption = selectedSloaneCompanionBenchItem
    ? getSloaneBenchOptionFromProductId(selectedSloaneCompanionBenchItem.productId)
    : null;

  const defaultBenchSizeFromTable =
    selectedProduct && isSloaneTableSelected
      ? SLOANE_TABLE_TO_BENCH_RECOMMENDATION[selectedProduct.id] ?? 150
      : 150;

  const activeCompanionBenchSize: 150 | 180 =
    companionBenchOption?.size ?? selectedBenchOption?.size ?? defaultBenchSizeFromTable;
  const activeCompanionBenchCushion: "no" | "leather" =
    companionBenchOption?.cushion ?? selectedBenchOption?.cushion ?? "no";
  const activeSelectedBenchSize: 150 | 180 = selectedBenchOption?.size ?? 150;
  const activeSelectedBenchCushion: "no" | "leather" = selectedBenchOption?.cushion ?? "no";
  const activeCompanionTableProductId =
    selectedSloaneCompanionTableItem?.productId ??
    (selectedProduct && isSloaneTableSelected
      ? selectedProduct.id
      : "dining-real-castlery-sloane-travertine-220");

  const visibleColourVariants = useMemo(() => {
    if (!hasStructuredVariantLabels || !activeMaterialType) {
      return structuredVariants;
    }
    return structuredVariants.filter((x) => x.materialType === activeMaterialType);
  }, [structuredVariants, hasStructuredVariantLabels, activeMaterialType]);

  const dedupedVisibleColourVariants = useMemo(() => {
    if (!visibleColourVariants.length) return visibleColourVariants;

    const activeDims = activeStructuredVariant?.variant.dimensionsMm;
    const activeW = Number(activeDims?.w ?? 0);
    const activeD = Number(activeDims?.d ?? 0);

    const grouped = new Map<string, StructuredVariantEntry[]>();
    for (const entry of visibleColourVariants) {
      const key = [
        entry.materialType.trim().toLowerCase(),
        entry.colourLabel.trim().toLowerCase(),
        entry.collectionType.trim().toLowerCase(),
      ].join("::");
      const existing = grouped.get(key);
      if (existing) {
        existing.push(entry);
      } else {
        grouped.set(key, [entry]);
      }
    }

    const pickBestEntry = (entries: StructuredVariantEntry[]): StructuredVariantEntry => {
      const selected = entries.find((entry) => entry.variant.id === selectedItem?.variantId);
      if (selected) return selected;

      if (activeW > 0 && activeD > 0) {
        const dimMatch = entries.find((entry) => {
          const dims = entry.variant.dimensionsMm;
          return Number(dims?.w ?? 0) === activeW && Number(dims?.d ?? 0) === activeD;
        });
        if (dimMatch) return dimMatch;
      }

      return entries[0];
    };

    return Array.from(grouped.values()).map((entries) => pickBestEntry(entries));
  }, [visibleColourVariants, activeStructuredVariant, selectedItem?.variantId]);

  const groupedVisibleColourVariants = useMemo(() => {
    if (!shouldShowCollectionGrouping(dedupedVisibleColourVariants.map((entry) => entry.collectionType))) {
      return [{ key: "all" as const, label: null, entries: dedupedVisibleColourVariants }];
    }

    const normalizeCollectionType = (value: string | null | undefined): "stocked" | "custom" =>
      String(value ?? "").trim().toLowerCase() === "stocked" ? "stocked" : "custom";

    const stocked = dedupedVisibleColourVariants.filter(
      (entry) => normalizeCollectionType(entry.collectionType) === "stocked"
    );
    const custom = dedupedVisibleColourVariants.filter(
      (entry) => normalizeCollectionType(entry.collectionType) === "custom"
    );

    const groups: Array<{
      key: "stocked" | "custom" | "all";
      label: string | null;
      entries: typeof dedupedVisibleColourVariants;
    }> = [];
    if (stocked.length) groups.push({ key: "stocked", label: "Stocked", entries: stocked });
    if (custom.length) groups.push({ key: "custom", label: "Custom", entries: custom });
    return groups;
  }, [dedupedVisibleColourVariants]);

  const hideColourSelector = Boolean(
    selectedProduct?.id.startsWith("dining-real-castlery-forma-") ||
      selectedProduct?.id.startsWith("dining-real-castlery-brighton-") ||
      isCasaTvConsoleSelected ||
      isSebTvConsoleSelected ||
      isSloaneTvConsoleSelected
  );

  const materialOptions = useMemo(() => {
    if (!selectedProduct) {
      return [] as Array<{ type: MaterialType; variantId: string; colorHex: string }>;
    }
    const orderedTypes: MaterialType[] = ["Fabric", "Leather"];
    const byType = new Map<MaterialType, { variantId: string; colorHex: string }>();

    for (const entry of structuredVariants) {
      if (!byType.has(entry.materialType)) {
        byType.set(entry.materialType, {
          variantId: entry.variant.id,
          colorHex: entry.variant.swatchHex ?? entry.variant.colorHex,
        });
      }
    }

    return orderedTypes
      .map((type) => {
        const mapped = byType.get(type);
        if (!mapped) return null;
        return { type, variantId: mapped.variantId, colorHex: mapped.colorHex };
      })
      .filter(
        (entry): entry is { type: MaterialType; variantId: string; colorHex: string } =>
          Boolean(entry)
      );
  }, [selectedProduct, structuredVariants]);

  const useLengthOptionsAsVariants = Boolean(
    !hasStructuredVariantLabels &&
      !isSloaneBenchSelected &&
      !(shapeOptions?.length && (shapeOptions?.length ?? 0) > 1) &&
      lengthOptions?.length &&
      (selectedProduct?.variants.length ?? 0) <= 1
  );

  const useShapeOptionsAsVariants = Boolean(
    !hasStructuredVariantLabels &&
      !isSloaneBenchSelected &&
      shapeOptions?.length &&
      shapeOptions.length > 1
  );

  const variantOptionCount = useMemo(() => {
    if (!selectedProduct) return 0;
    if (hasStructuredVariantLabels) return modelSelectorProductIds.length;
    if (useShapeOptionsAsVariants) {
      return (shapeOptions ?? []).filter((option) => Boolean(option.productId)).length;
    }
    if (useLengthOptionsAsVariants) {
      return (lengthOptions ?? []).filter((option) => Boolean(option.productId)).length;
    }
    if (isSloaneBenchSelected) return 2;
    return selectedProduct.variants.length;
  }, [
    selectedProduct,
    hasStructuredVariantLabels,
    modelSelectorProductIds,
    useShapeOptionsAsVariants,
    shapeOptions,
    useLengthOptionsAsVariants,
    lengthOptions,
    isSloaneBenchSelected,
  ]);

  const showVariantsSection = variantOptionCount > 1;
  const showFinishSection =
    !isCasaTvConsoleSelected &&
    !isSebTvConsoleSelected &&
    !isSloaneTvConsoleSelected &&
    materialOptions.length > 1;

  const sizeOptionsForActiveSelection = useMemo(() => {
    if (!hasStructuredVariantLabels || !activeMaterialType || !activeColourLabel) {
      return [] as Array<{ key: string; label: string; variantId: string }>;
    }

    const scoped = structuredVariants.filter(
      (entry) =>
        entry.materialType === activeMaterialType &&
        entry.colourLabel.trim().toLowerCase() === activeColourLabel.trim().toLowerCase()
    );

    if (scoped.length < 2) {
      return [] as Array<{ key: string; label: string; variantId: string }>;
    }

    const options = new Map<string, { key: string; label: string; variantId: string; area: number }>();
    for (const entry of scoped) {
      const dims = entry.variant.dimensionsMm;
      const widthMm = Number(dims?.w ?? 0);
      const depthMm = Number(dims?.d ?? 0);
      const hasValidDims = widthMm > 0 && depthMm > 0;
      const sizeMatch = entry.variant.label.match(/(\d+)\s*(?:x|by)\s*(\d+)\s*cm/i);
      const singleSizeMatch = entry.variant.label.match(/(\d+)\s*cm/i);
      const derivedKey = hasValidDims
        ? `${Math.round(widthMm)}x${Math.round(depthMm)}`
        : sizeMatch
          ? `${sizeMatch[1]}x${sizeMatch[2]}`
          : singleSizeMatch
            ? singleSizeMatch[1]
            : entry.variant.id;
      const derivedLabel = hasValidDims
        ? `${Math.round(widthMm / 10)} x ${Math.round(depthMm / 10)} cm`
        : sizeMatch
          ? `${sizeMatch[1]} x ${sizeMatch[2]} cm`
          : singleSizeMatch
            ? `${singleSizeMatch[1]} cm`
            : "Standard";
      if (!options.has(derivedKey)) {
        options.set(derivedKey, {
          key: derivedKey,
          label: derivedLabel,
          variantId: entry.variant.id,
          area: hasValidDims ? widthMm * depthMm : Number.MAX_SAFE_INTEGER,
        });
      }
    }

    if (options.size < 2) {
      return [] as Array<{ key: string; label: string; variantId: string }>;
    }

    return Array.from(options.values())
      .sort((a, b) => a.area - b.area)
      .map(({ key, label, variantId }) => ({ key, label, variantId }));
  }, [
    hasStructuredVariantLabels,
    activeMaterialType,
    activeColourLabel,
    structuredVariants,
  ]);

  const showSizeSection = sizeOptionsForActiveSelection.length > 1;

  return {
    selectedBrand,
    selectedModelTitle,
    modelOptionProductIds,
    armStyleOptions,
    hasStructuredVariantLabels,
    modelSelectorProductIds,
    selectedModelProductId,
    lengthOptions,
    shapeOptions,
    orientationOptions,
    structuredVariants,
    activeStructuredVariant,
    activeMaterialLabel,
    activeMaterialType,
    activeVariantLabel,
    activeVariantColorHex,
    activeColourLabel,
    showFabricGroupingDebug,
    selectedModelLabel,
    selectedCategoryDebugLabel,
    isCasaTvConsoleSelected,
    isSebTvConsoleSelected,
    isSloaneTvConsoleSelected,
    isSloaneTableSelected,
    isSloaneBenchSelected,
    selectedSloaneCompanionBenchItem,
    selectedSloaneCompanionTableItem,
    activeCompanionBenchSize,
    activeCompanionBenchCushion,
    activeSelectedBenchSize,
    activeSelectedBenchCushion,
    activeCompanionTableProductId,
    groupedVisibleColourVariants,
    hideColourSelector,
    materialOptions,
    useLengthOptionsAsVariants,
    useShapeOptionsAsVariants,
    showVariantsSection,
    showFinishSection,
    sizeOptionsForActiveSelection,
    showSizeSection,
  };
}
