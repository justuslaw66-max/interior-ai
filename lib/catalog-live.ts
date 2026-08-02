import type { CatalogItemSchema } from "./catalog-schema";
import type { CatalogYamlEntry } from "./catalog-yaml";
import type { SurfaceMaterial } from "./surface-material-schema";
import { isLiveCatalogEntry } from "./catalog-publication";

export type LiveCatalogPayload = {
  ids: string[];
  itemIds: string[];
  assetIds: string[];
  surfaceMaterialIds: string[];
  source: "catalog-yaml";
};

function getYamlAssetId(entry: CatalogYamlEntry): string | null {
  const assetId = String(entry.assets?.asset_id ?? "").trim();
  return assetId.length > 0 ? assetId : null;
}

export function buildLiveCatalogPayload(params: {
  catalogItems: Record<string, CatalogItemSchema>;
  yamlEntries: CatalogYamlEntry[];
  surfaceMaterials?: SurfaceMaterial[];
}): LiveCatalogPayload {
  const liveYamlAssetIds = new Set(
    params.yamlEntries
      .filter(isLiveCatalogEntry)
      .map(getYamlAssetId)
      .filter((assetId): assetId is string => Boolean(assetId))
  );

  const itemIds = Object.keys(params.catalogItems).filter((itemId) => {
    const assetId = String(params.catalogItems[itemId]?.assets?.assetId ?? "").trim();
    return assetId.length > 0 && liveYamlAssetIds.has(assetId);
  });

  const assetIds = Array.from(liveYamlAssetIds.values());
  const surfaceMaterialIds = (params.surfaceMaterials ?? [])
    .filter((material) => material.import_governance.publish_status === "published")
    .map((material) => material.surface_material.material_id);

  return {
    ids: itemIds,
    itemIds,
    assetIds,
    surfaceMaterialIds,
    source: "catalog-yaml",
  };
}
