import { CATALOG_ITEMS, CATALOG_ITEMS_MAP } from "@/lib/catalog";
import {
  CATEGORY_DEFAULTS,
  getCategoryDefaults,
  type CatalogItemSchema,
  type ProductCategory,
  type RoomTag,
} from "@/lib/catalog-schema";
import { normalizeImportedVariants } from "@/lib/catalog/imported-variant-normalization";
import { IMPORTED_VARIANT_PIPELINE_REVISION } from "@/lib/catalog/variant-normalization";

export type ImportedConfigurationEntry = {
  configuration_code?: string;
  configuration_label?: string;
  state_type?: string;
  description?: string;
  dimensions?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  dimensions_estimate?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  dimensions_recommended_planning?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  planning_bounds_cm?: {
    width?: number;
    depth?: number;
    height?: number;
  };
  visual_bounds_cm?: {
    width?: number;
    depth?: number;
    height?: number;
  };
  placement_footprint?: {
    planning_width_cm?: number;
    planning_depth_cm?: number;
  };
  estimation_note?: string;
  node_transforms?: Record<string, unknown>;
};

export type ImportedModelCatalog = {
  brand?: string;
  productName?: string;
  productFamily?: string;
  variant?: string;
  assets?: {
    assetId?: string;
    asset_id?: string;
    modelUrl?: string;
    model_url?: string;
    thumbnailUrl?: string;
    thumbnail_url?: string;
    galleryImages?: string[];
    gallery_images?: string[];
  };
  category?: string;
  subCategory?: string;
  priceUsd?: number;
  priceBand?: string;
  seatCapacity?: number;
  sizeClass?: string;
  shape?: string;
  baseType?: string;
  materialFamily?: string;
  materials?: unknown;
  finish?: unknown;
  colorFamily?: string;
  tone?: string;
  styleCluster?: string;
  styleSecondary?: string;
  designEra?: string;
  visualAttributes?: unknown;
  spatialAttributes?: unknown;
  roomCompatibility?: string[];
  placementRules?: unknown;
  designPairings?: string[];
  featureFlags?: {
    is_configurable?: boolean;
    [key: string]: unknown;
  };
  configurableMetadata?: {
    is_configurable?: boolean;
    default_configuration?: string;
    configuration_ui?: {
      type?: string;
      label?: string;
      options?: string[];
      option_labels?: Record<string, string>;
      helper_text?: string;
    };
    configuration_behavior?: {
      affects_visual_footprint?: boolean;
      affects_space_planning?: boolean;
      affects_collision_bounds?: boolean;
      affects_recommendation_logic?: boolean;
    };
    configuration_model_assets?: Record<string, Record<string, string>>;
  };
  configurations?: ImportedConfigurationEntry[];
  compatibility?: {
    related_products?: Array<{
      product_name?: string;
    }>;
  } | null;
  upholstery_options?: Array<{
    upholstery_code?: string;
    upholstery_label?: string;
    collection_type?: string;
    fabric_family?: string;
    fabric_label?: string;
    color_label?: string;
    texture_type?: string;
    swatch_group?: string;
    render_assets?: {
      base_color_map?: string;
      normal_map?: string;
      roughness_map?: string;
      tile_scale?: {
        x?: number;
        y?: number;
      };
    };
  }>;
  bundleMetadata?: unknown;
  variants?: Array<{
    variant?: string;
    size_label?: string;
    finish_code?: string;
    finish_label?: string;
    upholstery_code?: string;
    upholstery_label?: string;
    collection_type?: string;
    thumbnail_url?: string;
    thumbnailUrl?: string;
    swatch_group?: string;
    color_family?: string;
    tone?: string;
    set_compatibility?: unknown;
    dimensions?: {
      width_cm?: number;
      depth_cm?: number;
      height_cm?: number;
    };
  }>;
  aiFlags?: unknown;
};

export type ImportedModelOption = {
  id: string;
  title: string;
  familyKey: string;
  familyLabel: string;
  pickerLabel: string;
  modelUrl: string;
  thumbUrl?: string;
  dimsWmm: number;
  dimsDmm: number;
  dimsHmm: number;
  catalog?: ImportedModelCatalog | null;
};

export type ImportedModelDebugEntry = {
  id?: string;
  modelUrl?: string;
  thumbUrl?: string;
  dimsWmm?: number;
  dimsDmm?: number;
  dimsHmm?: number;
  catalog?: ImportedModelCatalog | null;
};

export type ImportedProductConfig = {
  title?: string;
  modelLabel?: string;
  category?: ProductCategory;
  roomTags?: RoomTag[];
  tags?: string[];
};

export type ImportedVariantFallback = { label: string; colorHex: string };

type BuildImportedModelOptionsInput = {
  models: ImportedModelDebugEntry[];
  importedProductConfigById: Record<string, ImportedProductConfig>;
};

type BuildImportedCatalogItemInput = {
  productId: string;
  imported: ImportedModelOption;
  importedProductConfigById: Record<string, ImportedProductConfig>;
  importedVariantByProductId: Record<string, ImportedVariantFallback>;
  importedVariantsByProductId: Record<string, ImportedVariantFallback[]>;
};

export function normalizeImportedFamilyName(value: string): string {
  return value
    .replace(/\b(recliner|sofa|dining table|dining bench|ottoman)\b/gi, "")
    .replace(/\bcollection\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function buildImportedModelTitle(id: string, catalog: ImportedModelCatalog | null | undefined): string {
  if (catalog?.productName) {
    return `${catalog.brand ?? "Castlery"} ${catalog.productName}${catalog.variant ? ` ${catalog.variant}` : ""}`;
  }

  return id
    .replace(/^sofa-real-castlery-/, "Castlery Sofa: ")
    .replace(/^dining-real-castlery-/, "Castlery Dining: ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildImportedPickerLabel(id: string, title: string): string {
  const armStyleLabel = id.includes("wide-arm")
    ? "Wide Arm"
    : id.startsWith("sofa-real-castlery-jaron-")
      ? "Slim Arm"
      : null;
  const cushionLabel = id.includes("no-cushion")
    ? "No Cushion"
    : id.includes("leather-cushion")
      ? "Leather Cushion"
      : null;
  const pickerParts = [armStyleLabel, cushionLabel].filter(Boolean);
  return pickerParts.length > 0 ? `${title} (${pickerParts.join(", ")})` : title;
}

function buildApiImportedModelOptions({
  models,
  importedProductConfigById,
}: BuildImportedModelOptionsInput): ImportedModelOption[] {
  return models
    .map((model) => {
      const id = String(model.id ?? "").trim();
      const modelUrl = String(model.modelUrl ?? "").trim();
      const dimsWmm = Number(model.dimsWmm ?? 0);
      const dimsDmm = Number(model.dimsDmm ?? 0);
      const dimsHmm = Number(model.dimsHmm ?? 0);
      if (!id || !modelUrl) return null;
      if (!(dimsWmm > 0 && dimsDmm > 0 && dimsHmm > 0)) return null;

      const importedConfig = importedProductConfigById[id];
      const title = buildImportedModelTitle(id, model.catalog);
      const familyName = String(
        model.catalog?.productFamily ?? model.catalog?.productName ?? importedConfig?.title ?? id
      ).trim();
      const normalizedFamilyName = normalizeImportedFamilyName(familyName) || "Imported";
      const familyLabel = `${model.catalog?.brand ?? "Castlery"} ${normalizedFamilyName} Collection`.trim();

      return {
        id,
        modelUrl,
        thumbUrl: model.thumbUrl ?? undefined,
        dimsWmm,
        dimsDmm,
        dimsHmm,
        catalog: model.catalog ?? null,
        title,
        familyKey: `${String(model.catalog?.brand ?? "castlery").toLowerCase()}::${normalizedFamilyName.toLowerCase()}`,
        familyLabel,
        pickerLabel: buildImportedPickerLabel(id, title),
      } satisfies ImportedModelOption;
    })
    .filter((option): option is NonNullable<typeof option> => option !== null);
}

function buildFallbackCatalogOptions(): ImportedModelOption[] {
  return Object.values(CATALOG_ITEMS)
    .filter((item) => item.id.startsWith("castlery-sloane-sideboard-"))
    .map((item) => {
      const familyName = "Sloane";
      const normalizedFamilyName = normalizeImportedFamilyName(familyName) || "Imported";
      const familyLabel = `Castlery ${normalizedFamilyName} Collection`.trim();
      const sizeLabel = `${Math.round(item.dimsMm.w / 10)}CM`;

      return {
        id: item.id,
        modelUrl: item.assets.modelUrl ?? "",
        thumbUrl: item.assets.thumbUrl,
        dimsWmm: item.dimsMm.w,
        dimsDmm: item.dimsMm.d,
        dimsHmm: item.dimsMm.h,
        catalog: {
          brand: "Castlery",
          category: "sideboard",
          productName: item.title,
          productFamily: familyName,
          variant: sizeLabel,
          variants: [
            {
              size_label: sizeLabel,
              dimensions: {
                width_cm: Math.round(item.dimsMm.w / 10),
                depth_cm: Math.round(item.dimsMm.d / 10),
                height_cm: Math.round(item.dimsMm.h / 10),
              },
            },
          ],
        } satisfies ImportedModelCatalog,
        title: item.title,
        familyKey: `castlery::${normalizedFamilyName.toLowerCase()}`,
        familyLabel,
        pickerLabel: item.title,
      } satisfies ImportedModelOption;
    });
}

function collectConfigurationAssetIds(options: ImportedModelOption[]): Set<string> {
  const configurationAssetIds = new Set<string>();
  for (const option of options) {
    const byConfig = option.catalog?.configurableMetadata?.configuration_model_assets;
    if (!byConfig) continue;
    for (const mapping of Object.values(byConfig)) {
      for (const assetId of Object.values(mapping ?? {})) {
        if (typeof assetId === "string" && assetId.trim()) {
          configurationAssetIds.add(assetId.trim());
        }
      }
    }
  }
  return configurationAssetIds;
}

export function buildImportedModelOptions({
  models,
  importedProductConfigById,
}: BuildImportedModelOptionsInput): {
  options: ImportedModelOption[];
  modelUrlByAssetId: Record<string, string>;
} {
  const optionsFromApi = buildApiImportedModelOptions({ models, importedProductConfigById });
  const fallbackCatalogOptions = buildFallbackCatalogOptions();

  const optionById = new Map<string, ImportedModelOption>();
  for (const option of optionsFromApi) {
    optionById.set(option.id, option);
  }
  for (const option of fallbackCatalogOptions) {
    if (!optionById.has(option.id)) {
      optionById.set(option.id, option);
    }
  }

  const options = Array.from(optionById.values());
  const configurationAssetIds = collectConfigurationAssetIds(options);
  const normalizedOptions = options.filter((option) => {
    if (option.catalog) return true;
    return !configurationAssetIds.has(option.id);
  });

  const modelUrlByAssetId: Record<string, string> = {};
  for (const option of options) {
    if (option.id && option.modelUrl) {
      modelUrlByAssetId[option.id] = option.modelUrl;
    }
  }

  return {
    options: normalizedOptions,
    modelUrlByAssetId,
  };
}

function isInjectedImportedCatalogItem(item: CatalogItemSchema | undefined): boolean {
  return Boolean(item && String(item.defaultVariantId ?? "").startsWith("imported-"));
}

export function shouldRefreshImportedCatalogItem(
  existing: CatalogItemSchema | undefined,
  option: ImportedModelOption,
): boolean {
  const expectedPriceHint = Number(option.catalog?.priceUsd ?? 0);
  const existingPriceHint =
    existing?.commerce.type === "affiliate" ? Number(existing.commerce.data.priceHint ?? 0) : 0;
  const existingVariantPipelineRevision = String(existing?.metadata?.importedVariantPipelineRevision ?? "");
  const inferredCategory = inferImportedCategoryFromProductId(option.id);
  const expectedCategory = inferredCategory ?? existing?.category;
  const categoryMismatch = Boolean(existing && expectedCategory && existing.category !== expectedCategory);

  return (
    !existing ||
    categoryMismatch ||
    (isInjectedImportedCatalogItem(existing) &&
      (existingVariantPipelineRevision !== IMPORTED_VARIANT_PIPELINE_REVISION ||
        (expectedPriceHint > 0 && existingPriceHint !== expectedPriceHint)))
  );
}

function resolveInjectedTemplateId(productId: string): string {
  const fallbackSofaTemplateId =
    Object.values(CATALOG_ITEMS).find((item) => item.category === "sofa")?.id ??
    "sofa-real-castlery-dawson-3s";

  const lower = productId.toLowerCase();
  if (lower.includes("bench")) return fallbackSofaTemplateId;
  if (lower.startsWith("sofa-")) return fallbackSofaTemplateId;
  if (
    lower.startsWith("dining-") ||
    lower.startsWith("table-") ||
    lower.startsWith("coffee-") ||
    lower.includes("coffee")
  ) {
    return "coffee-modern-01";
  }
  if (lower.startsWith("chair-")) return "chair-modern-01";
  if (lower.startsWith("lamp-")) return "lamp-modern-01";
  return fallbackSofaTemplateId;
}

function resolveImportedThumbUrl(imported: ImportedModelOption, productId: string): string {
  if (productId === "sofa-real-castlery-dawson-wide-chaise-sectional-left") {
    // Keep card imagery aligned with default cream fabric and left orientation.
    return "/assets/thumbs/sofa-real-castlery-dawson-wide-chaise-sectional-left.png";
  }

  return (
    imported.catalog?.assets?.thumbnailUrl ??
    imported.catalog?.assets?.thumbnail_url ??
    imported.thumbUrl ??
    `/assets/thumbs/${productId}.png`
  );
}

function inferImportedCategoryFromProductId(productId: string): ProductCategory | undefined {
  const lower = productId.toLowerCase();

  if (lower.includes("ottoman")) return "ottoman";
  if (lower.includes("armchair")) return "accent_chair";
  if (lower.startsWith("sofa-")) return "sofa";

  if (lower.startsWith("dining-") && lower.includes("bench")) return "dining_bench";
  if (lower.startsWith("dining-")) return "dining_table";

  if (lower.startsWith("coffee-")) return "coffee_table";
  if (lower.includes("console")) return "tv_console";
  if (lower.includes("sideboard")) return "sideboard";
  if (lower.includes("lamp")) return "floor_lamp";

  return undefined;
}

export function buildImportedCatalogItem({
  productId,
  imported,
  importedProductConfigById,
  importedVariantByProductId,
  importedVariantsByProductId,
}: BuildImportedCatalogItemInput): CatalogItemSchema | undefined {
  const templateId = resolveInjectedTemplateId(productId);
  const template = CATALOG_ITEMS[templateId] ?? Object.values(CATALOG_ITEMS)[0];
  if (!template) return undefined;

  const importedConfig = importedProductConfigById[productId];
  const yamlCatalog = imported.catalog;
  const yamlCategory = yamlCatalog?.category;
  const isKnownCategory = Boolean(
    yamlCategory && Object.prototype.hasOwnProperty.call(CATEGORY_DEFAULTS, yamlCategory),
  );
  const inferredCategory = inferImportedCategoryFromProductId(productId);
  const category = (isKnownCategory ? (yamlCategory as ProductCategory) : undefined)
    ?? importedConfig?.category
    ?? inferredCategory
    ?? template.category;
  const categoryDefaults = getCategoryDefaults(category);

  const title =
    importedConfig?.title ??
    buildImportedModelTitle(productId, yamlCatalog) ??
    productId
      .replace(/^sofa-real-castlery-/, "Castlery Sofa: ")
      .replace(/^dining-real-castlery-/, "Castlery Dining: ")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  const normalizedTitle =
    productId === "sofa-real-castlery-dawson-wide-chaise-sectional-left"
      ? `${title.replace(/\s*\(Left Facing\)\s*/i, "").trim()} · Left Facing`
      : productId === "sofa-real-castlery-dawson-wide-chaise-sectional"
        ? `${title.replace(/\s*\(Right Facing\)\s*/i, "").trim()} · Right Facing`
        : title;

  const fallbackVariant = importedVariantByProductId[productId] ?? {
    label: "Imported",
    colorHex: "#c4b8a7",
  };

  const yamlVariants = Array.isArray(yamlCatalog?.variants) ? yamlCatalog.variants : [];
  const widthCm = imported.dimsWmm / 10;
  const sizeMatchedYamlVariants = yamlVariants.filter((entry) => {
    const entryWidth = Number(entry?.dimensions?.width_cm ?? 0);
    return Number.isFinite(entryWidth) && Math.abs(entryWidth - widthCm) <= 0.5;
  });
  const yamlPreferredVariants = sizeMatchedYamlVariants.length > 0 ? sizeMatchedYamlVariants : yamlVariants;
  const firstYamlVariant = (yamlPreferredVariants[0] ?? null) as
    | { price_usd?: number; priceUsd?: number }
    | null;
  const resolvedPriceUsd = Number(
    yamlCatalog?.priceUsd ?? firstYamlVariant?.priceUsd ?? firstYamlVariant?.price_usd ?? 0,
  );
  const fallbackPriceHint = template.commerce.type === "affiliate" ? (template.commerce.data.priceHint ?? 0) : 0;
  const importedPriceHint =
    Number.isFinite(resolvedPriceUsd) && resolvedPriceUsd > 0 ? resolvedPriceUsd : fallbackPriceHint;

  const preferredVariants = importedVariantsByProductId[productId] ?? [];
  const sharedUpholsteryOptions = Array.isArray(yamlCatalog?.upholstery_options)
    ? yamlCatalog.upholstery_options
    : [];
  const fallbackThumbnailUrl = resolveImportedThumbUrl(imported, productId);
  const normalizedImportedVariants = normalizeImportedVariants({
    productId,
    variantEntries: yamlPreferredVariants,
    sharedUpholsteryOptions,
    fallbackThumbnailUrl,
  });

  const dynamicVariants = normalizedImportedVariants.length > 0
    ? normalizedImportedVariants.filter(Boolean)
    : preferredVariants.length > 0
      ? preferredVariants.map((entry, index) => ({
          id: `imported-${productId}-${index + 1}`,
          label: entry.label,
          colorHex: entry.colorHex,
          thumbnailUrl: fallbackThumbnailUrl,
        }))
      : [
          {
            id: `imported-${productId}`,
            label: fallbackVariant.label,
            colorHex: fallbackVariant.colorHex,
            thumbnailUrl: fallbackThumbnailUrl,
          },
        ];

  const defaultImportedVariantId = dynamicVariants[0]?.id ?? `imported-${productId}`;
  const yamlGalleryImages = yamlCatalog?.assets?.galleryImages ?? yamlCatalog?.assets?.gallery_images;

  return {
    ...template,
    id: productId,
    slug: productId,
    title: normalizedTitle,
    category,
    dimsMm: {
      w: imported.dimsWmm,
      d: imported.dimsDmm,
      h: imported.dimsHmm,
    },
    dimensionsMm: {
      w: imported.dimsWmm,
      d: imported.dimsDmm,
      h: imported.dimsHmm,
    },
    bounds: {
      type: "aabb",
      size: {
        w: imported.dimsWmm / 1000,
        d: imported.dimsDmm / 1000,
        h: imported.dimsHmm / 1000,
      },
      center: [0, imported.dimsHmm / 2000, 0],
    },
    variants: dynamicVariants,
    defaultVariantId: defaultImportedVariantId,
    commerce: {
      type: "affiliate",
      data: {
        url: template.commerce.type === "affiliate" ? template.commerce.data.url : "",
        retailer:
          template.commerce.type === "affiliate"
            ? template.commerce.data.retailer
            : "External retailer",
        priceHint: importedPriceHint,
      },
    },
    placementRules: categoryDefaults.placement,
    clearanceRules: categoryDefaults.clearance,
    aiRoles: categoryDefaults.aiRoles,
    roomTags: importedConfig?.roomTags ?? template.roomTags,
    tags: importedConfig?.tags ?? template.tags,
    metadata: {
      ...template.metadata,
      brand: yamlCatalog?.brand ?? "Castlery",
      productFamily: yamlCatalog?.productFamily,
      productName: yamlCatalog?.productName,
      importedVariantPipelineRevision: IMPORTED_VARIANT_PIPELINE_REVISION,
      modelLabel: importedConfig?.modelLabel ?? yamlCatalog?.variant,
      styleCluster: yamlCatalog?.styleCluster,
      styleSecondary: yamlCatalog?.styleSecondary,
      designEra: yamlCatalog?.designEra,
      colorFamily: yamlCatalog?.colorFamily,
      tone: yamlCatalog?.tone,
      priceUsd: yamlCatalog?.priceUsd,
      priceBand: yamlCatalog?.priceBand,
      seatCapacity: yamlCatalog?.seatCapacity,
      materialFamily: yamlCatalog?.materialFamily,
      designPairings: yamlCatalog?.designPairings,
      compatibility: yamlCatalog?.compatibility,
      bundleMetadata: yamlCatalog?.bundleMetadata,
      galleryImages: Array.isArray(yamlGalleryImages)
        ? yamlGalleryImages.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          )
        : undefined,
    },
    assets: {
      ...template.assets,
      assetId: productId,
      modelUrl: imported.modelUrl,
      thumbUrl: fallbackThumbnailUrl,
    },
  } satisfies CatalogItemSchema;
}

export function upsertImportedCatalogItem(input: BuildImportedCatalogItemInput): CatalogItemSchema | undefined {
  const injected = buildImportedCatalogItem(input);
  if (!injected) return undefined;

  CATALOG_ITEMS[input.productId] = injected;
  CATALOG_ITEMS_MAP.set(input.productId, injected);
  return injected;
}