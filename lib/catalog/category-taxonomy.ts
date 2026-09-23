import type { CatalogTopCategory } from "@/lib/catalog/view-builders";

export type CatalogMainGroupId =
  | "bedroom"
  | "seating"
  | "tables"
  | "storage"
  | "lighting"
  | "finishing";

export type CatalogMainGroup = {
  id: CatalogMainGroupId;
  label: string;
  allLabel: string;
  categories: CatalogTopCategory[];
};

export const CATALOG_MAIN_GROUPS: CatalogMainGroup[] = [
  { id: "bedroom", label: "Bedroom", allLabel: "All bedroom", categories: ["bed"] },
  {
    id: "seating",
    label: "Seating",
    allLabel: "All seating",
    categories: ["sofa", "accent_chair", "ottoman"],
  },
  {
    id: "tables",
    label: "Tables & dining",
    allLabel: "All tables & dining",
    categories: ["coffee_table", "side_table", "dining_table", "dining_bench"],
  },
  {
    id: "storage",
    label: "Storage & media",
    allLabel: "All storage & media",
    categories: ["tv_console", "sideboard"],
  },
  {
    id: "lighting",
    label: "Lighting",
    allLabel: "All lighting",
    categories: ["floor_lamp", "table_lamp", "ceiling_light"],
  },
  {
    id: "finishing",
    label: "Finishing touches",
    allLabel: "All finishing touches",
    categories: ["rug", "decor"],
  },
];

export function getCatalogMainGroup(groupId: CatalogMainGroupId) {
  return CATALOG_MAIN_GROUPS.find((group) => group.id === groupId);
}

export function getCatalogMainGroupForCategory(category: CatalogTopCategory) {
  return CATALOG_MAIN_GROUPS.find((group) => group.categories.includes(category));
}

export function getCatalogMainGroupCategories(groupId: CatalogMainGroupId) {
  return getCatalogMainGroup(groupId)?.categories ?? [];
}
