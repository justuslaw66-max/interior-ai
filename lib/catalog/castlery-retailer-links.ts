type CastleryVariantLinkInput = {
  productId: string;
  sourceUrl?: string;
  authoredAffiliateUrl?: string;
  variantId?: string;
  upholsteryCode?: string;
  finishCode?: string;
  finishLabel?: string;
  materialType?: string;
  legFinishCode?: string;
};

const MATERIAL_HANDLE_BY_CODE: Record<string, string> = {
  beach_linen: "beach_linen",
  navagio_seagull: "seagull",
  marcel_brilliant_white: "performance_brilliant_white",
  peyton_ivory: "performance_ivory",
  peyton_dove_grey: "performance_dove_grey",
  peyton_moss: "performance_moss",
  peyton_cumin: "performance_cumin",
  infinity_boucle_ginger: "performance_ginger",
  performance_infinity_boucle_ginger: "performance_ginger",
  infinity_boucle_white_quartz: "performance_white_quartz_boucle_new",
  performance_infinity_boucle_white_quartz: "performance_white_quartz_boucle_new",
  white_quartz: "performance_white_quartz_boucle_new",
  infinity_boucle_cream: "performance_boucle_cream",
  performance_boucle_cream: "performance_boucle_cream",
  infinity_boucle_moss: "performance_infinity_boucle_moss",
  performance_infinity_boucle_moss: "performance_infinity_boucle_moss",
  performance_hugo_greige: "performance_hugo_greige",
  performance_hugo_cream: "performance_hugo_cream",
  performance_genova_oat: "performance_genova_oat",
  genova_oat: "performance_genova_oat",
  performance_linen_weave_cream: "performance_linen_weave_cream",
  genova_cream: "performance_linen_weave_cream",
  performance_linen_weave_light_grey: "performance_linen_weave_light_grey",
  genova_light_grey: "performance_linen_weave_light_grey",
  performance_twill_creamy_white: "twill_performance_creamy_white",
  performance_creamy_white: "twill_performance_creamy_white",
  performance_twill_pearl_beige: "performance_twill_pearl_beige",
  performance_twill_dove_grey: "performance_twill_dove_grey",
  performance_twill_medium_grey: "performance_twill_dove_grey",
  performance_twill_slate: "performance_twill_slate",
  performance_twill_moss: "performance_twill_moss",
  greta_ivory: "greta_ivory",
  washed_chenille_cream: "greta_ivory",
  washed_chenille_sand: "washed_chenille_sand",
  greta_mustard_brown: "greta_mustard_brown",
  greta_caramel: "greta_mustard_brown",
  washed_chenille_caramel: "greta_mustard_brown",
  greta_moss: "greta_moss",
  washed_chenille_moss: "greta_moss",
  cocoa_leather: "cocoa",
  caramel_leather: "caramel",
  warm_taupe_leather: "warm_taupe",
  marche_ivory_leather: "marche_Ivory",
  marche_graphite_leather: "marche_graphite",
  marche_cocoa_leather: "marche_cocoa",
  marche_ivory: "marche_Ivory",
  marche_cocoa: "marche_cocoa",
  performance_arvo_dune: "performance_dune",
  performance_fabric_bisque: "bisque",
  bisque_fabric: "bisque",
  performance_fabric_stone: "stone",
  camille_forest_fabric: "camille_forest",
  top_grain_leather_caramel: "caramel",
};

const CONTROLLED_PRODUCT_PREFIXES = [
  "armchair-real-castlery-avery-",
  "armchair-real-castlery-jaron-",
  "armchair-real-castlery-lena-",
  "armchair-real-castlery-madison-",
  "coffee-real-castlery-harper-",
  "coffee-real-castlery-hugg-",
  "dining-real-castlery-kelsey-",
  "sofa-real-castlery-dawson-",
  "sofa-real-castlery-jaron-",
  "sofa-real-castlery-madison-",
  "sofa-real-castlery-ollie-",
] as const;

function normalizedToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isControlledProduct(productId: string): boolean {
  return CONTROLLED_PRODUCT_PREFIXES.some((prefix) => productId.startsWith(prefix));
}

function parseCastleryUrl(value: string | undefined): URL | null {
  try {
    const url = new URL(String(value ?? ""));
    return url.hostname === "www.castlery.com" || url.hostname === "castlery.com" ? url : null;
  } catch {
    return null;
  }
}

function materialHandle(input: CastleryVariantLinkInput): string | null {
  const candidates = [input.upholsteryCode, input.finishCode, input.variantId]
    .map(normalizedToken)
    .filter(Boolean);
  for (const candidate of candidates) {
    if (MATERIAL_HANDLE_BY_CODE[candidate]) return MATERIAL_HANDLE_BY_CODE[candidate];
  }
  return null;
}

function isLeather(input: CastleryVariantLinkInput, handle: string): boolean {
  return (
    normalizedToken(input.materialType) === "leather" ||
    /leather/.test(normalizedToken(input.upholsteryCode)) ||
    /leather/.test(normalizedToken(input.finishCode)) ||
    ["cocoa", "caramel", "warm_taupe", "marche_ivory", "marche_graphite", "marche_cocoa"].includes(
      handle.toLowerCase(),
    )
  );
}

function withDawsonSelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const handle = materialHandle(input);
  if (!handle) return undefined;

  const leather = isLeather(input, handle);
  if (leather && input.productId === "sofa-real-castlery-dawson-ottoman") {
    url.pathname = "/sg/products/dawson-leather-small-ottoman";
  } else if (leather && !url.pathname.includes("dawson-leather-")) {
    url.pathname = url.pathname.replace("/dawson-", "/dawson-leather-");
  }
  if (!leather) {
    url.pathname = url.pathname.replace("/dawson-leather-", "/dawson-");
  }

  url.searchParams.set("material", handle);
  if (leather) url.searchParams.delete("frame_cover");
  else url.searchParams.set("frame_cover", "removable");

  if (input.productId.includes("chaise-sectional")) {
    url.searchParams.set("orientation", input.productId.endsWith("-left") ? "left_facing" : "right_facing");
  }
  return url.toString();
}

function withAverySelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const handle = materialHandle(input);
  if (!handle) return undefined;
  url.searchParams.set("material", handle);
  if (input.productId.endsWith("performance-armchair")) url.searchParams.set("quantity", "single");
  return url.toString();
}

function withJaronSelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const handle = materialHandle(input);
  if (!handle) return undefined;
  const fabric = normalizedToken(input.upholsteryCode) === "performance_arvo_dune";
  if (fabric) url.pathname = url.pathname.replace("/jaron-leather-", "/jaron-performance-fabric-");
  else url.pathname = url.pathname.replace("/jaron-performance-fabric-", "/jaron-leather-");

  url.searchParams.set("material", handle);
  url.searchParams.set("variant", input.productId.endsWith("-wide-arm") ? "wide_arm" : "slim_arm");
  if (!input.productId.includes("armchair")) url.searchParams.set("power_recliner_qty", "dual");
  return url.toString();
}

function withMadisonSelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const handle = materialHandle(input);
  if (!handle) return undefined;
  const leather = isLeather(input, handle);
  if (leather && !url.pathname.includes("madison-leather-")) {
    url.pathname = url.pathname.replace("/madison-", "/madison-leather-");
  }
  if (!leather) url.pathname = url.pathname.replace("/madison-leather-", "/madison-");
  url.searchParams.set("material", handle);
  return url.toString();
}

function withLenaSelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const handle = materialHandle(input);
  if (!handle) return undefined;
  const leather = isLeather(input, handle);
  if (leather && !url.pathname.includes("lena-leather-")) {
    url.pathname = url.pathname.replace("/lena-performance-fabric-", "/lena-leather-");
  }
  if (!leather) url.pathname = url.pathname.replace("/lena-leather-", "/lena-performance-fabric-");
  url.searchParams.set("material", handle);
  url.searchParams.set(
    "leg_color",
    normalizedToken(input.legFinishCode).includes("matte_black") ? "black" : "gold",
  );
  return url.toString();
}

function withHarperSelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const finish = normalizedToken(input.finishCode || input.variantId);
  const colorOption = finish.includes("chestnut")
    ? "chestnut_oak"
    : finish.includes("natural")
      ? "light_oak"
      : null;
  if (!colorOption) return undefined;
  url.searchParams.set("color_option", colorOption);
  return url.toString();
}

function withHuggSelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const finish = normalizedToken(input.finishCode || input.variantId);
  const colorOption = finish.includes("chestnut")
    ? "chestnut_oak"
    : finish.includes("black")
      ? "black_oak"
      : finish.includes("natural")
        ? "natural_oak"
        : null;
  if (!colorOption) return undefined;
  url.searchParams.set("color_option", colorOption);
  url.searchParams.set(
    "material",
    input.productId.includes("performance-basalt") ? "performance_basalt" : "performance_dune",
  );
  return url.toString();
}

function withKelseySelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const finish = normalizedToken(input.finishCode || input.variantId);
  if (finish.includes("dark_walnut")) {
    url.pathname = "/sg/products/kelsey-marble-dining-table-walnut-stain";
  } else if (finish.includes("white_wash")) {
    url.pathname = "/sg/products/kelsey-marble-dining-table-white-wash";
  } else {
    return undefined;
  }
  url.searchParams.set("length", input.productId.endsWith("-180") ? "1_8m" : "1_6m");
  return url.toString();
}

function withOllieSelection(url: URL, input: CastleryVariantLinkInput): string | undefined {
  const handle = materialHandle(input);
  if (!handle) return undefined;
  url.searchParams.set("material", handle);
  return url.toString();
}

/**
 * Returns an exact Castlery PDP identity for a selectable catalog variant.
 *
 * Known configurable families are rebuilt from live-verified Castlery handles
 * so a generic authored product URL cannot silently erase the selected colour.
 * Other products retain their explicitly authored variant URL.
 */
export function resolveCastleryVariantAffiliateUrl(input: CastleryVariantLinkInput): string | undefined {
  const authored = parseCastleryUrl(input.authoredAffiliateUrl)?.toString();
  if (!isControlledProduct(input.productId)) return authored;

  const url = parseCastleryUrl(input.sourceUrl) ?? parseCastleryUrl(input.authoredAffiliateUrl);
  if (!url) return authored;

  if (input.productId.startsWith("sofa-real-castlery-dawson-")) {
    return withDawsonSelection(url, input) ?? authored;
  }
  if (input.productId.startsWith("armchair-real-castlery-avery-")) {
    return withAverySelection(url, input) ?? authored;
  }
  if (input.productId.includes("real-castlery-jaron-")) {
    return withJaronSelection(url, input) ?? authored;
  }
  if (input.productId.includes("real-castlery-madison-")) {
    return withMadisonSelection(url, input) ?? authored;
  }
  if (input.productId.startsWith("armchair-real-castlery-lena-")) {
    return withLenaSelection(url, input) ?? authored;
  }
  if (input.productId.startsWith("coffee-real-castlery-harper-")) {
    return withHarperSelection(url, input) ?? authored;
  }
  if (input.productId.startsWith("coffee-real-castlery-hugg-")) {
    return withHuggSelection(url, input) ?? authored;
  }
  if (input.productId.startsWith("dining-real-castlery-kelsey-")) {
    return withKelseySelection(url, input) ?? authored;
  }
  if (input.productId.startsWith("sofa-real-castlery-ollie-")) {
    return withOllieSelection(url, input) ?? authored;
  }
  return authored;
}
