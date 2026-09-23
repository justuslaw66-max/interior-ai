export const NIPPON_PAINT_FAMILIES = [
  "white",
  "beige",
  "neutral",
  "red",
  "pink",
  "orange",
  "yellow",
  "green",
  "blue-green",
  "blue",
  "purple",
  "brown",
  "grey",
  "black",
  "accent",
] as const;

export type NipponPaintFamily = (typeof NIPPON_PAINT_FAMILIES)[number];

export const NIPPON_PAINT_SOURCE_URL = "https://nipponpaint.com.sg/colours/find-your-colour/";
export const NIPPON_PAINT_COLOUR_COUNT = 2484;
export const NIPPON_PAINT_IMPORTED_AT = "2026-07-05";
