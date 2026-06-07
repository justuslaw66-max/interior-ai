import { prisma } from "@/lib/prisma";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";

type CatalogYamlRecord = Record<string, unknown>;

function mapCatalogYaml(yaml: CatalogYamlRecord) {
  return {
    brand: yaml.brand,
    retailer: yaml.retailer,
    source_url: yaml.source_url,
    authoring_notes: yaml.authoring_notes,
    category: yaml.category,
    assets: yaml.assets,
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

export async function buildImportedModelsPayload() {
  const catalogMap = getFreshCatalogYamlMap();

  try {
    const assets = await prisma.modelAsset.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return {
      total: assets.length,
      models: assets.map((asset: (typeof assets)[number]) => {
        const yaml = (catalogMap.get(asset.id) as CatalogYamlRecord | undefined) ?? null;
        return {
          id: asset.id,
          modelUrl: asset.modelUrl,
          thumbUrl: asset.thumbUrl,
          status: asset.approved ? "approved" : "pending",
          dimsWmm: asset.dimsWmm,
          dimsDmm: asset.dimsDmm,
          dimsHmm: asset.dimsHmm,
          dims: `${asset.dimsWmm}×${asset.dimsDmm}×${asset.dimsHmm}mm`,
          catalog: yaml ? mapCatalogYaml(yaml) : null,
        };
      }),
    };
  } catch (error) {
    const models = Array.from(catalogMap.entries()).map(([id, yaml]) => ({
      id,
      modelUrl: null,
      thumbUrl: null,
      status: "approved",
      dimsWmm: 0,
      dimsDmm: 0,
      dimsHmm: 0,
      dims: "0×0×0mm",
      catalog: mapCatalogYaml(yaml as CatalogYamlRecord),
    }));

    return {
      total: models.length,
      models,
      degraded: true,
      warning: `DB unavailable, serving YAML fallback: ${String(error)}`,
    };
  }
}
