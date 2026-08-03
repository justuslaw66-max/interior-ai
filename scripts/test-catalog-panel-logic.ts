import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { CATALOG_ITEMS } from "../lib/catalog";
import type { CatalogItemSchema } from "../lib/catalog-schema";
import {
  collectFilterFacets,
  deriveSeatCount,
  filterCatalogItems,
  getSofaSeatCapacityBucket,
  mapToTopCategory,
  matchesSofaSeatCapacityBuckets,
  TOP_CATEGORY_ORDER,
  type CatalogFilterState,
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
import {
  clearInapplicableCatalogFilters,
  hasCatalogRoomNavigationChanged,
} from "../lib/catalog/filter-navigation";

function run(): void {
  const catalogPanelSource = readFileSync(
    path.join(process.cwd(), "components/catalog/CatalogPanel.tsx"),
    "utf8",
  );
  const furnishPanelSource = readFileSync(
    path.join(process.cwd(), "components/editor/DesignControlsFurnishPanel.tsx"),
    "utf8",
  );
  const filterNavigationSource = readFileSync(
    path.join(process.cwd(), "lib/catalog/filter-navigation.ts"),
    "utf8",
  );
  const documentStateSource = readFileSync(
    path.join(process.cwd(), "lib/useDesignPageDocumentStateController.ts"),
    "utf8",
  );
  const panelRegistrationSource = readFileSync(
    path.join(process.cwd(), "lib/design-page-panel-workspace-registration.ts"),
    "utf8",
  );
  assert.match(
    filterNavigationSource,
    /sofaFilterNavigationRevision === navigationRevision/,
    "Catalog filter state must invalidate a sofa filter when semantic navigation advances",
  );
  assert.match(
    catalogPanelSource,
    /filters=\{applicableFilters\}/,
    "Filter controls must not count or display a navigation-invalidated sofa bucket",
  );
  assert.match(
    catalogPanelSource,
    /hasActiveCatalogFilters\(applicableFilters\)/,
    "Navigation-invalidated sofa filters must not contribute to the active-filter state",
  );
  assert.match(
    catalogPanelSource,
    /countActiveCatalogFilters\(applicableFilters\)/,
    "Navigation-invalidated sofa filters must not contribute to the active-filter count",
  );
  assert.match(
    filterNavigationSource,
    /revision: previous\.revision \+ 1/,
    "The controlled category transaction must advance catalog filter navigation",
  );
  assert.match(
    furnishPanelSource,
    /navigationRevision=\{`\$\{catalogRoomNavigationRevision\}:\$\{catalogCategoryNavigationRevision\}`\}/,
    "Controlled room and category navigation revisions must reach CatalogPanel",
  );
  assert.match(
    documentStateSource,
    /hasCatalogRoomNavigationChanged\(designSnapshotRef\.current, resolved\)[\s\S]*?setCatalogRoomNavigationRevision\(\(revision\) => revision \+ 1\)/,
    "The central snapshot transaction must advance navigation for every catalog-relevant room change",
  );
  assert.match(
    panelRegistrationSource,
    /catalogRoomNavigationRevision: snapshotDocument\.state\.catalogRoomNavigationRevision/,
    "The panel must consume the central document room revision rather than a partial controller",
  );

  const items = Object.values(CATALOG_ITEMS);
  assert(items.length > 0, "Expected catalog to contain at least one item");

  const livingRoomContext = {
    activeRoomId: "room-a",
    rooms: [{ id: "room-a", name: "Living", roomType: "living" }],
  };
  assert.equal(
    hasCatalogRoomNavigationChanged(livingRoomContext, {
      ...livingRoomContext,
      rooms: [{ id: "room-a", name: "Kitchen", roomType: "kitchen" }],
    }),
    true,
    "Changing the active room type under the same id must invalidate its prior catalog filter revision",
  );
  assert.equal(
    hasCatalogRoomNavigationChanged(livingRoomContext, {
      ...livingRoomContext,
      rooms: [{ id: "room-a", name: "Renamed living room", roomType: "living" }],
    }),
    true,
    "Changing the room recommendation key under the same id must advance catalog navigation",
  );
  assert.equal(
    hasCatalogRoomNavigationChanged(livingRoomContext, livingRoomContext),
    false,
    "Unrelated snapshot updates must not invalidate applicable catalog filters",
  );

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

  const sofaTemplate = items[0];
  assert(sofaTemplate, "Expected a catalog fixture for sofa filter tests");
  const makeSeatFixture = (
    id: string,
    title: string,
    seatCapacity: number | undefined,
    options: { category?: CatalogItemSchema["category"]; widthMm?: number } = {},
  ): CatalogItemSchema => ({
    ...sofaTemplate,
    id,
    slug: id,
    title,
    category: options.category ?? "sofa",
    dimsMm: {
      ...sofaTemplate.dimsMm,
      w: options.widthMm ?? sofaTemplate.dimsMm.w,
    },
    metadata: {
      ...sofaTemplate.metadata,
      seatCapacity,
    },
  });
  const seatFixtures = [
    makeSeatFixture("seat-filter-two", "Hamilton 2 Seater Sofa", 2),
    makeSeatFixture("seat-filter-three", "Dawson 3 Seater Sofa", 3),
    makeSeatFixture("seat-filter-four", "Extended 3 Seater Sofa", 4),
    makeSeatFixture("seat-filter-five", "Dawson Pit Sectional Sofa", 5),
    makeSeatFixture("seat-filter-unknown", "Unmapped Sofa", undefined, { widthMm: 0 }),
    makeSeatFixture("seat-filter-table", "Dining Table", 4, { category: "dining_table" }),
  ];

  const sofaNavigationFilters = {
    brandIds: ["brand-a"],
    priceMin: 100,
    sofaSeatCapacityBuckets: ["3"],
  } satisfies CatalogFilterState;
  assert.strictEqual(
    clearInapplicableCatalogFilters(sofaNavigationFilters, ["sofa"]),
    sofaNavigationFilters,
    "Sofa navigation must retain an applicable seat-capacity filter without another state update",
  );
  assert.deepEqual(
    clearInapplicableCatalogFilters(sofaNavigationFilters, ["sofa"], false),
    { brandIds: ["brand-a"], priceMin: 100 },
    "Returning to sofa after controlled navigation must not resurrect its prior seat filter",
  );
  const tableNavigationFilters = clearInapplicableCatalogFilters(
    sofaNavigationFilters,
    getCatalogMainGroupCategories("tables"),
  );
  assert.deepEqual(
    tableNavigationFilters,
    { brandIds: ["brand-a"], priceMin: 100 },
    "Leaving sofa scope must clear only the sofa-only filter",
  );
  assert.strictEqual(
    clearInapplicableCatalogFilters(tableNavigationFilters, ["dining_table"]),
    tableNavigationFilters,
    "Repeated non-sofa navigation must be idempotent instead of scheduling another render",
  );
  assert.deepEqual(
    filterCatalogItems(seatFixtures, "", {
      ...clearInapplicableCatalogFilters(
        { sofaSeatCapacityBuckets: ["3"] },
        ["dining_table"],
      ),
      category: ["dining_table"],
    }).map((item) => item.id),
    ["seat-filter-table"],
    "Category navigation must not leave a stale sofa filter hiding valid products",
  );

  assert.equal(
    deriveSeatCount(seatFixtures[2]),
    4,
    "Explicit sofa seat metadata must take precedence over a misleading title",
  );
  assert.equal(getSofaSeatCapacityBucket(5), "4_plus");
  assert.equal(matchesSofaSeatCapacityBuckets(4, ["4_plus"]), true);
  assert.equal(matchesSofaSeatCapacityBuckets(3, ["4_plus"]), false);

  const twoAndThreeSeatIds = filterCatalogItems(seatFixtures, "", {
    sofaSeatCapacityBuckets: ["2", "3"],
  }).map((item) => item.id).sort();
  assert.deepEqual(
    twoAndThreeSeatIds,
    ["seat-filter-three", "seat-filter-two"],
    "Combined sofa capacity buckets must use OR semantics",
  );

  const fourPlusSeatIds = filterCatalogItems(seatFixtures, "", {
    sofaSeatCapacityBuckets: ["4_plus"],
  }).map((item) => item.id).sort();
  assert.deepEqual(
    fourPlusSeatIds,
    ["seat-filter-five", "seat-filter-four"],
    "The 4+ bucket must include capacities four and above while excluding unknown and non-sofa items",
  );

  const makeWidthFixture = (id: string, widthCm: number): CatalogItemSchema => ({
    ...target,
    id,
    slug: id,
    dimsMm: {
      ...target.dimsMm,
      w: widthCm * 10,
    },
  });
  const widthFixtures = [
    makeWidthFixture("width-filter-90", 90),
    makeWidthFixture("width-filter-160", 160),
    makeWidthFixture("width-filter-225", 225),
  ];
  assert.deepEqual(
    filterCatalogItems(widthFixtures, "", {
      widthMinCm: 150,
      widthMaxCm: 180,
    }).map((item) => item.id),
    ["width-filter-160"],
    "Width range filters must compare centimetre inputs against catalog millimetre dimensions",
  );
  assert.deepEqual(
    filterCatalogItems(widthFixtures, "", { widthMaxCm: 90 }).map((item) => item.id),
    ["width-filter-90"],
    "Width maximum filters must include the upper boundary",
  );
  assert.deepEqual(
    filterCatalogItems(widthFixtures, "", { widthMinCm: 225 }).map((item) => item.id),
    ["width-filter-225"],
    "Width minimum filters must include the lower boundary",
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
