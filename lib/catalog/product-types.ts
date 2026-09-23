import type { CatalogMediaPresentationMode } from "./media-policy";

export type Variant = {
  id: string;
  name: string;
  colorHex: string;
  finishCode?: string;
  finishLabel?: string;
  materialType?: "Fabric" | "Leather" | "Wood";
  swatchGroup?: string;
  swatchHex?: string;
  swatchTextureUrl?: string;
  collectionType?: string;
  thumbnailUrl?: string;
  galleryImages?: string[];
  mediaPresentationMode?: CatalogMediaPresentationMode;
  dimensionsMm?: { w: number; d: number; h: number };
  sizeLabel?: string;
  modelUrl?: string;
  affiliateUrl?: string;
  priceHint?: number;
  available?: boolean;
  priceDelta?: number;
  shopifyVariantId?: string;
};

export type ProductCategory =
  | "sofa"
  | "ottoman"
  | "bed"
  | "coffee_table"
  | "side_table"
  | "dining_table"
  | "dining_bench"
  | "rug"
  | "tv_console"
  | "sideboard"
  | "accent_chair"
  | "floor_lamp"
  | "table_lamp"
  | "pendant_light";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  dimensions: { w: number; d: number; h: number };
  styleTags: string[];
  galleryImages?: string[];
  mediaPresentationMode?: CatalogMediaPresentationMode;
  variants: Variant[];
  defaultVariantId: string;
  purchaseMode: "shopify" | "affiliate";
  retailer?: string;
  buyUrl?: string;
  shopifyVariantId?: string;
  modelUrl?: string;
};
