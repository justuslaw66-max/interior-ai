import type { ProductVariant } from "../catalog-schema";

export const IMPORTED_VARIANT_PIPELINE_REVISION = "2026-04-26-shared-imported-variant-normalizer-v3";

const KNOWN_STOCKED_CODES = [
  "beach_linen",
  "navagio_seagull",
  "marche_cocoa",
  "marche_ivory",
  "performance_arvo_dune",
] as const;

export const KNOWN_STOCKED_UPHOLSTERY_CODES = new Set<string>(KNOWN_STOCKED_CODES);

export function sentenceCaseLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function normalizeLabelToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeVariantCode(value: string): string {
  return value
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeHyphenatedCode(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeUpholsteryCode(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/-/g, "_")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function inferMaterialTypeFromText(
  ...values: Array<string | null | undefined>
): "Fabric" | "Leather" {
  const normalized = values
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join(" ");
  if (normalized.includes("leather")) return "Leather";
  if (
    normalized.includes("fabric") ||
    normalized.includes("linen") ||
    normalized.includes("boucle") ||
    normalized.includes("weave") ||
    normalized.includes("fleece") ||
    normalized.includes("velvet") ||
    normalized.includes("chenille")
  ) {
    return "Fabric";
  }
  return "Fabric";
}

export function normalizeVariantQualifier(raw: string): string {
  const source = raw.trim();
  if (!source) return "";
  const lower = source.toLowerCase();
  if (/(performance\s+fleece.*peyton|peyton.*fleece)/.test(lower)) return "Peyton Fleece";
  if (/performance\s+infinity\s+boucle|infinity\s+boucle/.test(lower)) return "Infinity Boucle";
  if (/washed\s+chenille|greta/.test(lower)) return "Washed Chenille";
  if (/performance\s+twill/.test(lower)) return "Performance Twill";
  if (/performance\s+linen\s+weave|genova/.test(lower)) return "Genova";
  if (/slub\s+linen\s+weave|navagio/.test(lower)) return "Navagio";
  if (/\bleather\b/.test(lower)) return "Leather";

  return source
    .replace(/^performance\s+/i, "")
    .replace(/\(([^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function deriveVariantDisambiguator(
  variant: Pick<ProductVariant, "id" | "label" | "finishLabel" | "finishCode">
): string {
  const candidates = [variant.finishLabel, variant.label, variant.finishCode, variant.id]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);

  for (const raw of candidates) {
    const commaIndex = raw.indexOf(",");
    const familyCandidate = commaIndex >= 0 ? raw.slice(0, commaIndex).trim() : raw;
    const qualifier = normalizeVariantQualifier(familyCandidate);
    if (!qualifier) continue;
    if (normalizeLabelToken(qualifier) === normalizeLabelToken(variant.label)) continue;
    return qualifier;
  }

  return "";
}

export function hardenDuplicateImportedVariantLabels<
  T extends { id: string; label: string; finishLabel?: string; finishCode?: string; dimensionsMm?: { w: number; d: number } }
>(variants: T[]): T[] {
  const labelCounts = new Map<string, number>();
  for (const variant of variants) {
    const key = normalizeLabelToken(variant.label);
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  const withPrimaryQualifiers = variants.map((variant) => {
    const key = normalizeLabelToken(variant.label);
    const isDuplicateLabel = (labelCounts.get(key) ?? 0) > 1;
    if (!isDuplicateLabel) return variant;

    const qualifierParts = [deriveVariantDisambiguator(variant)];
    if (variant.dimensionsMm?.w && variant.dimensionsMm?.d) {
      qualifierParts.push(`${variant.dimensionsMm.w}x${variant.dimensionsMm.d}`);
    }
    const qualifier = qualifierParts.filter(Boolean).join(" ");
    if (!qualifier) return variant;
    if (new RegExp(`\\(${qualifier.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\)$`, "i").test(variant.label)) {
      return variant;
    }

    return {
      ...variant,
      label: `${variant.label} (${qualifier})`,
    };
  });

  const hardenedCounts = new Map<string, number>();
  for (const variant of withPrimaryQualifiers) {
    const key = normalizeLabelToken(variant.label);
    hardenedCounts.set(key, (hardenedCounts.get(key) ?? 0) + 1);
  }

  return withPrimaryQualifiers.map((variant) => {
    const key = normalizeLabelToken(variant.label);
    if ((hardenedCounts.get(key) ?? 0) <= 1) return variant;

    if (/\([^)]*\)$/.test(variant.label) && variant.label.includes(variant.id)) return variant;

    return {
      ...variant,
      label: `${variant.label} (${variant.id})`,
    };
  });
}

export function hardenDuplicateFinishOptionLabels(
  options: Array<{
    id: string;
    label: string;
    swatchHex?: string;
    materialType: "Fabric" | "Leather";
    collectionType?: string;
    finishCode?: string;
    qualifier: string;
  }>
): Array<{
  id: string;
  label: string;
  swatchHex?: string;
  materialType: "Fabric" | "Leather";
  collectionType?: string;
  finishCode?: string;
}> {
  const labelCounts = new Map<string, number>();
  for (const option of options) {
    const key = normalizeLabelToken(option.label);
    labelCounts.set(key, (labelCounts.get(key) ?? 0) + 1);
  }

  return options.map((option) => {
    const key = normalizeLabelToken(option.label);
    const isDuplicate = (labelCounts.get(key) ?? 0) > 1;
    const base = {
      id: option.id,
      label: option.label,
      swatchHex: option.swatchHex,
      materialType: option.materialType,
      collectionType: option.collectionType,
      finishCode: option.finishCode,
    };
    if (!isDuplicate || !option.qualifier) return base;

    if (new RegExp(`\\(${option.qualifier.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}\\)$`, "i").test(option.label)) {
      return base;
    }

    return {
      ...base,
      label: `${option.label} (${option.qualifier})`,
    };
  });
}

export function inferCollectionType(
  explicitCollectionType?: string | null,
  upholsteryCode?: string | null
): "stocked" | "custom" | undefined {
  const explicit = String(explicitCollectionType ?? "").trim().toLowerCase();
  if (explicit === "stocked" || explicit === "custom") return explicit;

  const normalizedCode = normalizeUpholsteryCode(String(upholsteryCode ?? ""));
  if (!normalizedCode) return undefined;
  return KNOWN_STOCKED_UPHOLSTERY_CODES.has(normalizedCode) ? "stocked" : "custom";
}

export function shouldShowCollectionGrouping(
  collectionTypes: Array<string | null | undefined>
): boolean {
  const normalized = new Set(
    collectionTypes
      .map((value) => String(value ?? "").trim().toLowerCase())
      .filter((value): value is "stocked" | "custom" => value === "stocked" || value === "custom")
  );

  return normalized.has("stocked") && normalized.has("custom");
}