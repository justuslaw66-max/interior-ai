import {
  CATEGORY_DEFAULTS,
  type CatalogItemSchema,
  type CommerceMapping,
  type StyleTag,
  type ProductCategory as NormalizedCategory,
} from "./catalog-schema";
import { getModelAsset } from "./model-assets";

export type Variant = {
  id: string;
  name: string;
  colorHex: string;
  priceDelta?: number;
  shopifyVariantId?: string;
};

export type ProductCategory =
  | "sofa"
  | "coffee_table"
  | "rug"
  | "tv_console"
  | "sideboard"
  | "accent_chair"
  | "floor_lamp";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  dimensions: { w: number; d: number; h: number };
  styleTags: string[];
  variants: Variant[];
  defaultVariantId: string;
  purchaseMode: "shopify" | "affiliate";
  retailer?: string;
  buyUrl?: string;
  shopifyVariantId?: string;
};

const STYLE_TAG_MAP: Record<string, StyleTag> = {
  scandi: "scandinavian",
  scandinavian: "scandinavian",
  minimalistic: "minimalist",
  minimalist: "minimalist",
  luxury: "luxe",
  luxe: "luxe",
  modern: "modern",
  japandi: "japandi",
};

const DEFAULT_MATERIAL_PRESET = "default";

const LEGACY_NO_MODEL_IDS = new Set<string>([
  // These legacy catalog entries currently have no matching GLB assets.
  // Keep modelUrl empty so 3D view falls back to dimension-correct primitive geometry.
  "castlery-sloane-sideboard-150cm",
  "castlery-sloane-sideboard-180cm",
]);

const LEGACY_THUMB_URL_OVERRIDES: Record<string, string> = {
  "castlery-sloane-sideboard-150cm": "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1756189513/crusader/variants/50520028/Sloane-Sideboard-150cm-Front-1756189510.jpg",
  "castlery-sloane-sideboard-180cm": "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1667991789/crusader/variants/50520002/Sloane-Sideboard-Fornt-1667991786.jpg",

  // ========== IMPORTED CASTLERY SOFAS (Harvested from Castlery Website) ==========
  "sofa-real-castlery-jaron-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737527905/crusader/variants/AS-000658-LE4023/Jaron-Leather-3-Seater-Dual-Recliner-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737527903.png",
  "sofa-real-castlery-jaron-extended-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737534897/crusader/variants/AS-000669-LE4023/Jaron-Leather-Extended-3-Seater-Recliner-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737534895.png",
  "sofa-real-castlery-jaron-3s-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737527644/crusader/variants/AS-000659-LE4023/Jaron-Leather-3-Seater-Dual-Recliner-Wide-Arm-Sofa-Marche-Cocoa_-Front-1737527642.jpg",
  "sofa-real-castlery-jaron-extended-3s-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737534745/crusader/variants/AS-000670-LE4023/Jaron-Leather-Extended-3-Seater-Recliner-Wide-Arm-Sofa-Marche-Cocoa_-Front-1737534742.jpg",
  "sofa-real-castlery-madison-2s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1745287810/crusader/variants/50441008-AM4001/Madison-2-Seater-Sofa-Amalfi-Bisque-Front-1745287807.png",
  "sofa-real-castlery-madison-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1646386187/crusader/variants/50440750-AM4001/Madison-3-Seater-Sofa-Bisque-Front-SG.png",
  "sofa-real-castlery-madison-ottoman": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1645673995/crusader/variants/50440732-AM4001/Madison-Ottoman-Bisque-Front.png",

  // ========== IMPORTED CASTLERY DINING (Harvested from Castlery Website) ==========
  "dining-real-castlery-sloane-travertine-180": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.png",
  "dining-real-castlery-sloane-bench-150-leather-cushion": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1678698648/crusader/variants/50520005/Sloane-Dining-Bench-150cm-Grey-Oak-With-Leather-Cushion-Angle-1678698646.png",

  // ========== JARON ADDITIONAL VARIANTS ==========
  "sofa-real-castlery-jaron-leather-slim-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740989670/crusader/variants/AS-000644-LE4023/Jaron-Leather-Slim-Arm-Sofa-Performance-Marche-Cocoa-Angle-1740989669.png",
  "sofa-real-castlery-jaron-performance-fabric-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740989512/crusader/variants/AS-000642-AR1020/Jaron-Slim-Arm-Sofa-Performance-Arvo-Dune-Angle-1740989511.png",
  "sofa-real-castlery-jaron-leather-corner-sofa": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1738824346/crusader/variants/AS-000668-LE4023/Jaron-Leather-Rachet-Corner-Sofa-Marche-Cocoa_-Front-1738824345.png",
  "sofa-real-castlery-jaron-leather-armless-sofa": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1738823965/crusader/variants/AS-000665-LE4023/Jaron-Leather-Stationary-Armless-Sofa-Marche-Cocoa_-Front-1738823963.png",
  "sofa-real-castlery-jaron-leather-power-recliner-armless": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737526200/crusader/variants/AS-000663-LE4023/Jaron-Leather-Power-Recliner-Armless-Sofa-Marche-Cocoa_-Front-1737526198.png",
  "sofa-real-castlery-jaron-leather-recliner-armchair": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1741571180/crusader/variants/AS-000662-LE4023/Jaron-Leathe-Wider-Arm-Recliner-Armchair-Marche-Cocoa-Angle_1-1741571179.png",
  "sofa-real-castlery-jaron-leather-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599393/crusader/variants/AS-000667-LE4023/Jaron-Leather-Chaise-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Angle-1737599392.png",
  "sofa-real-castlery-jaron-leather-l-shaped-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599831/crusader/variants/AS-000666-LE4023/Jaron-Leather-L-Shape-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Angle-1737599830.png",

  // ========== DAWSON VARIANTS ==========
  "sofa-real-castlery-dawson-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634716861/crusader/variants/T50440986-NG4001/Dawson-3-Seater-Sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-extended-sofa": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634717099/crusader/variants/T50440987-NG4001/Dawson-Extended-Sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-ottoman": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692451017/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Front_-1692451014.jpg",
  "sofa-real-castlery-dawson-pit-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1709779174/crusader/variants/AS-000379-NG4001/Dawson-Pit-Sectional-Sofa-Front_1_-1709779171.jpg",
  "sofa-real-castlery-dawson-wide-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1724055040/crusader/variants/AS-000625-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Bech-Linen-Front-1724055038.jpg",
  "sofa-real-castlery-dawson-wide-chaise-sectional-left": "/assets/thumbs/sofa-real-castlery-dawson-wide-chaise-sectional-left.png",
  "sofa-real-castlery-dawson-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634718495/crusader/variants/T50440988-NG4001/Dawson-Right_-Chaise-Sectional-sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-chaise-sectional-left": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634718815/crusader/variants/T50440989-NG4001/Dawson-Left_-Chaise-Sectional-sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-swivel-armchair": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692591108/crusader/variants/54000131-NG4001/Dawson-Swivel-Armchair-Front-1692591104.jpg",
  "sofa-real-castlery-dawson-leather-pit-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1715669133/crusader/variants/AS-000550/Dawson-Pit-Sectional-Sofa-Cocoa-Angle-1715669132.png",

  // ========== DINING TABLES - BRIGHTON, KELSEY, FORMA ==========
  // ========== DINING TABLES - BRIGHTON, KELSEY, FORMA, CASA, SAWYER ==========
  "dining-real-castlery-brighton-oval-180": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000518/Brighton-Oval-Dining-Table-Front.png",
  "dining-real-castlery-kelsey-rectangle-200": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000519/Kelsey-Rectangle-Dining-Table-Front.png",
  "dining-real-castlery-forma-round-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000520/Forma-Round-Dining-Table-Front.png",
  "dining-real-castlery-casa-oval-180": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000521/Casa-Oval-Dining-Table-Front.png",
  "dining-real-castlery-sawyer-rectangle-200": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000522/Sawyer-Rectangle-Dining-Table-Front.png",
  "dining-real-castlery-kelsey-marble-160-walnut": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.png",
  "dining-real-castlery-kelsey-marble-160-white-wash": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1660199610/crusader/variants/50521037/Kelsey-Marble-Dining-Table-160-Natural-Front-1660199609.png",
  "dining-real-castlery-kelsey-marble-180": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.png",
  "dining-real-castlery-forma-round-90-walnut": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1769049963/crusader/variants/50521281/Forma-Round-Dining-Table-90cm-Walnut-Front-1769049962.png",
  "dining-real-castlery-forma-oval-150-walnut": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1769050316/crusader/variants/50521282/Forma-Oval-Dining-Table-150cm-Walnut-Front-1769050315.png",
  "dining-real-castlery-sloane-travertine-220": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.png",
  "dining-real-castlery-casa-dining-table-154": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1756455069/crusader/variants/40550342/Casa-Rectangular-Dining-Table-154cm-Angle_1-1756455067.png",
  "dining-real-castlery-sawyer-rectangular-coffee-table-120": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692436666/crusader/variants/50220010/Sawyer-Rectangular-Coffee-Table-120cm_-Angle-1692436664.png",

  // ========== COFFEE TABLES - HARPER, SEB, PERI, VENTO, CASA ==========
  "coffee-real-castlery-harper-marble-rectangular": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1741077857/crusader/variants/40550279/Harper-Marble-Rectangular-Coffee-Table_-_Chestnut-Front-1741077855.png",
  "coffee-real-castlery-harper-marble-round": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1741077787/crusader/variants/40550280/Harper-Marble-Round-Coffee-Table_-_Chestnut-Front-1741077785.png",
  "coffee-real-castlery-harper-marble-side": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740018494/crusader/variants/40550278/Harper-Marble-Side-Table_-_Chestnut-Front-1740018492.png",
  "coffee-real-castlery-harper-marble-storage-side": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740019462/crusader/variants/40550291/Harper-Marble-Storage-Side-Table_-_Chestnut-Front-1740019460.png",
  "coffee-real-castlery-seb-rectangular-marble": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1739498139/crusader/variants/40550283/Seb-Rectangular-Marble-Coffee-Table-Front-1739498136.png",
  "coffee-real-castlery-seb-round-marble": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1739498073/crusader/variants/40550282/Seb-Round-Marble-Coffee-Table-Front-1739498071.png",
  "coffee-real-castlery-seb-storage": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768897928/crusader/variants/40550392/Seb-Coffee-Table-90cm-Front-1768897926.png",
  "coffee-real-castlery-peri": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1641292754/crusader/variants/50850023/Peri-Coffee-Table-Front.png",
  "coffee-real-castlery-vento-120": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1770256447/crusader/variants/44250004/Vento-Coffee-Table-120cm-Front_1-1770256444.png",
  "coffee-real-castlery-casa-round-85": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1689234557/crusader/variants/40550226/Casa-Round-Coffee-Table-Front-1689234555.png",

  // ========== TV CONSOLES - SAWYER, SEB, SLOANE, CASA, VENTO ==========
  "console-real-castlery-sawyer-tv-200": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1673927310/crusader/variants/50220001/Sawyer-TV-Console-Angle-1673927308.png",
  "console-real-castlery-seb-tv-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768897986/crusader/variants/40550391/Seb-TV-Console-150cm-Front-1768897984.png",
  "console-real-castlery-sloane-tv-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.png",
  "console-real-castlery-casa-tv-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1756455117/crusader/variants/40550345/Casa-TV-Console-150cm-Front-1756455114.png",
  "console-real-castlery-vento-tv-120": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1770256168/crusader/variants/44250007/Vento-TV-Console-120cm-Front-1770256166.png",

  // ========== STORAGE - SAWYER SIDEBOARD ==========
  "storage-real-castlery-sawyer-sideboard-180cm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1673927310/crusader/variants/50220001/Sawyer-TV-Console-Angle-1673927308.png",

  // ========== COFFEE TABLES - HUGG NESTING ==========
  "coffee-real-castlery-hugg-nesting-square": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1641292754/crusader/variants/50850023/Peri-Coffee-Table-Front.png",
};

function normalizeStyleTags(tags: string[]): StyleTag[] {
  const normalized = tags
    .map((tag) => STYLE_TAG_MAP[tag.toLowerCase()])
    .filter(Boolean) as StyleTag[];
  return Array.from(new Set(normalized));
}

function buildCommerceMapping(product: Product): CommerceMapping {
  const defaultVariant =
    product.variants.find((v) => v.id === product.defaultVariantId) ??
    product.variants[0];
  const shopifyVariantId =
    defaultVariant?.shopifyVariantId ?? product.shopifyVariantId;

  if (product.purchaseMode === "shopify") {
    return {
      type: "shopify",
      data: {
        productId: product.id,
        variantId: shopifyVariantId ?? product.id,
        available: Boolean(shopifyVariantId),
      },
    };
  }

  if (product.purchaseMode === "affiliate") {
    return {
      type: "affiliate",
      data: {
        url: product.buyUrl ?? "",
        retailer: product.retailer ?? "affiliate",
        priceHint: product.price,
      },
    };
  }

  return { type: "not_buyable", reason: "missing purchase mapping" };
}

function buildCatalogItem(product: Product): CatalogItemSchema {
  const category = product.category as NormalizedCategory;
  const defaults = CATEGORY_DEFAULTS[category] ?? CATEGORY_DEFAULTS.other;
  
  // Try to get asset from MODEL_ASSETS registry
  const assetId = product.id; // For now, use product.id as assetId
  const modelAsset = getModelAsset(assetId);
  
  // Use MODEL_ASSETS data if available, otherwise fall back to product dimensions
  const dimensionsMm = modelAsset?.dimsMm ?? {
    w: Math.round(product.dimensions.w * 1000),
    d: Math.round(product.dimensions.d * 1000),
    h: Math.round(product.dimensions.h * 1000),
  };
  
  const bounds = modelAsset?.bounds ? {
    type: "aabb" as const,
    size: {
      w: modelAsset.bounds.size.x,
      d: modelAsset.bounds.size.z,
      h: modelAsset.bounds.size.y,
    },
    center: [
      modelAsset.bounds.center.x,
      modelAsset.bounds.center.y,
      modelAsset.bounds.center.z,
    ] as [number, number, number],
  } : {
    type: "aabb" as const,
    size: {
      w: product.dimensions.w,
      d: product.dimensions.d,
      h: product.dimensions.h,
    },
    center: [0, product.dimensions.h / 2, 0] as [number, number, number],
  };
  
  const pivot = modelAsset?.pivot ?? {
    offsetX: 0,
    offsetZ: 0,
    groundAligned: true,
  };

  return {
    id: product.id,
    slug: product.id,
    title: product.name,
    category,
    description: undefined,

    dimsMm: dimensionsMm,
    dimensionsMm,
    bounds,
    pivot,
    defaultRotation: 0,

    placementRules: defaults.placement,
    clearanceRules: defaults.clearance,

    styleTags: normalizeStyleTags(product.styleTags),
    toneTags: [],
    roomTags: [],

    assets: {
      assetId,
      modelUrl:
        modelAsset?.modelUrl ??
        (LEGACY_NO_MODEL_IDS.has(product.id) || product.category === "rug"
          ? ""
          : undefined) ??
        `/assets/models/${product.id}.glb`,
      thumbUrl:
        modelAsset?.thumbUrl ??
        LEGACY_THUMB_URL_OVERRIDES[product.id] ??
        `/assets/thumbs/${product.id}.png`,
      materialsProfile: {
        preset: DEFAULT_MATERIAL_PRESET,
      },
    },
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.name,
      colorHex: variant.colorHex,
      thumbnailUrl:
        LEGACY_THUMB_URL_OVERRIDES[product.id] ??
        `/assets/thumbs/${product.id}-${variant.id}.png`,
    })),
    defaultVariantId: product.defaultVariantId,

    commerce: buildCommerceMapping(product),

    aiRoles: defaults.aiRoles,
    tags: product.styleTags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// LEGACY CATALOG (Internal use only - do not export)
// ============================================================================

const CATALOG: Record<string, Product> = {
  // =========================
  // SOFAS
  // =========================
  // Legacy non-imported sofa placeholders removed.

  // =========================
  // RUGS (10)
  // =========================
  "rug-scandi-01": {
    id: "rug-scandi-01",
    name: "Scandi Weave 2.0x3.0m",
    category: "rug",
    price: 179,
    dimensions: { w: 3.0, d: 2.0, h: 0.02 },
    styleTags: ["scandi", "minimalistic"],
    defaultVariantId: "ivory",
    purchaseMode: "affiliate",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/REPLACE_ME",
    variants: [
      { id: "ivory", name: "Ivory", colorHex: "#e6e0d6" },
      { id: "warmgray", name: "Warm Gray", colorHex: "#bdb6ad" },
    ],
  },
  "rug-scandi-02": {
    id: "rug-scandi-02",
    name: "Nordic Grid 1.6x2.3m",
    category: "rug",
    price: 139,
    dimensions: { w: 2.3, d: 1.6, h: 0.02 },
    styleTags: ["scandi", "modern"],
    defaultVariantId: "oat",
    purchaseMode: "affiliate",
    variants: [
      { id: "oat", name: "Oat", colorHex: "#d8d2c8" },
      { id: "stone", name: "Stone", colorHex: "#c9c3ba" },
    ],
  },
  "rug-japandi-01": {
    id: "rug-japandi-01",
    name: "Zen Texture 2.0x2.8m",
    category: "rug",
    price: 199,
    dimensions: { w: 2.8, d: 2.0, h: 0.02 },
    styleTags: ["japandi", "minimalistic"],
    defaultVariantId: "sand",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497656041637",
    variants: [
      {
        id: "sand",
        name: "Sand",
        colorHex: "#cdbfae",
        shopifyVariantId: "gid://shopify/ProductVariant/47497656041637",
      },
      {
        id: "taupe",
        name: "Taupe",
        colorHex: "#b9aa96",
        shopifyVariantId: "gid://shopify/ProductVariant/47497681436837",
      },
    ],
  },
  "rug-japandi-02": {
    id: "rug-japandi-02",
    name: "Natural Sisal 2.0x3.0m",
    category: "rug",
    price: 229,
    dimensions: { w: 3.0, d: 2.0, h: 0.02 },
    styleTags: ["japandi"],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    variants: [
      { id: "natural", name: "Natural", colorHex: "#d2c4ae" },
      { id: "smoke", name: "Smoke", colorHex: "#a9a39a" },
    ],
  },
  "rug-modern-01": {
    id: "rug-modern-01",
    name: "Modern Abstract 2.0x3.0m",
    category: "rug",
    price: 259,
    dimensions: { w: 3.0, d: 2.0, h: 0.02 },
    styleTags: ["modern"],
    defaultVariantId: "greige",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497655615653",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/rug-modern-01",
    variants: [
      {
        id: "greige",
        name: "Greige",
        colorHex: "#b9b1a6",
        shopifyVariantId: "gid://shopify/ProductVariant/47497655615653",
      },
      {
        id: "charcoal",
        name: "Charcoal",
        colorHex: "#595959",
        shopifyVariantId: "gid://shopify/ProductVariant/47497655648421",
      },
    ],
  },
  "rug-modern-02": {
    id: "rug-modern-02",
    name: "Soft Fade 1.8x2.6m",
    category: "rug",
    price: 219,
    dimensions: { w: 2.6, d: 1.8, h: 0.02 },
    styleTags: ["modern", "minimalistic"],
    defaultVariantId: "lightgrey",
    purchaseMode: "affiliate",
    variants: [
      { id: "lightgrey", name: "Light Grey", colorHex: "#cfcfcf" },
      { id: "navy", name: "Navy", colorHex: "#2e3a56" },
    ],
  },
  "rug-luxury-01": {
    id: "rug-luxury-01",
    name: "Luxury Plush 2.2x3.0m",
    category: "rug",
    price: 399,
    dimensions: { w: 3.0, d: 2.2, h: 0.03 },
    styleTags: ["luxury"],
    defaultVariantId: "ivory",
    purchaseMode: "affiliate",
    variants: [
      { id: "ivory", name: "Ivory", colorHex: "#f0ebe4" },
      { id: "espresso", name: "Espresso", colorHex: "#3a2e27" },
    ],
  },
  "rug-luxury-02": {
    id: "rug-luxury-02",
    name: "Silk Sheen 2.0x2.8m",
    category: "rug",
    price: 449,
    dimensions: { w: 2.8, d: 2.0, h: 0.02 },
    styleTags: ["luxury", "modern"],
    defaultVariantId: "pearl",
    purchaseMode: "affiliate",
    variants: [
      { id: "pearl", name: "Pearl", colorHex: "#e9e4dc" },
      { id: "graphite", name: "Graphite", colorHex: "#444444" },
    ],
  },
  "rug-min-01": {
    id: "rug-min-01",
    name: "Minimal Flatweave 2.0x3.0m",
    category: "rug",
    price: 159,
    dimensions: { w: 3.0, d: 2.0, h: 0.015 },
    styleTags: ["minimalistic"],
    defaultVariantId: "offwhite",
    purchaseMode: "affiliate",
    variants: [
      { id: "offwhite", name: "Off White", colorHex: "#ece7df" },
      { id: "ash", name: "Ash", colorHex: "#c8c2bb" },
    ],
  },
  "rug-min-02": {
    id: "rug-min-02",
    name: "Mono Border 1.6x2.3m",
    category: "rug",
    price: 129,
    dimensions: { w: 2.3, d: 1.6, h: 0.015 },
    styleTags: ["minimalistic", "scandi"],
    defaultVariantId: "stone",
    purchaseMode: "affiliate",
    variants: [
      { id: "stone", name: "Stone", colorHex: "#c9c3ba" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },

  // =========================
  // COFFEE TABLES (10)
  // =========================
  "coffee-scandi-01": {
    id: "coffee-scandi-01",
    name: "Scandi Oak 1.1m",
    category: "coffee_table",
    price: 259,
    dimensions: { w: 1.1, d: 0.55, h: 0.38 },
    styleTags: ["scandi", "minimalistic"],
    defaultVariantId: "oak",
    purchaseMode: "affiliate",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/REPLACE_ME",
    variants: [
      { id: "oak", name: "Oak", colorHex: "#c9b18a" },
      { id: "whiteoak", name: "White Oak", colorHex: "#d7c3a1" },
    ],
  },
  "coffee-scandi-02": {
    id: "coffee-scandi-02",
    name: "Nordic Round 0.9m",
    category: "coffee_table",
    price: 219,
    dimensions: { w: 0.9, d: 0.9, h: 0.36 },
    styleTags: ["scandi", "modern"],
    defaultVariantId: "oak",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497682813093",
    variants: [
      {
        id: "oak",
        name: "Oak",
        colorHex: "#c9b18a",
        shopifyVariantId: "gid://shopify/ProductVariant/47497682813093",
      },
      {
        id: "black",
        name: "Black",
        colorHex: "#222222",
        shopifyVariantId: "gid://shopify/ProductVariant/47497682845861",
      },
    ],
  },
  "coffee-japandi-01": {
    id: "coffee-japandi-01",
    name: "Low Zen Table 1.0m",
    category: "coffee_table",
    price: 329,
    dimensions: { w: 1.0, d: 0.6, h: 0.33 },
    styleTags: ["japandi", "minimalistic"],
    defaultVariantId: "walnut",
    purchaseMode: "affiliate",
    variants: [
      { id: "walnut", name: "Walnut", colorHex: "#8a6a4a" },
      { id: "smoke", name: "Smoke", colorHex: "#6a6258" },
    ],
  },
  "coffee-japandi-02": {
    id: "coffee-japandi-02",
    name: "Slatted Oak 1.2m",
    category: "coffee_table",
    price: 379,
    dimensions: { w: 1.2, d: 0.6, h: 0.36 },
    styleTags: ["japandi"],
    defaultVariantId: "oak",
    purchaseMode: "affiliate",
    variants: [
      { id: "oak", name: "Oak", colorHex: "#c9b18a" },
      { id: "charcoal", name: "Charcoal", colorHex: "#595959" },
    ],
  },
  "coffee-modern-01": {
    id: "coffee-modern-01",
    name: "Modern Glass 1.2m",
    category: "coffee_table",
    price: 399,
    dimensions: { w: 1.2, d: 0.65, h: 0.38 },
    styleTags: ["modern"],
    defaultVariantId: "graphite",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497684025509",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/coffee-modern-01",
    variants: [
      {
        id: "graphite",
        name: "Graphite",
        colorHex: "#444444",
        shopifyVariantId: "gid://shopify/ProductVariant/47497684025509",
      },
      {
        id: "chrome",
        name: "Chrome",
        colorHex: "#b8b8b8",
        shopifyVariantId: "gid://shopify/ProductVariant/47497684058277",
      },
    ],
  },
  "coffee-modern-02": {
    id: "coffee-modern-02",
    name: "Block Table 1.0m",
    category: "coffee_table",
    price: 299,
    dimensions: { w: 1.0, d: 0.55, h: 0.4 },
    styleTags: ["modern", "minimalistic"],
    defaultVariantId: "ash",
    purchaseMode: "affiliate",
    variants: [
      { id: "ash", name: "Ash", colorHex: "#c8c2bb" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },
  "coffee-luxury-01": {
    id: "coffee-luxury-01",
    name: "Marble Luxe 1.1m",
    category: "coffee_table",
    price: 699,
    dimensions: { w: 1.1, d: 0.6, h: 0.38 },
    styleTags: ["luxury"],
    defaultVariantId: "marblewhite",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/REPLACE_ME",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/coffee-luxury-01",
    variants: [
      { id: "marblewhite", name: "Marble White", colorHex: "#e7e2da" },
      { id: "marbleblack", name: "Marble Black", colorHex: "#2a2a2a" },
    ],
  },
  "coffee-luxury-02": {
    id: "coffee-luxury-02",
    name: "Brass Frame 1.0m",
    category: "coffee_table",
    price: 749,
    dimensions: { w: 1.0, d: 0.6, h: 0.4 },
    styleTags: ["luxury", "modern"],
    defaultVariantId: "brass",
    purchaseMode: "affiliate",
    variants: [
      { id: "brass", name: "Brass", colorHex: "#b08d57" },
      { id: "espresso", name: "Espresso", colorHex: "#3a2e27" },
    ],
  },
  "coffee-min-01": {
    id: "coffee-min-01",
    name: "Minimal Line 1.0m",
    category: "coffee_table",
    price: 199,
    dimensions: { w: 1.0, d: 0.5, h: 0.36 },
    styleTags: ["minimalistic"],
    defaultVariantId: "offwhite",
    purchaseMode: "affiliate",
    variants: [
      { id: "offwhite", name: "Off White", colorHex: "#ece7df" },
      { id: "lightgrey", name: "Light Grey", colorHex: "#cfcfcf" },
    ],
  },
  "coffee-min-02": {
    id: "coffee-min-02",
    name: "Mono Round 0.85m",
    category: "coffee_table",
    price: 179,
    dimensions: { w: 0.85, d: 0.85, h: 0.35 },
    styleTags: ["minimalistic", "scandi"],
    defaultVariantId: "stone",
    purchaseMode: "affiliate",
    variants: [
      { id: "stone", name: "Stone", colorHex: "#c9c3ba" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },

  // =========================
  // TV CONSOLES (10)
  // =========================
  "tv-scandi-01": {
    id: "tv-scandi-01",
    name: "Scandi Console 1.8m",
    category: "tv_console",
    price: 499,
    dimensions: { w: 1.8, d: 0.4, h: 0.5 },
    styleTags: ["scandi", "minimalistic"],
    defaultVariantId: "oak",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497685336229",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/REPLACE_ME",
    variants: [
      {
        id: "oak",
        name: "Oak",
        colorHex: "#c9b18a",
        shopifyVariantId: "gid://shopify/ProductVariant/47497685336229",
      },
      {
        id: "white",
        name: "White",
        colorHex: "#f3f3f3",
        shopifyVariantId: "gid://shopify/ProductVariant/47497685368997",
      },
    ],
  },
  "tv-scandi-02": {
    id: "tv-scandi-02",
    name: "Nordic Slat 2.0m",
    category: "tv_console",
    price: 599,
    dimensions: { w: 2.0, d: 0.42, h: 0.52 },
    styleTags: ["scandi", "modern"],
    defaultVariantId: "oak",
    purchaseMode: "affiliate",
    variants: [
      { id: "oak", name: "Oak", colorHex: "#c9b18a" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },
  "tv-japandi-01": {
    id: "tv-japandi-01",
    name: "Zen Low Console 1.9m",
    category: "tv_console",
    price: 699,
    dimensions: { w: 1.9, d: 0.42, h: 0.45 },
    styleTags: ["japandi", "minimalistic"],
    defaultVariantId: "walnut",
    purchaseMode: "affiliate",
    variants: [
      { id: "walnut", name: "Walnut", colorHex: "#8a6a4a" },
      { id: "smoke", name: "Smoke", colorHex: "#6a6258" },
    ],
  },
  "tv-japandi-02": {
    id: "tv-japandi-02",
    name: "Oak Frame 2.1m",
    category: "tv_console",
    price: 749,
    dimensions: { w: 2.1, d: 0.42, h: 0.5 },
    styleTags: ["japandi"],
    defaultVariantId: "oak",
    purchaseMode: "affiliate",
    variants: [
      { id: "oak", name: "Oak", colorHex: "#c9b18a" },
      { id: "charcoal", name: "Charcoal", colorHex: "#595959" },
    ],
  },
  "tv-modern-01": {
    id: "tv-modern-01",
    name: "Modern Float 2.0m",
    category: "tv_console",
    price: 799,
    dimensions: { w: 2.0, d: 0.4, h: 0.48 },
    styleTags: ["modern", "minimalistic"],
    defaultVariantId: "ash",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497686057125",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/tv-modern-01",
    variants: [
      {
        id: "ash",
        name: "Ash",
        colorHex: "#c8c2bb",
        shopifyVariantId: "gid://shopify/ProductVariant/47497686057125",
      },
      {
        id: "black",
        name: "Black",
        colorHex: "#222222",
        shopifyVariantId: "gid://shopify/ProductVariant/47497686089893",
      },
    ],
  },
  "tv-modern-02": {
    id: "tv-modern-02",
    name: "Graphite Media 2.2m",
    category: "tv_console",
    price: 899,
    dimensions: { w: 2.2, d: 0.45, h: 0.52 },
    styleTags: ["modern"],
    defaultVariantId: "graphite",
    purchaseMode: "affiliate",
    variants: [
      { id: "graphite", name: "Graphite", colorHex: "#444444" },
      { id: "white", name: "White", colorHex: "#f3f3f3" },
    ],
  },
  "tv-luxury-01": {
    id: "tv-luxury-01",
    name: "Luxury Marble 2.0m",
    category: "tv_console",
    price: 1299,
    dimensions: { w: 2.0, d: 0.45, h: 0.55 },
    styleTags: ["luxury"],
    defaultVariantId: "marblewhite",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/REPLACE_ME",
    variants: [
      { id: "marblewhite", name: "Marble White", colorHex: "#e7e2da" },
      { id: "marbleblack", name: "Marble Black", colorHex: "#2a2a2a" },
    ],
  },
  "tv-luxury-02": {
    id: "tv-luxury-02",
    name: "Brass Trim 2.2m",
    category: "tv_console",
    price: 1499,
    dimensions: { w: 2.2, d: 0.46, h: 0.56 },
    styleTags: ["luxury", "modern"],
    defaultVariantId: "brass",
    purchaseMode: "affiliate",
    variants: [
      { id: "brass", name: "Brass", colorHex: "#b08d57" },
      { id: "espresso", name: "Espresso", colorHex: "#3a2e27" },
    ],
  },
  "tv-min-01": {
    id: "tv-min-01",
    name: "Minimal Shelf 1.8m",
    category: "tv_console",
    price: 399,
    dimensions: { w: 1.8, d: 0.38, h: 0.48 },
    styleTags: ["minimalistic"],
    defaultVariantId: "offwhite",
    purchaseMode: "affiliate",
    variants: [
      { id: "offwhite", name: "Off White", colorHex: "#ece7df" },
      { id: "stone", name: "Stone", colorHex: "#c9c3ba" },
    ],
  },
  "tv-min-02": {
    id: "tv-min-02",
    name: "Mono Console 2.0m",
    category: "tv_console",
    price: 459,
    dimensions: { w: 2.0, d: 0.4, h: 0.5 },
    styleTags: ["minimalistic", "scandi"],
    defaultVariantId: "black",
    purchaseMode: "affiliate",
    variants: [
      { id: "black", name: "Black", colorHex: "#222222" },
      { id: "lightgrey", name: "Light Grey", colorHex: "#cfcfcf" },
    ],
  },

  // =========================
  // ACCENT CHAIRS (10)
  // =========================
  "chair-scandi-01": {
    id: "chair-scandi-01",
    name: "Scandi Accent Chair",
    category: "accent_chair",
    price: 349,
    dimensions: { w: 0.75, d: 0.75, h: 0.85 },
    styleTags: ["scandi", "minimalistic"],
    defaultVariantId: "oat",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497687007397",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/REPLACE_ME",
    variants: [
      {
        id: "oat",
        name: "Oat",
        colorHex: "#d8d2c8",
        shopifyVariantId: "gid://shopify/ProductVariant/47497687007397",
      },
      {
        id: "sage",
        name: "Sage",
        colorHex: "#9da58f",
        shopifyVariantId: "gid://shopify/ProductVariant/47497687040165",
      },
    ],
  },
  "chair-scandi-02": {
    id: "chair-scandi-02",
    name: "Nordic Curve Chair",
    category: "accent_chair",
    price: 429,
    dimensions: { w: 0.8, d: 0.78, h: 0.88 },
    styleTags: ["scandi", "modern"],
    defaultVariantId: "stone",
    purchaseMode: "affiliate",
    variants: [
      { id: "stone", name: "Stone", colorHex: "#c9c3ba" },
      { id: "navy", name: "Navy", colorHex: "#2e3a56" },
    ],
  },
  "chair-japandi-01": {
    id: "chair-japandi-01",
    name: "Zen Low Chair",
    category: "accent_chair",
    price: 499,
    dimensions: { w: 0.78, d: 0.8, h: 0.82 },
    styleTags: ["japandi", "minimalistic"],
    defaultVariantId: "linen",
    purchaseMode: "affiliate",
    variants: [
      { id: "linen", name: "Linen", colorHex: "#d7cec2" },
      { id: "taupe", name: "Taupe", colorHex: "#b9aa96" },
    ],
  },
  "chair-japandi-02": {
    id: "chair-japandi-02",
    name: "Oak Frame Chair",
    category: "accent_chair",
    price: 549,
    dimensions: { w: 0.8, d: 0.82, h: 0.86 },
    styleTags: ["japandi"],
    defaultVariantId: "sand",
    purchaseMode: "affiliate",
    variants: [
      { id: "sand", name: "Sand", colorHex: "#cdbfae" },
      { id: "charcoal", name: "Charcoal", colorHex: "#595959" },
    ],
  },
  "chair-modern-01": {
    id: "chair-modern-01",
    name: "Modern Tub Chair",
    category: "accent_chair",
    price: 599,
    dimensions: { w: 0.82, d: 0.82, h: 0.9 },
    styleTags: ["modern"],
    defaultVariantId: "grey",
    purchaseMode: "affiliate",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/chair-modern-01",
    variants: [
      { id: "grey", name: "Grey", colorHex: "#9a9a9a" },
      { id: "graphite", name: "Graphite", colorHex: "#444444" },
    ],
  },
  "chair-modern-02": {
    id: "chair-modern-02",
    name: "Sculpt Chair",
    category: "accent_chair",
    price: 699,
    dimensions: { w: 0.85, d: 0.8, h: 0.88 },
    styleTags: ["modern", "luxury"],
    defaultVariantId: "cream",
    purchaseMode: "affiliate",
    variants: [
      { id: "cream", name: "Cream", colorHex: "#e6e0d6" },
      { id: "navy", name: "Navy", colorHex: "#2e3a56" },
    ],
  },
  "chair-luxury-01": {
    id: "chair-luxury-01",
    name: "Velvet Lounge Chair",
    category: "accent_chair",
    price: 899,
    dimensions: { w: 0.88, d: 0.85, h: 0.95 },
    styleTags: ["luxury"],
    defaultVariantId: "emerald",
    purchaseMode: "affiliate",
    variants: [
      { id: "emerald", name: "Emerald", colorHex: "#1c4b3c" },
      { id: "burgundy", name: "Burgundy", colorHex: "#6b1e2e" },
    ],
  },
  "chair-luxury-02": {
    id: "chair-luxury-02",
    name: "Leather Club Chair",
    category: "accent_chair",
    price: 999,
    dimensions: { w: 0.9, d: 0.88, h: 0.95 },
    styleTags: ["luxury", "modern"],
    defaultVariantId: "espresso",
    purchaseMode: "affiliate",
    variants: [
      { id: "espresso", name: "Espresso", colorHex: "#3a2e27" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },
  "chair-min-01": {
    id: "chair-min-01",
    name: "Minimal Shell Chair",
    category: "accent_chair",
    price: 299,
    dimensions: { w: 0.75, d: 0.75, h: 0.85 },
    styleTags: ["minimalistic"],
    defaultVariantId: "offwhite",
    purchaseMode: "affiliate",
    variants: [
      { id: "offwhite", name: "Off White", colorHex: "#ece7df" },
      { id: "ash", name: "Ash", colorHex: "#c8c2bb" },
    ],
  },
  "chair-min-02": {
    id: "chair-min-02",
    name: "Mono Accent Chair",
    category: "accent_chair",
    price: 349,
    dimensions: { w: 0.78, d: 0.78, h: 0.86 },
    styleTags: ["minimalistic", "scandi"],
    defaultVariantId: "black",
    purchaseMode: "affiliate",
    variants: [
      { id: "black", name: "Black", colorHex: "#222222" },
      { id: "lightgrey", name: "Light Grey", colorHex: "#cfcfcf" },
    ],
  },

  // =========================
  // SIDEBOARDS (2)
  // =========================
  "castlery-sloane-sideboard-150cm": {
    id: "castlery-sloane-sideboard-150cm",
    name: "Sloane Sideboard 150cm",
    category: "sideboard",
    price: 1299,
    dimensions: { w: 1.5, d: 0.47, h: 0.78 },
    styleTags: ["modern"],
    defaultVariantId: "grey-oak-150",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/sloane-sideboard",
    variants: [
      { id: "grey-oak-150", name: "Grey Oak 150cm", colorHex: "#8a7d6a" },
    ],
  },
  "castlery-sloane-sideboard-180cm": {
    id: "castlery-sloane-sideboard-180cm",
    name: "Sloane Sideboard 180cm",
    category: "sideboard",
    price: 1599,
    dimensions: { w: 1.8, d: 0.47, h: 0.78 },
    styleTags: ["modern"],
    defaultVariantId: "grey-oak-180",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/sloane-sideboard?length=1_8m",
    variants: [
      { id: "grey-oak-180", name: "Grey Oak 180cm", colorHex: "#8a7d6a" },
    ],
  },

  // =========================
  // FLOOR LAMPS (6)
  // =========================
  "lamp-scandi-01": {
    id: "lamp-scandi-01",
    name: "Scandi Tripod Lamp",
    category: "floor_lamp",
    price: 169,
    dimensions: { w: 0.45, d: 0.45, h: 1.55 },
    styleTags: ["scandi", "minimalistic"],
    defaultVariantId: "white",
    purchaseMode: "affiliate",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/lamp-scandi-01",
    variants: [
      { id: "white", name: "White", colorHex: "#f3f3f3" },
      { id: "oak", name: "Oak", colorHex: "#c9b18a" },
    ],
  },
  "lamp-scandi-02": {
    id: "lamp-scandi-02",
    name: "Nordic Dome Lamp",
    category: "floor_lamp",
    price: 189,
    dimensions: { w: 0.42, d: 0.42, h: 1.6 },
    styleTags: ["scandi", "modern"],
    defaultVariantId: "black",
    purchaseMode: "affiliate",
    variants: [
      { id: "black", name: "Black", colorHex: "#222222" },
      { id: "stone", name: "Stone", colorHex: "#c9c3ba" },
    ],
  },
  "lamp-japandi-01": {
    id: "lamp-japandi-01",
    name: "Zen Paper Shade Lamp",
    category: "floor_lamp",
    price: 219,
    dimensions: { w: 0.5, d: 0.5, h: 1.5 },
    styleTags: ["japandi", "minimalistic"],
    defaultVariantId: "rice",
    purchaseMode: "affiliate",
    variants: [
      { id: "rice", name: "Rice Paper", colorHex: "#efe9df" },
      { id: "walnut", name: "Walnut", colorHex: "#8a6a4a" },
    ],
  },
  "lamp-modern-01": {
    id: "lamp-modern-01",
    name: "Arc Floor Lamp",
    category: "floor_lamp",
    price: 299,
    dimensions: { w: 1.1, d: 0.4, h: 1.75 },
    styleTags: ["modern"],
    defaultVariantId: "graphite",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497634611365",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/REPLACE_ME",
    variants: [
      {
        id: "graphite",
        name: "Graphite",
        colorHex: "#444444",
        shopifyVariantId: "gid://shopify/ProductVariant/47497634611365",
      },
      {
        id: "chrome",
        name: "Chrome",
        colorHex: "#b8b8b8",
        shopifyVariantId: "gid://shopify/ProductVariant/47497687761061",
      },
    ],
  },
  "lamp-luxury-01": {
    id: "lamp-luxury-01",
    name: "Brass Globe Lamp",
    category: "floor_lamp",
    price: 399,
    dimensions: { w: 0.5, d: 0.5, h: 1.7 },
    styleTags: ["luxury", "modern"],
    defaultVariantId: "brass",
    purchaseMode: "affiliate",
    variants: [
      { id: "brass", name: "Brass", colorHex: "#b08d57" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },
  "lamp-min-01": {
    id: "lamp-min-01",
    name: "Minimal Stick Lamp",
    category: "floor_lamp",
    price: 149,
    dimensions: { w: 0.35, d: 0.35, h: 1.65 },
    styleTags: ["minimalistic"],
    defaultVariantId: "offwhite",
    purchaseMode: "affiliate",
    variants: [
      { id: "offwhite", name: "Off White", colorHex: "#ece7df" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },
};

const isImportedSofa = (product: Product): boolean =>
  product.category !== "sofa" || product.id.startsWith("sofa-real-");

const PUBLIC_CATALOG_ENTRIES = Object.entries(CATALOG).filter(([, product]) =>
  isImportedSofa(product)
);

// ============================================================================
// Normalized Catalog (Public API)
// ============================================================================

export const CATALOG_ITEMS: Record<string, CatalogItemSchema> = Object.fromEntries(
  PUBLIC_CATALOG_ENTRIES.map(([id, product]) => [id, buildCatalogItem(product)])
);

export const CATALOG_ITEMS_MAP = new Map<string, CatalogItemSchema>(
  Object.entries(CATALOG_ITEMS)
);

// ============================================================================
// Dev-Only Validations (Run at module load in development)
// ============================================================================

if (process.env.NODE_ENV !== "production") {
  // Validate all legacy products convert successfully
  const errors: string[] = [];
  
  PUBLIC_CATALOG_ENTRIES.forEach(([id, product]) => {
    try {
      const item = buildCatalogItem(product);
      
      // Check ID consistency
      if (item.id !== id) {
        errors.push(`${id}: ID mismatch (product.id="${product.id}")`);
      }
      
      // Check defaultVariantId exists
      if (!item.variants.find(v => v.id === item.defaultVariantId)) {
        errors.push(`${id}: defaultVariantId "${item.defaultVariantId}" not found in variants`);
      }
      
      // Check commerce mapping is valid
      if (item.commerce.type === "not_buyable" && !item.commerce.reason) {
        errors.push(`${id}: not_buyable without reason`);
      }
      
      // Check dimensions are positive
      if (item.dimsMm.w <= 0 || item.dimsMm.d <= 0 || item.dimsMm.h <= 0) {
        errors.push(`${id}: invalid dimensions (${item.dimsMm.w}×${item.dimsMm.d}×${item.dimsMm.h}mm)`);
      }
      
    } catch (err) {
      errors.push(`${id}: failed to build - ${err}`);
    }
  });
  
  // Check for duplicate IDs
  const ids = Object.keys(CATALOG_ITEMS);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push(`Duplicate IDs found in catalog (${ids.length} total, ${uniqueIds.size} unique)`);
  }
  
  if (errors.length > 0) {
    console.error(
      "❌ Catalog validation errors:\n" + 
      errors.map(e => `  - ${e}`).join("\n")
    );
  } else {
    console.log(`✅ Catalog validated: ${ids.length} items`);
  }
}
