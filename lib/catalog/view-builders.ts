import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { getCatalogMediaImageClass } from "@/lib/catalog/media-policy";
import {
  deriveVariantDisambiguator,
  hardenDuplicateFinishOptionLabels,
  inferMaterialTypeFromText,
  normalizeVariantCode,
} from "@/lib/catalog/variant-normalization";

export type CatalogTopCategory =
  | "sofa"
  | "accent_chair"
  | "coffee_table"
  | "dining_table"
  | "ottoman"
  | "rug"
  | "tv_console"
  | "sideboard"
  | "floor_lamp"
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
  seatCounts?: number[];
  widthBand?: "small" | "medium" | "large";
  smallRoomFriendly?: boolean;
  starterEligible?: boolean;
  curatedOnly?: boolean;
  aiPlacementEligible?: boolean;
  wallFriendly?: boolean;
};

export type CatalogCardView = {
  id: string;
  variantId: string;
  variantLabel: string;
  title: string;
  brand: string | null;
  category: string;
  thumbUrl: string | null;
  priceLabel?: string;
  dimsLabel: string;
  primarySwatches: { label: string; hex?: string }[];
  badges: string[];
  imageClassName: string;
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
    label: string;
    swatchHex?: string;
    materialType: "Fabric" | "Leather";
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
  badges: string[];
  roomFitHints: string[];
  relatedItemIds: string[];
  retailerUrl?: string;
  galleryImageClassName: string;
};

export const TOP_CATEGORY_ORDER: CatalogTopCategory[] = [
  "sofa",
  "accent_chair",
  "coffee_table",
  "dining_table",
  "ottoman",
  "rug",
  "tv_console",
  "sideboard",
  "floor_lamp",
  "side_table",
  "decor",
];

const CATEGORY_LABELS: Record<CatalogTopCategory, string> = {
  sofa: "Sofa",
  accent_chair: "Accent Chair",
  coffee_table: "Coffee Table",
  dining_table: "Dining Table",
  ottoman: "Ottoman",
  rug: "Rug",
  tv_console: "TV Console",
  sideboard: "Sideboard",
  floor_lamp: "Floor Lamp",
  side_table: "Side Table",
  decor: "Decor",
};

const CATEGORY_ALIAS: Record<string, CatalogTopCategory> = {
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
  side_table: "side_table",
  dining_bench: "side_table",
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
  if (/(ottoman|footstool)/.test(tokens)) {
    return "ottoman";
  }

  if (/(nightstand|bedside|side\s*table|end\s*table|nesting\s*table|c\s*table|bench)/.test(tokens)) {
    return "side_table";
  }

  if (/(sideboard|buffet|credenza)/.test(tokens)) {
    return "sideboard";
  }

  return null;
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
  const match = item.title.match(/(\d+)\s*(seater|seat)/i);
  if (match) return Number(match[1]);
  if (mapToTopCategory(item.category, item) === "sofa") {
    const width = item.dimsMm.w;
    if (width >= 2400) return 4;
    if (width >= 1900) return 3;
    if (width >= 1300) return 2;
    return 1;
  }
  return null;
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
    cocoa_leather: "Cocoa",
    caramel_leather: "Caramel",
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
  return {
    id: item.id,
    variantId: resolved.variantId,
    variantLabel: resolved.variant.label,
    title: item.title,
    brand: item.metadata?.brand ?? null,
    category: getTopCategoryLabel(mapToTopCategory(item.category, item)),
    thumbUrl: resolved.media.thumbUrl,
    priceLabel: getPriceLabel(item, resolved.variantId),
    dimsLabel: `${resolved.dimsMm.w} x ${resolved.dimsMm.d} mm`,
    primarySwatches: getPrimarySwatches(item),
    badges: deriveBadges(item),
    imageClassName: getCatalogMediaImageClass("catalog_card"),
  };
}

export function buildCatalogDetailView(item: CatalogItemSchema, variantId?: string): CatalogDetailView {
  const resolved = resolveCatalogVariant(item, variantId);
  const images = resolved.media.galleryImages;
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
        const materialType: "Fabric" | "Leather" =
          variant.materialType ??
          inferMaterialTypeFromText(
            materialTokens,
            variant.finishLabel,
            variant.label,
            variant.finishCode,
            variant.swatchGroup
          );
        const key = `${normalizedGroup}:${normalizedCode}`;
        if (!map.has(key)) {
          map.set(key, {
            id: variant.id,
            label: getFinishChipLabel(variant),
            swatchHex: variant.swatchHex ?? variant.colorHex,
            materialType,
            collectionType: variant.collectionType,
            finishCode: variant.finishCode,
            qualifier: deriveVariantDisambiguator(variant),
          });
        }
        return map;
      }, new Map<string, { id: string; label: string; swatchHex?: string; materialType: "Fabric" | "Leather"; collectionType?: string; finishCode?: string; qualifier: string }>())
      .values()
  ));

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
        const key = `${normalizedDims.w}x${normalizedDims.d}`;
        const existing = map.get(key);
        if (existing) {
          existing.variantIds.push(variant.id);
          return map;
        }

        map.set(key, {
          id: key,
          label: `${Math.round(normalizedDims.w / 10)} x ${Math.round(normalizedDims.d / 10)} cm`,
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

  const activeSizeId = `${resolved.dimsMm.w}x${resolved.dimsMm.d}`;
  const baseGalleryImageClassName = getCatalogMediaImageClass("catalog_detail_gallery");
  const galleryImageClassName = item.category.toLowerCase().includes("ottoman")
    ? `${baseGalleryImageClassName} scale-[1.45] object-[50%_56%]`
    : baseGalleryImageClassName;

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
    badges: deriveBadges(item),
    roomFitHints: deriveRoomFitHints(item),
    relatedItemIds: [],
    retailerUrl: resolved.commerce.type === "affiliate" ? resolved.commerce.url ?? undefined : undefined,
    galleryImageClassName,
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
    const widthBand = getWidthBand(item);

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
    if (filters.seatCounts?.length && seatCount && !filters.seatCounts.includes(seatCount)) return false;
    if (filters.widthBand && widthBand !== filters.widthBand) return false;
    if (filters.smallRoomFriendly && !badges.includes("small-room friendly")) return false;
    if (filters.starterEligible && !badges.includes("starter-friendly")) return false;
    if (filters.curatedOnly && !badges.includes("curated")) return false;
    if (filters.aiPlacementEligible && !badges.includes("ai recommended")) return false;
    if (filters.wallFriendly && !badges.includes("works against wall")) return false;

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
