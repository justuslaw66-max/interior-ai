export const MATERIAL_FAMILIES = [
  "fabric",
  "leather",
  "wood",
  "metal",
  "stone",
  "glass",
  "lacquer",
  "composite",
  "other",
] as const;

export const COLOR_FAMILIES = [
  "white",
  "ivory",
  "beige",
  "taupe",
  "brown",
  "grey",
  "charcoal",
  "black",
  "green",
  "blue",
  "red",
  "terracotta",
  "natural",
] as const;

export const TONES = ["warm", "neutral", "cool"] as const;

export const SURFACES = [
  "matte",
  "satin",
  "semi_gloss",
  "gloss",
  "textured",
  "brushed",
  "polished",
  "woven",
  "smooth",
] as const;

export const PATTERNS = [
  "plain",
  "boucle",
  "woven",
  "grained",
  "veined",
  "marbled",
] as const;

export const FINISH_COMPONENTS = [
  "primary",
  "legs",
  "top",
  "base",
  "handle",
  "shade",
  "frame",
  "body",
  "upholstery",
  "trim",
  "hardware",
  "support",
] as const;

export type MaterialFamily = (typeof MATERIAL_FAMILIES)[number];
export type ColorFamily = (typeof COLOR_FAMILIES)[number];
export type Tone = (typeof TONES)[number];
export type Surface = (typeof SURFACES)[number];
export type Pattern = (typeof PATTERNS)[number];
export type FinishComponent = (typeof FINISH_COMPONENTS)[number];

export type BrandFinish = {
  id: string;
  catalogItemId: string;
  brandName: string;
  sourceLabel: string;
  sourceCode?: string;
  materialFamily?: MaterialFamily;
  notes?: string;
};

export type FinishFacets = {
  materialFamily: MaterialFamily;
  colorFamily: ColorFamily;
  tone: Tone;
  surface: Surface;
  pattern?: Pattern;
};

export type NormalizedFinish = {
  id: string;
  label: string;
  presentationLabel: string;
  facets: FinishFacets;
  isActive: boolean;
};

export type VariantFinishMapping = {
  id: string;
  catalogItemId: string;
  variantId: string;
  component: FinishComponent;
  brandFinishId: string;
  normalizedFinishId: string;
  sourceConfidence?: MappingConfidence;
  needsReview?: boolean;
};

export type CatalogVariantWithFinishMappings = {
  id: string;
  title: string;
  finishMappings: VariantFinishMapping[];
};

export type MappingConfidence =
  | "mapped_auto_confident"
  | "mapped_auto_needs_review"
  | "manual";

export type FinishValidationErrorCode =
  | "MISSING_VARIANTS"
  | "MISSING_VARIANT_ID"
  | "MISSING_FINISH_MAPPINGS"
  | "MISSING_BRAND_FINISH"
  | "MISSING_NORMALIZED_FINISH"
  | "INVALID_NORMALIZED_FINISH_ID"
  | "MISSING_FACETS"
  | "INVALID_MATERIAL_FAMILY"
  | "INVALID_COLOR_FAMILY"
  | "INVALID_TONE"
  | "INVALID_SURFACE"
  | "INVALID_PATTERN"
  | "INVALID_COMPONENT";

export type FinishValidationError = {
  code: FinishValidationErrorCode;
  message: string;
  variantId?: string;
  mappingId?: string;
};

const VALID_NORMALIZED_FINISH_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function includesLiteral<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

function parseVariantsFromJson(variantsJson: unknown): Record<string, unknown>[] {
  return asArray(variantsJson).filter(isRecord);
}

function parseMappingsFromVariant(variant: Record<string, unknown>): Record<string, unknown>[] {
  const mappings = variant.finishMappings;
  if (Array.isArray(mappings)) return mappings.filter(isRecord);

  // Backward-compatible single-mapping form.
  const brandFinishId = asString(variant.brandFinishId);
  const normalizedFinishId = asString(variant.normalizedFinishId);
  if (brandFinishId || normalizedFinishId) {
    return [
      {
        id: asString(variant.id) || "auto-primary",
        component: "primary",
        brandFinishId,
        normalizedFinishId,
        presentationLabel: asString(variant.presentationLabel),
        facets: isRecord(variant.facets) ? variant.facets : undefined,
      },
    ];
  }

  return [];
}

function hasBrandFinish(mapping: Record<string, unknown>): boolean {
  const direct = asString(mapping.brandFinishId);
  if (direct) return true;

  const nested = mapping.brandFinish;
  if (isRecord(nested)) {
    return Boolean(asString(nested.id) || asString(nested.sourceLabel));
  }

  return Boolean(asString(mapping.brandFinishLabel));
}

function validateFacets(
  facetsUnknown: unknown,
  variantId: string,
  mappingId: string
): FinishValidationError[] {
  if (!isRecord(facetsUnknown)) {
    return [
      {
        code: "MISSING_FACETS",
        message: "Finish mapping is missing required facets.",
        variantId,
        mappingId,
      },
    ];
  }

  const errors: FinishValidationError[] = [];
  const materialFamily = asString(facetsUnknown.materialFamily);
  const colorFamily = asString(facetsUnknown.colorFamily);
  const tone = asString(facetsUnknown.tone);
  const surface = asString(facetsUnknown.surface);
  const pattern = asString(facetsUnknown.pattern);

  if (!includesLiteral(MATERIAL_FAMILIES, materialFamily)) {
    errors.push({
      code: "INVALID_MATERIAL_FAMILY",
      message: `Invalid materialFamily: ${materialFamily || "(empty)"}.`,
      variantId,
      mappingId,
    });
  }

  if (!includesLiteral(COLOR_FAMILIES, colorFamily)) {
    errors.push({
      code: "INVALID_COLOR_FAMILY",
      message: `Invalid colorFamily: ${colorFamily || "(empty)"}.`,
      variantId,
      mappingId,
    });
  }

  if (!includesLiteral(TONES, tone)) {
    errors.push({
      code: "INVALID_TONE",
      message: `Invalid tone: ${tone || "(empty)"}.`,
      variantId,
      mappingId,
    });
  }

  if (!includesLiteral(SURFACES, surface)) {
    errors.push({
      code: "INVALID_SURFACE",
      message: `Invalid surface: ${surface || "(empty)"}.`,
      variantId,
      mappingId,
    });
  }

  if (pattern && !includesLiteral(PATTERNS, pattern)) {
    errors.push({
      code: "INVALID_PATTERN",
      message: `Invalid pattern: ${pattern}.`,
      variantId,
      mappingId,
    });
  }

  return errors;
}

function validateMapping(
  mapping: Record<string, unknown>,
  variantId: string
): FinishValidationError[] {
  const errors: FinishValidationError[] = [];
  const mappingId = asString(mapping.id) || "(missing-id)";
  const component = asString(mapping.component) || "primary";
  const normalizedFinishId = asString(mapping.normalizedFinishId);
  const presentationLabel = asString(mapping.presentationLabel);

  if (!includesLiteral(FINISH_COMPONENTS, component)) {
    errors.push({
      code: "INVALID_COMPONENT",
      message: `Invalid component: ${component}.`,
      variantId,
      mappingId,
    });
  }

  if (!hasBrandFinish(mapping)) {
    errors.push({
      code: "MISSING_BRAND_FINISH",
      message: "Finish mapping is missing brand finish source truth.",
      variantId,
      mappingId,
    });
  }

  if (!normalizedFinishId) {
    errors.push({
      code: "MISSING_NORMALIZED_FINISH",
      message: "Finish mapping is missing normalized finish ID.",
      variantId,
      mappingId,
    });
  } else if (!VALID_NORMALIZED_FINISH_RE.test(normalizedFinishId)) {
    errors.push({
      code: "INVALID_NORMALIZED_FINISH_ID",
      message: `normalizedFinishId must be controlled ID format (snake_case): ${normalizedFinishId}`,
      variantId,
      mappingId,
    });
  }

  errors.push(...validateFacets(mapping.facets, variantId, mappingId));
  return errors;
}

export function validateVariantForPublish(
  variant: Record<string, unknown>
): FinishValidationError[] {
  const variantId = asString(variant.id);
  if (!variantId) {
    return [
      {
        code: "MISSING_VARIANT_ID",
        message: "Variant is missing ID.",
      },
    ];
  }

  const mappings = parseMappingsFromVariant(variant);
  if (mappings.length === 0) {
    return [
      {
        code: "MISSING_FINISH_MAPPINGS",
        message: "Variant must have at least one finish mapping.",
        variantId,
      },
    ];
  }

  return mappings.flatMap((mapping) => validateMapping(mapping, variantId));
}

export function validateCatalogItemFinishMappings(variantsJson: unknown): FinishValidationError[] {
  const variants = parseVariantsFromJson(variantsJson);
  if (variants.length === 0) {
    return [
      {
        code: "MISSING_VARIANTS",
        message: "Catalog item must define at least one variant.",
      },
    ];
  }

  return variants.flatMap((variant) => validateVariantForPublish(variant));
}

export function isFinishMappingReady(variantsJson: unknown): boolean {
  return validateCatalogItemFinishMappings(variantsJson).length === 0;
}
