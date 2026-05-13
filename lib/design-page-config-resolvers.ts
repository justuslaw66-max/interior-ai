import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { DesignItem } from "@/lib/room-types";
import type { ImportedModelOption } from "@/lib/catalog/imported-model-assembly";
import type { ConfigurableBoundsCm, ConfigurableNodeTransform } from "@/lib/design-page-types";

export type ConfigResolverContext = {
  importedModelById: Map<string, ImportedModelOption>;
  itemConfigurationByInstanceId: Record<string, string>;
  importedModelUrlByAssetId: Record<string, string>;
  catalogItems: typeof CATALOG_ITEMS;
};

export function dimsFromBoundsCm(
  bounds: ConfigurableBoundsCm | undefined,
  fallbackHeightMm: number
): { w: number; d: number; h: number } | null {
  const widthCm = Number(bounds?.width ?? 0);
  const depthCm = Number(bounds?.depth ?? 0);
  const heightCm = Number(bounds?.height ?? fallbackHeightMm / 10);
  if (!(widthCm > 0 && depthCm > 0)) return null;
  return {
    w: Math.round(widthCm * 10),
    d: Math.round(depthCm * 10),
    h: Math.round(heightCm * 10),
  };
}

export function resolveItemConfigurationCode(
  item: DesignItem | null | undefined,
  ctx: Pick<ConfigResolverContext, "importedModelById" | "itemConfigurationByInstanceId">
): string | null {
  if (!item) return null;
  const explicit = item.configurationCode?.trim();
  if (explicit) return explicit;
  const tracked = ctx.itemConfigurationByInstanceId[item.instanceId]?.trim();
  if (tracked) return tracked;
  const catalog = ctx.importedModelById.get(item.productId)?.catalog;
  const defaultCode = catalog?.configurableMetadata?.default_configuration?.trim();
  return defaultCode || null;
}

export function resolveItemConfigurationEntry(
  item: DesignItem | null | undefined,
  ctx: Pick<ConfigResolverContext, "importedModelById" | "itemConfigurationByInstanceId">
): NonNullable<NonNullable<ImportedModelOption["catalog"]>["configurations"]>[number] | null {
  if (!item) return null;
  const code = resolveItemConfigurationCode(item, ctx);
  if (!code) return null;
  const catalog = ctx.importedModelById.get(item.productId)?.catalog;
  return catalog?.configurations?.find((entry) => entry.configuration_code === code) ?? null;
}

export function resolveConfiguredVisualDimsMm(
  item: DesignItem,
  fallbackProduct: CatalogItemSchema,
  ctx: Pick<ConfigResolverContext, "importedModelById" | "itemConfigurationByInstanceId">
): { w: number; d: number; h: number } {
  const cfg = resolveItemConfigurationEntry(item, ctx);
  if (!cfg) return { ...fallbackProduct.dimsMm };

  const visualDims =
    dimsFromBoundsCm(cfg.visual_bounds_cm, fallbackProduct.dimsMm.h) ??
    (() => {
      const sourceDims = cfg.dimensions_estimate ?? cfg.dimensions;
      const widthCm = Number(sourceDims?.width_cm ?? 0);
      const depthCm = Number(sourceDims?.depth_cm ?? 0);
      const heightCm = Number(sourceDims?.height_cm ?? fallbackProduct.dimsMm.h / 10);
      if (!(widthCm > 0 && depthCm > 0)) return null;
      return {
        w: Math.round(widthCm * 10),
        d: Math.round(depthCm * 10),
        h: Math.round(heightCm * 10),
      };
    })();

  const baseVisualDims = visualDims ?? { ...fallbackProduct.dimsMm };
  const selectedVariant = fallbackProduct.variants.find((variant) => variant.id === item.variantId);
  const variantDims = selectedVariant?.dimensionsMm;

  if (!variantDims || !(variantDims.w > 0 && variantDims.d > 0)) {
    return baseVisualDims;
  }

  return {
    w: variantDims.w,
    d: variantDims.d,
    h: baseVisualDims.h,
  };
}

export function resolveConfiguredPlanningDimsMm(
  item: DesignItem,
  fallbackProduct: CatalogItemSchema,
  ctx: Pick<ConfigResolverContext, "importedModelById" | "itemConfigurationByInstanceId">
): { w: number; d: number; h: number } {
  const cfg = resolveItemConfigurationEntry(item, ctx);
  if (!cfg) return { ...fallbackProduct.dimsMm };

  const planningDims =
    dimsFromBoundsCm(cfg.planning_bounds_cm, fallbackProduct.dimsMm.h) ??
    (() => {
      const recommended = cfg.dimensions_recommended_planning;
      const footprint = cfg.placement_footprint;
      const widthCm = Number(recommended?.width_cm ?? footprint?.planning_width_cm ?? 0);
      const depthCm = Number(recommended?.depth_cm ?? footprint?.planning_depth_cm ?? 0);
      const heightCm = Number(recommended?.height_cm ?? fallbackProduct.dimsMm.h / 10);
      if (!(widthCm > 0 && depthCm > 0)) return null;
      return {
        w: Math.round(widthCm * 10),
        d: Math.round(depthCm * 10),
        h: Math.round(heightCm * 10),
      };
    })();

  const basePlanningDims = planningDims ?? resolveConfiguredVisualDimsMm(item, fallbackProduct, ctx);
  const selectedVariant = fallbackProduct.variants.find((variant) => variant.id === item.variantId);
  const variantDims = selectedVariant?.dimensionsMm;

  if (!variantDims || !(variantDims.w > 0 && variantDims.d > 0)) {
    return basePlanningDims;
  }

  return {
    w: variantDims.w,
    d: variantDims.d,
    h: basePlanningDims.h,
  };
}

export function resolveConfiguredNodeTransforms(
  item: DesignItem | null | undefined,
  ctx: Pick<ConfigResolverContext, "importedModelById" | "itemConfigurationByInstanceId">
): Record<string, ConfigurableNodeTransform> | null {
  const nodeTransforms = resolveItemConfigurationEntry(item, ctx)?.node_transforms;
  if (!nodeTransforms || typeof nodeTransforms !== "object") {
    return null;
  }
  return nodeTransforms as Record<string, ConfigurableNodeTransform>;
}

export function resolveConfiguredModelUrl(
  item: DesignItem,
  fallbackModelUrl: string | undefined,
  variantId: string,
  ctx: ConfigResolverContext
): string | undefined {
  const variantCode = variantId
    .replace(`imported-${item.productId}-`, "")
    .trim()
    .toLowerCase();
  const variantMeta = ctx.catalogItems[item.productId]?.variants.find((v) => v.id === variantId);
  const finishCode = String(variantMeta?.finishCode ?? "").trim().toLowerCase();
  const lookupKeys = [
    variantCode,
    variantCode.replace(/-/g, "_"),
    variantCode.split("__")[0],
    finishCode,
    finishCode.replace(/-/g, "_"),
    finishCode.split("__")[0],
  ].filter((key) => key.length > 0);

  const normalizeLookupToken = (value: string | null | undefined): string =>
    String(value ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");

  const resolveAssetIdToModelUrl = (assetIdLike: string | null | undefined): string | undefined => {
    const assetId = String(assetIdLike ?? "").trim();
    if (!assetId) return undefined;

    const mappedOption = ctx.importedModelById.get(assetId);
    if (mappedOption?.modelUrl) return mappedOption.modelUrl;

    const mappedUrl = ctx.importedModelUrlByAssetId[assetId];
    if (mappedUrl) return mappedUrl;

    return `/assets/models/${assetId}.glb`;
  };

  const normalizeModelUrlValue = (value: string | null | undefined): string | undefined => {
    const raw = String(value ?? "").trim();
    if (!raw) return undefined;
    if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
    if (raw.startsWith("assets/models/")) return `/${raw}`;
    if (/\.glb$/i.test(raw)) return `/assets/models/${raw}`;
    return `/assets/models/${raw}.glb`;
  };

  const catalog = ctx.importedModelById.get(item.productId)?.catalog;
  const variantEntries = Array.isArray(catalog?.variants) ? catalog.variants : [];

  const findBestVariantEntry = () => {
    if (variantEntries.length === 0) return null;

    const variantDims = variantMeta?.dimensionsMm;
    return (
      variantEntries
        .map((entry) => {
          const entryKeys = [
            normalizeLookupToken(String(entry?.finish_code ?? "")),
            normalizeLookupToken(String(entry?.upholstery_code ?? "")),
            normalizeLookupToken(String(entry?.variant ?? "")),
            normalizeLookupToken(String(entry?.size_label ?? "")),
          ].filter((token) => token.length > 0);
          const keyMatch = lookupKeys
            .map((key) => normalizeLookupToken(key))
            .some((key) => entryKeys.includes(key));

          const entryWidthMm = Math.round(Number(entry?.dimensions?.width_cm ?? 0) * 10);
          const entryDepthMm = Math.round(Number(entry?.dimensions?.depth_cm ?? 0) * 10);
          const dimsMatch = Boolean(
            variantDims &&
              entryWidthMm > 0 &&
              entryDepthMm > 0 &&
              Math.abs(entryWidthMm - variantDims.w) <= 10 &&
              Math.abs(entryDepthMm - variantDims.d) <= 10
          );

          const hasExplicitModel = Boolean(
            String(entry?.model_url ?? "").trim() || String(entry?.model_asset_id ?? "").trim()
          );

          const score = (dimsMatch ? 4 : 0) + (keyMatch ? 2 : 0) + (hasExplicitModel ? 1 : 0);
          return { entry, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)[0] ?? null
    );
  };

  const bestVariantEntry = findBestVariantEntry()?.entry;

  const code = resolveItemConfigurationCode(item, ctx);

  const resolveVariantStateAssetModelUrl = (
    entry: (typeof variantEntries)[number] | null | undefined,
    stateCode: string | null | undefined
  ): string | undefined => {
    if (!entry || !stateCode) return undefined;
    const stateAssets = entry.state_assets;
    if (!stateAssets || typeof stateAssets !== "object") return undefined;
    const stateAsset = stateAssets[stateCode];
    if (!stateAsset || typeof stateAsset !== "object") return undefined;

    const directUrl = normalizeModelUrlValue(stateAsset.model_url);
    if (directUrl) return directUrl;

    return resolveAssetIdToModelUrl(stateAsset.model_asset_id);
  };

  const variantStateModelUrl = resolveVariantStateAssetModelUrl(bestVariantEntry, code);
  if (variantStateModelUrl) return variantStateModelUrl;

  const assetMap = code ? catalog?.configurableMetadata?.configuration_model_assets?.[code] : null;
  if (assetMap) {
    const candidateAssetId =
      lookupKeys
        .map((key) => assetMap[key])
        .find((assetId) => typeof assetId === "string" && assetId.trim().length > 0) ||
      assetMap.default;
    const mapped = resolveAssetIdToModelUrl(candidateAssetId);
    if (mapped) return mapped;
  }

  if (bestVariantEntry) {
      const directUrl = normalizeModelUrlValue(bestVariantEntry.model_url);
      if (directUrl) return directUrl;

      const mapped = resolveAssetIdToModelUrl(bestVariantEntry.model_asset_id);
      if (mapped) return mapped;
  }

  return fallbackModelUrl;
}
