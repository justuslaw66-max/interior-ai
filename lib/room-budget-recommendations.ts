import type { CatalogItemSchema } from "@/lib/catalog-schema";
import { getItemPrice } from "@/lib/design-page-utils";
import {
  mapToTopCategory,
  type CatalogTopCategory,
} from "@/lib/catalog/view-builders";

export interface RoomBudgetRecommendation {
  productId: string;
  variantId: string;
  title: string;
  category: CatalogTopCategory;
  price: number;
  priceLabel: string;
  reason: string;
  overBudget: boolean;
  remainingAfterAdd: number;
  score: number;
}

export interface BuildRoomBudgetRecommendationsParams {
  catalogItems: CatalogItemSchema[];
  currentSubtotal: number;
  budgetTarget: number;
  categoryCounts: Partial<Record<CatalogTopCategory, number>>;
  recommendedCategories: CatalogTopCategory[];
  nextActionCategories?: CatalogTopCategory[];
  roomWidth?: number;
  roomDepth?: number;
  activeStyle?: string;
  productQuantities?: Record<string, number>;
  limit?: number;
}

function formatFallbackMoney(value: number): string {
  return new Intl.NumberFormat("en-SG", {
    style: "currency",
    currency: "SGD",
    maximumFractionDigits: 0,
  }).format(value);
}

function categoryNeedRank(
  category: CatalogTopCategory,
  categoryCounts: Partial<Record<CatalogTopCategory, number>>,
  recommendedCategories: CatalogTopCategory[],
  nextActionCategories: CatalogTopCategory[]
): number {
  if ((categoryCounts[category] ?? 0) > 0) return 0;
  const nextIndex = nextActionCategories.indexOf(category);
  if (nextIndex >= 0) return 12 - nextIndex * 2;
  const recommendedIndex = recommendedCategories.indexOf(category);
  if (recommendedIndex >= 0) return 8 - recommendedIndex;
  return 0;
}

function fitsRoom(item: CatalogItemSchema, roomWidth?: number, roomDepth?: number): boolean {
  if (!roomWidth || !roomDepth) return true;
  const widthM = item.dimsMm.w / 1000;
  const depthM = item.dimsMm.d / 1000;
  const usableWidth = Math.max(0.5, roomWidth - 0.45);
  const usableDepth = Math.max(0.5, roomDepth - 0.45);
  return (
    (widthM <= usableWidth && depthM <= usableDepth) ||
    (depthM <= usableWidth && widthM <= usableDepth)
  );
}

function getRecommendationReason(
  category: CatalogTopCategory,
  price: number,
  remaining: number,
  needScore: number,
  styleMatched: boolean
): string {
  if (needScore > 0 && price <= remaining) return "fills a missing room essential";
  if (styleMatched && price <= remaining) return "matches the room style";
  if (price <= remaining) return "fits the remaining budget";
  return "closest useful option";
}

export function buildRoomBudgetRecommendations({
  catalogItems,
  currentSubtotal,
  budgetTarget,
  categoryCounts,
  recommendedCategories,
  nextActionCategories = [],
  roomWidth,
  roomDepth,
  activeStyle,
  productQuantities = {},
  limit = 3,
}: BuildRoomBudgetRecommendationsParams): RoomBudgetRecommendation[] {
  const remaining = Math.max(0, budgetTarget - currentSubtotal);
  const styleNorm = String(activeStyle ?? "").trim().toLowerCase();

  return catalogItems
    .map((item) => {
      const category = mapToTopCategory(item.category, item);
      const needScore = categoryNeedRank(category, categoryCounts, recommendedCategories, nextActionCategories);
      const price = getItemPrice(item);
      const priceKnown = price > 0;
      const overBudget = priceKnown && price > remaining;
      const styleMatched = Boolean(
        styleNorm && item.styleTags?.some((tag) => String(tag).toLowerCase() === styleNorm)
      );
      let score = 0;

      score += needScore * 10;
      if (priceKnown && price <= remaining) score += 25;
      if (priceKnown && overBudget) score -= Math.min(18, Math.ceil((price - remaining) / 250));
      if (styleMatched) score += 7;
      if (fitsRoom(item, roomWidth, roomDepth)) score += 6;
      if ((productQuantities[item.id] ?? 0) > 0) score -= 16;
      if (recommendedCategories.includes(category)) score += 3;

      return {
        productId: item.id,
        variantId: item.defaultVariantId,
        title: item.title,
        category,
        price,
        priceLabel: priceKnown ? formatFallbackMoney(price) : "Price check",
        reason: getRecommendationReason(category, price, remaining, needScore, styleMatched),
        overBudget,
        remainingAfterAdd: priceKnown ? remaining - price : remaining,
        score,
      };
    })
    .filter((entry) => entry.score > 0 && (productQuantities[entry.productId] ?? 0) === 0)
    .sort((first, second) => {
      if (first.overBudget !== second.overBudget) return first.overBudget ? 1 : -1;
      return second.score - first.score;
    })
    .slice(0, limit);
}
