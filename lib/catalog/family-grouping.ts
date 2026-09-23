import type { CatalogItemSchema } from "../catalog-schema";

export type CatalogFamilyGroup = {
  key: string;
  representative: CatalogItemSchema;
  items: CatalogItemSchema[];
  displayTitle: string;
};

function normalizedProductPath(item: CatalogItemSchema): string | null {
  if (item.commerce.type !== "affiliate") return null;
  const rawUrl = item.commerce.data.url?.trim();
  if (!rawUrl) return null;

  try {
    const url = new URL(rawUrl);
    const path = url.pathname.replace(/\/+$/, "").toLowerCase();
    return path.includes("/products/") ? `${url.hostname.toLowerCase()}${path}` : null;
  } catch {
    return null;
  }
}

export function cleanCatalogFamilyTitle(value: string): string {
  return value
    .replace(/\s*\((?:left|right)(?:[- ]hand)?\s+facing\)\s*/gi, " ")
    .replace(/\b(?:left|right)(?:[- ]hand)?\s+facing\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,;:])/g, "$1")
    .trim();
}

function normalizedTitleKey(item: CatalogItemSchema): string {
  return cleanCatalogFamilyTitle(item.metadata?.productName ?? item.title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function getCatalogFamilyKey(item: CatalogItemSchema): string {
  const productPath = normalizedProductPath(item);
  if (productPath) return `${item.category}:url:${productPath}`;

  const brand = (item.metadata?.brand ?? "").toLowerCase().trim();
  return `${item.category}:title:${brand}:${normalizedTitleKey(item)}`;
}

function representativeScore(item: CatalogItemSchema): number {
  const title = item.metadata?.productName ?? item.title;
  let score = 0;
  if (/right(?:[- ]hand)?\s+facing/i.test(title)) score += 4;
  if (!/left(?:[- ]hand)?\s+facing/i.test(title)) score += 2;
  if (/^https?:\/\//i.test(item.assets.thumbUrl)) score += 1;
  return score;
}

export function groupCatalogItems(items: CatalogItemSchema[]): CatalogFamilyGroup[] {
  const groups = new Map<string, CatalogItemSchema[]>();

  for (const item of items) {
    const key = getCatalogFamilyKey(item);
    const group = groups.get(key);
    if (group) group.push(item);
    else groups.set(key, [item]);
  }

  return Array.from(groups, ([key, familyItems]) => {
    const representative = [...familyItems].sort(
      (a, b) => representativeScore(b) - representativeScore(a),
    )[0];
    return {
      key,
      representative,
      items: familyItems,
      displayTitle: cleanCatalogFamilyTitle(
        representative.metadata?.productName ?? representative.title,
      ),
    };
  });
}

export function getCatalogConfigurationLabel(item: CatalogItemSchema): string {
  const title = item.metadata?.productName ?? item.title;
  const orientation = title.match(/\b(left|right)(?:[- ]hand)?\s+facing\b/i);
  if (orientation) return `${orientation[1][0].toUpperCase()}${orientation[1].slice(1).toLowerCase()} facing`;

  const size = title.match(/\b(\d+(?:\.\d+)?)\s*cm\b/i);
  if (size) return `${size[1]} cm`;

  const modelLabel = item.metadata?.modelLabel?.trim();
  if (modelLabel && !/^standard$/i.test(modelLabel)) return modelLabel;

  const cleanedTitle = cleanCatalogFamilyTitle(title);
  if (cleanedTitle) return cleanedTitle;

  return `${Math.round(item.dimsMm.w / 10)} × ${Math.round(item.dimsMm.d / 10)} cm`;
}
