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
  "armchair-real-castlery-jaron-recliner-armchair",
  "armchair-real-castlery-jaron-recliner-armchair-wide-arm",
];

const AVERY_MODEL_FAMILY_IDS = [
  "armchair-real-castlery-avery-performance-armchair",
  "armchair-real-castlery-avery-performance-armchair-with-ottoman",
  "armchair-real-castlery-avery-performance-swivel-armchair",
  "armchair-real-castlery-avery-performance-swivel-armchair-with-ottoman",
];

const OWEN_MODEL_FAMILY_IDS = [
  "sofa-real-castlery-owen-3-seater",
  "sofa-real-castlery-owen-chaise-sectional-left",
  "sofa-real-castlery-owen-chaise-sectional-right",
];

const OWEN_MODEL_SELECTOR_IDS = [
  "sofa-real-castlery-owen-3-seater",
  "sofa-real-castlery-owen-chaise-sectional-left",
];

const HAMILTON_MODEL_FAMILY_IDS = [
  "sofa-real-castlery-hamilton-2-seater",
  "sofa-real-castlery-hamilton-2-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-3-seater",
  "sofa-real-castlery-hamilton-3-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-chaise-sectional-left",
  "sofa-real-castlery-hamilton-chaise-sectional-right",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-right",
  "sofa-real-castlery-hamilton-round-chaise-sectional-left",
  "sofa-real-castlery-hamilton-round-chaise-sectional-right",
  "armchair-real-castlery-hamilton-round-swivel-armchair",
  "armchair-real-castlery-hamilton-round-swivel-1-5-seater-armchair",
];

const HAMILTON_MODEL_SELECTOR_IDS = [
  "sofa-real-castlery-hamilton-3-seater",
  "sofa-real-castlery-hamilton-3-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-2-seater",
  "sofa-real-castlery-hamilton-2-seater-with-storage-ottoman",
  "sofa-real-castlery-hamilton-chaise-sectional-left",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left",
  "sofa-real-castlery-hamilton-round-chaise-sectional-left",
  "armchair-real-castlery-hamilton-round-swivel-armchair",
  "armchair-real-castlery-hamilton-round-swivel-1-5-seater-armchair",
];

const AUBURN_MODEL_FAMILY_IDS = [
  "sofa-real-castlery-auburn-performance-fabric-sofa",
  "sofa-real-castlery-auburn-performance-fabric-sofa-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-extended-sofa",
  "sofa-real-castlery-auburn-performance-fabric-extended-sofa-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-curve-sofa",
  "sofa-real-castlery-auburn-performance-fabric-curve-sofa-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-armless-curve-sofa",
  "sofa-real-castlery-auburn-performance-fabric-armless-curve-sofa-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-left",
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-right",
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-left-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-right-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-sectional",
  "sofa-real-castlery-auburn-performance-fabric-sectional-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-curve-l-shape-sectional",
  "sofa-real-castlery-auburn-performance-fabric-curve-l-shape-sectional-with-ottoman",
  "sofa-real-castlery-auburn-performance-fabric-l-shape-sectional",
  "sofa-real-castlery-auburn-performance-fabric-l-shape-sectional-with-ottoman",
];

export const JARON_CONFIGURATION_PRODUCT_IDS = [...JARON_MODEL_FAMILY_IDS];
export const AUBURN_CONFIGURATION_PRODUCT_IDS = [...AUBURN_MODEL_FAMILY_IDS];

export type JaronConfigurationArmKey = "slim" | "wide";
export type JaronConfigurationGroupKey = "standard" | "l-shaped" | "armchair";
export type JaronConfigurationDiagramKey =
  | "standard-3-seater"
  | "standard-extended-3-seater"
  | "chaise-sectional"
  | "l-shaped-sectional"
  | "recliner-armchair";

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
  {
    key: "armchair",
    label: "ARMCHAIR",
    options: [
      {
        key: "recliner-armchair",
        label: "Recliner Armchair",
        description: "Slim Arm: W134 x D115cm; Wide Arm: W144 x D115cm",
        diagram: "recliner-armchair",
        slimProductId: "armchair-real-castlery-jaron-recliner-armchair",
        wideProductId: "armchair-real-castlery-jaron-recliner-armchair-wide-arm",
      },
    ],
  },
];

export type AuburnConfigurationGroupKey = "standard" | "curve" | "sectional";
export type AuburnConfigurationDiagramKey =
  | "standard-3-seater"
  | "standard-3-seater-with-ottoman"
  | "standard-extended-3-seater"
  | "standard-extended-3-seater-with-ottoman"
  | "curve-3-seater"
  | "curve-3-seater-with-ottoman"
  | "armless-curve-3-seater"
  | "armless-curve-3-seater-with-ottoman"
  | "chaise-sectional-left"
  | "chaise-sectional-right"
  | "chaise-sectional-left-with-ottoman"
  | "chaise-sectional-right-with-ottoman"
  | "sectional"
  | "sectional-with-ottoman"
  | "curve-l-shape-sectional"
  | "curve-l-shape-sectional-with-ottoman"
  | "l-shape-sectional"
  | "l-shape-sectional-with-ottoman";

export type AuburnConfigurationOrientation = {
  key: string;
  label: string;
  productId: string;
  diagram: AuburnConfigurationDiagramKey;
};

export type AuburnConfigurationOption = {
  key: string;
  label: string;
  description: string;
  diagram: AuburnConfigurationDiagramKey;
  productId?: string;
  orientations?: AuburnConfigurationOrientation[];
};

export type AuburnConfigurationGroup = {
  key: AuburnConfigurationGroupKey;
  label: string;
  options: AuburnConfigurationOption[];
};

export const AUBURN_CONFIGURATION_GROUPS: AuburnConfigurationGroup[] = [
  {
    key: "standard",
    label: "STANDARD",
    options: [
      {
        key: "3-seater",
        label: "3 Seater Sofa",
        description: "Performance fabric sofa configuration",
        diagram: "standard-3-seater",
        productId: "sofa-real-castlery-auburn-performance-fabric-sofa",
      },
      {
        key: "3-seater-with-ottoman",
        label: "3 Seater Sofa with Ottoman",
        description: "Straight sofa with matching ottoman",
        diagram: "standard-3-seater-with-ottoman",
        productId: "sofa-real-castlery-auburn-performance-fabric-sofa-with-ottoman",
      },
      {
        key: "extended-3-seater",
        label: "Extended 3 Seater Sofa",
        description: "Longer straight sofa configuration",
        diagram: "standard-extended-3-seater",
        productId: "sofa-real-castlery-auburn-performance-fabric-extended-sofa",
      },
      {
        key: "extended-3-seater-with-ottoman",
        label: "Extended 3 Seater Sofa with Ottoman",
        description: "Extended sofa with matching ottoman",
        diagram: "standard-extended-3-seater-with-ottoman",
        productId: "sofa-real-castlery-auburn-performance-fabric-extended-sofa-with-ottoman",
      },
    ],
  },
  {
    key: "curve",
    label: "CURVE",
    options: [
      {
        key: "curve-3-seater",
        label: "Curve Sofa",
        description: "Curved 3-piece sofa configuration",
        diagram: "curve-3-seater",
        productId: "sofa-real-castlery-auburn-performance-fabric-curve-sofa",
      },
      {
        key: "curve-3-seater-with-ottoman",
        label: "Curve Sofa with Ottoman",
        description: "Curved sofa with matching ottoman",
        diagram: "curve-3-seater-with-ottoman",
        productId: "sofa-real-castlery-auburn-performance-fabric-curve-sofa-with-ottoman",
      },
      {
        key: "armless-curve-3-seater",
        label: "Armless Curve Sofa",
        description: "Armless curved 3-piece sofa",
        diagram: "armless-curve-3-seater",
        productId: "sofa-real-castlery-auburn-performance-fabric-armless-curve-sofa",
      },
      {
        key: "armless-curve-3-seater-with-ottoman",
        label: "Armless Curve Sofa with Ottoman",
        description: "Armless curved sofa with matching ottoman",
        diagram: "armless-curve-3-seater-with-ottoman",
        productId: "sofa-real-castlery-auburn-performance-fabric-armless-curve-sofa-with-ottoman",
      },
    ],
  },
  {
    key: "sectional",
    label: "SECTIONAL",
    options: [
      {
        key: "chaise-sectional",
        label: "Chaise Sectional Sofa",
        description: "Choose left or right facing chaise orientation",
        diagram: "chaise-sectional-left",
        orientations: [
          {
            key: "left",
            label: "Left facing",
            productId: "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-left",
            diagram: "chaise-sectional-left",
          },
          {
            key: "right",
            label: "Right facing",
            productId: "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-right",
            diagram: "chaise-sectional-right",
          },
        ],
      },
      {
        key: "chaise-sectional-with-ottoman",
        label: "Chaise Sectional with Ottoman",
        description: "Choose left or right facing chaise orientation",
        diagram: "chaise-sectional-left-with-ottoman",
        orientations: [
          {
            key: "left",
            label: "Left facing",
            productId: "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-left-with-ottoman",
            diagram: "chaise-sectional-left-with-ottoman",
          },
          {
            key: "right",
            label: "Right facing",
            productId: "sofa-real-castlery-auburn-performance-fabric-chaise-sectional-right-with-ottoman",
            diagram: "chaise-sectional-right-with-ottoman",
          },
        ],
      },
      {
        key: "sectional",
        label: "L-Shape Sectional Sofa",
        description: "Sectional sofa configuration",
        diagram: "sectional",
        productId: "sofa-real-castlery-auburn-performance-fabric-sectional",
      },
      {
        key: "sectional-with-ottoman",
        label: "L-Shape Sectional with Ottoman",
        description: "Sectional sofa with matching ottoman",
        diagram: "sectional-with-ottoman",
        productId: "sofa-real-castlery-auburn-performance-fabric-sectional-with-ottoman",
      },
      {
        key: "curve-l-shape-sectional",
        label: "Curve L-Shape Sectional",
        description: "Curved sectional sofa configuration",
        diagram: "curve-l-shape-sectional",
        productId: "sofa-real-castlery-auburn-performance-fabric-curve-l-shape-sectional",
      },
      {
        key: "curve-l-shape-sectional-with-ottoman",
        label: "Curve L-Shape Sectional with Ottoman",
        description: "Curved sectional sofa with matching ottoman",
        diagram: "curve-l-shape-sectional-with-ottoman",
        productId: "sofa-real-castlery-auburn-performance-fabric-curve-l-shape-sectional-with-ottoman",
      },
      {
        key: "l-shape-sectional",
        label: "Extended L-Shape Sectional",
        description: "Extended L-shape sectional sofa",
        diagram: "l-shape-sectional",
        productId: "sofa-real-castlery-auburn-performance-fabric-l-shape-sectional",
      },
      {
        key: "l-shape-sectional-with-ottoman",
        label: "Extended L-Shape Sectional with Ottoman",
        description: "Extended L-shape sectional with matching ottoman",
        diagram: "l-shape-sectional-with-ottoman",
        productId: "sofa-real-castlery-auburn-performance-fabric-l-shape-sectional-with-ottoman",
      },
    ],
  },
];

export const MODEL_FAMILY_BY_PRODUCT_ID: Record<string, string[]> = {
  ...Object.fromEntries(AUBURN_MODEL_FAMILY_IDS.map((id) => [id, [...AUBURN_MODEL_FAMILY_IDS]])),
  ...Object.fromEntries(OWEN_MODEL_FAMILY_IDS.map((id) => [id, [...OWEN_MODEL_FAMILY_IDS]])),
  ...Object.fromEntries(HAMILTON_MODEL_FAMILY_IDS.map((id) => [id, [...HAMILTON_MODEL_FAMILY_IDS]])),
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
  "armchair-real-castlery-jaron-recliner-armchair": [...JARON_MODEL_FAMILY_IDS],
  "armchair-real-castlery-jaron-recliner-armchair-wide-arm": [...JARON_MODEL_FAMILY_IDS],
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
  "dining-real-castlery-seb-dining-table-150": [
    "dining-real-castlery-seb-dining-table-150",
    "dining-real-castlery-seb-dining-table-180",
  ],
  "dining-real-castlery-seb-dining-table-180": [
    "dining-real-castlery-seb-dining-table-150",
    "dining-real-castlery-seb-dining-table-180",
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
  ...Object.fromEntries(AUBURN_MODEL_FAMILY_IDS.map((id) => [id, [...AUBURN_MODEL_FAMILY_IDS]])),
  ...Object.fromEntries(OWEN_MODEL_FAMILY_IDS.map((id) => [id, [...OWEN_MODEL_SELECTOR_IDS]])),
  ...Object.fromEntries(HAMILTON_MODEL_FAMILY_IDS.map((id) => [id, [...HAMILTON_MODEL_SELECTOR_IDS]])),
  "sofa-real-castlery-jaron-3s": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-3s-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-extended-3s": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-extended-3s-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-chaise-sectional": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-chaise-sectional-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-l-shaped-sectional": [...JARON_MODEL_FAMILY_IDS],
  "sofa-real-castlery-jaron-l-shaped-sectional-wide-arm": [...JARON_MODEL_FAMILY_IDS],
  "armchair-real-castlery-jaron-recliner-armchair": [...JARON_MODEL_FAMILY_IDS],
  "armchair-real-castlery-jaron-recliner-armchair-wide-arm": [...JARON_MODEL_FAMILY_IDS],
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
  "dining-real-castlery-seb-dining-table-150": [
    "dining-real-castlery-seb-dining-table-150",
  ],
  "dining-real-castlery-seb-dining-table-180": [
    "dining-real-castlery-seb-dining-table-180",
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
  "sofa-real-castlery-owen-chaise-sectional-right": "sofa-real-castlery-owen-chaise-sectional-left",
  "sofa-real-castlery-hamilton-chaise-sectional-right": "sofa-real-castlery-hamilton-chaise-sectional-left",
  "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-right": "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left",
  "sofa-real-castlery-hamilton-round-chaise-sectional-right": "sofa-real-castlery-hamilton-round-chaise-sectional-left",
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
  "armchair-real-castlery-jaron-recliner-armchair": [
    { label: "Slim arm", productId: "armchair-real-castlery-jaron-recliner-armchair" },
    { label: "Wide arm", productId: "armchair-real-castlery-jaron-recliner-armchair-wide-arm" },
  ],
  "armchair-real-castlery-jaron-recliner-armchair-wide-arm": [
    { label: "Slim arm", productId: "armchair-real-castlery-jaron-recliner-armchair" },
    { label: "Wide arm", productId: "armchair-real-castlery-jaron-recliner-armchair-wide-arm" },
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
  "dining-real-castlery-seb-dining-table-150": [
    { label: "150CM", productId: "dining-real-castlery-seb-dining-table-150" },
    { label: "180CM", productId: "dining-real-castlery-seb-dining-table-180" },
  ],
  "dining-real-castlery-seb-dining-table-180": [
    { label: "150CM", productId: "dining-real-castlery-seb-dining-table-150" },
    { label: "180CM", productId: "dining-real-castlery-seb-dining-table-180" },
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
  ...Object.fromEntries([
    ["sofa-real-castlery-hamilton-chaise-sectional-left", "sofa-real-castlery-hamilton-chaise-sectional-right"],
    ["sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-left", "sofa-real-castlery-hamilton-chaise-sectional-with-storage-ottoman-right"],
    ["sofa-real-castlery-hamilton-round-chaise-sectional-left", "sofa-real-castlery-hamilton-round-chaise-sectional-right"],
  ].flatMap(([leftId, rightId]) => {
    const options = [
      { label: "Left facing", productId: leftId },
      { label: "Right facing", productId: rightId },
    ];
    return [[leftId, options], [rightId, options]];
  })),
  "sofa-real-castlery-owen-chaise-sectional-left": [
    {
      label: "Left facing",
      productId: "sofa-real-castlery-owen-chaise-sectional-left",
    },
    {
      label: "Right facing",
      productId: "sofa-real-castlery-owen-chaise-sectional-right",
    },
  ],
  "sofa-real-castlery-owen-chaise-sectional-right": [
    {
      label: "Left facing",
      productId: "sofa-real-castlery-owen-chaise-sectional-left",
    },
    {
      label: "Right facing",
      productId: "sofa-real-castlery-owen-chaise-sectional-right",
    },
  ],
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
