import {
  CATEGORY_DEFAULTS,
  type CatalogItemSchema,
  type CommerceMapping,
  type StyleTag,
  type ProductCategory as NormalizedCategory,
} from "./catalog-schema";
import type { CatalogMediaPresentationMode } from "./catalog/media-policy";
import { resolveCastleryVariantAffiliateUrl } from "./catalog/castlery-retailer-links";
import { getModelAsset } from "./model-assets";

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

const STYLE_TAG_MAP: Record<string, StyleTag> = {
  scandi: "scandinavian",
  scandinavian: "scandinavian",
  minimalistic: "minimalist",
  minimalist: "minimalist",
  luxury: "luxe",
  luxe: "luxe",
  modern: "modern",
  japandi: "japandi",
};

const DEFAULT_MATERIAL_PRESET = "default";

const DALTON_STANDARD_QUEEN_THUMB_URL =
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888284/crusader/variants/50440789-NG4001/Dalton-Queen-Size-Bed-Front-1676888282.jpg";
const DALTON_STANDARD_QUEEN_GALLERY_IMAGES = [
  DALTON_STANDARD_QUEEN_THUMB_URL,
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677134088/crusader/variants/50440789-NG4001/Dalton-Queen-Size-Bed-Angle-1677134086.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663663058/crusader/variants/50440789-NG4001/Dalton-Bed-Beach-Linen-Square-Set_4-1663663056.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663663058/crusader/variants/50440789-NG4001/Dalton-Bed-Beach-Linen-Square-Set_1-1663663056.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663663115/crusader/variants/50440789-NG4001/Dalton-Bed-Beach-Linen-Square-Set_5-1663663112.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663663114/crusader/variants/50440789-NG4001/Dalton-Bed-Beach-Linen-Square-Det_3-1663663112.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663731733/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Det_7-1663731731.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663731757/crusader/variants/50440789-NG4001/Dalton-Bed-Beach-Linen-Square-Det_5-1663731755.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663731734/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Det_4-1663731731.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888285/crusader/variants/50440789-NG4001/Dalton-Queen-Size-Bed-Side_1-1676888282.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888284/crusader/variants/50440789-NG4001/Dalton-Queen-Size-Bed-Front_1-1676888282.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888647/crusader/variants/50440789-NG4001/Dalton-Bed-Quenn-Beach-Linen-Back-1676888644.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676951017/crusader/variants/T50440789/Dalton-Queen-Size-Bed-Dim-1676951015.jpg",
];

const DALTON_STANDARD_KING_THUMB_URL =
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888370/crusader/variants/50440790-NG4001/Dalton-King-Size-Bed-Front-1676888367.jpg";
const DALTON_STANDARD_KING_GALLERY_IMAGES = [
  DALTON_STANDARD_KING_THUMB_URL,
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677134193/crusader/variants/50440790-NG4001/Dalton-King-Size-Bed-Angle-1677134191.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663664687/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Set_4-1663664684.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663664900/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Set_1-1663664897.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663664900/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Set_5-1663664897.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663664900/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Det_3-1663664897.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663731733/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Det_7-1663731731.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663731733/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Det_5-1663731731.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1663731734/crusader/variants/50440790-NG4001/Dalton-Bed-Beach-Linen-Square-Det_4-1663731731.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888370/crusader/variants/50440790-NG4001/Dalton-King-Size-Bed-Side_1-1676888367.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676888370/crusader/variants/50440790-NG4001/Dalton-King-Size-Bed-Front_1-1676888367.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1665459460/crusader/variants/50440790-NG4001/Dalton-Bed-King-Beach-Linen-Back-1665459458.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676951017/crusader/variants/T50440789/Dalton-King-Size-Bed-Dim-1676951015.jpg",
];

const DALTON_STORAGE_SINGLE_THUMB_URL =
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452433/crusader/variants/50440980-NG4001/Dalton-Single-Storage-Bed-Front-1740452431.jpg";
const DALTON_STORAGE_SINGLE_GALLERY_IMAGES = [
  DALTON_STORAGE_SINGLE_THUMB_URL,
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452434/crusader/variants/50440980-NG4001/Dalton-Single-Storage-Bed-Angle_1-1740452432.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452434/crusader/variants/50440980-NG4001/Dalton-Single-Storage-Bed-Angle_2-1740452432.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741076777/crusader/variants/50440980-NG4001/Dalton-Super-Single-Storage-Bed-Beach-Linen-Square-Set_2-1741076775.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741076777/crusader/variants/50440980-NG4001/Dalton-Super-Single-Storage-Bed-Beach-Linen-Square-Set_3-1741076775.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741076777/crusader/variants/50440980-NG4001/Dalton-Super-Single-Storage-Bed-Beach-Linen-Square-Det_6-1741076775.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740475495/crusader/variants/50440980-NG4001/Dalton-Storage-Bed-Square-Det_4-1740475493.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741593900/crusader/variants/50440980-NG4001/Dalton-Super-Single-Storage-Bed-Set-1741593898.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740475496/crusader/variants/50440980-NG4001/Dalton-Storage-Bed-Square-Det_1-1740475493.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452435/crusader/variants/50440980-NG4001/Dalton-Single-Storage-Bed-Side_1-1740452432.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452435/crusader/variants/50440980-NG4001/Dalton-Single-Storage-Bed-Side_2-1740452432.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452434/crusader/variants/50440980-NG4001/Dalton-Single-Storage-Bed-Back-1740452431.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740994986/crusader/variants/TAS-000299/Dalton-Single-Storage-Bed-Dim-SG-1740994984.jpg",
];

const DALTON_STORAGE_SUPER_SINGLE_THUMB_URL =
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452711/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Front-1740452709.jpg";
const DALTON_STORAGE_SUPER_SINGLE_GALLERY_IMAGES = [
  DALTON_STORAGE_SUPER_SINGLE_THUMB_URL,
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452715/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Angle-1740452713.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452715/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Angle_1-1740452712.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741076972/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Beach-Linen-Square-Set_2-1741076970.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741076972/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Beach-Linen-Square-Set_3-1741076970.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741076972/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Beach-Linen-Square-Det_6-1741076970.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740476620/crusader/variants/50440982-NG4001/Dalton-Storage-Bed-Square-Det_4-1740476617.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740476620/crusader/variants/50440982-NG4001/Dalton-Storage-Bed-Square-Det_1-1740476617.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452711/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Set-1740452709.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452717/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Side-1740452715.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452717/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Side_1-1740452715.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740452711/crusader/variants/50440982-NG4001/Dalton-Super-Single-Storage-Bed-Back-1740452709.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740994986/crusader/variants/TAS-000299/Dalton-Super-Single-Storage-Bed-Dim-SG-1740994984.jpg",
];

const DALTON_STORAGE_QUEEN_THUMB_URL =
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414459/crusader/variants/T50441115-NG4001/Dalton-Storage-Queen-Size-Bed-Front_1-1678414456.jpg";
const DALTON_STORAGE_QUEEN_GALLERY_IMAGES = [
  DALTON_STORAGE_QUEEN_THUMB_URL,
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414459/crusader/variants/T50441115-NG4001/Dalton-Storage-Queen-Size-Bed-Angle_1-1678414456.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679039737/crusader/variants/T50441115-NG4001/Dalton-Storage-Queen-Size-Bed-Angle_4-1679039734.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061359/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Set_3-1677061356.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061401/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Set_5-1677061399.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061502/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_2-1677061500.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061502/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_3-1677061500.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061750/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_4-1677061747.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061750/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_3-1677061747.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061750/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_1-1677061747.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677062072/crusader/variants/T50441116-NG4001/Dalton-Bed-Beach-Linen-Square-Det_4-1677062070.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414835/crusader/variants/T50441115-NG4001/Dalton-Storage-Queen-Size-Bed-Side-1678414832.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414700/crusader/variants/T50441115-NG4001/Dalton-Storage-Queen-Size-Bed-Back-1678414698.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679566140/crusader/variants/T50441114/Dalton-Storage-Queen-Size-Bed-Dim-1679566139.jpg",
];

const DALTON_STORAGE_KING_THUMB_URL =
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414766/crusader/variants/T50441116-NG4001/Dalton-Storage-King-Size-Bed-Front_1-1678414764.jpg";
const DALTON_STORAGE_KING_GALLERY_IMAGES = [
  DALTON_STORAGE_KING_THUMB_URL,
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414766/crusader/variants/T50441116-NG4001/Dalton-Storage-King-Size-Bed-Angle_1-1678414764.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679044456/crusader/variants/T50441116-NG4001/Dalton-Storage-King-Size-Bed-Angle_4-1679044454.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061359/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Set_3-1677061356.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061401/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Set_5-1677061399.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061502/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_2-1677061500.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061502/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_3-1677061500.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061750/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_4-1677061747.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061750/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_3-1677061747.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677061750/crusader/variants/T50441116-NG4001/Dalton-Storage-Bed-Square-Det_1-1677061747.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1677062072/crusader/variants/T50441116-NG4001/Dalton-Bed-Beach-Linen-Square-Det_4-1677062070.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414791/crusader/variants/T50441116-NG4001/Dalton-Storage-King-Size-Bed-Side-1678414788.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678414765/crusader/variants/T50441116-NG4001/Dalton-Storage-King-Size-Bed-Back-1678414763.jpg",
  "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679566140/crusader/variants/T50441114/Dalton-Storage-King-Size-Bed-Dim-1679566139.jpg",
];

const LEGACY_NO_MODEL_IDS = new Set<string>([
  // Keep specific legacy entries here only when we intentionally force primitive fallback.
]);

const LEGACY_ASSET_ID_OVERRIDES: Record<string, string> = {
  "castlery-sloane-sideboard-150cm": "storage-real-castlery-sloane-sideboard-150cm",
  "castlery-sloane-sideboard-180cm": "storage-real-castlery-sloane-sideboard-180cm",
};

const LEGACY_THUMB_URL_OVERRIDES: Record<string, string> = {
  "castlery-sloane-sideboard-150cm": "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1756189513/crusader/variants/50520028/Sloane-Sideboard-150cm-Front-1756189510.jpg",
  "castlery-sloane-sideboard-180cm": "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1667991789/crusader/variants/50520002/Sloane-Sideboard-Fornt-1667991786.jpg",

  // ========== IMPORTED CASTLERY BEDS ==========
  "bed-real-castlery-lexi-tufted": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634541304/crusader/variants/54000038-CY4002/Lexi-Queen-Size-Bed-Nickel-Grey-Front_1-SG.jpg",
  "bed-real-castlery-joseph": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
  "bed-real-castlery-rochelle-boucle": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676542514/crusader/variants/50440795-IN4002/Rochelle-Boucle-Queen-Size-Bed-White-Quartz-Front-1676542511.jpg",
  "bed-real-castlery-seb": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715470/crusader/variants/40550353-PT4001/Seb-Queen-Bed-Performance-Twill-Creamy-White-Front-1766715467.jpg",
  "bed-real-castlery-dalton": DALTON_STANDARD_QUEEN_THUMB_URL,
  "bed-real-castlery-claude": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678693175/crusader/variants/T50441129-AR4001/Claude-Queen-Bed-Front_1-1678693173.jpg",
  "bed-real-castlery-dawson": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634544577/crusader/variants/54000057-NG4001/Dawson-Queen-Size-Bed-Beach-Linen-Front.jpg",

  // ========== IMPORTED CASTLERY SOFAS (Harvested from Castlery Website) ==========
  "sofa-real-castlery-jaron-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737527905/crusader/variants/AS-000658-LE4023/Jaron-Leather-3-Seater-Dual-Recliner-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737527903.png",
  "sofa-real-castlery-jaron-extended-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737534897/crusader/variants/AS-000669-LE4023/Jaron-Leather-Extended-3-Seater-Recliner-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737534895.png",
  "sofa-real-castlery-jaron-3s-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737527644/crusader/variants/AS-000659-LE4023/Jaron-Leather-3-Seater-Dual-Recliner-Wide-Arm-Sofa-Marche-Cocoa_-Front-1737527642.jpg",
  "sofa-real-castlery-jaron-extended-3s-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737534745/crusader/variants/AS-000670-LE4023/Jaron-Leather-Extended-3-Seater-Recliner-Wide-Arm-Sofa-Marche-Cocoa_-Front-1737534742.jpg",
  "sofa-real-castlery-jaron-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599392/crusader/variants/AS-000675-LE4023/Jaron-Leather-Chaise-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737599390.jpg",
  "sofa-real-castlery-jaron-chaise-sectional-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599336/crusader/variants/AS-000676-LE4023/Jaron-Leather-Chaise-Sectional-Wide-Arm-Sofa-Marche-Cocoa_-Angle-1737599333.jpg",
  "sofa-real-castlery-jaron-l-shaped-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599830/crusader/variants/AS-000681-LE4023/Jaron-Leather-L-Shape-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Angle-1737599828.jpg",
  "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599772/crusader/variants/AS-000682-LE4023/Jaron-Leather-L-Shape-Sectional-Wide-Arm-Sofa-Marche-Cocoa_-Angle-1737599770.jpg",
  "armchair-real-castlery-jaron-recliner-armchair": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1000/v1760147965/crusader/variants/AS-000732-LE4021/Jaron-Leather-Slim-Arm-Recliner-Armchair-Marche-Ivory-Angle_-1760147964.png",
  "armchair-real-castlery-jaron-recliner-armchair-wide-arm": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1000/v1760147910/crusader/variants/AS-000733-LE4021/Jaron-Leather-Wide-Arm-Recliner-Armchair-Marche-Ivory-Angle_-1760147910.png",
  "sofa-real-castlery-madison-2s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1745287810/crusader/variants/50441008-AM4001/Madison-2-Seater-Sofa-Amalfi-Bisque-Front-1745287807.png",
  "sofa-real-castlery-madison-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1646386187/crusader/variants/50440750-AM4001/Madison-3-Seater-Sofa-Bisque-Front-SG.png",
  "sofa-real-castlery-madison-ottoman": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1645673995/crusader/variants/50440732-AM4001/Madison-Ottoman-Bisque-Front.png",
  "armchair-real-castlery-madison-armchair": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1000/v1645673258/crusader/variants/50440731-AM4001/Madison-Armchair-Bisque-Front.png",
  "sofa-real-castlery-ollie-storage-ottoman": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Front-1768210732.jpg",
  "armchair-real-castlery-avery-performance-armchair": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175346/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Front-1760175346.jpg",
  "armchair-real-castlery-avery-performance-armchair-with-ottoman": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174592/crusader/variants/PB-001916-IN4002/Avery-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174592.jpg",
  "armchair-real-castlery-avery-performance-swivel-armchair": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Angle-1760175397.jpg",
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174560/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174560.jpg",
  "armchair-real-castlery-lena-leather-armchair-cocoa-brass-legs": "https://res.cloudinary.com/castlery/image/upload/w_1000,f_auto,q_auto,b_rgb:F3F3F3,c_fit/v1779864438/pim/converting/1779864435282/Lena-Armchair-Sofa-Performance-Hugo-Greige-Brass-Legs-Front.jpg",
  "armchair-real-castlery-lena-leather-armchair-cocoa-black-legs": "https://res.cloudinary.com/castlery/image/upload/c_fit,f_auto,q_auto,w_1200/v1779864334/pim/converting/1779864331973/Lena-Armchair-Sofa-Performance-Hugo-Greige-Matte-Black-Legs-Front.jpg",

  // ========== IMPORTED CASTLERY DINING (Harvested from Castlery Website) ==========
  "dining-real-castlery-sloane-travertine-180": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.jpg",
  "dining-real-castlery-sloane-bench-150-no-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678698647/crusader/variants/50520005/Sloane-Dining-Bench-150cm-Grey-Oak-Angle-1678698645.jpg",
  "dining-real-castlery-sloane-bench-150-leather-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678698648/crusader/variants/50520005/Sloane-Dining-Bench-150cm-Grey-Oak-With-Leather-Cushion-Angle-1678698646.jpg",
  "dining-real-castlery-sloane-bench-180-no-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679562782/crusader/variants/T504411010-LE4016/Sloane-Dining-Bench-180cm-Grey-Oak-Angle-1679562780.jpg",
  "dining-real-castlery-sloane-bench-180-leather-cushion": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1679562782/crusader/variants/T504411010-LE4016/Sloane-Dining-Bench-180cm-Grey-Oak-With-Leather-Cushion-Angle-1679562780.jpg",

  // ========== JARON ADDITIONAL VARIANTS ==========
  "sofa-real-castlery-jaron-leather-slim-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740989670/crusader/variants/AS-000644-LE4023/Jaron-Leather-Slim-Arm-Sofa-Performance-Marche-Cocoa-Angle-1740989669.png",
  "sofa-real-castlery-jaron-performance-fabric-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740989512/crusader/variants/AS-000642-AR1020/Jaron-Slim-Arm-Sofa-Performance-Arvo-Dune-Angle-1740989511.png",
  "sofa-real-castlery-jaron-leather-corner-sofa": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1738824346/crusader/variants/AS-000668-LE4023/Jaron-Leather-Rachet-Corner-Sofa-Marche-Cocoa_-Front-1738824345.png",
  "sofa-real-castlery-jaron-leather-armless-sofa": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1738823965/crusader/variants/AS-000665-LE4023/Jaron-Leather-Stationary-Armless-Sofa-Marche-Cocoa_-Front-1738823963.png",
  "sofa-real-castlery-jaron-leather-power-recliner-armless": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737526200/crusader/variants/AS-000663-LE4023/Jaron-Leather-Power-Recliner-Armless-Sofa-Marche-Cocoa_-Front-1737526198.png",
  "sofa-real-castlery-jaron-leather-recliner-armchair": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1741571180/crusader/variants/AS-000662-LE4023/Jaron-Leathe-Wider-Arm-Recliner-Armchair-Marche-Cocoa-Angle_1-1741571179.png",
  "sofa-real-castlery-jaron-leather-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599393/crusader/variants/AS-000667-LE4023/Jaron-Leather-Chaise-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Angle-1737599392.png",
  "sofa-real-castlery-jaron-leather-l-shaped-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599831/crusader/variants/AS-000666-LE4023/Jaron-Leather-L-Shape-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Angle-1737599830.png",

  // ========== DAWSON VARIANTS ==========
  "sofa-real-castlery-dawson-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634716861/crusader/variants/T50440986-NG4001/Dawson-3-Seater-Sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-extended-sofa": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634717099/crusader/variants/T50440987-NG4001/Dawson-Extended-Sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-ottoman": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692451017/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Front_-1692451014.jpg",
  "sofa-real-castlery-dawson-storage-ottoman": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692451017/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Front_-1692451014.jpg",
  "sofa-real-castlery-dawson-pit-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1709779174/crusader/variants/AS-000379-NG4001/Dawson-Pit-Sectional-Sofa-Front_1_-1709779171.jpg",
  "sofa-real-castlery-dawson-wide-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1724055040/crusader/variants/AS-000625-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Bech-Linen-Front-1724055038.jpg",
  "sofa-real-castlery-dawson-wide-chaise-sectional-left": "/assets/thumbs/sofa-real-castlery-dawson-wide-chaise-sectional-left.png",
  "sofa-real-castlery-dawson-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634718495/crusader/variants/T50440988-NG4001/Dawson-Right_-Chaise-Sectional-sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-chaise-sectional-left": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634718815/crusader/variants/T50440989-NG4001/Dawson-Left_-Chaise-Sectional-sofa-Beach-Linen-Front.jpg",
  "sofa-real-castlery-dawson-swivel-armchair": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692591108/crusader/variants/54000131-NG4001/Dawson-Swivel-Armchair-Front-1692591104.jpg",
  "sofa-real-castlery-dawson-leather-pit-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1715669133/crusader/variants/AS-000550/Dawson-Pit-Sectional-Sofa-Cocoa-Angle-1715669132.png",

  // ========== DINING TABLES - BRIGHTON, KELSEY, FORMA ==========
  // ========== DINING TABLES - BRIGHTON, KELSEY, FORMA, CASA, SAWYER ==========
  "dining-real-castlery-brighton-oval-180": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1638151292/crusader/variants/52460074/Brighton-Oval-Dining-Table-Front.jpg",
  "dining-real-castlery-kelsey-rectangle-200": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000519/Kelsey-Rectangle-Dining-Table-Front.png",
  "dining-real-castlery-forma-round-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000520/Forma-Round-Dining-Table-Front.png",
  "dining-real-castlery-casa-oval-180": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000521/Casa-Oval-Dining-Table-Front.png",
  "dining-real-castlery-sawyer-rectangle-200": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1693799971/crusader/variants/AS-000522/Sawyer-Rectangle-Dining-Table-Front.png",
  "dining-real-castlery-kelsey-marble-160-walnut": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624443066/crusader/variants/52460082/Kelsey-Marble-Dining-Table-160cm-Walnut-Stain-Front.jpg",
  "dining-real-castlery-kelsey-marble-160-white-wash": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1660199612/crusader/variants/52460092/Kelsey-Marble-Dining-Table-160-Natural-Front-1660199609.jpg",
  "dining-real-castlery-kelsey-marble-180": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1660199639/crusader/variants/52460093/Kelsey-Marble-Dining-Table-180-Natural-Front-1660199637.jpg",
  "dining-real-castlery-forma-round-90-walnut": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769049964/crusader/variants/AS-001037-WA/Forma-Round-Dining-Table-90cm-Walnut-Front-1769049962.jpg",
  "dining-real-castlery-forma-oval-150-walnut": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769050317/crusader/variants/AS-001039-WA/Forma-Oval-Dining-Table-150cm-Walnut-Front-1769050315.jpg",
  "dining-real-castlery-sloane-travertine-225": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723777218/crusader/variants/AS-000565/Sloane-Travertine-Dining-Table-225cm-Angle-1723777216.jpg",
  "dining-real-castlery-casa-dining-table-154": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1756455069/crusader/variants/40550342/Casa-Rectangular-Dining-Table-154cm-Angle_1-1756455067.png",
  "dining-real-castlery-sawyer-rectangular-coffee-table-120": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692436666/crusader/variants/50220010/Sawyer-Rectangular-Coffee-Table-120cm_-Angle-1692436664.png",

  // ========== COFFEE TABLES - HARPER, SEB, PERI, VENTO, CASA ==========
  "coffee-real-castlery-harper-marble-rectangular": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741077857/crusader/variants/40550279/Harper-Marble-Rectangular-Coffee-Table_-_Chestnut-Front-1741077855.jpg",
  "coffee-real-castlery-harper-marble-round": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741077787/crusader/variants/40550280/Harper-Marble-Round-Coffee-Table_-_Chestnut-Front-1741077785.jpg",
  "coffee-real-castlery-harper-marble-side": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740018494/crusader/variants/40550278/Harper-Marble-Side-Table_-_Chestnut-Front-1740018492.png",
  "coffee-real-castlery-harper-marble-storage-side": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1740019462/crusader/variants/40550291/Harper-Marble-Storage-Side-Table_-_Chestnut-Front-1740019460.png",
  "coffee-real-castlery-seb-rectangular-marble": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1739498139/crusader/variants/40550283/Seb-Rectangular-Marble-Coffee-Table-Front-1739498136.png",
  "coffee-real-castlery-seb-round-marble": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1739498073/crusader/variants/40550282/Seb-Round-Marble-Coffee-Table-Front-1739498071.png",
  "coffee-real-castlery-seb-storage": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1768897928/crusader/variants/40550392/Seb-Coffee-Table-90cm-Front-1768897926.jpg",
  "coffee-real-castlery-peri": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1641292754/crusader/variants/50850023/Peri-Coffee-Table-Front.jpg",
  "coffee-real-castlery-vento-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1770256447/crusader/variants/44250004/Vento-Coffee-Table-120cm-Front_1-1770256444.jpg",
  "coffee-real-castlery-casa-round-85": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1689234557/crusader/variants/40550226/Casa-Round-Coffee-Table-Front-1689234555.png",

  // ========== TV CONSOLES - SAWYER, SEB, SLOANE, CASA, VENTO ==========
  "console-real-castlery-sawyer-tv-200": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1673927310/crusader/variants/50220001/Sawyer-TV-Console-Angle-1673927308.png",
  "console-real-castlery-seb-tv-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768897986/crusader/variants/40550391/Seb-TV-Console-150cm-Front-1768897984.png",
  "console-real-castlery-sloane-tv-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.png",
  "console-real-castlery-casa-tv-150": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1756455117/crusader/variants/40550345/Casa-TV-Console-150cm-Front-1756455114.png",
  "console-real-castlery-vento-tv-120": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1770256168/crusader/variants/44250007/Vento-TV-Console-120cm-Front-1770256166.png",

  // ========== TV CONSOLES - CARD THUMB FALLBACKS (exact catalog IDs) ==========
  "tv-real-castlery-casa-tv-console-150": "/assets/thumbs/tv-real-castlery-casa-tv-console-150.jpg",
  "tv-real-castlery-casa-tv-console-200": "/assets/thumbs/tv-real-castlery-casa-tv-console-200.jpg",
  "tv-real-castlery-sawyer-tv-console-200": "/assets/thumbs/tv-real-castlery-sawyer-tv-console-200.png",
  "tv-real-castlery-seb-tv-console-150": "/assets/thumbs/tv-real-castlery-seb-tv-console-150.jpg",
  "tv-real-castlery-seb-tv-console-200": "/assets/thumbs/tv-real-castlery-seb-tv-console-200.jpg",
  "tv-real-castlery-sloane-tv-console-150": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.jpg",
  "tv-real-castlery-sloane-tv-console-200": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1667991824/crusader/variants/50520001/Sloane-TV-Console-Fornt-1667991822.jpg",
  "accessory-real-castlery-blanc-arched-table-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697702180/crusader/variants/50230005/Blanc-Arched-Table-Lamp_1-1697702178.jpg",
  "accessory-real-castlery-edgar-duo-bulb-table-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710497549/crusader/variants/PB-001135/Edgar-Duo-Bulb-Table-Lamp_1-1710497546.jpg",
  "accessory-real-castlery-faro-sculptural-floor-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1697702564/crusader/variants/50230008/Faro-Sculptural-Floor-Lamp_1-1697702562.jpg",
  "accessory-real-castlery-faro-table-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756370395/crusader/variants/52240024/Faro-Table-Lamp-Front_1-1756370393.jpg",
  "accessory-real-castlery-cedric-floor-lamp": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756370174/crusader/variants/52240027/Cedric-Floor-Lamp-Front_1-1756370170.jpg",
  "accessory-real-castlery-cedric-floor-lamp-with-table": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756370230/crusader/variants/52240025/Cedric-Floor-Lamp-With-Table-Front_1-1756370228.jpg",
  "accessory-real-castlery-cedric-table-lamp-28-8cm-curved": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769048978/crusader/variants/52240032/Cedric-Small-Table-Lamp-Front-1769048976.jpg",
  "accessory-real-castlery-cedric-table-lamp-53cm-curved": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769049026/crusader/variants/52240034/Cedric-Large-Table-Lamp-Front-1769049024.jpg",

  // ========== STORAGE - SAWYER SIDEBOARD ==========
  "storage-real-castlery-sawyer-sideboard-180cm": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1681350762/crusader/variants/50220002/Sawyer-Sideboard-Front_-1681350759.jpg",

  // ========== COFFEE TABLES - HUGG NESTING ==========
  "coffee-real-castlery-hugg-nesting-square": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564998/crusader/variants/AS-000635-AR4002-NA/Hugg-Square-Coffee-Table-Natural-Performance-Basalt-Front-1729564995.jpg",

  // ========== COFFEE TABLES - CARD THUMB FALLBACKS (exact catalog IDs) ==========
  "coffee-real-castlery-harper-marble-rectangular-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741077857/crusader/variants/40550279/Harper-Marble-Rectangular-Coffee-Table_-_Chestnut-Front-1741077855.jpg",
  "coffee-real-castlery-harper-marble-round-915": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1741077787/crusader/variants/40550280/Harper-Marble-Round-Coffee-Table_-_Chestnut-Front-1741077785.jpg",
  "coffee-real-castlery-peri-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1641292754/crusader/variants/50850023/Peri-Coffee-Table-Front.jpg",
  "coffee-real-castlery-seb-storage-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1623727578/crusader/variants/40550098/Seb-Coffee-Table-Front.jpg",
  "coffee-real-castlery-seb-storage-90": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1768897928/crusader/variants/40550392/Seb-Coffee-Table-90cm-Front-1768897926.jpg",
  "coffee-real-castlery-vento-coffee-table-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1770256447/crusader/variants/44250004/Vento-Coffee-Table-120cm-Front_1-1770256444.jpg",
  "coffee-real-castlery-arcadia-coffee-table": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Front-1745228055.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564998/crusader/variants/AS-000635-AR4002-NA/Hugg-Square-Coffee-Table-Natural-Performance-Basalt-Front-1729564995.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564998/crusader/variants/AS-000635-AR4002-NA/Hugg-Square-Coffee-Table-Natural-Performance-Basalt-Front-1729564995.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-dune-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564013/crusader/variants/AS-000635-AR4001-NA/Hugg-Square-Coffee-Table-Natural-Performance-Dune_-Front-1729564011.jpg",
  "coffee-real-castlery-hugg-nesting-square-performance-dune-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564013/crusader/variants/AS-000635-AR4001-NA/Hugg-Square-Coffee-Table-Natural-Performance-Dune_-Front-1729564011.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729496469/crusader/variants/AS-000633-AR4002-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Basalt-Front-1729496467.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729496469/crusader/variants/AS-000633-AR4002-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Basalt-Front-1729496467.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729561925/crusader/variants/AS-000633-AR4001-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Dune-Front-1729561922.jpg",
  "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729561925/crusader/variants/AS-000633-AR4001-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Dune-Front-1729561922.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837267/crusader/variants/AS-000634-AR4002-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Basalt-Front-1729837264.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837267/crusader/variants/AS-000634-AR4002-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Basalt-Front-1729837264.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-closed": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837371/crusader/variants/AS-000634-AR4001-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Dune-Front-1729837369.jpg",
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-opened": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837371/crusader/variants/AS-000634-AR4001-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Dune-Front-1729837369.jpg",

  // ========== DINING TABLES - CARD THUMB FALLBACKS (exact catalog IDs) ==========
  "dining-real-castlery-forma-oval-150": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769050317/crusader/variants/AS-001039-WA/Forma-Oval-Dining-Table-150cm-Walnut-Front-1769050315.jpg",
  "dining-real-castlery-forma-round-120": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769050193/crusader/variants/AS-001038-WA/Forma-Round-Dining-Table-120cm-Walnut-Front-1769050191.jpg",
  "dining-real-castlery-forma-round-90": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1769049964/crusader/variants/AS-001037-WA/Forma-Round-Dining-Table-90cm-Walnut-Front-1769049962.jpg",
  "dining-real-castlery-kelsey-marble-160": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1660199612/crusader/variants/52460092/Kelsey-Marble-Dining-Table-160-Natural-Front-1660199609.jpg",
};

const LEGACY_MODEL_LABEL_OVERRIDES: Record<string, string> = {
  "armchair-real-castlery-avery-performance-armchair": "Armchair",
  "armchair-real-castlery-avery-performance-armchair-with-ottoman": "Armchair with Ottoman",
  "armchair-real-castlery-avery-performance-swivel-armchair": "Swivel Armchair",
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman":
    "Swivel Armchair with Ottoman",
};

function normalizeStyleTags(tags: string[]): StyleTag[] {
  const normalized = tags
    .map((tag) => STYLE_TAG_MAP[tag.toLowerCase()])
    .filter(Boolean) as StyleTag[];
  return Array.from(new Set(normalized));
}

function buildCommerceMapping(product: Product): CommerceMapping {
  const defaultVariant =
    product.variants.find((v) => v.id === product.defaultVariantId) ??
    product.variants[0];
  const shopifyVariantId =
    defaultVariant?.shopifyVariantId ?? product.shopifyVariantId;

  if (product.purchaseMode === "shopify") {
    return {
      type: "shopify",
      data: {
        productId: product.id,
        variantId: shopifyVariantId ?? product.id,
        available: Boolean(shopifyVariantId),
      },
    };
  }

  if (product.purchaseMode === "affiliate") {
    return {
      type: "affiliate",
      data: {
        url: product.buyUrl ?? "",
        retailer: product.retailer ?? "affiliate",
        priceHint: product.price,
      },
    };
  }

  return { type: "not_buyable", reason: "missing purchase mapping" };
}

function buildCatalogItem(product: Product): CatalogItemSchema {
  const category = product.category as NormalizedCategory;
  const defaults = CATEGORY_DEFAULTS[category] ?? CATEGORY_DEFAULTS.other;
  
  // Try to get asset from MODEL_ASSETS registry
  const assetId = LEGACY_ASSET_ID_OVERRIDES[product.id] ?? product.id;
  const modelAsset = getModelAsset(assetId);
  
  // Use MODEL_ASSETS data if available, otherwise fall back to product dimensions
  const dimensionsMm = modelAsset?.dimsMm ?? {
    w: Math.round(product.dimensions.w * 1000),
    d: Math.round(product.dimensions.d * 1000),
    h: Math.round(product.dimensions.h * 1000),
  };
  
  const bounds = modelAsset?.bounds ? {
    type: "aabb" as const,
    size: {
      w: modelAsset.bounds.size.x,
      d: modelAsset.bounds.size.z,
      h: modelAsset.bounds.size.y,
    },
    center: [
      modelAsset.bounds.center.x,
      modelAsset.bounds.center.y,
      modelAsset.bounds.center.z,
    ] as [number, number, number],
  } : {
    type: "aabb" as const,
    size: {
      w: product.dimensions.w,
      d: product.dimensions.d,
      h: product.dimensions.h,
    },
    center: [0, product.dimensions.h / 2, 0] as [number, number, number],
  };
  
  const pivot = modelAsset?.pivot ?? {
    offsetX: 0,
    offsetZ: 0,
    groundAligned: true,
  };
  const modelLabel = LEGACY_MODEL_LABEL_OVERRIDES[product.id];
  const metadata: CatalogItemSchema["metadata"] = {
    ...(product.galleryImages ? { galleryImages: product.galleryImages } : {}),
    ...(product.mediaPresentationMode ? { mediaPresentationMode: product.mediaPresentationMode } : {}),
    ...(modelLabel ? { modelLabel } : {}),
  };
  const averyStockedOnly = product.id.endsWith("-with-ottoman");
  const productVariants = product.id.startsWith("armchair-real-castlery-avery-performance-")
    ? buildAveryUpholsteryVariants({
        thumbnailUrl:
          product.variants[0]?.thumbnailUrl ??
          LEGACY_THUMB_URL_OVERRIDES[product.id] ??
          `/assets/thumbs/${product.id}.png`,
        galleryImages: product.variants[0]?.galleryImages ?? product.galleryImages ?? [],
        stockedOnly: averyStockedOnly,
      })
    : product.variants;

  return {
    id: product.id,
    slug: product.id,
    title: product.name,
    category,
    description: undefined,

    dimsMm: dimensionsMm,
    dimensionsMm,
    bounds,
    pivot,
    defaultRotation: 0,

    placementRules: defaults.placement,
    clearanceRules: defaults.clearance,

    styleTags: normalizeStyleTags(product.styleTags),
    toneTags: [],
    roomTags: [],

    assets: {
      assetId,
      modelUrl:
        modelAsset?.modelUrl ??
        product.modelUrl ??
        (LEGACY_NO_MODEL_IDS.has(product.id) || product.category === "rug"
          ? ""
          : undefined) ??
        `/assets/models/${product.id}.glb`,
      thumbUrl:
        modelAsset?.thumbUrl ??
        LEGACY_THUMB_URL_OVERRIDES[product.id] ??
        `/assets/thumbs/${product.id}.png`,
      materialsProfile: {
        preset: DEFAULT_MATERIAL_PRESET,
      },
    },
    variants: productVariants.map((variant) => ({
      id: variant.id,
      label: variant.name,
      colorHex: variant.colorHex,
      finishCode: variant.finishCode,
      finishLabel: variant.finishLabel,
      materialType: variant.materialType,
      swatchGroup: variant.swatchGroup,
      swatchHex: variant.swatchHex,
      swatchTextureUrl: variant.swatchTextureUrl,
      collectionType: variant.collectionType,
      thumbnailUrl:
        variant.thumbnailUrl ??
        LEGACY_THUMB_URL_OVERRIDES[product.id] ??
        `/assets/thumbs/${product.id}-${variant.id}.png`,
      galleryImages: variant.galleryImages,
      mediaPresentationMode: variant.mediaPresentationMode,
      dimensionsMm: variant.dimensionsMm,
      sizeLabel: variant.sizeLabel,
      modelUrl: variant.modelUrl,
      affiliateUrl: resolveCastleryVariantAffiliateUrl({
        productId: product.id,
        sourceUrl: product.buyUrl,
        authoredAffiliateUrl: variant.affiliateUrl,
        variantId: variant.id,
        finishCode: variant.finishCode,
        finishLabel: variant.finishLabel,
        materialType: variant.materialType,
      }),
      priceHint: variant.priceHint,
      available: variant.available,
    })),
    defaultVariantId: product.defaultVariantId,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,

    commerce: buildCommerceMapping(product),

    aiRoles: defaults.aiRoles,
    tags: product.styleTags,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// ============================================================================
// LEGACY CATALOG (Internal use only - do not export)
// ============================================================================

const HUGG_SQUARE_URL = "https://www.castlery.com/sg/products/hugg-nesting-square-coffee-table";
const HUGG_RECTANGULAR_URL = "https://www.castlery.com/sg/products/hugg-nesting-rectangular-coffee-table";
const HUGG_SIDE_TABLE_URL = "https://www.castlery.com/sg/products/hugg-nesting-side-table";

const HUGG_SQUARE_VARIANT_IMAGES = {
  performanceDune: {
    natural:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564013/crusader/variants/AS-000635-AR4001-NA/Hugg-Square-Coffee-Table-Natural-Performance-Dune_-Front-1729564011.jpg",
    chestnut:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564332/crusader/variants/AS-000635-AR4001-CT/Hugg-Square-Coffee-Table-Chestnut-Performance-Dune_-Front-1729564330.jpg",
    black:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564820/crusader/variants/AS-000635-AR4001-BLK/Hugg-Square-Coffee-Table-Black-Performance-Dune-Front-1729564818.jpg",
  },
  performanceBasalt: {
    natural:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564998/crusader/variants/AS-000635-AR4002-NA/Hugg-Square-Coffee-Table-Natural-Performance-Basalt-Front-1729564995.jpg",
    chestnut:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729502859/crusader/variants/AS-000635-AR4002-CT/Hugg-Square-Coffee-Table-Chestnut-Performance-Basalt-Front-1729502856.jpg",
    black:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729502719/crusader/variants/AS-000635-AR4002-BLK/Hugg-Square-Coffee-Table-Black-Performance-Basalt-Front-1729502716.jpg",
  },
  detail:
    "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729564019/crusader/variants/AS-000635-AR4001-NA/Hugg-Square-Coffee-Table-Natural-Performance-Dune_-Angle_1-1729564017.jpg",
  lifestyle:
    "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1765850661/crusader/variants/AS-000635-AR4001-NA/Hugg-Square-Coffee-Table-In-Dune-Natural-Square-Set_2-1765850658.jpg",
} as const;

const HUGG_FAMILY_LIFESTYLE_IMAGE = HUGG_SQUARE_VARIANT_IMAGES.lifestyle;

const HUGG_RECTANGULAR_VARIANT_IMAGES = {
  performanceDune: {
    natural:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729563480/crusader/variants/AS-000633-AR4001-NA/Hugg-Rectangular-Coffee-Table-Natural-Performance-Dune-Front-1729563478.jpg",
    chestnut:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729561925/crusader/variants/AS-000633-AR4001-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Dune-Front-1729561922.jpg",
    black:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729563717/crusader/variants/AS-000633-AR4001-BLK/Hugg-Rectangular-Coffee-Table-Black-Performance-Dune-Front-1729563715.jpg",
  },
  performanceBasalt: {
    natural:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729563860/crusader/variants/AS-000633-AR4002-NA/Hugg-Rectangular-Coffee-Table-Natural-Performance-Basalt-Front-1729563858.jpg",
    chestnut:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729496469/crusader/variants/AS-000633-AR4002-CT/Hugg-Rectangular-Coffee-Table-Chestnut-Performance-Basalt-Front-1729496467.jpg",
    black:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729497150/crusader/variants/AS-000633-AR4002-BLK/Hugg-Rectangular-Coffee-Table-Black-Performance-Basalt-Front-1729497148.jpg",
  },
} as const;

const HUGG_SIDE_TABLE_VARIANT_IMAGES = {
  performanceDune: {
    natural:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837567/crusader/variants/AS-000634-AR4001-NA/Hugg-Nesting-Side-Table-Natural-Performance-Dune-Front-1729837565.jpg",
    chestnut:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837371/crusader/variants/AS-000634-AR4001-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Dune-Front-1729837369.jpg",
    black:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837174/crusader/variants/AS-000634-AR4001-BLK/Hugg-Nesting-Side-Table-Black-Performance-Dune-Front-1729837172.jpg",
  },
  performanceBasalt: {
    natural:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837485/crusader/variants/AS-000634-AR4002-NA/Hugg-Nesting-Side-Table-Natural-Performance-Basalt-Front-1729837483.jpg",
    chestnut:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729837267/crusader/variants/AS-000634-AR4002-CT/Hugg-Nesting-Side-Table-Chestnut-Performance-Basalt-Front-1729837264.jpg",
    black:
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1729836921/crusader/variants/AS-000634-AR4002-BLK/Hugg-Nesting-Side-Table-Black-Performance-Basalt-Front-1729836919.jpg",
  },
} as const;

const HUGG_SQUARE_GALLERIES = {
  performanceDune: [
    HUGG_SQUARE_VARIANT_IMAGES.performanceDune.natural,
    HUGG_SQUARE_VARIANT_IMAGES.performanceDune.chestnut,
    HUGG_SQUARE_VARIANT_IMAGES.performanceDune.black,
    HUGG_SQUARE_VARIANT_IMAGES.detail,
    HUGG_SQUARE_VARIANT_IMAGES.lifestyle,
  ],
  performanceBasalt: [
    HUGG_SQUARE_VARIANT_IMAGES.performanceBasalt.natural,
    HUGG_SQUARE_VARIANT_IMAGES.performanceBasalt.chestnut,
    HUGG_SQUARE_VARIANT_IMAGES.performanceBasalt.black,
    HUGG_SQUARE_VARIANT_IMAGES.detail,
    HUGG_SQUARE_VARIANT_IMAGES.lifestyle,
  ],
} as const;

const HUGG_RECTANGULAR_GALLERIES = {
  performanceDune: [
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceDune.natural,
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceDune.chestnut,
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceDune.black,
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceBasalt.chestnut,
    HUGG_FAMILY_LIFESTYLE_IMAGE,
  ],
  performanceBasalt: [
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceBasalt.natural,
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceBasalt.chestnut,
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceBasalt.black,
    HUGG_RECTANGULAR_VARIANT_IMAGES.performanceDune.chestnut,
    HUGG_FAMILY_LIFESTYLE_IMAGE,
  ],
} as const;

const HUGG_SIDE_TABLE_GALLERIES = {
  performanceDune: [
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceDune.natural,
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceDune.chestnut,
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceDune.black,
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceBasalt.chestnut,
    HUGG_FAMILY_LIFESTYLE_IMAGE,
  ],
  performanceBasalt: [
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceBasalt.natural,
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceBasalt.chestnut,
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceBasalt.black,
    HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceDune.chestnut,
    HUGG_FAMILY_LIFESTYLE_IMAGE,
  ],
} as const;

function buildHuggSquareVariants(
  fabric: keyof Pick<typeof HUGG_SQUARE_VARIANT_IMAGES, "performanceDune" | "performanceBasalt">
): Variant[] {
  const images = HUGG_SQUARE_VARIANT_IMAGES[fabric];
  return [
    {
      id: "natural",
      name: "Natural",
      colorHex: "#a89070",
      finishCode: "natural",
      finishLabel: "Natural",
      swatchGroup: "wood_finish",
      swatchHex: "#a89070",
      thumbnailUrl: images.natural,
      galleryImages: [images.natural],
    },
    {
      id: "chestnut",
      name: "Chestnut",
      colorHex: "#8b6f47",
      finishCode: "chestnut",
      finishLabel: "Chestnut",
      swatchGroup: "wood_finish",
      swatchHex: "#8B6F47",
      thumbnailUrl: images.chestnut,
      galleryImages: [images.chestnut],
    },
    {
      id: "black",
      name: "Black",
      colorHex: "#1f1f1f",
      finishCode: "black",
      finishLabel: "Black",
      swatchGroup: "wood_finish",
      swatchHex: "#1f1f1f",
      thumbnailUrl: images.black,
      galleryImages: [images.black],
    },
  ];
}

function buildHuggRectangularVariants(
  fabric: keyof typeof HUGG_RECTANGULAR_VARIANT_IMAGES
): Variant[] {
  const images = HUGG_RECTANGULAR_VARIANT_IMAGES[fabric];
  return [
    {
      id: "natural",
      name: "Natural",
      colorHex: "#a89070",
      finishCode: "natural",
      finishLabel: "Natural",
      swatchGroup: "wood_finish",
      swatchHex: "#a89070",
      thumbnailUrl: images.natural,
      galleryImages: [images.natural],
    },
    {
      id: "chestnut",
      name: "Chestnut",
      colorHex: "#8b6f47",
      finishCode: "chestnut",
      finishLabel: "Chestnut",
      swatchGroup: "wood_finish",
      swatchHex: "#8B6F47",
      thumbnailUrl: images.chestnut,
      galleryImages: [images.chestnut],
    },
    {
      id: "black",
      name: "Black",
      colorHex: "#1f1f1f",
      finishCode: "black",
      finishLabel: "Black",
      swatchGroup: "wood_finish",
      swatchHex: "#1f1f1f",
      thumbnailUrl: images.black,
      galleryImages: [images.black],
    },
  ];
}

function buildHuggSideTableVariants(
  fabric: keyof typeof HUGG_SIDE_TABLE_VARIANT_IMAGES
): Variant[] {
  const images = HUGG_SIDE_TABLE_VARIANT_IMAGES[fabric];
  return [
    {
      id: "natural",
      name: "Natural",
      colorHex: "#a89070",
      finishCode: "natural",
      finishLabel: "Natural",
      swatchGroup: "wood_finish",
      swatchHex: "#a89070",
      thumbnailUrl: images.natural,
      galleryImages: [images.natural],
    },
    {
      id: "chestnut",
      name: "Chestnut",
      colorHex: "#8b6f47",
      finishCode: "chestnut",
      finishLabel: "Chestnut",
      swatchGroup: "wood_finish",
      swatchHex: "#8B6F47",
      thumbnailUrl: images.chestnut,
      galleryImages: [images.chestnut],
    },
    {
      id: "black",
      name: "Black",
      colorHex: "#1f1f1f",
      finishCode: "black",
      finishLabel: "Black",
      swatchGroup: "wood_finish",
      swatchHex: "#1f1f1f",
      thumbnailUrl: images.black,
      galleryImages: [images.black],
    },
  ];
}

const AVERY_UPHOLSTERY_SWATCHES = [
  {
    id: "white_quartz",
    name: "Performance Infinity Boucle, Light Grey (White Quartz)",
    finishLabel: "Light Grey (White Quartz)",
    colorHex: "#d8d7d2",
    finishCode: "white_quartz",
    collectionType: "stocked",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
  },
  {
    id: "performance_infinity_boucle_ginger",
    name: "Performance Infinity Boucle, Rust (Ginger)",
    finishLabel: "Rust (Ginger)",
    colorHex: "#a55f37",
    finishCode: "performance_infinity_boucle_ginger",
    collectionType: "stocked",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1710492060/crusader/variants/IN-4003/Marlow-Armless-2-Seater-Sofa-Performance-Ginger-Caramel-Square-Det_3-1710492057.jpg",
  },
  {
    id: "performance_boucle_cream",
    name: "Performance Infinity Boucle, Cream",
    finishLabel: "Cream",
    colorHex: "#e6dfd3",
    finishCode: "performance_boucle_cream",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,c_fit/v1770191309/crusader/variants/IN-4005/IN4005-Cream-1770191306.jpg",
  },
  {
    id: "performance_infinity_boucle_moss",
    name: "Performance Infinity Boucle, Moss",
    finishLabel: "Moss",
    colorHex: "#65715a",
    finishCode: "performance_infinity_boucle_moss",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,c_fit/v1770098928/crusader/variants/IN-4004/IN4004-Moss-1770098923.jpg",
  },
  {
    id: "peyton_ivory",
    name: "Performance Fleece (Peyton), Ivory (Cream)",
    finishLabel: "Ivory (Cream)",
    colorHex: "#ebe5d9",
    finishCode: "peyton_ivory",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322775/crusader/variants/PY-4001/Ivory-1722322773.jpg",
  },
  {
    id: "peyton_dove_grey",
    name: "Performance Fleece (Peyton), Medium Grey (Dove Grey)",
    finishLabel: "Medium Grey (Dove Grey)",
    colorHex: "#b7b5ae",
    finishCode: "peyton_dove_grey",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322647/crusader/variants/PY-4002/Dove-Grey-1722322645.jpg",
  },
  {
    id: "peyton_moss",
    name: "Performance Fleece (Peyton), Moss",
    finishLabel: "Moss",
    colorHex: "#697262",
    finishCode: "peyton_moss",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722320266/crusader/variants/PY-4003/Moss-1722320263.jpg",
  },
  {
    id: "peyton_cumin",
    name: "Performance Fleece (Peyton), Caramel (Cumin)",
    finishLabel: "Caramel (Cumin)",
    colorHex: "#b8793a",
    finishCode: "peyton_cumin",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1721120972/crusader/variants/PY-4004/Cumin-Swathc_1-1721120969.jpg",
  },
  {
    id: "performance_genova_oat",
    name: "Performance Linen Weave (Genova), Sand (Oat)",
    finishLabel: "Sand (Oat)",
    colorHex: "#cfc2af",
    finishCode: "performance_genova_oat",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1757063296/crusader/variants/PG-4002/Mori-Armchair-Oat-Walnut-Leg-Det_2-1757063296.jpg",
  },
  {
    id: "performance_linen_weave_cream",
    name: "Performance Linen Weave (Genova), Cream",
    finishLabel: "Cream",
    colorHex: "#e8dfd2",
    finishCode: "performance_linen_weave_cream",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188184/crusader/variants/PG-4003/PG4003-Cream-1770188182.jpg",
  },
  {
    id: "performance_linen_weave_light_grey",
    name: "Performance Linen Weave (Genova), Light Grey",
    finishLabel: "Light Grey",
    colorHex: "#bfc1bd",
    finishCode: "performance_linen_weave_light_grey",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188172/crusader/variants/PG-4004/PG4004-Light-Grey-1770188170.jpg",
  },
  {
    id: "performance_twill_creamy_white",
    name: "Performance Creamy White",
    finishLabel: "Creamy White",
    colorHex: "#eee8dc",
    finishCode: "performance_twill_creamy_white",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
  },
  {
    id: "performance_twill_pearl_beige",
    name: "Performance Twill, Pearl Beige",
    finishLabel: "Pearl Beige",
    colorHex: "#d6c8b7",
    finishCode: "performance_twill_pearl_beige",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1747116409/crusader/variants/PT-4002/Levi-Office-Chair-Twill-Pearl-Beige-Square-Det_4-1747116407.jpg",
  },
  {
    id: "performance_twill_medium_grey",
    name: "Performance Twill, Medium Grey",
    finishLabel: "Medium Grey",
    colorHex: "#9f9f99",
    finishCode: "performance_twill_medium_grey",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769061840/crusader/variants/PT-4005/PT4005-Performance-Twill-Dove-Grey-1769061838.jpg",
  },
  {
    id: "performance_twill_slate",
    name: "Performance Twill, Slate",
    finishLabel: "Slate",
    colorHex: "#4f5552",
    finishCode: "performance_twill_slate",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1756361613/crusader/variants/PT-4003/Performance-Twill-Slate-1756361610.jpg",
  },
  {
    id: "performance_twill_moss",
    name: "Performance Twill, Moss",
    finishLabel: "Moss",
    colorHex: "#69705d",
    finishCode: "performance_twill_moss",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1756438801/crusader/variants/PT-4004/Moss-1756438798.jpg",
  },
  {
    id: "washed_chenille_cream",
    name: "Washed Chenille, Cream",
    finishLabel: "Cream",
    colorHex: "#e8dfcf",
    finishCode: "washed_chenille_cream",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054456/crusader/variants/GR-4001/GR4001-Greta-Ivory-1769054453.jpg",
  },
  {
    id: "washed_chenille_sand",
    name: "Washed Chenille, Sand",
    finishLabel: "Sand",
    colorHex: "#c8b39c",
    finishCode: "washed_chenille_sand",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188296/crusader/variants/GR-4002/GR4002-Latte-1770188293.jpg",
  },
  {
    id: "washed_chenille_caramel",
    name: "Washed Chenille, Caramel",
    finishLabel: "Caramel",
    colorHex: "#a87542",
    finishCode: "washed_chenille_caramel",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054464/crusader/variants/GR-4003/GR4003-Greta-Mustard-Brown-1769054461.jpg",
  },
  {
    id: "washed_chenille_moss",
    name: "Washed Chenille, Moss",
    finishLabel: "Moss",
    colorHex: "#68715e",
    finishCode: "washed_chenille_moss",
    collectionType: "custom",
    swatchTextureUrl:
      "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054472/crusader/variants/GR-4004/GR4004-Greta-Moss-1769054469.jpg",
  },
] satisfies Array<
  Pick<
    Variant,
    | "id"
    | "name"
    | "finishLabel"
    | "colorHex"
    | "finishCode"
    | "collectionType"
    | "swatchTextureUrl"
  >
>;

function buildAveryUpholsteryVariants(params: {
  thumbnailUrl: string;
  galleryImages: string[];
  stockedOnly?: boolean;
}): Variant[] {
  const swatches = params.stockedOnly
    ? AVERY_UPHOLSTERY_SWATCHES.filter((swatch) => swatch.collectionType === "stocked")
    : AVERY_UPHOLSTERY_SWATCHES;

  return swatches.map((swatch) => ({
    ...swatch,
    materialType: "Fabric",
    swatchGroup: "upholstery_option",
    swatchHex: swatch.colorHex,
    thumbnailUrl: params.thumbnailUrl,
    galleryImages: params.galleryImages,
  }));
}

const CATALOG: Record<string, Product> = {
  // =========================
  // DINING TABLES
  // =========================
  "dining-real-castlery-sloane-travertine-180": {
    id: "dining-real-castlery-sloane-travertine-180",
    name: "Castlery Sloane Travertine Dining Table 180cm",
    category: "dining_table",
    price: 1999,
    dimensions: { w: 1.8, d: 0.9, h: 0.76 },
    styleTags: ["modern", "minimalistic", "luxury"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723776681/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Front-1723776679.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723777296/crusader/variants/TAS-000564/Sloane-Travertine-Dining-Table-180cm-Dim-1723777294.jpg",
    ],
    defaultVariantId: "180_grey_oak",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl:
      "https://www.castlery.com/sg/products/sloane-travertine-dining-table?length=1_8m",
    modelUrl: "/assets/models/dining-real-castlery-sloane-travertine-180.glb",
    variants: [
      {
        id: "180_grey_oak",
        name: "180cm / Grey Oak",
        colorHex: "#4b453b",
        dimensionsMm: { w: 1800, d: 900, h: 760 },
        sizeLabel: "180cm",
        modelUrl: "/assets/models/dining-real-castlery-sloane-travertine-180.glb",
        affiliateUrl:
          "https://www.castlery.com/sg/products/sloane-travertine-dining-table?length=1_8m",
        priceHint: 1999,
        available: true,
        finishCode: "grey_oak",
        finishLabel: "Grey Oak",
        materialType: "Wood",
        swatchGroup: "wood_finish",
        swatchHex: "#4b453b",
        swatchTextureUrl:
          "https://res.cloudinary.com/castlery/image/upload/w_128,f_auto,q_auto/v1678775201/knight/cms/swatch/Sloane-Dining-Chair_Swatch_1_1.jpg",
        collectionType: "stocked",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723776681/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Front-1723776679.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723776681/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Front-1723776679.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723777296/crusader/variants/TAS-000564/Sloane-Travertine-Dining-Table-180cm-Dim-1723777294.jpg",
        ],
      },
    ],
  },

  // =========================
  // BEDS
  // =========================
  "bed-real-castlery-lexi-tufted": {
    id: "bed-real-castlery-lexi-tufted",
    name: "Castlery Lexi Tufted Bed",
    category: "bed",
    price: 949,
    dimensions: { w: 1.63, d: 2.28, h: 1.14 },
    styleTags: ["modern", "minimalistic"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634541304/crusader/variants/54000038-CY4002/Lexi-Queen-Size-Bed-Nickel-Grey-Front_1-SG.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655221914/crusader/variants/50440066-CY4002/Lexi-Queen-Size-Bed-Nickel-Grey-Dim-SG-1655221911.jpg",
    ],
    defaultVariantId: "queen_nickel_grey",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/lexi-tufted-bed?bed_frame_size=queen&material=nickel_grey",
    modelUrl: "/assets/models/bed-real-castlery-lexi-tufted-queen-nickel-grey.glb",
    variants: [
      {
        id: "queen_nickel_grey",
        name: "Nickel Grey (Fabric)",
        colorHex: "#8b8983",
        dimensionsMm: { w: 1630, d: 2280, h: 1140 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-lexi-tufted-queen-nickel-grey.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/lexi-tufted-bed?bed_frame_size=queen&material=nickel_grey",
        priceHint: 949,
        available: true,
        finishCode: "nickel_grey",
        finishLabel: "Nickel Grey",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#8b8983",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1634527192/crusader/variants/CY-4002/Nickel-Grey_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634541304/crusader/variants/54000038-CY4002/Lexi-Queen-Size-Bed-Nickel-Grey-Front_1-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634541304/crusader/variants/54000038-CY4002/Lexi-Queen-Size-Bed-Nickel-Grey-Front_1-SG.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655221914/crusader/variants/50440066-CY4002/Lexi-Queen-Size-Bed-Nickel-Grey-Dim-SG-1655221911.jpg",
        ],
      },
      {
        id: "queen_frost_white",
        name: "Frost White (Fabric)",
        colorHex: "#ded9d1",
        dimensionsMm: { w: 1630, d: 2280, h: 1140 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-lexi-tufted-queen-frost-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/lexi-tufted-bed?bed_frame_size=queen&material=frost_white",
        priceHint: 949,
        available: true,
        finishCode: "frost_white",
        finishLabel: "Frost White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ded9d1",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1634527192/crusader/variants/CY-4001/Frost-White_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634530364/crusader/variants/54000038-CY4001/Lexi-Queen-Size-Bed-Frost-White-Front_1-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634530364/crusader/variants/54000038-CY4001/Lexi-Queen-Size-Bed-Frost-White-Front_1-SG.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655221911/crusader/variants/50440066-CY4001/Lexi-Queen-Size-Bed-Frost-White-Dim-SG-1655221908.jpg",
        ],
      },
      {
        id: "queen_light_blush",
        name: "Light Blush (Fabric)",
        colorHex: "#d6c9c1",
        dimensionsMm: { w: 1630, d: 2280, h: 1140 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-lexi-tufted-queen-light-blush.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/lexi-tufted-bed?bed_frame_size=queen&material=light_blush",
        priceHint: 949,
        available: true,
        finishCode: "light_blush",
        finishLabel: "Light Blush",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d6c9c1",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1634527192/crusader/variants/CY-4003/Light-Blush_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634540645/crusader/variants/54000038-CY4003/Lexi-Queen-Size-Bed-Light-Blush-Front_1-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634540645/crusader/variants/54000038-CY4003/Lexi-Queen-Size-Bed-Light-Blush-Front_1-SG.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655221910/crusader/variants/50440066-CY4003/Lexi-Queen-Size-Bed-Light-Blush-Dim-SG-1655221907.jpg",
        ],
      },
      {
        id: "king_nickel_grey",
        name: "Nickel Grey (Fabric)",
        colorHex: "#8b8983",
        dimensionsMm: { w: 1930, d: 2280, h: 1140 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-lexi-tufted-king-nickel-grey.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/lexi-tufted-bed?bed_frame_size=king&material=nickel_grey",
        priceHint: 1039,
        available: true,
        finishCode: "nickel_grey",
        finishLabel: "Nickel Grey",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#8b8983",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1634527192/crusader/variants/CY-4002/Nickel-Grey_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639361227/crusader/variants/54000036-CY4002/Lexi-King-Size-Bed-Nickel-Grey-Front_1-AU.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639361227/crusader/variants/54000036-CY4002/Lexi-King-Size-Bed-Nickel-Grey-Front_1-AU.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655221918/crusader/variants/50440065-CY4002/Lexi-King-Size-Bed-Nickel-Grey-Dim-SG-1655221916.jpg",
        ],
      },
      {
        id: "king_frost_white",
        name: "Frost White (Fabric)",
        colorHex: "#ded9d1",
        dimensionsMm: { w: 1930, d: 2280, h: 1140 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-lexi-tufted-king-frost-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/lexi-tufted-bed?bed_frame_size=king&material=frost_white",
        priceHint: 1039,
        available: true,
        finishCode: "frost_white",
        finishLabel: "Frost White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ded9d1",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1634527192/crusader/variants/CY-4001/Frost-White_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639361174/crusader/variants/54000036-CY4001/Lexi-King-Size-Bed-Frost-White-Front_1-AU.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639361174/crusader/variants/54000036-CY4001/Lexi-King-Size-Bed-Frost-White-Front_1-AU.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655221917/crusader/variants/50440065-CY4001/Lexi-King-Size-Bed-Frost-White-Dim-SG-1655221915.jpg",
        ],
      },
      {
        id: "king_light_blush",
        name: "Light Blush (Fabric)",
        colorHex: "#d6c9c1",
        dimensionsMm: { w: 1930, d: 2280, h: 1140 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-lexi-tufted-king-light-blush.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/lexi-tufted-bed?bed_frame_size=king&material=light_blush",
        priceHint: 1039,
        available: true,
        finishCode: "light_blush",
        finishLabel: "Light Blush",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d6c9c1",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1634527192/crusader/variants/CY-4003/Light-Blush_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639361316/crusader/variants/54000036-CY4003/Lexi-King-Size-Bed-Light-Blush-Front_1-AU.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639361316/crusader/variants/54000036-CY4003/Lexi-King-Size-Bed-Light-Blush-Front_1-AU.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655221915/crusader/variants/50440065-CY4003/Lexi-King-Size-Bed-Light-Blush-Dim-SG-1655221912.jpg",
        ],
      },
    ],
  },
  "bed-real-castlery-joseph": {
    id: "bed-real-castlery-joseph",
    name: "Castlery Joseph Bed",
    category: "bed",
    price: 1069,
    dimensions: { w: 1.612, d: 2.106, h: 0.96 },
    styleTags: ["modern", "minimalistic"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655220653/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-SG-Dim-1655220650.jpg",
    ],
    defaultVariantId: "queen_fabric_stone_grey",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/joseph-bed?bed_frame_size=queen&material=stone_grey",
    modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-queen-stone-grey.glb",
    variants: [
      {
        id: "queen_fabric_stone_grey",
        name: "Fabric bedframe - Stone Grey",
        colorHex: "#8b8983",
        dimensionsMm: { w: 1612, d: 2106, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-queen-stone-grey.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed?bed_frame_size=queen&material=stone_grey",
        priceHint: 1069,
        available: true,
        finishCode: "fabric_stone_grey",
        finishLabel: "Fabric bedframe - Stone Grey",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#8b8983",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1653637272/crusader/variants/TE-4004/Ethan-Armchair-Sofa-Stone-Grey-Square-Det_2-1653637269.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655220653/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-SG-Dim-1655220650.jpg",
        ],
      },
      {
        id: "king_fabric_stone_grey",
        name: "Fabric bedframe - Stone Grey",
        colorHex: "#8b8983",
        dimensionsMm: { w: 1912, d: 2106, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-king-stone-grey.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed?bed_frame_size=king&material=stone_grey",
        priceHint: 1199,
        available: true,
        finishCode: "fabric_stone_grey",
        finishLabel: "Fabric bedframe - Stone Grey",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#8b8983",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1653637272/crusader/variants/TE-4004/Ethan-Armchair-Sofa-Stone-Grey-Square-Det_2-1653637269.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
        ],
      },
      {
        id: "queen_fabric_ivory_beige",
        name: "Fabric bedframe - Ivory Beige",
        colorHex: "#d8d0c4",
        dimensionsMm: { w: 1612, d: 2106, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-queen-ivory-beige.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed?bed_frame_size=queen&material=ivory_beige",
        priceHint: 1069,
        available: true,
        finishCode: "fabric_ivory_beige",
        finishLabel: "Fabric bedframe - Ivory Beige",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d8d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1627631594/crusader/variants/LW-4001/Ivory-Beige_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050274/crusader/variants/52460070-LW4001/Joseph-Queen-Size-Bed-Ivory-Beige-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050274/crusader/variants/52460070-LW4001/Joseph-Queen-Size-Bed-Ivory-Beige-Front-SG.jpg",
        ],
      },
      {
        id: "king_fabric_ivory_beige",
        name: "Fabric bedframe - Ivory Beige",
        colorHex: "#d8d0c4",
        dimensionsMm: { w: 1912, d: 2106, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-king-ivory-beige.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed?bed_frame_size=king&material=ivory_beige",
        priceHint: 1199,
        available: true,
        finishCode: "fabric_ivory_beige",
        finishLabel: "Fabric bedframe - Ivory Beige",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d8d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1627631594/crusader/variants/LW-4001/Ivory-Beige_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629959758/crusader/variants/52460071-LW4001/Joseph-King-Size-Bed-Ivory-Beige-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629959758/crusader/variants/52460071-LW4001/Joseph-King-Size-Bed-Ivory-Beige-Front-SG.jpg",
        ],
      },
      {
        id: "queen_boucle_snow",
        name: "Boucle bedframe - Snow Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 1612, d: 2106, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-boucle-queen-snow.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-boucle?bed_frame_size=queen",
        priceHint: 959,
        available: true,
        finishCode: "boucle_snow",
        finishLabel: "Boucle bedframe - Snow Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050060/crusader/variants/52460070-LP4001/Joseph-Queen-Size-Bed-Boucle-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050060/crusader/variants/52460070-LP4001/Joseph-Queen-Size-Bed-Boucle-Front-SG.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655220994/crusader/variants/52460070-LP4001/Joseph-Queen-Size-Bed-Boucle-SG-Dim-1655220992.jpg",
        ],
      },
      {
        id: "king_boucle_snow",
        name: "Boucle bedframe - Snow Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 1912, d: 2106, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-boucle-king-snow.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-boucle?bed_frame_size=king",
        priceHint: 1049,
        available: true,
        finishCode: "boucle_snow",
        finishLabel: "Boucle bedframe - Snow Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629945882/crusader/variants/52460071-LP4001/Joseph-King-Size-Bed-Boucle-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629945882/crusader/variants/52460071-LP4001/Joseph-King-Size-Bed-Boucle-Front-SG.jpg",
        ],
      },
      {
        id: "queen_walnut_bedframe",
        name: "Walnut bedframe",
        colorHex: "#6f4a2e",
        dimensionsMm: { w: 1592, d: 2106, h: 1000 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-walnut-queen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-walnut?bed_frame_size=queen",
        priceHint: 1039,
        available: true,
        finishCode: "walnut_bedframe",
        finishLabel: "Walnut bedframe",
        materialType: "Wood",
        swatchGroup: "wood_finish",
        swatchHex: "#6f4a2e",
        swatchTextureUrl: "https://s3-ap-southeast-1.amazonaws.com/production-static-images/swatches/walnut-wood.png",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516194/crusader/variants/52460077/Joseph-Queen-Size-Bed-Walnut-Front-3-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516194/crusader/variants/52460077/Joseph-Queen-Size-Bed-Walnut-Front-3-SG.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655220935/crusader/variants/52460077/Joseph-Queen-Size-Bed-Walnut-Dim-SG-1655220933.jpg",
        ],
      },
      {
        id: "king_walnut_bedframe",
        name: "Walnut bedframe",
        colorHex: "#6f4a2e",
        dimensionsMm: { w: 1892, d: 2106, h: 1000 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-walnut-king.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-walnut?bed_frame_size=king",
        priceHint: 1129,
        available: true,
        finishCode: "walnut_bedframe",
        finishLabel: "Walnut bedframe",
        materialType: "Wood",
        swatchGroup: "wood_finish",
        swatchHex: "#6f4a2e",
        swatchTextureUrl: "https://s3-ap-southeast-1.amazonaws.com/production-static-images/swatches/walnut-wood.png",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516255/crusader/variants/52460078/Joseph-King-Size-Bed-Walnut-Front-3-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516255/crusader/variants/52460078/Joseph-King-Size-Bed-Walnut-Front-3-SG.jpg",
        ],
      },
      {
        id: "queen_fabric_set_stone_grey",
        name: "Fabric set - Stone Grey",
        colorHex: "#8b8983",
        dimensionsMm: { w: 2812, d: 2106, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-set-queen-stone-grey.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-with-2-bedside-tables?bed_frame_size=queen&material=stone_grey",
        priceHint: 1929,
        available: true,
        finishCode: "fabric_set_stone_grey",
        finishLabel: "Fabric set - Stone Grey",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#8b8983",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1653637272/crusader/variants/TE-4004/Ethan-Armchair-Sofa-Stone-Grey-Square-Det_2-1653637269.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
        ],
      },
      {
        id: "king_fabric_set_stone_grey",
        name: "Fabric set - Stone Grey",
        colorHex: "#8b8983",
        dimensionsMm: { w: 3112, d: 2106, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-set-king-stone-grey.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-with-2-bedside-tables?bed_frame_size=king&material=stone_grey",
        priceHint: 2059,
        available: true,
        finishCode: "fabric_set_stone_grey",
        finishLabel: "Fabric set - Stone Grey",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#8b8983",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1653637272/crusader/variants/TE-4004/Ethan-Armchair-Sofa-Stone-Grey-Square-Det_2-1653637269.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630051320/crusader/variants/52460070-TE4004/Joseph-Queen-Size-Bed-Stone-Grey-Front-SG.jpg",
        ],
      },
      {
        id: "queen_fabric_set_ivory_beige",
        name: "Fabric set - Ivory Beige",
        colorHex: "#d8d0c4",
        dimensionsMm: { w: 2812, d: 2106, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-set-queen-ivory-beige.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-with-2-bedside-tables?bed_frame_size=queen&material=ivory_beige",
        priceHint: 1929,
        available: true,
        finishCode: "fabric_set_ivory_beige",
        finishLabel: "Fabric set - Ivory Beige",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d8d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1627631594/crusader/variants/LW-4001/Ivory-Beige_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050274/crusader/variants/52460070-LW4001/Joseph-Queen-Size-Bed-Ivory-Beige-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050274/crusader/variants/52460070-LW4001/Joseph-Queen-Size-Bed-Ivory-Beige-Front-SG.jpg",
        ],
      },
      {
        id: "king_fabric_set_ivory_beige",
        name: "Fabric set - Ivory Beige",
        colorHex: "#d8d0c4",
        dimensionsMm: { w: 3112, d: 2106, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-fabric-set-king-ivory-beige.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-with-2-bedside-tables?bed_frame_size=king&material=ivory_beige",
        priceHint: 2059,
        available: true,
        finishCode: "fabric_set_ivory_beige",
        finishLabel: "Fabric set - Ivory Beige",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d8d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1627631594/crusader/variants/LW-4001/Ivory-Beige_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629959758/crusader/variants/52460071-LW4001/Joseph-King-Size-Bed-Ivory-Beige-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629959758/crusader/variants/52460071-LW4001/Joseph-King-Size-Bed-Ivory-Beige-Front-SG.jpg",
        ],
      },
      {
        id: "queen_boucle_set_snow",
        name: "Boucle set - Snow Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 2812, d: 2106, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-boucle-set-queen-snow.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-boucle-with-2-joseph-bedside-tables?bed_frame_size=queen",
        priceHint: 1989,
        available: true,
        finishCode: "boucle_set_snow",
        finishLabel: "Boucle set - Snow Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050060/crusader/variants/52460070-LP4001/Joseph-Queen-Size-Bed-Boucle-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1630050060/crusader/variants/52460070-LP4001/Joseph-Queen-Size-Bed-Boucle-Front-SG.jpg",
        ],
      },
      {
        id: "king_boucle_set_snow",
        name: "Boucle set - Snow Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 3112, d: 2106, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-boucle-set-king-snow.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-boucle-with-2-joseph-bedside-tables?bed_frame_size=king",
        priceHint: 2079,
        available: true,
        finishCode: "boucle_set_snow",
        finishLabel: "Boucle set - Snow Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/w_800,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629945882/crusader/variants/52460071-LP4001/Joseph-King-Size-Bed-Boucle-Front-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1629945882/crusader/variants/52460071-LP4001/Joseph-King-Size-Bed-Boucle-Front-SG.jpg",
        ],
      },
      {
        id: "queen_walnut_set",
        name: "Walnut set",
        colorHex: "#6f4a2e",
        dimensionsMm: { w: 2792, d: 2106, h: 1000 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-joseph-walnut-set-queen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-walnut-with-2-bedside-tables?bed_frame_size=queen",
        priceHint: 1799,
        available: true,
        finishCode: "walnut_set",
        finishLabel: "Walnut set",
        materialType: "Wood",
        swatchGroup: "wood_finish",
        swatchHex: "#6f4a2e",
        swatchTextureUrl: "https://s3-ap-southeast-1.amazonaws.com/production-static-images/swatches/walnut-wood.png",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516194/crusader/variants/52460077/Joseph-Queen-Size-Bed-Walnut-Front-3-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516194/crusader/variants/52460077/Joseph-Queen-Size-Bed-Walnut-Front-3-SG.jpg",
        ],
      },
      {
        id: "king_walnut_set",
        name: "Walnut set",
        colorHex: "#6f4a2e",
        dimensionsMm: { w: 3092, d: 2106, h: 1000 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-joseph-walnut-set-king.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/joseph-bed-walnut-with-2-bedside-tables?bed_frame_size=king",
        priceHint: 1889,
        available: true,
        finishCode: "walnut_set",
        finishLabel: "Walnut set",
        materialType: "Wood",
        swatchGroup: "wood_finish",
        swatchHex: "#6f4a2e",
        swatchTextureUrl: "https://s3-ap-southeast-1.amazonaws.com/production-static-images/swatches/walnut-wood.png",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516255/crusader/variants/52460078/Joseph-King-Size-Bed-Walnut-Front-3-SG.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1624516255/crusader/variants/52460078/Joseph-King-Size-Bed-Walnut-Front-3-SG.jpg",
        ],
      },
    ],
  },
  "bed-real-castlery-rochelle-boucle": {
    id: "bed-real-castlery-rochelle-boucle",
    name: "Castlery Rochelle Performance Boucle Bed",
    category: "bed",
    price: 1299,
    dimensions: { w: 1.7, d: 2.18, h: 1.05 },
    styleTags: ["modern", "soft_modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676542514/crusader/variants/50440795-IN4002/Rochelle-Boucle-Queen-Size-Bed-White-Quartz-Front-1676542511.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676543546/crusader/variants/T50440795/Rochelle-Boucle-Queen-Size-Bed-White-Quartz-Front-Dim-SG-1676543543.jpg",
    ],
    defaultVariantId: "standard_queen_white_quartz_boucle",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/rochelle-performance-boucle-bed?bed_frame_size=queen&material=performance_white_quartz_boucle_new",
    modelUrl: "/assets/models/bed-real-castlery-rochelle-standard-queen-white-quartz-boucle.glb",
    variants: [
      {
        id: "standard_queen_white_quartz_boucle",
        name: "Standard bedframe - White Quartz Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 1700, d: 2180, h: 1050 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-rochelle-standard-queen-white-quartz-boucle.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/rochelle-performance-boucle-bed?bed_frame_size=queen&material=performance_white_quartz_boucle_new",
        priceHint: 1299,
        available: true,
        finishCode: "standard_white_quartz_boucle",
        finishLabel: "Standard bedframe - White Quartz Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676542514/crusader/variants/50440795-IN4002/Rochelle-Boucle-Queen-Size-Bed-White-Quartz-Front-1676542511.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676542514/crusader/variants/50440795-IN4002/Rochelle-Boucle-Queen-Size-Bed-White-Quartz-Front-1676542511.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676543546/crusader/variants/T50440795/Rochelle-Boucle-Queen-Size-Bed-White-Quartz-Front-Dim-SG-1676543543.jpg",
        ],
      },
      {
        id: "standard_king_white_quartz_boucle",
        name: "Standard bedframe - White Quartz Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 2000, d: 2180, h: 1050 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-rochelle-standard-king-white-quartz-boucle.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/rochelle-performance-boucle-bed?bed_frame_size=king&material=performance_white_quartz_boucle_new",
        priceHint: 1399,
        available: true,
        finishCode: "standard_white_quartz_boucle",
        finishLabel: "Standard bedframe - White Quartz Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676543184/crusader/variants/50440796-IN4002/Rochelle-Boucle-King-Size-Bed-White-Quartz-Front-1676543181.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1676543184/crusader/variants/50440796-IN4002/Rochelle-Boucle-King-Size-Bed-White-Quartz-Front-1676543181.jpg",
        ],
      },
      {
        id: "storage_super_single_white_quartz_boucle",
        name: "Storage bedframe - White Quartz Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 1250, d: 2145, h: 1100 },
        sizeLabel: "Super Single",
        modelUrl: "/assets/models/bed-real-castlery-rochelle-storage-super-single-white-quartz-boucle.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/rochelle-storage-bed?bed_frame_size=super_single&material=performance_white_quartz_boucle_new",
        priceHint: 1399,
        available: true,
        finishCode: "storage_white_quartz_boucle",
        finishLabel: "Storage bedframe - White Quartz Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740629356/crusader/variants/50440945-IN4002/Rochelle-Super-Single-Storage-Bed-Performance-Infinity-White-Quartz-Boucle-Front-1740629354.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740629356/crusader/variants/50440945-IN4002/Rochelle-Super-Single-Storage-Bed-Performance-Infinity-White-Quartz-Boucle-Front-1740629354.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740629458/crusader/variants/T50440945/Rochelle-Super-Single-Storage-Bed-Performance-Infinity-White-Quartz-Boucle-Dim-SG-1740629456.jpg",
        ],
      },
      {
        id: "storage_queen_white_quartz_boucle",
        name: "Storage bedframe - White Quartz Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 1700, d: 2145, h: 1100 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-rochelle-storage-queen-white-quartz-boucle.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/rochelle-storage-bed?bed_frame_size=queen&material=performance_white_quartz_boucle_new",
        priceHint: 1599,
        available: true,
        finishCode: "storage_white_quartz_boucle",
        finishLabel: "Storage bedframe - White Quartz Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740629169/crusader/variants/50440947-IN4002/Rochelle-Queen-Storage-Bed-Performance-Infinity-White-Quartz-Boucle-Front-1740629167.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740629169/crusader/variants/50440947-IN4002/Rochelle-Queen-Storage-Bed-Performance-Infinity-White-Quartz-Boucle-Front-1740629167.jpg",
        ],
      },
      {
        id: "storage_king_white_quartz_boucle",
        name: "Storage bedframe - White Quartz Boucle",
        colorHex: "#ece7de",
        dimensionsMm: { w: 2000, d: 2145, h: 1100 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-rochelle-storage-king-white-quartz-boucle.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/rochelle-storage-bed?bed_frame_size=king&material=performance_white_quartz_boucle_new",
        priceHint: 1699,
        available: true,
        finishCode: "storage_white_quartz_boucle",
        finishLabel: "Storage bedframe - White Quartz Boucle",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#ece7de",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740629229/crusader/variants/50440948-IN4002/Rochelle-King-Storage-Bed-Performance-Infinity-White-Quartz-Boucle-Front-1740629227.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1740629229/crusader/variants/50440948-IN4002/Rochelle-King-Storage-Bed-Performance-Infinity-White-Quartz-Boucle-Front-1740629227.jpg",
        ],
      },
    ],
  },
  "bed-real-castlery-seb": {
    id: "bed-real-castlery-seb",
    name: "Castlery Seb Bed",
    category: "bed",
    price: 849,
    dimensions: { w: 1.14, d: 2.09, h: 0.96 },
    styleTags: ["mid_century", "modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715470/crusader/variants/40550353-PT4001/Seb-Queen-Bed-Performance-Twill-Creamy-White-Front-1766715467.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1755569848/crusader/variants/T40550108/Seb-Queen-Bed-Performance-Twill-Creamy-White-Dim-SG-1755569846.jpg",
    ],
    defaultVariantId: "super_single_performance_creamy_white",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/seb-bed?material=twill_performance_creamy_white&bed_frame_size=super_single",
    modelUrl: "/assets/models/bed-real-castlery-seb-super-single-performance-creamy-white.glb",
    variants: [
      {
        id: "super_single_performance_creamy_white",
        name: "Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 1140, d: 2090, h: 960 },
        sizeLabel: "Super Single",
        modelUrl: "/assets/models/bed-real-castlery-seb-super-single-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed?material=twill_performance_creamy_white&bed_frame_size=super_single",
        priceHint: 849,
        available: true,
        finishCode: "bedframe_performance_creamy_white",
        finishLabel: "Bedframe - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715410/crusader/variants/40550352-PT4001/Seb-Super-Single-Bed-Performance-Twill-Creamy-White-Front-1766715408.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715410/crusader/variants/40550352-PT4001/Seb-Super-Single-Bed-Performance-Twill-Creamy-White-Front-1766715408.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766041184/crusader/variants/T40550108/Seb-Super-Single-Bed-Performance-Twill-Creamy-White-Dim-SG__1_-1766041182.jpg",
        ],
      },
      {
        id: "queen_performance_creamy_white",
        name: "Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 1586, d: 2090, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-seb-queen-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed?material=twill_performance_creamy_white&bed_frame_size=queen",
        priceHint: 999,
        available: true,
        finishCode: "bedframe_performance_creamy_white",
        finishLabel: "Bedframe - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715470/crusader/variants/40550353-PT4001/Seb-Queen-Bed-Performance-Twill-Creamy-White-Front-1766715467.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715470/crusader/variants/40550353-PT4001/Seb-Queen-Bed-Performance-Twill-Creamy-White-Front-1766715467.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1755569848/crusader/variants/T40550108/Seb-Queen-Bed-Performance-Twill-Creamy-White-Dim-SG-1755569846.jpg",
        ],
      },
      {
        id: "king_performance_creamy_white",
        name: "Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 1886, d: 2090, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-seb-king-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed?material=twill_performance_creamy_white&bed_frame_size=king",
        priceHint: 1099,
        available: true,
        finishCode: "bedframe_performance_creamy_white",
        finishLabel: "Bedframe - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715560/crusader/variants/40550350-PT4001/Seb-King-Bed-Performance-Twill-Creamy-White-Front-1766715558.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715560/crusader/variants/40550350-PT4001/Seb-King-Bed-Performance-Twill-Creamy-White-Front-1766715558.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1755569848/crusader/variants/T40550108/Seb-King-Bed-Performance-Twill-Creamy-White-Dim-SG-1755569846.jpg",
        ],
      },
      {
        id: "super_single_single_table_performance_creamy_white",
        name: "1 bedside table set - Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 1540, d: 2090, h: 960 },
        sizeLabel: "Super Single",
        modelUrl: "/assets/models/bed-real-castlery-seb-super-single-single-table-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed-with-bedside-table-set?table_qty=single&material=twill_performance_creamy_white&bedside_table=1-drawer&bed_frame_size=super_single",
        priceHint: 1089,
        available: true,
        finishCode: "single_table_set_performance_creamy_white",
        finishLabel: "1 bedside table set - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715633/crusader/variants/PB-001800-PT4001/Seb-Super-Single-Bed-With-1-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715631.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715633/crusader/variants/PB-001800-PT4001/Seb-Super-Single-Bed-With-1-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715631.jpg",
        ],
      },
      {
        id: "queen_single_table_performance_creamy_white",
        name: "1 bedside table set - Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 1986, d: 2090, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-seb-queen-single-table-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed-with-bedside-table-set?table_qty=single&material=twill_performance_creamy_white&bedside_table=2-drawer&bed_frame_size=queen",
        priceHint: 1289,
        available: true,
        finishCode: "single_table_set_performance_creamy_white",
        finishLabel: "1 bedside table set - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715793/crusader/variants/PB-001802-PT4001/Seb-Queen-Bed-With-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715791.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715793/crusader/variants/PB-001802-PT4001/Seb-Queen-Bed-With-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715791.jpg",
        ],
      },
      {
        id: "king_single_table_performance_creamy_white",
        name: "1 bedside table set - Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 2446, d: 2090, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-seb-king-single-table-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed-with-bedside-table-set?table_qty=single&material=twill_performance_creamy_white&bedside_table=2-drawer&bed_frame_size=king",
        priceHint: 1389,
        available: true,
        finishCode: "single_table_set_performance_creamy_white",
        finishLabel: "1 bedside table set - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715763/crusader/variants/PB-001803-PT4001/Seb-King-Bed-With-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715761.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715763/crusader/variants/PB-001803-PT4001/Seb-King-Bed-With-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715761.jpg",
        ],
      },
      {
        id: "super_single_two_tables_performance_creamy_white",
        name: "2 bedside tables set - Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 1940, d: 2090, h: 960 },
        sizeLabel: "Super Single",
        modelUrl: "/assets/models/bed-real-castlery-seb-super-single-two-tables-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed-with-bedside-table-set?table_qty=set_of_2&material=twill_performance_creamy_white&bedside_table=1-drawer&bed_frame_size=super_single",
        priceHint: 1379,
        available: true,
        finishCode: "two_table_set_performance_creamy_white",
        finishLabel: "2 bedside tables set - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715672/crusader/variants/PB-001801-PT4001/Seb-Super-Single-Bed-With-2-1-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715670.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715672/crusader/variants/PB-001801-PT4001/Seb-Super-Single-Bed-With-2-1-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715670.jpg",
        ],
      },
      {
        id: "queen_two_tables_performance_creamy_white",
        name: "2 bedside tables set - Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 2386, d: 2090, h: 960 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-seb-queen-two-tables-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed-with-bedside-table-set?table_qty=set_of_2&material=twill_performance_creamy_white&bedside_table=2-drawer&bed_frame_size=queen",
        priceHint: 1629,
        available: true,
        finishCode: "two_table_set_performance_creamy_white",
        finishLabel: "2 bedside tables set - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715702/crusader/variants/PB-001804-PT4001/Seb-Queen-Bed-With-2-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715700.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715702/crusader/variants/PB-001804-PT4001/Seb-Queen-Bed-With-2-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715700.jpg",
        ],
      },
      {
        id: "king_two_tables_performance_creamy_white",
        name: "2 bedside tables set - Performance Creamy White",
        colorHex: "#e7dfd3",
        dimensionsMm: { w: 3006, d: 2090, h: 960 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-seb-king-two-tables-performance-creamy-white.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/seb-bed-with-bedside-table-set?table_qty=set_of_2&material=twill_performance_creamy_white&bedside_table=2-drawer&bed_frame_size=king",
        priceHint: 1729,
        available: true,
        finishCode: "two_table_set_performance_creamy_white",
        finishLabel: "2 bedside tables set - Performance Creamy White",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#e7dfd3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_800/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715741/crusader/variants/PB-001805-PT4001/Seb-King-Bed-With-2-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715739.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1766715741/crusader/variants/PB-001805-PT4001/Seb-King-Bed-With-2-2-Drawer-Bedside-Table-Performance-Twill-Creamy-White-Front-1766715739.jpg",
        ],
      },
    ],
  },
  "bed-real-castlery-dalton": {
    id: "bed-real-castlery-dalton",
    name: "Castlery Dalton Bed",
    category: "bed",
    price: 1099,
    dimensions: { w: 1.68, d: 2.15, h: 1.2 },
    styleTags: ["modern", "contemporary"],
    galleryImages: [...DALTON_STANDARD_QUEEN_GALLERY_IMAGES],
    defaultVariantId: "standard_queen_beach_linen",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/dalton-bed?bed_frame_size=queen&material=beach_linen",
    modelUrl: "/assets/models/bed-real-castlery-dalton-standard-queen-beach-linen.glb",
    variants: [
      {
        id: "standard_queen_beach_linen",
        name: "Standard bedframe - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 1680, d: 2150, h: 1200 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-dalton-standard-queen-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dalton-bed?bed_frame_size=queen&material=beach_linen",
        priceHint: 1099,
        available: true,
        finishCode: "standard_bedframe_beach_linen",
        finishLabel: "Standard bedframe - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: DALTON_STANDARD_QUEEN_THUMB_URL,
        galleryImages: [...DALTON_STANDARD_QUEEN_GALLERY_IMAGES],
      },
      {
        id: "standard_king_beach_linen",
        name: "Standard bedframe - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 1980, d: 2150, h: 1200 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-dalton-standard-king-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dalton-bed?bed_frame_size=king&material=beach_linen",
        priceHint: 1299,
        available: true,
        finishCode: "standard_bedframe_beach_linen",
        finishLabel: "Standard bedframe - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: DALTON_STANDARD_KING_THUMB_URL,
        galleryImages: [...DALTON_STANDARD_KING_GALLERY_IMAGES],
      },
      {
        id: "storage_single_beach_linen",
        name: "Storage bedframe - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 1070, d: 2160, h: 1200 },
        sizeLabel: "Single",
        modelUrl: "/assets/models/bed-real-castlery-dalton-storage-single-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dalton-storage-bed?bed_frame_size=single&material=beach_linen&frame_cover=fixed",
        priceHint: 999,
        available: true,
        finishCode: "storage_bedframe_beach_linen",
        finishLabel: "Storage bedframe - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: DALTON_STORAGE_SINGLE_THUMB_URL,
        galleryImages: [...DALTON_STORAGE_SINGLE_GALLERY_IMAGES],
      },
      {
        id: "storage_super_single_beach_linen",
        name: "Storage bedframe - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 1230, d: 2160, h: 1200 },
        sizeLabel: "Super Single",
        modelUrl: "/assets/models/bed-real-castlery-dalton-storage-super-single-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dalton-storage-bed?bed_frame_size=super_single&material=beach_linen&frame_cover=fixed",
        priceHint: 1199,
        available: true,
        finishCode: "storage_bedframe_beach_linen",
        finishLabel: "Storage bedframe - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: DALTON_STORAGE_SUPER_SINGLE_THUMB_URL,
        galleryImages: [...DALTON_STORAGE_SUPER_SINGLE_GALLERY_IMAGES],
      },
      {
        id: "storage_queen_beach_linen",
        name: "Storage bedframe - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 1680, d: 2150, h: 1200 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-dalton-storage-queen-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dalton-storage-bed?bed_frame_size=queen&material=beach_linen&frame_cover=fixed",
        priceHint: 1499,
        available: true,
        finishCode: "storage_bedframe_beach_linen",
        finishLabel: "Storage bedframe - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: DALTON_STORAGE_QUEEN_THUMB_URL,
        galleryImages: [...DALTON_STORAGE_QUEEN_GALLERY_IMAGES],
      },
      {
        id: "storage_king_beach_linen",
        name: "Storage bedframe - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 1980, d: 2150, h: 1200 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-dalton-storage-king-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dalton-storage-bed?bed_frame_size=king&material=beach_linen&frame_cover=fixed",
        priceHint: 1699,
        available: true,
        finishCode: "storage_bedframe_beach_linen",
        finishLabel: "Storage bedframe - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: DALTON_STORAGE_KING_THUMB_URL,
        galleryImages: [...DALTON_STORAGE_KING_GALLERY_IMAGES],
      },
    ],
  },
  "bed-real-castlery-claude": {
    id: "bed-real-castlery-claude",
    name: "Castlery Claude Performance Fabric Bed",
    category: "bed",
    price: 1699,
    dimensions: { w: 2.92, d: 2.14, h: 1.1 },
    styleTags: ["modern", "contemporary"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678693175/crusader/variants/T50441129-AR4001/Claude-Queen-Bed-Front_1-1678693173.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710930312/crusader/variants/54000080-AR4001/Claude-Queen-Bed-Front_1-1710930312.jpg",
    ],
    defaultVariantId: "extended_headboard_queen_performance_dune",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/claude-performance-fabric-bed?material=performance_dune&variant=with_extended_headboard&bed_frame_size=queen",
    modelUrl: "/assets/models/bed-real-castlery-claude-extended-headboard-queen-performance-dune.glb",
    variants: [
      {
        id: "extended_headboard_queen_performance_dune",
        name: "Extended headboard - Performance Dune",
        colorHex: "#b8b0a3",
        dimensionsMm: { w: 2920, d: 2140, h: 1100 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-claude-extended-headboard-queen-performance-dune.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/claude-performance-fabric-bed?material=performance_dune&variant=with_extended_headboard&bed_frame_size=queen",
        priceHint: 1699,
        available: true,
        finishCode: "extended_headboard_performance_dune",
        finishLabel: "Extended headboard - Performance Dune",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#b8b0a3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1674034715/crusader/variants/AR-4001/Sloane-Cane-Chair-Dune-Grey-Oak-Det_1-1674034712.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678693175/crusader/variants/T50441129-AR4001/Claude-Queen-Bed-Front_1-1678693173.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678693175/crusader/variants/T50441129-AR4001/Claude-Queen-Bed-Front_1-1678693173.jpg",
        ],
      },
      {
        id: "extended_headboard_king_performance_dune",
        name: "Extended headboard - Performance Dune",
        colorHex: "#b8b0a3",
        dimensionsMm: { w: 3220, d: 2140, h: 1100 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-claude-extended-headboard-king-performance-dune.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/claude-performance-fabric-bed?material=performance_dune&variant=with_extended_headboard&bed_frame_size=king",
        priceHint: 1799,
        available: true,
        finishCode: "extended_headboard_performance_dune",
        finishLabel: "Extended headboard - Performance Dune",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#b8b0a3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1674034715/crusader/variants/AR-4001/Sloane-Cane-Chair-Dune-Grey-Oak-Det_1-1674034712.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678693188/crusader/variants/T50441130-AR4001/Claude-King-Bed-Front_1-1678693186.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1678693188/crusader/variants/T50441130-AR4001/Claude-King-Bed-Front_1-1678693186.jpg",
        ],
      },
      {
        id: "standard_queen_performance_dune",
        name: "Standard bed - Performance Dune",
        colorHex: "#b8b0a3",
        dimensionsMm: { w: 1690, d: 2140, h: 1100 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-claude-standard-queen-performance-dune.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/claude-performance-fabric-bed?material=performance_dune&variant=standard_bed&bed_frame_size=queen",
        priceHint: 1199,
        available: true,
        finishCode: "standard_bed_performance_dune",
        finishLabel: "Standard bed - Performance Dune",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#b8b0a3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1674034715/crusader/variants/AR-4001/Sloane-Cane-Chair-Dune-Grey-Oak-Det_1-1674034712.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710930312/crusader/variants/54000080-AR4001/Claude-Queen-Bed-Front_1-1710930312.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710930312/crusader/variants/54000080-AR4001/Claude-Queen-Bed-Front_1-1710930312.jpg",
        ],
      },
      {
        id: "standard_king_performance_dune",
        name: "Standard bed - Performance Dune",
        colorHex: "#b8b0a3",
        dimensionsMm: { w: 1990, d: 2140, h: 1100 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-claude-standard-king-performance-dune.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/claude-performance-fabric-bed?material=performance_dune&variant=standard_bed&bed_frame_size=king",
        priceHint: 1299,
        available: true,
        finishCode: "standard_bed_performance_dune",
        finishLabel: "Standard bed - Performance Dune",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#b8b0a3",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1674034715/crusader/variants/AR-4001/Sloane-Cane-Chair-Dune-Grey-Oak-Det_1-1674034712.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710930333/crusader/variants/54000082-AR4001/Claude-King-Bed-Front_1-1710930332.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1710930333/crusader/variants/54000082-AR4001/Claude-King-Bed-Front_1-1710930332.jpg",
        ],
      },
    ],
  },
  "bed-real-castlery-dawson": {
    id: "bed-real-castlery-dawson",
    name: "Castlery Dawson Bed",
    category: "bed",
    price: 1099,
    dimensions: { w: 1.94, d: 2.37, h: 0.89 },
    styleTags: ["modern", "minimalist"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634544577/crusader/variants/54000057-NG4001/Dawson-Queen-Size-Bed-Beach-Linen-Front.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634545101/crusader/variants/54000056-NG4001/Dawson-King-Size-Bed-Beach-Linen-Front.jpg",
    ],
    defaultVariantId: "standard_queen_beach_linen",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/dawson-bed?cover_type=fully_removable&bed_frame_size=queen&material=beach_linen",
    modelUrl: "/assets/models/bed-real-castlery-dawson-standard-queen-beach-linen.glb",
    variants: [
      {
        id: "standard_queen_beach_linen",
        name: "Standard bed - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 1940, d: 2370, h: 890 },
        sizeLabel: "Queen",
        modelUrl: "/assets/models/bed-real-castlery-dawson-standard-queen-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dawson-bed?cover_type=fully_removable&bed_frame_size=queen&material=beach_linen",
        priceHint: 1099,
        available: true,
        finishCode: "standard_bed_beach_linen",
        finishLabel: "Standard bed - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634544577/crusader/variants/54000057-NG4001/Dawson-Queen-Size-Bed-Beach-Linen-Front.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634544577/crusader/variants/54000057-NG4001/Dawson-Queen-Size-Bed-Beach-Linen-Front.jpg",
        ],
      },
      {
        id: "standard_king_beach_linen",
        name: "Standard bed - Beach Linen",
        colorHex: "#d7d0c4",
        dimensionsMm: { w: 2240, d: 2370, h: 890 },
        sizeLabel: "King",
        modelUrl: "/assets/models/bed-real-castlery-dawson-standard-king-beach-linen.glb",
        affiliateUrl: "https://www.castlery.com/sg/products/dawson-bed?cover_type=fully_removable&bed_frame_size=king&material=beach_linen",
        priceHint: 1289,
        available: true,
        finishCode: "standard_bed_beach_linen",
        finishLabel: "Standard bed - Beach Linen",
        materialType: "Fabric",
        swatchGroup: "upholstery",
        swatchHex: "#d7d0c4",
        swatchTextureUrl: "https://res.cloudinary.com/castlery/image/private/b_rgb:FFFFFF,c_fit,f_auto,q_auto,w_800/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
        collectionType: "stocked",
        thumbnailUrl: "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634545101/crusader/variants/54000056-NG4001/Dawson-King-Size-Bed-Beach-Linen-Front.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1634545101/crusader/variants/54000056-NG4001/Dawson-King-Size-Bed-Beach-Linen-Front.jpg",
        ],
      },
    ],
  },

  // =========================
  // SOFAS
  // =========================
  "armchair-real-castlery-avery-performance-armchair": {
    id: "armchair-real-castlery-avery-performance-armchair",
    name: "Castlery Avery Performance Boucle Armchair",
    category: "accent_chair",
    price: 549,
    dimensions: { w: 0.815, d: 0.8, h: 0.75 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175346/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Front-1760175346.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175670/crusader/variants/50441020-IN4002/Avery-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760175669.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175669/crusader/variants/50441020-IN4002/Avery-Armchair-set-of-2-Square-Set_1_-1760175669.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175670/crusader/variants/50441020-IN4002/Avery-Armchair-Square-Det_1_-1760175669.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175347/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Angle-1760175347.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175347/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Side-1760175347.jpg",
    ],
    defaultVariantId: "white_quartz",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/avery-performance-boucle-armchair",
    variants: [
      {
        id: "white_quartz",
        name: "Performance Infinity Boucle, Light Grey (White Quartz)",
        colorHex: "#d8d7d2",
        finishCode: "white_quartz",
        finishLabel: "Light Grey (White Quartz)",
        swatchGroup: "upholstery_option",
        swatchHex: "#d8d7d2",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175346/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Front-1760175346.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175346/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Front-1760175346.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175670/crusader/variants/50441020-IN4002/Avery-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760175669.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175669/crusader/variants/50441020-IN4002/Avery-Armchair-set-of-2-Square-Set_1_-1760175669.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175670/crusader/variants/50441020-IN4002/Avery-Armchair-Square-Det_1_-1760175669.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175347/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Angle-1760175347.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175347/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Side-1760175347.jpg",
        ],
      },
    ],
  },
  "armchair-real-castlery-avery-performance-armchair-with-ottoman": {
    id: "armchair-real-castlery-avery-performance-armchair-with-ottoman",
    name: "Castlery Avery Performance Boucle Armchair with Ottoman",
    category: "accent_chair",
    price: 709,
    dimensions: { w: 0.815, d: 1.3, h: 0.75 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174592/crusader/variants/PB-001916-IN4002/Avery-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174592.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174769/crusader/variants/PB-001916-IN4002/Avery-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760174768.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174768/crusader/variants/PB-001916-IN4002/Avery-Armchair-Square-Det_1_-1760174768.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1762931261/crusader/variants/50441020-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Usp-Det_1-1762931261.jpg",
    ],
    defaultVariantId: "white_quartz",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/avery-performance-boucle-armchair-with-ottoman",
    variants: [
      {
        id: "white_quartz",
        name: "Performance Infinity Boucle, Light Grey (White Quartz)",
        colorHex: "#d8d7d2",
        finishCode: "white_quartz",
        finishLabel: "Light Grey (White Quartz)",
        swatchGroup: "upholstery_option",
        swatchHex: "#d8d7d2",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174592/crusader/variants/PB-001916-IN4002/Avery-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174592.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174592/crusader/variants/PB-001916-IN4002/Avery-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174592.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174769/crusader/variants/PB-001916-IN4002/Avery-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760174768.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174768/crusader/variants/PB-001916-IN4002/Avery-Armchair-Square-Det_1_-1760174768.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1762931261/crusader/variants/50441020-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Usp-Det_1-1762931261.jpg",
        ],
      },
    ],
  },
  "armchair-real-castlery-avery-performance-swivel-armchair": {
    id: "armchair-real-castlery-avery-performance-swivel-armchair",
    name: "Castlery Avery Performance Boucle Swivel Armchair",
    category: "accent_chair",
    price: 599,
    dimensions: { w: 0.805, d: 0.805, h: 0.75 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Angle-1760175397.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175924/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-set-of-2_-White-Quartz-Square-Set_1-1760175924.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175924/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760175924.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175924/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-White-Quartz-Square-Det_1-1760175924.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Front-1760175397.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Side-1760175397.jpg",
    ],
    defaultVariantId: "white_quartz",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/avery-performance-boucle-swivel-armchair",
    variants: [
      {
        id: "white_quartz",
        name: "Performance Infinity Boucle, Light Grey (White Quartz)",
        colorHex: "#d8d7d2",
        finishCode: "white_quartz",
        finishLabel: "Light Grey (White Quartz)",
        swatchGroup: "upholstery_option",
        swatchHex: "#d8d7d2",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Angle-1760175397.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Angle-1760175397.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175924/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-set-of-2_-White-Quartz-Square-Set_1-1760175924.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175924/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760175924.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175924/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-White-Quartz-Square-Det_1-1760175924.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Front-1760175397.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Side-1760175397.jpg",
        ],
      },
    ],
  },
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman": {
    id: "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman",
    name: "Castlery Avery Performance Boucle Swivel Armchair with Ottoman",
    category: "accent_chair",
    price: 759,
    dimensions: { w: 0.805, d: 1.305, h: 0.75 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174560/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174560.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174682/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760174682.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174682/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-White-Quartz-Square-Det_1-1760174681.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1762931261/crusader/variants/50441020-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Usp-Det_1-1762931261.jpg",
    ],
    defaultVariantId: "white_quartz",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/avery-performance-boucle-swivel-armchair-with-ottoman",
    variants: [
      {
        id: "white_quartz",
        name: "Performance Infinity Boucle, Light Grey (White Quartz)",
        colorHex: "#d8d7d2",
        finishCode: "white_quartz",
        finishLabel: "Light Grey (White Quartz)",
        swatchGroup: "upholstery_option",
        swatchHex: "#d8d7d2",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174560/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174560.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174560/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174560.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174682/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-with-Ottoman_-White-Quartz-Square-Set_1-1760174682.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1760174682/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-White-Quartz-Square-Det_1-1760174681.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1762931261/crusader/variants/50441020-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Usp-Det_1-1762931261.jpg",
        ],
      },
    ],
  },
  "sofa-real-castlery-ollie-storage-ottoman": {
    id: "sofa-real-castlery-ollie-storage-ottoman",
    name: "Castlery Ollie Storage Ottoman",
    category: "ottoman",
    price: 499,
    dimensions: { w: 0.93, d: 0.77, h: 0.44 },
    styleTags: ["modern", "minimalistic"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Front-1768210732.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Angel_1-1768210732.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Angel_2-1768210732.jpg",
      "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Side-1768210732.jpg",
    ],
    defaultVariantId: "greta_ivory",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/ollie-storage-ottoman",
    variants: [
      {
        id: "greta_ivory",
        name: "Greta Ivory",
        colorHex: "#e6e0d6",
        finishCode: "gr-4001",
        finishLabel: "Washed Chenille, Cream",
        swatchGroup: "upholstery_option",
        swatchHex: "#e6e0d6",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Front-1768210732.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Front-1768210732.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Angel_1-1768210732.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Angel_2-1768210732.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Side-1768210732.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768892905/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Set-1768892902.jpg",
        ],
      },
      {
        id: "greta_caramel",
        name: "Greta Caramel",
        colorHex: "#a9744f",
        finishCode: "gr-4003",
        finishLabel: "Washed Chenille, Caramel",
        swatchGroup: "upholstery_option",
        swatchHex: "#a9744f",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1767599003/crusader/variants/AS-001017-GR4003/Ollie-Storage-Ottoman-Mustard-Brown-Front-1767599001.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1767599003/crusader/variants/AS-001017-GR4003/Ollie-Storage-Ottoman-Mustard-Brown-Front-1767599001.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1767599003/crusader/variants/AS-001017-GR4003/Ollie-Storage-Ottoman-Mustard-Brown-Angel_1-1767599001.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1767599003/crusader/variants/AS-001017-GR4003/Ollie-Storage-Ottoman-Mustard-Brown-Angel_2-1767599001.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1767599003/crusader/variants/AS-001017-GR4003/Ollie-Storage-Ottoman-Mustard-Brown-Side-1767599001.jpg",
          "https://res.cloudinary.com/castlery/image/upload/w_1995,f_auto,q_auto/v1769999425/knight/USP/2026/Ollie-Storage-Sofa-Mustard-Brown-Set_1.jpg",
        ],
      },
      {
        id: "greta_moss",
        name: "Greta Moss",
        colorHex: "#7b7a60",
        finishCode: "gr-4004",
        finishLabel: "Washed Chenille, Moss",
        swatchGroup: "upholstery_option",
        swatchHex: "#7b7a60",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768210767/crusader/variants/AS-001017-GR4004/Ollie-Storage-Ottoman-Moss-Front-1768210765.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768210767/crusader/variants/AS-001017-GR4004/Ollie-Storage-Ottoman-Moss-Front-1768210765.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210767/crusader/variants/AS-001017-GR4004/Ollie-Storage-Ottoman-Moss-Angel_1-1768210765.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210767/crusader/variants/AS-001017-GR4004/Ollie-Storage-Ottoman-Moss-Angel_2-1768210765.jpg",
          "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1768210767/crusader/variants/AS-001017-GR4004/Ollie-Storage-Ottoman-Moss-Side-1768210765.jpg",
        ],
      },
    ],
  },

  "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed": {
    id: "coffee-real-castlery-hugg-nesting-square-performance-basalt-closed",
    name: "Hugg Nesting Square Coffee Table",
    category: "coffee_table",
    price: 1099,
    dimensions: { w: 1.1, d: 1.1, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SQUARE_GALLERIES.performanceBasalt],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SQUARE_URL,
    variants: buildHuggSquareVariants("performanceBasalt"),
  },
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened": {
    id: "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened",
    name: "Hugg Nesting Square Coffee Table",
    category: "coffee_table",
    price: 1099,
    dimensions: { w: 1.1, d: 1.1, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SQUARE_GALLERIES.performanceBasalt],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SQUARE_URL,
    variants: buildHuggSquareVariants("performanceBasalt"),
  },
  "coffee-real-castlery-hugg-nesting-square-performance-dune-closed": {
    id: "coffee-real-castlery-hugg-nesting-square-performance-dune-closed",
    name: "Hugg Nesting Square Coffee Table",
    category: "coffee_table",
    price: 1099,
    dimensions: { w: 1.1, d: 1.1, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SQUARE_GALLERIES.performanceDune],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SQUARE_URL,
    variants: buildHuggSquareVariants("performanceDune"),
  },
  "coffee-real-castlery-hugg-nesting-square-performance-dune-opened": {
    id: "coffee-real-castlery-hugg-nesting-square-performance-dune-opened",
    name: "Hugg Nesting Square Coffee Table",
    category: "coffee_table",
    price: 1099,
    dimensions: { w: 1.1, d: 1.1, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SQUARE_GALLERIES.performanceDune],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SQUARE_URL,
    variants: buildHuggSquareVariants("performanceDune"),
  },
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-closed": {
    id: "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-closed",
    name: "Hugg Nesting Rectangular Coffee Table",
    category: "coffee_table",
    price: 799,
    dimensions: { w: 1.1, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_RECTANGULAR_GALLERIES.performanceBasalt],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_RECTANGULAR_URL,
    variants: buildHuggRectangularVariants("performanceBasalt"),
  },
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-opened": {
    id: "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-opened",
    name: "Hugg Nesting Rectangular Coffee Table",
    category: "coffee_table",
    price: 799,
    dimensions: { w: 1.1, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_RECTANGULAR_GALLERIES.performanceBasalt],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_RECTANGULAR_URL,
    variants: buildHuggRectangularVariants("performanceBasalt"),
  },
  "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-closed": {
    id: "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-closed",
    name: "Hugg Nesting Rectangular Coffee Table",
    category: "coffee_table",
    price: 799,
    dimensions: { w: 1.1, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_RECTANGULAR_GALLERIES.performanceDune],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_RECTANGULAR_URL,
    variants: buildHuggRectangularVariants("performanceDune"),
  },
  "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-opened": {
    id: "coffee-real-castlery-hugg-nesting-rectangular-performance-dune-opened",
    name: "Hugg Nesting Rectangular Coffee Table",
    category: "coffee_table",
    price: 799,
    dimensions: { w: 1.1, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_RECTANGULAR_GALLERIES.performanceDune],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_RECTANGULAR_URL,
    variants: buildHuggRectangularVariants("performanceDune"),
  },
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed": {
    id: "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-closed",
    name: "Hugg Nesting Side Table",
    category: "side_table",
    price: 499,
    dimensions: { w: 0.68, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SIDE_TABLE_GALLERIES.performanceBasalt],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SIDE_TABLE_URL,
    variants: buildHuggSideTableVariants("performanceBasalt"),
  },
  "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-opened": {
    id: "coffee-real-castlery-hugg-nesting-side-table-performance-basalt-opened",
    name: "Hugg Nesting Side Table",
    category: "side_table",
    price: 499,
    dimensions: { w: 0.68, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SIDE_TABLE_GALLERIES.performanceBasalt],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SIDE_TABLE_URL,
    variants: buildHuggSideTableVariants("performanceBasalt"),
  },
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-closed": {
    id: "coffee-real-castlery-hugg-nesting-side-table-performance-dune-closed",
    name: "Hugg Nesting Side Table",
    category: "side_table",
    price: 499,
    dimensions: { w: 0.68, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SIDE_TABLE_GALLERIES.performanceDune],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SIDE_TABLE_URL,
    variants: buildHuggSideTableVariants("performanceDune"),
  },
  "coffee-real-castlery-hugg-nesting-side-table-performance-dune-opened": {
    id: "coffee-real-castlery-hugg-nesting-side-table-performance-dune-opened",
    name: "Hugg Nesting Side Table",
    category: "side_table",
    price: 499,
    dimensions: { w: 0.68, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [...HUGG_SIDE_TABLE_GALLERIES.performanceDune],
    defaultVariantId: "chestnut",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: HUGG_SIDE_TABLE_URL,
    variants: buildHuggSideTableVariants("performanceDune"),
  },
  "coffee-real-castlery-peri-120": {
    id: "coffee-real-castlery-peri-120",
    name: "Peri Coffee Table",
    category: "coffee_table",
    price: 549,
    dimensions: { w: 1.2, d: 0.7, h: 0.3 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1641292754/crusader/variants/50850023/Peri-Coffee-Table-Front.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655220638/crusader/variants/50850023/peri-coffee-table-1655220635.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655201521/crusader/variants/50850023/Peri-Coffee-Table-001-1655201517.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1641292796/crusader/variants/50850023/Peri-Coffee-Table-Angle.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639132792/crusader/variants/50850023/Peri-Coffee-Table-Shared2.jpg",
      "https://res.cloudinary.com/castlery/image/upload/v1762244478/knight/USP/Refresh%202025/Peri-Coffee-Table-Square-Det_2.jpg",
    ],
    defaultVariantId: "peri_coffee_table_walnut_dark_grey_steel",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/peri-coffee-table?item_group_id=50850023",
    variants: [
      {
        id: "peri_coffee_table_walnut_dark_grey_steel",
        name: "Peri Coffee Table / Walnut / Dark Grey Steel",
        colorHex: "#b8b8b8",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1641292754/crusader/variants/50850023/Peri-Coffee-Table-Front.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1641292754/crusader/variants/50850023/Peri-Coffee-Table-Front.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655220638/crusader/variants/50850023/peri-coffee-table-1655220635.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1655201521/crusader/variants/50850023/Peri-Coffee-Table-001-1655201517.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1639132792/crusader/variants/50850023/Peri-Coffee-Table-Shared2.jpg",
          "https://res.cloudinary.com/castlery/image/upload/v1762244478/knight/USP/Refresh%202025/Peri-Coffee-Table-Square-Det_2.jpg",
        ],
      },
    ],
  },
  "coffee-real-castlery-arcadia-coffee-table": {
    id: "coffee-real-castlery-arcadia-coffee-table",
    name: "Arcadia Coffee Table",
    category: "coffee_table",
    price: 749,
    dimensions: { w: 1.2, d: 0.6, h: 0.38 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Front-1745228055.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1746583019/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Square-Set_1-1746583016.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1746761565/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Square-Det_18-1746761563.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228058/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Square-Det_1-1745228055.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Angle-1745228055.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228058/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Angle_1-1745228055.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Side-1745228055.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745289854/crusader/variants/T40550324/Arcadia-Coffee-Table-Caramel-Oak-Dim-1745289852.jpg",
    ],
    defaultVariantId: "arcadia_coffee_table_caramel_oak",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/arcadia-coffee-table?color_option=caramel_oak",
    variants: [
      {
        id: "arcadia_coffee_table_caramel_oak",
        name: "Arcadia Coffee Table / Caramel Oak",
        colorHex: "#b98655",
        finishCode: "caramel_oak",
        finishLabel: "Caramel Oak",
        swatchGroup: "wood_finish",
        swatchHex: "#b98655",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Front-1745228055.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Front-1745228055.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1746583019/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Square-Set_1-1746583016.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1746761565/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Square-Det_18-1746761563.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Angle-1745228055.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1745228057/crusader/variants/40550324/Arcadia-Coffee-Table-Caramel-Oak-Side-1745228055.jpg",
        ],
      },
    ],
  },
  "sofa-real-castlery-dawson-storage-ottoman": {
    id: "sofa-real-castlery-dawson-storage-ottoman",
    name: "Dawson Storage Ottoman",
    category: "ottoman",
    price: 649,
    dimensions: { w: 0.93, d: 0.93, h: 0.45 },
    modelUrl: "/assets/models/sofa-real-castlery-dawson-storage-ottoman-closed.glb",
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692451017/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Front_-1692451014.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692451016/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Angle-1692451014.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692591635/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Beach-Linen-Square-Set_2-1692591632.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692591689/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Det_1-1692591687.jpg",
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756279639/crusader/variants/54000254-NG4001/Dawson-Small-Storage-Ottoman-_Beach-Linen-Angle-1756279637.jpg",
    ],
    defaultVariantId: "standard",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/dawson-storage-ottoman",
    variants: [
      {
        id: "standard",
        name: "Standard",
        colorHex: "#b8b8b8",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692451017/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Front_-1692451014.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692451017/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Front_-1692451014.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692451016/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Angle-1692451014.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692591635/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Beach-Linen-Square-Set_2-1692591632.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1692591689/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Det_1-1692591687.jpg",
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756279639/crusader/variants/54000254-NG4001/Dawson-Small-Storage-Ottoman-_Beach-Linen-Angle-1756279637.jpg",
        ],
      },
    ],
  },
  "tv-real-castlery-sloane-tv-console-150": {
    id: "tv-real-castlery-sloane-tv-console-150",
    name: "Sloane TV Console",
    category: "tv_console",
    price: 1099,
    dimensions: { w: 1.5, d: 0.4, h: 0.58 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.jpg",
      "/assets/thumbs/tv-real-castlery-sloane-tv-console-150-hero.jpg",
      "/assets/thumbs/tv-real-castlery-sloane-tv-console-150.jpg",
      "/assets/thumbs/tv-real-castlery-sloane-tv-console-150.png",
    ],
    defaultVariantId: "150cm_grey_oak",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/sloane-tv-console?length=1_5m",
    variants: [
      {
        id: "150cm_grey_oak",
        name: "150cm / Grey Oak",
        colorHex: "#b8b8b8",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1756188904/crusader/variants/50520029/Sloane-TV-Console-150cm_-Front-1756188902.jpg",
          "/assets/thumbs/tv-real-castlery-sloane-tv-console-150-hero.jpg",
          "/assets/thumbs/tv-real-castlery-sloane-tv-console-150.jpg",
          "/assets/thumbs/tv-real-castlery-sloane-tv-console-150.png",
        ],
      },
    ],
  },
  "tv-real-castlery-sloane-tv-console-200": {
    id: "tv-real-castlery-sloane-tv-console-200",
    name: "Sloane TV Console",
    category: "tv_console",
    price: 1399,
    dimensions: { w: 2, d: 0.47, h: 0.58 },
    styleTags: ["modern"],
    galleryImages: [
      "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1667991824/crusader/variants/50520001/Sloane-TV-Console-Fornt-1667991822.jpg",
      "/assets/thumbs/tv-real-castlery-sloane-tv-console-200-hero.jpg",
      "/assets/thumbs/tv-real-castlery-sloane-tv-console-200.jpg",
      "/assets/thumbs/tv-real-castlery-sloane-tv-console-200.png",
    ],
    defaultVariantId: "200cm_grey_oak",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/sloane-tv-console?length=2_0m",
    variants: [
      {
        id: "200cm_grey_oak",
        name: "200cm / Grey Oak",
        colorHex: "#b8b8b8",
        thumbnailUrl:
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1667991824/crusader/variants/50520001/Sloane-TV-Console-Fornt-1667991822.jpg",
        galleryImages: [
          "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1667991824/crusader/variants/50520001/Sloane-TV-Console-Fornt-1667991822.jpg",
          "/assets/thumbs/tv-real-castlery-sloane-tv-console-200-hero.jpg",
          "/assets/thumbs/tv-real-castlery-sloane-tv-console-200.jpg",
          "/assets/thumbs/tv-real-castlery-sloane-tv-console-200.png",
        ],
      },
    ],
  },
};

const isPlaceholderProduct = (product: Product): boolean => {
  const buyUrl = String(product.buyUrl ?? "").toLowerCase();
  const shopifyVariantId = String(product.shopifyVariantId ?? "").toLowerCase();
  const variantHasPlaceholderMapping = product.variants.some((variant) =>
    String(variant.shopifyVariantId ?? "").toLowerCase().includes("unspecified")
  );

  return (
    buyUrl.includes("example.com") ||
    buyUrl.includes("unspecified") ||
    shopifyVariantId.includes("unspecified") ||
    variantHasPlaceholderMapping
  );
};

const isRealCatalogProduct = (product: Product): boolean => {
  if (isPlaceholderProduct(product)) return false;
  return product.id.includes("-real-") || product.id.startsWith("castlery-");
};

const ALL_CATALOG_ENTRIES = Object.entries(CATALOG);
const PUBLIC_CATALOG_ENTRIES = ALL_CATALOG_ENTRIES.filter(([, product]) =>
  isRealCatalogProduct(product)
);

// ============================================================================
// Normalized Catalog (Public API)
// ============================================================================

export const CATALOG_ITEMS: Record<string, CatalogItemSchema> = Object.fromEntries(
  PUBLIC_CATALOG_ENTRIES.map(([id, product]) => [id, buildCatalogItem(product)])
);

export const CATALOG_ITEMS_MAP = new Map<string, CatalogItemSchema>(
  Object.entries(CATALOG_ITEMS)
);

// ============================================================================
// Dev-Only Validations (Run at module load in development)
// ============================================================================

if (process.env.NODE_ENV !== "production") {
  // Validate all legacy products convert successfully
  const errors: string[] = [];
  
  PUBLIC_CATALOG_ENTRIES.forEach(([id, product]) => {
    try {
      const item = buildCatalogItem(product);
      
      // Check ID consistency
      if (item.id !== id) {
        errors.push(`${id}: ID mismatch (product.id="${product.id}")`);
      }
      
      // Check defaultVariantId exists
      if (!item.variants.find(v => v.id === item.defaultVariantId)) {
        errors.push(`${id}: defaultVariantId "${item.defaultVariantId}" not found in variants`);
      }
      
      // Check commerce mapping is valid
      if (item.commerce.type === "not_buyable" && !item.commerce.reason) {
        errors.push(`${id}: not_buyable without reason`);
      }
      
      // Check dimensions are positive
      if (item.dimsMm.w <= 0 || item.dimsMm.d <= 0 || item.dimsMm.h <= 0) {
        errors.push(`${id}: invalid dimensions (${item.dimsMm.w}×${item.dimsMm.d}×${item.dimsMm.h}mm)`);
      }
      
    } catch (err) {
      errors.push(`${id}: failed to build - ${err}`);
    }
  });
  
  // Check for duplicate IDs
  const ids = Object.keys(CATALOG_ITEMS);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    errors.push(`Duplicate IDs found in catalog (${ids.length} total, ${uniqueIds.size} unique)`);
  }
  
  if (errors.length > 0) {
    console.error(
      "❌ Catalog validation errors:\n" + 
      errors.map(e => `  - ${e}`).join("\n")
    );
  } else {
    console.log(`✅ Catalog validated: ${ids.length} items`);
  }
}
