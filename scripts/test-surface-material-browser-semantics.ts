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
  getSurfaceMaterialProductDisplayName,
  getSurfaceMaterialSizeLabel,
  getSurfaceMaterialSizeOptionLabel,
  getSurfaceMaterialSupplierLabel,
  getSurfaceMaterialSwatchStyle,
} from "../components/editor/design-controls-plan/surfaceCatalog";
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

assert.equal(records.length, 980, "the browser must join all 980 render and catalog identities");
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
assert.equal(getSurfaceMaterialSupplierLabel(dorica120), "Gardenia Orchidea");
assert.equal(
  getSurfaceMaterialCollectionLabel(dorica120),
  "Gardenia Orchidea",
  "collection labels must preserve the documented brand/supplier fallback when collection is not projected"
);
assert.equal(getSurfaceMaterialSizeLabel(dorica120), "1200x1200 mm");

const facets = {
  effect: buildFacetOptions(records, getSurfaceMaterialEffectLabel),
  collection: buildFacetOptions(records, getSurfaceMaterialCollectionLabel),
  size: buildFacetOptions(records, getSurfaceMaterialSizeLabel),
  color: buildFacetOptions(records, getSurfaceMaterialColorLabel),
};
assert.ok(facets.effect.includes("Marble"));
assert.ok(facets.collection.includes("Gardenia Orchidea"));
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
const surfaceFilterBody = extractRequiredBody(
  panelSource,
  /const filteredSurfaceMaterialGroups = \(\(\) => \{([\s\S]*?)\n  \}\)\(\);\n  const visibleFilteredSurfaceMaterialGroups/,
  "surface-material search/filter"
);
const runProductionSurfaceFilter = ({
  search = "",
  filters = {},
  favorites = [],
  roomType = "living",
  productGroups = groups,
}: {
  search?: string;
  filters?: Record<string, string | boolean>;
  favorites?: string[];
  roomType?: string;
  productGroups?: typeof groups;
}) =>
  vm.runInNewContext(`(() => {${surfaceFilterBody}})()`, {
    flooringSearch: search,
    surfaceMaterialProductGroups: productGroups,
    surfaceFilters: filters,
    favoriteSurfaceMaterialIdSet: new Set(favorites),
    activeRoomType: roomType,
    getSurfaceMaterialProductDisplayName,
    getSurfaceMaterialSupplierLabel,
    getSurfaceMaterialCollectionLabel,
    getSurfaceMaterialSizeLabel,
    getSurfaceMaterialSizeOptionLabel,
    getSurfaceMaterialEffectLabel,
    getSurfaceMaterialColorLabel,
  }) as typeof groups;

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

const mismatchingFilterCases: Array<[string, Record<string, string | boolean>]> = [
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
  "surface filtering must execute effect, collection, size, color, favorites, and recommendation facets"
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
