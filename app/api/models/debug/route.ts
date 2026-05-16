import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getFreshCatalogYamlMap } from "@/lib/catalog-yaml";

type CatalogYamlRecord = Record<string, unknown>;

function mapCatalogYaml(yaml: CatalogYamlRecord) {
  return {
    brand: yaml.brand,
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
    featureFlags: yaml.feature_flags,
    configurableMetadata: yaml.configurable_metadata,
    configurations: yaml.configurations,
    upholstery_options: yaml.upholstery_options,
    variants: yaml.variants,
    aiFlags: yaml.ai_flags,
    autoMetadata: yaml.auto_metadata,
    presetValidation: yaml.preset_validation,
  };
}

export async function GET() {
  const catalogMap = getFreshCatalogYamlMap();

  try {
    const assets = await prisma.modelAsset.findMany({
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      total: assets.length,
      models: assets.map((a: (typeof assets)[number]) => {
        const yaml = (catalogMap.get(a.id) as CatalogYamlRecord | undefined) ?? null;
        return {
          id: a.id,
          modelUrl: a.modelUrl,
          thumbUrl: a.thumbUrl,
          status: a.approved ? "approved" : "pending",
          dimsWmm: a.dimsWmm,
          dimsDmm: a.dimsDmm,
          dimsHmm: a.dimsHmm,
          dims: `${a.dimsWmm}×${a.dimsDmm}×${a.dimsHmm}mm`,
          // Catalog YAML metadata (null when no catalog.yaml exists yet)
          catalog: yaml ? mapCatalogYaml(yaml) : null,
        };
      }),
    });
  } catch (error) {
    // CI can occasionally see brief DB connection blips. Fall back to YAML-backed models
    // so API consumers and variant tests can still validate catalog metadata.
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

    return NextResponse.json({
      total: models.length,
      models,
      degraded: true,
      warning: `DB unavailable, serving YAML fallback: ${String(error)}`,
    });
  }
}
