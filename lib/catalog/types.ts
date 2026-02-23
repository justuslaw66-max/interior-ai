// lib/catalog/types.ts

export type CatalogCategory =
  | "sofa"
  | "coffee_table"
  | "rug"
  | "tv_console"
  | "accent_chair"
  | "floor_lamp";

export type MmDims = { w: number; d: number; h: number };

export type AabbBounds = {
  type: "aabb";
  size: { x: number; y: number; z: number };
  center: { x: number; y: number; z: number };
};

export type PivotSpec = {
  offsetX: number; // mm (or scene units—pick one and stick to it)
  offsetZ: number;
  groundAligned: boolean;
};

export type PlacementRules = {
  floorOnly: boolean;
  wallSnappable: boolean;
  wallMountable: boolean;
  minWallGapMm: number;
  snapMarginMm: number;
  allowRugOverlap: boolean; // rugs can overlap furniture
};

export type ClearanceRules = {
  walkwayMinMm: number;
  coffeeGapMinMm: number;
  coffeeGapMaxMm: number;
};

export type AssetsSpec = {
  assetId: string;
  modelUrl: string;
  thumbUrl: string;
  materialsProfile?: string;
};

export type CommerceMapping =
  | { type: "shopify"; shopifyVariantId: string; retailer?: string }
  | { type: "affiliate"; url: string; retailer: string }
  | { type: "not_buyable"; reason?: string };

export type CatalogVariant = {
  id: string;
  title: string;
  // optional: finish/material mappings, price deltas, etc.
  materials?: Record<string, unknown>;
};

export type CatalogItemSchema = {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category: CatalogCategory;

  dimsMm: MmDims;
  bounds: AabbBounds;
  pivot: PivotSpec;

  placementRules: PlacementRules;
  clearanceRules: ClearanceRules;

  styleTags: string[];
  toneTags: string[];
  roomTags: string[];

  assets: AssetsSpec;

  variants: CatalogVariant[];
  defaultVariantId?: string;

  commerce: CommerceMapping;

  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};
