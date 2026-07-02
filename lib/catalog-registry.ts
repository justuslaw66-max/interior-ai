import { CATALOG_ITEMS } from "./catalog";
import type { CatalogItemSchema } from "./catalog-schema";
import type { SurfaceMaterial } from "./surface-material-schema";
import { getAllSurfaceMaterialYamlEntries } from "./surface-material-yaml";

export type ProductCatalogItem = CatalogItemSchema;

export type CatalogRegistry = {
  products: ProductCatalogItem[];
  surfaceMaterials: SurfaceMaterial[];
};

export type SurfaceMaterialVisibilityOptions = {
  includeDrafts?: boolean;
};

function isPublishedSurfaceMaterial(material: SurfaceMaterial): boolean {
  return material.import_governance.publish_status === "published";
}

function allowDraftSurfaceMaterials(options: SurfaceMaterialVisibilityOptions = {}): boolean {
  return options.includeDrafts === true || process.env.NODE_ENV !== "production";
}

function getAllSurfaceMaterials(): SurfaceMaterial[] {
  return getAllSurfaceMaterialYamlEntries().map((entry) => {
    const { file_path: _filePath, ...material } = entry;
    return material;
  });
}

export function getSurfaceMaterials(options: SurfaceMaterialVisibilityOptions = {}): SurfaceMaterial[] {
  const materials = getAllSurfaceMaterials();
  return allowDraftSurfaceMaterials(options) ? materials : materials.filter(isPublishedSurfaceMaterial);
}

export function getFlooringMaterials(options: SurfaceMaterialVisibilityOptions = {}): SurfaceMaterial[] {
  return getSurfaceMaterials(options).filter(
    (material) => material.surface_material.surface_category === "flooring"
  );
}

export function getPublishedFlooringMaterials(): SurfaceMaterial[] {
  return getAllSurfaceMaterials().filter(
    (material) =>
      material.surface_material.surface_category === "flooring" &&
      isPublishedSurfaceMaterial(material)
  );
}

export function getDraftFlooringMaterialsForAdmin(): SurfaceMaterial[] {
  return getAllSurfaceMaterials().filter(
    (material) =>
      material.surface_material.surface_category === "flooring" &&
      material.import_governance.publish_status !== "published"
  );
}

export function getSurfaceMaterialById(materialId: string | null | undefined): SurfaceMaterial | null {
  const normalized = String(materialId ?? "").trim();
  if (!normalized) return null;

  return (
    getAllSurfaceMaterials().find(
      (material) =>
        material.surface_material.material_id === normalized ||
        material.surface_material.slug === normalized
    ) ?? null
  );
}

export function getCatalogRegistry(options: SurfaceMaterialVisibilityOptions = {}): CatalogRegistry {
  return {
    products: Object.values(CATALOG_ITEMS),
    surfaceMaterials: getSurfaceMaterials(options),
  };
}
