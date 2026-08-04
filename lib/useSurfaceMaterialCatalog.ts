"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { surfaceMaterialCatalogLoader } from "./surface-material-catalog-loader";
import type { SurfaceMaterialCatalogRecord } from "./surface-material-runtime-types";
import type { WallPaintSwatch } from "./wall-paint";

const EMPTY_SURFACE_MATERIAL_CATALOG: readonly SurfaceMaterialCatalogRecord[] = [];
const EMPTY_WALL_PAINT_CATALOG: readonly WallPaintSwatch[] = [];

export function useSurfaceMaterialCatalog(enabled: boolean) {
  const snapshot = useSyncExternalStore(
    surfaceMaterialCatalogLoader.subscribe,
    surfaceMaterialCatalogLoader.getSnapshot,
    surfaceMaterialCatalogLoader.getSnapshot
  );

  useEffect(() => {
    if (!enabled || snapshot.status !== "idle") return;
    void surfaceMaterialCatalogLoader.load().catch(() => undefined);
  }, [enabled, snapshot.status]);

  const records = snapshot.records ?? EMPTY_SURFACE_MATERIAL_CATALOG;
  const wallPaintSwatches = snapshot.wallPaintSwatches ?? EMPTY_WALL_PAINT_CATALOG;
  const byId = useMemo<
    ReadonlyMap<string | null | undefined, SurfaceMaterialCatalogRecord>
  >(
    () => new Map(records.map((record) => [record.surface_material.material_id, record])),
    [records]
  );

  return {
    status: snapshot.status,
    error: snapshot.error,
    records,
    byId,
    wallPaintSwatches,
    retry: surfaceMaterialCatalogLoader.retry,
  };
}
