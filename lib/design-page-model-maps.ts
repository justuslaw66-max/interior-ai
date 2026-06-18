// Extracted from app/design/page.tsx — Phase C modularization
// Model family groupings and configuration option maps for imported products.

const JARON_MODEL_FAMILY_IDS = [
  "sofa-real-castlery-jaron-3s",
  "sofa-real-castlery-jaron-3s-wide-arm",
  "sofa-real-castlery-jaron-extended-3s",
  "sofa-real-castlery-jaron-extended-3s-wide-arm",
  "sofa-real-castlery-jaron-chaise-sectional",
  "sofa-real-castlery-jaron-chaise-sectional-wide-arm",
  "sofa-real-castlery-jaron-l-shaped-sectional",
  "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm",
];

const AVERY_MODEL_FAMILY_IDS = [
  "armchair-real-castlery-avery-performance-armchair",
  "armchair-real-castlery-avery-performance-armchair-with-ottoman",
  "armchair-real-castlery-avery-performance-swivel-armchair",
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman",
];

export const JARON_CONFIGURATION_PRODUCT_IDS = [...JARON_MODEL_FAMILY_IDS];

export type JaronConfigurationArmKey = "slim" | "wide";
export type JaronConfigurationGroupKey = "standard" | "l-shaped";
export type JaronConfigurationDiagramKey =
  | "standard-3-seater"
  | "standard-extended-3-seater"
  | "chaise-sectional"
  | "l-shaped-sectional";

export type JaronConfigurationOption = {
  key: string;
  label: string;
  description: string;
  diagram: JaronConfigurationDiagramKey;
  slimProductId: string;
  wideProductId: string;
};

export type JaronConfigurationGroup = {
  key: JaronConfigurationGroupKey;
  label: string;
  options: JaronConfigurationOption[];
};

export const JARON_CONFIGURATION_GROUPS: JaronConfigurationGroup[] = [
  {
    key: "standard",
    label: "STANDARD",
    options: [
      {
        key: "3-seater",
        label: "3 Seater Recliner Sofa",
        description: "Slim Arm: W230 x D115cm; Wide Arm: W244 x D115cm",
        diagram: "standard-3-seater",
        slimProductId: "sofa-real-castlery-jaron-3s",
        wideProductId: "sofa-real-castlery-jaron-3s-wide-arm",
      },
      {
        key: "extended-3-seater",
        label: "Extended 3 Seater Recliner Sofa",
        description: "Slim Arm: W316 x D115cm; Wide Arm: W330 x D115cm",
        diagram: "standard-extended-3-seater",
        slimProductId: "sofa-real-castlery-jaron-extended-3s",
        wideProductId: "sofa-real-castlery-jaron-extended-3s-wide-arm",
      },
    ],
  },
  {
    key: "l-shaped",
    label: "L-SHAPED",
    options: [
      {
        key: "chaise-sectional",
        label: "Recliner Chaise Sectional Sofa",
        description: "Slim Arm: W325 x D239cm; Wide Arm: W330 x D244cm",
        diagram: "chaise-sectional",
        slimProductId: "sofa-real-castlery-jaron-chaise-sectional",
        wideProductId: "sofa-real-castlery-jaron-chaise-sectional-wide-arm",
      },
      {
        key: "l-shaped-sectional",
        label: "Recliner L-Shaped Sectional Sofa",
        description: "Slim Arm: W325 x D325cm; Wide Arm: W330 x D330cm",
        diagram: "l-shaped-sectional",
        slimProductId: "sofa-real-castlery-jaron-l-shaped-sectional",
        wideProductId: "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm",
      },
    ],
  },
];

export const MODEL_FAMILY_BY_PRODUCT_ID: Record<string, string[]> = {
  "sofa-real-castlery-madison-2s": [
    "sofa-real-castlery-madison-2s",
    "sofa-real-castlery-madison-3s",
    "armchair-real-castlery-madison-armchair",
    "sofa-real-castlery-madison-ottoman",
  ],
  "sofa-real-castlery-madison-3s": [
    "sofa-real-castlery-madison-2s",
    "sofa-real-castlery-madison-3s",
    "armchair-real-castlery-madison-armchair",
    "sofa-real-castlery-madison-ottoman",
  ],
  "armchair-real-castlery-madison-armchair": [
    "sofa-real-castlery-madison-2s",
    "sofa-real-castlery-madison-3s",
    "armchair-real-castlery-madison-armchair",
    "sofa-real-castlery-madison-ottoman",
  ],
  "sofa-real-castlery-madison-ottoman": [
    "sofa-real-castlery-madison-2s",
    "sofa-real-castlery-madison-3s",
    "armchair-real-castlery-madison-armchair",
    "sofa-real-castlery-madison-ottoman",
  ],
  "sofa-real-castlery-jaron-3s": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-3s-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-extended-3s": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-extended-3s-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-chaise-sectional": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-chaise-sectional-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-l-shaped-sectional": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-armchair": [...AVERY_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-armchair-with-ottoman": [...AVERY_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-swivel-armchair": [...AVERY_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman": [...AVERY_MODEL_FAMILY_IDS],
  "dining-real-castlery-sloane-travertine-225": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-180-no-cushion",
  ],
  "dining-real-castlery-sloane-travertine-180": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-150-no-cushion",
  ],
  "dining-real-castlery-sloane-dining-table-225": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-180-no-cushion",
  ],
  "dining-real-castlery-sloane-dining-table-180": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-150-no-cushion",
  ],
  "dining-real-castlery-forma-oval-150": [
    "dining-real-castlery-forma-oval-150",
    "dining-real-castlery-forma-round-90",
    "dining-real-castlery-forma-round-120",
  ],
  "dining-real-castlery-forma-round-90": [
    "dining-real-castlery-forma-oval-150",
    "dining-real-castlery-forma-round-90",
    "dining-real-castlery-forma-round-120",
  ],
  "dining-real-castlery-forma-round-120": [
    "dining-real-castlery-forma-oval-150",
    "dining-real-castlery-forma-round-90",
    "dining-real-castlery-forma-round-120",
  ],
  "dining-real-castlery-brighton-oval-180": [
    "dining-real-castlery-brighton-oval-180",
  ],
  "dining-real-castlery-kelsey-marble-160": [
    "dining-real-castlery-kelsey-marble-160",
    "dining-real-castlery-kelsey-marble-180",
  ],
  "dining-real-castlery-kelsey-marble-180": [
    "dining-real-castlery-kelsey-marble-160",
    "dining-real-castlery-kelsey-marble-180",
  ],
  "dining-real-castlery-sloane-bench-150-no-cushion": [
    "dining-real-castlery-sloane-bench-150-no-cushion",
    "dining-real-castlery-sloane-bench-180-no-cushion",
    "dining-real-castlery-sloane-bench-150-leather-cushion",
    "dining-real-castlery-sloane-bench-180-leather-cushion",
  ],
  "dining-real-castlery-sloane-bench-180-no-cushion": [
    "dining-real-castlery-sloane-bench-150-no-cushion",
    "dining-real-castlery-sloane-bench-180-no-cushion",
    "dining-real-castlery-sloane-bench-150-leather-cushion",
    "dining-real-castlery-sloane-bench-180-leather-cushion",
  ],
  "dining-real-castlery-sloane-bench-150-leather-cushion": [
    "dining-real-castlery-sloane-bench-150-no-cushion",
    "dining-real-castlery-sloane-bench-180-no-cushion",
    "dining-real-castlery-sloane-bench-150-leather-cushion",
    "dining-real-castlery-sloane-bench-180-leather-cushion",
  ],
  "dining-real-castlery-sloane-bench-180-leather-cushion": [
    "dining-real-castlery-sloane-bench-150-no-cushion",
    "dining-real-castlery-sloane-bench-180-no-cushion",
    "dining-real-castlery-sloane-bench-150-leather-cushion",
    "dining-real-castlery-sloane-bench-180-leather-cushion",
  ],
};

export const MODEL_SELECTOR_PRODUCT_IDS_BY_PRODUCT_ID: Record<string, string[]> = {
  "sofa-real-castlery-jaron-3s": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-3s-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-extended-3s": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-extended-3s-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-chaise-sectional": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-chaise-sectional-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-l-shaped-sectional": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-armchair": [...AVERY_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-armchair-with-ottoman": [...AVERY_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-swivel-armchair": [...AVERY_MODEL_FAMILY_IDS],
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman": [...AVERY_MODEL_FAMILY_IDS],
  "dining-real-castlery-forma-oval-150": [
    "dining-real-castlery-forma-oval-150",
    "dining-real-castlery-forma-round-90",
  ],
  "dining-real-castlery-forma-round-90": [
    "dining-real-castlery-forma-oval-150",
    "dining-real-castlery-forma-round-90",
  ],
  "dining-real-castlery-forma-round-120": [
    "dining-real-castlery-forma-oval-150",
    "dining-real-castlery-forma-round-90",
  ],
  "dining-real-castlery-sloane-dining-table-180": [
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-150-no-cushion",
  ],
  "dining-real-castlery-sloane-dining-table-225": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-bench-180-no-cushion",
  ],
  "dining-real-castlery-sloane-travertine-180": [
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-150-no-cushion",
  ],
  "dining-real-castlery-sloane-travertine-225": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-bench-180-no-cushion",
  ],
  "dining-real-castlery-sloane-bench-150-no-cushion": [
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-150-no-cushion",
  ],
  "dining-real-castlery-sloane-bench-150-leather-cushion": [
    "dining-real-castlery-sloane-dining-table-180",
    "dining-real-castlery-sloane-travertine-180",
    "dining-real-castlery-sloane-bench-150-leather-cushion",
  ],
  "dining-real-castlery-sloane-bench-180-no-cushion": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-bench-180-no-cushion",
  ],
  "dining-real-castlery-sloane-bench-180-leather-cushion": [
    "dining-real-castlery-sloane-dining-table-225",
    "dining-real-castlery-sloane-travertine-225",
    "dining-real-castlery-sloane-bench-180-leather-cushion",
  ],
  "tv-real-castlery-casa-tv-console-150": [
    "tv-real-castlery-casa-tv-console-150",
    "tv-real-castlery-casa-tv-console-200",
  ],
  "tv-real-castlery-casa-tv-console-200": [
    "tv-real-castlery-casa-tv-console-150",
    "tv-real-castlery-casa-tv-console-200",
  ],
  "tv-real-castlery-seb-tv-console-150": [
    "tv-real-castlery-seb-tv-console-150",
    "tv-real-castlery-seb-tv-console-200",
  ],
  "tv-real-castlery-seb-tv-console-200": [
    "tv-real-castlery-seb-tv-console-150",
    "tv-real-castlery-seb-tv-console-200",
  ],
  "tv-real-castlery-sloane-tv-console-150": [
    "tv-real-castlery-sloane-tv-console-150",
    "tv-real-castlery-sloane-tv-console-200",
  ],
  "tv-real-castlery-sloane-tv-console-200": [
    "tv-real-castlery-sloane-tv-console-150",
    "tv-real-castlery-sloane-tv-console-200",
  ],
};

export const MODEL_SELECTOR_REPRESENTATIVE_BY_PRODUCT_ID: Record<string, string> = {
  "dining-real-castlery-forma-round-120": "dining-real-castlery-forma-round-90",
};

export const ARM_STYLE_OPTIONS_BY_PRODUCT_ID: Record<
  string,
  Array<{ label: string; productId: string | null }>
> = {
  "sofa-real-castlery-jaron-3s": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-3s" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-3s-wide-arm" },
  ],
  "sofa-real-castlery-jaron-3s-wide-arm": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-3s" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-3s-wide-arm" },
  ],
  "sofa-real-castlery-jaron-extended-3s": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-extended-3s" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-extended-3s-wide-arm" },
  ],
  "sofa-real-castlery-jaron-extended-3s-wide-arm": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-extended-3s" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-extended-3s-wide-arm" },
  ],
  "sofa-real-castlery-jaron-chaise-sectional": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-chaise-sectional" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-chaise-sectional-wide-arm" },
  ],
  "sofa-real-castlery-jaron-chaise-sectional-wide-arm": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-chaise-sectional" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-chaise-sectional-wide-arm" },
  ],
  "sofa-real-castlery-jaron-l-shaped-sectional": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-l-shaped-sectional" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm" },
  ],
  "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm": [
    { label: "Slim arm", productId: "sofa-real-castlery-jaron-l-shaped-sectional" },
    { label: "Wide arm", productId: "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm" },
  ],
};

export const LENGTH_OPTIONS_BY_PRODUCT_ID: Record<
  string,
  Array<{ label: string; productId: string | null }>
> = {
  "coffee-real-castlery-seb-storage-90": [
    { label: "90CM", productId: "coffee-real-castlery-seb-storage-90" },
    { label: "120CM", productId: "coffee-real-castlery-seb-storage-120" },
  ],
  "coffee-real-castlery-seb-storage-120": [
    { label: "90CM", productId: "coffee-real-castlery-seb-storage-90" },
    { label: "120CM", productId: "coffee-real-castlery-seb-storage-120" },
  ],
  "dining-real-castlery-forma-round-90": [
    { label: "90CM", productId: "dining-real-castlery-forma-round-90" },
    { label: "120CM", productId: "dining-real-castlery-forma-round-120" },
  ],
  "dining-real-castlery-forma-round-120": [
    { label: "90CM", productId: "dining-real-castlery-forma-round-90" },
    { label: "120CM", productId: "dining-real-castlery-forma-round-120" },
  ],
  "dining-real-castlery-kelsey-marble-160": [
    { label: "160CM", productId: "dining-real-castlery-kelsey-marble-160" },
    { label: "180CM", productId: "dining-real-castlery-kelsey-marble-180" },
  ],
  "dining-real-castlery-kelsey-marble-180": [
    { label: "160CM", productId: "dining-real-castlery-kelsey-marble-160" },
    { label: "180CM", productId: "dining-real-castlery-kelsey-marble-180" },
  ],
  "dining-real-castlery-sloane-dining-table-180": [
    { label: "180CM", productId: "dining-real-castlery-sloane-dining-table-180" },
    { label: "225CM", productId: "dining-real-castlery-sloane-dining-table-225" },
  ],
  "dining-real-castlery-sloane-dining-table-225": [
    { label: "180CM", productId: "dining-real-castlery-sloane-dining-table-180" },
    { label: "225CM", productId: "dining-real-castlery-sloane-dining-table-225" },
  ],
  "dining-real-castlery-sloane-travertine-180": [
    { label: "180CM", productId: "dining-real-castlery-sloane-travertine-180" },
    { label: "225CM", productId: "dining-real-castlery-sloane-travertine-225" },
  ],
  "dining-real-castlery-sloane-travertine-225": [
    { label: "180CM", productId: "dining-real-castlery-sloane-travertine-180" },
    { label: "225CM", productId: "dining-real-castlery-sloane-travertine-225" },
  ],
  "dining-real-castlery-sloane-bench-150-no-cushion": [
    { label: "150CM", productId: "dining-real-castlery-sloane-bench-150-no-cushion" },
    { label: "180CM", productId: "dining-real-castlery-sloane-bench-180-no-cushion" },
  ],
  "dining-real-castlery-sloane-bench-180-no-cushion": [
    { label: "150CM", productId: "dining-real-castlery-sloane-bench-150-no-cushion" },
    { label: "180CM", productId: "dining-real-castlery-sloane-bench-180-no-cushion" },
  ],
  "dining-real-castlery-sloane-bench-150-leather-cushion": [
    { label: "150CM", productId: "dining-real-castlery-sloane-bench-150-leather-cushion" },
    { label: "180CM", productId: "dining-real-castlery-sloane-bench-180-leather-cushion" },
  ],
  "dining-real-castlery-sloane-bench-180-leather-cushion": [
    { label: "150CM", productId: "dining-real-castlery-sloane-bench-150-leather-cushion" },
    { label: "180CM", productId: "dining-real-castlery-sloane-bench-180-leather-cushion" },
  ],
};

export const SHAPE_OPTIONS_BY_PRODUCT_ID: Record<
  string,
  Array<{ label: string; productId: string | null }>
> = {
  "coffee-real-castlery-harper-marble-rectangular-120": [
    {
      label: "Rectangular",
      productId: "coffee-real-castlery-harper-marble-rectangular-120",
    },
    {
      label: "Round",
      productId: "coffee-real-castlery-harper-marble-round-915",
    },
  ],
  "coffee-real-castlery-harper-marble-round-915": [
    {
      label: "Rectangular",
      productId: "coffee-real-castlery-harper-marble-rectangular-120",
    },
    {
      label: "Round",
      productId: "coffee-real-castlery-harper-marble-round-915",
    },
  ],
};

export const ORIENTATION_OPTIONS_BY_PRODUCT_ID: Record<
  string,
  Array<{ label: string; productId: string | null }>
> = {
  "sofa-real-castlery-dawson-wide-chaise-sectional": [
    {
      label: "Left facing",
      productId: "sofa-real-castlery-dawson-wide-chaise-sectional-left",
    },
    {
      label: "Right facing",
      productId: "sofa-real-castlery-dawson-wide-chaise-sectional",
    },
  ],
  "sofa-real-castlery-dawson-wide-chaise-sectional-left": [
    {
      label: "Left facing",
      productId: "sofa-real-castlery-dawson-wide-chaise-sectional-left",
    },
    {
      label: "Right facing",
      productId: "sofa-real-castlery-dawson-wide-chaise-sectional",
    },
  ],
  "sofa-real-castlery-dawson-chaise-sectional": [
    {
      label: "Left facing",
      productId: "sofa-real-castlery-dawson-chaise-sectional-left",
    },
    {
      label: "Right facing",
      productId: "sofa-real-castlery-dawson-chaise-sectional",
    },
  ],
  "sofa-real-castlery-dawson-chaise-sectional-left": [
    {
      label: "Left facing",
      productId: "sofa-real-castlery-dawson-chaise-sectional-left",
    },
    {
      label: "Right facing",
      productId: "sofa-real-castlery-dawson-chaise-sectional",
    },
  ],
};
