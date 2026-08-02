import type { CatalogItemSchema } from "@/lib/catalog-schema";

type CatalogVariantColorInput = Pick<
  CatalogItemSchema["variants"][number],
  "colorHex" | "swatchHex" | "modelUrl"
>;

export type VariantTintProductInput = {
  id?: string;
  variants: CatalogVariantColorInput[];
};

export function normalizeVariantColorHex(value: string | null | undefined): string | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(normalized) ? normalized : null;
}

export function hasMultipleDistinctVariantColors(product: VariantTintProductInput): boolean {
  const colors = new Set(
    product.variants
      .map((variant) => normalizeVariantColorHex(variant.swatchHex ?? variant.colorHex))
      .filter((value): value is string => Boolean(value)),
  );

  return colors.size > 1;
}

export function shouldApplyVariantColorTint(
  product: VariantTintProductInput,
  activeVariant: CatalogVariantColorInput | null | undefined,
): boolean {
  const hasDistinctColors = hasMultipleDistinctVariantColors(product);
  if (!hasDistinctColors) return false;

  // Owen's supplied Natural/Walnut GLBs share baked Pearl Beige upholstery.
  // Opal Beige and Haze intentionally have dedicated catalog asset paths for
  // each wood/orientation combination, but still require the height-masked
  // runtime upholstery tint to produce their authored fabric colour.
  if (/^(?:sofa|armchair)-real-castlery-owen-/i.test(String(product.id ?? ""))) {
    return true;
  }

  if (activeVariant?.modelUrl) {
    const distinctModelUrls = new Set(
      product.variants
        .map((variant) => String(variant.modelUrl ?? "").trim())
        .filter(Boolean),
    );

    // A single GLB reused by multiple colour variants is base geometry, not a
    // baked colour-specific asset. Hamilton is authored this way: every fabric
    // option points at the same Brilliant White model and requires runtime tint.
    if (distinctModelUrls.size <= 1) return true;

    return false;
  }
  return true;
}
