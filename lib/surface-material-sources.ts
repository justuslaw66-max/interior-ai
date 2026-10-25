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

/**
 * The wall panels made from the laminate catalogue (lib/laminate-wall-panel-materials.ts), each with its catalogue's path
 * relative to the repository. The path is only a label: nothing reads the file here, and it is never joined to
 * `process.cwd()`, because Next's file tracer can't work out such a path and would copy the whole repository, tests
 * included, into the server build (the production artifact check refuses that).
 */
export function getLaminateWallPanelSourceEntries(): SurfaceMaterialSourceEntry[] {
  if (laminateWallPanelCache) return laminateWallPanelCache;
  const collections = CABINET_LAMINATE_COLLECTIONS.filter((collection) =>
    LAMINATE_WALL_PANEL_COLLECTION_IDS.includes(collection.id)
  );
  laminateWallPanelCache = collections.flatMap((collection) => {
    const filePath = getLaminateCollectionSourcePath(collection);
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
