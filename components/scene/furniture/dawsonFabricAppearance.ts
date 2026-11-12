import type { GLBCalibration } from "@/lib/design-page-calibration";

/**
 * Dawson fabric families. Each fabric's photo tile carries its colour and
 * weave, drawn at real size, so no tint and no brightness or saturation
 * correction; relief suits a weave at real size (the earlier 0.01-0.02 hid a
 * weave drawn twenty times too large). See
 * docs/architecture/upholstery-fabric-standard.md.
 */
const PHOTO_TILE: Partial<GLBCalibration> = {
  disableBaseColorMap: false,
  variantMapTintStrength: 0,
  brightness: 1,
  saturation: 1,
  metalnessOverride: 0,
  emissiveBoost: 0,
};

type DawsonFabricFamily = {
  matches: RegExp;
  /** Creamy White is matched on leather-marked variants too, as before. */
  includesLeatherMarked?: boolean;
  calibration: Partial<GLBCalibration>;
};

// First match wins: Creamy White (PT4001) must come before the other twills.
const DAWSON_FABRIC_FAMILIES: DawsonFabricFamily[] = [
  {
    // Soft and warm relative to Sand.
    matches: /(?:\bcreamy[\s_-]*white\b|\bperformance[\s_-]*creamy[\s_-]*white\b|\bpt4001\b)/i,
    includesLeatherMarked: true,
    calibration: {
      forceBaseColorHex: "#dfd7ca",
      roughnessOverride: 0.9,
      aoMapIntensity: 0.18,
      specularIntensityOverride: 0.04,
      importedNormalScale: 0.3,
    },
  },
  {
    matches: /(?:\bperformance[\s_-]*twill\b|\bperformance_twill_\w+\b|\bpt400[2-5]\b)/i,
    calibration: {
      roughnessOverride: 0.9,
      aoMapIntensity: 0.18,
      specularIntensityOverride: 0.05,
      importedNormalScale: 0.3,
    },
  },
  {
    matches: /(?:\bpeyton\b|\bpy400[1-4]\b|\bpeyton_[a-z_]+\b)/i,
    calibration: {
      roughnessOverride: 0.93,
      aoMapIntensity: 0.14,
      specularIntensityOverride: 0.03,
      importedNormalScale: 0.25,
    },
  },
  {
    matches:
      /(?:\bgenova\b|\bperformance_linen_weave\b|\bperformance[\s_-]*linen[\s_-]*weave\b|\bpg400[2-4]\b)/i,
    calibration: {
      roughnessOverride: 0.92,
      aoMapIntensity: 0.16,
      specularIntensityOverride: 0.04,
      importedNormalScale: 0.3,
    },
  },
  {
    // Loops at real size need real relief.
    matches:
      /(?:\bboucle\b|\bin400[2-5]\b|\bperformance_boucle_cream\b|\bperformance_infinity_boucle_moss\b|\binfinity_boucle_[a-z_]+\b)/i,
    calibration: {
      roughnessOverride: 0.95,
      aoMapIntensity: 0.12,
      specularIntensityOverride: 0.025,
      importedNormalScale: 0.9,
    },
  },
  {
    matches:
      /(?:\bwashed[\s_-]*chenille\b|\bgreta\b|\bgr400[1-4]\b|\bwashed_chenille_[a-z_]+\b|\bgreta_[a-z_]+\b)/i,
    calibration: {
      roughnessOverride: 0.91,
      aoMapIntensity: 0.16,
      specularIntensityOverride: 0.04,
      importedNormalScale: 0.3,
    },
  },
  {
    matches: /(?:\bmarcel\b|\btextured[\s_-]*plain[\s_-]*weave\b|\bpm400[12]\b)/i,
    calibration: {
      roughnessOverride: 0.92,
      specularIntensityOverride: 0.04,
      importedNormalScale: 0.35,
    },
  },
  {
    matches:
      /(?:\bbeach[\s_-]*linen\b|\bnavagio\b|\bseagull\b|\bng400[12]\b|\bbeach_linen\b|\bnavagio_seagull\b)/i,
    calibration: {
      roughnessOverride: 0.92,
      aoMapIntensity: 0.16,
      specularIntensityOverride: 0.04,
      importedNormalScale: 0.3,
    },
  },
];

/** The calibration for a Dawson fabric variant, or null when no family matches. */
export function resolveDawsonFabricCalibration(input: {
  productId: string;
  isLeatherVariant: boolean;
  variantMarker: string;
  modelCalibration: GLBCalibration | undefined;
}): GLBCalibration | null {
  if (!input.productId.startsWith("sofa-real-castlery-dawson-")) return null;
  const family = DAWSON_FABRIC_FAMILIES.find(
    (candidate) =>
      (candidate.includesLeatherMarked || !input.isLeatherVariant) &&
      candidate.matches.test(input.variantMarker)
  );
  return family ? { ...input.modelCalibration, ...PHOTO_TILE, ...family.calibration } : null;
}
