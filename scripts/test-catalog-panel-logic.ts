import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "../lib/catalog";
import {
  collectFilterFacets,
  filterCatalogItems,
  mapToTopCategory,
  TOP_CATEGORY_ORDER,
} from "../lib/catalog/view-builders";
import {
  CATALOG_MAIN_GROUPS,
  getCatalogMainGroupCategories,
} from "../lib/catalog/category-taxonomy";
import {
  buildCatalogRecommendationSet,
  buildCatalogRoomGuidance,
  getSimilarItems,
} from "../lib/catalog/recommendations";

function run(): void {
  const items = Object.values(CATALOG_ITEMS);
  assert(items.length > 0, "Expected catalog to contain at least one item");

  const taxonomyCategories = CATALOG_MAIN_GROUPS.flatMap((group) => group.categories);
  assert.equal(
    new Set(taxonomyCategories).size,
    taxonomyCategories.length,
    "Each catalog category must belong to exactly one main group",
  );
  assert.deepEqual(
    [...taxonomyCategories].sort(),
    [...TOP_CATEGORY_ORDER].sort(),
    "Main-group taxonomy must cover every top-level catalog category",
  );
  assert.deepEqual(
    getCatalogMainGroupCategories("tables"),
    ["coffee_table", "side_table", "dining_table", "dining_bench"],
    "Tables group must contain every table and dining subcategory",
  );

  const target = items[0];
  const topCategory = mapToTopCategory(target.category);
  const categoryFiltered = filterCatalogItems(items, "", { category: [topCategory] });
  assert(
    categoryFiltered.every((item) => mapToTopCategory(item.category) === topCategory),
    "Category filter returned item outside selected top category",
  );

  const tableCategories = getCatalogMainGroupCategories("tables");
  const tableFiltered = filterCatalogItems(items, "", { category: tableCategories });
  assert(tableFiltered.length > 0, "Tables group should return catalog products");
  assert(
    tableFiltered.every((item) => tableCategories.includes(mapToTopCategory(item.category, item))),
    "Main-group filter returned an item outside the selected group",
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

  const guidance = buildCatalogRoomGuidance({
    item: target,
    recommendedCategoryIds: [topCategory],
    activeRoomCategoryCounts: {},
    roomWidth: Math.max(3, target.dimsMm.w / 1000 + 1),
    roomDepth: Math.max(3, target.dimsMm.d / 1000 + 1),
  });
  assert.equal(guidance.recommended, true, "Room guidance should flag recommended categories");
  assert(
    guidance.labels.includes("Recommended for room"),
    "Room guidance should explain missing recommended categories",
  );
  assert(
    guidance.labels.some((label) => label === "Fits this space" || label === "Check fit"),
    "Room guidance should include a room-fit label when dimensions are known",
  );

  const tooLargeGuidance = buildCatalogRoomGuidance({
    item: target,
    recommendedCategoryIds: [topCategory],
    activeRoomCategoryCounts: {},
    roomWidth: Math.max(0.8, target.dimsMm.w / 1000 - 0.5),
    roomDepth: Math.max(0.8, target.dimsMm.d / 1000 - 0.5),
  });
  assert.equal(tooLargeGuidance.fit, "too_large", "Oversized room guidance should flag too-large products");
  assert(
    tooLargeGuidance.labels.includes("Too large for room"),
    "Oversized room guidance should explain that the item is too large",
  );

  console.log("Catalog panel logic checks passed");
}

run();
