// Extracted from app/design/page.tsx — Phase C modularization
// GLB rendering calibration data for imported real-product models.

export type GLBCalibration = {
  brightness?: number;
  saturation?: number;
  variantMapTintStrength?: number;
  normalScale?: number;
  importedNormalScale?: number;
  roughnessScale?: number;
  roughnessOverride?: number;
  metalnessOverride?: number;
  aoMapIntensity?: number;
  emissiveBoost?: number;
  specularIntensityOverride?: number;
  clearcoatOverride?: number;
  clearcoatRoughnessOverride?: number;
  forceBaseColorHex?: string;
  disableAoMap?: boolean;
  disableVertexColors?: boolean;
  disableBaseColorMap?: boolean;
  disableShadingMaps?: boolean;
  useVariantColor?: boolean;
  swapWidthDepthAxes?: boolean;
  uniformScale?: boolean;
  lockVerticalScaleToFootprint?: boolean;
  preserveWoodLegMaterials?: boolean;
  preserveWoodLegColorHex?: string;
  preserveWoodLegDisableBaseColorMap?: boolean;
  woodLegDetectionMode?: "default" | "kelsey" | "harper";
  lowerAssemblyTintHex?: string;
  lowerAssemblyTintStrength?: number;
  lowerAssemblyFadeStart?: number;
  lowerAssemblyFadeEnd?: number;
};

export const STANDARD_IMPORTED_CASTLERY_SOFA_CALIBRATION: GLBCalibration = {
  brightness: 0.74,
  saturation: 1.32,
  variantMapTintStrength: 1,
  normalScale: 4.2,
  roughnessOverride: 0.68,
  metalnessOverride: 0,
  aoMapIntensity: 0.35,
  emissiveBoost: 0,
  specularIntensityOverride: 0.2,
  disableAoMap: true,
  disableVertexColors: true,
  disableBaseColorMap: true,
  disableShadingMaps: true,
  useVariantColor: true,
};

export const GLB_CALIBRATION_BY_PRODUCT_ID: Record<string, GLBCalibration> = {
  "sofa-real-castlery-dawson-3s": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-dawson-extended-sofa": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-dawson-ottoman": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-dawson-storage-ottoman": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
    lockVerticalScaleToFootprint: true,
  },
  "sofa-real-castlery-dawson-pit-sectional": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-dawson-swivel-armchair": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-dawson-wide-chaise-sectional": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-dawson-wide-chaise-sectional-left": {
    brightness: 0.74,
    saturation: 1.32,
    variantMapTintStrength: 1,
    normalScale: 4.2,
    roughnessOverride: 0.68,
    metalnessOverride: 0,
    aoMapIntensity: 0.35,
    emissiveBoost: 0,
    specularIntensityOverride: 0.2,
    disableAoMap: true,
    disableVertexColors: true,
    disableBaseColorMap: true,
    disableShadingMaps: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-madison-2s": {
    brightness: 1.08,
    saturation: 1,
    roughnessOverride: 0.9,
    metalnessOverride: 0,
    aoMapIntensity: 0.25,
    emissiveBoost: 0.06,
    specularIntensityOverride: 0.15,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
    preserveWoodLegMaterials: true,
    preserveWoodLegColorHex: "#8a5b34",
  },
  "sofa-real-castlery-jaron-3s": {
    brightness: 1.03,
    saturation: 1.05,
    roughnessOverride: 0.44,
    metalnessOverride: 0.04,
    aoMapIntensity: 0.36,
    emissiveBoost: 0,
    specularIntensityOverride: 0.58,
    clearcoatOverride: 0.22,
    clearcoatRoughnessOverride: 0.6,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-jaron-3s-wide-arm": {
    brightness: 1.03,
    saturation: 1.05,
    roughnessOverride: 0.44,
    metalnessOverride: 0.04,
    aoMapIntensity: 0.36,
    emissiveBoost: 0,
    specularIntensityOverride: 0.58,
    clearcoatOverride: 0.22,
    clearcoatRoughnessOverride: 0.6,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-jaron-extended-3s": {
    brightness: 1.03,
    saturation: 1.05,
    roughnessOverride: 0.44,
    metalnessOverride: 0.04,
    aoMapIntensity: 0.36,
    emissiveBoost: 0,
    specularIntensityOverride: 0.58,
    clearcoatOverride: 0.22,
    clearcoatRoughnessOverride: 0.6,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
  },
  "sofa-real-castlery-jaron-extended-3s-wide-arm": {
    brightness: 1.03,
    saturation: 1.05,
    roughnessOverride: 0.44,
    metalnessOverride: 0.04,
    aoMapIntensity: 0.36,
    swapWidthDepthAxes: false,
  },
  "dining-real-castlery-forma-oval-150": {
    brightness: 1.2,
    saturation: 0.84,
    roughnessOverride: 0.9,
    metalnessOverride: 0,
    aoMapIntensity: 0.06,
    emissiveBoost: 0.08,
    specularIntensityOverride: 0.06,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
    swapWidthDepthAxes: false,
  },
  "dining-real-castlery-forma-round-90": {
    brightness: 1.2,
    saturation: 0.84,
    roughnessOverride: 0.9,
    metalnessOverride: 0,
    aoMapIntensity: 0.06,
    emissiveBoost: 0.08,
    specularIntensityOverride: 0.06,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
    swapWidthDepthAxes: false,
  },
  "dining-real-castlery-forma-round-120": {
    brightness: 1.2,
    saturation: 0.84,
    roughnessOverride: 0.9,
    metalnessOverride: 0,
    aoMapIntensity: 0.06,
    emissiveBoost: 0.08,
    specularIntensityOverride: 0.06,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
    swapWidthDepthAxes: false,
  },
  "dining-real-castlery-brighton-oval-180": {
    brightness: 1.18,
    saturation: 0.9,
    roughnessOverride: 0.84,
    metalnessOverride: 0,
    aoMapIntensity: 0.1,
    emissiveBoost: 0.03,
    specularIntensityOverride: 0.1,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: true,
    swapWidthDepthAxes: false,
  },
  "coffee-real-castlery-harper-marble-rectangular-120": {
    brightness: 1.03,
    saturation: 0.96,
    roughnessOverride: 0.84,
    metalnessOverride: 0,
    aoMapIntensity: 0.18,
    emissiveBoost: 0.02,
    specularIntensityOverride: 0.16,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: false,
    preserveWoodLegMaterials: true,
    preserveWoodLegDisableBaseColorMap: true,
    woodLegDetectionMode: "harper",
  },
  "coffee-real-castlery-harper-marble-round-915": {
    brightness: 1.03,
    saturation: 0.96,
    roughnessOverride: 0.84,
    metalnessOverride: 0,
    aoMapIntensity: 0.18,
    emissiveBoost: 0.02,
    specularIntensityOverride: 0.16,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: false,
    preserveWoodLegMaterials: true,
    preserveWoodLegDisableBaseColorMap: true,
    woodLegDetectionMode: "harper",
  },
  "dining-real-castlery-kelsey-marble-160": {
    brightness: 1.18,
    saturation: 0.88,
    roughnessOverride: 0.86,
    metalnessOverride: 0,
    aoMapIntensity: 0.1,
    emissiveBoost: 0.03,
    specularIntensityOverride: 0.1,
    disableAoMap: false,
    disableVertexColors: true,
    // Keep tabletop marble texture stable; only leg wood tint should change per variant.
    useVariantColor: false,
    preserveWoodLegMaterials: true,
    preserveWoodLegDisableBaseColorMap: true,
    woodLegDetectionMode: "kelsey",
  },
  "dining-real-castlery-kelsey-marble-180": {
    brightness: 1.18,
    saturation: 0.88,
    roughnessOverride: 0.86,
    metalnessOverride: 0,
    aoMapIntensity: 0.1,
    emissiveBoost: 0.03,
    specularIntensityOverride: 0.1,
    disableAoMap: false,
    disableVertexColors: true,
    useVariantColor: false,
    preserveWoodLegMaterials: true,
    preserveWoodLegDisableBaseColorMap: true,
    woodLegDetectionMode: "kelsey",
  },
};

export function getModelCalibration(product: { id: string }): GLBCalibration | undefined {
  const explicitCalibration = GLB_CALIBRATION_BY_PRODUCT_ID[product.id];
  if (explicitCalibration) return explicitCalibration;

  if (product.id.startsWith("sofa-real-castlery-")) {
    return STANDARD_IMPORTED_CASTLERY_SOFA_CALIBRATION;
  }

  return undefined;
}
