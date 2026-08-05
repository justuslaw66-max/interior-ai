import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CatalogCompareTray from "../components/catalog/CatalogCompareTray";
import {
  getCatalogDrawerFocusAttributes,
  shouldCloseCatalogDrawerForUnavailableContent,
} from "../components/catalog/useCatalogDrawerFocusRestoration";
import { CATALOG_ITEMS } from "../lib/catalog";
import type { CatalogItemSchema } from "../lib/catalog-schema";
import {
  buildCatalogCardView,
  collectFilterFacets,
  deriveSeatCount,
  filterCatalogItems,
  getSofaSeatCapacityBucket,
  mapToTopCategory,
  matchesSofaSeatCapacityBuckets,
  TOP_CATEGORY_ORDER,
  type CatalogFilterState,
} from "../lib/catalog/view-builders";
import { resolveCatalogCompareItems } from "../lib/catalog/compare";
import {
  CATALOG_MAIN_GROUPS,
  getCatalogMainGroupCategories,
} from "../lib/catalog/category-taxonomy";
import { groupCatalogItems } from "../lib/catalog/family-grouping";
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

  const comparedProduct = CATALOG_ITEMS["bed-real-castlery-lexi-tufted"];
  assert(comparedProduct, "Expected the fixed Lexi compare fixture in the canonical catalog");
  const comparedVariant = comparedProduct.variants.find(
    (variant) => variant.id === "queen_frost_white",
  );
  assert(comparedVariant, "Expected the fixed Lexi Frost White canonical variant");
  const secondComparedProduct =
    CATALOG_ITEMS["dining-real-castlery-sloane-travertine-180"];
  assert(secondComparedProduct, "Expected the fixed Sloane compare-order fixture");
  const selectedVariantIdByProductId = {
    [comparedProduct.id]: comparedVariant.id,
  };

  const canonicalCompareCard = buildCatalogCardView(comparedProduct, comparedVariant.id);
  const secondCompareCard = buildCatalogCardView(secondComparedProduct);
  const canonicalCardByProductId = new Map([
    [canonicalCompareCard.id, canonicalCompareCard],
    [secondCompareCard.id, secondCompareCard],
  ]);
  const compareProductIds = [secondComparedProduct.id, comparedProduct.id] as const;
  const resolvedCompare = resolveCatalogCompareItems(
    compareProductIds,
    canonicalCardByProductId,
    selectedVariantIdByProductId,
  );

  assert.deepEqual(
    resolvedCompare.map((entry) => entry.productId),
    compareProductIds,
    "Canonical compare resolution must preserve selected product order",
  );
  assert(
    resolvedCompare.every((entry) => entry.status === "available"),
    "Canonical compare products should resolve as available",
  );
  const selectedVariantEntry = resolvedCompare[1];
  assert.equal(selectedVariantEntry.status, "available");
  assert.equal(
    selectedVariantEntry.card.variantId,
    comparedVariant.id,
    "Compare resolution must preserve the selected canonical variant id",
  );
  assert.equal(selectedVariantEntry.card.variantLabel, canonicalCompareCard.variantLabel);
  assert.equal(selectedVariantEntry.card.thumbUrl, canonicalCompareCard.thumbUrl);
  assert.deepEqual(selectedVariantEntry.card.dimsMm, canonicalCompareCard.dimsMm);
  assert.equal(selectedVariantEntry.card.priceLabel, canonicalCompareCard.priceLabel);

  assert.deepEqual(
    getCatalogDrawerFocusAttributes({
      productId: comparedProduct.id,
      action: "details",
      source: "product-card",
    }),
    {
      "data-catalog-drawer-focus-product-id": comparedProduct.id,
      "data-catalog-drawer-focus-action": "details",
      "data-catalog-drawer-focus-source": "product-card",
    },
    "Drawer focus identity must use stable product/action/source values",
  );
  const availableCompareMarkup = renderToStaticMarkup(
    createElement(CatalogCompareTray, {
      items: resolvedCompare,
      onRemove: () => undefined,
      onClear: () => undefined,
      onPreview: () => undefined,
      onAdd: () => undefined,
    }),
  );
  assert.match(
    availableCompareMarkup,
    new RegExp(`data-catalog-drawer-focus-product-id="${comparedProduct.id}"`),
    "Available compare openers must render the canonical product identity",
  );
  assert.match(availableCompareMarkup, /data-catalog-drawer-focus-action="details"/);
  assert.match(availableCompareMarkup, /data-catalog-drawer-focus-source="compare-tray"/);
  assert.equal(
    shouldCloseCatalogDrawerForUnavailableContent(true, false),
    true,
    "An open drawer must close when its selected product becomes unavailable",
  );
  assert.equal(shouldCloseCatalogDrawerForUnavailableContent(true, true), false);
  assert.equal(shouldCloseCatalogDrawerForUnavailableContent(false, false), false);

  const otherCategory = mapToTopCategory(secondComparedProduct.category, secondComparedProduct);
  const compareExcludingFilters: Array<{
    name: string;
    search: string;
    filters: CatalogFilterState;
  }> = [
    { name: "category", search: "", filters: { category: [otherCategory] } },
    { name: "search", search: secondComparedProduct.id, filters: {} },
    { name: "room", search: "", filters: { roomTags: ["bedroom"] } },
    { name: "brand", search: "", filters: { brandIds: ["not-the-compared-brand"] } },
    { name: "price", search: "", filters: { priceMin: 1_000_000 } },
  ];

  for (const scenario of compareExcludingFilters) {
    const filtered = filterCatalogItems(items, scenario.search, scenario.filters);
    assert(
      !filtered.some((item) => item.id === comparedProduct.id),
      `${scenario.name} fixture must exclude the compared product from rendered results`,
    );
    const filteredCardByProductId = new Map(
      filtered.map((item) => {
        const card = buildCatalogCardView(item);
        return [card.id, card] as const;
      }),
    );
    assert.equal(
      resolveCatalogCompareItems(
        [comparedProduct.id],
        filteredCardByProductId,
        selectedVariantIdByProductId,
      )[0]?.status,
      "unavailable",
      `${scenario.name} proves the filtered map cannot own compare identity resolution`,
    );
    const canonicalResult = resolveCatalogCompareItems(
      [comparedProduct.id],
      canonicalCardByProductId,
      selectedVariantIdByProductId,
    );
    assert.equal(
      canonicalResult[0]?.status,
      "available",
      `${scenario.name} must not invalidate a canonically available compared product`,
    );
    assert.equal(
      canonicalResult.length,
      1,
      `${scenario.name} result count and compare count must remain independent`,
    );
  }

  const stockFilteredCardByProductId = new Map([[secondCompareCard.id, secondCompareCard]]);
  assert.equal(
    resolveCatalogCompareItems(
      [comparedProduct.id],
      stockFilteredCardByProductId,
      selectedVariantIdByProductId,
    )[0]?.status,
    "unavailable",
    "A rendered stock/smart-filter result map must not be able to resolve an excluded product",
  );
  assert.equal(
    resolveCatalogCompareItems(
      [comparedProduct.id],
      canonicalCardByProductId,
      selectedVariantIdByProductId,
    )[0]?.status,
    "available",
    "Stock and smart filters must not invalidate a canonically available compared product",
  );

  const groupedFiltered = groupCatalogItems(
    filterCatalogItems(items, "", { category: [otherCategory] }),
  );
  assert(
    !groupedFiltered.some((family) => family.items.some((item) => item.id === comparedProduct.id)),
    "Grouping fixture must exclude the compared product from rendered families",
  );
  assert.equal(
    resolveCatalogCompareItems(
      [comparedProduct.id],
      canonicalCardByProductId,
      selectedVariantIdByProductId,
    )[0]?.status,
    "available",
    "Rendered family grouping must not own compare identity resolution",
  );

  const missingProductId = "retired-catalog-product";
  assert.deepEqual(
    resolveCatalogCompareItems([missingProductId], canonicalCardByProductId),
    [{ status: "unavailable", productId: missingProductId, reason: "product" }],
    "A genuinely missing or retired product must retain its identity in one safe unavailable state",
  );
  const unavailableMarkup = renderToStaticMarkup(
    createElement(CatalogCompareTray, {
      items: resolveCatalogCompareItems([missingProductId], canonicalCardByProductId),
      onRemove: () => undefined,
      onClear: () => undefined,
      onPreview: () => undefined,
      onAdd: () => undefined,
    }),
  );
  assert.match(unavailableMarkup, /Product unavailable/);
  assert.match(unavailableMarkup, /no longer available in the public catalog/);
  assert.match(unavailableMarkup, /<button type="button"/);
  assert.doesNotMatch(
    unavailableMarkup,
    />Open<|>Add</,
    "Unavailable compare entries must not expose preview or purchase actions",
  );
  const mismatchedCardByProductId = new Map([[comparedProduct.id, secondCompareCard]]);
  assert.deepEqual(
    resolveCatalogCompareItems([comparedProduct.id], mismatchedCardByProductId),
    [{ status: "unavailable", productId: comparedProduct.id, reason: "product" }],
    "A filtered-out or corrupt product identity must never resolve to another product",
  );
  const draftProductId = "tv-real-castlery-harper-tv-console-150";
  assert.equal(CATALOG_ITEMS[draftProductId], undefined);
  assert.equal(
    resolveCatalogCompareItems([draftProductId], canonicalCardByProductId)[0]?.status,
    "unavailable",
    "An identity absent from the public canonical registry must remain unavailable",
  );

  const refreshedCompareCard = {
    ...canonicalCompareCard,
    priceLabel: "SGD 321",
    badges: [...canonicalCompareCard.badges, "Catalog refreshed"],
  };
  const refreshedResult = resolveCatalogCompareItems(
    [comparedProduct.id],
    new Map([[comparedProduct.id, refreshedCompareCard]]),
    selectedVariantIdByProductId,
  )[0];
  assert.equal(refreshedResult?.status, "available");
  assert.strictEqual(
    refreshedResult.card,
    refreshedCompareCard,
    "Compare resolution must use the current canonical projection after catalog refresh",
  );
  assert.notStrictEqual(
    refreshedResult.card,
    canonicalCompareCard,
    "Compare state must not retain a stale full product/card object",
  );

  const productAfterVariantRetirement: CatalogItemSchema = {
    ...comparedProduct,
    variants: comparedProduct.variants.filter((variant) => variant.id !== comparedVariant.id),
  };
  const substitutedCard = buildCatalogCardView(
    productAfterVariantRetirement,
    comparedVariant.id,
  );
  assert.notEqual(
    substitutedCard.variantId,
    comparedVariant.id,
    "Variant-retirement fixture must reproduce the underlying default-variant fallback",
  );
  const retiredVariantResult = resolveCatalogCompareItems(
    [comparedProduct.id],
    new Map([[comparedProduct.id, substitutedCard]]),
    selectedVariantIdByProductId,
  );
  assert.deepEqual(
    retiredVariantResult,
    [{ status: "unavailable", productId: comparedProduct.id, reason: "variant" }],
    "A removed selected variant must fail closed instead of substituting product data",
  );
  const retiredVariantMarkup = renderToStaticMarkup(
    createElement(CatalogCompareTray, {
      items: retiredVariantResult,
      onRemove: () => undefined,
      onClear: () => undefined,
      onPreview: () => undefined,
      onAdd: () => undefined,
    }),
  );
  assert.match(retiredVariantMarkup, /selected variant is no longer available/);
  assert.doesNotMatch(retiredVariantMarkup, />Open<|>Add</);

  assert.match(
    catalogPanelSource,
    /if \(prev\.includes\(id\)\)[\s\S]*?return prev\.filter\(\(entry\) => entry !== id\)/,
    "Compare toggling must prevent duplicate ids by removing an already-selected identity",
  );
  assert.match(
    catalogPanelSource,
    /if \(prev\.length >= 3\)[\s\S]*?return \[\.\.\.prev\.slice\(1\), id\]/,
    "Compare toggling must keep the existing three-item limit and deterministic replacement order",
  );
  assert.equal(
    furnishPanelSource.match(/<CatalogPanel\b/g)?.length,
    1,
    "Consumer and Pro must share one CatalogPanel and compare identity path",
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
