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
  getSurfaceMaterialSupplierLabel,
  getSurfaceMaterialSwatchStyle,
  SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT,
  type SurfaceFilterState,
} from "../components/editor/design-controls-plan/surfaceCatalog";
import { isLaminateFlatPicture } from "../lib/laminate-flat-pictures";
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

// 1,405 YAML records and the laminate wall panels from catalog/laminates: 233 since 25 Oct 2026, 372 since 27 Oct.
assert.equal(records.length, 1777, "the browser must join all 1777 render and catalog identities");
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
  6,
  "the Dorica Crema browser group must retain all six size variants (the outdoor 60x120 R11 since 13 Oct 2026)"
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
assert.deepEqual(allOptions.brand, ["Florim", "Gardenia & Ariana", "Goodrich Global", "Greenlam"]);
// Greenlam's laminate wall panels: each kind of decor is a collection, and a card names the design by its code and name.
const greenlamOptions = buildSurfaceFilterOptions(records, "Greenlam");
assert.deepEqual(greenlamOptions.collection, ["Abstracts", "Metals", "Pearlescents", "Solids", "Unicore", "Woodgrains"]);
const nordicAcacia = records.find((record) => record.surface_material.material_id === "greenlam-woodgrains-5394");
assert.ok(nordicAcacia);
assert.deepEqual(
  [
    getSurfaceMaterialSupplierLabel(nordicAcacia),
    getSurfaceMaterialCollectionLabel(nordicAcacia),
    getSurfaceMaterialModelName(nordicAcacia),
    getSurfaceMaterialSizeLabel(nordicAcacia),
    getSurfaceMaterialEffectLabel(nordicAcacia),
  ],
  ["Greenlam", "Woodgrains", "Nordic Acacia 5394", "1220x2440 mm", "Wood"],
  "a laminate wall panel's card"
);
// A flat colour on a 4.25'x10' sheet (27 Oct 2026): its swatch is its one-colour picture.
const brilliantWhite = records.find((record) => record.surface_material.material_id === "greenlam-solids-112");
assert.ok(brilliantWhite);
assert.deepEqual(
  [
    getSurfaceMaterialCollectionLabel(brilliantWhite),
    getSurfaceMaterialModelName(brilliantWhite),
    getSurfaceMaterialSizeLabel(brilliantWhite),
    getSurfaceMaterialEffectLabel(brilliantWhite),
    brilliantWhite.texture_assets.swatch_url,
  ],
  ["Solids", "Brilliant White 112", "1300x3050 mm", "Plain", "/assets/catalog/laminates/flat-colours/f7f7f7.png"],
  "a flat colour's card"
);
// The browser sorts by name: a laminate wall panel sits among the tiles by its design's name, not ahead of them by its code.
const wallGroupNames = buildSurfaceMaterialProductGroups(
  records.filter((record) => ["wall_tile", "wall_panel"].includes(record.surface_material.surface_category))
).map((group) => getSurfaceMaterialProductDisplayName(group.primary));
// The first page is the browser's first 16 cards (SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT). The laminates' 118 flat colours
// come after every other card, A to Z (J, 27 Oct 2026: "Flat colours last"); before that, Absolute White and twelve AFX
// colours had pushed Anima Beige to the second page, and two wall panel browser tests couldn't find it.
const wallGroups = buildSurfaceMaterialProductGroups(
  records.filter((record) => ["wall_tile", "wall_panel"].includes(record.surface_material.surface_category))
);
assert.ok(wallGroupNames.indexOf("Anima Beige") < SURFACE_MATERIAL_INITIAL_VISIBLE_COUNT, "Anima Beige stays on the wall browser's first page");
assert.ok(wallGroupNames.indexOf("Akita Grey 5644") < wallGroupNames.indexOf("Anima Beige"));
const firstFlat = wallGroups.findIndex((group) => isLaminateFlatPicture(group.primary.texture_assets.base_color_url));
assert.deepEqual(
  [firstFlat, wallGroups.slice(firstFlat).every((group) => isLaminateFlatPicture(group.primary.texture_assets.base_color_url))],
  [wallGroups.length - 118, true],
  "the 118 flat colours close the wall browser"
);
assert.deepEqual(
  wallGroups.slice(firstFlat, firstFlat + 3).map((group) => getSurfaceMaterialProductDisplayName(group.primary)),
  ["Absolute White 108", "AFX Anthracite 9853", "AFX Basalt Grey 9855"],
  "the flat colours are A to Z among themselves"
);
assert.ok(facets.effect.includes("Pattern") && facets.effect.includes("Metallic"), "the laminates' own effects are filters");
assert.ok(allOptions.collection.includes("Ardoise") && allOptions.collection.includes("Dorica"));
const gardeniaOptions = buildSurfaceFilterOptions(records, "Gardenia & Ariana");
assert.equal(gardeniaOptions.collection.length, 23, "Gardenia & Ariana's 23 collections");
assert.ok(gardeniaOptions.collection.includes("Dorica") && !gardeniaOptions.collection.includes("Ardoise"));
assert.ok(
  ["Hermione", "Concrea Plain", "Just Nature", "Luce", "Storm", "Epoque 2.0", "Camouflage", "Block", "Eterea", "Plein Air"].every((name) =>
    gardeniaOptions.collection.includes(name)
  )
);
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
for (const record of records.filter(
  (entry) => entry.surface_material.supplier !== "goodrich_global" && entry.surface_material.supplier !== "greenlam"
)) {
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
// A chevron can't be laid straight, so its card shows its swatch, painted laid, not one piece's face (17 Oct 2026).
const chevronCards = records.filter((record) => record.rendering.available_pattern_layouts?.includes("chevron"));
assert.equal(chevronCards.length, 8, "Tabulae's 8 chevrons are in the browser catalog");
for (const chevron of chevronCards) {
  const style = getSurfaceMaterialSwatchStyle(chevron);
  assert.equal(style.backgroundImage, `url("${chevron.texture_assets.swatch_url}")`, `${chevron.surface_material.material_id}: laid swatch`);
  assert.equal(style.backgroundSize, "cover", `${chevron.surface_material.material_id}: the swatch fills the card`);
}

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

// Outdoor floors are found by where they go (13 Oct 2026) and how they're laid (14 Oct 2026, ABK's Plein Air catalogue): "terrace",
// "patio", "pool", "outdoor", "driveway", "steps", "shower", "grass", "gravel" and "raised" find every card with an outdoor size
// and no other card. ("garden" is part of every Gardenia name, so it isn't a test of this.)
const outdoorGroupIds = groups
  .filter((group) => group.variants.some((variant) => variant.classification.outdoor))
  .map((group) => group.id)
  .sort();
assert.equal(outdoorGroupIds.length, 66, "cards with an outdoor size: 36 of catalogued colours, 30 of Plein Air's own");
// A card named for the word is found too: Greenlam's Grass Green 250, a wall panel since 27 Oct 2026.
const namedFor = (query: string) => groups
  .filter((group) => group.variants.some((variant) => variant.surface_material.product_name.toLowerCase().includes(query.toLowerCase())))
  .map((group) => group.id);
assert.deepEqual(
  ["terrace", "Patio", "pool", "outdoor", "driveway", "steps", "shower", "grass", "Gravel", "raised"].flatMap(namedFor),
  ["greenlam-solids-250"]
);
for (const query of ["terrace", "Patio", "pool", "outdoor", "driveway", "steps", "shower", "grass", "Gravel", "raised"]) {
  assert.deepEqual(
    runProductionSurfaceFilter({ search: query }).map((group) => group.id).sort(),
    [...outdoorGroupIds, ...namedFor(query)].sort(),
    `a search for "${query}" finds the cards with an outdoor size, and any named for it`
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
