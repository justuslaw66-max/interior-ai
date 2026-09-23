import assert from "node:assert/strict";

import {
  NIPPON_PAINT_COLOURS,
  NIPPON_PAINT_FAMILIES,
} from "@/lib/nippon-paint-colours";
import {
  CURATED_WALL_PAINT_SWATCHES,
  WALL_PAINT_FAMILY_FILTERS,
} from "@/lib/wall-paint";

const publicFamilyIds = WALL_PAINT_FAMILY_FILTERS
  .filter((family) => family.id !== "all")
  .map((family) => family.id);

assert.deepEqual(
  publicFamilyIds,
  [...NIPPON_PAINT_FAMILIES],
  "The public filter row must match Nippon Paint Singapore's official family list and order."
);
assert.equal(
  publicFamilyIds.includes("cream" as never),
  false,
  "Cream is not an official Nippon Paint Singapore colour family."
);
assert.equal(
  publicFamilyIds.includes("charcoal" as never),
  false,
  "Charcoal is not an official Nippon Paint Singapore colour family."
);

const officialFamilies = new Set<string>(NIPPON_PAINT_FAMILIES);
for (const swatch of CURATED_WALL_PAINT_SWATCHES) {
  assert.equal(
    officialFamilies.has(swatch.family),
    true,
    `Curated swatch ${swatch.id} must map to an official Nippon family.`
  );
}
for (const colour of NIPPON_PAINT_COLOURS) {
  assert.equal(
    officialFamilies.has(colour.family),
    true,
    `Nippon colour ${colour.id} has an unsupported family.`
  );
}

console.log(
  `Wall paint family catalog checks passed (${publicFamilyIds.length} official families).`
);
