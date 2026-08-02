export type CatalogMediaFallbackSource =
  | "variant_specific"
  | "default_variant_same_item"
  | "item_gallery"
  | "item_thumb"
  | "none";

export type CatalogMediaSurface = "catalog_card" | "catalog_detail_gallery";
export type CatalogMediaPresentationMode = "studio" | "lifestyle" | "transparent" | "swatch";

const CATALOG_MEDIA_PRESENTATION_MODES = new Set<string>([
  "studio",
  "lifestyle",
  "transparent",
  "swatch",
]);

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
    objectFitClass: "object-contain",
    objectPositionClass: "object-center",
    imageTransformClass: "",
    minGalleryImages: 4,
    minLifestyleImages: 1,
  },
};

export function getCatalogMediaImageClass(surface: CatalogMediaSurface): string {
  const preset = CATALOG_MEDIA_PRESENTATION_PRESETS[surface];
  return `h-full w-full ${preset.objectFitClass} ${preset.objectPositionClass} ${preset.imageTransformClass ?? ""}`.trim();
}

export function normalizeCatalogMediaPresentationMode(
  value: unknown,
): CatalogMediaPresentationMode | undefined {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return CATALOG_MEDIA_PRESENTATION_MODES.has(normalized)
    ? (normalized as CatalogMediaPresentationMode)
    : undefined;
}

function normalizedMediaUrl(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Detects an explicitly authored front-facing product image from its URL.
 * Retailer CDNs commonly encode the view in the filename, while some importers
 * supply it as a query parameter.
 */
export function isLikelyFrontShotImage(value: unknown): boolean {
  const raw = normalizedMediaUrl(value);
  if (!raw) return false;

  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Keep the original URL when malformed percent encoding is encountered.
  }

  if (/[?&](?:view|shot|angle|orientation)=front(?:[&#]|$)/i.test(decoded)) {
    return true;
  }

  const pathname = decoded.split(/[?#]/, 1)[0] ?? decoded;
  const filename = pathname.slice(pathname.lastIndexOf("/") + 1);
  return /(?:^|[\s._-])front(?:[\s._-]+(?:view|shot|facing))?(?:[\s._-]|$)/i.test(filename);
}

/**
 * Selects a front shot when one is available, otherwise preserves the authored
 * thumbnail and finally falls back to the first usable gallery image.
 */
export function selectPreferredCatalogThumbnail({
  thumbnailUrl,
  galleryImages = [],
}: {
  thumbnailUrl?: unknown;
  galleryImages?: unknown[];
}): string | undefined {
  const authoredThumbnail = normalizedMediaUrl(thumbnailUrl);
  const candidates = [authoredThumbnail, ...galleryImages.map(normalizedMediaUrl)].filter(Boolean);
  const uniqueCandidates = Array.from(new Set(candidates));

  return uniqueCandidates.find(isLikelyFrontShotImage) ?? (authoredThumbnail || uniqueCandidates[0] || undefined);
}

export function inferCatalogMediaPresentationMode({
  imageUrls,
  brand,
  category,
}: {
  imageUrls: string[];
  brand?: string | null;
  category?: string | null;
}): CatalogMediaPresentationMode {
  const urls = imageUrls.map((url) => String(url ?? "").trim()).filter(Boolean);
  const firstUrl = urls[0] ?? "";
  const firstLower = firstUrl.toLowerCase();
  const allLower = urls.join(" ").toLowerCase();
  const brandLower = String(brand ?? "").toLowerCase();
  const categoryLower = String(category ?? "").toLowerCase();

  if (/(?:swatch|materials|closeup|close-up|det_\d|det-\d|detail)/i.test(firstLower)) {
    return "swatch";
  }

  if (/\.(?:png|webp)(?:$|\?)/i.test(firstLower) || /b_rgb:fff(?:fff)?/i.test(firstLower)) {
    return "transparent";
  }

  if (/(?:lifestyle|room|set[_-]?\d|square[_-]?set|styled|scene)/i.test(firstLower)) {
    return "lifestyle";
  }

  if (
    brandLower.includes("castlery") ||
    firstLower.includes("res.cloudinary.com/castlery/") ||
    allLower.includes("crusader/variants/")
  ) {
    return "studio";
  }

  if (/(?:sofa|armchair|chair|table|console|bench|ottoman|sideboard)/i.test(categoryLower)) {
    return "studio";
  }

  return "studio";
}
