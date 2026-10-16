import { summarizeCatalogPublication } from "./catalog-publication";
import type { CatalogYamlEntry } from "./catalog-yaml";
import type { ProductCatalogItem } from "./catalog-registry";
import type { SurfaceMaterial } from "./surface-material-schema";

/**
 * One surface material as the open `/api/catalog` route lists it. The route used to return every material's full record
 * (sources, notes, faces, rendering settings), about 5.6 KB each; with Gardenia's 1,314 published entries that came to
 * 14 MB of JSON, as the list appeared twice. The editor reads materials from its generated runtime data, not from here.
 */
export type CatalogApiSurfaceMaterialSummary = {
  material_id: string;
  slug: string;
  product_name: string;
  supplier: string;
  brand: string | null;
  collection: string | null;
  surface_category: SurfaceMaterial["surface_material"]["surface_category"];
  material_family: SurfaceMaterial["surface_material"]["material_family"];
  size_mm: { width: number; length: number } | null;
  swatch_url: string | null;
  purchase_mode: SurfaceMaterial["commerce"]["purchase_mode"];
  publish_status: SurfaceMaterial["import_governance"]["publish_status"];
};

function getSurfaceMaterialSizeMm(material: SurfaceMaterial): CatalogApiSurfaceMaterialSummary["size_mm"] {
  const specs = material.physical_specs;
  const width = specs.tile_width_mm ?? specs.plank_width_mm ?? null;
  const length = specs.tile_length_mm ?? specs.plank_length_mm ?? null;
  return width && length ? { width, length } : null;
}

export function summarizeSurfaceMaterialForCatalogApi(material: SurfaceMaterial): CatalogApiSurfaceMaterialSummary {
  const identity = material.surface_material;
  return {
    material_id: identity.material_id,
    slug: identity.slug,
    product_name: identity.product_name,
    supplier: identity.supplier,
    brand: identity.brand ?? null,
    collection: identity.collection ?? null,
    surface_category: identity.surface_category,
    material_family: identity.material_family,
    size_mm: getSurfaceMaterialSizeMm(material),
    swatch_url: material.texture_assets.swatch_url,
    purchase_mode: material.commerce.purchase_mode,
    publish_status: material.import_governance.publish_status,
  };
}

export function buildCatalogApiPayload(params: {
  items: CatalogYamlEntry[];
  products: ProductCatalogItem[];
  surfaceMaterials: SurfaceMaterial[];
}) {
  const publication = summarizeCatalogPublication(params.items);
  const surfaceMaterials = params.surfaceMaterials.map(summarizeSurfaceMaterialForCatalogApi);
  return {
    total: params.items.length,
    publication,
    statusCounts: publication.statusCounts,
    items: params.items,
    registry: { products: params.products, surfaceMaterials },
    products: params.products,
    surfaceMaterials,
  };
}
