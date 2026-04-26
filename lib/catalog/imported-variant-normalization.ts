import type { ProductVariant } from "../catalog-schema";
import {
  hardenDuplicateImportedVariantLabels,
  inferCollectionType,
  inferMaterialTypeFromText,
  normalizeHyphenatedCode,
  normalizeUpholsteryCode,
  sentenceCaseLabel,
} from "./variant-normalization";

type ImportedRenderAssetsLike = {
  normal_map?: string;
  tile_scale?: { x?: number; y?: number };
};

export type ImportedUpholsteryOptionLike = {
  upholstery_code?: string;
  upholstery_label?: string;
  fabric_family?: string;
  fabric_label?: string;
  color_label?: string;
  collection_type?: string;
  texture_type?: string;
  swatch_group?: string;
  render_assets?: ImportedRenderAssetsLike;
};

export type ImportedVariantEntryLike = {
  variant?: string;
  finish_code?: string;
  finish_label?: string;
  model_asset_id?: string;
  model_url?: string;
  upholstery_code?: string;
  upholstery_label?: string;
  size_label?: string;
  dimensions?: {
    width_cm?: number;
    depth_cm?: number;
    height_cm?: number;
  };
  swatch_group?: string;
  swatch_hex?: string;
  color_family?: string;
  tone?: string;
  thumbnail_url?: string;
  thumbnailUrl?: string;
  gallery_images?: string[];
  galleryImages?: string[];
  materials?: Record<string, unknown>;
  finish?: Record<string, unknown>;
  collection_type?: string;
};

export type NormalizeImportedVariantsInput = {
  productId: string;
  variantEntries: ImportedVariantEntryLike[];
  sharedUpholsteryOptions?: ImportedUpholsteryOptionLike[];
  fallbackThumbnailUrl: string;
};

function textureTypeToFabricLabel(textureType: string | undefined): string | null {
  const normalized = (textureType ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "linen_slub_weave") return "Slub linen weave (navagio)";
  return sentenceCaseLabel(normalized.replace(/_/g, " "));
}

function fabricFamilyToFabricLabel(fabricFamily: string | undefined): string | null {
  const normalized = (fabricFamily ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "twill" || normalized === "twill_performance") return "Twill";
  return sentenceCaseLabel(normalized.replace(/_/g, " "));
}

function deriveImportedFabricType(label: string, textureType: string | undefined): string | null {
  const fromTexture = textureTypeToFabricLabel(textureType);
  if (fromTexture) return fromTexture;

  const match = label.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (!match) return null;

  const base = match[1]?.trim() ?? "";
  const inner = match[2]?.trim() ?? "";
  if (/(weave|fabric|linen|boucle|chenille|velvet|leather|suede|cotton|wool)/i.test(base)) {
    return sentenceCaseLabel(base);
  }
  if (/(weave|fabric|linen|boucle|chenille|velvet|leather|suede|cotton|wool)/i.test(inner)) {
    return sentenceCaseLabel(inner);
  }
  return null;
}

function upholsteryStructureToMaterialLabel(structure: string | undefined): string | null {
  const normalized = (structure ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("leather")) return "Leather";
  if (normalized.includes("fabric")) return "Fabric";
  return sentenceCaseLabel(normalized.replace(/_/g, " "));
}

function deriveImportedColourLabel(label: string, fabricType: string | null): string {
  const looksLikeColourWord = (value: string): boolean => {
    const lower = value.trim().toLowerCase();
    return /(beige|cream|ivory|white|black|grey|gray|brown|tan|taupe|sand|stone|green|blue|navy|red|rust|pink|rose|yellow|gold)/.test(lower);
  };

  const trimmed = label.trim();
  if (!trimmed) return label;

  const match = trimmed.match(/^(.+?)\s*\(([^)]+)\)$/);
  if (!match) {
    return looksLikeColourWord(trimmed) ? sentenceCaseLabel(trimmed) : "";
  }

  const base = match[1]?.trim() ?? trimmed;
  const inner = match[2]?.trim() ?? "";
  if (fabricType && base.toLowerCase() === fabricType.toLowerCase()) {
    return looksLikeColourWord(inner) ? sentenceCaseLabel(inner || base) : "";
  }
  if (!looksLikeColourWord(base) && !looksLikeColourWord(inner)) {
    return "";
  }
  return `${sentenceCaseLabel(base)} (${sentenceCaseLabel(inner)})`;
}

function mapColorFromText(textLike: unknown): string {
  const text = String(textLike ?? "").toLowerCase();
  if (text.includes("charcoal") || text.includes("graphite")) return "#54575a";
  if (text.includes("slate")) return "#767b82";
  if (text.includes("smoke")) return "#8f9296";
  if (text.includes("moss") || text.includes("olive") || text.includes("sage")) return "#8a9276";
  if (text.includes("ginger") || text.includes("rust") || text.includes("terracotta")) return "#b8794a";
  if (text.includes("cumin") || text.includes("caramel")) return "#b88957";
  if (text.includes("indigo") || text.includes("navy")) return "#5f7aa3";
  if (text.includes("blue")) return "#6f88ad";
  if (text.includes("pearl") || text.includes("quartz")) return "#e9e7e2";
  if (text.includes("dove")) return "#a4a7ac";
  if (text.includes("stone")) return "#bdb4a5";
  if (text.includes("taupe")) return "#b6a995";
  if (text.includes("chestnut")) return "#8b6f47";
  if (text.includes("black")) return "#1f1f1f";
  if (text.includes("cream")) return "#e8e6df";
  if (text.includes("ivory")) return "#eeece6";
  if (text.includes("performance_dune") || text.includes("performance dune")) return "#ede8de";
  if (text.includes("fabric") || text.includes("dune")) return "#ede8de";
  if (text.includes("cocoa") || text.includes("cooca")) return "#ba8257";
  if (text.includes("dark_walnut") || text.includes("dark walnut")) return "#7a4b2d";
  if (text.includes("walnut")) return "#8a643f";
  if (text.includes("white_wash") || text.includes("white wash")) return "#d8d0c2";
  if (text.includes("travertine")) return "#c8b79f";
  if (text.includes("oak")) return "#b18a63";
  if (text.includes("brown")) return "#8a643f";
  if (text.includes("grey") || text.includes("gray")) return "#9c9c9c";
  if (text.includes("beige")) return "#d4cdc1";
  if (text.includes("white")) return "#efede8";
  return "#c4b8a7";
}

export function normalizeImportedVariants({
  productId,
  variantEntries,
  sharedUpholsteryOptions = [],
  fallbackThumbnailUrl,
}: NormalizeImportedVariantsInput): ProductVariant[] {
  const upholsteryOptionByCode = new Map(
    sharedUpholsteryOptions
      .map((option) => ({
        key: normalizeUpholsteryCode(String(option?.upholstery_code ?? "")),
        option,
      }))
      .filter((entry) => entry.key.length > 0)
      .map((entry) => [entry.key, entry.option])
  );

  const variantsHaveExplicitUpholsteryCode = variantEntries.some(
    (entry) => typeof entry?.upholstery_code === "string" && entry.upholstery_code.trim().length > 0
  );
  const variantEntriesForMapping =
    !variantsHaveExplicitUpholsteryCode && sharedUpholsteryOptions.length > 0 && variantEntries.length > 0
      ? variantEntries.flatMap((entry) =>
          sharedUpholsteryOptions
            .filter(
              (option) =>
                typeof option?.upholstery_code === "string" && option.upholstery_code.trim().length > 0
            )
            .map((option) => ({
              ...entry,
              upholstery_code: option.upholstery_code,
              upholstery_label: option.upholstery_label ?? entry.upholstery_label,
              collection_type: option.collection_type,
              swatch_group: entry.swatch_group ?? option.swatch_group,
            }))
        )
      : variantEntries;

  const mappedVariants = variantEntriesForMapping.map((entry, index) => {
    const entryAny = entry as Record<string, unknown>;
    const normalizedEntryUpholsteryCode = normalizeUpholsteryCode(String(entry.upholstery_code ?? ""));
    const rawVariantLabel = String(
      entry.upholstery_label ?? entry.variant ?? entry.finish_label ?? `Imported ${index + 1}`
    ).trim();
    const matchingUpholsteryOption =
      upholsteryOptionByCode.get(normalizedEntryUpholsteryCode) ??
      sharedUpholsteryOptions.find(
        (option) => normalizeUpholsteryCode(String(option?.upholstery_code ?? "")) === normalizedEntryUpholsteryCode
      );
    const collectionType = inferCollectionType(
      String((entryAny.collection_type as string | undefined) ?? matchingUpholsteryOption?.collection_type ?? ""),
      String(entry.upholstery_code ?? "")
    );
    const fullUpholsteryLabel = String(matchingUpholsteryOption?.upholstery_label ?? rawVariantLabel).trim();
    const commaIndex = fullUpholsteryLabel.indexOf(",");
    const explicitFinishLabel = commaIndex >= 0 ? fullUpholsteryLabel.slice(0, commaIndex).trim() : "";
    const explicitColourLabel = commaIndex >= 0 ? fullUpholsteryLabel.slice(commaIndex + 1).trim() : "";
    const fabricFamilyLabel = fabricFamilyToFabricLabel(matchingUpholsteryOption?.fabric_family);
    const fabricLabel = sentenceCaseLabel(String(matchingUpholsteryOption?.fabric_label ?? ""));
    const structuredMaterialLabel = upholsteryStructureToMaterialLabel(
      String(
        ((entryAny.materials as Record<string, unknown> | undefined)?.upholstery as Record<string, unknown> | undefined)
          ?.structure ?? ""
      )
    );
    const normalizedRawVariantLabel = rawVariantLabel.trim().toLowerCase();
    const normalizedStructuredColourLabel = String(matchingUpholsteryOption?.color_label ?? "")
      .trim()
      .toLowerCase();
    const normalizedFabricLabel = fabricLabel.trim().toLowerCase();
    const shouldUseFamilyOnlyLabel = Boolean(
      fabricFamilyLabel &&
        normalizedFabricLabel &&
        (normalizedFabricLabel === normalizedRawVariantLabel ||
          normalizedFabricLabel === normalizedStructuredColourLabel)
    );
    const fabricFromStructuredFields = fabricFamilyLabel
      ? shouldUseFamilyOnlyLabel
        ? fabricFamilyLabel
        : fabricLabel && fabricFamilyLabel !== fabricLabel
          ? `${fabricFamilyLabel} (${fabricLabel})`
          : fabricFamilyLabel
      : "";
    const upholsteryColourLabel = sentenceCaseLabel(String(matchingUpholsteryOption?.color_label ?? "").replace(/_/g, " "));
    const upholsteryCodeColourLabel = sentenceCaseLabel(
      String(entry.upholstery_code ?? "")
        .replace(/^performance[\s_-]*/i, "")
        .replace(/[_-]+/g, " ")
    );
    const finishLabel =
      explicitFinishLabel ||
      upholsteryColourLabel ||
      upholsteryCodeColourLabel ||
      fabricFromStructuredFields ||
      structuredMaterialLabel ||
      deriveImportedFabricType(rawVariantLabel, matchingUpholsteryOption?.texture_type) ||
      sentenceCaseLabel(rawVariantLabel);
    const inferredColourLabel = deriveImportedColourLabel(rawVariantLabel, finishLabel);
    const colourLabel =
      explicitColourLabel ||
      sentenceCaseLabel(String(matchingUpholsteryOption?.color_label ?? "").replace(/_/g, " ")) ||
      sentenceCaseLabel(String(((entryAny.finish as Record<string, unknown> | undefined)?.color_finish as string | undefined) ?? "").replace(/_/g, " ")) ||
      sentenceCaseLabel(String(entry.finish_label ?? "").replace(/_/g, " ")) ||
      inferredColourLabel ||
      sentenceCaseLabel(String(entry.color_family ?? entry.tone ?? "").replace(/_/g, " ")) ||
      sentenceCaseLabel(rawVariantLabel);
    const finishCode = normalizeHyphenatedCode(String(entry.upholstery_code ?? finishLabel)) || `${index + 1}`;
    const normalizedUpholsteryCode = normalizeHyphenatedCode(String(entry.upholstery_code ?? ""));
    const normalizedFinishCode = normalizeHyphenatedCode(String(entry.finish_code ?? colourLabel));
    const variantCode =
      [normalizedUpholsteryCode, normalizedFinishCode].filter(Boolean).join("__") ||
      normalizedUpholsteryCode ||
      normalizedFinishCode ||
      `${index + 1}`;
    const variantId = `imported-${productId}-${variantCode}`;
    const swatchHexCandidate = String((entryAny.swatch_hex as string | undefined) ?? "").trim();
    const isValidSwatchHex = /^#([0-9a-f]{6})$/i.test(swatchHexCandidate);
    const colorSource = [
      entry.finish_label,
      (entryAny.finish as Record<string, unknown> | undefined)?.color_finish as string | undefined,
      entry.finish_code,
      explicitColourLabel,
      matchingUpholsteryOption?.color_label,
      entry.color_family,
      entry.tone,
      entry.upholstery_label,
      entry.upholstery_code,
      finishLabel,
    ].find((value) => typeof value === "string" && value.trim().length > 0);
    const colorHex = isValidSwatchHex ? swatchHexCandidate : mapColorFromText(colorSource);
    const variantThumbnailUrl = String(
      (entryAny.thumbnail_url as string | undefined) ?? (entryAny.thumbnailUrl as string | undefined) ?? ""
    ).trim();
    const variantGalleryImages = [
      ...(((entryAny.gallery_images as string[] | undefined) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )),
      ...(((entryAny.galleryImages as string[] | undefined) ?? []).filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0
      )),
    ];
    const materialType =
      structuredMaterialLabel === "Leather" || structuredMaterialLabel === "Fabric"
        ? structuredMaterialLabel
        : inferMaterialTypeFromText(
            finishLabel,
            entry.finish_label,
            entry.upholstery_label,
            entry.upholstery_code,
            rawVariantLabel,
            matchingUpholsteryOption?.texture_type,
            matchingUpholsteryOption?.fabric_family
          );

    return {
      id: variantId,
      label: colourLabel,
      colorHex,
      dimensionsMm:
        Number(entry?.dimensions?.width_cm ?? 0) > 0 && Number(entry?.dimensions?.depth_cm ?? 0) > 0
          ? {
              w: Math.round(Number(entry.dimensions?.width_cm ?? 0) * 10),
              d: Math.round(Number(entry.dimensions?.depth_cm ?? 0) * 10),
              h: Math.round(
                Number(entry.dimensions?.height_cm ?? 0) > 0
                  ? Number(entry.dimensions?.height_cm ?? 0) * 10
                  : 0
              ),
            }
          : undefined,
      finishCode,
      finishLabel,
      materialType,
      swatchGroup: entry.swatch_group ?? matchingUpholsteryOption?.swatch_group,
      swatchHex: colorHex,
      collectionType,
      renderAssets: matchingUpholsteryOption?.render_assets
        ? {
            baseColorMap: undefined,
            normalMap: matchingUpholsteryOption.render_assets.normal_map,
            roughnessMap: undefined,
            tileScale: matchingUpholsteryOption.render_assets.tile_scale
              ? {
                  x: Math.max(0.75, Math.min(4, matchingUpholsteryOption.render_assets.tile_scale.x ?? 1)),
                  y: Math.max(0.75, Math.min(4, matchingUpholsteryOption.render_assets.tile_scale.y ?? 1)),
                }
              : undefined,
          }
        : undefined,
      thumbnailUrl: variantThumbnailUrl || fallbackThumbnailUrl,
      galleryImages: variantGalleryImages,
    } satisfies ProductVariant;
  });

  const dedupedIds = new Map<string, number>();
  const variantsWithUniqueIds = mappedVariants.map((variant) => {
    const count = (dedupedIds.get(variant.id) ?? 0) + 1;
    dedupedIds.set(variant.id, count);
    if (count === 1) return variant;
    return {
      ...variant,
      id: `${variant.id}--${count}`,
    };
  });

  return hardenDuplicateImportedVariantLabels(variantsWithUniqueIds);
}