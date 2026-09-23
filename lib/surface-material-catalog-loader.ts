import { SURFACE_MATERIAL_RENDER_REGISTRY } from "./surface-material-runtime";
import type {
  SurfaceMaterialCatalogMetadata,
  SurfaceMaterialCatalogRecord,
} from "./surface-material-runtime-types";
import {
  createNipponWallPaintSwatches,
  type WallPaintCatalogColour,
  type WallPaintSwatch,
} from "./wall-paint";

export type SurfaceMaterialCatalogModule = {
  PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA: readonly SurfaceMaterialCatalogMetadata[];
  NIPPON_PAINT_COLOURS: readonly WallPaintCatalogColour[];
};

export type SurfaceMaterialCatalogSnapshot =
  | { status: "idle" | "loading"; records: null; wallPaintSwatches: null; error: null }
  | {
      status: "success";
      records: readonly SurfaceMaterialCatalogRecord[];
      wallPaintSwatches: readonly WallPaintSwatch[];
      error: null;
    }
  | { status: "error"; records: null; wallPaintSwatches: null; error: Error };

type CatalogImporter = () => Promise<SurfaceMaterialCatalogModule>;
type CatalogListener = () => void;

function joinSurfaceMaterialCatalog(
  metadataRecords: readonly SurfaceMaterialCatalogMetadata[]
): readonly SurfaceMaterialCatalogRecord[] {
  const renderById = new Map(
    SURFACE_MATERIAL_RENDER_REGISTRY.map((record) => [
      record.surface_material.material_id,
      record,
    ])
  );
  const seenIds = new Set<string>();
  const records = metadataRecords.map((metadata) => {
    if (seenIds.has(metadata.material_id)) {
      throw new Error(`Duplicate surface catalog material ID: ${metadata.material_id}`);
    }
    seenIds.add(metadata.material_id);
    const renderRecord = renderById.get(metadata.material_id);
    if (!renderRecord) {
      throw new Error(`Surface catalog metadata has no render record: ${metadata.material_id}`);
    }
    return Object.freeze({
      ...renderRecord,
      source: metadata.source,
      classification: {
        ...renderRecord.classification,
        ...metadata.classification,
      },
      physical_specs: {
        ...renderRecord.physical_specs,
        ...metadata.physical_specs,
      },
      commerce: metadata.commerce,
    });
  });
  if (records.length !== SURFACE_MATERIAL_RENDER_REGISTRY.length) {
    throw new Error(
      `Surface catalog/render count mismatch: ${records.length}/${SURFACE_MATERIAL_RENDER_REGISTRY.length}`
    );
  }
  return Object.freeze(records);
}

export function createSurfaceMaterialCatalogLoader(importCatalog: CatalogImporter) {
  let snapshot: SurfaceMaterialCatalogSnapshot = {
    status: "idle",
    records: null,
    wallPaintSwatches: null,
    error: null,
  };
  let loadPromise: Promise<readonly SurfaceMaterialCatalogRecord[]> | null = null;
  const listeners = new Set<CatalogListener>();

  const publish = (nextSnapshot: SurfaceMaterialCatalogSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const load = () => {
    if (loadPromise) return loadPromise;
    publish({ status: "loading", records: null, wallPaintSwatches: null, error: null });
    loadPromise = importCatalog()
      .then((module) => ({
        records: joinSurfaceMaterialCatalog(module.PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA),
        wallPaintSwatches: createNipponWallPaintSwatches(module.NIPPON_PAINT_COLOURS),
      }))
      .then(({ records, wallPaintSwatches }) => {
        publish({ status: "success", records, wallPaintSwatches, error: null });
        return records;
      })
      .catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error("Surface material catalog failed to load");
        publish({ status: "error", records: null, wallPaintSwatches: null, error });
        throw error;
      });
    return loadPromise;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: CatalogListener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    load,
    retry: () => {
      if (snapshot.status !== "error") return load();
      loadPromise = null;
      return load();
    },
  };
}

export const surfaceMaterialCatalogLoader = createSurfaceMaterialCatalogLoader(
  async () => {
    const [surfaceCatalog, wallPaintCatalog] = await Promise.all([
      import("./generated/surface-material-catalog.generated"),
      import("./nippon-paint-colours"),
    ]);
    return {
      PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA:
        surfaceCatalog.PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA,
      NIPPON_PAINT_COLOURS: wallPaintCatalog.NIPPON_PAINT_COLOURS,
    };
  }
);

export const loadSurfaceMaterialCatalog = surfaceMaterialCatalogLoader.load;
export const retrySurfaceMaterialCatalog = surfaceMaterialCatalogLoader.retry;
