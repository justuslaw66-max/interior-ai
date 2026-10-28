import assert from "node:assert/strict";
import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  SurfaceBrowserFilterBar,
  type SurfaceBrowserFilterBarProps,
} from "../components/editor/design-controls-plan/SurfaceBrowserFilterBar";
import {
  buildSurfaceMaterialProductGroups,
  getSurfaceMaterialColorLabel,
  getSurfaceMaterialProductDisplayName,
} from "../components/editor/design-controls-plan/surfaceCatalog";
import {
  buildSurfaceFilterOptions,
  filterSurfaceMaterialGroups,
  getSurfaceSearchColour,
} from "../components/editor/design-controls-plan/surfaceMaterialFilters";
import { PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA } from "../lib/generated/surface-material-catalog.generated";
import { NIPPON_PAINT_COLOURS } from "../lib/nippon-paint-colours";
import { createSurfaceMaterialCatalogLoader } from "../lib/surface-material-catalog-loader";

// J, 28 Oct 2026: search by what a material is, and filter by what colour it looks. A search that is just a colour is the
// colour filter, shown as a chip; the wood colours are tones (Light Wood ... Dark Wood), so "walnut" means the species.

async function main(): Promise<void> {
  const loader = createSurfaceMaterialCatalogLoader(async () => ({
    PRODUCTION_SURFACE_MATERIAL_CATALOG_METADATA,
    NIPPON_PAINT_COLOURS,
  }));
  const records = await loader.load();
  const walls = records.filter((record) => ["wall_tile", "wall_panel"].includes(record.surface_material.surface_category));
  const groups = buildSurfaceMaterialProductGroups(walls);
  const search = (text: string) =>
    filterSurfaceMaterialGroups(groups, { search: text, filters: {}, favoriteIds: new Set(), roomType: "living" });
  const names = (found: ReturnType<typeof search>) => found.map((group) => getSurfaceMaterialProductDisplayName(group.primary));
  const colourOf = (group: (typeof groups)[number]) => group.variants.map(getSurfaceMaterialColorLabel);

  // Which searches are a colour.
  assert.equal(getSurfaceSearchColour(" Blue "), "Blue");
  assert.equal(getSurfaceSearchColour("gray"), "Grey");
  assert.equal(getSurfaceSearchColour("light   wood"), "Light Wood");
  assert.equal(getSurfaceSearchColour("dark wood"), "Dark Wood");
  for (const notAColour of ["blue bell", "walnut", "oak", "light oak", "unknown", "mixed", ""]) {
    assert.equal(getSurfaceSearchColour(notAColour), null, `"${notAColour}" is a name search`);
  }

  // The colour filter names wood colours as tones.
  const colourOptions = buildSurfaceFilterOptions(records, undefined).color;
  for (const tone of ["Light Wood", "Natural Wood", "Warm Wood", "Dark Wood"]) assert.ok(colourOptions.includes(tone), tone);
  for (const species of ["Light Oak", "Natural Oak", "Warm Oak", "Walnut"]) assert.ok(!colourOptions.includes(species), species);

  // A colour search finds that colour: Greenlam's blue solids, not Sky Grey's name.
  const grey = search("grey");
  assert.ok(grey.length > 0);
  assert.ok(
    grey.every((group) => colourOf(group).includes("Grey") || colourOf(group).includes("Unknown")),
    "a colour search finds that colour, and materials whose colour isn't known yet by their name"
  );
  assert.ok(!names(grey).includes("Sky Grey 273"), "Greenlam Sky Grey 273 is drawn a pale blue");
  assert.ok(names(search("blue")).includes("Sky Grey 273"));
  assert.deepEqual(names(search("sky grey")), ["Sky Grey 273"], "a name with a colour in it is still found by its name");
  assert.deepEqual(names(search("gray")), names(grey));

  // "walnut" is the species: names only, not every dark wood.
  const walnut = search("walnut");
  assert.ok(walnut.length > 0);
  assert.ok(
    walnut.every((group) => group.variants.some((variant) => /walnut/i.test(variant.surface_material.product_name))),
    "a walnut search finds designs named walnut"
  );
  assert.ok(!names(walnut).includes("Mahogany 605") && !names(walnut).includes("Wenge 731"));
  assert.ok(names(search("dark wood")).includes("Mahogany 605"), "the Dark Wood colour holds mahogany");

  // The chip says the search is the colour filter, and isn't there for a name search.
  const props = (text: string): SurfaceBrowserFilterBarProps => ({
    search: text,
    searchPlaceholder: "Search wall finishes",
    searchInputRef: createRef<HTMLInputElement>(),
    filters: {},
    filterOptions: { brand: [], collection: [], effect: [], size: [], color: colourOptions },
    filterDrawerOpen: false,
    viewMode: "grid",
    hasFilters: Boolean(text),
    onSearchChange: () => {},
    onFilterChange: () => {},
    onToggleFilterDrawer: () => {},
    onToggleRecommended: () => {},
    onToggleFavorites: () => {},
    onToggleViewMode: () => {},
    onClear: () => {},
  });
  const withColour = renderToStaticMarkup(createElement(SurfaceBrowserFilterBar, props("light wood")));
  assert.match(withColour, /data-testid="surfaces-search-colour"/);
  assert.match(withColour, /Colour: <!-- -->Light Wood|Colour: Light Wood/);
  const withName = renderToStaticMarkup(createElement(SurfaceBrowserFilterBar, props("walnut")));
  assert.doesNotMatch(withName, /surfaces-search-colour/);
  for (const testId of ["surfaces-search", "surfaces-filter-toggle", "surfaces-recommended-filter", "surfaces-favorites-filter", "surfaces-view-toggle", "surfaces-clear-filters"]) {
    assert.match(withName, new RegExp(`data-testid="${testId}"`), `${testId} is still there`);
  }
  const drawer = renderToStaticMarkup(createElement(SurfaceBrowserFilterBar, { ...props(""), filterDrawerOpen: true }));
  for (const key of ["brand", "collection", "effect", "size", "color"]) assert.match(drawer, new RegExp(`surfaces-filter-${key}`));

  console.log(`Surface search and colour checks passed (${groups.length} wall cards).`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
