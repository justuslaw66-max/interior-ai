"use client";

import { useCallback } from "react";

import { getCabinetPlanningDimsMm } from "@/features/cabinetry/designItemAdapters";
import type { CATALOG_ITEMS } from "@/lib/catalog";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import { getRotatedFootprint } from "@/lib/design-page-utils";
import type { DesignItem } from "@/lib/room-types";
import { computeAABB, type AABB } from "@/lib/snapGuides";

export type DesignPageSelectionBounds = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  centerX: number;
  centerZ: number;
};

export type ResolveDesignPagePlanningDimensions = (
  item: DesignItem,
  fallbackProduct: CatalogItemSchema
) => { w: number; d: number; h: number };

export type DesignPageItemGeometryConfiguration = {
  catalogItems: typeof CATALOG_ITEMS;
  resolveConfiguredPlanningDimsMm: ResolveDesignPagePlanningDimensions;
};

export type UseDesignPageItemGeometryInput = {
  configuration: DesignPageItemGeometryConfiguration;
};

export type DesignPageItemGeometryActions = {
  getItemAABB: (
    item: DesignItem,
    positionOverride?: [number, number, number],
    rotationOverride?: number
  ) => AABB | null;
  getSelectionBounds: (
    selected: DesignItem[]
  ) => DesignPageSelectionBounds | null;
};

export type DesignPageItemGeometryResult = {
  actions: DesignPageItemGeometryActions;
};

export function useDesignPageItemGeometry({
  configuration: { catalogItems, resolveConfiguredPlanningDimsMm },
}: UseDesignPageItemGeometryInput): DesignPageItemGeometryResult {
  const getItemAABB = useCallback(
    (
      item: DesignItem,
      positionOverride?: [number, number, number],
      rotationOverride?: number
    ) => {
      const cabinetDims = getCabinetPlanningDimsMm(item);
      if (cabinetDims) {
        const rotationY = rotationOverride ?? item.rotationY ?? 0;
        const [width, depth] = getRotatedFootprint(
          cabinetDims.w / 1000,
          cabinetDims.d / 1000,
          rotationY
        );
        const position = positionOverride ?? item.position;
        return computeAABB(position, width, depth);
      }

      const product = resolveDesignItemVisualProduct(item, catalogItems);
      if (!product) return null;
      const configuredDims = resolveConfiguredPlanningDimsMm(item, product);
      const rotationY = rotationOverride ?? item.rotationY ?? 0;
      const [width, depth] = getRotatedFootprint(
        configuredDims.w / 1000,
        configuredDims.d / 1000,
        rotationY
      );
      const position = positionOverride ?? item.position;
      return computeAABB(position, width, depth);
    },
    [catalogItems, resolveConfiguredPlanningDimsMm]
  );

  const getSelectionBounds = useCallback(
    (selected: DesignItem[]) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const item of selected) {
        const aabb = getItemAABB(item);
        if (!aabb) continue;
        minX = Math.min(minX, aabb.minX);
        maxX = Math.max(maxX, aabb.maxX);
        minZ = Math.min(minZ, aabb.minZ);
        maxZ = Math.max(maxZ, aabb.maxZ);
      }
      if (!Number.isFinite(minX)) return null;
      return {
        minX,
        maxX,
        minZ,
        maxZ,
        centerX: (minX + maxX) / 2,
        centerZ: (minZ + maxZ) / 2,
      };
    },
    [getItemAABB]
  );

  return {
    actions: {
      getItemAABB,
      getSelectionBounds,
    },
  };
}
