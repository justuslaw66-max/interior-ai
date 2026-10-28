import type { CabinetLaminateCategory } from "./cabinet-laminate-runtime-types";
import type { SurfaceColorFamily } from "./surface-material-schema";

/**
 * A laminate wall panel's colour family, for the surface browser's colour filter (J, 28 Oct 2026: "Solids and woods").
 *
 * It is read from the laminate's catalogue colour, the colour the app draws: a solid's flat colour, and for a woodgrain or a
 * Unicore design the mean colour of its picture. So a design is filed by how it looks, not by its name (Greenlam's Sky Grey is
 * a pale blue, its Dull Pink a dusty red). Patterns, metals and pearlescents have no one colour and stay `unknown`.
 *
 * The colour is taken to CIELab (sRGB, D65): lightness L* from 0 to 100, chroma C* (how far from grey) and hue angle h in
 * degrees. In CIELab the screen's primaries are not evenly spaced: pure red is at 40, orange 73, yellow 103, green 136, cyan
 * 196, pure blue 306 and purple 328. The thresholds were set on Greenlam's 375 designs, checked by eye on a contact sheet and
 * against the standard web colours; scripts/test-laminate-colour-family.ts pins examples of each family.
 */
export type CieLab = { lightness: number; chroma: number; hue: number };

type Rule = readonly [(lab: CieLab) => boolean, SurfaceColorFamily];

const D65_WHITE = [0.95047, 1, 1.08883] as const;

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function labCurve(ratio: number): number {
  return ratio > 0.008856 ? Math.cbrt(ratio) : 7.787 * ratio + 16 / 116;
}

/** A `#rrggbb` colour in CIELab under D65. */
export function getCieLab(hex: string): CieLab {
  const [r, g, b] = [1, 3, 5].map((start) => toLinear(Number.parseInt(hex.slice(start, start + 2), 16) / 255));
  const xyz = [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
  const [fx, fy, fz] = xyz.map((value, axis) => labCurve(value / D65_WHITE[axis]));
  const a = 500 * (fx - fy);
  const bAxis = 200 * (fy - fz);
  const hue = (Math.atan2(bAxis, a) * 180) / Math.PI;
  return { lightness: 116 * fy - 16, chroma: Math.hypot(a, bAxis), hue: (hue + 360) % 360 };
}

const isGreyish = ({ chroma }: CieLab) => chroma < 10;
const isReddishHue = ({ hue }: CieLab) => hue < 50 || hue >= 350;
const isWarmHue = ({ hue }: CieLab) => hue >= 50 && hue < 112;

/**
 * Solid colours, first rule that matches: anything nearly black, then the near-greys by lightness (with their faint pink,
 * cream and beige tints), then the light warm tints, browns, and the hue bands.
 */
const SOLID_RULES: readonly Rule[] = [
  [({ lightness }) => lightness < 12, "black"],
  [(lab) => isGreyish(lab) && lab.lightness >= 95, "white"],
  [(lab) => isGreyish(lab) && isReddishHue(lab) && lab.chroma >= 8 && lab.lightness >= 75, "pink"],
  [(lab) => isGreyish(lab) && isWarmHue(lab) && lab.chroma >= 7.5 && lab.lightness >= 85, "cream"],
  [(lab) => isGreyish(lab) && isWarmHue(lab) && lab.chroma >= 7.5 && lab.lightness >= 75, "beige"],
  [(lab) => isGreyish(lab) && lab.lightness >= 88, "white"],
  [(lab) => isGreyish(lab) && lab.lightness >= 45, "grey"],
  [(lab) => isGreyish(lab) && lab.lightness >= 22, "charcoal"],
  [isGreyish, "black"],
  [({ hue }) => hue >= 350 || hue < 10, "pink"],
  [({ hue, lightness, chroma }) => hue < 60 && lightness >= 65 && chroma < 50, "pink"],
  [({ hue, lightness, chroma }) => hue >= 60 && hue < 112 && lightness >= 85 && chroma < 30, "cream"],
  [({ hue, lightness, chroma }) => hue >= 60 && hue < 112 && lightness >= 65 && lightness < 85 && chroma < 32, "beige"],
  [({ hue, lightness, chroma }) => hue >= 40 && hue < 100 && lightness < 68 && chroma <= 55, "brown"],
  [({ hue }) => hue < 42, "red"],
  [({ hue }) => hue < 78, "orange"],
  [({ hue }) => hue < 105, "yellow"],
  [({ hue }) => hue < 190, "green"],
  [({ hue }) => hue < 310, "blue"],
  [() => true, "purple"],
];

// A dark wood's mean colour is naturally less saturated, so it reads as grey only when nearer grey than a light one.
const isGreyWood = ({ lightness, chroma }: CieLab) => chroma < (lightness >= 40 ? 10 : 6);

/** Woodgrains by their picture's mean colour: greyed and very pale woods first, then the oak tones the floors use. */
const WOOD_RULES: readonly Rule[] = [
  [({ lightness, chroma }) => lightness < 19 && chroma < 10, "black"],
  [(lab) => isGreyWood(lab) && lab.lightness >= 84, "white"],
  [(lab) => isGreyWood(lab) && lab.lightness >= 40, "grey"],
  [isGreyWood, "charcoal"],
  [({ lightness, chroma }) => lightness >= 90 && chroma < 15, "white"],
  [({ lightness, chroma }) => chroma >= 30 && lightness >= 40 && lightness < 80, "warm_oak"],
  [({ lightness }) => lightness >= 72, "light_oak"],
  [({ lightness }) => lightness >= 58, "natural_oak"],
  [({ lightness }) => lightness >= 40, "brown"],
  [() => true, "walnut"],
];

function firstFamily(rules: readonly Rule[], lab: CieLab): SurfaceColorFamily {
  return rules.find(([matches]) => matches(lab))?.[1] ?? "unknown";
}

export function getLaminateColourFamily(category: CabinetLaminateCategory, colour: string): SurfaceColorFamily {
  if (!/^#[0-9a-f]{6}$/i.test(colour)) return "unknown";
  if (category === "solids" || category === "unicore") return firstFamily(SOLID_RULES, getCieLab(colour));
  if (category === "woodgrains") return firstFamily(WOOD_RULES, getCieLab(colour));
  return "unknown";
}
