import {
  CATEGORY_DEFAULTS,
  type CatalogItemSchema,
  type CommerceMapping,
  type FixturePhotometricMetadata,
  type ProductCategory as NormalizedCategory,
  type StyleTag,
} from "../catalog-schema";
import {
  ESTIMATED_CEILING_LIGHT_LUMENS,
  ESTIMATED_FLOOR_LAMP_DIRECT_LUMENS,
  ESTIMATED_SHADED_LAMP_BEAM_DEG,
  ESTIMATED_TABLE_LAMP_DIRECT_LUMENS,
} from "../fixture-lighting-defaults";
import { getModelAsset } from "../model-assets";
import { resolveCastleryVariantAffiliateUrl } from "./castlery-retailer-links";
import {
  DALTON_STANDARD_QUEEN_THUMB_URL,
  buildAveryUpholsteryVariants,
} from "./data";
import type { Product } from "./product-types";

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

function buildEstimatedFixtureLighting(
  category: NormalizedCategory,
  heightMm: number
): FixturePhotometricMetadata | undefined {
  if (
    category !== "floor_lamp" &&
    category !== "table_lamp" &&
    category !== "pendant_light"
  ) {
    return undefined;
  }
  const pendant = category === "pendant_light";
  return {
    emitterType: "spot",
    localOffsetMeters: [
      0,
      Math.max(0.08, heightMm / 1000 - (pendant ? 0.14 : 0.1)),
      0,
    ],
    direction: [0, -1, 0],
    beamAngleDeg: pendant ? 56 : ESTIMATED_SHADED_LAMP_BEAM_DEG,
    luminousFluxLumens:
      category === "table_lamp"
        ? ESTIMATED_TABLE_LAMP_DIRECT_LUMENS
        : category === "floor_lamp"
          ? ESTIMATED_FLOOR_LAMP_DIRECT_LUMENS
          : ESTIMATED_CEILING_LIGHT_LUMENS,
    cctKelvin: 2700,
    dimmable: true,
    verification: "estimated",
  };
}

export function buildCatalogItem(product: Product): CatalogItemSchema {
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
    lighting: buildEstimatedFixtureLighting(category, dimensionsMm.h),
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
