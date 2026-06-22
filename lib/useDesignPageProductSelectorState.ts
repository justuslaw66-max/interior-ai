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
} from "@/lib/design-page-product-data";
import { parseVariantLabel } from "@/lib/design-page-utils";
import {
  inferMaterialTypeFromText,
  shouldShowCollectionGrouping,
} from "@/lib/catalog/variant-normalization";

type MaterialType = "Fabric" | "Leather" | "Wood";

type MaterialOption = {
  key: string;
  label: string;
  variantId: string;
  colorHex: string;
  swatchTextureUrl?: string;
};

type LegFinishOption = {
  key: string;
  label: string;
  variantId: string;
  colorHex: string;
};

export type StructuredVariantEntry = {
  variant: CatalogItemSchema["variants"][number];
  colourLabel: string;
  materialLabel: MaterialType;
  materialType: MaterialType;
  collectionType: string;
  materialKey: string;
  materialDisplayLabel: string;
};

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeMaterialCode(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, "")
    .replace(/\b\d{2,4}\s*x\s*\d{2,4}\b/g, "")
    .replace(/\b(open|opened|closed|storage)\b/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function baseFinishKeyForLegVariant(variant: CatalogItemSchema["variants"][number]): string {
  const finishKey = normalizeOptionKey(variant.finishCode);
  if (!finishKey || (!variant.legFinishCode && !variant.legFinishLabel)) return finishKey;

  const legKey = normalizeOptionKey(variant.legFinishCode ?? variant.legFinishLabel);
  if (!legKey) return finishKey;

  return finishKey
    .replace(new RegExp(`-${legKey}(?:-wood)?-legs$`, "i"), "")
    .replace(new RegExp(`-${legKey}$`, "i"), "");
}

function stripLegFinishFromColourLabel(value: string, variant: CatalogItemSchema["variants"][number]): string {
  if (!variant.legFinishCode && !variant.legFinishLabel) return value;

  const legLabel = String(variant.legFinishLabel ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const legCodeLabel = String(variant.legFinishCode ?? "")
    .trim()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
  const legPatterns = [legLabel, legCodeLabel]
    .filter(Boolean)
    .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));

  let next = value.trim();
  for (const escaped of legPatterns) {
    next = next
      .replace(new RegExp(`\\s*\\([^)]*${escaped}[^)]*\\)\\s*$`, "i"), "")
      .replace(new RegExp(`\\s*/\\s*${escaped}(?:\\s+wood)?(?:\\s+legs?)?\\s*$`, "i"), "");
  }
  next = next.replace(/\s*\([^)]*wood[^)]*legs?[^)]*\)\s*$/i, "");
  next = next.replace(/\s*\([^)]*legs?[^)]*\)\s*$/i, "");
  next = next.replace(/\s*\(imported-[^)]+\)\s*$/i, "");
  return next.trim() || value;
}

function legFinishColorHex(optionKey: string, label: string): string {
  const source = `${optionKey} ${label}`.toLowerCase();
  if (source.includes("black")) return "#202020";
  if (source.includes("white") || source.includes("wash")) return "#d8c49c";
  if (source.includes("walnut")) return "#8a643f";
  if (source.includes("natural")) return "#c8a36f";
  return "#b18a63";
}

const SHOPPER_COLOUR_LABEL_BY_FINISH_CODE: Record<string, string> = {
  bisque_fabric: "Bisque",
  bisque: "Bisque",
  camille_forest_fabric: "Camille, Forest",
  camille_forest: "Camille, Forest",
  caramel_leather: "Caramel",
  caramel: "Caramel",
};

function buildMaterialFields(entry: CatalogItemSchema["variants"][number]): {
  key: string;
  label: string;
} {
  const finishCode = normalizeMaterialCode(baseFinishKeyForLegVariant(entry) || String(entry.finishCode ?? ""));
  const finishLabel = normalizeMaterialCode(String(entry.finishLabel ?? ""));
  // Upholstery/finish code is the stable material dimension for imported Castlery variants.
  const preferred = finishCode || finishLabel;
  if (!preferred) {
    return {
      key: "default",
      label: "Default",
    };
  }

  return {
    key: preferred.replace(/\s+/g, "-"),
    label: toTitleCase(preferred),
  };
}

type Params = {
  selectedProduct: CatalogItemSchema | null;
  selectedItem: DesignItem | null;
  catalogItems: typeof CATALOG_ITEMS;
};

export function useDesignPageProductSelectorState({
  selectedProduct,
  selectedItem,
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

  const hasStructuredVariantLabels = useMemo(() => {
    if (!selectedProduct || selectedProduct.variants.length < 2) return false;

    const hasExplicitStructuredLabel = selectedProduct.variants.some(
      (v) => Boolean(v.finishLabel?.trim()) || /\(([^)]+)\)/.test(v.label)
    );
    if (hasExplicitStructuredLabel) return true;

    // Treat variants as colour/finish-driven when imported/catalog metadata provides
    // finish attributes even if human-readable labels are plain.
    const hasFinishMetadata = selectedProduct.variants.some((v) => {
      const finishCode = String(v.finishCode ?? "").trim();
      const swatchGroup = String(v.swatchGroup ?? "").trim().toLowerCase();
      const collectionType = String(v.collectionType ?? "").trim();
      return Boolean(
        finishCode ||
          v.materialType ||
          collectionType ||
          (swatchGroup && swatchGroup !== "all_materials")
      );
    });
    if (hasFinishMetadata) return true;

    // Fall back to swatch cards when variants are primarily colour-differentiated.
    const distinctHexes = new Set(
      selectedProduct.variants.map((v) => String(v.swatchHex ?? v.colorHex ?? "").trim().toLowerCase())
    );
    return distinctHexes.size > 1;
  }, [selectedProduct]);

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

  const useModelOptionsAsVariants = Boolean(
    selectedProduct &&
      modelSelectorProductIds.length > 1 &&
      !armStyleOptions?.length
  );

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
    const isMadisonProduct =
      selectedProduct.id.includes("madison") ||
      selectedProduct.metadata?.productFamily?.trim().toLowerCase() === "madison";
    return selectedProduct.variants.map((variant) => {
      const parts = parseVariantLabel(variant.label);
      const swatchGroup = String(variant.swatchGroup ?? "").trim().toLowerCase();
      const isWoodSwatch = swatchGroup.includes("wood");
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
      const materialFields = buildMaterialFields(variant);
      const normalizedFinishCode = normalizeMaterialCode(String(variant.finishCode ?? ""));
      const rawFinishCode = String(variant.finishCode ?? "").trim().toLowerCase();
      const rawParsedColourLabel = parts.colourLabel.trim().toLowerCase();
      const shopperColourLabel =
        SHOPPER_COLOUR_LABEL_BY_FINISH_CODE[rawFinishCode] ??
        (isMadisonProduct && rawParsedColourLabel === "forest" ? "Camille, Forest" : null);
      const rawResolvedColourLabel = shopperColourLabel
        ? shopperColourLabel
        : isWoodSwatch
        ? variant.finishLabel?.trim() ||
          (normalizedFinishCode ? toTitleCase(normalizedFinishCode) : "") ||
          parts.colourLabel.trim() ||
          variant.label.trim()
        : parts.colourLabel.trim() || variant.label.trim();
      const resolvedColourLabel = stripLegFinishFromColourLabel(rawResolvedColourLabel, variant);
      return {
        variant,
        colourLabel: resolvedColourLabel,
        materialLabel: materialType,
        materialType,
        collectionType,
        materialKey: materialFields.key,
        materialDisplayLabel: materialFields.label,
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

  const activeMaterialLabel = activeStructuredVariant?.materialDisplayLabel ?? activeStructuredVariant?.materialLabel ?? null;
  const activeMaterialType = activeStructuredVariant?.materialType ?? null;
  const activeVariantLabel = activeStructuredVariant?.variant.label ?? null;
  const activeVariantColorHex = activeStructuredVariant?.variant.colorHex ?? null;
  const activeColourLabel = activeStructuredVariant?.colourLabel ?? null;

  const isHuggProduct = Boolean(selectedProduct?.id.toLowerCase().includes("hugg"));

  const hasWoodColourOptions = useMemo(() => {
    return structuredVariants.some((entry) => {
      const swatchGroup = String(entry.variant.swatchGroup ?? "").trim().toLowerCase();
      return swatchGroup.includes("wood") || (isHuggProduct && entry.materialType === "Wood");
    });
  }, [structuredVariants, isHuggProduct]);

  const showFabricGroupingDebug = process.env.NODE_ENV !== "production";
  const selectedProductIdLower = selectedProduct?.id?.toLowerCase();
  const selectedModelLabelByProductId =
    selectedProductIdLower ===
      "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman"
      ? "Swivel Armchair with Ottoman"
      : selectedProductIdLower ===
          "armchair-real-castlery-avery-performance-armchair-with-ottoman"
        ? "Armchair with Ottoman"
        : selectedProductIdLower ===
            "armchair-real-castlery-avery-performance-swivel-armchair"
          ? "Swivel Armchair"
          : selectedProductIdLower ===
              "armchair-real-castlery-avery-performance-armchair"
            ? "Armchair"
            : null;
  const selectedModelLabel =
    selectedProduct?.metadata?.modelLabel?.trim() ??
    selectedModelLabelByProductId ??
    null;
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

  const selectedBenchOption = selectedProduct
    ? getSloaneBenchOptionFromProductId(selectedProduct.id)
    : null;
  const activeSelectedBenchSize: 150 | 180 = selectedBenchOption?.size ?? 150;
  const activeSelectedBenchCushion: "no" | "leather" = selectedBenchOption?.cushion ?? "no";

  const hasColourOverlapAcrossMaterials = useMemo(() => {
    if (!hasWoodColourOptions) return false;
    if (structuredVariants.length < 2) return false;
    const materialToColours = new Map<string, Set<string>>();
    for (const entry of structuredVariants) {
      const set = materialToColours.get(entry.materialKey) ?? new Set<string>();
      set.add(entry.colourLabel.trim().toLowerCase());
      materialToColours.set(entry.materialKey, set);
    }
    if (materialToColours.size < 2) return false;

    const allSets = Array.from(materialToColours.values());
    for (let i = 0; i < allSets.length; i += 1) {
      for (let j = i + 1; j < allSets.length; j += 1) {
        for (const colour of allSets[i]) {
          if (allSets[j].has(colour)) return true;
        }
      }
    }
    return false;
  }, [structuredVariants, hasWoodColourOptions]);

  const activeMaterialKey = activeStructuredVariant?.materialKey ?? null;

  const legFinishOptions = useMemo(() => {
    if (!selectedProduct || !activeStructuredVariant) return [] as LegFinishOption[];

    const variantsWithLegFinish = selectedProduct.variants.filter(
      (variant) => variant.legFinishCode || variant.legFinishLabel
    );
    if (variantsWithLegFinish.length < 2) return [] as LegFinishOption[];

    const activeFabricKey = baseFinishKeyForLegVariant(activeStructuredVariant.variant);
    const scopedVariants = activeFabricKey
      ? variantsWithLegFinish.filter((variant) => baseFinishKeyForLegVariant(variant) === activeFabricKey)
      : variantsWithLegFinish;
    const candidates = scopedVariants.length > 0 ? scopedVariants : variantsWithLegFinish;

    const byLeg = new Map<string, LegFinishOption>();
    for (const variant of candidates) {
      const key = normalizeOptionKey(variant.legFinishCode ?? variant.legFinishLabel ?? "");
      if (!key) continue;
      const label =
        variant.legFinishLabel?.trim() ||
        toTitleCase(key.replace(/-/g, " "));
      const existing = byLeg.get(key);
      if (existing && existing.variantId === activeStructuredVariant.variant.id) continue;
      if (existing && variant.id !== activeStructuredVariant.variant.id) continue;
      byLeg.set(key, {
        key,
        label,
        variantId: variant.id,
        colorHex: legFinishColorHex(key, label),
      });
    }

    return Array.from(byLeg.values()).sort((a, b) => {
      const rank = (option: LegFinishOption) =>
        option.key.includes("white") || option.key.includes("wash")
          ? 0
          : option.key.includes("black")
            ? 1
            : 2;
      return rank(a) - rank(b) || a.label.localeCompare(b.label);
    });
  }, [activeStructuredVariant, selectedProduct]);

  const visibleColourVariants = useMemo(() => {
    if (hasWoodColourOptions) {
      const woodOnly = structuredVariants.filter((entry) => {
        const swatchGroup = String(entry.variant.swatchGroup ?? "").trim().toLowerCase();
        return swatchGroup.includes("wood") || (isHuggProduct && entry.materialType === "Wood");
      });
      if (woodOnly.length) return woodOnly;
    }
    if (!hasStructuredVariantLabels) {
      return structuredVariants;
    }
    if (hasColourOverlapAcrossMaterials && activeMaterialKey) {
      return structuredVariants.filter((x) => x.materialKey === activeMaterialKey);
    }
    if (!activeMaterialType) return structuredVariants;
    return structuredVariants.filter((x) => x.materialType === activeMaterialType);
  }, [
    structuredVariants,
    hasStructuredVariantLabels,
    activeMaterialKey,
    activeMaterialType,
    hasWoodColourOptions,
    hasColourOverlapAcrossMaterials,
    isHuggProduct,
  ]);

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
      return [] as MaterialOption[];
    }

    if (hasColourOverlapAcrossMaterials) {
      const byMaterialKey = new Map<string, MaterialOption>();
      for (const entry of structuredVariants) {
        if (!byMaterialKey.has(entry.materialKey)) {
          byMaterialKey.set(entry.materialKey, {
            key: entry.materialKey,
            label: entry.materialDisplayLabel,
            variantId: entry.variant.id,
            colorHex: entry.variant.swatchHex ?? entry.variant.colorHex,
            swatchTextureUrl: entry.variant.swatchTextureUrl,
          });
        }
      }
      return Array.from(byMaterialKey.values());
    }

    const orderedTypes: MaterialType[] = ["Fabric", "Wood", "Leather"];
    const byType = new Map<
      MaterialType,
      { variantId: string; colorHex: string; label: string; swatchTextureUrl?: string }
    >();

    for (const entry of structuredVariants) {
      if (!byType.has(entry.materialType)) {
        byType.set(entry.materialType, {
          variantId: entry.variant.id,
          colorHex: entry.variant.swatchHex ?? entry.variant.colorHex,
          label: entry.materialType,
          swatchTextureUrl: entry.variant.swatchTextureUrl,
        });
      }
    }

    return orderedTypes
      .map<MaterialOption | null>((type) => {
        const mapped = byType.get(type);
        if (!mapped) return null;
        return {
          key: type.toLowerCase(),
          label: mapped.label,
          variantId: mapped.variantId,
          colorHex: mapped.colorHex,
          swatchTextureUrl: mapped.swatchTextureUrl,
        };
      })
      .filter((entry): entry is MaterialOption => Boolean(entry));
  }, [selectedProduct, structuredVariants, hasColourOverlapAcrossMaterials]);

  const useLengthOptionsAsVariants = Boolean(
    !hasStructuredVariantLabels &&
      !useModelOptionsAsVariants &&
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
    if (hasStructuredVariantLabels || useModelOptionsAsVariants) return modelSelectorProductIds.length;
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
    useModelOptionsAsVariants,
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
    activeSelectedBenchSize,
    activeSelectedBenchCushion,
    groupedVisibleColourVariants,
    legFinishOptions,
    hideColourSelector,
    materialOptions,
    useModelOptionsAsVariants,
    useLengthOptionsAsVariants,
    useShapeOptionsAsVariants,
    showVariantsSection,
    showFinishSection,
    sizeOptionsForActiveSelection,
    showSizeSection,
    hasWoodColourOptions,
  };
}
