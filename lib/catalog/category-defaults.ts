// lib/catalog/category-defaults.ts
import type { CatalogCategory, PlacementRules, ClearanceRules } from "./types";

export const CATEGORY_PLACEMENT_DEFAULTS: Record<CatalogCategory, PlacementRules> = {
  sofa: {
    floorOnly: true,
    wallSnappable: true,
    wallMountable: false,
    minWallGapMm: 50,
    snapMarginMm: 20,
    allowRugOverlap: true,
  },
  accent_chair: {
    floorOnly: true,
    wallSnappable: true,
    wallMountable: false,
    minWallGapMm: 50,
    snapMarginMm: 20,
    allowRugOverlap: true,
  },
  coffee_table: {
    floorOnly: true,
    wallSnappable: false,
    wallMountable: false,
    minWallGapMm: 0,
    snapMarginMm: 0,
    allowRugOverlap: true,
  },
  rug: {
    floorOnly: true,
    wallSnappable: false,
    wallMountable: false,
    minWallGapMm: 0,
    snapMarginMm: 0,
    allowRugOverlap: true, // rugs overlap everything
  },
  tv_console: {
    floorOnly: true,
    wallSnappable: true,
    wallMountable: false,
    minWallGapMm: 20,
    snapMarginMm: 10,
    allowRugOverlap: true,
  },
  floor_lamp: {
    floorOnly: true,
    wallSnappable: false,
    wallMountable: false,
    minWallGapMm: 0,
    snapMarginMm: 0,
    allowRugOverlap: true,
  },
};

export const CATEGORY_CLEARANCE_DEFAULTS: Record<CatalogCategory, ClearanceRules> = {
  sofa: { walkwayMinMm: 800, coffeeGapMinMm: 350, coffeeGapMaxMm: 550 },
  accent_chair: { walkwayMinMm: 800, coffeeGapMinMm: 350, coffeeGapMaxMm: 550 },
  coffee_table: { walkwayMinMm: 800, coffeeGapMinMm: 350, coffeeGapMaxMm: 550 },
  rug: { walkwayMinMm: 800, coffeeGapMinMm: 0, coffeeGapMaxMm: 9999 },
  tv_console: { walkwayMinMm: 800, coffeeGapMinMm: 0, coffeeGapMaxMm: 9999 },
  floor_lamp: { walkwayMinMm: 800, coffeeGapMinMm: 0, coffeeGapMaxMm: 9999 },
};
