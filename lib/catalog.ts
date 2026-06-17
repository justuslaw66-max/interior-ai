import {
  CATEGORY_DEFAULTS,
  type CatalogItemSchema,
  type CommerceMapping,
  type StyleTag,
  type ProductCategory as NormalizedCategory,
} from "./catalog-schema";
import { getModelAsset } from "./model-assets";

export type Variant = {
  id: string;
  name: string;
  colorHex: string;
  finishCode?: string;
  finishLabel?: string;
  swatchGroup?: string;
  swatchHex?: string;
  thumbnailUrl?: string;
  galleryImages?: string[];
  priceDelta?: number;
  shopifyVariantId?: string;
};

export type ProductCategory =
  | "sofa"
  | "ottoman"
  | "coffee_table"
  | "side_table"
  | "dining_table"
  | "dining_bench"
  | "rug"
  | "tv_console"
  | "sideboard"
  | "accent_chair"
  | "floor_lamp";

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  dimensions: { w: number; d: number; h: number };
  styleTags: string[];
  galleryImages?: string[];
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

  // ========== IMPORTED CASTLERY SOFAS (Harvested from Castlery Website) ==========
  "sofa-real-castlery-jaron-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737527905/crusader/variants/AS-000658-LE4023/Jaron-Leather-3-Seater-Dual-Recliner-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737527903.png",
  "sofa-real-castlery-jaron-extended-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737534897/crusader/variants/AS-000669-LE4023/Jaron-Leather-Extended-3-Seater-Recliner-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737534895.png",
  "sofa-real-castlery-jaron-3s-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737527644/crusader/variants/AS-000659-LE4023/Jaron-Leather-3-Seater-Dual-Recliner-Wide-Arm-Sofa-Marche-Cocoa_-Front-1737527642.jpg",
  "sofa-real-castlery-jaron-extended-3s-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737534745/crusader/variants/AS-000670-LE4023/Jaron-Leather-Extended-3-Seater-Recliner-Wide-Arm-Sofa-Marche-Cocoa_-Front-1737534742.jpg",
  "sofa-real-castlery-jaron-chaise-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599392/crusader/variants/AS-000675-LE4023/Jaron-Leather-Chaise-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Front-1737599390.jpg",
  "sofa-real-castlery-jaron-chaise-sectional-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599336/crusader/variants/AS-000676-LE4023/Jaron-Leather-Chaise-Sectional-Wide-Arm-Sofa-Marche-Cocoa_-Angle-1737599333.jpg",
  "sofa-real-castlery-jaron-l-shaped-sectional": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599830/crusader/variants/AS-000681-LE4023/Jaron-Leather-L-Shape-Sectional-Slim-Arm-Sofa-Marche-Cocoa_-Angle-1737599828.jpg",
  "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1737599772/crusader/variants/AS-000682-LE4023/Jaron-Leather-L-Shape-Sectional-Wide-Arm-Sofa-Marche-Cocoa_-Angle-1737599770.jpg",
  "sofa-real-castlery-madison-2s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1745287810/crusader/variants/50441008-AM4001/Madison-2-Seater-Sofa-Amalfi-Bisque-Front-1745287807.png",
  "sofa-real-castlery-madison-3s": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1646386187/crusader/variants/50440750-AM4001/Madison-3-Seater-Sofa-Bisque-Front-SG.png",
  "sofa-real-castlery-madison-ottoman": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1645673995/crusader/variants/50440732-AM4001/Madison-Ottoman-Bisque-Front.png",
  "armchair-real-castlery-madison-armchair": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1000/v1645673258/crusader/variants/50440731-AM4001/Madison-Armchair-Bisque-Front.png",
  "sofa-real-castlery-ollie-storage-ottoman": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1768210734/crusader/variants/AS-001017-GR4001/Ollie-Storage-Ottoman-Iovry-Front-1768210732.jpg",
  "armchair-real-castlery-avery-performance-armchair": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175346/crusader/variants/50441020-IN4002/Avery-Armchair-Performance-Infinity-Boucle-White-Quartz-Front-1760175346.jpg",
  "armchair-real-castlery-avery-performance-armchair-with-ottoman": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174592/crusader/variants/PB-001916-IN4002/Avery-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174592.jpg",
  "armchair-real-castlery-avery-performance-swivel-armchair": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760175397/crusader/variants/50441021-IN4002/Avery-Swivel-Armchair-Performance-Infinity-Boucle-White-Quartz-Angle-1760175397.jpg",
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1760174560/crusader/variants/PB-001917-IN4002/Avery-Swivel-Armchair-With-Ottoman-Performance-Infinity-Boucle-White-Quartz-Angle-1760174560.jpg",

  // ========== IMPORTED CASTLERY DINING (Harvested from Castlery Website) ==========
  "dining-real-castlery-sloane-travertine-180": "https://res.cloudinary.com/castlery/image/private/c_fit,f_auto,q_auto,w_1200/v1723776680/crusader/variants/AS-000564/Sloane-Travertine-Dining-Table-180cm-Angle-1723776679.jpg",
  "dining-real-castlery-sloane-bench-150-no-cushion": "/assets/thumbs/dining-real-castlery-sloane-bench-150-no-cushion.png",
  "dining-real-castlery-sloane-bench-150-leather-cushion": "/assets/thumbs/dining-real-castlery-sloane-bench-150-leather-cushion.png",
  "dining-real-castlery-sloane-bench-180-no-cushion": "/assets/thumbs/dining-real-castlery-sloane-bench-180-no-cushion.png",
  "dining-real-castlery-sloane-bench-180-leather-cushion": "/assets/thumbs/dining-real-castlery-sloane-bench-180-leather-cushion.png",

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
  "tv-real-castlery-casa-tv-console-150": "/assets/thumbs/tv-real-castlery-casa-tv-console-150.png",
  "tv-real-castlery-sawyer-tv-console-200": "/assets/thumbs/tv-real-castlery-sawyer-tv-console-200.png",
  "tv-real-castlery-seb-tv-console-150": "/assets/thumbs/tv-real-castlery-seb-tv-console-150.png",
  "tv-real-castlery-sloane-tv-console-150": "/assets/thumbs/tv-real-castlery-sloane-tv-console-150.png",

  // ========== STORAGE - SAWYER SIDEBOARD ==========
  "storage-real-castlery-sawyer-sideboard-180cm": "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1673927310/crusader/variants/50220001/Sawyer-TV-Console-Angle-1673927308.png",

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
    ...(modelLabel ? { modelLabel } : {}),
  };

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
    variants: product.variants.map((variant) => ({
      id: variant.id,
      label: variant.name,
      colorHex: variant.colorHex,
      finishCode: variant.finishCode,
      finishLabel: variant.finishLabel,
      swatchGroup: variant.swatchGroup,
      swatchHex: variant.swatchHex,
      thumbnailUrl:
        variant.thumbnailUrl ??
        LEGACY_THUMB_URL_OVERRIDES[product.id] ??
        `/assets/thumbs/${product.id}-${variant.id}.png`,
      galleryImages: variant.galleryImages,
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

const HUGG_RECTANGULAR_URL = "https://www.castlery.com/sg/products/hugg-nesting-rectangular-coffee-table";
const HUGG_SIDE_TABLE_URL = "https://www.castlery.com/sg/products/hugg-nesting-side-table";

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

const CATALOG: Record<string, Product> = {
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
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/hugg-nesting-square-coffee-table",
    variants: [
      {
        id: "natural",
        name: "Natural",
        colorHex: "#a89070",
        finishCode: "natural",
        finishLabel: "Natural",
        swatchGroup: "wood_finish",
        swatchHex: "#a89070",
      },
      {
        id: "chestnut",
        name: "Chestnut",
        colorHex: "#8b6f47",
        finishCode: "chestnut",
        finishLabel: "Chestnut",
        swatchGroup: "wood_finish",
        swatchHex: "#8B6F47",
      },
      {
        id: "black",
        name: "Black",
        colorHex: "#1f1f1f",
        finishCode: "black",
        finishLabel: "Black",
        swatchGroup: "wood_finish",
        swatchHex: "#1f1f1f",
      },
    ],
  },
  "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened": {
    id: "coffee-real-castlery-hugg-nesting-square-performance-basalt-opened",
    name: "Hugg Nesting Square Coffee Table",
    category: "coffee_table",
    price: 1099,
    dimensions: { w: 1.1, d: 1.1, h: 0.43 },
    styleTags: ["modern"],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/hugg-nesting-square-coffee-table",
    variants: [
      {
        id: "natural",
        name: "Natural",
        colorHex: "#a89070",
        finishCode: "natural",
        finishLabel: "Natural",
        swatchGroup: "wood_finish",
        swatchHex: "#a89070",
      },
      {
        id: "chestnut",
        name: "Chestnut",
        colorHex: "#8b6f47",
        finishCode: "chestnut",
        finishLabel: "Chestnut",
        swatchGroup: "wood_finish",
        swatchHex: "#8B6F47",
      },
      {
        id: "black",
        name: "Black",
        colorHex: "#1f1f1f",
        finishCode: "black",
        finishLabel: "Black",
        swatchGroup: "wood_finish",
        swatchHex: "#1f1f1f",
      },
    ],
  },
  "coffee-real-castlery-hugg-nesting-square-performance-dune-closed": {
    id: "coffee-real-castlery-hugg-nesting-square-performance-dune-closed",
    name: "Hugg Nesting Square Coffee Table",
    category: "coffee_table",
    price: 1099,
    dimensions: { w: 1.1, d: 1.1, h: 0.43 },
    styleTags: ["modern"],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/hugg-nesting-square-coffee-table",
    variants: [
      {
        id: "natural",
        name: "Natural",
        colorHex: "#a89070",
        finishCode: "natural",
        finishLabel: "Natural",
        swatchGroup: "wood_finish",
        swatchHex: "#a89070",
      },
      {
        id: "chestnut",
        name: "Chestnut",
        colorHex: "#8b6f47",
        finishCode: "chestnut",
        finishLabel: "Chestnut",
        swatchGroup: "wood_finish",
        swatchHex: "#8B6F47",
      },
      {
        id: "black",
        name: "Black",
        colorHex: "#1f1f1f",
        finishCode: "black",
        finishLabel: "Black",
        swatchGroup: "wood_finish",
        swatchHex: "#1f1f1f",
      },
    ],
  },
  "coffee-real-castlery-hugg-nesting-square-performance-dune-opened": {
    id: "coffee-real-castlery-hugg-nesting-square-performance-dune-opened",
    name: "Hugg Nesting Square Coffee Table",
    category: "coffee_table",
    price: 1099,
    dimensions: { w: 1.1, d: 1.1, h: 0.43 },
    styleTags: ["modern"],
    defaultVariantId: "natural",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/hugg-nesting-square-coffee-table",
    variants: [
      {
        id: "natural",
        name: "Natural",
        colorHex: "#a89070",
        finishCode: "natural",
        finishLabel: "Natural",
        swatchGroup: "wood_finish",
        swatchHex: "#a89070",
      },
      {
        id: "chestnut",
        name: "Chestnut",
        colorHex: "#8b6f47",
        finishCode: "chestnut",
        finishLabel: "Chestnut",
        swatchGroup: "wood_finish",
        swatchHex: "#8B6F47",
      },
      {
        id: "black",
        name: "Black",
        colorHex: "#1f1f1f",
        finishCode: "black",
        finishLabel: "Black",
        swatchGroup: "wood_finish",
        swatchHex: "#1f1f1f",
      },
    ],
  },
  "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-closed": {
    id: "coffee-real-castlery-hugg-nesting-rectangular-performance-basalt-closed",
    name: "Hugg Nesting Rectangular Coffee Table",
    category: "coffee_table",
    price: 799,
    dimensions: { w: 1.1, d: 0.55, h: 0.43 },
    styleTags: ["modern"],
    galleryImages: [HUGG_RECTANGULAR_VARIANT_IMAGES.performanceBasalt.chestnut],
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
    galleryImages: [HUGG_RECTANGULAR_VARIANT_IMAGES.performanceBasalt.chestnut],
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
    galleryImages: [HUGG_RECTANGULAR_VARIANT_IMAGES.performanceDune.chestnut],
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
    galleryImages: [HUGG_RECTANGULAR_VARIANT_IMAGES.performanceDune.chestnut],
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
    galleryImages: [HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceBasalt.chestnut],
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
    galleryImages: [HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceBasalt.chestnut],
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
    galleryImages: [HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceDune.chestnut],
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
    galleryImages: [HUGG_SIDE_TABLE_VARIANT_IMAGES.performanceDune.chestnut],
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
    defaultVariantId: "peri_coffee_table_walnut_dark_grey_steel",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/peri-coffee-table?item_group_id=50850023",
    variants: [
      {
        id: "peri_coffee_table_walnut_dark_grey_steel",
        name: "Peri Coffee Table / Walnut / Dark Grey Steel",
        colorHex: "#b8b8b8",
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
    defaultVariantId: "150cm_grey_oak",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/sloane-tv-console?length=1_5m",
    variants: [
      {
        id: "150cm_grey_oak",
        name: "150cm / Grey Oak",
        colorHex: "#b8b8b8",
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
    defaultVariantId: "200cm_grey_oak",
    purchaseMode: "affiliate",
    retailer: "Castlery Singapore",
    buyUrl: "https://www.castlery.com/sg/products/sloane-tv-console?length=2_0m",
    variants: [
      {
        id: "200cm_grey_oak",
        name: "200cm / Grey Oak",
        colorHex: "#b8b8b8",
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
