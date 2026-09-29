import {
  TOP_CATEGORY_ORDER,
  type CatalogTopCategory,
} from "@/lib/catalog/view-builders";

/**
 * Furnish's product chips (audit finding FU1): "Favourites (n)", "Recent" once something was
 * added, "All", then the categories that have products, the room's own first.
 */
export type CatalogCategoryChoice = CatalogTopCategory | "all";
export type CatalogMemoryScope = "all" | "favorites" | "recent";
export type CatalogChipId = CatalogCategoryChoice | Exclude<CatalogMemoryScope, "all">;

export type CatalogChip = {
  id: CatalogChipId;
  label: string;
  testId: string;
};

/** Chip names are plural, as the Furnish mockup writes them. */
export const CATALOG_CATEGORY_CHIP_LABELS: Readonly<Record<CatalogTopCategory, string>> = {
  bed: "Beds",
  sofa: "Sofas",
  accent_chair: "Armchairs",
  coffee_table: "Coffee tables",
  side_table: "Side tables",
  dining_table: "Dining tables",
  dining_bench: "Dining benches",
  ottoman: "Ottomans",
  rug: "Rugs",
  tv_console: "TV consoles",
  sideboard: "Sideboards",
  floor_lamp: "Floor lamps",
  table_lamp: "Table lamps",
  ceiling_light: "Ceiling lights",
  decor: "Decor",
};

const ROOM_CATEGORIES: Readonly<Record<string, readonly CatalogTopCategory[]>> = {
  living: ["sofa", "accent_chair", "coffee_table", "side_table", "rug", "tv_console", "floor_lamp", "table_lamp", "ceiling_light"],
  bedroom: ["bed", "side_table", "rug", "table_lamp", "floor_lamp", "ceiling_light", "accent_chair", "ottoman", "decor"],
  dining: ["dining_table", "dining_bench", "sideboard", "rug", "ceiling_light", "floor_lamp", "table_lamp"],
  kitchen: ["dining_table", "dining_bench", "sideboard", "ceiling_light", "decor"],
  toilet: ["decor"],
  custom: ["sofa", "coffee_table", "accent_chair", "rug", "ceiling_light"],
};

function roomCategoryKey(roomTypeLabel: string) {
  const label = roomTypeLabel.trim().toLowerCase();
  if (label.includes("bed")) return "bedroom";
  if (label.includes("dining")) return "dining";
  if (label.includes("kitchen")) return "kitchen";
  if (label.includes("toilet") || label.includes("bath")) return "toilet";
  if (label.includes("living")) return "living";
  return "custom";
}

/** The categories a room of this type usually needs, most important first. */
export function recommendedCatalogCategoriesForRoom(roomTypeLabel: string): CatalogTopCategory[] {
  return [...ROOM_CATEGORIES[roomCategoryKey(roomTypeLabel)]];
}

/** The room's categories first, then the rest in catalogue order; only those with products. */
export function orderCatalogCategories(
  counts: Partial<Record<CatalogTopCategory, number>>,
  recommended: readonly CatalogTopCategory[]
): CatalogTopCategory[] {
  return Array.from(new Set([...recommended, ...TOP_CATEGORY_ORDER])).filter(
    (category) => (counts[category] ?? 0) > 0
  );
}

export function catalogChipTestId(id: CatalogChipId) {
  return id === "favorites" || id === "recent" || id === "all"
    ? `catalog-memory-${id}`
    : `catalog-category-chip-${id}`;
}

export function buildCatalogChips({
  categories,
  favoritesCount,
  recentCount,
}: {
  categories: readonly CatalogTopCategory[];
  favoritesCount: number;
  recentCount: number;
}): CatalogChip[] {
  const chips: Array<Omit<CatalogChip, "testId">> = [{ id: "favorites", label: `Favourites (${favoritesCount})` }];
  if (recentCount > 0) chips.push({ id: "recent", label: "Recent" });
  chips.push({ id: "all", label: "All" });
  for (const category of categories) chips.push({ id: category, label: CATALOG_CATEGORY_CHIP_LABELS[category] });
  return chips.map((chip) => ({ ...chip, testId: catalogChipTestId(chip.id) }));
}

/** The chip that shows as pressed: a memory list, or else the category choice. */
export function selectedCatalogChip(scope: CatalogMemoryScope, category: CatalogCategoryChoice): CatalogChipId {
  return scope === "all" ? category : scope;
}

export function catalogResultsLabel(count: number) {
  return `${count} ${count === 1 ? "product" : "products"}`;
}

/** "All" lists products in chip order; within a category the catalogue's own order stays. */
export function sortByCategoryOrder<T>(
  entries: readonly T[],
  categoryOf: (entry: T) => CatalogTopCategory,
  order: readonly CatalogTopCategory[]
): T[] {
  const rank = new Map(order.map((category, index) => [category, index]));
  return entries
    .map((entry, index) => ({ entry, index, rank: rank.get(categoryOf(entry)) ?? order.length }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ entry }) => entry);
}
