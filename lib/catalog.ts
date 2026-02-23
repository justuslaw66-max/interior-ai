import {
  CATEGORY_DEFAULTS,
  type CatalogItemSchema,
  type CommerceMapping,
  type StyleTag,
  type ProductCategory as NormalizedCategory,
} from "./catalog-schema";
import { MODEL_ASSETS, getModelAsset } from "./model-assets";

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
      modelUrl: modelAsset?.modelUrl ?? `/assets/models/${product.id}.glb`,
      thumbUrl: modelAsset?.thumbUrl ?? `/assets/thumbs/${product.id}.png`,
      materialsProfile: {
        preset: DEFAULT_MATERIAL_PRESET,
      },
    },
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.name,
      colorHex: variant.colorHex,
      thumbnailUrl: `/assets/thumbs/${product.id}-${variant.id}.png`,
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
  // SOFAS (10)
  // =========================
  "sofa-scandi-01": {
    id: "sofa-scandi-01",
    name: "Scandi Slim 2.1m",
    category: "sofa",
    price: 1099,
    dimensions: { w: 2.1, d: 0.85, h: 0.8 },
    styleTags: ["scandi", "minimalistic"],
    defaultVariantId: "oat",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497647063205",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/sofa-scandi-01",
    variants: [
      {
        id: "oat",
        name: "Oat",
        colorHex: "#d8d2c8",
        shopifyVariantId: "gid://shopify/ProductVariant/47497647063205",
      },
      {
        id: "stone",
        name: "Stone",
        colorHex: "#c9c3ba",
        shopifyVariantId: "gid://shopify/ProductVariant/47497647095973",
      },
    ],
  },
  "sofa-scandi-02": {
    id: "sofa-scandi-02",
    name: "Nordic Curve 2.3m",
    category: "sofa",
    price: 1399,
    dimensions: { w: 2.3, d: 0.9, h: 0.82 },
    styleTags: ["scandi", "modern"],
    defaultVariantId: "sand",
    purchaseMode: "affiliate",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/sofa-scandi-02",
    variants: [
      { id: "sand", name: "Sand", colorHex: "#cdbfae" },
      { id: "sage", name: "Sage", colorHex: "#9da58f" },
    ],
  },
  "sofa-japandi-01": {
    id: "sofa-japandi-01",
    name: "Low Zen Sofa 2.2m",
    category: "sofa",
    price: 1599,
    dimensions: { w: 2.2, d: 0.95, h: 0.7 },
    styleTags: ["japandi", "minimalistic"],
    defaultVariantId: "beige",
    purchaseMode: "affiliate",
    variants: [
      { id: "beige", name: "Beige", colorHex: "#d4c7b3" },
      { id: "taupe", name: "Taupe", colorHex: "#b9aa96" },
    ],
  },
  "sofa-japandi-02": {
    id: "sofa-japandi-02",
    name: "Oak Base Modular 2.4m",
    category: "sofa",
    price: 1799,
    dimensions: { w: 2.4, d: 0.95, h: 0.75 },
    styleTags: ["japandi", "luxury"],
    defaultVariantId: "linen",
    purchaseMode: "affiliate",
    variants: [
      { id: "linen", name: "Linen", colorHex: "#d7cec2" },
      { id: "charcoal", name: "Charcoal", colorHex: "#595959" },
    ],
  },
  "sofa-modern-01": {
    id: "sofa-modern-01",
    name: "Modern Box 2.5m",
    category: "sofa",
    price: 1899,
    dimensions: { w: 2.5, d: 1.0, h: 0.85 },
    styleTags: ["modern"],
    defaultVariantId: "grey",
    purchaseMode: "affiliate",
    retailer: "MockStore",
    buyUrl: "https://example.com/products/REPLACE_ME",
    variants: [
      { id: "grey", name: "Grey", colorHex: "#9a9a9a" },
      { id: "navy", name: "Navy", colorHex: "#2e3a56" },
    ],
  },
  "sofa-modern-02": {
    id: "sofa-modern-02",
    name: "Deep Lounge 2.6m",
    category: "sofa",
    price: 2199,
    dimensions: { w: 2.6, d: 1.05, h: 0.82 },
    styleTags: ["modern", "luxury"],
    defaultVariantId: "graphite",
    purchaseMode: "shopify",
    shopifyVariantId: "gid://shopify/ProductVariant/47497654173861",
    variants: [
      {
        id: "graphite",
        name: "Graphite",
        colorHex: "#444444",
        shopifyVariantId: "gid://shopify/ProductVariant/47497654173861",
      },
      {
        id: "cream",
        name: "Cream",
        colorHex: "#e6e0d6",
        shopifyVariantId: "gid://shopify/ProductVariant/47497654206629",
      },
    ],
  },
  "sofa-luxury-01": {
    id: "sofa-luxury-01",
    name: "Velvet Luxe 2.4m",
    category: "sofa",
    price: 2699,
    dimensions: { w: 2.4, d: 1.0, h: 0.9 },
    styleTags: ["luxury"],
    defaultVariantId: "emerald",
    purchaseMode: "affiliate",
    variants: [
      { id: "emerald", name: "Emerald", colorHex: "#1c4b3c" },
      { id: "burgundy", name: "Burgundy", colorHex: "#6b1e2e" },
    ],
  },
  "sofa-luxury-02": {
    id: "sofa-luxury-02",
    name: "Italian Curve 2.7m",
    category: "sofa",
    price: 3299,
    dimensions: { w: 2.7, d: 1.1, h: 0.88 },
    styleTags: ["luxury", "modern"],
    defaultVariantId: "ivory",
    purchaseMode: "affiliate",
    variants: [
      { id: "ivory", name: "Ivory", colorHex: "#f0ebe4" },
      { id: "espresso", name: "Espresso", colorHex: "#3a2e27" },
    ],
  },
  "sofa-min-01": {
    id: "sofa-min-01",
    name: "Minimal Line 2.0m",
    category: "sofa",
    price: 999,
    dimensions: { w: 2.0, d: 0.8, h: 0.78 },
    styleTags: ["minimalistic"],
    defaultVariantId: "offwhite",
    purchaseMode: "affiliate",
    variants: [
      { id: "offwhite", name: "Off White", colorHex: "#ece7df" },
      { id: "lightgrey", name: "Light Grey", colorHex: "#cfcfcf" },
    ],
  },
  "sofa-min-02": {
    id: "sofa-min-02",
    name: "Flat Edge 2.2m",
    category: "sofa",
    price: 1299,
    dimensions: { w: 2.2, d: 0.85, h: 0.78 },
    styleTags: ["minimalistic", "modern"],
    defaultVariantId: "ash",
    purchaseMode: "affiliate",
    variants: [
      { id: "ash", name: "Ash", colorHex: "#c8c2bb" },
      { id: "black", name: "Black", colorHex: "#222222" },
    ],
  },

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

// ============================================================================
// Normalized Catalog (Public API)
// ============================================================================

export const CATALOG_ITEMS: Record<string, CatalogItemSchema> = Object.fromEntries(
  Object.entries(CATALOG).map(([id, product]) => [id, buildCatalogItem(product)])
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
  
  Object.entries(CATALOG).forEach(([id, product]) => {
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
