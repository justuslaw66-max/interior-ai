import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "../lib/catalog";
import {
  collectFilterFacets,
  filterCatalogItems,
  mapToTopCategory,
} from "../lib/catalog/view-builders";
import {
  buildCatalogRecommendationSet,
  getSimilarItems,
} from "../lib/catalog/recommendations";

function run(): void {
  const items = Object.values(CATALOG_ITEMS);
  assert(items.length > 0, "Expected catalog to contain at least one item");

  const target = items[0];
  const topCategory = mapToTopCategory(target.category);
  const categoryFiltered = filterCatalogItems(items, "", { category: [topCategory] });
  assert(
    categoryFiltered.every((item) => mapToTopCategory(item.category) === topCategory),
    "Category filter returned item outside selected top category",
  );

  const searchToken = target.title.split(" ")[0]?.toLowerCase() ?? "";
  if (searchToken) {
    const searched = filterCatalogItems(items, searchToken, {});
    assert(
      searched.some((item) => item.id === target.id),
      "Search filter did not include expected target item",
    );
  }

  const priced = items.find(
    (item) => item.commerce.type === "affiliate" && typeof item.commerce.data.priceHint === "number",
  );
  if (priced && priced.commerce.type === "affiliate") {
    const price = priced.commerce.data.priceHint ?? 0;
    const withinRange = filterCatalogItems(items, "", {
      priceMin: Math.max(0, price - 1),
      priceMax: price + 1,
    });
    assert(
      withinRange.some((item) => item.id === priced.id),
      "Price range filter did not include known priced item",
    );

    const combined = filterCatalogItems(items, priced.title.split(" ")[0]?.toLowerCase() ?? "", {
      category: [mapToTopCategory(priced.category)],
      priceMin: Math.max(0, price - 1),
      priceMax: price + 1,
    });
    assert(
      combined.some((item) => item.id === priced.id),
      "Combined search + category + price filters dropped expected item",
    );
  }

  const facets = collectFilterFacets(items);
  const sortedBrands = [...facets.brands].sort((a, b) => a.localeCompare(b));
  assert.deepEqual(facets.brands, sortedBrands, "Brand facets must be sorted");

  const similar = getSimilarItems(target.id);
  assert(similar.length <= 6, "Similar items list exceeded expected limit");
  assert(!similar.includes(target.id), "Similar items should never include the target item");

  const recommendations = buildCatalogRecommendationSet(target.id);
  const allBuckets = [
    recommendations.similar,
    recommendations.cheaper,
    recommendations.premium,
    recommendations.coordination,
  ];
  for (const bucket of allBuckets) {
    assert(!bucket.includes(target.id), "Recommendation bucket should never include the target item");
  }

  console.log("Catalog panel logic checks passed");
}

run();
