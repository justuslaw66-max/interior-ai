import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import {
  buildFacetOptions,
  buildSurfaceMaterialProductGroups,
  getSurfaceMaterialCollectionLabel,
  getSurfaceMaterialColorLabel,
  getSurfaceMaterialEffectLabel,
  getSurfaceMaterialGroupSizeLabels,
  getSurfaceMaterialModelName,
  getSurfaceMaterialProductDisplayName,
  getSurfaceMaterialSizeLabel,
  getSurfaceMaterialSizeOptionLabel,
  getSurfaceMaterialSupplierLabel,
  getSurfaceMaterialSwatchStyle,
  type SurfaceFilterState,
} from "../components/editor/design-controls-plan/surfaceCatalog";
import {
  buildSurfaceFilterOptions,
  filterSurfaceMaterialGroups,
  hasActiveSurfaceFilters,
  withSurfaceFilter,
} from "../components/editor/design-controls-plan/surfaceMaterialFilters";
import { PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA } from "../lib/generated/surface-material-catalog.generated";
import { NIPPON_PAINT_COLOURS } from "../lib/nippon-paint-colours";
import {
  createSurfaceMaterialCatalogLoader,
  type SurfaceMaterialCatalogModule,
} from "../lib/surface-material-catalog-loader";
import { SURFACE_MATERIAL_RENDER_REGISTRY } from "../lib/surface-material-runtime";
import { getWallPaintSwatchSearchText } from "../lib/wall-paint";

const DORICA_CREMA_120_ID =
  "gardenia-flooring-dorica-crema-0010006-120x120-nat-196270-0";
const DORICA_CREMA_20X120_ID =
  "gardenia-flooring-dorica-crema-0010519-20x120-nat-196278-0";

const moduleFixture: SurfaceMaterialCatalogModule = {
  PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA,
  NIPPON_PAINT_COLOURS,
};

function extractRequiredBody(source: string, pattern: RegExp, label: string): string {
  const match = source.match(pattern);
  assert.ok(match?.[1], `expected to extract the production ${label} predicate`);
  return match[1];
}

async function main(): Promise<void> {
  const loader = createSurfaceMaterialCatalogLoader(async () => moduleFixture);
  const records = await loader.load();

assert.equal(records.length, 994, "the browser must join all 994 render and catalog identities");
const loadedSnapshot = loader.getSnapshot();
assert.equal(loadedSnapshot.status, "success");
assert.ok(loadedSnapshot.wallPaintSwatches);
assert.equal(
  loadedSnapshot.wallPaintSwatches.length,
  2484,
  "the lazy browser must expose every Nippon selection"
);

const groups = buildSurfaceMaterialProductGroups(records, [DORICA_CREMA_20X120_ID]);
const doricaGroup = groups.find((group) =>
  group.variants.some(
    (variant) => variant.surface_material.material_id === DORICA_CREMA_120_ID
  )
);
assert.ok(doricaGroup, "the browser must group Gardenia Dorica Crema size variants");
assert.equal(
  doricaGroup.primary.surface_material.material_id,
  DORICA_CREMA_20X120_ID,
  "the selected material variant must remain the primary browser identity"
);
assert.equal(
  getSurfaceMaterialGroupSizeLabels(doricaGroup).length,
  5,
  "the Dorica Crema browser group must retain all five size variants"
);

const dorica120 = doricaGroup.variants.find(
  (variant) => variant.surface_material.material_id === DORICA_CREMA_120_ID
);
assert.ok(dorica120);
assert.equal(getSurfaceMaterialSupplierLabel(dorica120), "Gardenia & Ariana");
assert.equal(
  getSurfaceMaterialCollectionLabel(dorica120),
  "Dorica",
  "the browser must know each material's collection, not fall back to its brand"
);
assert.deepEqual(
  records.filter((record) => !getSurfaceMaterialCollectionLabel(record)).map((record) => record.surface_material.material_id),
  [],
  "every catalogue material must reach the browser with its collection"
);
assert.equal(getSurfaceMaterialSizeLabel(dorica120), "1200x1200 mm");

const facets = {
  effect: buildFacetOptions(records, getSurfaceMaterialEffectLabel),
  collection: buildFacetOptions(records, getSurfaceMaterialCollectionLabel),
  size: buildFacetOptions(records, getSurfaceMaterialSizeLabel),
  color: buildFacetOptions(records, getSurfaceMaterialColorLabel),
};
assert.ok(facets.effect.includes("Marble"));
assert.ok(facets.collection.includes("Dorica") && facets.collection.includes("Tabulae"));
assert.ok(!facets.collection.includes("Gardenia & Ariana"), "the Collection filter must not list a brand");

// Brand, then its collections, then the models on the cards (J, 2 Oct).
const allOptions = buildSurfaceFilterOptions(records, undefined);
assert.deepEqual(allOptions.brand, ["Florim", "Gardenia & Ariana", "Goodrich Global"]);
assert.ok(allOptions.collection.includes("Ardoise") && allOptions.collection.includes("Dorica"));
const gardeniaOptions = buildSurfaceFilterOptions(records, "Gardenia & Ariana");
assert.equal(gardeniaOptions.collection.length, 13, "Gardenia & Ariana's 13 collections");
assert.ok(gardeniaOptions.collection.includes("Dorica") && !gardeniaOptions.collection.includes("Ardoise"));
assert.deepEqual(gardeniaOptions.size, allOptions.size, "only Collection follows the brand");
assert.deepEqual(
  withSurfaceFilter({ collection: "Ardoise" }, "brand", "Gardenia & Ariana", records),
  { collection: undefined, brand: "Gardenia & Ariana" },
  "another brand clears a collection that isn't the brand's"
);
assert.deepEqual(
  withSurfaceFilter({ collection: "Dorica" }, "brand", "Gardenia & Ariana", records),
  { collection: "Dorica", brand: "Gardenia & Ariana" }
);
assert.deepEqual(withSurfaceFilter({ brand: "Florim", collection: "Ardoise" }, "brand", "", records), {
  brand: undefined,
  collection: "Ardoise",
});
assert.equal(hasActiveSurfaceFilters(" ", { brand: "Florim" }), true);
assert.equal(hasActiveSurfaceFilters(" ", {}), false);
assert.equal(getSurfaceMaterialModelName(dorica120), "Crema", "the card names the model under its collection");
const goodrich = records.find((record) => record.surface_material.supplier === "goodrich_global");
assert.ok(goodrich);
assert.equal(
  getSurfaceMaterialModelName(goodrich),
  getSurfaceMaterialProductDisplayName(goodrich),
  "a name that doesn't start with its collection stays whole"
);
for (const record of records.filter((entry) => entry.surface_material.supplier !== "goodrich_global")) {
  assert.notEqual(
    getSurfaceMaterialModelName(record),
    getSurfaceMaterialProductDisplayName(record),
    `${record.surface_material.material_id}: Gardenia's and Florim's names start with their collection`
  );
}
assert.ok(facets.size.includes("1200x1200 mm"));
assert.ok(facets.color.includes("White"));

const texturedMaterial = records.find(
  (material) => material.texture_assets.base_color_url !== null
);
assert.ok(texturedMaterial, "the production browser catalog must contain a textured material");
assert.match(
  String(getSurfaceMaterialSwatchStyle(texturedMaterial).backgroundImage),
  new RegExp(
    texturedMaterial.texture_assets.base_color_url!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  ),
  "browser swatches must preserve the canonical base-color texture identity"
);

const panelSource = readFileSync("components/editor/DesignControlsPlanPanel.tsx", "utf8");
assert.match(
  panelSource,
  /const activeSurfaceSummaryRows = buildSurfaceSummaryRows\(surfaceRooms,/,
  "the Surface Summary must use the shared row derivation that reads export BOM wall quantities"
);
assert.match(
  panelSource,
  /\{row\.materialName\} · \{formatDisplayArea\(row\.areaSqm, measurementUnit\)\}/,
  "Surface Summary areas must follow the display-unit preference"
);
assert.match(
  panelSource,
  /\{\(room\.floorLabel \?\? "Floor"\)\} · \{formatDisplayArea\(room\.floorAreaSqm, measurementUnit\)\}/,
  "Surfaces room list areas must show the polygon-aware floor area in the display unit"
);
assert.match(
  panelSource,
  /const filteredSurfaceMaterialGroups = filterSurfaceMaterialGroups\(surfaceMaterialProductGroups, \{\n    search: flooringSearch,\n    filters: surfaceFilters,\n    favoriteIds: favoriteSurfaceMaterialIdSet,\n    roomType: activeRoomType,\n  \}\);/,
  "the Surfaces browser must filter with the shared predicate"
);
assert.match(
  panelSource,
  /renderSurfaceFilterSelect\("brand", "Brand", surfaceFilterOptions\.brand\)\}\n\s*\{renderSurfaceFilterSelect\("collection", "Collection", surfaceFilterOptions\.collection\)/,
  "Brand comes first, then its collections"
);
assert.match(panelSource, /\{getSurfaceMaterialCollectionLabel\(material\)\}<\/span>[\s\S]{0,240}\{getSurfaceMaterialModelName\(material\)\}/);
const runProductionSurfaceFilter = ({
  search = "",
  filters = {},
  favorites = [],
  roomType = "living",
  productGroups = groups,
}: {
  search?: string;
  filters?: SurfaceFilterState;
  favorites?: string[];
  roomType?: string;
  productGroups?: typeof groups;
}) =>
  filterSurfaceMaterialGroups(productGroups, {
    search,
    filters,
    favoriteIds: new Set(favorites),
    roomType,
  });

const searchFixture = JSON.parse(JSON.stringify(dorica120)) as typeof dorica120;
searchFixture.surface_material.product_name = "product-sentinel";
searchFixture.surface_material.material_id = "material-id-sentinel";
searchFixture.surface_material.brand = "supplier-sentinel";
searchFixture.surface_material.collection = "collection-sentinel";
searchFixture.physical_specs = {
  ...searchFixture.physical_specs,
  tile_width_mm: 1234,
  tile_length_mm: 2345,
};
searchFixture.classification = {
  ...searchFixture.classification,
  tone: [],
  style_cluster: [],
  room_suitability: ["suitability-sentinel"],
};
const searchFixtureGroups = buildSurfaceMaterialProductGroups([searchFixture]);
for (const [field, query] of [
  ["product", "product-sentinel"],
  ["material ID", "material-id-sentinel"],
  ["supplier", "supplier-sentinel"],
  ["collection", "collection-sentinel"],
  ["suitability", "suitability-sentinel"],
] as const) {
  assert.equal(
    runProductionSurfaceFilter({ search: query, productGroups: searchFixtureGroups }).length,
    1,
    `surface search must retain product, ID, supplier, collection, and suitability terms (case: ${field})`
  );
}

const mismatchingFilterCases: Array<[string, SurfaceFilterState]> = [
  ["brand", { brand: "impossible-brand" }],
  ["effect", { effect: "Impossible Effect" }],
  ["collection", { collection: "impossible-collection" }],
  ["size", { size: "1x1 mm" }],
  ["color", { color: "Impossible Color" }],
  ["favorites", { favoritesOnly: true }],
  ["recommendation", { recommendedOnly: true }],
];
for (const [field, filters] of mismatchingFilterCases) {
  assert.equal(
    runProductionSurfaceFilter({
      filters,
      favorites: [],
      roomType: "not-suitable",
      productGroups: searchFixtureGroups,
    }).length,
    0,
    `surface ${field} filtering must reject a mismatching production predicate`
  );
}
assert.equal(
  runProductionSurfaceFilter({
    filters: {
      brand: getSurfaceMaterialSupplierLabel(searchFixture),
      effect: getSurfaceMaterialEffectLabel(searchFixture),
      collection: getSurfaceMaterialCollectionLabel(searchFixture),
      size: getSurfaceMaterialSizeLabel(searchFixture),
      color: getSurfaceMaterialColorLabel(searchFixture),
      favoritesOnly: true,
      recommendedOnly: true,
    },
    favorites: [searchFixture.surface_material.material_id],
    roomType: "suitability-sentinel",
    productGroups: searchFixtureGroups,
  }).length,
  1,
  "surface filtering must execute brand, effect, collection, size, color, favorites, and recommendation facets"
);

const nipponFilterBody = extractRequiredBody(
  panelSource,
  /const swatchMatchesWallPaintFilters = useCallback\(\n    \(swatch: WallPaintSwatch\) => \{([\s\S]*?)\n    \},\n    \[wallPaintFamilyFilter/,
  "Nippon wall-paint search/filter"
);
const angelPink = loadedSnapshot.wallPaintSwatches.find(
  (swatch) => swatch.id === "nippon-1162-angel-pink"
);
assert.ok(angelPink, "the lazy browser must expose the expected Nippon paint selection");
const runProductionNipponFilter = (family: string, tokens: string[]) => {
  const predicate = vm.runInNewContext(`(swatch) => {${nipponFilterBody}}`, {
    wallPaintFamilyFilter: family,
    wallPaintSearchTokens: tokens,
    getWallPaintSwatchSearchText,
  }) as (swatch: typeof angelPink) => boolean;
  return predicate(angelPink);
};
assert.equal(
  runProductionNipponFilter("all", ["nippon", "1162"]),
  true,
  "Nippon swatch filtering must execute tokenized brand-and-code search behavior"
);
assert.equal(
  runProductionNipponFilter("blue", ["nippon"]),
  false,
  "Nippon swatch filtering must execute its color-family constraint"
);
assert.equal(
  SURFACE_MATERIAL_RENDER_REGISTRY.length,
  records.length,
  "browser semantics must not create an independently sized material registry"
);

  console.log("Surface material browser search, filter, grouping, variant, and swatch checks passed.");
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
