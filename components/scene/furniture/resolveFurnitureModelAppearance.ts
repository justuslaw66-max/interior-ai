import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { shouldApplyVariantColorTint } from "@/lib/catalog-variant-color";
import {
  type GLBCalibration,
  getModelCalibration,
} from "@/lib/design-page-calibration";

function normalizeModelCandidate(
  value: string | null | undefined
): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) return raw;
  if (raw.startsWith("assets/")) return `/${raw}`;
  return `/assets/models/${raw.replace(/^\/+/, "")}`;
}

export function resolveFurnitureModelAppearance({
  product,
  variantId,
  variantName,
  variantColor,
}: {
  product: CatalogItemSchema;
  variantId: string;
  variantName?: string;
  variantColor: string;
}) {
  const activeVariant = product?.variants.find((variant) => variant.id === variantId);
  const modelUrl = activeVariant?.modelUrl ?? (product?.assets?.modelUrl as string | undefined);
  const shouldTintVariantColor = shouldApplyVariantColorTint(product, activeVariant);
  const modelCalibration = getModelCalibration(product);
  const variantMarker = `${String(variantName ?? "")} ${String(variantId ?? "")}`.toLowerCase();
  const variantColorKey = String(variantColor ?? "").trim().toLowerCase();
  const isKelseyTableVariant = product.id.startsWith("dining-real-castlery-kelsey-marble-");
  const variantHex = variantColorKey.match(/^#([0-9a-f]{6})$/i)?.[1] ?? null;
  const variantLuma = (() => {
    if (!variantHex) return null;
    const r = parseInt(variantHex.slice(0, 2), 16) / 255;
    const g = parseInt(variantHex.slice(2, 4), 16) / 255;
    const b = parseInt(variantHex.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  })();
  const normalizedVariantMarker = variantMarker.replace(/[_-]+/g, " ");
  // variantMarker includes variantId (e.g. "cocoa_leather") so check both name and marker.
  const isLeatherVariant = /\bleather\b/i.test(String(variantName ?? "")) || /\bleather\b/i.test(normalizedVariantMarker);
  const isMadisonProduct =
    product.id.startsWith("sofa-real-castlery-madison-") ||
    product.id.startsWith("armchair-real-castlery-madison-");
  const isHamiltonProduct =
    product.id.startsWith("sofa-real-castlery-hamilton-") ||
    product.id.startsWith("armchair-real-castlery-hamilton-");
  const isHamiltonCaramelLeatherVariant =
    isHamiltonProduct &&
    isLeatherVariant &&
    /\bcaramel\b/i.test(normalizedVariantMarker);
  const isMadisonFabricVariant = isMadisonProduct && !isLeatherVariant;
  const isMadisonBisqueFabricVariant =
    isMadisonFabricVariant && /\bbisque\b/i.test(normalizedVariantMarker);
  const isMadisonStoneFabricVariant =
    isMadisonFabricVariant && /\bstone\b/i.test(normalizedVariantMarker);
  const isMadisonCamilleForestFabricVariant =
    isMadisonFabricVariant &&
    (/\bcamille\b.*\bforest\b/i.test(normalizedVariantMarker) || /\bforest\b/i.test(normalizedVariantMarker));
  const isDawsonFabricVariant =
    product.id.startsWith("sofa-real-castlery-dawson-") && !isLeatherVariant;
  const isDawsonCreamyWhiteVariant =
    product.id.startsWith("sofa-real-castlery-dawson-") &&
    /(?:\bcreamy[\s_-]*white\b|\bperformance[\s_-]*creamy[\s_-]*white\b|\bpt4001\b)/i.test(variantMarker);
  const isDawsonPerformanceTwillVariant =
    isDawsonFabricVariant &&
    !isDawsonCreamyWhiteVariant &&
    /(?:\bperformance[\s_-]*twill\b|\bperformance_twill_\w+\b|\bpt400[2-5]\b)/i.test(variantMarker);
  const isDawsonPeytonVariant =
    isDawsonFabricVariant &&
    /(?:\bpeyton\b|\bpy400[1-4]\b|\bpeyton_[a-z_]+\b)/i.test(variantMarker);
  const isDawsonGenovaVariant =
    isDawsonFabricVariant &&
    /(?:\bgenova\b|\bperformance_linen_weave\b|\bperformance[\s_-]*linen[\s_-]*weave\b|\bpg400[2-4]\b)/i.test(variantMarker);
  const isDawsonBoucleVariant =
    isDawsonFabricVariant &&
    /(?:\bboucle\b|\bin400[2-5]\b|\bperformance_boucle_cream\b|\bperformance_infinity_boucle_moss\b|\binfinity_boucle_[a-z_]+\b)/i.test(variantMarker);
  const isDawsonChenilleVariant =
    isDawsonFabricVariant &&
    /(?:\bwashed[\s_-]*chenille\b|\bgreta\b|\bgr400[1-4]\b|\bwashed_chenille_[a-z_]+\b|\bgreta_[a-z_]+\b)/i.test(variantMarker);
  const isDawsonStockedLinenVariant =
    isDawsonFabricVariant &&
    /(?:\bbeach[\s_-]*linen\b|\bnavagio\b|\bseagull\b|\bng400[12]\b|\bbeach_linen\b|\bnavagio_seagull\b)/i.test(variantMarker);
  const isJaronProduct =
    product.id.startsWith("sofa-real-castlery-jaron-") ||
    product.id.startsWith("armchair-real-castlery-jaron-");
  const isPerformanceDuneFabricVariant =
    (isJaronProduct && /(?:\bperformance[\s_-]*dune\b|\bdune\b)/.test(variantMarker)) ||
    (/performance\s*dune/i.test(String(variantName ?? "")) &&
      /\bfabric\b/i.test(String(variantName ?? "")));
  const isIvoryLeatherVariant =
    (isJaronProduct && /\bivory\b/.test(variantMarker)) ||
    (isLeatherVariant && /\bivory\b/i.test(String(variantName ?? "")));
  const isCocoaLeatherVariant =
    (isJaronProduct && /\bcocoa\b/.test(variantMarker)) ||
    (isLeatherVariant && /\bcocoa\b/i.test(String(variantName ?? "")));
  const isGraphiteLeatherVariant =
    isLeatherVariant && /\bgraphite\b/i.test(String(variantName ?? ""));
  const isMadisonCaramelLeatherVariant =
    isMadisonProduct &&
    /\bcaramel\b/i.test(String(variantName ?? "")) &&
    /\bleather\b/i.test(String(variantName ?? ""));
  const kelseyHasWhiteToken = /white[\s_-]*wash/i.test(variantMarker);
  const kelseyHasDarkWalnutToken = /dark[\s_-]*walnut/i.test(variantMarker);
  const isKelseyWhiteWashVariant =
    isKelseyTableVariant &&
    (kelseyHasWhiteToken || variantColorKey === "#d8d0c2" || (!kelseyHasDarkWalnutToken && (variantLuma ?? 1) >= 0.72));
  const isKelseyDarkWalnutVariant =
    isKelseyTableVariant &&
    (kelseyHasDarkWalnutToken || variantColorKey === "#7a4b2d" || (!kelseyHasWhiteToken && (variantLuma ?? 1) < 0.72));
  const preferredModelUrl = modelUrl ?? null;
  const expectedModelUrl =
    [preferredModelUrl, modelUrl]
      .map((value) => normalizeModelCandidate(value))
      .filter(
        (value, index, values): value is string =>
          Boolean(value) && values.indexOf(value) === index
      )[0] ?? null;
  const effectiveModelCalibration: GLBCalibration | undefined = (() => {
    const modelUrlKey = String(product.assets?.modelUrl ?? "").toLowerCase();
    const productIdKey = String(product.id ?? "").toLowerCase();
    const variantKey = String(variantName ?? "").toLowerCase();
    const isSloaneOrSawyerSideboard =
      product.category === "sideboard" &&
      (/(sloane|sawyer)[-_ ]sideboard/.test(productIdKey) ||
        /(sloane|sawyer)[-_ ]sideboard/.test(modelUrlKey) ||
        /(sloane|sawyer)/.test(productIdKey) ||
        /(sloane|sawyer)/.test(modelUrlKey) ||
        /(grey\s*oak|natural)/.test(variantKey));

    // Sideboards can arrive through multiple catalog paths/IDs; enforce a stable
    // lighter wood calibration here to avoid crushed dark tones from tint stacking.
    if (isSloaneOrSawyerSideboard) {
      return {
        ...(modelCalibration ?? {}),
        useVariantColor: false,
        brightness: 1.43,
        saturation: 0.94,
        roughnessOverride: 0.82,
        metalnessOverride: 0,
        disableAoMap: false,
        aoMapIntensity: 0.2,
        emissiveBoost: 0,
        specularIntensityOverride: 0.08,
        disableVertexColors: true,
      };
    }

    if (!modelCalibration) return modelCalibration;

    if (isMadisonBisqueFabricVariant) {
      // Madison Bisque fabric: light warm woven beige, matched to the Castlery SG swatch card.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#d8d0c2",
        disableBaseColorMap: true,
        brightness: 1.02,
        saturation: 0.78,
        roughnessOverride: 0.97,
        metalnessOverride: 0,
        aoMapIntensity: 0.2,
        emissiveBoost: 0,
        specularIntensityOverride: 0.05,
      };
    }

    if (isMadisonCamilleForestFabricVariant) {
      // Madison Camille, Forest fabric: muted moss-green, matched to the Castlery SG swatch card.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#566448",
        disableBaseColorMap: true,
        brightness: 0.96,
        saturation: 1.02,
        roughnessOverride: 0.98,
        metalnessOverride: 0,
        aoMapIntensity: 0.22,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
      };
    }

    if (isMadisonStoneFabricVariant) {
      return {
        ...modelCalibration,
        forceBaseColorHex: "#9d9991",
        disableBaseColorMap: true,
        brightness: 0.98,
        saturation: 0.72,
        roughnessOverride: 0.98,
        metalnessOverride: 0,
        aoMapIntensity: 0.22,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
      };
    }

    if (isDawsonCreamyWhiteVariant) {
      // Dawson Creamy White should stay soft and warm relative to Sand, without the
      // crisp, pebbled micro-relief that makes it read as artificial plaster.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#dfd7ca",
        brightness: 0.95,
        saturation: 0.88,
        roughnessOverride: 0.9,
        metalnessOverride: 0,
        aoMapIntensity: 0.18,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.012,
      };
    }

    if (isDawsonPerformanceTwillVariant) {
      return {
        ...modelCalibration,
        brightness: 0.97,
        saturation: 0.94,
        roughnessOverride: 0.9,
        metalnessOverride: 0,
        aoMapIntensity: 0.18,
        emissiveBoost: 0,
        specularIntensityOverride: 0.05,
        importedNormalScale: 0.014,
      };
    }

    if (isDawsonPeytonVariant) {
      return {
        ...modelCalibration,
        brightness: 0.96,
        saturation: 0.94,
        roughnessOverride: 0.93,
        metalnessOverride: 0,
        aoMapIntensity: 0.14,
        emissiveBoost: 0,
        specularIntensityOverride: 0.03,
        importedNormalScale: 0.014,
      };
    }

    if (isDawsonGenovaVariant) {
      return {
        ...modelCalibration,
        brightness: 0.98,
        saturation: 0.94,
        roughnessOverride: 0.92,
        metalnessOverride: 0,
        aoMapIntensity: 0.16,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.016,
      };
    }

    if (isDawsonBoucleVariant) {
      return {
        ...modelCalibration,
        brightness: 0.97,
        saturation: 0.95,
        roughnessOverride: 0.95,
        metalnessOverride: 0,
        aoMapIntensity: 0.12,
        emissiveBoost: 0,
        specularIntensityOverride: 0.025,
        importedNormalScale: 0.02,
      };
    }

    if (isDawsonChenilleVariant) {
      return {
        ...modelCalibration,
        brightness: 0.97,
        saturation: 0.95,
        roughnessOverride: 0.91,
        metalnessOverride: 0,
        aoMapIntensity: 0.16,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.015,
      };
    }

    if (isDawsonStockedLinenVariant) {
      return {
        ...modelCalibration,
        brightness: 0.98,
        saturation: 0.94,
        roughnessOverride: 0.92,
        metalnessOverride: 0,
        aoMapIntensity: 0.16,
        emissiveBoost: 0,
        specularIntensityOverride: 0.04,
        importedNormalScale: 0.018,
      };
    }


    if (isMadisonCaramelLeatherVariant) {
      // Keep base texture map for Madison caramel leather so non-upholstery parts
      // (legs/frame details) retain separation instead of collapsing into one flat tint.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#956a43",
        disableBaseColorMap: false,
        brightness: 0.86,
        saturation: 0.98,
        roughnessOverride: 0.26,
        metalnessOverride: 0.03,
        aoMapIntensity: 0.36,
        emissiveBoost: 0,
        specularIntensityOverride: 0.5,
        clearcoatOverride: 0.3,
        clearcoatRoughnessOverride: 0.42,
      };
    }

    if (isHamiltonCaramelLeatherVariant) {
      // Hamilton Caramel is a light golden saddle tan. Its shader replaces the
      // baked upholstery colour, so use a brighter albedo plus a small
      // colour-matched emissive fill to retain the Castlery tone in room light.
      return {
        ...modelCalibration,
        forceBaseColorHex: "#ffda9a",
        disableBaseColorMap: true,
        brightness: 1,
        saturation: 1,
        roughnessOverride: 0.36,
        metalnessOverride: 0.02,
        aoMapIntensity: 0.16,
        emissiveBoost: 0.08,
        specularIntensityOverride: 0.46,
        clearcoatOverride: 0.18,
        clearcoatRoughnessOverride: 0.56,
      };
    }

    if (isKelseyDarkWalnutVariant) {
      // Kelsey ships as a single baked material, so tint the lower assembly by height.
      return {
        ...modelCalibration,
        preserveWoodLegColorHex: "#7a4b2d",
        lowerAssemblyTintHex: "#7a4b2d",
        lowerAssemblyTintStrength: 0.95,
        // Cover full legs and underframe while leaving the tabletop cap mostly unchanged.
        lowerAssemblyFadeStart: 0.82,
        lowerAssemblyFadeEnd: 0.94,
      };
    }

    if (isKelseyWhiteWashVariant) {
      return {
        ...modelCalibration,
        preserveWoodLegColorHex: "#d8d0c2",
        lowerAssemblyTintHex: "#e1d6c8",
        lowerAssemblyTintStrength: 0,
        lowerAssemblyFadeStart: 0.82,
        lowerAssemblyFadeEnd: 0.94,
      };
    }

    if (isJaronProduct) {
      if (isPerformanceDuneFabricVariant) {
        // Tweed-like fabric target: matte, soft contrast, almost no glossy rolloff.
        return {
          ...modelCalibration,
          forceBaseColorHex: "#efeae2",
          disableBaseColorMap: true,
          brightness: 1.08,
          saturation: 0.68,
          roughnessOverride: 0.98,
          metalnessOverride: 0,
          aoMapIntensity: 0.3,
          emissiveBoost: 0,
          specularIntensityOverride: 0.02,
          clearcoatOverride: 0,
          clearcoatRoughnessOverride: 1,
        };
      }

      if (!isLeatherVariant && !isCocoaLeatherVariant && !isIvoryLeatherVariant) return modelCalibration;

      if (isCocoaLeatherVariant) {
        // Cocoa Marche leather: rich warm chocolate-brown saddle tone.
        // Reference eyedrop mid-tone #805134 → albedo ~#a87050. Lift brightness
        // and add a small emissive fill so the GLB's baked shadows don't collapse it.
        return {
          ...modelCalibration,
          forceBaseColorHex: "#a87050",
          disableBaseColorMap: true,
          brightness: 1.06,
          saturation: 1.04,
          roughnessOverride: 0.7,
          metalnessOverride: 0.02,
          aoMapIntensity: 0.12,
          emissiveBoost: 0.06,
          specularIntensityOverride: 0.24,
          clearcoatOverride: 0.08,
          clearcoatRoughnessOverride: 0.72,
        };
      }

      if (isIvoryLeatherVariant) {
        // Ivory Marche leather: warm cream/parchment. Reference eyedrop mid-tone
        // #b4afa6 → albedo ~#d0c8b4. Reduce brightness (was 1.2 → pure white) and
        // add warm saturation so it reads as cream, not grey-white.
        return {
          ...modelCalibration,
          forceBaseColorHex: "#cfc4ae",
          disableBaseColorMap: true,
          brightness: 0.9,
          saturation: 1.06,
          roughnessOverride: 0.8,
          metalnessOverride: 0,
          aoMapIntensity: 0.08,
          emissiveBoost: 0.04,
          specularIntensityOverride: 0.14,
          clearcoatOverride: 0.04,
          clearcoatRoughnessOverride: 0.84,
        };
      }

      // Jaron default leather: aligns with cross-brand leather baseline.
      return {
        ...modelCalibration,
        brightness: 0.96,
        saturation: 1.08,
        roughnessOverride: 0.38,
        metalnessOverride: 0.04,
        normalScale: 0.5,
        aoMapIntensity: 0.26,
        emissiveBoost: 0.03,
        specularIntensityOverride: 0.48,
        clearcoatOverride: 0.24,
        clearcoatRoughnessOverride: 0.44,
      };
    }

    if (!isLeatherVariant && !isCocoaLeatherVariant && !isIvoryLeatherVariant) return modelCalibration;

    if (isGraphiteLeatherVariant) {
      // Graphite leather should stay deep, but avoid crushed blacks on large cushions.
      return {
        ...modelCalibration,
        brightness: 1.18,
        saturation: 1.05,
        roughnessOverride: 0.3,
        metalnessOverride: 0.04,
        normalScale: 0.5,
        aoMapIntensity: 0.24,
        emissiveBoost: 0.04,
        specularIntensityOverride: 0.7,
        clearcoatOverride: 0.34,
        clearcoatRoughnessOverride: 0.48,
      };
    }

    // Leather: semi-gloss with visible clearcoat sheen regardless of geometry.
    // Low roughness + high clearcoat so broad cushion faces still catch env reflections.
    // normalScale: 0.5 prevents inheriting fabric-level bump (e.g. Dawson base 4.2)
    // which scatters specular and makes leather read as matte.
    return {
      ...modelCalibration,
      brightness: 0.96,
      saturation: 1.08,
      roughnessOverride: 0.31,
      metalnessOverride: 0.04,
      normalScale: 0.5,
      aoMapIntensity: 0.32,
      emissiveBoost: 0.03,
      specularIntensityOverride: 0.6,
      clearcoatOverride: 0.3,
      clearcoatRoughnessOverride: 0.44,
    };
  })();
  return {
    modelUrl,
    shouldTintVariantColor,
    expectedModelUrl,
    effectiveModelCalibration,
  };
}
