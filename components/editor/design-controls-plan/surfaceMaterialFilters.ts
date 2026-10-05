import type { SurfaceMaterialCatalogRecord } from "@/lib/surface-material-runtime";

import {
  buildFacetOptions,
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
    material.classification?.color_family,
    ...(material.classification?.tone ?? []),
    ...(material.classification?.style_cluster ?? []),
    ...(material.classification?.room_suitability ?? []),
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
  return groups.filter((group) =>
    group.variants.some((material) => {
      const suitability: readonly string[] = material.classification?.room_suitability ?? [];
      return (
        (!query || getSurfaceMaterialSearchText(material).includes(query)) &&
        matchesSurfaceFacets(material, filters) &&
        (!filters.favoritesOnly || favoriteIds.has(material.surface_material.material_id)) &&
        (!filters.recommendedOnly || suitability.includes(roomType) || suitability.includes("living"))
      );
    })
  );
}
