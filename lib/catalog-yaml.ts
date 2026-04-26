/**
 * Server-only module. Reads every catalog/furniture/**\/catalog.yaml file
 * and returns a map keyed by `assets.asset_id`.
 *
 * This is used by API routes (never imported on the client).
 */
import fs from "fs";
import path from "path";
import { parse } from "yaml";
import {
  applyPresetDefaults,
  buildPresetAutoMetadata,
  getCatalogPreset,
  validateCatalogAgainstPreset,
} from "@/lib/catalog-presets";

// ─── Upholstery Library Types ────────────────────────────────────────────────

export type UpholsteryRenderAssets = {
  material_family_key?: string;
  base_color_map?: string;
  normal_map?: string;
  roughness_map?: string;
  tile_scale?: { x?: number; y?: number };
};

export type UpholsteryOption = {
  upholstery_code: string;
  upholstery_label: string;
  fabric_family?: string;
  fabric_label?: string;
  color_label?: string;
  collection_type?: string;
  color_family?: string;
  tone?: string;
  material_type?: string;
  texture_type?: string;
  pattern_scale?: string;
  performance_features?: string[];
  composition?: Record<string, unknown>;
  care?: string[];
  display_assets?: {
    swatch_image?: string;
    closeup_image?: string;
  };
  render_assets?: UpholsteryRenderAssets;
  // Legacy flat fields (kept for backward compat)
  swatch_group?: string;
};

type UpholsteryLibrary = {
  library_key: string;
  product_family?: string;
  upholstery_options: UpholsteryOption[];
  family_upholstery_map?: {
    product_family?: string;
    supported_upholstery_codes?: string[];
  };
};

// ─── Variant & Entry Types ────────────────────────────────────────────────────

export type CatalogYamlVariantEntry = {
  variant?: string;
  size_label?: string;
  finish_code?: string;
  finish_label?: string;
  model_asset_id?: string;
  model_url?: string;
  upholstery_code?: string;
  upholstery_label?: string;
  thumbnail_url?: string;
  gallery_images?: string[];
  galleryImages?: string[];
  swatch_group?: string;
  color_family?: string;
  tone?: string;
  price_usd?: number;
  price_band?: string;
  brand_tier?: string;
  materials?: Record<string, unknown>;
  finish?: Record<string, unknown>;
  dimensions?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  seating_depth_cm?: number;
  seat_capacity?: number;
  size_class?: string;
  set_compatibility?: Record<string, unknown>;
};

export type CatalogYamlEntry = {
  // Identity
  brand?: string;
  category?: string;
  product_family?: string;
  product_name?: string;
  variant?: string;

  // Pricing
  price_usd?: number;
  price_band?: string;
  brand_tier?: string;

  // Layout
  design_zone?: string;
  anchor_role?: string;

  // Dimensions
  dimensions?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  seat_capacity?: number;
  size_class?: string;
  shape?: string;
  base_type?: string;

  // Materials & Finish
  material_family?: string;
  material_mix?: string;
  materials?: Record<string, unknown>;
  finish?: Record<string, unknown>;

  // Style
  color_family?: string;
  tone?: string;
  style_cluster?: string;
  style_secondary?: string;
  design_era?: string;

  // Visual
  visual_attributes?: Record<string, unknown>;
  spatial_attributes?: Record<string, unknown>;

  // Room
  room_compatibility?: string[];
  placement_rules?: Record<string, unknown>;
  design_pairings?: string[];
  compatibility?: Record<string, unknown>;
  bundle_metadata?: Record<string, unknown>;

  // Configurable/open-state products
  feature_flags?: Record<string, unknown>;
  configurable_metadata?: Record<string, unknown>;
  configurations?: Array<Record<string, unknown>>;

  // Assets
  assets?: {
    asset_id?: string;
    model_url?: string;
    thumbnail_url?: string;
  };

  // AI
  ai_flags?: Record<string, unknown>;

  // Variant model support
  variants?: CatalogYamlVariantEntry[];

  // Upholstery — either inline options or a library reference
  upholstery_options?: UpholsteryOption[];
  upholstery_library_ref?: string;

  // Derived fields added by the preset system
  auto_metadata?: Record<string, unknown>;
  preset_validation?: ReturnType<typeof validateCatalogAgainstPreset>;
  preset_label?: string | null;
  file_path?: string;
};

/** Walk a directory recursively and return all file paths matching `filename`. */
// ─── Upholstery Library Cache ─────────────────────────────────────────────────

let _libraryCache: Map<string, UpholsteryLibrary> | null = null;

function getUpholsteryLibraries(): Map<string, UpholsteryLibrary> {
  if (_libraryCache) return _libraryCache;
  const libDir = path.join(process.cwd(), "catalog", "furniture", "_upholstery_libraries");
  _libraryCache = new Map();
  if (!fs.existsSync(libDir)) return _libraryCache;
  for (const entry of fs.readdirSync(libDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".yaml")) continue;
    try {
      const raw = fs.readFileSync(path.join(libDir, entry.name), "utf8");
      const lib = parse(raw) as UpholsteryLibrary;
      if (lib?.library_key) {
        _libraryCache.set(lib.library_key, lib);
      }
    } catch {
      // Skip malformed library files
    }
  }
  return _libraryCache;
}

// ─── File Discovery ───────────────────────────────────────────────────────────

function findFiles(dir: string, filename: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(full, filename));
    } else if (entry.name === filename) {
      results.push(full);
    }
  }
  return results;
}

let _cache: {
  byAssetId: Map<string, CatalogYamlEntry>;
  entries: CatalogYamlEntry[];
} | null = null;

const DAWSON_CHAISE_VARIANT_IMAGES_BY_ASSET_ID: Record<string, Record<string, string>> = {
  "sofa-real-castlery-dawson-chaise-sectional": {
    beach_linen:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634718495/crusader/variants/T50440988-NG4001/Dawson-Right_-Chaise-Sectional-sofa-Beach-Linen-Front.jpg",
    navagio_seagull:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697617171/crusader/variants/AS-000377-NG4002/Dawson-Right-Chaise-Sectional-Sofa-Seagull-Front-1697617169.jpg",
    marcel_brilliant_white:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1721274880/crusader/variants/AS-000377C-PM4002/Dawson-Right-Chaise-Sectional-Sofa-Brilliant-White-Front-1721274877.jpg",
    peyton_ivory:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1721274860/crusader/variants/AS-000377C-PY4001/Dawson-Right-Chaise-Sectional-Sofa-Ivory-Front-1721274858.jpg",
    peyton_dove_grey:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1722413546/crusader/variants/AS-000377C-PY4002/Dawson-Right-Chaise-Sectional-Sofa-Dove-Grey-Front-1722413543.jpg",
    peyton_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1722414760/crusader/variants/AS-000377C-PY4003/Dawson-Right-Chaise-Sectional-Sofa-Moss-Front-1722414758.jpg",
    peyton_cumin:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1721274515/crusader/variants/AS-000377C-PY4004/Dawson-Right-Chaise-Sectional-Sofa-Cumin-Front-1721274513.jpg",
    infinity_boucle_ginger:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723537856/crusader/variants/AS-000377C-IN4003/Dawson-Right-Chaise-Sectional-Sofa-Ginger-Front-1723537854.jpg",
    infinity_boucle_white_quartz:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1722420630/crusader/variants/AS-000377C-IN4002/Dawson-Right-Chaise-Sectional-Sofa-White-Quartz-Front-1722420627.jpg",
    performance_boucle_cream:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773903432/crusader/variants/AS-000377C-IN4005/Dawson-Right-Chaise-Sectional-sofa-Facing-Cream-Front-1773903429.jpg",
    performance_infinity_boucle_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246541/crusader/variants/AS-000377C-IN4004/Dawson-Right-Chaise-Sectional-sofa-Facing-Moss-Front-1774246539.jpg",
    performance_genova_oat:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773911475/crusader/variants/AS-000377C-PG4002/Dawson-Right-Chaise-Sectional-sofa-Facing-Performance-Genova-Oat-Front-1773911473.jpg",
    performance_linen_weave_cream:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773911493/crusader/variants/AS-000377C-PG4003/Dawson-Right-Chaise-Sectional-sofa-Facing-Cream-Front-1773911491.jpg",
    performance_linen_weave_light_grey:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773911515/crusader/variants/AS-000377C-PG4004/Dawson-Right-Chaise-Sectional-sofa-Facing-Light-Grey-Front-1773911512.jpg",
    performance_twill_dove_grey:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773901120/crusader/variants/AS-000377C-PT4005/Dawson-Right-Chaise-Sectional-sofa-Facing-Performance-Twill-Dove-Grey-Front-1773901118.jpg",
    performance_twill_pearl_beige:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773901079/crusader/variants/AS-000377C-PT4002/Dawson-Right-Chaise-Sectional-sofa-Facing-Performance-Twill-Pearl-Beige-Front-1773901077.jpg",
    performance_twill_slate:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773901096/crusader/variants/AS-000377C-PT4003/Dawson-Right-Chaise-Sectional-sofa-Facing-Performance-Twill-Slate-Front-1773901093.jpg",
    performance_twill_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773901108/crusader/variants/AS-000377C-PT4004/Dawson-Right-Chaise-Sectional-sofa-Facing-Performance-Twill-Moss-Front-1773901106.jpg",
    greta_ivory:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246559/crusader/variants/AS-000377C-GR4001/Dawson-Right-Chaise-Sectional-sofa-Facing-Cream-Front-1774246557.jpg",
    washed_chenille_sand:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246580/crusader/variants/AS-000377C-GR4002/Dawson-Right-Chaise-Sectional-sofa-Facing-Sand-Front-1774246577.jpg",
    greta_mustard_brown:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246595/crusader/variants/AS-000377C-GR4003/Dawson-Right-Chaise-Sectional-sofa-Facing-Caramel-Front-1774246593.jpg",
    greta_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246607/crusader/variants/AS-000377C-GR4004/Dawson-Right-Chaise-Sectional-sofa-Facing-Moss-Front-1774246605.jpg",
    cocoa_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1715936526/crusader/variants/AS-000531-LE4020/Dawson-Right-Chaise-Sectional-Sofa-Cocoa-Front__1_-1715936524.jpg",
    caramel_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773801163/crusader/variants/AS-000531C-LE4016/Dawson-Right-Chaise-Sectional-sofa-Facing-Caramel-Front-1773801161.jpg",
    warm_taupe_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773801185/crusader/variants/AS-000531C-LE4017/Dawson-Right-Chaise-Sectional-sofa-Facing-Warm-Taupe-Front-1773801182.jpg",
    marche_ivory_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773801204/crusader/variants/AS-000531C-LE4021/Dawson-Right-Chaise-Sectional-sofa-Facing-Marche-Ivory-Front-1773801202.jpg",
    marche_graphite_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773912208/crusader/variants/AS-000531C-LE4022/Dawson-Right-Chaise-Sectional-sofa-Facing-Marche-Graphite-Front-1773912205.jpg",
    marche_cocoa_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773912232/crusader/variants/AS-000531C-LE4023/Dawson-Right-Chaise-Sectional-sofa-Facing-Marche-Cocoa-Front-1773912229.jpg",
  },
  "sofa-real-castlery-dawson-chaise-sectional-left": {
    beach_linen:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634718815/crusader/variants/T50440989-NG4001/Dawson-Left_-Chaise-Sectional-sofa-Beach-Linen-Front.jpg",
    navagio_seagull:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697617013/crusader/variants/AS-000376-NG4002/Dawson-Left-Chaise-Sectional-Sofa-Seagull-Front-1697617010.jpg",
    marcel_brilliant_white:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1721275081/crusader/variants/AS-000376C-PM4002/Dawson-Left-Chaise-Sectional-Sofa-Brilliant-White-Front-1721275079.jpg",
    peyton_ivory:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1721275066/crusader/variants/AS-000376C-PY4001/Dawson-Left-Chaise-Sectional-Sofa-Ivory-Front-1721275064.jpg",
    peyton_dove_grey:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1722413517/crusader/variants/AS-000376C-PY4002/Dawson-Left-Chaise-Sectional-Sofa-Dove-Grey-Front-1722413515.jpg",
    peyton_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1722414737/crusader/variants/AS-000376C-PY4003/Dawson-Left-Chaise-Sectional-Sofa-Moss-Front-1722414735.jpg",
    peyton_cumin:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1721274967/crusader/variants/AS-000376C-PY4004/Dawson-Left-Chaise-Sectional-Sofa-Cumin-Front-1721274964.jpg",
    infinity_boucle_ginger:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723537551/crusader/variants/AS-000376C-IN4003/Dawson-Left-Chaise-Sectional-Sofa-Ginger-Front-1723537548.jpg",
    infinity_boucle_white_quartz:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1722420656/crusader/variants/AS-000376C-IN4002/Dawson-Left-Chaise-Sectional-Sofa-White-Quartz-Front-1722420653.jpg",
    performance_boucle_cream:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773903391/crusader/variants/AS-000376C-IN4005/Dawson-Left-Chaise-Sectional-sofa-Facing-Cream-Front-1773903388.jpg",
    performance_infinity_boucle_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246433/crusader/variants/AS-000376C-IN4004/Dawson-Left-Chaise-Sectional-sofa-Facing-Moss-Front-1774246431.jpg",
    performance_genova_oat:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773911373/crusader/variants/AS-000376C-PG4002/Dawson-Left-Chaise-Sectional-sofa-Facing-Performance-Genova-Oat-Front-1773911370.jpg",
    performance_linen_weave_cream:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773911392/crusader/variants/AS-000376C-PG4003/Dawson-Left-Chaise-Sectional-sofa-Facing-Cream-Front-1773911389.jpg",
    performance_linen_weave_light_grey:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773911412/crusader/variants/AS-000376C-PG4004/Dawson-Left-Chaise-Sectional-sofa-Facing-Light-Grey-Front-1773911410.jpg",
    performance_twill_dove_grey:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773901041/crusader/variants/AS-000376C-PT4005/Dawson-Left-Chaise-Sectional-sofa-Facing-Performance-Twill-Dove-Grey-Front-1773901039.jpg",
    performance_twill_pearl_beige:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773900989/crusader/variants/AS-000376C-PT4002/Dawson-Left-Chaise-Sectional-sofa-Facing-Performance-Twill-Pearl-Beige-Front-1773900986.jpg",
    performance_twill_slate:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773901010/crusader/variants/AS-000376C-PT4003/Dawson-Left-Chaise-Sectional-sofa-Facing-Performance-Twill-Slate-Front-1773901008.jpg",
    performance_twill_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773901027/crusader/variants/AS-000376C-PT4004/Dawson-Left-Chaise-Sectional-sofa-Facing-Performance-Twill-Moss-Front-1773901025.jpg",
    greta_ivory:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246463/crusader/variants/AS-000376C-GR4001/Dawson-Left-Chaise-Sectional-sofa-Facing-Cream-Front-1774246461.jpg",
    washed_chenille_sand:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246479/crusader/variants/AS-000376C-GR4002/Dawson-Left-Chaise-Sectional-sofa-Facing-Sand-Front-1774246477.jpg",
    greta_mustard_brown:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246493/crusader/variants/AS-000376C-GR4003/Dawson-Left-Chaise-Sectional-sofa-Facing-Caramel-Front-1774246491.jpg",
    greta_moss:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1774246512/crusader/variants/AS-000376C-GR4004/Dawson-Left-Chaise-Sectional-sofa-Facing-Moss-Front-1774246509.jpg",
    cocoa_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1715936444/crusader/variants/AS-000530-LE4020/Dawson-Left-Chaise-Sectional-Sofa-Cocoa-Front-1715936442.jpg",
    caramel_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773801041/crusader/variants/AS-000530C-LE4016/Dawson-Left-Chaise-Sectional-sofa-Facing-Caramel-Front-1773801039.jpg",
    warm_taupe_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773801062/crusader/variants/AS-000530C-LE4017/Dawson-Left-Chaise-Sectional-sofa-Facing-Warm-Taupe-Front-1773801060.jpg",
    marche_ivory_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773801081/crusader/variants/AS-000530C-LE4021/Dawson-Left-Chaise-Sectional-sofa-Facing-Marche-Ivory-Front-1773801079.jpg",
    marche_graphite_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773912143/crusader/variants/AS-000530C-LE4022/Dawson-Left-Chaise-Sectional-sofa-Facing-Marche-Graphite-Front-1773912141.jpg",
    marche_cocoa_leather:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1773912164/crusader/variants/AS-000530C-LE4023/Dawson-Left-Chaise-Sectional-sofa-Facing-Marche-Cocoa-Front-1773912162.jpg",
  },
};

function applyDawsonChaiseVariantImageOverrides(
  assetId: string | undefined,
  variants: CatalogYamlVariantEntry[] | undefined
): CatalogYamlVariantEntry[] | undefined {
  if (!assetId || !variants?.length) return variants;

  const imageMap = DAWSON_CHAISE_VARIANT_IMAGES_BY_ASSET_ID[assetId];
  if (!imageMap) return variants;

  return variants.map((variant) => {
    const code = String(variant.upholstery_code ?? "").trim();
    const imageUrl = imageMap[code];
    if (!imageUrl) return variant;

    return {
      ...variant,
      thumbnail_url: imageUrl,
      gallery_images: [imageUrl],
      galleryImages: [imageUrl],
    };
  });
}

function getCatalogYamlCache() {
  if (_cache) return _cache;
  getCatalogYamlMap();
  return _cache ?? { byAssetId: new Map<string, CatalogYamlEntry>(), entries: [] };
}

function enrichCatalogEntry(filePath: string, parsed: CatalogYamlEntry): CatalogYamlEntry {
  const preset = getCatalogPreset(parsed.category);
  const withDefaults = preset ? applyPresetDefaults(parsed, preset) : parsed;
  // Resolve upholstery library reference if present
  let resolvedUpholsteryOptions = withDefaults.upholstery_options;
  let supportedUpholsteryCodes: Set<string> | null = null;
  if (withDefaults.upholstery_library_ref) {
    const libraries = getUpholsteryLibraries();
    const lib = libraries.get(withDefaults.upholstery_library_ref);
    const supported = lib?.family_upholstery_map?.supported_upholstery_codes;
    if (supported?.length) {
      supportedUpholsteryCodes = new Set(supported);
    }

    if (lib?.upholstery_options) {
      if (!resolvedUpholsteryOptions?.length) {
        resolvedUpholsteryOptions = supportedUpholsteryCodes
          ? lib.upholstery_options.filter((o) => supportedUpholsteryCodes?.has(o.upholstery_code))
          : lib.upholstery_options;
      } else if (supportedUpholsteryCodes) {
        resolvedUpholsteryOptions = resolvedUpholsteryOptions.filter((o) =>
          supportedUpholsteryCodes?.has(o.upholstery_code)
        );
      }
    }
  }

  // Enforce family allowlist on variants as well to prevent stale/non-official colors
  // from showing when product YAML still contains superseded upholstery rows.
  const resolvedVariants =
    supportedUpholsteryCodes && withDefaults.variants?.length
      ? withDefaults.variants.filter((variant) => {
          const code = String(variant.upholstery_code ?? "").trim();
          if (!code) return true;
          return supportedUpholsteryCodes?.has(code);
        })
      : withDefaults.variants;

  const variantsWithImageOverrides = applyDawsonChaiseVariantImageOverrides(
    withDefaults.assets?.asset_id,
    resolvedVariants,
  );

  return {
    ...withDefaults,
    variants: variantsWithImageOverrides,
    upholstery_options: resolvedUpholsteryOptions,
    file_path: filePath,
    preset_label: preset?.label ?? null,
    auto_metadata: preset ? buildPresetAutoMetadata(withDefaults, preset) : undefined,
    preset_validation: preset ? validateCatalogAgainstPreset(withDefaults, preset, "publish") : undefined,
  };
}

/**
 * Returns all parsed catalog entries keyed by `assets.asset_id`.
 * Results are cached in memory for the lifetime of the server process.
 */
export function getCatalogYamlMap(): Map<string, CatalogYamlEntry> {
  if (_cache) return _cache.byAssetId;

  const catalogDir = path.join(process.cwd(), "catalog", "furniture");
  const files = findFiles(catalogDir, "catalog.yaml");
  const map = new Map<string, CatalogYamlEntry>();
  const entries: CatalogYamlEntry[] = [];

  for (const filePath of files) {
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parse(raw) as CatalogYamlEntry;
      const enriched = enrichCatalogEntry(filePath, parsed);
      entries.push(enriched);
      const assetId = enriched?.assets?.asset_id;
      if (assetId) {
        map.set(assetId, enriched);
      }
    } catch {
      // Skip malformed files silently
    }
  }

  _cache = {
    byAssetId: map,
    entries,
  };
  return _cache.byAssetId;
}

export function getFreshCatalogYamlMap(): Map<string, CatalogYamlEntry> {
  invalidateCatalogYamlCache();
  return getCatalogYamlMap();
}

export function getAllCatalogYamlEntries(): CatalogYamlEntry[] {
  return getCatalogYamlCache().entries;
}

/** Invalidates the in-memory cache (useful in development). */
export function invalidateCatalogYamlCache() {
  _cache = null;
  _libraryCache = null;
}
