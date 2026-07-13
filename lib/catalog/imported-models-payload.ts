import { prisma } from "@/lib/prisma";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";
import { isLiveCatalogEntry } from "@/lib/catalog-publication";

type CatalogYamlRecord = Record<string, unknown>;

function mapCatalogYaml(yaml: CatalogYamlRecord) {
  return {
    brand: yaml.brand,
    retailer: yaml.retailer,
    source_url: yaml.source_url,
    authoring_notes: yaml.authoring_notes,
    category: yaml.category,
    assets: yaml.assets,
    media_presentation: yaml.media_presentation,
    mediaPresentation: yaml.mediaPresentation,
    presetLabel: yaml.preset_label,
    productFamily: yaml.product_family,
    productName: yaml.product_name,
    variant: yaml.variant,
    priceUsd: yaml.price_usd,
    priceBand: yaml.price_band,
    brandTier: yaml.brand_tier,
    designZone: yaml.design_zone,
    anchorRole: yaml.anchor_role,
    seatCapacity: yaml.seat_capacity,
    sizeClass: yaml.size_class,
    shape: yaml.shape,
    baseType: yaml.base_type,
    materialFamily: yaml.material_family,
    material_mix: yaml.material_mix,
    materials: yaml.materials,
    finish: yaml.finish,
    colorFamily: yaml.color_family,
    tone: yaml.tone,
    styleCluster: yaml.style_cluster,
    styleSecondary: yaml.style_secondary,
    designEra: yaml.design_era,
    visualAttributes: yaml.visual_attributes,
    spatialAttributes: yaml.spatial_attributes,
    roomCompatibility: yaml.room_compatibility,
    placementRules: yaml.placement_rules,
    designPairings: yaml.design_pairings,
    compatibility: yaml.compatibility,
    bundleMetadata: yaml.bundle_metadata,
    product_details: yaml.product_details,
    product_details_by_material_type: yaml.product_details_by_material_type,
    comfort_profile: yaml.comfort_profile,
    featureFlags: yaml.feature_flags,
    configurableMetadata: yaml.configurable_metadata,
    configurations: yaml.configurations,
    upholstery_options: yaml.upholstery_options,
    variants: yaml.variants,
    shipping_and_warranty: yaml.shipping_and_warranty,
    aiFlags: yaml.ai_flags,
    autoMetadata: yaml.auto_metadata,
    presetValidation: yaml.preset_validation,
  };
}

function readString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function readPositiveMm(value: unknown): number {
  const cm = Number(value ?? 0);
  return Number.isFinite(cm) && cm > 0 ? Math.round(cm * 10) : 0;
}

function buildYamlOnlyModel(id: string, yaml: CatalogYamlRecord) {
  const assets = (yaml.assets && typeof yaml.assets === "object" ? yaml.assets : {}) as Record<string, unknown>;
  const dimensions = (yaml.dimensions && typeof yaml.dimensions === "object" ? yaml.dimensions : {}) as Record<string, unknown>;

  return {
    id,
    modelUrl: readString(assets.model_url) ?? readString(assets.modelUrl) ?? undefined,
    thumbUrl: readString(assets.thumbnail_url) ?? readString(assets.thumbnailUrl) ?? undefined,
    status: "approved",
    dimsWmm: readPositiveMm(dimensions.width_cm),
    dimsDmm: readPositiveMm(dimensions.depth_cm),
    dimsHmm: readPositiveMm(dimensions.height_cm),
    dims: `${readPositiveMm(dimensions.width_cm)}×${readPositiveMm(dimensions.depth_cm)}×${readPositiveMm(dimensions.height_cm)}mm`,
    catalog: mapCatalogYaml(yaml),
  };
}

export async function buildImportedModelsPayload() {
  const catalogMap = new Map(
    Array.from(getFreshCatalogYamlMap().entries()).filter(([, yaml]) =>
      isLiveCatalogEntry(yaml)
    )
  );

  try {
    const assets = await prisma.modelAsset.findMany({
      orderBy: { updatedAt: "desc" },
    });

    const liveAssets = assets.filter((asset: (typeof assets)[number]) => catalogMap.has(asset.id));
    const assetIds = new Set(liveAssets.map((asset: (typeof liveAssets)[number]) => asset.id));
    const assetModels = liveAssets.map((asset: (typeof liveAssets)[number]) => {
      const yaml = catalogMap.get(asset.id) as CatalogYamlRecord;
      return {
        id: asset.id,
        modelUrl: asset.modelUrl,
        thumbUrl: asset.thumbUrl,
        status: asset.approved ? "approved" : "pending",
        dimsWmm: asset.dimsWmm,
        dimsDmm: asset.dimsDmm,
        dimsHmm: asset.dimsHmm,
        dims: `${asset.dimsWmm}×${asset.dimsDmm}×${asset.dimsHmm}mm`,
        catalog: mapCatalogYaml(yaml),
      };
    });
    const yamlOnlyModels = Array.from(catalogMap.entries())
      .filter(([id]) => !assetIds.has(id))
      .map(([id, yaml]) => buildYamlOnlyModel(id, yaml as CatalogYamlRecord));

    return {
      total: assetModels.length + yamlOnlyModels.length,
      models: [...assetModels, ...yamlOnlyModels],
    };
  } catch (error) {
    const models = Array.from(catalogMap.entries()).map(([id, yaml]) =>
      buildYamlOnlyModel(id, yaml as CatalogYamlRecord)
    );

    return {
      total: models.length,
      models,
      degraded: true,
      warning: `DB unavailable, serving YAML fallback: ${String(error)}`,
    };
  }
}
