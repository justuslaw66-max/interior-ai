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

  return visualDims ?? { ...fallbackProduct.dimsMm };
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

  return planningDims ?? resolveConfiguredVisualDimsMm(item, fallbackProduct, ctx);
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
  const code = resolveItemConfigurationCode(item, ctx);
  if (!code) return fallbackModelUrl;

  const catalog = ctx.importedModelById.get(item.productId)?.catalog;
  const assetMap = catalog?.configurableMetadata?.configuration_model_assets?.[code];
  if (!assetMap) return fallbackModelUrl;

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
  const candidateAssetId =
    lookupKeys
      .map((key) => assetMap[key])
      .find((assetId) => typeof assetId === "string" && assetId.trim().length > 0) ||
    assetMap.default;
  if (!candidateAssetId) return fallbackModelUrl;

  const mappedOption = ctx.importedModelById.get(candidateAssetId);
  if (mappedOption?.modelUrl) return mappedOption.modelUrl;

  const mappedUrl = ctx.importedModelUrlByAssetId[candidateAssetId];
  if (mappedUrl) return mappedUrl;

  return `/assets/models/${candidateAssetId}.glb`;
}
