import type { CatalogItemSchema } from "@/lib/catalog-schema";

export type CatalogTopCategory =
  | "sofa"
  | "accent_chair"
  | "coffee_table"
  | "rug"
  | "tv_console"
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
  title: string;
  brand: string | null;
  category: string;
  thumbUrl: string | null;
  priceLabel?: string;
  dimsLabel: string;
  primarySwatches: { label: string; hex?: string }[];
  badges: string[];
};

export type CatalogDetailView = {
  id: string;
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
  }[];
  materialSummary: string[];
  badges: string[];
  roomFitHints: string[];
  relatedItemIds: string[];
  retailerUrl?: string;
};

export const TOP_CATEGORY_ORDER: CatalogTopCategory[] = [
  "sofa",
  "accent_chair",
  "coffee_table",
  "rug",
  "tv_console",
  "floor_lamp",
  "side_table",
  "decor",
];

const CATEGORY_LABELS: Record<CatalogTopCategory, string> = {
  sofa: "Sofa",
  accent_chair: "Accent Chair",
  coffee_table: "Coffee Table",
  rug: "Rug",
  tv_console: "TV Console",
  floor_lamp: "Floor Lamp",
  side_table: "Side Table",
  decor: "Decor",
};

const CATEGORY_ALIAS: Record<string, CatalogTopCategory> = {
  sofa: "sofa",
  accent_chair: "accent_chair",
  coffee_table: "coffee_table",
  rug: "rug",
  tv_console: "tv_console",
  floor_lamp: "floor_lamp",
  side_table: "side_table",
  bookshelf: "decor",
  wall_art: "decor",
  storage: "decor",
  shelving: "decor",
  accessory: "decor",
  other: "decor",
  dining_table: "decor",
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

function getPriceNumber(item: CatalogItemSchema): number | null {
  if (item.commerce.type === "affiliate") {
    return item.commerce.data.priceHint ?? null;
  }
  return null;
}

export function getPriceLabel(item: CatalogItemSchema): string {
  if (item.commerce.type === "shopify") {
    return "Buy on this site";
  }
  if (item.commerce.type === "affiliate") {
    const amount = item.commerce.data.priceHint;
    if (typeof amount === "number" && Number.isFinite(amount)) {
      return `SGD ${amount.toLocaleString()}`;
    }
    return "External retailer";
  }
  return "External retailer";
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

export function mapToTopCategory(category: string): CatalogTopCategory {
  return CATEGORY_ALIAS[category] ?? "decor";
}

export function getTopCategoryLabel(category: CatalogTopCategory): string {
  return CATEGORY_LABELS[category];
}

export function deriveSeatCount(item: CatalogItemSchema): number | null {
  const match = item.title.match(/(\d+)\s*(seater|seat)/i);
  if (match) return Number(match[1]);
  if (item.category === "sofa") {
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
  const wallFriendly = item.placementRules.wallSnappable || item.placementRules.minWallGapMm <= 50;
  const starterEligible = item.category === "sofa" || item.category === "coffee_table" || item.category === "rug";
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

export function buildCatalogCardView(item: CatalogItemSchema): CatalogCardView {
  return {
    id: item.id,
    title: item.title,
    brand: item.metadata?.brand ?? null,
    category: getTopCategoryLabel(mapToTopCategory(item.category)),
    thumbUrl: item.assets.thumbUrl ?? null,
    priceLabel: getPriceLabel(item),
    dimsLabel: `${item.dimsMm.w} x ${item.dimsMm.d} mm`,
    primarySwatches: getPrimarySwatches(item),
    badges: deriveBadges(item),
  };
}

export function buildCatalogDetailView(item: CatalogItemSchema): CatalogDetailView {
  const images = [item.assets.thumbUrl].filter((value): value is string => Boolean(value));
  const materials = [
    titleCase(item.assets.materialsProfile?.preset ?? "standard finish"),
    ...item.styleTags.map(titleCase),
  ];

  return {
    id: item.id,
    title: item.title,
    brand: item.metadata?.brand ?? null,
    category: getTopCategoryLabel(mapToTopCategory(item.category)),
    images,
    dimsMm: { ...item.dimsMm },
    priceLabel: getPriceLabel(item),
    finishOptions: item.variants.map((variant) => ({
      id: variant.id,
      label: variant.label,
      swatchHex: variant.colorHex,
    })),
    materialSummary: Array.from(new Set(materials)),
    badges: deriveBadges(item),
    roomFitHints: deriveRoomFitHints(item),
    relatedItemIds: [],
    retailerUrl: item.commerce.type === "affiliate" ? item.commerce.data.url : undefined,
  };
}

export function filterCatalogItems(
  items: CatalogItemSchema[],
  searchQuery: string,
  filters: CatalogFilterState,
): CatalogItemSchema[] {
  const search = searchQuery.trim().toLowerCase();

  return items.filter((item) => {
    const topCategory = mapToTopCategory(item.category);
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
    if (filters.styleTags?.length && !filters.styleTags.some((tag) => item.styleTags.includes(tag as any))) {
      return false;
    }
    if (filters.roomTags?.length && !filters.roomTags.some((tag) => item.roomTags.includes(tag as any))) {
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
