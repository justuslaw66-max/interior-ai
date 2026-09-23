import assert from "node:assert/strict";
import { CATALOG_ITEMS } from "../lib/catalog";
import {
  cleanCatalogFamilyTitle,
  getCatalogConfigurationLabel,
  groupCatalogItems,
} from "../lib/catalog/family-grouping";

const template = Object.values(CATALOG_ITEMS)[0];
assert(template, "Catalog fixture is required");

const makeDawson = (id: string, orientation: "Left" | "Right") => ({
  ...template,
  id,
  slug: id,
  title: `Dawson Chaise Sectional Sofa (${orientation} Facing)`,
  category: "sofa" as const,
  commerce: {
    type: "affiliate" as const,
    data: {
      url: "https://www.castlery.com/sg/products/dawson-chaise-sectional-sofa",
      retailer: "Castlery",
    },
  },
  metadata: {
    ...template.metadata,
    brand: "Castlery",
    productName: `Dawson Chaise Sectional Sofa (${orientation} Facing)`,
  },
});

const right = makeDawson("dawson-right", "Right");
const left = makeDawson("dawson-left", "Left");
const groups = groupCatalogItems([left, right]);

assert.equal(groups.length, 1, "left and right orientations should share one catalog card");
assert.equal(groups[0].representative.id, right.id, "right-facing hero should be the stable representative");
assert.equal(groups[0].displayTitle, "Dawson Chaise Sectional Sofa");
assert.equal(getCatalogConfigurationLabel(left), "Left facing");
assert.equal(getCatalogConfigurationLabel(right), "Right facing");
assert.equal(
  cleanCatalogFamilyTitle("Dawson Wide Chaise Sectional Sofa (Left Facing)"),
  "Dawson Wide Chaise Sectional Sofa",
);

console.log("✅ Catalog family grouping passed");
