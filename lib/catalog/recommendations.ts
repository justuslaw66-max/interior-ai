import { CATALOG_ITEMS } from "../catalog";
import type { CatalogItemSchema } from "../catalog-schema";
import { deriveSeatCount, getWidthBand } from "./view-builders";

type ScoredItem = {
  item: CatalogItemSchema;
  score: number;
};

function overlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  let overlap = 0;
  for (const value of b) {
    if (setA.has(value)) overlap += 1;
  }
  return overlap / Math.max(a.length, b.length);
}

function dimsDistance(a: CatalogItemSchema, b: CatalogItemSchema): number {
  const dw = Math.abs(a.dimsMm.w - b.dimsMm.w) / 1000;
  const dd = Math.abs(a.dimsMm.d - b.dimsMm.d) / 1000;
  const dh = Math.abs(a.dimsMm.h - b.dimsMm.h) / 1000;
  return dw + dd * 0.8 + dh * 0.4;
}

function getPrice(item: CatalogItemSchema): number | null {
  if (item.commerce.type === "affiliate") return item.commerce.data.priceHint ?? null;
  return null;
}

function baseSimilarity(target: CatalogItemSchema, candidate: CatalogItemSchema): number {
  if (target.id === candidate.id) return -1;

  let score = 0;
  if (target.category === candidate.category) score += 8;
  score += overlapScore(target.styleTags, candidate.styleTags) * 5;

  const targetFinish = target.variants.map((v) => v.label.toLowerCase());
  const candidateFinish = candidate.variants.map((v) => v.label.toLowerCase());
  score += overlapScore(targetFinish, candidateFinish) * 3;

  const distance = dimsDistance(target, candidate);
  score += Math.max(0, 4 - distance);

  if (target.metadata?.brand && target.metadata.brand === candidate.metadata?.brand) score += 1;
  if (getWidthBand(target) === getWidthBand(candidate)) score += 1.5;
  if (deriveSeatCount(target) && deriveSeatCount(target) === deriveSeatCount(candidate)) score += 1.5;

  return score;
}

function topIds(scored: ScoredItem[], limit = 6): string[] {
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.item.id);
}

export function getSimilarItems(itemId: string): string[] {
  const target = CATALOG_ITEMS[itemId];
  if (!target) return [];

  const scored: ScoredItem[] = Object.values(CATALOG_ITEMS)
    .map((candidate) => ({ item: candidate, score: baseSimilarity(target, candidate) }))
    .filter((entry) => entry.score > 0);

  return topIds(scored, 6);
}

export function getCheaperAlternatives(itemId: string): string[] {
  const target = CATALOG_ITEMS[itemId];
  if (!target) return [];

  const targetPrice = getPrice(target);
  const scored: ScoredItem[] = Object.values(CATALOG_ITEMS)
    .filter((candidate) => candidate.category === target.category && candidate.id !== target.id)
    .map((candidate) => {
      const base = baseSimilarity(target, candidate);
      const candidatePrice = getPrice(candidate);
      let priceBoost = 0;
      if (targetPrice != null && candidatePrice != null && candidatePrice < targetPrice) {
        priceBoost = 2;
      }
      return { item: candidate, score: base + priceBoost };
    })
    .filter((entry) => entry.score > 0);

  return topIds(scored, 4);
}

export function getPremiumAlternatives(itemId: string): string[] {
  const target = CATALOG_ITEMS[itemId];
  if (!target) return [];

  const targetPrice = getPrice(target);
  const scored: ScoredItem[] = Object.values(CATALOG_ITEMS)
    .filter((candidate) => candidate.category === target.category && candidate.id !== target.id)
    .map((candidate) => {
      const base = baseSimilarity(target, candidate);
      const candidatePrice = getPrice(candidate);
      let priceBoost = 0;
      if (targetPrice != null && candidatePrice != null && candidatePrice > targetPrice) {
        priceBoost = 2;
      }
      return { item: candidate, score: base + priceBoost };
    })
    .filter((entry) => entry.score > 0);

  return topIds(scored, 4);
}

export function getCoordinationSuggestions(itemId: string): string[] {
  const target = CATALOG_ITEMS[itemId];
  if (!target) return [];

  const targetFinish = target.variants.map((variant) => variant.label.toLowerCase());
  const scored: ScoredItem[] = Object.values(CATALOG_ITEMS)
    .filter((candidate) => candidate.id !== target.id)
    .map((candidate) => {
      let score = overlapScore(targetFinish, candidate.variants.map((variant) => variant.label.toLowerCase())) * 5;
      score += overlapScore(target.roomTags, candidate.roomTags) * 3;
      if (target.category !== candidate.category) score += 1;
      return { item: candidate, score };
    })
    .filter((entry) => entry.score > 0);

  return topIds(scored, 5);
}

export function buildCatalogRecommendationSet(itemId: string) {
  return {
    similar: getSimilarItems(itemId),
    cheaper: getCheaperAlternatives(itemId),
    premium: getPremiumAlternatives(itemId),
    coordination: getCoordinationSuggestions(itemId),
  };
}
