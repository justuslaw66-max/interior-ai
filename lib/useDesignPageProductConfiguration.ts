import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import {
  EQUIVALENT_VARIANT_RULE_ORDERS,
  resolveEquivalentVariant,
  type EquivalentVariantRuleOrder,
} from "@/lib/design-page-equivalent-variant";
import {
  AUBURN_CONFIGURATION_GROUPS,
  AUBURN_CONFIGURATION_PRODUCT_IDS,
  JARON_CONFIGURATION_GROUPS,
  JARON_CONFIGURATION_PRODUCT_IDS,
  type AuburnConfigurationGroupKey,
  type JaronConfigurationArmKey,
  type JaronConfigurationGroupKey,
} from "@/lib/design-page-model-maps";
import {
  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE,
  HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE,
  getSloaneBenchProductId,
  resolveFabricDetailProfile,
} from "@/lib/design-page-product-data";
import type { useDesignPageProductSelectorState } from "@/lib/useDesignPageProductSelectorState";
import {
  getHighResolutionSwatchUrl,
  getMaterialDisplayLabel,
} from "@/lib/catalog/variant-normalization";
import type { DesignItem } from "@/lib/room-types";
import type { useDesignPageConfigState } from "@/lib/design-page-config-state";
import type { ProductModelVariantControlsState } from "@/components/editor/design-page/ProductModelVariantControls";
import type { ProductFinishControlsState } from "@/components/editor/design-page/ProductFinishControls";

type ProductSelectorState = ReturnType<typeof useDesignPageProductSelectorState>;
type DesignPageConfigState = ReturnType<typeof useDesignPageConfigState>;

type CommitItems = (
  updater: DesignItem[] | ((previous: DesignItem[]) => DesignItem[]),
  actionName?: string
) => void;

type Params = {
  state: {
    selectedItem: DesignItem | null;
    selectedProduct: CatalogItemSchema | null;
    importedModelById: Map<string, ImportedModelOption>;
    selector: ProductSelectorState;
  };
  actions: {
    commitItems: CommitItems;
    ensureImportedCatalogItem: (productId: string) => void;
    setItemConfigurationByInstanceId: Dispatch<
      SetStateAction<Record<string, string>>
    >;
  };
  configuration: Pick<
    DesignPageConfigState,
    | "selectedConfigurationCode"
    | "selectedConfigUi"
    | "selectedConfigOptions"
    | "selectedConfigEntry"
    | "selectedConfigBehavior"
  > & {
    canEdit: boolean;
  };
};

export function normalizeProductVariantKey(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeProductVariantMatchValue(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-");
}

function getProductVariantSizeKey(
  variant?: CatalogItemSchema["variants"][number] | null
): string {
  const sizeLabel = normalizeProductVariantKey(variant?.sizeLabel);
  if (sizeLabel) return sizeLabel;
  const variantId = String(variant?.id ?? "").trim().toLowerCase();
  if (variantId.startsWith("queen_") || variantId.includes("_queen_")) return "queen";
  if (variantId.startsWith("king_") || variantId.includes("_king_")) return "king";
  const widthMm = Number(variant?.dimensionsMm?.w ?? 0);
  if (widthMm > 0 && widthMm < 1800) return "queen";
  if (widthMm >= 1800) return "king";
  return "";
}

function getProductVariantBaseFinishKey(
  variant: CatalogItemSchema["variants"][number]
): string {
  const finishCode = normalizeProductVariantKey(variant.finishCode);
  const legKey = normalizeProductVariantKey(
    variant.legFinishCode ?? variant.legFinishLabel
  );
  if (!finishCode || !legKey) return finishCode;
  return finishCode
    .replace(new RegExp(`-${legKey}(?:-wood)?-legs$`, "i"), "")
    .replace(new RegExp(`-${legKey}$`, "i"), "");
}

function buildHuggFabricSwatches(
  selectedProduct: CatalogItemSchema | null,
  enabled: boolean
) {
  if (!enabled || !selectedProduct) {
    return [] as Array<{
      key: string;
      label: string;
      colorHex: string;
      productId: string;
      swatchTextureUrl: string | null;
      active: boolean;
    }>;
  }

  const currentId = selectedProduct.id;
  const prefix = currentId.match(
    /^(coffee-real-castlery-hugg-nesting-(?:square|rectangular|side-table)-performance-)/
  )?.[1];
  if (!prefix) return [];

  const familyIds = Object.keys(CATALOG_ITEMS).filter((id) => id.startsWith(prefix));
  const suffix = currentId.endsWith("-opened")
    ? "-opened"
    : currentId.endsWith("-closed")
      ? "-closed"
      : "";
  const resolveProductId = (code: "dune" | "basalt") =>
    familyIds.find(
      (id) => id.includes(`performance-${code}`) && (!suffix || id.endsWith(suffix))
    ) ?? familyIds.find((id) => id.includes(`performance-${code}`)) ?? "";

  return [
    {
      key: "performance-dune",
      label: "Performance Dune",
      colorHex: "#ede8de",
      productId: resolveProductId("dune"),
      swatchTextureUrl:
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["performance-dune"] ?? null,
    },
    {
      key: "performance-basalt",
      label: "Performance Basalt",
      colorHex: "#8a8f96",
      productId: resolveProductId("basalt"),
      swatchTextureUrl:
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["performance-basalt"] ?? null,
    },
  ]
    .filter((option) => Boolean(option.productId))
    .map((option) => ({ ...option, active: option.productId === currentId }));
}

export function useDesignPageProductConfiguration({ state, actions, configuration }: Params) {
  const { selectedItem, selectedProduct, importedModelById, selector } = state;
  const {
    activeStructuredVariant,
    activeVariantColorHex,
    activeColourLabel,
    activeMaterialLabel,
    activeMaterialType,
    activeSelectedBenchSize,
    activeSelectedBenchCushion,
    armStyleOptions,
    colourSelectorLabel,
    groupedVisibleColourVariants,
    hasStructuredVariantLabels,
    hasWoodColourOptions,
    isSloaneBenchSelected,
    legFinishOptions,
    lengthOptions,
    materialOptions,
    modelSelectorProductIds,
    orientationOptions,
    selectedModelProductId,
    shapeOptions,
    showSizeSection,
    showStructuredColourSelector,
    showFinishSection,
    showVariantsSection,
    sizeOptionsForActiveSelection,
    structuredVariants,
    useLengthOptionsAsVariants,
    useModelOptionsAsVariants,
    useShapeOptionsAsVariants,
    variantSelectorLabel,
  } = selector;
  const {
    commitItems,
    ensureImportedCatalogItem,
    setItemConfigurationByInstanceId,
  } = actions;
  const {
    canEdit,
    selectedConfigurationCode,
    selectedConfigUi,
    selectedConfigOptions,
    selectedConfigEntry,
    selectedConfigBehavior,
  } = configuration;

  const [hoveredColourVariantId, setHoveredColourVariantId] = useState<string | null>(null);
  const [hoveredColourPreview, setHoveredColourPreview] = useState<{
    variantId: string;
    x: number;
    y: number;
  } | null>(null);
  const [hoveredColourPreviewVisible, setHoveredColourPreviewVisible] = useState(false);
  const hoveredColourPreviewHideTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (hoveredColourPreviewHideTimerRef.current) {
        window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
      }
    },
    []
  );

  const isHuggWithWoodOptions =
    Boolean(selectedProduct?.id.includes("hugg")) && hasWoodColourOptions;
  const huggFabricSwatchOptions = useMemo(
    () => buildHuggFabricSwatches(selectedProduct, isHuggWithWoodOptions),
    [isHuggWithWoodOptions, selectedProduct]
  );

  const singleWoodFinishSwatch = useMemo(() => {
    if (!selectedProduct || !activeStructuredVariant) return null;
    if (showFinishSection || huggFabricSwatchOptions.length > 1) return null;
    const visibleSwatchCount = groupedVisibleColourVariants.reduce(
      (count, group) => count + group.entries.length,
      0
    );
    if (visibleSwatchCount > 1) return null;

    const { variant } = activeStructuredVariant;
    const swatchGroup = String(variant.swatchGroup ?? "").trim().toLowerCase();
    if (!swatchGroup.includes("wood") && activeStructuredVariant.materialType !== "Wood") {
      return null;
    }

    const finishKey = normalizeProductVariantKey(variant.finishCode);
    const finishLabelKey = normalizeProductVariantKey(
      variant.finishLabel ?? activeStructuredVariant.colourLabel
    );
    const colourLabelKey = normalizeProductVariantKey(activeStructuredVariant.colourLabel);
    const sourceSwatches = selectedProduct.id.toLowerCase().includes("hugg")
      ? HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE
      : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE;
    const swatchTextureUrl =
      getHighResolutionSwatchUrl(
        sourceSwatches[finishKey] ??
          sourceSwatches[finishLabelKey] ??
          sourceSwatches[colourLabelKey]
      ) ?? null;
    if (!swatchTextureUrl) return null;

    const selectedProductIdLower = selectedProduct.id.toLowerCase();
    const isSloaneLegFinish =
      selectedProductIdLower.includes("sloane-travertine") ||
      selectedProductIdLower.includes("sloane-dining-table") ||
      selectedProductIdLower.includes("sloane-bench");
    return {
      sectionLabel: isSloaneLegFinish ? "Leg" : "Wood colour",
      label: getMaterialDisplayLabel(variant),
      colorHex:
        variant.swatchHex ??
        variant.colorHex ??
        activeVariantColorHex ??
        "#c8b79f",
      swatchTextureUrl,
    };
  }, [
    activeStructuredVariant,
    activeVariantColorHex,
    groupedVisibleColourVariants,
    huggFabricSwatchOptions.length,
    selectedProduct,
    showFinishSection,
  ]);

  const sloaneBenchMaterialSwatch = useMemo(() => {
    if (!selectedProduct || !isSloaneBenchSelected || activeSelectedBenchCushion !== "leather") {
      return null;
    }
    return {
      label: "Caramel",
      colorHex: "#8a643f",
      swatchTextureUrl:
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["top-grain-leather-tan"] ??
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["top_grain_leather_tan"] ??
        CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE.caramel_leather ??
        null,
    };
  }, [activeSelectedBenchCushion, isSloaneBenchSelected, selectedProduct]);

  const huggModelOptions = useMemo(() => {
    if (!isHuggWithWoodOptions || !selectedProduct) return [];
    const match = selectedProduct.id.match(
      /^coffee-real-castlery-hugg-nesting-(square|rectangular|side-table)-performance-(dune|basalt)-(closed|opened)$/
    );
    if (!match) return [];
    const currentModel = match[1] as "square" | "rectangular" | "side-table";
    const fabric = match[2];
    const layoutState = match[3];
    return [
      { key: "square" as const, label: "Square" },
      { key: "rectangular" as const, label: "Rectangular" },
      { key: "side-table" as const, label: "Side table" },
    ]
      .map((option) => ({
        ...option,
        productId: `coffee-real-castlery-hugg-nesting-${option.key}-performance-${fabric}-${layoutState}`,
        active: option.key === currentModel,
      }))
      .filter((option) => Boolean(CATALOG_ITEMS[option.productId]));
  }, [isHuggWithWoodOptions, selectedProduct]);

  const sebCoffeeTableModelOptions = useMemo(() => {
    if (!selectedProduct) return [];
    const currentId = selectedProduct.id;
    const isSebCoffeeTable = [
      "coffee-real-castlery-seb-lift-top-small",
      "coffee-real-castlery-seb-lift-top-large",
      "coffee-real-castlery-seb-storage-90",
      "coffee-real-castlery-seb-storage-120",
    ].includes(currentId);
    if (!isSebCoffeeTable) return [];
    const storageTargetProductId =
      currentId === "coffee-real-castlery-seb-storage-120" ||
      currentId === "coffee-real-castlery-seb-lift-top-large"
        ? "coffee-real-castlery-seb-storage-120"
        : "coffee-real-castlery-seb-storage-90";
    return [
      {
        key: "small-lift-top" as const,
        label: "Small lift top",
        productId: "coffee-real-castlery-seb-lift-top-small",
        active: currentId === "coffee-real-castlery-seb-lift-top-small",
      },
      {
        key: "large-lift-top" as const,
        label: "Large lift top",
        productId: "coffee-real-castlery-seb-lift-top-large",
        active: currentId === "coffee-real-castlery-seb-lift-top-large",
      },
      {
        key: "with-storage" as const,
        label: "With storage",
        productId: storageTargetProductId,
        active:
          currentId === "coffee-real-castlery-seb-storage-90" ||
          currentId === "coffee-real-castlery-seb-storage-120",
      },
    ].filter((option) =>
      Boolean(CATALOG_ITEMS[option.productId] ?? importedModelById.get(option.productId))
    );
  }, [importedModelById, selectedProduct]);

  const activeJaronArmKey: JaronConfigurationArmKey = selectedProduct?.id.endsWith("-wide-arm")
    ? "wide"
    : "slim";
  const jaronConfigurationGroups = useMemo(
    () =>
      JARON_CONFIGURATION_GROUPS.map((group) => ({
        ...group,
        options: group.options.filter(
          (option) =>
            Boolean(CATALOG_ITEMS[option.slimProductId] ?? importedModelById.get(option.slimProductId)) ||
            Boolean(CATALOG_ITEMS[option.wideProductId] ?? importedModelById.get(option.wideProductId))
        ),
      })).filter((group) => group.options.length > 0),
    [importedModelById]
  );
  const activeJaronConfigurationGroup =
    selectedProduct && JARON_CONFIGURATION_PRODUCT_IDS.includes(selectedProduct.id)
      ? jaronConfigurationGroups.find((group) =>
          group.options.some(
            (option) =>
              option.slimProductId === selectedProduct.id ||
              option.wideProductId === selectedProduct.id
          )
        ) ?? null
      : null;
  const activeJaronConfigurationOption =
    selectedProduct && JARON_CONFIGURATION_PRODUCT_IDS.includes(selectedProduct.id)
      ? jaronConfigurationGroups
          .flatMap((group) => group.options)
          .find(
            (option) =>
              option.slimProductId === selectedProduct.id ||
              option.wideProductId === selectedProduct.id
          ) ?? null
      : null;
  const visibleJaronConfigurationGroup =
    activeJaronConfigurationGroup ?? jaronConfigurationGroups[0] ?? null;
  const visibleJaronConfigurationOption =
    activeJaronConfigurationOption ?? visibleJaronConfigurationGroup?.options[0] ?? null;
  const showJaronConfigurationSelector = Boolean(
    selectedProduct &&
      JARON_CONFIGURATION_PRODUCT_IDS.includes(selectedProduct.id) &&
      visibleJaronConfigurationGroup
  );

  const auburnConfigurationGroups = useMemo(
    () =>
      AUBURN_CONFIGURATION_GROUPS.map((group) => ({
        ...group,
        options: group.options.filter((option) =>
          option.productId
            ? Boolean(CATALOG_ITEMS[option.productId] ?? importedModelById.get(option.productId))
            : option.orientations?.some((orientation) =>
                Boolean(
                  CATALOG_ITEMS[orientation.productId] ??
                    importedModelById.get(orientation.productId)
                )
              )
        ),
      })).filter((group) => group.options.length > 0),
    [importedModelById]
  );
  const activeAuburnConfigurationGroup =
    selectedProduct && AUBURN_CONFIGURATION_PRODUCT_IDS.includes(selectedProduct.id)
      ? auburnConfigurationGroups.find((group) =>
          group.options.some(
            (option) =>
              option.productId === selectedProduct.id ||
              option.orientations?.some(
                (orientation) => orientation.productId === selectedProduct.id
              )
          )
        ) ?? null
      : null;
  const activeAuburnConfigurationOption =
    selectedProduct && AUBURN_CONFIGURATION_PRODUCT_IDS.includes(selectedProduct.id)
      ? auburnConfigurationGroups
          .flatMap((group) => group.options)
          .find(
            (option) =>
              option.productId === selectedProduct.id ||
              option.orientations?.some(
                (orientation) => orientation.productId === selectedProduct.id
              )
          ) ?? null
      : null;
  const visibleAuburnConfigurationGroup =
    activeAuburnConfigurationGroup ?? auburnConfigurationGroups[0] ?? null;
  const visibleAuburnConfigurationOption =
    activeAuburnConfigurationOption ?? visibleAuburnConfigurationGroup?.options[0] ?? null;
  const showAuburnConfigurationSelector = Boolean(
    selectedProduct &&
      AUBURN_CONFIGURATION_PRODUCT_IDS.includes(selectedProduct.id) &&
      visibleAuburnConfigurationGroup
  );

  const commitEquivalentProduct = useCallback(
    ({
      targetProductId,
      historyLabel,
      ruleOrder,
      ensureImported = false,
    }: {
      targetProductId: string;
      historyLabel: string;
      ruleOrder: EquivalentVariantRuleOrder;
      ensureImported?: boolean;
    }) => {
      if (!selectedItem || !selectedProduct || targetProductId === selectedProduct.id) return;
      if (ensureImported) ensureImportedCatalogItem(targetProductId);
      const targetProduct = CATALOG_ITEMS[targetProductId];
      if (!targetProduct) return;

      commitItems(
        (previous) => {
          const current = previous.find((item) => item.instanceId === selectedItem.instanceId);
          const nextVariant = resolveEquivalentVariant({
            sourceProduct: selectedProduct,
            sourceVariantId: current?.variantId,
            targetProduct,
            ruleOrder,
          });
          return previous.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? {
                  ...item,
                  productId: targetProduct.id,
                  variantId: nextVariant?.id ?? targetProduct.defaultVariantId,
                }
              : item
          );
        },
        historyLabel
      );
    },
    [commitItems, ensureImportedCatalogItem, selectedItem, selectedProduct]
  );

  const switchSelectedProductModel = useCallback(
    (targetProductId: string, historyLabel: string) =>
      commitEquivalentProduct({
        targetProductId,
        historyLabel,
        ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.family,
        ensureImported: true,
      }),
    [commitEquivalentProduct]
  );

  const handleSelectJaronConfigurationGroup = useCallback(
    (groupKey: JaronConfigurationGroupKey) => {
      const group = jaronConfigurationGroups.find((candidate) => candidate.key === groupKey);
      const firstOption = group?.options[0];
      const targetProductId =
        activeJaronArmKey === "wide"
          ? firstOption?.wideProductId
          : firstOption?.slimProductId;
      if (group && targetProductId) {
        switchSelectedProductModel(
          targetProductId,
          `Change Jaron configuration to ${group.label}`
        );
      }
    },
    [activeJaronArmKey, jaronConfigurationGroups, switchSelectedProductModel]
  );
  const handleSelectJaronConfigurationOption = useCallback(
    (optionKey: string) => {
      const option = visibleJaronConfigurationGroup?.options.find(
        (candidate) => candidate.key === optionKey
      );
      const targetProductId =
        activeJaronArmKey === "wide" ? option?.wideProductId : option?.slimProductId;
      if (option && targetProductId) {
        switchSelectedProductModel(targetProductId, `Change Jaron model to ${option.label}`);
      }
    },
    [activeJaronArmKey, switchSelectedProductModel, visibleJaronConfigurationGroup]
  );
  const handleSelectJaronArm = useCallback(
    (armKey: JaronConfigurationArmKey) => {
      const targetProductId =
        armKey === "wide"
          ? visibleJaronConfigurationOption?.wideProductId
          : visibleJaronConfigurationOption?.slimProductId;
      if (targetProductId) {
        const label = armKey === "wide" ? "Wide arm" : "Slim arm";
        switchSelectedProductModel(targetProductId, `Change Jaron arm style to ${label}`);
      }
    },
    [switchSelectedProductModel, visibleJaronConfigurationOption]
  );
  const handleSelectAuburnConfigurationGroup = useCallback(
    (groupKey: AuburnConfigurationGroupKey) => {
      const group = auburnConfigurationGroups.find((candidate) => candidate.key === groupKey);
      const firstOption = group?.options[0];
      const orientationTarget = firstOption?.orientations?.find((orientation) =>
        Boolean(CATALOG_ITEMS[orientation.productId] ?? importedModelById.get(orientation.productId))
      )?.productId;
      const targetProductId = firstOption?.productId ?? orientationTarget;
      if (group && targetProductId) {
        switchSelectedProductModel(
          targetProductId,
          `Change Auburn configuration to ${group.label}`
        );
      }
    },
    [auburnConfigurationGroups, importedModelById, switchSelectedProductModel]
  );
  const handleSelectAuburnConfigurationOption = useCallback(
    (optionKey: string) => {
      const option = visibleAuburnConfigurationGroup?.options.find(
        (candidate) => candidate.key === optionKey
      );
      const activeOrientation = option?.orientations?.find(
        (orientation) => orientation.productId === selectedProduct?.id
      );
      const orientationTarget =
        activeOrientation?.productId ??
        option?.orientations?.find((orientation) =>
          Boolean(CATALOG_ITEMS[orientation.productId] ?? importedModelById.get(orientation.productId))
        )?.productId;
      const targetProductId = option?.productId ?? orientationTarget;
      if (option && targetProductId) {
        switchSelectedProductModel(targetProductId, `Change Auburn model to ${option.label}`);
      }
    },
    [importedModelById, selectedProduct?.id, switchSelectedProductModel, visibleAuburnConfigurationGroup]
  );
  const handleSelectAuburnOrientation = useCallback(
    (optionKey: string, orientationKey: string) => {
      const orientation = visibleAuburnConfigurationGroup?.options
        .find((candidate) => candidate.key === optionKey)
        ?.orientations?.find((candidate) => candidate.key === orientationKey);
      if (orientation) {
        switchSelectedProductModel(
          orientation.productId,
          `Change Auburn orientation to ${orientation.label}`
        );
      }
    },
    [switchSelectedProductModel, visibleAuburnConfigurationGroup]
  );

  const selectEquivalentProduct = useCallback(
    (
      targetProductId: string,
      label: string,
      kind: "orientation" | "arm" | "model" | "shape" | "length" | "hugg" | "seb"
    ) => {
      const settings = {
        orientation: {
          prefix: "Change orientation to",
          ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.orientation,
          ensureImported: true,
        },
        arm: {
          prefix: "Change variant to",
          ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.modelWithLeg,
          ensureImported: true,
        },
        model: {
          prefix: "Change model to",
          ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.modelWithLeg,
          ensureImported: true,
        },
        shape: {
          prefix: "Change variant to",
          ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.model,
          ensureImported: false,
        },
        length: {
          prefix: "Change length to",
          ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.model,
          ensureImported: false,
        },
        hugg: {
          prefix: "Change Hugg model to",
          ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.model,
          ensureImported: true,
        },
        seb: {
          prefix: "Change Seb model to",
          ruleOrder: EQUIVALENT_VARIANT_RULE_ORDERS.finishOnly,
          ensureImported: true,
        },
      }[kind];
      commitEquivalentProduct({
        targetProductId,
        historyLabel: `${settings.prefix} ${label}`,
        ruleOrder: settings.ruleOrder,
        ensureImported: settings.ensureImported,
      });
    },
    [commitEquivalentProduct]
  );

  const handleSelectSloaneBenchCushion = useCallback(
    (cushion: "no" | "leather", label: string) => {
      if (!selectedItem) return;
      const productId = getSloaneBenchProductId(activeSelectedBenchSize, cushion);
      ensureImportedCatalogItem(productId);
      const targetProduct = CATALOG_ITEMS[productId];
      if (!targetProduct) return;
      commitItems(
        (previous) =>
          previous.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? {
                  ...item,
                  productId: targetProduct.id,
                  variantId: targetProduct.defaultVariantId,
                }
              : item
          ),
        `Change variant to ${label}`
      );
    },
    [activeSelectedBenchSize, commitItems, ensureImportedCatalogItem, selectedItem]
  );

  const handleSelectProductConfiguration = useCallback(
    (code: string, label: string) => {
      if (!selectedItem) return;
      setItemConfigurationByInstanceId((previous) => ({
        ...previous,
        [selectedItem.instanceId]: code,
      }));
      commitItems(
        (previous) =>
          previous.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? { ...item, configurationCode: code }
              : item
          ),
        `Change layout to ${label}`
      );
    },
    [commitItems, selectedItem, setItemConfigurationByInstanceId]
  );

  const handleSelectFinishButton = useCallback(
    (key: string, label: string, variantId: string) => {
      if (!selectedItem) return;
      const activeLegFinishKey = normalizeProductVariantKey(
        activeStructuredVariant?.variant.legFinishCode
      );
      const activeSizeKey = getProductVariantSizeKey(activeStructuredVariant?.variant);
      const target =
        structuredVariants.find(
          (entry) =>
            entry.materialKey === key &&
            Boolean(activeSizeKey) &&
            getProductVariantSizeKey(entry.variant) === activeSizeKey
        ) ??
        structuredVariants.find((entry) => entry.materialKey === key) ??
        structuredVariants.find(
          (entry) =>
            entry.materialType === label &&
            Boolean(activeLegFinishKey) &&
            normalizeProductVariantKey(entry.variant.legFinishCode) === activeLegFinishKey
        ) ??
        structuredVariants.find((entry) => entry.materialType === label) ??
        structuredVariants.find((entry) => entry.variant.id === variantId);
      if (!target) return;
      commitItems(
        (previous) =>
          previous.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? { ...item, variantId: target.variant.id }
              : item
          ),
        `Change ${variantSelectorLabel.toLowerCase()} to ${label}`
      );
    },
    [activeStructuredVariant?.variant, commitItems, selectedItem, structuredVariants, variantSelectorLabel]
  );

  const handleSelectFinishSwatch = useCallback(
    (key: string, label: string, variantId: string, productId: string) => {
      if (!selectedItem || !selectedProduct) return;
      if (productId) {
        const targetProduct = CATALOG_ITEMS[productId];
        if (!targetProduct) return;
        commitItems(
          (previous) =>
            previous.map((item) => {
              if (item.instanceId !== selectedItem.instanceId) return item;
              const activeVariant = selectedProduct.variants.find(
                (variant) => variant.id === item.variantId
              );
              const activeFinishCode = normalizeProductVariantMatchValue(
                activeVariant?.finishCode
              );
              const activeFinishLabel = normalizeProductVariantMatchValue(
                activeVariant?.finishLabel ?? activeVariant?.label
              );
              const preservedVariant =
                targetProduct.variants.find((variant) => variant.id === item.variantId) ??
                targetProduct.variants.find(
                  (variant) =>
                    activeFinishCode.length > 0 &&
                    normalizeProductVariantMatchValue(variant.finishCode) === activeFinishCode
                ) ??
                targetProduct.variants.find(
                  (variant) =>
                    activeFinishLabel.length > 0 &&
                    normalizeProductVariantMatchValue(variant.finishLabel ?? variant.label) ===
                      activeFinishLabel
                ) ??
                targetProduct.variants[0];
              return {
                ...item,
                productId: targetProduct.id,
                variantId: preservedVariant?.id ?? targetProduct.defaultVariantId,
              };
            }),
          `Change fabric colour to ${label}`
        );
        return;
      }

      const target =
        structuredVariants.find(
          (entry) => entry.materialKey === key && entry.colourLabel === activeColourLabel
        ) ??
        structuredVariants.find((entry) => entry.materialKey === key) ??
        structuredVariants.find(
          (entry) =>
            entry.materialDisplayLabel.trim().toLowerCase() === label.trim().toLowerCase() &&
            entry.colourLabel === activeColourLabel
        ) ??
        structuredVariants.find(
          (entry) =>
            entry.materialDisplayLabel.trim().toLowerCase() === label.trim().toLowerCase()
        ) ??
        structuredVariants.find((entry) => entry.variant.id === variantId);
      if (!target) return;
      commitItems(
        (previous) =>
          previous.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? { ...item, variantId: target.variant.id }
              : item
          ),
        `Change ${variantSelectorLabel.toLowerCase()} to ${label}`
      );
    },
    [activeColourLabel, commitItems, selectedItem, selectedProduct, structuredVariants, variantSelectorLabel]
  );

  const selectVariant = useCallback(
    (variantId: string, label: string, historyPrefix: string) => {
      if (!selectedItem || variantId === selectedItem.variantId) return;
      commitItems(
        (previous) =>
          previous.map((item) =>
            item.instanceId === selectedItem.instanceId ? { ...item, variantId } : item
          ),
        `${historyPrefix} ${label}`
      );
    },
    [commitItems, selectedItem]
  );

  const handleSelectStructuredColour = useCallback(
    (variantId: string, label: string) => {
      if (!selectedItem || !selectedProduct) return;
      const variant = selectedProduct.variants.find((candidate) => candidate.id === variantId);
      if (!variant) return;
      const activeLegFinishKey = normalizeProductVariantKey(
        activeStructuredVariant?.variant.legFinishCode
      );
      const targetBaseFinishKey = getProductVariantBaseFinishKey(variant);
      const targetVariant = activeLegFinishKey
        ? selectedProduct.variants.find(
            (candidate) =>
              getProductVariantBaseFinishKey(candidate) === targetBaseFinishKey &&
              normalizeProductVariantKey(candidate.legFinishCode) === activeLegFinishKey
          ) ?? variant
        : variant;
      commitItems(
        (previous) =>
          previous.map((item) =>
            item.instanceId === selectedItem.instanceId
              ? { ...item, variantId: targetVariant.id }
              : item
          ),
        `Change colour to ${label}`
      );
    },
    [activeStructuredVariant?.variant.legFinishCode, commitItems, selectedItem, selectedProduct]
  );

  const handleShowStructuredColourPreview = useCallback(
    (variantId: string, target: HTMLButtonElement, estimatedHeight: number) => {
      if (hoveredColourPreviewHideTimerRef.current) {
        window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
        hoveredColourPreviewHideTimerRef.current = null;
      }
      const rect = target.getBoundingClientRect();
      const cardWidth = 320;
      const offset = 12;
      let x = rect.right + offset;
      if (x + cardWidth > window.innerWidth - 8) {
        x = Math.max(8, rect.left - cardWidth - offset);
      }
      const y = Math.max(
        8,
        Math.min(rect.top - 40, window.innerHeight - estimatedHeight - 8)
      );
      setHoveredColourVariantId(variantId);
      setHoveredColourPreview({ variantId, x, y });
      window.requestAnimationFrame(() => setHoveredColourPreviewVisible(true));
    },
    []
  );
  const handleHideStructuredColourPreview = useCallback((variantId: string) => {
    setHoveredColourVariantId((current) => (current === variantId ? null : current));
    setHoveredColourPreviewVisible(false);
    if (hoveredColourPreviewHideTimerRef.current) {
      window.clearTimeout(hoveredColourPreviewHideTimerRef.current);
    }
    hoveredColourPreviewHideTimerRef.current = window.setTimeout(() => {
      setHoveredColourPreview((current) =>
        current?.variantId === variantId ? null : current
      );
      hoveredColourPreviewHideTimerRef.current = null;
    }, 140);
  }, []);
  const handleBlurStructuredColourPreview = useCallback((variantId: string) => {
    setHoveredColourVariantId((current) => (current === variantId ? null : current));
    setHoveredColourPreviewVisible(false);
    setHoveredColourPreview((current) =>
      current?.variantId === variantId ? null : current
    );
  }, []);

  const productModelVariantControlsState = useMemo<ProductModelVariantControlsState>(() => {
    const jaronConfiguration =
      showJaronConfigurationSelector && visibleJaronConfigurationGroup
        ? {
            groups: jaronConfigurationGroups.map((group) => {
              const firstOption = group.options[0];
              const targetProductId =
                activeJaronArmKey === "wide"
                  ? firstOption?.wideProductId
                  : firstOption?.slimProductId;

              return {
                key: group.key,
                label: group.label,
                disabled: !targetProductId || !canEdit,
                options: group.options.map((option) => {
                  const optionTargetProductId =
                    activeJaronArmKey === "wide"
                      ? option.wideProductId
                      : option.slimProductId;

                  return {
                    key: option.key,
                    label: option.label,
                    description: option.description,
                    diagram: option.diagram,
                    disabled: !optionTargetProductId || !canEdit,
                  };
                }),
              };
            }),
            activeGroupKey: visibleJaronConfigurationGroup.key,
            activeOptionKey: visibleJaronConfigurationOption?.key ?? null,
            activeArmKey: activeJaronArmKey,
            armOptions: visibleJaronConfigurationOption
              ? [
                  {
                    key: "slim" as const,
                    label: "Slim arm",
                    disabled: !visibleJaronConfigurationOption.slimProductId || !canEdit,
                  },
                  {
                    key: "wide" as const,
                    label: "Wide arm",
                    disabled: !visibleJaronConfigurationOption.wideProductId || !canEdit,
                  },
                ]
              : [],
          }
        : null;

    const isProductAvailable = (productId: string) =>
      Boolean(CATALOG_ITEMS[productId] ?? importedModelById.get(productId));
    const auburnConfiguration =
      showAuburnConfigurationSelector && visibleAuburnConfigurationGroup
        ? {
            configurationCount: auburnConfigurationGroups.reduce(
              (count, group) =>
                count +
                group.options.reduce(
                  (groupCount, option) => groupCount + (option.orientations?.length ?? 1),
                  0
                ),
              0
            ),
            groups: auburnConfigurationGroups.map((group) => {
              const firstOption = group.options[0];
              const firstOrientationTarget = firstOption?.orientations?.find((orientation) =>
                isProductAvailable(orientation.productId)
              )?.productId;
              const targetProductId = firstOption?.productId ?? firstOrientationTarget;

              return {
                key: group.key,
                label: group.label,
                disabled: !targetProductId || !canEdit,
                options: group.options.map((option) => {
                  const activeOrientation = option.orientations?.find(
                    (orientation) => orientation.productId === selectedProduct?.id
                  );
                  const orientationTarget =
                    activeOrientation?.productId ??
                    option.orientations?.find((orientation) =>
                      isProductAvailable(orientation.productId)
                    )?.productId;
                  const optionTargetProductId = option.productId ?? orientationTarget;

                  return {
                    key: option.key,
                    label: option.label,
                    description: option.description,
                    diagram: activeOrientation?.diagram ?? option.diagram,
                    disabled: !optionTargetProductId || !canEdit,
                    orientations: (option.orientations ?? []).map((orientation) => ({
                      key: orientation.key,
                      label: orientation.label,
                      diagram: orientation.diagram,
                      active: orientation.productId === selectedProduct?.id,
                      disabled: !canEdit || !isProductAvailable(orientation.productId),
                    })),
                  };
                }),
              };
            }),
            activeGroupKey: visibleAuburnConfigurationGroup.key,
            activeOptionKey: visibleAuburnConfigurationOption?.key ?? null,
          }
        : null;

    const orientationControlOptions = (orientationOptions ?? []).map((option) => ({
      key: `orientation-${option.label}`,
      label: option.label,
      productId: option.productId ?? null,
      active: option.productId === selectedProduct?.id,
      disabled: !option.productId || !canEdit,
      title: option.label,
    }));

    const armStyleControlOptions =
      !showJaronConfigurationSelector &&
      !showAuburnConfigurationSelector &&
      armStyleOptions?.length
        ? armStyleOptions.map((option) => ({
            key: option.label,
            label: option.label,
            productId: option.productId ?? null,
            active: option.productId === selectedProduct?.id,
            disabled: !option.productId || !canEdit,
            title: option.productId
              ? option.label
              : `${option.label} (model not added yet)`,
          }))
        : [];

    let variantSection: ProductModelVariantControlsState["variantSection"] = null;
    if (
      !showJaronConfigurationSelector &&
      !showAuburnConfigurationSelector &&
      showVariantsSection &&
      selectedProduct
    ) {
      if (hasStructuredVariantLabels || useModelOptionsAsVariants) {
        variantSection = {
          label: hasStructuredVariantLabels ? "Model" : "Variants",
          kind: "model",
          options: modelSelectorProductIds.flatMap((productId) => {
            const optionProduct = CATALOG_ITEMS[productId];
            if (!optionProduct) return [];

            const casaWidthMatch = optionProduct.id.match(
              /(?:casa|seb|sloane)-tv-console-(\d+)/i
            );
            const optionProductIdLower = optionProduct.id.toLowerCase();
            const averyModelLabel =
              optionProductIdLower ===
              "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman"
                ? "Swivel Armchair with Ottoman"
                : optionProductIdLower ===
                    "armchair-real-castlery-avery-performance-armchair-with-ottoman"
                  ? "Armchair with Ottoman"
                  : optionProductIdLower ===
                      "armchair-real-castlery-avery-performance-swivel-armchair"
                    ? "Swivel Armchair"
                    : optionProductIdLower ===
                        "armchair-real-castlery-avery-performance-armchair"
                      ? "Armchair"
                      : null;
            const optionLabel =
              (optionProductIdLower.includes("sloane-dining-table")
                ? "Dining table"
                : optionProductIdLower.includes("sloane-travertine")
                  ? "Travertine dining table"
                  : optionProductIdLower.includes("sloane-bench")
                    ? "Bench"
                    : null) ??
              averyModelLabel ??
              (casaWidthMatch ? `${casaWidthMatch[1]}CM` : null) ??
              optionProduct.metadata?.modelLabel ??
              optionProduct.title.match(/(\d+\s*Seater)/i)?.[1] ??
              "Standard";

            return [
              {
                key: optionProduct.id,
                label: optionLabel,
                productId: optionProduct.id,
                active: optionProduct.id === selectedModelProductId,
                disabled: !canEdit,
                title: optionLabel,
              },
            ];
          }),
        };
      } else if (useShapeOptionsAsVariants) {
        variantSection = {
          label: "Variants",
          kind: "shape",
          options: (shapeOptions ?? []).map((option) => ({
            key: `variant-shape-${option.label}`,
            label: option.label,
            productId: option.productId ?? null,
            active: option.productId === selectedProduct.id,
            disabled: !option.productId || !canEdit,
            title: option.label,
          })),
        };
      } else if (useLengthOptionsAsVariants) {
        variantSection = {
          label: "Variants",
          kind: "length",
          options: (lengthOptions ?? []).map((option) => ({
            key: `variant-length-${option.label}`,
            label: option.label,
            productId: option.productId ?? null,
            active: option.productId === selectedProduct.id,
            disabled: !option.productId || !canEdit,
            title: option.label,
          })),
        };
      } else if (isSloaneBenchSelected) {
        variantSection = {
          label: "Variants",
          kind: "sloane-bench",
          options: [
            { key: "no" as const, label: "No Cushion", colorHex: "#9c9c9c" },
            {
              key: "leather" as const,
              label: "Leather Cushion",
              colorHex: "#8a643f",
            },
          ].map((option) => ({
            key: `variant-swatch-sloane-bench-${option.key}`,
            label: option.label,
            productId: null,
            active: activeSelectedBenchCushion === option.key,
            disabled: false,
            title: "",
            cushion: option.key,
            colorHex: option.colorHex,
            testId: `variant-swatch-sloane-bench-${option.key}`,
          })),
        };
      } else {
        variantSection = {
          label: "Variants",
          kind: "variant",
          options: selectedProduct.variants.map((variant) => ({
            key: variant.id,
            label: variant.label.replace(/^\s*\d+\s*(?:cm)?\s*/i, "").trim(),
            productId: null,
            variantId: variant.id,
            active: variant.id === selectedItem?.variantId,
            disabled: false,
            title: "",
            colorHex: variant.colorHex,
            testId: `variant-swatch-${variant.id}`,
          })),
        };
      }
    }

    const lengthControlOptions =
      lengthOptions?.length && !useLengthOptionsAsVariants && selectedProduct
        ? lengthOptions.map((option) => ({
            key: option.label,
            label: option.label,
            productId: option.productId ?? null,
            active: option.productId === selectedProduct.id,
            disabled: !option.productId || !canEdit,
            title: option.label,
          }))
        : [];

    const huggModelControlOptions =
      huggModelOptions.length > 1
        ? huggModelOptions.map((option) => ({
            key: option.key,
            label: option.label,
            productId: option.productId,
            active: option.active,
            disabled: !canEdit,
            title: option.label,
          }))
        : [];
    const sebModelControlOptions =
      sebCoffeeTableModelOptions.length > 1
        ? sebCoffeeTableModelOptions.map((option) => ({
            key: option.key,
            label: option.label,
            productId: option.productId,
            active: option.active,
            disabled: !canEdit,
            title: option.label,
          }))
        : [];

    const layout =
      selectedItem && selectedConfigOptions.length > 1
        ? {
            label: selectedConfigUi?.label ?? "Layout",
            options: selectedConfigOptions.map((code) => ({
              code,
              label: selectedConfigUi?.option_labels?.[code] ?? code,
              active: code === selectedConfigurationCode,
              disabled: !canEdit,
            })),
            helperText: selectedConfigUi?.helper_text || null,
            recommendedPlanningSize: selectedConfigEntry
              ? `${Math.round(
                  Number(
                    selectedConfigEntry.planning_bounds_cm?.width ??
                      selectedConfigEntry.dimensions_recommended_planning?.width_cm ??
                      selectedConfigEntry.placement_footprint?.planning_width_cm ??
                      0
                  )
                )} x ${Math.round(
                  Number(
                    selectedConfigEntry.planning_bounds_cm?.depth ??
                      selectedConfigEntry.dimensions_recommended_planning?.depth_cm ??
                      selectedConfigEntry.placement_footprint?.planning_depth_cm ??
                      0
                  )
                )} cm`
              : null,
            visualFootprint:
              selectedConfigBehavior?.affects_visual_footprint &&
              selectedConfigEntry?.visual_bounds_cm
                ? `${Math.round(
                    Number(selectedConfigEntry.visual_bounds_cm.width ?? 0)
                  )} x ${Math.round(
                    Number(selectedConfigEntry.visual_bounds_cm.depth ?? 0)
                  )} cm`
                : null,
            estimationNote: selectedConfigEntry?.estimation_note || null,
          }
        : null;

    return {
      orientationOptions: orientationControlOptions,
      jaronConfiguration,
      auburnConfiguration,
      armStyleOptions: armStyleControlOptions,
      variantSection,
      sloaneBenchMaterial: sloaneBenchMaterialSwatch,
      lengthOptions: lengthControlOptions,
      huggModelOptions: huggModelControlOptions,
      sebModelOptions: sebModelControlOptions,
      layout,
    };
  }, [
    activeJaronArmKey,
    activeSelectedBenchCushion,
    armStyleOptions,
    auburnConfigurationGroups,
    canEdit,
    hasStructuredVariantLabels,
    huggModelOptions,
    importedModelById,
    isSloaneBenchSelected,
    jaronConfigurationGroups,
    lengthOptions,
    modelSelectorProductIds,
    orientationOptions,
    sebCoffeeTableModelOptions,
    selectedConfigBehavior,
    selectedConfigEntry,
    selectedConfigOptions,
    selectedConfigUi,
    selectedConfigurationCode,
    selectedItem,
    selectedModelProductId,
    selectedProduct,
    shapeOptions,
    showAuburnConfigurationSelector,
    showJaronConfigurationSelector,
    showVariantsSection,
    sloaneBenchMaterialSwatch,
    useLengthOptionsAsVariants,
    useModelOptionsAsVariants,
    useShapeOptionsAsVariants,
    visibleAuburnConfigurationGroup,
    visibleAuburnConfigurationOption,
    visibleJaronConfigurationGroup,
    visibleJaronConfigurationOption,
  ]);

  const productFinishControlsState: ProductFinishControlsState = (() => {
    const compactFinishButtons =
      selectedProduct?.id === "bed-real-castlery-joseph" ||
      selectedProduct?.id === "bed-real-castlery-rochelle-boucle" ||
      selectedProduct?.id === "bed-real-castlery-seb" ||
      selectedProduct?.id === "bed-real-castlery-dalton" ||
      selectedProduct?.id === "bed-real-castlery-claude";
    const finishSourceOptions =
      huggFabricSwatchOptions.length > 0
        ? huggFabricSwatchOptions.map((entry) => ({
            key: entry.key,
            label: entry.label,
            variantId: "",
            colorHex: entry.colorHex,
            productId: entry.productId,
            swatchTextureUrl: entry.swatchTextureUrl,
            isActive: entry.active,
          }))
        : materialOptions.map((entry) => ({
            key: entry.key,
            label: entry.label,
            variantId: entry.variantId,
            colorHex: entry.colorHex,
            productId: "",
            swatchTextureUrl: entry.swatchTextureUrl ?? null,
            isActive: false,
          }));
    const finish =
      showFinishSection || huggFabricSwatchOptions.length > 1
        ? {
            label: variantSelectorLabel,
            selectedLabel:
              hasWoodColourOptions && activeMaterialLabel
                ? huggFabricSwatchOptions.length > 0
                  ? (huggFabricSwatchOptions.find((option) => option.active)?.label ??
                    huggFabricSwatchOptions[0].label)
                  : activeMaterialLabel
                : null,
            layout: hasWoodColourOptions
              ? ("swatches" as const)
              : compactFinishButtons
                ? ("compact-buttons" as const)
                : ("buttons" as const),
            options: finishSourceOptions.map((option) => {
              const active =
                option.isActive ||
                option.variantId === activeStructuredVariant?.variant.id ||
                option.key === activeStructuredVariant?.materialKey ||
                option.label.toLowerCase() ===
                  String(activeMaterialType ?? "").trim().toLowerCase() ||
                option.label.toLowerCase() ===
                  String(activeMaterialLabel ?? "").trim().toLowerCase();
              const sampleEntry =
                structuredVariants.find(
                  (entry) =>
                    entry.materialDisplayLabel.trim().toLowerCase() ===
                    option.label.trim().toLowerCase()
                ) ??
                structuredVariants.find(
                  (entry) => entry.variant.id === option.variantId
                );
              const finishKey = String(
                sampleEntry?.variant.finishCode ?? option.label
              )
                .trim()
                .toLowerCase()
                .replace(/_/g, "-")
                .replace(/[^a-z0-9-]+/g, "-");
              const labelKey = option.label
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-");

              return {
                key: option.key,
                label: option.label,
                variantId: option.variantId,
                productId: option.productId,
                colorHex: option.colorHex,
                swatchTextureUrl:
                  option.swatchTextureUrl ??
                  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[labelKey] ??
                  null,
                active,
              };
            }),
          }
        : null;

    const legFinish =
      legFinishOptions.length > 1
        ? {
            selectedLabel:
              legFinishOptions.find(
                (option) => option.variantId === selectedItem?.variantId
              )?.label ??
              activeStructuredVariant?.variant.legFinishLabel ??
              legFinishOptions[0]?.label ??
              "",
            options: legFinishOptions.map((option) => {
              const labelKey = option.label
                .trim()
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "");

              return {
                key: option.key,
                label: option.label,
                variantId: option.variantId,
                colorHex: option.colorHex,
                swatchTextureUrl:
                  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[option.key] ??
                  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[labelKey] ??
                  null,
                active:
                  option.variantId === selectedItem?.variantId ||
                  option.key ===
                    normalizeProductVariantKey(
                      activeStructuredVariant?.variant.legFinishCode
                    ),
                disabled: !canEdit,
              };
            }),
          }
        : null;

    const sloaneBench = isSloaneBenchSelected
      ? {
          selectedLabel:
            activeSelectedBenchCushion === "leather"
              ? "With cushion"
              : "No cushion",
          options: [
            {
              key: "leather" as const,
              label: "With cushion",
              active: activeSelectedBenchCushion === "leather",
              disabled: !canEdit,
            },
            {
              key: "no" as const,
              label: "No cushion",
              active: activeSelectedBenchCushion === "no",
              disabled: !canEdit,
            },
          ],
        }
      : null;

    const size = showSizeSection
      ? {
          options: sizeOptionsForActiveSelection.map((option) => {
            const josephSizeLabel = (() => {
              if (selectedProduct?.id !== "bed-real-castlery-joseph") {
                return null;
              }

              const marker = [
                option.variantId,
                option.key,
                option.label,
              ]
                .join(" ")
                .toLowerCase();
              if (marker.includes("queen")) return "Queen";
              if (marker.includes("king")) return "King";

              const widthMatch =
                marker.match(/(\d+)\s*x\s*\d+\s*cm/) ??
                marker.match(/(\d{3,4})x\d{3,4}/);
              const width = widthMatch?.[1] ? Number(widthMatch[1]) : 0;
              if (width > 0 && width < 180) return "Queen";
              if (width >= 180 && width < 1000) return "King";
              if (width >= 1000 && width < 1800) return "Queen";
              if (width >= 1800) return "King";
              return null;
            })();

            return {
              key: option.key,
              label: josephSizeLabel ?? option.label,
              variantId: option.variantId,
              active: option.variantId === selectedItem?.variantId,
              disabled: !canEdit,
            };
          }),
        }
      : null;

    const structuredColour = (() => {
      if (!showStructuredColourSelector) return null;

      const previewEntry = hoveredColourPreview
        ? structuredVariants.find(
            (entry) => entry.variant.id === hoveredColourPreview.variantId
          )
        : null;
      const previewGroup = previewEntry
        ? groupedVisibleColourVariants.find((group) =>
            group.entries.some(
              (entry) => entry.variant.id === previewEntry.variant.id
            )
          )
        : null;
      const preview = (() => {
        if (!previewEntry || !hoveredColourPreview) return null;

        const previewFinishKey = String(
          previewEntry.variant.finishCode ?? ""
        )
          .trim()
          .toLowerCase()
          .replace(/_/g, "-");
        const previewSwatchGroup = String(
          previewEntry.variant.swatchGroup ?? ""
        )
          .trim()
          .toLowerCase();
        const previewFinishLabelKey = String(
          previewEntry.variant.finishLabel ?? previewEntry.colourLabel
        )
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");
        const previewColourKey = String(previewEntry.colourLabel)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-");
        const isHuggWoodPreview =
          Boolean(selectedProduct?.id.includes("hugg")) &&
          (hasWoodColourOptions || previewSwatchGroup.includes("wood"));
        const useWoodPreviewSwatch =
          previewSwatchGroup.includes("wood") || isHuggWoodPreview;
        const importedSwatchTextureUrl =
          previewEntry.variant.swatchTextureUrl?.trim() || null;
        const previewSwatchUrl =
          getHighResolutionSwatchUrl(
            importedSwatchTextureUrl ??
              (useWoodPreviewSwatch
                ? (selectedProduct?.id.includes("hugg")
                    ? HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishKey] ??
                      HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[
                        previewFinishLabelKey
                      ] ??
                      HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[previewColourKey]
                    : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishKey] ??
                      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                        previewFinishLabelKey
                      ] ??
                      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[previewColourKey]) ??
                  null
                : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[previewFinishKey] ??
                  CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                    String(previewEntry.materialType).toLowerCase() +
                      "-" +
                      previewEntry.colourLabel
                        .trim()
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, "-")
                  ] ??
                  null)
          ) ?? null;
        const previewProfile = isHuggWoodPreview
          ? null
          : resolveFabricDetailProfile({
              finishCode: previewFinishKey,
              finishLabel: previewEntry.variant.finishLabel?.trim() || "",
              colourLabel: previewEntry.colourLabel,
              materialType: previewEntry.materialType,
              productId: selectedProduct?.id,
            });
        const previewSubtitle = isHuggWoodPreview
          ? "Wood finish"
          : [previewEntry.materialType, previewGroup?.label]
              .filter(Boolean)
              .join(" • ");

        return {
          x: hoveredColourPreview.x,
          y: hoveredColourPreview.y,
          visible: hoveredColourPreviewVisible,
          colorHex:
            previewEntry.variant.swatchHex ?? previewEntry.variant.colorHex,
          swatchTextureUrl: previewSwatchUrl,
          title: getMaterialDisplayLabel(previewEntry.variant),
          subtitle: previewSubtitle || null,
          tags: previewProfile?.tags ?? [],
          finishCode: previewEntry.variant.finishCode
            ? previewEntry.variant.finishCode.replace(/_/g, " ")
            : null,
          compositionHeading: previewProfile
            ? String(previewEntry.materialType).toLowerCase() === "leather"
              ? "Leather composition"
              : "Fabric composition"
            : null,
          composition: previewProfile?.composition ?? null,
          care: previewProfile?.care ?? null,
        };
      })();

      const selectedLabel = activeStructuredVariant
        ? (() => {
            if (!hasWoodColourOptions) {
              return getMaterialDisplayLabel(activeStructuredVariant.variant);
            }
            const woodEntries = groupedVisibleColourVariants.flatMap(
              (group) => group.entries
            );
            const activeWoodEntry =
              woodEntries.find(
                (entry) => entry.variant.id === selectedItem?.variantId
              ) ?? woodEntries[0];
            return activeWoodEntry
              ? getMaterialDisplayLabel(activeWoodEntry.variant)
              : getMaterialDisplayLabel(activeStructuredVariant.variant);
          })()
        : null;

      return {
        label:
          colourSelectorLabel ??
          (hasWoodColourOptions
            ? "Wood colour"
            : activeMaterialType === "Leather"
              ? "Stocked Leathers:"
              : "Stocked Fabrics:"),
        selectedLabel,
        preview,
        groups: groupedVisibleColourVariants.map((group) => ({
          key: group.key,
          label:
            !hasWoodColourOptions && group.label
              ? group.label === "Stocked"
                ? "Stocked fabrics:"
                : "Custom fabrics:"
              : null,
          helperText:
            !hasWoodColourOptions && group.key === "custom"
              ? "Create a piece made just for you in one of our custom fabrics."
              : null,
          options: group.entries.map((entry) => {
            const { variant, colourLabel } = entry;
            const finishKey = String(variant.finishCode ?? "")
              .trim()
              .toLowerCase()
              .replace(/_/g, "-");
            const swatchGroup = String(variant.swatchGroup ?? "")
              .trim()
              .toLowerCase();
            const finishLabelKey = String(
              variant.finishLabel ?? colourLabel
            )
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-");
            const colourLabelKey = String(colourLabel)
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-");
            const isHuggWoodSwatch =
              Boolean(selectedProduct?.id.includes("hugg")) &&
              (hasWoodColourOptions || swatchGroup.includes("wood"));
            const useWoodSwatchTexture =
              swatchGroup.includes("wood") || isHuggWoodSwatch;
            const importedSwatchTextureUrl =
              variant.swatchTextureUrl?.trim() || null;
            const swatchTextureUrl =
              getHighResolutionSwatchUrl(
                importedSwatchTextureUrl ??
                  (useWoodSwatchTexture
                    ? (selectedProduct?.id.includes("hugg")
                        ? HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                          HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[
                            finishLabelKey
                          ] ??
                          HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[
                            colourLabelKey
                          ]
                        : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                          CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                            finishLabelKey
                          ] ??
                          CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                            colourLabelKey
                          ]) ?? null
                    : CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[finishKey] ??
                      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[
                        String(entry.materialType).toLowerCase() +
                          "-" +
                          colourLabel
                            .trim()
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, "-")
                      ] ??
                      null)
              ) ?? null;
            const materialDisplayLabel = getMaterialDisplayLabel(variant);
            const hoverProfile = resolveFabricDetailProfile({
              finishCode: finishKey,
              finishLabel: variant.finishLabel?.trim() || "",
              colourLabel,
              materialType: entry.materialType,
              productId: selectedProduct?.id,
            });

            return {
              variantId: variant.id,
              label: materialDisplayLabel,
              colorHex: variant.swatchHex ?? variant.colorHex,
              swatchTextureUrl,
              active: variant.id === selectedItem?.variantId,
              hovered: variant.id === hoveredColourVariantId,
              estimatedPreviewHeight: isHuggWoodSwatch
                ? 200
                : hoverProfile
                  ? 560
                  : 340,
            };
          }),
        })),
      };
    })();

    return {
      finish,
      legFinish,
      singleWoodFinish: singleWoodFinishSwatch,
      sloaneBench,
      size,
      structuredColour,
    };
  })();

  return {
    state: {
      previewVariantId: null,
      previewMaterialPresetId: null,
      productModelVariantControlsState,
      productFinishControlsState,
      hoveredColourVariantId,
      hoveredColourPreview,
      hoveredColourPreviewVisible,
      isHuggWithWoodOptions,
      huggFabricSwatchOptions,
      singleWoodFinishSwatch,
      sloaneBenchMaterialSwatch,
      huggModelOptions,
      sebCoffeeTableModelOptions,
      activeJaronArmKey,
      jaronConfigurationGroups,
      visibleJaronConfigurationGroup,
      visibleJaronConfigurationOption,
      showJaronConfigurationSelector,
      auburnConfigurationGroups,
      visibleAuburnConfigurationGroup,
      visibleAuburnConfigurationOption,
      showAuburnConfigurationSelector,
    },
    actions: {
      switchSelectedProductModel,
      modelControls: {
        handleSelectProductOrientation: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "orientation"),
        handleSelectJaronConfigurationGroup,
        handleSelectJaronConfigurationOption,
        handleSelectJaronArm,
        handleSelectAuburnConfigurationGroup,
        handleSelectAuburnConfigurationOption,
        handleSelectAuburnOrientation,
        handleSelectArmStyleVariant: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "arm"),
        handleSelectProductModelVariant: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "model"),
        handleSelectProductShapeVariant: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "shape"),
        handleSelectProductLengthVariant: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "shape"),
        handleSelectSloaneBenchCushion,
        handleSelectProductLength: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "length"),
        handleSelectHuggModel: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "hugg"),
        handleSelectSebModel: (productId: string, label: string) =>
          selectEquivalentProduct(productId, label, "seb"),
        handleSelectProductConfiguration,
      },
      finishControls: {
        handleSelectFinishButton,
        handleSelectFinishSwatch,
        handleSelectLegFinish: (variantId: string, label: string) =>
          selectVariant(variantId, label, "Change wood colour to"),
        handleSelectSloaneBenchCushion,
        handleSelectProductSize: (variantId: string, label: string) =>
          selectVariant(variantId, label, "Change size to"),
        handleSelectStructuredColour,
        handleShowStructuredColourPreview,
        handleHideStructuredColourPreview,
        handleBlurStructuredColourPreview,
      },
    },
  };
}
