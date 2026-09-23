import type { CatalogItemSchema, ProductVariant } from "@/lib/catalog-schema";

export type EquivalentVariantRule =
  | "variant-id"
  | "finish-and-leg"
  | "finish-code"
  | "material-type"
  | "variant-label"
  | "finish-label";

export type EquivalentVariantRuleOrder = readonly EquivalentVariantRule[];

export const EQUIVALENT_VARIANT_RULE_ORDERS = {
  family: ["finish-code", "material-type", "variant-label"],
  orientation: ["finish-and-leg", "finish-code", "variant-label"],
  modelWithLeg: ["variant-id", "finish-and-leg", "finish-code", "finish-label"],
  model: ["variant-id", "finish-code", "finish-label"],
  finishOnly: ["finish-code"],
} as const satisfies Record<string, EquivalentVariantRuleOrder>;

type VariantCollection = Pick<CatalogItemSchema, "variants">;

interface ResolveEquivalentVariantOptions {
  sourceProduct: VariantCollection;
  sourceVariantId?: string | null;
  targetProduct: VariantCollection;
  ruleOrder: EquivalentVariantRuleOrder;
}

function normalizeVariantValue(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function resolveEquivalentVariant({
  sourceProduct,
  sourceVariantId,
  targetProduct,
  ruleOrder,
}: ResolveEquivalentVariantOptions): ProductVariant | undefined {
  const targetVariants = targetProduct.variants;
  if (targetVariants.length === 0) return undefined;

  const sourceVariant = sourceProduct.variants.find(
    (variant) => variant.id === sourceVariantId,
  );
  const sourceFinishCode = normalizeVariantValue(sourceVariant?.finishCode);
  const sourceLegFinishCode = normalizeVariantValue(sourceVariant?.legFinishCode);
  const sourceMaterialType = normalizeVariantValue(sourceVariant?.materialType);
  const sourceLabel = normalizeVariantValue(sourceVariant?.label);
  const sourceFinishLabel = normalizeVariantValue(
    sourceVariant?.finishLabel ?? sourceVariant?.label,
  );

  for (const rule of ruleOrder) {
    let match: ProductVariant | undefined;

    switch (rule) {
      case "variant-id":
        match = targetVariants.find((variant) => variant.id === sourceVariantId);
        break;
      case "finish-and-leg":
        if (sourceFinishCode && sourceLegFinishCode) {
          match = targetVariants.find(
            (variant) =>
              normalizeVariantValue(variant.finishCode) === sourceFinishCode &&
              normalizeVariantValue(variant.legFinishCode) === sourceLegFinishCode,
          );
        }
        break;
      case "finish-code":
        if (sourceFinishCode) {
          match = targetVariants.find(
            (variant) =>
              normalizeVariantValue(variant.finishCode) === sourceFinishCode,
          );
        }
        break;
      case "material-type":
        if (sourceMaterialType) {
          match = targetVariants.find(
            (variant) =>
              normalizeVariantValue(variant.materialType) === sourceMaterialType,
          );
        }
        break;
      case "variant-label":
        match = targetVariants.find(
          (variant) => normalizeVariantValue(variant.label) === sourceLabel,
        );
        break;
      case "finish-label":
        if (sourceFinishLabel) {
          match = targetVariants.find(
            (variant) =>
              normalizeVariantValue(variant.finishLabel ?? variant.label) ===
              sourceFinishLabel,
          );
        }
        break;
    }

    if (match) return match;
  }

  return targetVariants[0];
}
