import assert from "node:assert/strict";

import { getCieLab, getLaminateColourFamily } from "../lib/laminate-colour-family";
import { buildLaminateWallPanelMaterials } from "../lib/laminate-wall-panel-materials";
import { CABINET_LAMINATE_COLLECTIONS } from "../lib/generated/cabinet-laminates.generated";
import { SURFACE_MATERIAL_VOCABULARY } from "../lib/surface-material-schema";

// CIELab under D65, against published values: RAL 9001's CIELab is 89.616, 0.594, 8.06, which is sRGB #e9e0d2.
const ral9001 = getCieLab("#e9e0d2");
assert.ok(Math.abs(ral9001.lightness - 89.6) < 0.2, `RAL 9001's lightness is ${ral9001.lightness}`);
assert.ok(Math.abs(ral9001.chroma - Math.hypot(0.594, 8.06)) < 0.3, `RAL 9001's chroma is ${ral9001.chroma}`);
assert.deepEqual(getCieLab("#ffffff").lightness.toFixed(1), "100.0");
assert.ok(getCieLab("#000000").lightness === 0 && getCieLab("#808080").chroma < 0.01, "black and grey have no chroma");

// Each family, by the colour drawn (J, 28 Oct 2026: "Solids and woods"), not by the name.
const examples: Array<[Parameters<typeof getLaminateColourFamily>[0], string, string, string]> = [
  ["solids", "#f7f7f7", "white", "Brilliant White 112"],
  ["solids", "#e9e0d2", "cream", "Alabaster 115, RAL 9001 Cream"],
  ["solids", "#cecdc1", "grey", "Arctic Grey 471, Pantone 13-4403 TPG"],
  ["solids", "#cbbe89", "beige", "Beige 141"],
  ["solids", "#364a4b", "charcoal", "Charcoal 277"],
  ["solids", "#000106", "black", "Black 401"],
  ["solids", "#4b3c22", "brown", "Chocolate 181"],
  ["solids", "#cb1432", "red", "Red 203"],
  ["solids", "#f25930", "orange", "Orange 213"],
  ["solids", "#ebe036", "yellow", "Yellow 229"],
  ["solids", "#009956", "green", "Grass Green 250"],
  ["solids", "#005da0", "blue", "Electric Blue 291"],
  ["solids", "#aacccd", "blue", "Sky Grey 273, drawn a pale blue"],
  ["solids", "#a175a2", "purple", "Lilac 285"],
  ["solids", "#f04e8a", "pink", "Barbie Pink 173"],
  ["solids", "#fee7e1", "pink", "Pink 168, a very pale pink"],
  ["solids", "#bb5557", "red", "Dull Pink 219, drawn a dusty red"],
  ["unicore", "#c83428", "red", "Unicore Red Dynasty 90204: a colour through the core, drawn from its picture"],
  ["woodgrains", "#f7f2d8", "white", "White Ash 5310"],
  ["woodgrains", "#dbc5ab", "light_oak", "Samara Oak 5524"],
  ["woodgrains", "#a9977b", "natural_oak", "Urban Oak 5395"],
  ["woodgrains", "#b3935d", "warm_oak", "Tuscany Oak 5762, golden"],
  ["woodgrains", "#c8764a", "warm_oak", "Wild Cherry 652, reddish"],
  ["woodgrains", "#8b6d57", "brown", "Lorraine Walnut 5004"],
  ["woodgrains", "#50423a", "walnut", "American Walnut 608"],
  ["woodgrains", "#3d1d0d", "walnut", "Vancouver Maple 693: very dark, but brown"],
  ["woodgrains", "#b3b3a8", "grey", "Glacier 5416"],
  ["woodgrains", "#3d3936", "charcoal", "Reco Wood 1046"],
  ["woodgrains", "#120d0b", "black", "Albin Oak Black 5765"],
  ["abstracts", "#d8dbe0", "unknown", "Ahuna Marble 5778: a pattern has no one colour"],
  ["metals", "#e0ddda", "unknown", "Silver Metal 9031"],
  ["pearlescents", "#9b9b9b", "unknown", "a pearlescent"],
];
for (const [category, colour, family, design] of examples) {
  assert.equal(getLaminateColourFamily(category, colour), family, `${design} (${colour}) is ${family}`);
}
assert.equal(getLaminateColourFamily("solids", "not a colour"), "unknown");

// Greenlam's 375 designs: every family is in the vocabulary, and the totals are pinned.
const familyCounts: Record<string, number> = {};
for (const collection of CABINET_LAMINATE_COLLECTIONS) {
  for (const [, , , category, colour] of collection.laminates) {
    const family = getLaminateColourFamily(category, colour);
    assert.ok(SURFACE_MATERIAL_VOCABULARY.color_family.includes(family), `${family} is a colour family`);
    familyCounts[family] = (familyCounts[family] ?? 0) + 1;
  }
}
assert.deepEqual(familyCounts, {
  unknown: 79, grey: 53, brown: 31, walnut: 31, light_oak: 28, white: 24, warm_oak: 22, blue: 18, charcoal: 16,
  natural_oak: 12, green: 11, black: 10, cream: 8, red: 7, yellow: 6, pink: 6, purple: 6, beige: 4, orange: 3,
});

// The wall panels carry it, so the surface browser's colour filter finds them.
const panels = buildLaminateWallPanelMaterials();
const laminateById = new Map(
  CABINET_LAMINATE_COLLECTIONS.flatMap((collection) => collection.laminates.map((laminate) => [laminate[0], laminate] as const))
);
for (const panel of panels) {
  const laminate = laminateById.get(panel.surface_material.material_id);
  assert.ok(laminate, `${panel.surface_material.material_id} is a laminate`);
  assert.equal(panel.classification.color_family, getLaminateColourFamily(laminate[3], laminate[4]));
}
assert.equal(
  panels.filter((panel) => panel.classification.color_family !== "unknown").length,
  295,
  "of 374 panels, the 295 solids, Unicore designs and woodgrains have a colour; the 79 patterns, metals and pearlescents don't"
);

console.log(`Laminate colour family checks passed (${examples.length} examples, ${panels.length} wall panels).`);
