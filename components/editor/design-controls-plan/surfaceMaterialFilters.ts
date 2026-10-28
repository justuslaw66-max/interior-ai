import { getSurfaceMaterialOutdoorSearchTerms } from "@/lib/surface-material-outdoor";
import type { SurfaceMaterialCatalogRecord } from "@/lib/surface-material-runtime";
import { SURFACE_MATERIAL_VOCABULARY } from "@/lib/surface-material-schema";

import {
  buildFacetOptions,
  getSurfaceColourFamilyLabel,
  getSurfaceMaterialCollectionLabel,
  getSurfaceMaterialColorLabel,
  getSurfaceMaterialEffectLabel,
  getSurfaceMaterialProductDisplayName,
  getSurfaceMaterialSizeLabel,
  getSurfaceMaterialSizeOptionLabel,
  getSurfaceMaterialSupplierLabel,
  type SurfaceFilterKey,
  type SurfaceFilterState,
  type SurfaceMaterialProductGroup,
} from "./surfaceCatalog";

/**
 * The Surfaces browser's filters, as the manufacturers sort their ranges (J, 2 Oct): a brand
 * (Gardenia & Ariana), its collections (Dorica, Tabulae), and the models on the cards.
 */
export function buildSurfaceFilterOptions(
  materials: readonly SurfaceMaterialCatalogRecord[],
  brand: string | undefined
) {
  const brandMaterials = brand
    ? materials.filter((material) => getSurfaceMaterialSupplierLabel(material) === brand)
    : materials;
  return {
    brand: buildFacetOptions(materials, getSurfaceMaterialSupplierLabel),
    collection: buildFacetOptions(brandMaterials, getSurfaceMaterialCollectionLabel),
    effect: buildFacetOptions(materials, getSurfaceMaterialEffectLabel),
    size: buildFacetOptions(materials, getSurfaceMaterialSizeLabel),
    color: buildFacetOptions(materials, getSurfaceMaterialColorLabel),
  };
}

/** Picking another brand clears a collection that isn't one of that brand's. */
export function withSurfaceFilter(
  current: SurfaceFilterState,
  key: SurfaceFilterKey,
  value: string,
  materials: readonly SurfaceMaterialCatalogRecord[]
): SurfaceFilterState {
  const next: SurfaceFilterState = { ...current, [key]: value || undefined };
  const keepsCollection =
    key !== "brand" ||
    !next.brand ||
    !next.collection ||
    materials.some(
      (material) =>
        getSurfaceMaterialSupplierLabel(material) === next.brand &&
        getSurfaceMaterialCollectionLabel(material) === next.collection
    );
  return keepsCollection ? next : { ...next, collection: undefined };
}

export function hasActiveSurfaceFilters(search: string, filters: SurfaceFilterState) {
  return (
    Boolean(search.trim()) ||
    (["brand", "collection", "effect", "size", "color"] as const).some((key) => Boolean(filters[key])) ||
    Boolean(filters.favoritesOnly) ||
    Boolean(filters.recommendedOnly)
  );
}

/**
 * A search that is just a colour is the colour filter (J, 28 Oct 2026). The colour filter's names and a few spellings of them,
 * lower case, to the filter's label: "grey" and "gray" to Grey, "dark wood" to Dark Wood. Unknown and Mixed aren't colours.
 */
const SURFACE_COLOUR_BY_WORD: ReadonlyMap<string, string> = new Map([
  ...SURFACE_MATERIAL_VOCABULARY.color_family
    .filter((family) => family !== "unknown" && family !== "mixed")
    .map((family) => [getSurfaceColourFamilyLabel(family).toLowerCase(), getSurfaceColourFamilyLabel(family)] as const),
  ["gray", getSurfaceColourFamilyLabel("grey")],
]);

/** The colour a search names, when the search is just a colour ("Blue", "light wood"); null for any other search. */
export function getSurfaceSearchColour(search: string): string | null {
  return SURFACE_COLOUR_BY_WORD.get(search.trim().toLowerCase().replace(/\s+/g, " ")) ?? null;
}

/**
 * What a search matches: what a material is (its name, code, brand, collection, size, effect) and what it's for (rooms,
 * outdoor uses, tone and style). Not its colour family: that is the colour filter's, and a wood's family is a tone, so
 * "walnut" would otherwise find mahogany and wenge (J, 28 Oct 2026).
 */
function getSurfaceMaterialSearchText(material: SurfaceMaterialCatalogRecord) {
  return [
    material.surface_material.product_name,
    material.surface_material.material_id,
    getSurfaceMaterialProductDisplayName(material),
    getSurfaceMaterialSupplierLabel(material),
    getSurfaceMaterialCollectionLabel(material),
    getSurfaceMaterialSizeLabel(material),
    getSurfaceMaterialSizeOptionLabel(material),
    material.surface_material.material_family,
    material.classification?.design_effect,
    ...(material.classification?.tone ?? []),
    ...(material.classification?.style_cluster ?? []),
    ...(material.classification?.room_suitability ?? []),
    // An outdoor floor is found by "outdoor" and where it goes: terrace, patio, pool edge (13 Oct 2026).
    ...getSurfaceMaterialOutdoorSearchTerms(material),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function matchesSurfaceFacets(material: SurfaceMaterialCatalogRecord, filters: SurfaceFilterState) {
  const facets: Array<[SurfaceFilterKey, (material: SurfaceMaterialCatalogRecord) => string]> = [
    ["brand", getSurfaceMaterialSupplierLabel],
    ["collection", getSurfaceMaterialCollectionLabel],
    ["effect", getSurfaceMaterialEffectLabel],
    ["size", getSurfaceMaterialSizeLabel],
    ["color", getSurfaceMaterialColorLabel],
  ];
  return facets.every(([key, getLabel]) => !filters[key] || getLabel(material) === filters[key]);
}

/**
 * A colour search finds the materials of that colour. One whose colour isn't known yet is found by its name, as before, until
 * every material has a colour (the follow-up colour pass).
 */
function matchesSurfaceSearch(material: SurfaceMaterialCatalogRecord, query: string, searchColour: string | null) {
  if (!query) return true;
  const known = (material.classification?.color_family ?? "unknown") !== "unknown";
  if (searchColour && known) return getSurfaceMaterialColorLabel(material) === searchColour;
  const text = getSurfaceMaterialSearchText(material);
  return text.includes(query) || Boolean(searchColour && text.includes(searchColour.toLowerCase()));
}

/** The product groups (one card per model) with a size, colour or finish that passes every filter. */
export function filterSurfaceMaterialGroups(
  groups: readonly SurfaceMaterialProductGroup[],
  {
    search,
    filters,
    favoriteIds,
    roomType,
  }: { search: string; filters: SurfaceFilterState; favoriteIds: ReadonlySet<string>; roomType: string }
) {
  const query = search.trim().toLowerCase();
  const searchColour = getSurfaceSearchColour(search);
  return groups.filter((group) =>
    group.variants.some((material) => {
      const suitability: readonly string[] = material.classification?.room_suitability ?? [];
      return (
        matchesSurfaceSearch(material, query, searchColour) &&
        matchesSurfaceFacets(material, filters) &&
        (!filters.favoritesOnly || favoriteIds.has(material.surface_material.material_id)) &&
        (!filters.recommendedOnly || suitability.includes(roomType) || suitability.includes("living"))
      );
    })
  );
}
