import path from "node:path";
import { CABINET_LAMINATE_COLLECTIONS } from "./generated/cabinet-laminates.generated";
import {
  buildLaminateWallPanelMaterials,
  getLaminateCollectionSourcePath,
  LAMINATE_WALL_PANEL_COLLECTION_IDS,
} from "./laminate-wall-panel-materials";
import { getAllSurfaceMaterialYamlEntries, type SurfaceMaterialYamlEntry } from "./surface-material-yaml";

/** A surface material with the file it comes from: its YAML file, or the laminate catalogue for a wall panel. */
export type SurfaceMaterialSourceEntry = SurfaceMaterialYamlEntry;

let laminateWallPanelCache: SurfaceMaterialSourceEntry[] | null = null;

/** The wall panels made from the laminate catalogue (lib/laminate-wall-panel-materials.ts), each with its catalogue's path. */
export function getLaminateWallPanelSourceEntries(): SurfaceMaterialSourceEntry[] {
  if (laminateWallPanelCache) return laminateWallPanelCache;
  const collections = CABINET_LAMINATE_COLLECTIONS.filter((collection) =>
    LAMINATE_WALL_PANEL_COLLECTION_IDS.includes(collection.id)
  );
  laminateWallPanelCache = collections.flatMap((collection) => {
    const filePath = path.join(process.cwd(), getLaminateCollectionSourcePath(collection));
    return buildLaminateWallPanelMaterials([collection]).map((material) => ({ ...material, file_path: filePath }));
  });
  return laminateWallPanelCache;
}

/**
 * Every surface material from its canonical source: the YAML files under catalog/surface-materials, then the laminate
 * catalogue's wall panels. The server registry and the surface generator read this; neither is copied into the other.
 */
export function getAllSurfaceMaterialSourceEntries(): SurfaceMaterialSourceEntry[] {
  return [...getAllSurfaceMaterialYamlEntries(), ...getLaminateWallPanelSourceEntries()];
}
