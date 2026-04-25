// Extracted from app/design/page.tsx — Phase C modularization
// Model family groupings and configuration option maps for imported products.

export const MODEL_FAMILY_BY_PRODUCT_ID: Record<string, string[]> = {
  "sofa-real-castlery-madison-2s": [
    "sofa-real-castlery-madison-2s",
    "sofa-real-castlery-madison-3s",
    "sofa-real-castlery-madison-ottoman",
  ],
  "sofa-real-castlery-madison-3s": [
    "sofa-real-castlery-madison-2s",
    "sofa-real-castlery-madison-3s",
    "sofa-real-castlery-madison-ottoman",
  ],
  "sofa-real-castlery-madison-ottoman": [
    "sofa-real-castlery-madison-2s",
    "sofa-real-castlery-madison-3s",
    "sofa-real-castlery-madison-ottoman",
  ],
  "sofa-real-castlery-jaron-3s": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-3s-wide-arm",
    "sofa-real-castlery-jaron-extended-3s",
    "sofa-real-castlery-jaron-extended-3s-wide-arm",
  ],
  "sofa-real-castlery-jaron-3s-wide-arm": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-3s-wide-arm",
    "sofa-real-castlery-jaron-extended-3s",
    "sofa-real-castlery-jaron-extended-3s-wide-arm",
  ],
  "sofa-real-castlery-jaron-extended-3s": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-3s-wide-arm",
    "sofa-real-castlery-jaron-extended-3s",
    "sofa-real-castlery-jaron-extended-3s-wide-arm",
  ],
  "sofa-real-castlery-jaron-extended-3s-wide-arm": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-3s-wide-arm",
    "sofa-real-castlery-jaron-extended-3s",
    "sofa-real-castlery-jaron-extended-3s-wide-arm",
  ],
  "dining-real-castlery-sloane-travertine-220": [
    "dining-real-castlery-sloane-travertine-220",
    "dining-real-castlery-sloane-travertine-180",
  ],
  "dining-real-castlery-sloane-travertine-180": [
    "dining-real-castlery-sloane-travertine-220",
    "dining-real-castlery-sloane-travertine-180",
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
  "sofa-real-castlery-jaron-3s": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-extended-3s",
  ],
  "sofa-real-castlery-jaron-3s-wide-arm": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-extended-3s",
  ],
  "sofa-real-castlery-jaron-extended-3s": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-extended-3s",
  ],
  "sofa-real-castlery-jaron-extended-3s-wide-arm": [
    "sofa-real-castlery-jaron-3s",
    "sofa-real-castlery-jaron-extended-3s",
  ],
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
