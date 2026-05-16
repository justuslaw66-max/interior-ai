// Extracted from app/design/page.tsx — Phase C modularization
// Imported product catalog data: variants, configs, Sloane helpers, Dawson
// swatches, fabric profiles, and full dimension tables.

import type { ProductCategory, RoomTag } from "@/lib/catalog-schema";

export const IMPORTED_VARIANT_BY_PRODUCT_ID: Record<string, { label: string; colorHex: string }> = {
  "dining-real-castlery-sloane-travertine-180": {
    label: "Travertine",
    colorHex: "#c8b79f",
  },
  "dining-real-castlery-sloane-travertine-220": {
    label: "Travertine",
    colorHex: "#c8b79f",
  },
  "dining-real-castlery-brighton-oval-180": {
    label: "Walnut",
    colorHex: "#8a643f",
  },
  "dining-real-castlery-forma-oval-150": {
    label: "Walnut",
    colorHex: "#8a643f",
  },
  "dining-real-castlery-forma-round-90": {
    label: "Walnut",
    colorHex: "#8a643f",
  },
  "dining-real-castlery-forma-round-120": {
    label: "Walnut",
    colorHex: "#8a643f",
  },
  "dining-real-castlery-kelsey-marble-160": {
    label: "White Wash",
    colorHex: "#d8d0c2",
  },
  "dining-real-castlery-kelsey-marble-180": {
    label: "White Wash",
    colorHex: "#d8d0c2",
  },
  "dining-real-castlery-sloane-bench-150-no-cushion": {
    label: "No Cushion",
    colorHex: "#9c9c9c",
  },
  "dining-real-castlery-sloane-bench-180-no-cushion": {
    label: "No Cushion",
    colorHex: "#9c9c9c",
  },
  "dining-real-castlery-sloane-bench-150-leather-cushion": {
    label: "Leather Cushion",
    colorHex: "#8a643f",
  },
  "dining-real-castlery-sloane-bench-180-leather-cushion": {
    label: "Leather Cushion",
    colorHex: "#8a643f",
  },
};

export const IMPORTED_VARIANTS_BY_PRODUCT_ID: Record<string, Array<{ label: string; colorHex: string }>> = {
  "dining-real-castlery-kelsey-marble-160": [
    { label: "160 White Wash", colorHex: "#d8d0c2" },
    { label: "160 Dark Walnut", colorHex: "#7a4b2d" },
  ],
  "dining-real-castlery-kelsey-marble-180": [
    { label: "180 White Wash", colorHex: "#d8d0c2" },
    { label: "180 Dark Walnut", colorHex: "#7a4b2d" },
  ],
};

export const IMPORTED_PRODUCT_CONFIG_BY_ID: Record<
  string,
  {
    title: string;
    category: ProductCategory;
    modelLabel: string;
    roomTags: RoomTag[];
    tags?: string[];
  }
> = {
  "sofa-real-castlery-jaron-3s": {
    title: "Castlery Jaron Recliner 3-Seater Sofa (Slim Arm)",
    category: "sofa",
    modelLabel: "3 Seater (Slim Arm)",
    roomTags: ["living_room"],
    tags: ["castlery", "jaron", "leather", "recliner"],
  },
  "sofa-real-castlery-jaron-3s-wide-arm": {
    title: "Castlery Jaron Recliner 3-Seater Sofa (Wide Arm)",
    category: "sofa",
    modelLabel: "3 Seater (Wide Arm)",
    roomTags: ["living_room"],
    tags: ["castlery", "jaron", "leather", "recliner", "wide-arm"],
  },
  "sofa-real-castlery-jaron-extended-3s": {
    title: "Castlery Jaron Recliner Extended 3-Seater Sofa (Slim Arm)",
    category: "sofa",
    modelLabel: "Extended 3 Seater (Slim Arm)",
    roomTags: ["living_room"],
    tags: ["castlery", "jaron", "leather", "recliner", "extended"],
  },
  "sofa-real-castlery-jaron-extended-3s-wide-arm": {
    title: "Castlery Jaron Recliner Extended 3-Seater Sofa (Wide Arm)",
    category: "sofa",
    modelLabel: "Extended 3 Seater (Wide Arm)",
    roomTags: ["living_room"],
    tags: ["castlery", "jaron", "leather", "recliner", "extended", "wide-arm"],
  },
  "sofa-real-castlery-madison-2s": {
    title: "Castlery Madison 2-Seater Sofa",
    category: "sofa",
    modelLabel: "2 Seater",
    roomTags: ["living_room"],
    tags: ["castlery", "madison", "fabric"],
  },
  "sofa-real-castlery-madison-3s": {
    title: "Castlery Madison 3-Seater Sofa",
    category: "sofa",
    modelLabel: "3 Seater",
    roomTags: ["living_room"],
    tags: ["castlery", "madison", "fabric"],
  },
  "sofa-real-castlery-dawson-ottoman": {
    title: "Castlery Dawson Ottoman Standard",
    category: "ottoman",
    modelLabel: "Standard Ottoman",
    roomTags: ["living_room"],
    tags: ["castlery", "dawson", "ottoman", "footstool"],
  },
  "sofa-real-castlery-madison-ottoman": {
    title: "Castlery Madison Ottoman",
    category: "ottoman",
    modelLabel: "Standard Ottoman",
    roomTags: ["living_room"],
    tags: ["castlery", "madison", "ottoman", "footstool"],
  },
  "dining-real-castlery-sloane-travertine-180": {
    title: "Castlery Sloane Travertine Dining Table 180cm",
    category: "dining_table",
    modelLabel: "180CM",
    roomTags: ["dining"],
    tags: ["castlery", "sloane", "travertine", "dining-table"],
  },
  "dining-real-castlery-sloane-travertine-220": {
    title: "Castlery Sloane Travertine Dining Table 220cm",
    category: "dining_table",
    modelLabel: "220CM",
    roomTags: ["dining"],
    tags: ["castlery", "sloane", "travertine", "dining-table"],
  },
  "dining-real-castlery-brighton-oval-180": {
    title: "Castlery Brighton Oval Dining Table 180cm",
    category: "dining_table",
    modelLabel: "180CM",
    roomTags: ["dining"],
    tags: ["castlery", "brighton", "walnut", "dining-table"],
  },
  "dining-real-castlery-forma-oval-150": {
    title: "Castlery Forma Oval Dining Table 150cm",
    category: "dining_table",
    modelLabel: "Oval 150CM",
    roomTags: ["dining"],
    tags: ["castlery", "forma", "walnut", "dining-table"],
  },
  "dining-real-castlery-forma-round-90": {
    title: "Castlery Forma Round Dining Table 90cm",
    category: "dining_table",
    modelLabel: "90CM",
    roomTags: ["dining"],
    tags: ["castlery", "forma", "walnut", "dining-table"],
  },
  "dining-real-castlery-forma-round-120": {
    title: "Castlery Forma Round Dining Table 120cm",
    category: "dining_table",
    modelLabel: "120CM",
    roomTags: ["dining"],
    tags: ["castlery", "forma", "walnut", "dining-table"],
  },
  "dining-real-castlery-kelsey-marble-160": {
    title: "Castlery Kelsey Marble Dining Table 160cm",
    category: "dining_table",
    modelLabel: "160CM",
    roomTags: ["dining"],
    tags: ["castlery", "kelsey", "marble", "dining-table"],
  },
  "dining-real-castlery-kelsey-marble-180": {
    title: "Castlery Kelsey Marble Dining Table 180cm",
    category: "dining_table",
    modelLabel: "180CM",
    roomTags: ["dining"],
    tags: ["castlery", "kelsey", "marble", "dining-table"],
  },
  "dining-real-castlery-sloane-bench-150-no-cushion": {
    title: "Castlery Sloane Dining Bench 150cm No Cushion",
    category: "dining_bench",
    modelLabel: "150CM",
    roomTags: ["dining"],
    tags: ["castlery", "sloane", "bench", "no-cushion", "dining-bench"],
  },
  "dining-real-castlery-sloane-bench-180-no-cushion": {
    title: "Castlery Sloane Dining Bench 180cm No Cushion",
    category: "dining_bench",
    modelLabel: "180CM",
    roomTags: ["dining"],
    tags: ["castlery", "sloane", "bench", "no-cushion", "dining-bench"],
  },
  "dining-real-castlery-sloane-bench-150-leather-cushion": {
    title: "Castlery Sloane Dining Bench 150cm Leather Cushion",
    category: "dining_bench",
    modelLabel: "150CM",
    roomTags: ["dining"],
    tags: ["castlery", "sloane", "bench", "leather-cushion", "dining-bench"],
  },
  "dining-real-castlery-sloane-bench-180-leather-cushion": {
    title: "Castlery Sloane Dining Bench 180cm Leather Cushion",
    category: "dining_bench",
    modelLabel: "180CM",
    roomTags: ["dining"],
    tags: ["castlery", "sloane", "bench", "leather-cushion", "dining-bench"],
  },
};

export const SLOANE_TABLE_TO_BENCH_RECOMMENDATION: Record<string, 150 | 180> = {
  "dining-real-castlery-sloane-travertine-180": 150,
  "dining-real-castlery-sloane-travertine-220": 180,
};

export const SLOANE_BENCH_PRODUCT_ID_BY_OPTION: Record<string, string> = {
  "150-no": "dining-real-castlery-sloane-bench-150-no-cushion",
  "180-no": "dining-real-castlery-sloane-bench-180-no-cushion",
  "150-leather": "dining-real-castlery-sloane-bench-150-leather-cushion",
  "180-leather": "dining-real-castlery-sloane-bench-180-leather-cushion",
};

export const SLOANE_TABLE_PRODUCT_IDS = [
  "dining-real-castlery-sloane-travertine-180",
  "dining-real-castlery-sloane-travertine-220",
] as const;

export const SLOANE_BENCH_PRODUCT_IDS = Object.values(SLOANE_BENCH_PRODUCT_ID_BY_OPTION);

export function getSloaneBenchOptionFromProductId(productId: string): {
  size: 150 | 180;
  cushion: "no" | "leather";
} | null {
  if (!productId.includes("sloane-bench")) return null;
  const size = productId.includes("-180-") ? 180 : productId.includes("-150-") ? 150 : null;
  if (!size) return null;
  const cushion = productId.includes("no-cushion") ? "no" : "leather";
  return { size, cushion };
}

export function getSloaneBenchProductId(size: 150 | 180, cushion: "no" | "leather"): string {
  return SLOANE_BENCH_PRODUCT_ID_BY_OPTION[`${size}-${cushion}`];
}

export const CASTLERY_DAWSON_SWATCH_IMAGE_BY_FINISH_CODE: Record<string, string> = {
  "ng-4001": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
  "navagio-beach-linen": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
  "beach-linen": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
  "fabric-cream-beach-linen": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1665460017/crusader/variants/NG-4001/Beach-Linen_1-1665460015.jpg",
  "ng-4002": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1697528966/crusader/variants/NG-4002/Dawson-3-Seater-Sofa-Seagull-Det_4-1697528963.jpg",
  "navagio-seagull": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1697528966/crusader/variants/NG-4002/Dawson-3-Seater-Sofa-Seagull-Det_4-1697528963.jpg",
  "seagull": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1697528966/crusader/variants/NG-4002/Dawson-3-Seater-Sofa-Seagull-Det_4-1697528963.jpg",
  "fabric-medium-grey-seagull": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1697528966/crusader/variants/NG-4002/Dawson-3-Seater-Sofa-Seagull-Det_4-1697528963.jpg",
  "in-4005": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770191309/crusader/variants/IN-4005/IN4005-Cream-1770191306.jpg",
  "infinity-boucle-cream": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770191309/crusader/variants/IN-4005/IN4005-Cream-1770191306.jpg",
  "cream-infinity-boucle": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770191309/crusader/variants/IN-4005/IN4005-Cream-1770191306.jpg",
  "in-4001": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
  "infinity-boucle-white-quartz": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
  "white-quartz": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
  "fabric-light-grey-white-quartz": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1640236351/crusader/variants/IN-4001/White-Quartz_1.jpg",
  "in-4004": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770098928/crusader/variants/IN-4004/IN4004-Moss-1770098923.jpg",
  "infinity-boucle-moss": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770098928/crusader/variants/IN-4004/IN4004-Moss-1770098923.jpg",
  "moss-infinity-boucle": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770098928/crusader/variants/IN-4004/IN4004-Moss-1770098923.jpg",
  "in-4003": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1710492060/crusader/variants/IN-4003/Marlow-Armless-2-Seater-Sofa-Performance-Ginger-Caramel-Square-Det_3-1710492057.jpg",
  "infinity-boucle-ginger": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1710492060/crusader/variants/IN-4003/Marlow-Armless-2-Seater-Sofa-Performance-Ginger-Caramel-Square-Det_3-1710492057.jpg",
  "rust-ginger": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1710492060/crusader/variants/IN-4003/Marlow-Armless-2-Seater-Sofa-Performance-Ginger-Caramel-Square-Det_3-1710492057.jpg",
  "py-4001": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322775/crusader/variants/PY-4001/Ivory-1722322773.jpg",
  "peyton-cream": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322775/crusader/variants/PY-4001/Ivory-1722322773.jpg",
  "ivory-cream": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322775/crusader/variants/PY-4001/Ivory-1722322773.jpg",
  "py-4002": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322647/crusader/variants/PY-4002/Dove-Grey-1722322645.jpg",
  "peyton-dove-grey": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322647/crusader/variants/PY-4002/Dove-Grey-1722322645.jpg",
  "dove-grey": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322647/crusader/variants/PY-4002/Dove-Grey-1722322645.jpg",
  "medium-grey-dove-grey": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722322647/crusader/variants/PY-4002/Dove-Grey-1722322645.jpg",
  "py-4003": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722320266/crusader/variants/PY-4003/Moss-1722320263.jpg",
  "peyton-moss": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722320266/crusader/variants/PY-4003/Moss-1722320263.jpg",
  "moss-peyton-fleece": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1722320266/crusader/variants/PY-4003/Moss-1722320263.jpg",
  "py-4004": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1721120972/crusader/variants/PY-4004/Cumin-Swathc_1-1721120969.jpg",
  "peyton-cumin": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1721120972/crusader/variants/PY-4004/Cumin-Swathc_1-1721120969.jpg",
  "caramel-cumin": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1721120972/crusader/variants/PY-4004/Cumin-Swathc_1-1721120969.jpg",
  "pg-4002": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1757063296/crusader/variants/PG-4002/Mori-Armchair-Oat-Walnut-Leg-Det_2-1757063296.jpg",
  "genova-oat": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1757063296/crusader/variants/PG-4002/Mori-Armchair-Oat-Walnut-Leg-Det_2-1757063296.jpg",
  "pg-4003": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188184/crusader/variants/PG-4003/PG4003-Cream-1770188182.jpg",
  "genova-cream": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188184/crusader/variants/PG-4003/PG4003-Cream-1770188182.jpg",
  "pg-4004": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188172/crusader/variants/PG-4004/PG4004-Light-Grey-1770188170.jpg",
  "genova-light-grey": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188172/crusader/variants/PG-4004/PG4004-Light-Grey-1770188170.jpg",
  "pt-4001": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1774943787/crusader/variants/PT-4001/PT4001-Performance-Twill-Creamy-White-1774943785.jpg",
  "pt-4002": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1747116409/crusader/variants/PT-4002/Levi-Office-Chair-Twill-Pearl-Beige-Square-Det_4-1747116407.jpg",
  "pt-4005": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769061840/crusader/variants/PT-4005/PT4005-Performance-Twill-Dove-Grey-1769061838.jpg",
  "pt-4003": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1756361613/crusader/variants/PT-4003/Performance-Twill-Slate-1756361610.jpg",
  "pt-4004": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1756438801/crusader/variants/PT-4004/Moss-1756438798.jpg",
  "performance-twill-pearl-beige": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1747116409/crusader/variants/PT-4002/Levi-Office-Chair-Twill-Pearl-Beige-Square-Det_4-1747116407.jpg",
  "performance-twill-medium-grey": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769061840/crusader/variants/PT-4005/PT4005-Performance-Twill-Dove-Grey-1769061838.jpg",
  "performance-twill-slate": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1756361613/crusader/variants/PT-4003/Performance-Twill-Slate-1756361610.jpg",
  "performance-twill-moss": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,b_rgb:FFFFFF,c_fit/v1756438801/crusader/variants/PT-4004/Moss-1756438798.jpg",
  "gr-4001": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054456/crusader/variants/GR-4001/GR4001-Greta-Ivory-1769054453.jpg",
  "washed-chenille-cream": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054456/crusader/variants/GR-4001/GR4001-Greta-Ivory-1769054453.jpg",
  "gr-4002": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188296/crusader/variants/GR-4002/GR4002-Latte-1770188293.jpg",
  "washed-chenille-sand": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1770188296/crusader/variants/GR-4002/GR4002-Latte-1770188293.jpg",
  "gr-4003": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054464/crusader/variants/GR-4003/GR4003-Greta-Mustard-Brown-1769054461.jpg",
  "washed-chenille-caramel": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054464/crusader/variants/GR-4003/GR4003-Greta-Mustard-Brown-1769054461.jpg",
  "gr-4004": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054472/crusader/variants/GR-4004/GR4004-Greta-Moss-1769054469.jpg",
  "washed-chenille-moss": "https://res.cloudinary.com/castlery/image/private/w_128,f_auto,q_auto,c_fit/v1769054472/crusader/variants/GR-4004/GR4004-Greta-Moss-1769054469.jpg",
};

export type FabricDetailProfile = {
  tags: string[];
  composition: string;
  care: string;
};

export const CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY: Record<string, FabricDetailProfile> = {
  "navagio": {
    tags: ["Slub Linen", "Breathable"],
    composition: "100% Polyester slub-linen weave. (PFAS free)",
    care: "Vacuum regularly with a soft brush attachment; spot clean with mild soap and cold water; do not bleach; line dry.",
  },
  "peyton": {
    tags: ["Velvet", "Stain-Resistant & Pet-Friendly"],
    composition: "100% Polyester. (PFAS free)",
    care: "Wash with cold water gently; Line dry; Ironing with low temperature; Do not dry clean; Do not bleach.",
  },
  "infinity-boucle": {
    tags: ["Boucle", "Spill-Resistant"],
    composition: "100% Polyester, spill-resistant performance boucle fabric. (PFAS free)",
    care: "Do not machine wash; Do not bleach; Do not tumble dry; Do not iron; Dry clean.",
  },
  "performance-twill": {
    tags: ["Twill", "Spill-Resistant"],
    composition: "100% Polyester performance twill fabric. (PFAS free)",
    care: "Blot spills immediately; wipe with mild soap and cold water; do not tumble dry; do not bleach; line dry.",
  },
  "genova": {
    tags: ["Chenille", "Soft-touch"],
    composition: "100% Polyester chenille weave. (PFAS free)",
    care: "Vacuum gently; spot clean with mild soap and cold water; avoid direct heat; do not bleach.",
  },
  "washed-chenille": {
    tags: ["Washed Chenille", "Textured"],
    composition: "100% Polyester washed chenille fabric. (PFAS free)",
    care: "Use a damp cloth with mild detergent for spot cleaning; avoid harsh chemicals; line dry.",
  },
  "generic-performance-fabric": {
    tags: ["Performance Fabric", "Easy Care"],
    composition: "100% Polyester upholstery fabric. (PFAS free)",
    care: "Spot clean with mild soap and cold water; avoid bleach and high heat; line dry.",
  },
  "marche-leather": {
    tags: ["Top-Grain Leather", "Natural Grain"],
    composition: "Top-grain cow leather on contact surfaces with matched synthetic leather on non-contact areas.",
    care: "Wipe gently with a soft dry cloth; clean spills immediately; avoid direct sunlight and heat; condition periodically with leather-safe products.",
  },
  "aniline-leather": {
    tags: ["Aniline Leather", "Soft Handfeel"],
    composition: "Aniline-dyed top-grain leather with natural texture variation.",
    care: "Use a dry microfiber cloth for regular cleaning; blot spills immediately; avoid harsh cleaners and prolonged moisture.",
  },
  "generic-leather": {
    tags: ["Leather Upholstery", "Easy Care"],
    composition: "Genuine leather upholstery with durability-focused finishing.",
    care: "Dust regularly; wipe with a slightly damp cloth; keep away from direct heat and sunlight; use leather conditioner as needed.",
  },
};

export function resolveFabricDetailProfile(params: {
  finishCode: string;
  finishLabel: string;
  colourLabel: string;
  materialType: string;
}): FabricDetailProfile | null {
  const finishCode = params.finishCode.trim().toLowerCase();
  const finishLabel = `${params.finishLabel} ${params.colourLabel}`.trim().toLowerCase();
  const materialType = params.materialType.trim().toLowerCase();

  if (/(^ng-40\d\d$|navagio|slub\s*linen)/.test(finishCode) || /(navagio|slub\s*linen)/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["navagio"];
  }

  if (/(^py-40\d\d$|peyton)/.test(finishCode) || /peyton/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["peyton"];
  }

  if (/(^in-40\d\d$|infinity-boucle|boucle)/.test(finishCode) || /(infinity|boucle)/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["infinity-boucle"];
  }

  if (/(^pt-40\d\d$|performance[-_\s]*twill|\btwill\b)/.test(finishCode) || /(performance\s*twill|\btwill\b)/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["performance-twill"];
  }

  if (/(^pg-40\d\d$|genova)/.test(finishCode) || /genova/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["genova"];
  }

  if (/(^gr-40\d\d$|washed[-_\s]*chenille)/.test(finishCode) || /(washed\s*chenille|chenille)/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["washed-chenille"];
  }

  if (/(marche\s*leather|cocoa\s*leather|ivory\s*leather|graphite\s*leather|caramel\s*leather|\bleather\b)/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["marche-leather"];
  }

  if (/(aniline\s*leather|full[-\s]*grain\s*leather)/.test(finishLabel)) {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["aniline-leather"];
  }

  if (materialType === "fabric") {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["generic-performance-fabric"];
  }

  if (materialType === "leather") {
    return CASTLERY_FABRIC_DETAIL_PROFILE_BY_KEY["generic-leather"];
  }

  return null;
}

export const FULL_DIMENSIONS_BY_PRODUCT_ID: Record<string, Array<{ label: string; value: string }>> = {
  "dining-real-castlery-sloane-travertine-220": [
    { label: "Dimension", value: "W225 x D100 x H76cm" },
    { label: "Table top thickness", value: "5cm" },
    { label: "Product weight", value: "97kg" },
    { label: "Capacity", value: "Sits 6-8 people comfortably" },
    { label: "Leg height", value: "71cm" },
    { label: "Max bearing support", value: "100kg" },
    { label: "Levellers", value: "Included (max 1cm)" },
    { label: "Packaging dimensions", value: "3 boxes" },
    { label: "Leg room - height clearance", value: "71cm" },
    { label: "Leg to leg distance (at height 45cm)", value: "159cm" },
  ],
  "dining-real-castlery-forma-oval-150": [
    { label: "Dimension", value: "W150 x D95 x H75.1cm" },
    { label: "Table top thickness", value: "2.1cm" },
    { label: "Product weight", value: "51.3kg" },
    { label: "Capacity", value: "Sits 4-6 people comfortably" },
    { label: "Leg height", value: "73cm" },
    { label: "Max bearing support", value: "91kg" },
    { label: "Levellers", value: "Included" },
    { label: "Packaging dimensions", value: "2 boxes" },
    { label: "Leg room - height clearance", value: "73cm" },
  ],
  "dining-real-castlery-forma-round-90": [
    { label: "Dimension", value: "W90 x D90 x H75.1cm" },
    { label: "Table top thickness", value: "2.1cm" },
    { label: "Product weight", value: "33.9kg" },
    { label: "Capacity", value: "Sits 2-3 people comfortably" },
    { label: "Leg height", value: "73cm" },
    { label: "Max bearing support", value: "91kg" },
    { label: "Levellers", value: "Included" },
    { label: "Packaging dimensions", value: "2 boxes" },
    { label: "Leg room - height clearance", value: "73cm" },
  ],
  "dining-real-castlery-forma-round-120": [
    { label: "Dimension", value: "W120 x D120 x H75.1cm" },
    { label: "Table top thickness", value: "2.1cm" },
    { label: "Product weight", value: "53kg" },
    { label: "Capacity", value: "Sits 4 people comfortably" },
    { label: "Leg height", value: "73cm" },
    { label: "Max bearing support", value: "91kg" },
    { label: "Levellers", value: "Included" },
    { label: "Packaging dimensions", value: "2 boxes" },
    { label: "Leg room - height clearance", value: "73cm" },
  ],
  "dining-real-castlery-brighton-oval-180": [
    { label: "Dimension", value: "W180 x D97 x H76cm" },
    { label: "Table top thickness", value: "2.5cm" },
    { label: "Product weight", value: "37kg" },
    { label: "Capacity", value: "Sits 6 people comfortably" },
    { label: "Leg height", value: "72.5cm" },
    { label: "Max bearing support", value: "100kg" },
    { label: "Levellers", value: "Included (max 2cm)" },
    { label: "Packaging dimensions", value: "1 box" },
  ],
  "sofa-real-castlery-jaron-3s": [
    { label: "Dimension", value: "W230 x D115 x H77cm" },
    { label: "Reclined product depth", value: "165cm" },
    { label: "Cable length", value: "250cm" },
    { label: "Leg height", value: "4cm" },
    { label: "Max bearing support", value: "2 x 150kg" },
    { label: "Seatable width", value: "172cm" },
    { label: "Seating depth", value: "64cm" },
    { label: "Seating height", value: "47cm" },
    { label: "Backrest height", value: "39-57cm (adjustable headrest)" },
    { label: "Armrest height", value: "62cm" },
    { label: "Product weight", value: "123.7kg" },
    { label: "Packaging dimensions", value: "6 boxes" },
  ],
  "sofa-real-castlery-jaron-3s-wide-arm": [
    { label: "Dimension", value: "W244 x D115 x H77cm" },
    { label: "Reclined product depth", value: "165cm" },
    { label: "Cable length", value: "250cm" },
    { label: "Leg height", value: "4cm" },
    { label: "Max bearing support", value: "2 x 150kg" },
    { label: "Seatable width", value: "172cm" },
    { label: "Seating depth", value: "64cm" },
    { label: "Seating height", value: "47cm" },
    { label: "Backrest height", value: "39-57cm (adjustable headrest)" },
    { label: "Armrest height", value: "58cm" },
    { label: "Product weight", value: "127.7kg" },
    { label: "Packaging dimensions", value: "6 boxes" },
  ],
  "sofa-real-castlery-jaron-extended-3s": [
    { label: "Dimension", value: "W316 x D115 x H77cm" },
    { label: "Reclined product depth", value: "165cm" },
    { label: "Cable length", value: "250cm" },
    { label: "Leg height", value: "4cm" },
    { label: "Max bearing support", value: "3 x 150kg" },
    { label: "Seatable width", value: "258cm" },
    { label: "Seating depth", value: "64cm" },
    { label: "Seating height", value: "47cm" },
    { label: "Backrest height", value: "39-57cm (adjustable headrest)" },
    { label: "Armrest height", value: "62cm" },
    { label: "Product weight", value: "155.7kg" },
    { label: "Packaging dimensions", value: "7 boxes" },
  ],
  "sofa-real-castlery-jaron-extended-3s-wide-arm": [
    { label: "Dimension", value: "W330 x D115 x H77cm" },
    { label: "Reclined product depth", value: "165cm" },
    { label: "Cable length", value: "250cm" },
    { label: "Leg height", value: "4cm" },
    { label: "Max bearing support", value: "3 x 150kg" },
    { label: "Seatable width", value: "258cm" },
    { label: "Seating depth", value: "64cm" },
    { label: "Seating height", value: "47cm" },
    { label: "Backrest height", value: "39-57cm (adjustable headrest)" },
    { label: "Armrest height", value: "58cm" },
    { label: "Product weight", value: "159.7kg" },
    { label: "Packaging dimensions", value: "7 boxes" },
  ],
  "coffee-real-castlery-harper-marble-rectangular-120": [
    { label: "Dimension", value: "W120 x D60 x H38cm" },
    { label: "Table top thickness", value: "1.8cm" },
    { label: "Max bearing support", value: "50kg" },
    { label: "Product weight", value: "47.5kg" },
  ],
};
