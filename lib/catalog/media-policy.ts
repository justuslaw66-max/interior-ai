export type CatalogMediaFallbackSource =
  | "variant_specific"
  | "default_variant_same_item"
  | "item_gallery"
  | "item_thumb"
  | "none";

export type CatalogMediaSurface = "catalog_card" | "catalog_detail_gallery";

export type CatalogMediaPresentationPreset = {
  objectFitClass: "object-cover" | "object-contain";
  objectPositionClass: string;
  imageTransformClass?: string;
  minGalleryImages: number;
  minLifestyleImages: number;
};

export const CATALOG_MEDIA_FALLBACK_POLICY_MATRIX: Array<{
  order: number;
  source: Exclude<CatalogMediaFallbackSource, "none">;
  description: string;
}> = [
  {
    order: 1,
    source: "variant_specific",
    description: "Use requested variant thumb plus variant gallery images when available.",
  },
  {
    order: 2,
    source: "default_variant_same_item",
    description: "Fallback to the item default variant media if requested variant lacks gallery coverage.",
  },
  {
    order: 3,
    source: "item_gallery",
    description: "Fallback to item-level metadata gallery when variant-level media is sparse.",
  },
  {
    order: 4,
    source: "item_thumb",
    description: "Final safety fallback to item thumbnail only.",
  },
];

export const CATALOG_MEDIA_PRESENTATION_PRESETS: Record<CatalogMediaSurface, CatalogMediaPresentationPreset> = {
  catalog_card: {
    objectFitClass: "object-cover",
    objectPositionClass: "object-[50%_44%]",
    imageTransformClass: "",
    minGalleryImages: 1,
    minLifestyleImages: 0,
  },
  catalog_detail_gallery: {
    objectFitClass: "object-cover",
    objectPositionClass: "object-center",
    imageTransformClass: "scale-125",
    minGalleryImages: 4,
    minLifestyleImages: 1,
  },
};

export function getCatalogMediaImageClass(surface: CatalogMediaSurface): string {
  const preset = CATALOG_MEDIA_PRESENTATION_PRESETS[surface];
  return `h-full w-full ${preset.objectFitClass} ${preset.objectPositionClass} ${preset.imageTransformClass ?? ""}`.trim();
}
