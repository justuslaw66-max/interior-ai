import type { CatalogItemSchema, CatalogPurchaseOption } from "../catalog-schema";
import { resolveCatalogVariant } from "./variant-resolver";
import {
  CATALOG_MEDIA_PRESENTATION_PRESETS,
  getCatalogMediaImageClass,
  inferCatalogMediaPresentationMode,
  type CatalogMediaPresentationMode,
} from "./media-policy";
import {
  deriveVariantDisambiguator,
  hardenDuplicateFinishOptionLabels,
  inferMaterialTypeFromText,
  normalizeVariantCode,
} from "./variant-normalization";
import { CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE, HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE } from "../design-page-product-data";
import { CATALOG_ITEMS } from "../catalog";

const CATEGORY_FALLBACK_THUMB_URL: Partial<Record<CatalogTopCategory, string>> = {
  bed:
    "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634541304/crusader/variants/54000038-CY4002/Lexi-Queen-Size-Bed-Nickel-Grey-Front_1-SG.jpg",
  accent_chair:
    "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692591108/crusader/variants/54000131-NG4001/Dawson-Swivel-Armchair-Front-1692591104.jpg",
  sofa:
    "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634716861/crusader/variants/T50440986-NG4001/Dawson-3-Seater-Sofa-Beach-Linen-Front.jpg",
  tv_console:
    "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.png",
  ottoman:
    "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634715643/crusader/variants/54000045-NG4001/Dawson-Ottoman-Beach-Linen-Front.jpg",
};

const FORCED_CARD_THUMB_BY_ITEM_ID: Record<string, string> = {
  "dining-real-castlery-forma-oval-150": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769050317/crusader/variants/AS-001039-WA/Forma-Oval-Dining-Table-150cm-Walnut-Front-1769050315.jpg",
  "dining-real-castlery-forma-round-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769050193/crusader/variants/AS-001038-WA/Forma-Round-Dining-Table-120cm-Walnut-Front-1769050191.jpg",
  "dining-real-castlery-forma-round-90": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769049964/crusader/variants/AS-001037-WA/Forma-Round-Dining-Table-90cm-Walnut-Front-1769049962.jpg",
  "dining-real-castlery-kelsey-marble-160": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1660199612/crusader/variants/52460092/Kelsey-Marble-Dining-Table-160-Natural-Front-1660199609.jpg",
  "dining-real-castlery-kelsey-marble-180": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1660199639/crusader/variants/52460093/Kelsey-Marble-Dining-Table-180-Natural-Front-1660199637.jpg",
  "dining-real-castlery-brighton-oval-180": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1638151292/crusader/variants/52460074/Brighton-Oval-Dining-Table-Front.jpg",
  "dining-real-castlery-sloane-bench-150-no-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678698647/crusader/variants/50520005/Sloane-Dining-Bench-150cm-Grey-Oak-Angle-1678698645.jpg",
  "dining-real-castlery-sloane-bench-150-leather-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678698648/crusader/variants/50520005/Sloane-Dining-Bench-150cm-Grey-Oak-With-Leather-Cushion-Angle-1678698646.jpg",
  "dining-real-castlery-sloane-bench-180-no-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679562782/crusader/variants/T504411010-LE4016/Sloane-Dining-Bench-180cm-Grey-Oak-Angle-1679562780.jpg",
  "dining-real-castlery-sloane-bench-180-leather-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679562782/crusader/variants/T504411010-LE4016/Sloane-Dining-Bench-180cm-Grey-Oak-With-Leather-Cushion-Angle-1679562780.jpg",
  "tv-real-castlery-casa-tv-console-150": "/assets/thumbs/tv-real-castlery-casa-tv-console-150.jpg",
  "tv-real-castlery-casa-tv-console-200": "/assets/thumbs/tv-real-castlery-casa-tv-console-200.jpg",
  "tv-real-castlery-sawyer-tv-console-200": "/assets/thumbs/tv-real-castlery-sawyer-tv-console-200.png",
  "tv-real-castlery-seb-tv-console-150": "/assets/thumbs/tv-real-castlery-seb-tv-console-150.jpg",
  "tv-real-castlery-seb-tv-console-200": "/assets/thumbs/tv-real-castlery-seb-tv-console-200.jpg",
  "tv-real-castlery-sloane-tv-console-150": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.jpg",
  "tv-real-castlery-sloane-tv-console-200": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1667991824/crusader/variants/50520001/Sloane-TV-Console-Fornt-1667991822.jpg",
  "storage-real-castlery-sawyer-sideboard-180cm": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1681350762/crusader/variants/50220002/Sawyer-Sideboard-Front_-1681350759.jpg",
  "accessory-real-castlery-blanc-arched-table-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697702180/crusader/variants/50230005/Blanc-Arched-Table-Lamp_1-1697702178.jpg",
  "accessory-real-castlery-edgar-duo-bulb-table-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710497549/crusader/variants/PB-001135/Edgar-Duo-Bulb-Table-Lamp_1-1710497546.jpg",
  "accessory-real-castlery-faro-sculptural-floor-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697702564/crusader/variants/50230008/Faro-Sculptural-Floor-Lamp_1-1697702562.jpg",
  "accessory-real-castlery-faro-table-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756370395/crusader/variants/52240024/Faro-Table-Lamp-Front_1-1756370393.jpg",
  "accessory-real-castlery-cedric-floor-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756370174/crusader/variants/52240027/Cedric-Floor-Lamp-Front_1-1756370170.jpg",
  "accessory-real-castlery-cedric-floor-lamp-with-table": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756370230/crusader/variants/52240025/Cedric-Floor-Lamp-With-Table-Front_1-1756370228.jpg",
  "accessory-real-castlery-cedric-table-lamp-28-8cm-curved": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769048978/crusader/variants/52240032/Cedric-Small-Table-Lamp-Front-1769048976.jpg",
  "accessory-real-castlery-cedric-table-lamp-53cm-curved": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769049026/crusader/variants/52240034/Cedric-Large-Table-Lamp-Front-1769049024.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564998/crusader/variants/AS-000635-AR4002-NA/Hugg-Square-Coffee-Table-Natural-Performance-Basalt-Front-1729564995.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564998/crusader/variants/AS-000635-AR4002-NA/Hugg-Square-Coffee-Table-Natural-Performance-Basalt-Front-1729564995.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-dune-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564013/crusader/variants/AS-000635-AR4001-NA/Hugg-Square-Coffee-Table-Natural-Performance-Dune_-Front-1729564011.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-dune-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564013/crusader/variants/AS-000635-AR4001-NA/Hugg-Square-Coffee-Table-Natural-Performance-Dune_-Front-1729564011.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729496469/crusader/variants/AS-000633-AR4002-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Basalt-Front-1729496467.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729496469/crusader/variants/AS-000633-AR4002-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Basalt-Front-1729496467.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729561925/crusader/variants/AS-000633-AR4001-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Dune-Front-1729561922.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729561925/crusader/variants/AS-000633-AR4001-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Dune-Front-1729561922.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837267/crusader/variants/AS-000634-AR4002-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Basalt-Front-1729837264.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837267/crusader/variants/AS-000634-AR4002-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Basalt-Front-1729837264.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837371/crusader/variants/AS-000634-AR4001-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Dune-Front-1729837369.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837371/crusader/variants/AS-000634-AR4001-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Dune-Front-1729837369.jpg",
  "coffee-real-castlery-vento-coffee-table-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1770256447/crusader/variants/44250004/Vento-Coffee-Table-120cm-Front_1-1770256444.jpg",
};

function uniqueNonEmptyImageUrls(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const url = String(value ?? "").trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }

  return result;
}

export type CatalogTopCategory =
  | "bed"
  | "sofa"
  | "accent_chair"
  | "coffee_table"
  | "dining_table"
  | "dining_bench"
  | "ottoman"
  | "rug"
  | "tv_console"
  | "sideboard"
  | "floor_lamp"
  | "table_lamp"
  | "ceiling_light"
  | "side_table"
  | "decor";

export type CatalogFilterState = {
  category?: string[];
  brandIds?: string[];
  priceMin?: number;
  priceMax?: number;
  colorFamilies?: string[];
  materialFamilies?: string[];
  styleTags?: string[];
  roomTags?: string[];
  sofaSeatCapacityBuckets?: SofaSeatCapacityBucket[];
  widthMinCm?: number;
  widthMaxCm?: number;
  smallRoomFriendly?: boolean;
  starterEligible?: boolean;
  aiPlacementEligible?: boolean;
};

export type SofaSeatCapacityBucket = "2" | "3" | "4_plus";

export type CatalogCardView = {
  id: string;
  variantId: string;
  variantLabel: string;
  title: string;
  brand: string | null;
  category: string;
  thumbUrl: string | null;
  fallbackThumbUrl: string | null;
  priceLabel?: string;
  dimsLabel: string;
  dimsMm: { w: number; d: number; h: number };
  primarySwatches: { label: string; hex?: string }[];
  badges: string[];
  imageClassName: string;
  configurationCount?: number;
};

export type CatalogDetailView = {
  id: string;
  variantId: string;
  variantLabel: string;
  title: string;
  brand: string | null;
  category: string;
  images: string[];
  dimsMm: { w: number; d: number; h: number };
  priceLabel?: string;
  finishOptions: {
    id: string;
    productId?: string;
    variantId?: string;
    label: string;
    swatchHex?: string;
    swatchTextureUrl?: string;
    materialType: "Fabric" | "Leather" | "Wood";
    collectionType?: string;
    finishCode?: string;
  }[];
  sizeOptions: {
    id: string;
    label: string;
    dimsMm: { w: number; d: number; h: number };
    variantIds: string[];
  }[];
  activeSizeId: string;
  materialSummary: string[];
  comfortProfile: CatalogComfortAxisView[];
  badges: string[];
  roomFitHints: string[];
  relatedItemIds: string[];
  retailerUrl?: string;
  purchaseOptions: CatalogPurchaseOption[];
  galleryImageClassName: string;
  galleryPresentationMode: CatalogMediaPresentationMode;
};

export type CatalogComfortAxisView = {
  id: string;
  label: string;
  value: number;
  minLabel: string;
  maxLabel: string;
};

export const TOP_CATEGORY_ORDER: CatalogTopCategory[] = [
  "bed",
  "sofa",
  "accent_chair",
  "coffee_table",
  "side_table",
  "dining_table",
  "dining_bench",
  "ottoman",
  "rug",
  "tv_console",
  "sideboard",
  "floor_lamp",
  "table_lamp",
  "ceiling_light",
  "decor",
];

const CATEGORY_LABELS: Record<CatalogTopCategory, string> = {
  bed: "Bed",
  sofa: "Sofa",
  accent_chair: "Arm Chair",
  coffee_table: "Coffee Table",
  side_table: "Side Tables",
  dining_table: "Dining Table",
  dining_bench: "Dining Bench",
  ottoman: "Ottoman",
  rug: "Rug",
  tv_console: "TV Console",
  sideboard: "Sideboard",
  floor_lamp: "Floor Lamp",
  table_lamp: "Table Lamp",
  ceiling_light: "Ceiling Lights",
  decor: "Decor",
};

const CATEGORY_ALIAS: Record<string, CatalogTopCategory> = {
  bed: "bed",
  storage_bed: "bed",
  sofa: "sofa",
  sectional_sofa: "sofa",
  ottoman: "ottoman",
  accent_chair: "accent_chair",
  coffee_table: "coffee_table",
  dining_table: "dining_table",
  rug: "rug",
  tv_console: "tv_console",
  sideboard: "sideboard",
  floor_lamp: "floor_lamp",
  table_lamp: "table_lamp",
  pendant_light: "ceiling_light",
  ceiling_light: "ceiling_light",
  side_table: "side_table",
  dining_bench: "dining_bench",
  bookshelf: "decor",
  wall_art: "decor",
  storage: "decor",
  shelving: "decor",
  accessory: "decor",
  other: "decor",
};

function titleCase(value: string): string {
  return value
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

function inferColorFamily(label: string): string {
  const lower = label.toLowerCase();
  if (/(black|charcoal|graphite)/.test(lower)) return "black";
  if (/(white|ivory|cream|oat|sand|beige)/.test(lower)) return "neutral";
  if (/(brown|walnut|oak|wood|tan)/.test(lower)) return "brown";
  if (/(green|sage|olive|forest)/.test(lower)) return "green";
  if (/(blue|navy|teal)/.test(lower)) return "blue";
  if (/(red|rust|terracotta|burgundy)/.test(lower)) return "red";
  if (/(pink|rose)/.test(lower)) return "pink";
  if (/(yellow|gold|mustard)/.test(lower)) return "yellow";
  return "other";
}

function normalizeSwatchLookupKey(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveCastlerySwatchTextureUrl(variant: CatalogItemSchema["variants"][number]): string | undefined {
  const candidates = [
    variant.swatchTextureUrl,
    variant.finishCode,
    variant.finishLabel,
    variant.label,
    variant.id,
  ];

  for (const candidate of candidates) {
    const raw = String(candidate ?? "").trim();
    if (!raw) continue;

    const normalized = normalizeSwatchLookupKey(raw);
    const underscored = normalized.replace(/-/g, "_");
    const commaLabel = raw.toLowerCase();

    const direct =
      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[raw] ??
      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[raw.toLowerCase()] ??
      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[normalized] ??
      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[underscored] ??
      CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[commaLabel];
    if (direct) return direct;

    for (const key of [normalized, underscored]) {
      if (key.includes("bisque")) return CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["bisque_fabric"];
      if (key.includes("stone")) return CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["stone_fabric"];
      if (key.includes("camille") && key.includes("forest")) {
        return CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["camille_forest_fabric"];
      }
      if (key.includes("caramel") && key.includes("leather")) {
        return CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE["caramel_leather"];
      }
    }
  }

  return undefined;
}

export function getPriceLabel(item: CatalogItemSchema, variantId?: string): string {
  const resolved = resolveCatalogVariant(item, variantId);
  if (resolved.commerce.type === "shopify") {
    return "Buy on this site";
  }
  if (resolved.commerce.type === "affiliate") {
    const amount = resolved.commerce.priceHint;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return `SGD ${amount.toLocaleString()}`;
    }
    return "External retailer";
  }
  return "External retailer";
}

function getPriceNumber(item: CatalogItemSchema, variantId?: string): number | null {
  const resolved = resolveCatalogVariant(item, variantId);
  if (resolved.commerce.type === "affiliate") {
    return resolved.commerce.priceHint ?? null;
  }
  return null;
}

export function getPrimarySwatches(item: CatalogItemSchema) {
  return item.variants.slice(0, 2).map((variant) => ({
    label: variant.label,
    hex: variant.colorHex,
  }));
}

export function getWidthBand(item: CatalogItemSchema): "small" | "medium" | "large" {
  const width = item.dimsMm.w;
  if (width < 1200) return "small";
  if (width < 2200) return "medium";
  return "large";
}

function inferTopCategoryFromItem(item: Pick<CatalogItemSchema, "title" | "metadata" | "tags">): CatalogTopCategory | null {
  const tokens = [
    item.title,
    item.metadata?.modelLabel,
    item.metadata?.productFamily,
    item.metadata?.productName,
    ...(item.tags ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  // Keep secondary furniture out of Decor when catalog source category is generic.
  if (/\b(bed|bedframe|headboard)\b|tufted\s*bed|storage\s*bed/.test(tokens)) {
    return "bed";
  }

  if (/(ottoman|footstool)/.test(tokens)) {
    return "ottoman";
  }

  if (/(dining\s*bench|\bbench\b)/.test(tokens)) {
    return "dining_bench";
  }

  if (/(table\s*lamp|desk\s*lamp|bedside\s*lamp)/.test(tokens)) {
    return "table_lamp";
  }

  if (/(pendant\s*light|ceiling\s*light|chandelier)/.test(tokens)) {
    return "ceiling_light";
  }

  if (/(nightstand|bedside|side\s*table|end\s*table|nesting\s*table|c\s*table)/.test(tokens)) {
    return "side_table";
  }

  if (/(sideboard|buffet|credenza)/.test(tokens)) {
    return "sideboard";
  }

  return null;
}

function getHuggPerformancePrefix(itemId: string): string | null {
  const match = itemId.match(/^(coffee-real-castlery-hugg-nesting-(?:square|rectangular|side-table)-performance-)/);
  return match?.[1] ?? null;
}

const COMFORT_AXIS_ORDER: Array<{
  id: "seat_comfort" | "seat_depth" | "seat_height" | "seat_softness";
  label: string;
  minLabel: string;
  maxLabel: string;
}> = [
  { id: "seat_comfort", label: "Seat comfort", minLabel: "Relaxed", maxLabel: "Upright" },
  { id: "seat_depth", label: "Seat depth", minLabel: "Shallow", maxLabel: "Deep" },
  { id: "seat_height", label: "Seat height", minLabel: "Low", maxLabel: "High" },
  { id: "seat_softness", label: "Seat softness", minLabel: "Soft", maxLabel: "Firm" },
];

function buildComfortProfileView(item: CatalogItemSchema): CatalogComfortAxisView[] {
  const rawProfile = item.metadata?.comfortProfile;
  if (!rawProfile || typeof rawProfile !== "object") return [];

  return COMFORT_AXIS_ORDER.flatMap((axis) => {
    const entry = rawProfile[axis.id];
    if (!entry || typeof entry !== "object") return [];

    const value = Math.round(Number(entry.value ?? 0));
    if (!Number.isFinite(value) || value < 1 || value > 5) return [];

    return [{
      id: axis.id,
      label: String(entry.label ?? axis.label).trim() || axis.label,
      value,
      minLabel: String(entry.min_label ?? axis.minLabel).trim() || axis.minLabel,
      maxLabel: String(entry.max_label ?? axis.maxLabel).trim() || axis.maxLabel,
    }];
  });
}

export function mapToTopCategory(
  category: string,
  item?: Pick<CatalogItemSchema, "title" | "metadata" | "tags">,
): CatalogTopCategory {
  const normalized = CATEGORY_ALIAS[category];
  if (normalized) return normalized;

  if (item) {
    const inferred = inferTopCategoryFromItem(item);
    if (inferred) return inferred;
  }

  return "decor";
}

export function getTopCategoryLabel(category: CatalogTopCategory): string {
  return CATEGORY_LABELS[category];
}

export function deriveSeatCount(item: CatalogItemSchema): number | null {
  const metadataSeatCapacity = Number(item.metadata?.seatCapacity);
  if (Number.isInteger(metadataSeatCapacity) && metadataSeatCapacity > 0) {
    return metadataSeatCapacity;
  }

  const match = item.title.match(/(\d+(?:\.\d+)?)\s*(seater|seat)/i);
  if (match) {
    const titleSeatCapacity = Number(match[1]);
    if (Number.isInteger(titleSeatCapacity) && titleSeatCapacity > 0) {
      return titleSeatCapacity;
    }
  }

  if (mapToTopCategory(item.category, item) === "sofa") {
    const width = item.dimsMm.w;
    if (!Number.isFinite(width) || width <= 0) return null;
    if (width >= 2400) return 4;
    if (width >= 1900) return 3;
    if (width >= 1300) return 2;
    return 1;
  }
  return null;
}

export function getSofaSeatCapacityBucket(
  seatCapacity: number | null,
): SofaSeatCapacityBucket | null {
  if (seatCapacity === 2) return "2";
  if (seatCapacity === 3) return "3";
  if (typeof seatCapacity === "number" && seatCapacity >= 4) return "4_plus";
  return null;
}

export function matchesSofaSeatCapacityBuckets(
  seatCapacity: number | null,
  buckets: readonly SofaSeatCapacityBucket[],
): boolean {
  const bucket = getSofaSeatCapacityBucket(seatCapacity);
  return bucket !== null && buckets.includes(bucket);
}

export function deriveBadges(item: CatalogItemSchema): string[] {
  const badges: string[] = [];
  const widthBand = getWidthBand(item);
  const topCategory = mapToTopCategory(item.category, item);
  const wallFriendly = item.placementRules.wallSnappable || item.placementRules.minWallGapMm <= 50;
  const starterEligible =
    topCategory === "sofa" || topCategory === "coffee_table" || topCategory === "rug";
  const aiRecommended = (item.aiRoles?.length ?? 0) > 0;

  badges.push("Curated");
  if (widthBand === "small" || item.roomTags.includes("small_space")) badges.push("Small-room friendly");
  if (starterEligible) badges.push("Starter-friendly");
  if (aiRecommended) badges.push("AI Recommended");
  if (wallFriendly) badges.push("Works Against Wall");
  if (item.styleTags.includes("luxe")) badges.push("Premium Finish");

  return badges.slice(0, 3);
}

export function deriveRoomFitHints(item: CatalogItemSchema): string[] {
  const hints: string[] = [];
  const widthBand = getWidthBand(item);

  if (widthBand === "small") hints.push("Good for compact rooms");
  if (widthBand === "large") hints.push("Better in larger layouts");
  if (item.placementRules.wallSnappable) hints.push("Best placed against a wall");
  if ((item.aiRoles ?? []).some((role) => role.includes("seating"))) {
    hints.push("Works well in seating zones");
  }
  if (item.clearanceRules.walkwayMinMm >= 800) hints.push("Requires medium clearance");

  return hints.slice(0, 4);
}

function getFinishChipLabel(variant: CatalogItemSchema["variants"][number]): string {
  const normalizeLookupCode = (value: string): string =>
    normalizeVariantCode(value).replace(/-/g, "_");
  const code = (variant.finishCode ?? variant.id ?? "").trim().toLowerCase();
  const normalizedCode = normalizeLookupCode(code);
  const rawCandidates = [variant.finishLabel, variant.label]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  const explicitByCode: Record<string, string> = {
    beach_linen: "Cream (Beach Linen)",
    navagio_beach_linen: "Beach Linen",
    navagio_seagull: "Medium Grey (Seagull)",
    performance_creamy_white: "Creamy White",
    twill_performance_creamy_white: "Creamy White (Performance Twill)",
    indigo_blue: "Indigo Blue",
    marcel_brilliant_white: "Cream (Brilliant White)",
    peyton_ivory: "Ivory (Cream)",
    peyton_dove_grey: "Medium Grey (Dove Grey)",
    marcel_smoke_grey: "Smoke Grey",
    peyton_moss: "Moss (Peyton Fleece)",
    peyton_cumin: "Caramel (Cumin)",
    infinity_boucle_ginger: "Rust (Ginger)",
    infinity_boucle_white_quartz: "Light Grey (White Quartz)",
    performance_boucle_cream: "Cream (Infinity Boucle)",
    performance_infinity_boucle_moss: "Moss (Infinity Boucle)",
    performance_twill_pearl_beige: "Pearl Beige (Performance Twill)",
    performance_twill_slate: "Slate (Performance Twill)",
    performance_twill_moss: "Moss (Performance Twill)",
    performance_twill_dove_grey: "Medium Grey (Performance Twill)",
    performance_genova_oat: "Sand (Oat, Genova)",
    performance_linen_weave_cream: "Cream (Genova)",
    performance_linen_weave_light_grey: "Light Grey (Genova)",
    greta_ivory: "Cream (Washed Chenille)",
    washed_chenille_sand: "Sand (Washed Chenille)",
    greta_mustard_brown: "Caramel (Washed Chenille)",
    greta_moss: "Moss (Washed Chenille)",
    bisque_fabric: "Bisque",
    camille_forest_fabric: "Camille, Forest",
    cocoa_leather: "Cocoa",
    caramel_leather: "Caramel",
    top_grain_leather_caramel: "Caramel",
    "top-grain-leather-caramel": "Caramel",
    warm_taupe_leather: "Warm Taupe",
    marche_cocoa: "Marche, Cocoa",
    marche_ivory: "Marche, Ivory",
    marche_ivory_leather: "Marche Ivory",
    marche_graphite_leather: "Marche Graphite",
    marche_cocoa_leather: "Marche Cocoa",
  };

  const explicitCodeMatch = Object.keys(explicitByCode)
    .sort((a, b) => b.length - a.length)
    .find((key) => {
      const normalizedKey = normalizeLookupCode(key);
      return (
        normalizedCode === normalizedKey ||
        normalizedCode.endsWith(`_${normalizedKey}`) ||
        normalizedCode.includes(normalizedKey)
      );
    });
  if (explicitCodeMatch) {
    return explicitByCode[explicitCodeMatch];
  }

  for (const raw of rawCandidates) {
    // Prefer the color-specific suffix (after comma) when available.
    if (raw.includes(",")) {
      const commaIndex = raw.indexOf(",");
      const prefix = raw.slice(0, commaIndex).trim().toLowerCase();
      const suffix = raw.slice(commaIndex + 1).trim().replace(/\s*\(leather\)\s*$/i, "").trim();
      if (!suffix) continue;

      // Clarify duplicate consumer-facing color names when multiple fabric families exist.
      if (prefix.includes("performance fleece (peyton)") && /^moss$/i.test(suffix)) {
        return "Moss (Peyton Fleece)";
      }
      if (prefix.includes("performance twill")) {
        return `${suffix} (Performance Twill)`;
      }
      if (prefix.includes("performance linen weave (genova)")) {
        return `${suffix} (Genova)`;
      }
      if (prefix.includes("washed chenille")) {
        return `${suffix} (Washed Chenille)`;
      }
      if (prefix.includes("performance infinity boucle") && /^(moss|cream)$/i.test(suffix)) {
        return `${suffix} (Infinity Boucle)`;
      }

      return suffix;
    }
  }

  for (const raw of rawCandidates) {
    // If the value is already concise, keep it.
    const cleaned = raw.replace(/\s*\(leather\)\s*$/i, "").trim();
    if (!/(performance|peyton|marcel|infinity|boucle|navagio)/i.test(cleaned)) {
      return cleaned;
    }
  }

  const fallbackFromCode = code
    .replace(/_leather$/i, "")
    .replace(/^(performance_|peyton_|marcel_|infinity_boucle_|navagio_|marche_)/i, "")
    .replace(/_/g, " ")
    .trim();

  if (fallbackFromCode) return titleCase(fallbackFromCode);

  return rawCandidates[0] ?? "";
}

export function buildCatalogCardView(item: CatalogItemSchema, variantId?: string): CatalogCardView {
  const resolved = resolveCatalogVariant(item, variantId);
  const topCategory = mapToTopCategory(item.category, item);
  const forcedThumb = FORCED_CARD_THUMB_BY_ITEM_ID[item.id] ?? null;
  const primaryThumb = String(forcedThumb ?? resolved.media.thumbUrl ?? "").trim();
  const fallbackGalleryThumb = resolved.media.galleryImages.find((url) => {
    const value = String(url ?? "").trim();
    return value.length > 0 && value !== primaryThumb;
  }) ?? null;
  const preferFallbackForLegacyLocalThumb = !forcedThumb && /^\/assets\/thumbs\//i.test(primaryThumb);
  const categoryFallbackThumb = CATEGORY_FALLBACK_THUMB_URL[topCategory] ?? null;
  const cardThumbUrl =
    forcedThumb ||
    (preferFallbackForLegacyLocalThumb ? fallbackGalleryThumb : primaryThumb) ||
    fallbackGalleryThumb ||
    categoryFallbackThumb ||
    primaryThumb ||
    null;

  return {
    id: item.id,
    variantId: resolved.variantId,
    variantLabel: resolved.variant.label,
    title: item.title,
    brand: item.metadata?.brand ?? null,
    category: getTopCategoryLabel(topCategory),
    thumbUrl: cardThumbUrl,
    fallbackThumbUrl: categoryFallbackThumb,
    priceLabel: getPriceLabel(item, resolved.variantId),
    dimsLabel: `${(resolved.dimsMm.w / 10).toFixed(1).replace(/\.0$/, "")} x ${(resolved.dimsMm.d / 10)
      .toFixed(1)
      .replace(/\.0$/, "")} cm`,
    dimsMm: { ...resolved.dimsMm },
    primarySwatches: getPrimarySwatches(item),
    badges: deriveBadges(item),
    imageClassName: getCatalogMediaImageClass("catalog_card"),
  };
}

export function buildCatalogDetailView(item: CatalogItemSchema, variantId?: string): CatalogDetailView {
  const resolved = resolveCatalogVariant(item, variantId);
  const forcedThumb = FORCED_CARD_THUMB_BY_ITEM_ID[item.id] ?? null;
  const itemGalleryImages = Array.isArray(item.metadata?.galleryImages)
    ? item.metadata.galleryImages
    : [];
  const hasCompleteVariantGallery =
    resolved.media.fallbackSource === "variant_specific" &&
    resolved.media.galleryImages.length >=
      CATALOG_MEDIA_PRESENTATION_PRESETS.catalog_detail_gallery.minGalleryImages;
  const images = uniqueNonEmptyImageUrls([
    forcedThumb,
    ...resolved.media.galleryImages,
    resolved.media.thumbUrl,
    ...(hasCompleteVariantGallery ? [] : itemGalleryImages),
    ...(hasCompleteVariantGallery ? [] : [item.assets.thumbUrl]),
  ]);
  const activeDimsKey = `${Math.round(resolved.dimsMm.w)}x${Math.round(resolved.dimsMm.d)}x${Math.round(resolved.dimsMm.h)}`;
  const materials = [
    titleCase(item.assets.materialsProfile?.preset ?? "standard finish"),
    ...item.styleTags.map(titleCase),
  ];
  const finishOptions = hardenDuplicateFinishOptionLabels(Array.from(
    item.variants
      .reduce((map, variant) => {
        const normalizedCode = normalizeVariantCode((variant.finishCode ?? variant.id).trim());
        const normalizedGroup = (variant.swatchGroup ?? "finish").trim().toLowerCase();
        const materialTokens = [
          variant.finishLabel,
          variant.label,
          variant.finishCode,
          variant.swatchGroup,
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ");
        const isWoodGroup = normalizedGroup.includes("wood");
        const materialType: "Fabric" | "Leather" | "Wood" = isWoodGroup
          ? "Wood"
          : variant.materialType ??
            inferMaterialTypeFromText(
              materialTokens,
              variant.finishLabel,
              variant.label,
              variant.finishCode,
              variant.swatchGroup
        );
        const key = `${normalizedGroup}:${normalizedCode}`;
        const variantDims = variant.dimensionsMm ?? item.dimsMm;
        const variantDimsKey = `${Math.round(variantDims.w)}x${Math.round(variantDims.d)}x${Math.round(variantDims.h)}`;
        const shouldUseVariantForFinish = !map.has(key) || variantDimsKey === activeDimsKey;
        if (shouldUseVariantForFinish) {
          const fCode = (variant.finishCode ?? "").trim().toLowerCase();
          const fLabel = (variant.finishLabel ?? variant.label ?? "").trim().toLowerCase();
          const variantSwatchTextureUrl = resolveCastlerySwatchTextureUrl(variant);
          const swatchTextureUrl = isWoodGroup
            ? (variantSwatchTextureUrl ??
               HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[fCode] ??
               HUGG_WOOD_SWATCH_IMAGE_BY_FINISH_CODE[fLabel] ??
               CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[fCode] ??
               CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[fLabel] ??
               undefined)
            : (variantSwatchTextureUrl ??
               CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[fCode] ??
               CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[fLabel] ??
               undefined);
          map.set(key, {
            id: variant.id,
            productId: item.id,
            variantId: variant.id,
            label: getFinishChipLabel(variant),
            swatchHex: variant.swatchHex ?? variant.colorHex,
            swatchTextureUrl,
            materialType,
            collectionType: variant.collectionType,
            finishCode: variant.finishCode,
            qualifier: deriveVariantDisambiguator(variant),
          });
        }
        return map;
      }, new Map<string, { id: string; productId?: string; variantId?: string; label: string; swatchHex?: string; swatchTextureUrl?: string; materialType: "Fabric" | "Leather" | "Wood"; collectionType?: string; finishCode?: string; qualifier: string }>())
      .values()
  ));

  // For Hugg products: inject sibling fabric options (Performance Dune / Performance Basalt)
  // from peer catalog items so the Fabric colour section appears in the detail view.
  const huggPrefix = getHuggPerformancePrefix(item.id);
  if (huggPrefix) {
    const activeSuffix = item.id.endsWith("-opened")
      ? "-opened"
      : item.id.endsWith("-closed")
        ? "-closed"
        : "";
    const activeVariant = item.variants.find((v) => v.id === (variantId ?? item.defaultVariantId)) ?? item.variants[0];
    const activeWoodCode = (activeVariant?.finishCode ?? "").trim().toLowerCase();
    const FABRIC_ENTRIES: Array<{ code: "dune" | "basalt"; label: string; hex: string }> = [
      { code: "dune",   label: "Performance Dune",   hex: "#ede8de" },
      { code: "basalt", label: "Performance Basalt", hex: "#8a8f96" },
    ];
    for (const fab of FABRIC_ENTRIES) {
      const preferredSiblingId = `${huggPrefix}${fab.code}${activeSuffix}`;
      const siblingId = CATALOG_ITEMS[preferredSiblingId]
        ? preferredSiblingId
        : Object.keys(CATALOG_ITEMS).find((id) => id.startsWith(huggPrefix) && id.includes(fab.code)) ?? preferredSiblingId;
      const sibling = CATALOG_ITEMS[siblingId];
      const siblingVariant = sibling?.variants.find((v) => {
        const vc = (v.finishCode ?? "").trim().toLowerCase();
        return activeWoodCode ? vc === activeWoodCode : true;
      }) ?? sibling?.variants[0];
      const alreadyPresent = finishOptions.some(
        (o) => o.label.toLowerCase() === fab.label.toLowerCase()
      );
      if (!alreadyPresent) {
        const fabricKey = `performance-${fab.code}`;
        const siblingVariantId = siblingVariant?.id ?? "fallback";
        finishOptions.unshift({
          id: `${siblingId}::${siblingVariantId}::fabric::${fab.code}`,
          productId: siblingId,
          variantId: siblingVariant?.id,
          label: fab.label,
          swatchHex: fab.hex,
          swatchTextureUrl: CASTLERY_SWATCH_IMAGE_BY_FINISH_CODE[fabricKey] ?? undefined,
          materialType: "Fabric",
          collectionType: "stocked",
          finishCode: fabricKey,
        });
      }
    }
  }

  const sizeOptions = Array.from(
    item.variants.reduce(
      (
        map,
        variant,
      ) => {
        const dims = variant.dimensionsMm ?? item.dimsMm;
        const widthMm = Number(dims?.w ?? 0);
        const depthMm = Number(dims?.d ?? 0);
        const heightMm = Number(dims?.h ?? 0);
        const hasValidDims = widthMm > 0 && depthMm > 0;
        const normalizedDims = hasValidDims
          ? {
              w: Math.round(widthMm),
              d: Math.round(depthMm),
              h: Math.round(heightMm > 0 ? heightMm : item.dimsMm.h),
            }
          : { ...item.dimsMm };
        const authoredSizeLabel = String(variant.sizeLabel ?? "").trim();
        const label = authoredSizeLabel || `${Math.round(normalizedDims.w / 10)} x ${Math.round(normalizedDims.d / 10)} cm`;
        // Merge variants whose authored dimensions differ only by tiny material/PDP
        // rounding differences. The drawer cannot present two identical labels as
        // separate real sizes.
        const key = authoredSizeLabel ? authoredSizeLabel.toLowerCase() : label.toLowerCase();
        const existing = map.get(key);
        if (existing) {
          existing.variantIds.push(variant.id);
          return map;
        }

        map.set(key, {
          id: key,
          label,
          dimsMm: normalizedDims,
          variantIds: [variant.id],
        });
        return map;
      },
      new Map<
        string,
        {
          id: string;
          label: string;
          dimsMm: { w: number; d: number; h: number };
          variantIds: string[];
        }
      >(),
    ).values(),
  ).sort((a, b) => a.dimsMm.w * a.dimsMm.d - b.dimsMm.w * b.dimsMm.d);

  const activeSizeId =
    String(resolved.variant.sizeLabel ?? "").trim().toLowerCase() ||
    `${Math.round(resolved.dimsMm.w / 10)} x ${Math.round(resolved.dimsMm.d / 10)} cm`.toLowerCase();
  const baseGalleryImageClassName = getCatalogMediaImageClass("catalog_detail_gallery");
  const galleryImageClassName = item.category.toLowerCase().includes("ottoman")
    ? `${baseGalleryImageClassName} scale-[1.45] object-[50%_56%]`
    : baseGalleryImageClassName;
  const galleryPresentationMode =
    resolved.variant.mediaPresentationMode ??
    item.metadata?.mediaPresentationMode ??
    inferCatalogMediaPresentationMode({
      imageUrls: images,
      brand: item.metadata?.brand,
      category: item.category,
    });

  return {
    id: item.id,
    variantId: resolved.variantId,
    variantLabel: resolved.variant.label,
    title: item.title,
    brand: item.metadata?.brand ?? null,
    category: getTopCategoryLabel(mapToTopCategory(item.category, item)),
    images,
    dimsMm: { ...resolved.dimsMm },
    priceLabel: getPriceLabel(item, resolved.variantId),
    finishOptions,
    sizeOptions,
    activeSizeId,
    materialSummary: Array.from(new Set(materials)),
    comfortProfile: buildComfortProfileView(item),
    badges: deriveBadges(item),
    roomFitHints: deriveRoomFitHints(item),
    relatedItemIds: [],
    retailerUrl: resolved.commerce.type === "affiliate" ? resolved.commerce.url ?? undefined : undefined,
    purchaseOptions: resolved.variant.purchaseOptions ?? [],
    galleryImageClassName,
    galleryPresentationMode,
  };
}

export function filterCatalogItems(
  items: CatalogItemSchema[],
  searchQuery: string,
  filters: CatalogFilterState,
): CatalogItemSchema[] {
  const search = searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    const topCategory = mapToTopCategory(item.category, item);
    const brand = item.metadata?.brand?.toLowerCase() ?? "";
    const materials = [item.assets.materialsProfile?.preset ?? "", ...(item.tags ?? [])]
      .join(" ")
      .toLowerCase();
    const finishes = item.variants.map((v) => v.label.toLowerCase()).join(" ");
    const colorFamilies = Array.from(new Set(item.variants.map((v) => inferColorFamily(v.label))));
    const seatCount = deriveSeatCount(item);
    const priceNumber = getPriceNumber(item);
    const badges = deriveBadges(item).map((x) => x.toLowerCase());
    const widthCm = item.dimsMm.w / 10;

    const searchable = [
      item.title,
      brand,
      item.category,
      item.styleTags.join(" "),
      finishes,
      materials,
      seatCount ? String(seatCount) : "",
      item.id,
    ]
      .join(" ")
      .toLowerCase();

    if (search && !searchable.includes(search)) return false;

    if (filters.category?.length && !filters.category.includes(topCategory)) return false;
    if (filters.brandIds?.length && !filters.brandIds.includes(item.metadata?.brand ?? "")) return false;
    if (typeof filters.priceMin === "number" && (priceNumber ?? 0) < filters.priceMin) return false;
    if (typeof filters.priceMax === "number" && (priceNumber ?? 999999) > filters.priceMax) return false;
    if (filters.colorFamilies?.length && !filters.colorFamilies.some((family) => colorFamilies.includes(family))) {
      return false;
    }
    if (filters.materialFamilies?.length) {
      const materialTokens = [
        item.assets.materialsProfile?.preset ?? "",
        ...(item.tags ?? []),
      ].join(" ").toLowerCase();
      if (!filters.materialFamilies.some((family) => materialTokens.includes(family.toLowerCase()))) {
        return false;
      }
    }
    if (
      filters.styleTags?.length &&
      !filters.styleTags.some((tag) => item.styleTags.includes(tag as (typeof item.styleTags)[number]))
    ) {
      return false;
    }
    if (
      filters.roomTags?.length &&
      !filters.roomTags.some((tag) => item.roomTags.includes(tag as (typeof item.roomTags)[number]))
    ) {
      return false;
    }
    if (filters.sofaSeatCapacityBuckets?.length) {
      if (
        topCategory !== "sofa" ||
        !matchesSofaSeatCapacityBuckets(seatCount, filters.sofaSeatCapacityBuckets)
      ) {
        return false;
      }
    }
    if (
      typeof filters.widthMinCm === "number" &&
      Number.isFinite(filters.widthMinCm) &&
      widthCm < filters.widthMinCm
    ) {
      return false;
    }
    if (
      typeof filters.widthMaxCm === "number" &&
      Number.isFinite(filters.widthMaxCm) &&
      widthCm > filters.widthMaxCm
    ) {
      return false;
    }
    if (filters.smallRoomFriendly && !badges.includes("small-room friendly")) return false;
    if (filters.starterEligible && !badges.includes("starter-friendly")) return false;
    if (filters.aiPlacementEligible && !badges.includes("ai recommended")) return false;

    return true;
  });
}

export function collectFilterFacets(items: CatalogItemSchema[]) {
  const brands = Array.from(new Set(items.map((item) => item.metadata?.brand).filter(Boolean) as string[]));
  const styles = Array.from(new Set(items.flatMap((item) => item.styleTags)));
  const materials = Array.from(new Set(items.map((item) => item.assets.materialsProfile?.preset).filter(Boolean) as string[]));
  return {
    brands: brands.sort((a, b) => a.localeCompare(b)),
    styles: styles.sort((a, b) => a.localeCompare(b)),
    materials: materials.sort((a, b) => a.localeCompare(b)),
  };
}
