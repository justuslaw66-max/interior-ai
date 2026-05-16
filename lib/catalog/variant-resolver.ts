import type { CatalogItemSchema, DimensionsMm, ProductVariant } from "../catalog-schema";
import type { CatalogMediaFallbackSource } from "./media-policy";

export type ResolvedVariantCommerce =
  | {
      type: "shopify";
      productId: string;
      variantId: string | null;
      available: boolean;
    }
  | {
      type: "affiliate";
      url: string | null;
      retailer: string | null;
      priceHint: number | null;
      available: boolean;
    }
  | {
      type: "not_buyable";
      reason: string;
      available: false;
    };

export type ResolvedCatalogVariant = {
  catalogItemId: string;
  variantId: string;
  variant: ProductVariant;
  requestedVariantId?: string;
  matchedRequestedVariant: boolean;
  dimsMm: DimensionsMm;
  media: {
    thumbUrl: string | null;
    galleryImages: string[];
    fallbackSource: CatalogMediaFallbackSource;
  };
  finish: {
    code: string;
    label: string;
    swatchHex?: string;
  };
  commerce: ResolvedVariantCommerce;
  priceReference: {
    amount: number | null;
    currency: "SGD";
    source: "variant" | "item" | "unknown";
  };
  availabilityReference: {
    available: boolean;
    source: "variant" | "item" | "computed";
  };
  issues: string[];
};

function normalizeMediaIdentity(value: string): string {
  const trimmed = value.trim();
  const withoutQuery = trimmed.split("?")[0] ?? trimmed;

  if (!/res\.cloudinary\.com/i.test(withoutQuery)) {
    return withoutQuery;
  }

  return withoutQuery
    .replace(/^https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/private\/[^/]+\//i, "")
    .replace(/^v\d+\//i, "")
    .replace(/\.(jpg|jpeg|png|webp)$/i, "")
    .toLowerCase();
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (!value) continue;
    const identity = normalizeMediaIdentity(value);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    result.push(value);
  }

  return result;
}

function getResolvedDimensions(item: CatalogItemSchema, variant: ProductVariant): DimensionsMm {
  const override = variant.dimensionsMm;
  if (override && override.w > 0 && override.d > 0 && override.h > 0) {
    return { ...override };
  }
  return { ...item.dimsMm };
}

function isCanonicalDawsonPitSectionalPhoto(url: string | null | undefined): boolean {
  const normalized = String(url ?? "").trim();
  if (!normalized) return false;
  return /Dawson-Pit-Sectional-Sofa/i.test(normalized) && !/Swatch/i.test(normalized);
}

function isCanonicalDawsonOttomanPhoto(url: string | null | undefined): boolean {
  const normalized = String(url ?? "").trim();
  if (!normalized) return false;
  return /Dawson-(?:Square-|Small-Storage-|Leather-Small-)?Ottoman/i.test(normalized) && !/Swatch/i.test(normalized);
}

function normalizeFinishToken(value: string | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function isSwatchLikeThumb(url: string | null | undefined): boolean {
  const value = String(url ?? "");
  return /\/(swatches|materials)\//i.test(value) || /(swatch|_det_\d+|jonathan-sofa|hamilton-leather-sofa)/i.test(value);
}

function resolveDawsonFabricThumb(itemId: string, variant: ProductVariant): string | null {
  if (!itemId.startsWith("sofa-real-castlery-dawson-")) return null;

  const defaultHeroByItemId: Record<string, string> = {
    "sofa-real-castlery-dawson-pit-sectional":
      "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1709779174/crusader/variants/AS-000379-NG4001/Dawson-Pit-Sectional-Sofa-Front_1_-1709779171.jpg",
    "sofa-real-castlery-dawson-3s":
      "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634716861/crusader/variants/T50440986-NG4001/Dawson-3-Seater-Sofa-Beach-Linen-Front.jpg",
    "sofa-real-castlery-dawson-extended-sofa":
      "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1634717099/crusader/variants/T50440987-NG4001/Dawson-Extended-Sofa-Beach-Linen-Front.jpg",
    "sofa-real-castlery-dawson-ottoman":
      "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692451017/crusader/variants/54000132-NG4001/Dawson-Square-Ottoman-Front_-1692451014.jpg",
    "sofa-real-castlery-dawson-swivel-armchair":
      "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1692591109/crusader/variants/54000131-NG4001/Dawson-Swivel-Armchair-Angle-1692591104.jpg",
    "sofa-real-castlery-dawson-wide-chaise-sectional":
      "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1724055040/crusader/variants/AS-000625-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Bech-Linen-Front-1724055038.jpg",
    "sofa-real-castlery-dawson-wide-chaise-sectional-left":
      "/assets/thumbs/sofa-real-castlery-dawson-wide-chaise-sectional-left.png",
  };

  const heroByItemIdAndFinishCode: Record<string, Record<string, string>> = {
    "sofa-real-castlery-dawson-pit-sectional": {
      navagio_seagull:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1709781193/crusader/variants/AS-000379-NG4002/Dawson-Pit-Sectional-Sofa-Seagull-Front-1709781190.jpg",
      performance_creamy_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730774165/crusader/variants/AS-000379C-PT4001/Dawson-Pit-Sectional-Sofa-Creamy-White-Angle-1730774162.jpg",
      indigo_blue:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730774355/crusader/variants/AS-000379C-TL4001/Dawson-Pit-Sectional-Sofa-Indigo-Blue-Angle-1730774353.jpg",
      marcel_brilliant_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730774303/crusader/variants/AS-000379C-PM4002/Dawson-Pit-Sectional-Sofa-Brilliant-White-Angle-1730774301.jpg",
      peyton_ivory:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730773036/crusader/variants/AS-000379C-PY4001/Dawson-Pit-Sectional-Sofa-Ivory-Angle-1730773034.jpg",
      peyton_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730773086/crusader/variants/AS-000379C-PY4002/Dawson-Pit-Sectional-Sofa-Dove-Grey-Angle-1730773084.jpg",
      marcel_smoke_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730773146/crusader/variants/AS-000379C-PM4001/Dawson-Pit-Sectional-Sofa-Smoke-Grey-Angle-1730773144.jpg",
      peyton_moss:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730773177/crusader/variants/AS-000379C-PY4003/Dawson-Pit-Sectional-Sofa-Moss-Angle-1730773175.jpg",
      peyton_cumin:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730773202/crusader/variants/AS-000379C-PY4004/Dawson-Pit-Sectional-Sofa-Cumin-Angle-1730773200.jpg",
      infinity_boucle_ginger:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730774202/crusader/variants/AS-000379C-IN4003/Dawson-Pit-Sectional-Sofa-Ginger-Angle-1730774199.jpg",
      infinity_boucle_white_quartz:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730774231/crusader/variants/AS-000379C-IN4002/Dawson-Pit-Sectional-Sofa-White-Quartz-Angle-1730774228.jpg",
      performance_boucle_cream:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773903548/crusader/variants/AS-000379C-IN4005/Dawson-Pit-Sectional-Sofa-Cream-Front-1773903546.jpg",
      performance_infinity_boucle_moss:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1774246762/crusader/variants/AS-000379C-IN4004/Dawson-Pit-Sectional-Sofa-Moss-Angle-1774246759.jpg",
      performance_genova_oat:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773911672/crusader/variants/AS-000379C-PG4002/Dawson-Pit-Sectional-Sofa-Performance-Genova-Oat-Angle-1773911670.jpg",
      performance_linen_weave_cream:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773911689/crusader/variants/AS-000379C-PG4003/Dawson-Pit-Sectional-Sofa-Cream-Angle-1773911687.jpg",
      performance_linen_weave_light_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773911703/crusader/variants/AS-000379C-PG4004/Dawson-Pit-Sectional-Sofa-Light-Grey-Angle-1773911700.jpg",
      performance_twill_pearl_beige:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773901288/crusader/variants/AS-000379C-PT4002/Dawson-Pit-Sectional-Sofa-Performance-Twill-Pearl-Beige-Angle-1773901286.jpg",
      performance_twill_slate:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773901545/crusader/variants/AS-000379C-PT4003/Dawson-Pit-Sectional-Sofa-Performance-Twill-Slate-Angle-1773901542.jpg",
      performance_twill_moss:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773901560/crusader/variants/AS-000379C-PT4004/Dawson-Pit-Sectional-Sofa-Performance-Twill-Moss-Angle-1773901558.jpg",
      performance_twill_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773901580/crusader/variants/AS-000379C-PT4005/Dawson-Pit-Sectional-Sofa-Performance-Twill-Dove-Grey-Angle-1773901578.jpg",
      greta_ivory:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1774246775/crusader/variants/AS-000379C-GR4001/Dawson-Pit-Sectional-Sofa-Cream-Angle-1774246772.jpg",
      washed_chenille_sand:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1774246787/crusader/variants/AS-000379C-GR4002/Dawson-Pit-Sectional-Sofa-Sand-Front-1774246785.jpg",
      greta_mustard_brown:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1774246803/crusader/variants/AS-000379C-GR4003/Dawson-Pit-Sectional-Sofa-Caramel-Angle-1774246800.jpg",
      greta_moss:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1774246815/crusader/variants/AS-000379C-GR4004/Dawson-Pit-Sectional-Sofa-Moss-Angle-1774246812.jpg",
      cocoa_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1715669133/crusader/variants/AS-000533-LE4020/Dawson-Pit-Sectional-Sofa-Cocoa-Angle-1715669132.jpg",
      caramel_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773801418/crusader/variants/AS-000533C-LE4016/Dawson-Pit-Sectional-Sofa-Caramel-Front-1773801415.jpg",
      warm_taupe_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773801435/crusader/variants/AS-000533C-LE4017/Dawson-Pit-Sectional-Sofa-Warm-Taupe-Front-1773801433.jpg",
      marche_ivory_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773801452/crusader/variants/AS-000533C-LE4021/Dawson-Pit-Sectional-Sofa-Marche-Ivory-Front-1773801450.jpg",
      marche_graphite_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773912987/crusader/variants/AS-000533C-LE4022/Dawson-Pit-Sectional-Sofa-Marche-Graphite-Angle-1773912985.jpg",
      marche_cocoa_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773913008/crusader/variants/AS-000533C-LE4023/Dawson-Pit-Sectional-Sofa-Marche-Cocoa-Angle-1773913006.jpg",
    },
    "sofa-real-castlery-dawson-3s": {
      navagio_seagull:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1697614106/crusader/variants/AS-000374-NG4002/Dawson-3-Seater-Sofa-Seagull-Front-1697614103.jpg",
      performance_creamy_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1731313137/crusader/variants/AS-000374C-PT4001/Dawson-3-Seater-Sofa-Creamy-White-Front-1731313134.jpg",
      indigo_blue:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1731313222/crusader/variants/AS-000374C-TL4001/Dawson-3-Seater-Sofa-Indigo-Blue-Front-1731313219.jpg",
      marcel_brilliant_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1731313178/crusader/variants/AS-000374C-PM4002/Dawson-3-Seater-Sofa-Brilliant-White-Front-1731313175.jpg",
      peyton_ivory:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730946379/crusader/variants/AS-000374C-PY4001/Dawson-3-Seater-Sofa-Ivory-Front-1730946377.jpg",
      peyton_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730946413/crusader/variants/AS-000374C-PY4002/Dawson-3-Seater-Sofa-Dove-Grey-Front-1730946410.jpg",
      marcel_smoke_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1731313159/crusader/variants/AS-000374C-PM4001/Dawson-3-Seater-Sofa-Smoke-Grey-Front-1731313156.jpg",
      peyton_moss:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1730946446/crusader/variants/AS-000374C-PY4003/Dawson-3-Seater-Sofa-Moss-Front-1730946444.jpg",
      infinity_boucle_ginger:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1731313112/crusader/variants/AS-000374C-IN4003/Dawson-3-Seater-Sofa-Ginger-Front-1731313109.jpg",
      infinity_boucle_white_quartz:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1731313073/crusader/variants/AS-000374C-IN4002/Dawson-3-Seater-Sofa-White-Quartz-Front-1731313071.jpg",
      cocoa_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721376225/crusader/variants/AS-000528-LE4020/Dawson-3-Seater-Sofa-Cocoa-Front-1721376223.jpg",
      caramel_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773800729/crusader/variants/AS-000528C-LE4016/Dawson-3-Seater-Sofa-Caramel-Front-1773800726.jpg",
      warm_taupe_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773800747/crusader/variants/AS-000528C-LE4017/Dawson-3-Seater-Sofa-Warm-Taupe-Front-1773800745.jpg",
      marche_ivory_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773800766/crusader/variants/AS-000528C-LE4021/Dawson-3-Seater-Sofa-Marche-Ivory-Front-1773800764.jpg",
      marche_graphite_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773911958/crusader/variants/AS-000528C-LE4022/Dawson-3-Seater-Sofa-Marche-Graphite-Front-1773911956.jpg",
      marche_cocoa_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1773911977/crusader/variants/AS-000528C-LE4023/Dawson-3-Seater-Sofa-Marche-Cocoa-Front-1773911974.jpg",
    },
    "sofa-real-castlery-dawson-extended-sofa": {
      navagio_seagull:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1697616888/crusader/variants/AS-000375-NG4002/Dawson-Extended-3-Seater-Sofa-Seagull-Front-1697616885.jpg",
      performance_creamy_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283373/crusader/variants/AS-000375C-PT4001/Dawson-Extended-Sofa-Creamy-White-Front-1721283371.jpg",
      indigo_blue:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283345/crusader/variants/AS-000375C-TL4001/Dawson-Extended-Sofa-Indigo-Blue-Front-1721283342.jpg",
      marcel_brilliant_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283322/crusader/variants/AS-000375C-PM4002/Dawson-Extended-Sofa-Brilliant-White-Front-1721283320.jpg",
      peyton_ivory:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283310/crusader/variants/AS-000375C-PY4001/Dawson-Extended-Sofa-Ivory-Front-1721283307.jpg",
      peyton_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1737360943/crusader/variants/AS-000375C-PY4002/Dawson-Extended-Sofa-Dove-Grey-Front-1737360941.jpg",
      marcel_smoke_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283270/crusader/variants/AS-000375C-PM4001/Dawson-Extended-Sofa-Smoke-Grey-Front-1721283268.jpg",
      peyton_moss:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283249/crusader/variants/AS-000375C-PY4003/Dawson-Extended-Sofa-Moss-Front-1721283246.jpg",
      peyton_cumin:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283221/crusader/variants/AS-000375C-PY4004/Dawson-Extended-Sofa-Cumin-Front-1721283219.jpg",
      infinity_boucle_ginger:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1723540812/crusader/variants/AS-000375C-IN4003/Dawson-Extended-Sofa-Ginger-Front-1723540810.jpg",
      infinity_boucle_white_quartz:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721283192/crusader/variants/AS-000375C-IN4002/Dawson-Extended-Sofa-White-Quartz-Front-1721283190.jpg",
    },
    "sofa-real-castlery-dawson-ottoman": {
      navagio_seagull:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1697602865/crusader/variants/54000132-NG4002/Dawson-Square-Ottoman-Seagull-Front-1697602863.jpg",
      performance_creamy_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1720773769/crusader/variants/54000132C-PT4001/Dawson-Ottoman-Creamy-White-Front-1720773766.jpg",
      indigo_blue:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721012303/crusader/variants/54000132C-TL4001/Dawson-Ottoman-Indigo-Blue-Front-1721012300.jpg",
      marcel_brilliant_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721012055/crusader/variants/54000132C-PM4002/Dawson-Ottoman-Performance-Brilliant-White-Front-1721012052.jpg",
      peyton_ivory:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721012023/crusader/variants/54000132C-PY4001/Dawson-Ottoman-Ivory-Front-1721012021.jpg",
      peyton_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1721011746/crusader/variants/54000132C-PY4002/Dawson-Ottoman-Dove-Grey-Front-1721011744.jpg",
    },
    "sofa-real-castlery-dawson-swivel-armchair": {
      navagio_beach_linen:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1692591109/crusader/variants/54000131-NG4001/Dawson-Swivel-Armchair-Angle-1692591104.jpg",
      navagio_seagull:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1697620436/crusader/variants/54000131-NG4002/Dawson-Swivel-Armchair-Seagull-Angle-1697620433.jpg",
      cocoa_leather:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1716965158/crusader/variants/54000131-LE4020/Dawson-Leather-Swivel-Armchair-Cocoa-Angle-1716965156.jpg",
    },
    "sofa-real-castlery-dawson-wide-chaise-sectional": {
      navagio_seagull:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1724054978/crusader/variants/AS-000625-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Seagull-Front-1724054975.jpg",
      performance_creamy_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1735891193/crusader/variants/AS-000625C-PT4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Creamy-White-Front-1735891191.jpg",
      indigo_blue:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1735891138/crusader/variants/AS-000625C-TL4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Indigo-Blue-Front-1735891135.jpg",
      marcel_brilliant_white:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1735891232/crusader/variants/AS-000625C-PM4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Brilliant-White-Front-1735891230.jpg",
      peyton_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1735891413/crusader/variants/AS-000625C-PY4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Dove-Grey-Front-1735891411.jpg",
      marcel_smoke_grey:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1735891266/crusader/variants/AS-000625C-PM4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Smoke-Grey-Front-1735891263.jpg",
      infinity_boucle_ginger:
        "https://res.cloudinary.com/castlery/image/private/w_1500,f_auto,q_auto,c_fit/v1735891297/crusader/variants/AS-000625C-IN4003/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Ginger-Front-1735891294.jpg",
      performance_boucle_cream:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773743390/crusader/variants/AS-000625C-IN4005/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Cream-Front-1773743388.jpg",
      performance_infinity_boucle_moss:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774246980/crusader/variants/AS-000625C-IN4004/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Moss-Front-1774246978.jpg",
      performance_genova_oat:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773911829/crusader/variants/AS-000625C-PG4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Performance-Genova-Oat-Front-1773911827.jpg",
      performance_linen_weave_cream:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773911847/crusader/variants/AS-000625C-PG4003/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Cream-Front-1773911843.jpg",
      performance_linen_weave_light_grey:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773911860/crusader/variants/AS-000625C-PG4004/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Light-Grey-Front-1773911858.jpg",
      performance_twill_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901786/crusader/variants/AS-000625C-PT4005/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Performance-Twill-Dove-Grey-Front-1773901783.jpg",
      performance_twill_pearl_beige:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901743/crusader/variants/AS-000625C-PT4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Performance-Twill-Pearl-Beige-Front-1773901741.jpg",
      performance_twill_slate:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901759/crusader/variants/AS-000625C-PT4003/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Performance-Twill-Slate-Front-1773901756.jpg",
      performance_twill_moss:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901772/crusader/variants/AS-000625C-PT4004/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Performance-Twill-Moss-Front-1773901769.jpg",
      greta_ivory:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774246995/crusader/variants/AS-000625C-GR4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Cream-Front-1774246993.jpg",
      washed_chenille_sand:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774247010/crusader/variants/AS-000625C-GR4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Sand-Front-1774247007.jpg",
      greta_mustard_brown:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774604664/crusader/variants/AS-000625C-GR4003/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Caramel-Front-1774604662.jpg",
      greta_moss:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774247039/crusader/variants/AS-000625C-GR4004/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Moss-Front-1774247036.jpg",
    },
    "sofa-real-castlery-dawson-wide-chaise-sectional-left": {
      // Beach linen stocked fabric (AS-000624-NG4001, left-facing)
      beach_linen:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1724055084/crusader/variants/AS-000624-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Bech-Linen-Front-1724055082.jpg",
      navagio_beach_linen:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1724055084/crusader/variants/AS-000624-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Bech-Linen-Front-1724055082.jpg",
      // Color-accurate fallbacks for finishes without dedicated left-facing product photos.
      // These use the matching right-facing Dawson wide-chaise photo to preserve finish color.
      navagio_seagull:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1724055193/crusader/variants/AS-000626-NG4002/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Seagull-Front-1724055190.jpg",
      performance_creamy_white:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1735891193/crusader/variants/AS-000625C-PT4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Creamy-White-Front-1735891191.jpg",
      marcel_brilliant_white:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1735891232/crusader/variants/AS-000625C-PM4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Brilliant-White-Front-1735891230.jpg",
      marcel_smoke_grey:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1735891266/crusader/variants/AS-000625C-PM4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Smoke-Grey-Front-1735891263.jpg",
      peyton_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1735891413/crusader/variants/AS-000625C-PY4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Dove-Grey-Front-1735891411.jpg",
      infinity_boucle_ginger:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1735891315/crusader/variants/AS-000624C-IN4003/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Ginger-Front-1735891312.jpg",
      // Indigo Blue (AS-000624C-TL4001, left-facing)
      indigo_blue:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1735891162/crusader/variants/AS-000624C-TL4001/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Indigo-Blue-Front-1735891160.jpg",
      // Performance Infinity Boucle (AS-000624C-IN*, left-facing)
      performance_boucle_cream:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773743339/crusader/variants/AS-000624C-IN4005/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Cream-Front-1773743337.jpg",
      performance_infinity_boucle_moss:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774246870/crusader/variants/AS-000624C-IN4004/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Moss-Front-1774246868.jpg",
      // Performance Linen Weave / Genova (AS-000624C-PG*, left-facing)
      performance_genova_oat:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773911767/crusader/variants/AS-000624C-PG4002/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Performance-Genova-Oat-Front-1773911764.jpg",
      performance_linen_weave_light_grey:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773911796/crusader/variants/AS-000624C-PG4004/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Light-Grey-Front-1773911794.jpg",
      // Performance Twill (AS-000624C-PT*, left-facing)
      performance_twill_pearl_beige:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901640/crusader/variants/AS-000624C-PT4002/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Performance-Twill-Pearl-Beige-Front-1773901638.jpg",
      performance_twill_slate:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901660/crusader/variants/AS-000624C-PT4003/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Performance-Twill-Slate-Front-1773901658.jpg",
      performance_twill_moss:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901678/crusader/variants/AS-000624C-PT4004/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Performance-Twill-Moss-Front-1773901676.jpg",
      performance_twill_dove_grey:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1773901696/crusader/variants/AS-000624C-PT4005/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Performance-Twill-Dove-Grey-Front-1773901694.jpg",
      // Washed Chenille / Greta (AS-000624C-GR*, left-facing)
      greta_ivory:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774246900/crusader/variants/AS-000624C-GR4001/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Cream-Front-1774246898.jpg",
      washed_chenille_sand:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774246915/crusader/variants/AS-000624C-GR4002/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Sand-Front-1774246912.jpg",
      greta_mustard_brown:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774246934/crusader/variants/AS-000624C-GR4003/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Caramel-Front-1774246932.jpg",
      greta_moss:
        "https://res.cloudinary.com/castlery/image/private/w_560,f_auto,q_auto,c_fit/v1774246946/crusader/variants/AS-000624C-GR4004/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Moss-Front-1774246944.jpg",
      // Some fabrics still have no dedicated left-facing chaise product shot on Castlery.
      // We avoid cross-model Dawson images here; missing keys fall back to the canonical
      // left-facing beach linen hero to keep the product silhouette accurate.
    },
  };

  const aliasBySubstring: Array<[string, string]> = [
    ["beach_linen", "navagio_beach_linen"],
    ["indigo", "indigo_blue"],
    ["seagull", "navagio_seagull"],
    ["creamy_white", "performance_creamy_white"],
    ["brilliant_white", "marcel_brilliant_white"],
    ["dove_grey", "peyton_dove_grey"],
    ["smoke_grey", "marcel_smoke_grey"],
    ["cumin", "peyton_cumin"],
    ["ginger", "infinity_boucle_ginger"],
    ["white_quartz", "infinity_boucle_white_quartz"],
    ["performance_boucle_cream", "performance_boucle_cream"],
    ["performance_infinity_boucle_moss", "performance_infinity_boucle_moss"],
    ["performance_genova_oat", "performance_genova_oat"],
    ["performance_linen_weave_cream", "performance_linen_weave_cream"],
    ["performance_linen_weave_light_grey", "performance_linen_weave_light_grey"],
    ["performance_twill_dove_grey", "performance_twill_dove_grey"],
    ["performance_twill_pearl_beige", "performance_twill_pearl_beige"],
    ["performance_twill_slate", "performance_twill_slate"],
    ["performance_twill_moss", "performance_twill_moss"],
    ["greta_ivory", "greta_ivory"],
    ["washed_chenille_sand", "washed_chenille_sand"],
    ["greta_mustard_brown", "greta_mustard_brown"],
    ["greta_moss", "greta_moss"],
    ["warm_taupe", "warm_taupe_leather"],
    ["caramel_leather", "caramel_leather"],
    ["marche_ivory", "marche_ivory_leather"],
    ["marche_graphite", "marche_graphite_leather"],
    ["marche_cocoa", "marche_cocoa_leather"],
    ["cocoa_leather", "cocoa_leather"],
  ];

  const rawCandidates = [variant.finishCode, variant.finishLabel, variant.label, variant.id]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const normalizedCandidates = rawCandidates.map((value) => normalizeFinishToken(value));
  const itemMap = heroByItemIdAndFinishCode[itemId] ?? {};

  let resolvedFinishKey: string | null = null;

  for (const candidate of normalizedCandidates) {
    if (itemMap[candidate]) {
      resolvedFinishKey = candidate;
      break;
    }
  }

  if (!resolvedFinishKey) {
    for (const candidate of normalizedCandidates) {
      for (const [needle, mappedKey] of aliasBySubstring) {
        if (candidate.includes(needle)) {
          resolvedFinishKey = mappedKey;
          break;
        }
      }
      if (resolvedFinishKey) break;
    }
  }

  const mappedHero = resolvedFinishKey ? itemMap[resolvedFinishKey] : null;

  return mappedHero ?? defaultHeroByItemId[itemId] ?? null;

}

function resolveDawsonFabricGallery(itemId: string, variant: ProductVariant): string[] {
  if (!itemId.startsWith("sofa-real-castlery-dawson-")) return [];

  const galleryByItemIdAndFinishCode: Record<string, Record<string, string[]>> = {
    "sofa-real-castlery-dawson-pit-sectional": {
      navagio_seagull: [
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1698304807/crusader/variants/AS-000379-NG4002/Dawson-Pit-Sectional-Sofa-Seagull-Square-Set_1-1698304804.jpg",
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1698304807/crusader/variants/AS-000379-NG4002/Dawson-Pit-Sectional-Sofa-Seagull-Square-Set_2-1698304804.jpg",
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1698303801/crusader/variants/AS-000379-NG4002/Dawson-Pit-Sectional-Sofa-Seagull-Square-Set_3-1698303799.jpg",
      ],
      cocoa_leather: [
        "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1722580875/crusader/variants/AS-000533-LE4020/Dawson-Leather-Pit-Sectional-Sofa-Square-Set_2-1722580872.jpg",
        "https://res.cloudinary.com/castlery/image/private/w_1995,f_auto,q_auto,c_fit/v1722580875/crusader/variants/AS-000533-LE4020/Dawson-Leather-Pit-Sectional-Sofa-Square-Set_1-1722580872.jpg",
      ],
    },
    "sofa-real-castlery-dawson-wide-chaise-sectional": {
      navagio_beach_linen: [
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1732691734/crusader/variants/AS-000625-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Beach-Linen-Square-Set_1-1732691732.jpg",
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1725520633/crusader/variants/AS-000625-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Beach-Linen-With-Bradley-Coffee-Table-With-Drawers-Natural-Square-Set_1-1725520630.jpg",
      ],
      navagio_seagull: [
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1725521094/crusader/variants/AS-000627-NG4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Seagull-Square-Set_2-1725521092.jpg",
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1725521095/crusader/variants/AS-000627-NG4002/Dawson-Wide-Chaise-Sectional-Sofa-Right-Facing-Seagull-With-Bradley-Rectangular-Coffee-Table-Natural-Square-Set_1-1725521093.jpg",
      ],
    },
    "sofa-real-castlery-dawson-wide-chaise-sectional-left": {
      navagio_beach_linen: [
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1732691809/crusader/variants/AS-000624-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Beach-Linen-Square-Set_1-1732691807.jpg",
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1724056805/crusader/variants/AS-000624-NG4001/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Beach-Linen-With-Bradley-Coffee-Table-With-Drawers-Natural-Square-Set_1-1724056803.jpg",
      ],
      navagio_seagull: [
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1724055193/crusader/variants/AS-000626-NG4002/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Seagull-Square-Set_2-1724055191.jpg",
        "https://res.cloudinary.com/castlery/image/private/w_1200,f_auto,q_auto,c_fit/v1724055193/crusader/variants/AS-000626-NG4002/Dawson-Wide-Chaise-Sectional-Sofa-Left-Facing-Seagull-With-Bradley-Rectangular-Coffee-Table-Natural-Square-Set_1-1724055191.jpg",
      ],
    },
  };

  const aliasBySubstring: Array<[string, string]> = [
    ["beach_linen", "navagio_beach_linen"],
    ["seagull", "navagio_seagull"],
  ];

  const rawCandidates = [variant.finishCode, variant.finishLabel, variant.label, variant.id]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
  const normalizedCandidates = rawCandidates.map((value) => normalizeFinishToken(value));
  const itemMap = galleryByItemIdAndFinishCode[itemId] ?? {};

  let resolvedFinishKey: string | null = null;

  for (const candidate of normalizedCandidates) {
    if (itemMap[candidate]) {
      resolvedFinishKey = candidate;
      break;
    }
  }

  if (!resolvedFinishKey) {
    for (const candidate of normalizedCandidates) {
      for (const [needle, mappedKey] of aliasBySubstring) {
        if (candidate.includes(needle) && itemMap[mappedKey]) {
          resolvedFinishKey = mappedKey;
          break;
        }
      }
      if (resolvedFinishKey) break;
    }
  }

  return resolvedFinishKey ? itemMap[resolvedFinishKey] ?? [] : [];
}

export function resolveCatalogVariant(
  item: CatalogItemSchema,
  requestedVariantId?: string
): ResolvedCatalogVariant {
  const forcedThumbByItemId: Record<string, string> = {};
  const forcedItemThumb = forcedThumbByItemId[item.id] ?? null;

  const fallbackVariant =
    item.variants.find((variant) => variant.id === item.defaultVariantId) ?? item.variants[0];

  if (!fallbackVariant) {
    throw new Error(`Catalog item ${item.id} has no variants`);
  }

  const requested = requestedVariantId
    ? item.variants.find((variant) => variant.id === requestedVariantId)
    : undefined;
  const variant = requested ?? fallbackVariant;
  const matchedRequestedVariant = !requestedVariantId || Boolean(requested);

  const dawsonFabricThumb = resolveDawsonFabricThumb(item.id, variant);
  const dawsonFabricGallery = resolveDawsonFabricGallery(item.id, variant);
  const isDawsonPitSectional = item.id === "sofa-real-castlery-dawson-pit-sectional";
  const isDawsonOttoman = item.id === "sofa-real-castlery-dawson-ottoman";
  const variantThumbCandidate = forcedItemThumb ?? variant.thumbnailUrl ?? null;
  const variantThumbCandidateText = String(variantThumbCandidate ?? "");
  const variantThumbIsSwatchLike = isSwatchLikeThumb(variantThumbCandidateText);
  const variantThumbIsCanonicalDawsonPhoto = isCanonicalDawsonPitSectionalPhoto(variantThumbCandidate);
  const variantThumbIsCanonicalDawsonOttomanPhoto = isCanonicalDawsonOttomanPhoto(variantThumbCandidate);
  const variantHasSpecificThumb = Boolean(
    variantThumbCandidate &&
      variantThumbCandidate !== item.assets.thumbUrl &&
      (!isDawsonPitSectional || variantThumbIsCanonicalDawsonPhoto) &&
      (!isDawsonOttoman || variantThumbIsCanonicalDawsonOttomanPhoto) &&
      !variantThumbIsSwatchLike
  );
  // Preserve explicit variant-level media (for example, size-specific Dawson variants)
  // and only use finish-based Dawson fallback when variant media is not explicitly provided.
  const variantThumb = forcedItemThumb ?? (variantHasSpecificThumb
    ? variantThumbCandidate
    : (dawsonFabricThumb ?? (variantThumbIsSwatchLike ? null : variantThumbCandidate) ?? item.assets.thumbUrl ?? null));
  const supplementalVariantImage =
    variantThumbCandidate &&
    variantThumbCandidate !== variantThumb &&
    variantThumbCandidate !== item.assets.thumbUrl &&
    !variantThumbIsSwatchLike &&
    (!isDawsonPitSectional || variantThumbIsCanonicalDawsonPhoto) &&
    (!isDawsonOttoman || variantThumbIsCanonicalDawsonOttomanPhoto)
      ? variantThumbCandidate
      : null;
  const metadataImages = Array.isArray(item.metadata?.galleryImages)
    ? item.metadata?.galleryImages
    : [];
  const variantGallery = Array.isArray(variant.galleryImages) ? variant.galleryImages : [];
  const defaultVariantGallery = Array.isArray(fallbackVariant.galleryImages)
    ? fallbackVariant.galleryImages
    : [];
  const defaultThumbCandidate = fallbackVariant.thumbnailUrl ?? null;
  const defaultThumbIsSwatchLike = isSwatchLikeThumb(defaultThumbCandidate);
  const defaultThumbIsCanonicalDawsonPhoto = isCanonicalDawsonPitSectionalPhoto(defaultThumbCandidate);
  const defaultThumbIsCanonicalDawsonOttomanPhoto = isCanonicalDawsonOttomanPhoto(defaultThumbCandidate);
  const defaultHasSpecificThumb = Boolean(
    defaultThumbCandidate &&
      defaultThumbCandidate !== item.assets.thumbUrl &&
      (!isDawsonPitSectional || defaultThumbIsCanonicalDawsonPhoto) &&
      (!isDawsonOttoman || defaultThumbIsCanonicalDawsonOttomanPhoto) &&
      !defaultThumbIsSwatchLike
  );
  const defaultVariantThumb = defaultHasSpecificThumb ? defaultThumbCandidate : null;
  const isDawsonItem = item.id.startsWith("sofa-real-castlery-dawson-");
  const hasDawsonVariantSpecificThumb = Boolean(
    isDawsonItem && variantThumb && variantThumb !== item.assets.thumbUrl
  );
  const hasVariantSpecificMedia = Boolean(
    hasDawsonVariantSpecificThumb ||
    supplementalVariantImage ||
    dawsonFabricGallery.length > 0 ||
    variantGallery.length > 0 ||
    (variantHasSpecificThumb && variantThumb && variantThumb !== item.assets.thumbUrl)
  );

  const issues: string[] = [];

  let fallbackSource: CatalogMediaFallbackSource = "none";
  const variantSpecificImages = uniqueNonEmpty([
    variantThumb,
    supplementalVariantImage,
    ...dawsonFabricGallery,
    ...variantGallery,
    ...metadataImages,
  ]);

  let galleryImages: string[] = [];
  if (hasVariantSpecificMedia && variantSpecificImages.length > 0) {
    galleryImages = variantSpecificImages;
    fallbackSource = "variant_specific";
  } else if (
    requestedVariantId &&
    requestedVariantId !== fallbackVariant.id &&
    (defaultVariantThumb || defaultVariantGallery.length > 0)
  ) {
    galleryImages = uniqueNonEmpty([
      defaultVariantThumb,
      ...defaultVariantGallery,
    ]);
    fallbackSource = "default_variant_same_item";
  } else if (metadataImages.length > 0) {
    galleryImages = uniqueNonEmpty([
      ...metadataImages,
    ]);
    fallbackSource = "item_gallery";
  } else {
    galleryImages = uniqueNonEmpty([
      item.assets.thumbUrl,
      variantThumb,
    ]);
    fallbackSource = "item_thumb";
  }

  galleryImages = uniqueNonEmpty([
    ...galleryImages,
    ...metadataImages,
  ]);

  if (requestedVariantId && !requested) {
    issues.push(`Requested variant ${requestedVariantId} not found for ${item.id}`);
  }
  if (fallbackSource !== "variant_specific") {
    issues.push(`Media fallback: ${fallbackSource}`);
  }

  let commerce: ResolvedVariantCommerce;
  let priceAmount: number | null = null;
  let priceSource: "variant" | "item" | "unknown" = "unknown";
  let availabilitySource: "variant" | "item" | "computed" = "computed";

  if (item.commerce.type === "shopify") {
    const variantShopifyId = variant.shopifyVariantId ?? item.commerce.data.variantId ?? null;
    const availableFromVariant = typeof variant.available === "boolean" ? variant.available : null;
    const availableFromItem = item.commerce.data.available;
    const available = Boolean(
      variantShopifyId && (availableFromVariant ?? availableFromItem)
    );

    commerce = {
      type: "shopify",
      productId: item.commerce.data.productId,
      variantId: variantShopifyId,
      available,
    };
    availabilitySource = availableFromVariant !== null ? "variant" : "item";

    if (!variantShopifyId) {
      issues.push(`Missing Shopify variant mapping for ${item.id}/${variant.id}`);
    }
  } else if (item.commerce.type === "affiliate") {
    const url = variant.affiliateUrl ?? item.commerce.data.url ?? null;
    const retailer = item.commerce.data.retailer ?? null;

    if (typeof variant.priceHint === "number") {
      priceAmount = variant.priceHint;
      priceSource = "variant";
    } else if (typeof item.commerce.data.priceHint === "number") {
      priceAmount = item.commerce.data.priceHint;
      priceSource = "item";
    }

    const availableFromVariant = typeof variant.available === "boolean" ? variant.available : null;
    const available = Boolean(url) && (availableFromVariant ?? true);

    commerce = {
      type: "affiliate",
      url,
      retailer,
      priceHint: priceAmount,
      available,
    };
    availabilitySource = availableFromVariant !== null ? "variant" : "computed";

    if (!url) {
      issues.push(`Missing affiliate URL for ${item.id}/${variant.id}`);
    }
  } else {
    commerce = {
      type: "not_buyable",
      reason: item.commerce.reason ?? "Not buyable",
      available: false,
    };
    issues.push(`Item ${item.id} is not buyable`);
  }

  return {
    catalogItemId: item.id,
    variantId: variant.id,
    variant,
    requestedVariantId,
    matchedRequestedVariant,
    dimsMm: getResolvedDimensions(item, variant),
    media: {
      thumbUrl: variantThumb,
      galleryImages,
      fallbackSource,
    },
    finish: {
      code: (variant.finishCode ?? variant.id).trim(),
      label: (variant.finishLabel ?? variant.label).trim(),
      swatchHex: variant.swatchHex ?? variant.colorHex,
    },
    commerce,
    priceReference: {
      amount: priceAmount,
      currency: "SGD",
      source: priceSource,
    },
    availabilityReference: {
      available: commerce.available,
      source: availabilitySource,
    },
    issues,
  };
}

export function assertStrictVariantResolution(
  item: CatalogItemSchema,
  requestedVariantId: string
): { ok: true; resolved: ResolvedCatalogVariant } | { ok: false; error: string } {
  const resolved = resolveCatalogVariant(item, requestedVariantId);
  if (!resolved.matchedRequestedVariant) {
    return {
      ok: false,
      error: `Unknown variant ${requestedVariantId} for item ${item.id}`,
    };
  }
  return { ok: true, resolved };
}
