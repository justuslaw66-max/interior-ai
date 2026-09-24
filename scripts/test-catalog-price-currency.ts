import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { CATALOG_ITEMS } from "@/lib/catalog";
import { buildCanonicalProductContract } from "@/lib/canonical-product-contract";

// Catalogue prices are Singapore dollars, and lib/money-format.ts shows them as "S$1,738". The
// fields used to be named price_usd / priceUsd, and a name that says USD invites a "fix" that
// converts the numbers or formats them as US dollars. They are price_sgd / priceSgd now. This
// guard keeps USD names and the USD currency code out of the catalogue, the app and its exports.
//
// Cabinetry quotes (features/cabinetry) are priced separately and still say USD. Changing them is
// a separate decision, so they are outside the currency-code check.

const root = process.cwd();
const SOURCE_ROOTS = ["app", "components", "features", "lib"];
const CURRENCY_CODE_EXEMPT = "features/cabinetry/";
const USD_NAMED_FIELD = /\b\w*_usd\b|[a-z0-9]Usd\b/;
const USD_CURRENCY_CODE = /\bUSD\b/;

function filesUnder(directory: string, pattern: RegExp): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : filesUnder(relative, pattern);
    return pattern.test(entry.name) ? [relative] : [];
  });
}

const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const sourceFiles = SOURCE_ROOTS.flatMap((directory) => filesUnder(directory, /\.(tsx?|mjs|js)$/));
const catalogFiles = filesUnder("catalog", /\.ya?ml$/);
assert.ok(sourceFiles.length > 1000, `The guard must read the app; it found ${sourceFiles.length} files.`);
assert.ok(catalogFiles.length > 1000, `The guard must read the catalogue; it found ${catalogFiles.length} files.`);
assert.ok(
  catalogFiles.some((file) => /^\s*price_sgd:/m.test(read(file))),
  "The catalogue should record its prices as price_sgd."
);

const violations = [...sourceFiles, ...catalogFiles].flatMap((file) =>
  read(file)
    .split("\n")
    .flatMap((line, index) => [
      ...(USD_NAMED_FIELD.test(line) ? [`${file}:${index + 1} names a price in USD: ${line.trim()}`] : []),
      ...(!file.startsWith(CURRENCY_CODE_EXEMPT) && USD_CURRENCY_CODE.test(line)
        ? [`${file}:${index + 1} uses the USD currency code: ${line.trim()}`]
        : []),
    ])
);
assert.deepEqual(
  violations,
  [],
  `Catalogue prices are Singapore dollars: name them *_sgd / *Sgd and format them with formatSgd.\n${violations.join("\n")}`
);

// The downloaded shopping list labels its price columns in SGD.
const csvDownload = read("app/share/[shareToken]/export/ShoppingCsvDownload.tsx");
for (const header of ["Unit price SGD", "Line total SGD", "Room subtotal SGD"]) {
  assert.ok(csvDownload.includes(`"${header}"`), `The shopping list CSV should have a "${header}" column.`);
}

// The admin catalogue editor can still edit the price field under its new name.
assert.match(
  read("app/api/admin/catalog/[catalogItemId]/route.ts"),
  /const EDITABLE_YAML_FIELDS = \[[\s\S]*?"price_sgd",[\s\S]*?\] as const;/,
  "The admin catalogue route should accept price_sgd."
);

// A catalogue product with no currency code of its own is sold in Singapore dollars.
const product = CATALOG_ITEMS["coffee-real-castlery-hugg-nesting-square-performance-basalt-closed"];
assert.ok(product, "The Hugg nesting table should be in the catalogue.");
assert.equal(product.metadata?.currencyCode, undefined, "The Hugg nesting table should rely on the default currency.");
assert.equal(buildCanonicalProductContract(product).liveCommerce.currency, "SGD");

console.log(
  `Catalogue price currency checks passed (${sourceFiles.length} source files, ${catalogFiles.length} catalogue files).`
);
