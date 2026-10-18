import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

import { parseDesignNotesInput } from "@/lib/ai/design-notes-contract";
import { buildDesignNotesRequest } from "@/lib/ai/design-notes-request";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { getItemPrice } from "@/lib/design-page-utils";
import type { DesignItem } from "@/lib/room-types";

const read = (file: string) => readFileSync(path.join(process.cwd(), file), "utf8");

function designItem(productId: string, instanceId: string, qty?: number): DesignItem {
  const product = CATALOG_ITEMS[productId];
  assert.ok(product, `catalogue has ${productId}`);
  return { instanceId, productId, variantId: product.defaultVariantId ?? product.variants[0]?.id ?? "default", position: [0, 0, 0], qty };
}

// 1. The page tells AI notes what each product is (18 Oct 2026). Before, the page sent productId, quantity and price, and
//    the contract kept only the price.
function testItemsReachTheModel() {
  const bed = Object.values(CATALOG_ITEMS).find((item) => item.category === "bed");
  const table = Object.values(CATALOG_ITEMS).find((item) => item.category === "coffee_table");
  assert.ok(bed && table, "the catalogue has a bed and a coffee table");
  const body = buildDesignNotesRequest({
    designId: "design-1",
    items: [designItem(bed.id, "bed-1", 2), designItem(table.id, "table-1")],
    catalog: CATALOG_ITEMS,
    designerMode: false,
  });
  const parsed = parseDesignNotesInput(JSON.parse(JSON.stringify(body)));
  assert.ok(parsed, "the page's request passes the contract");
  const [first, second] = parsed.design.items;
  assert.deepEqual(
    {
      id: first.id,
      productId: first.productId,
      name: first.name,
      category: first.category,
      quantity: first.quantity,
      price: first.price,
      locked: first.locked,
    },
    {
      id: "bed-1",
      productId: bed.id,
      name: bed.title,
      category: "bed",
      quantity: 2,
      price: getItemPrice(bed),
      locked: false,
    },
    "the bed keeps its instance id, product, name, category, quantity and price"
  );
  assert.deepEqual(first.size, { width: bed.dimsMm.w / 1000, height: bed.dimsMm.h / 1000, depth: bed.dimsMm.d / 1000 });
  assert.equal(second.quantity, 1, "a product without a quantity counts once");
  assert.deepEqual(parsed.design.categories, ["bed", "coffee_table"]);
  assert.equal(parsed.design.budget, String(getItemPrice(bed) * 2 + getItemPrice(table)));
  assert.equal(parsed.mode, "homeowner");

  for (const quantity of [0, 1.5, 1000, "2"]) {
    assert.equal(
      parseDesignNotesInput({ design: { items: [{ id: "a", quantity }] } }),
      null,
      `quantity ${JSON.stringify(quantity)} is refused`
    );
  }
  assert.equal(
    parseDesignNotesInput({ design: { items: [{ name: "x".repeat(121) }] } })?.design.items[0].name,
    undefined,
    "a name over 120 characters is left out"
  );

  assert.match(read("lib/useDesignPageAiNotes.ts"), /buildDesignNotesRequest\(\{ designId, items, catalog: CATALOG_ITEMS, designerMode/);
  const route = read("app/api/ai/design-notes/route.ts");
  for (const key of ["productId", "name", "quantity"]) {
    assert.match(route, new RegExp(`${key}: i\\.${key},`), `the cache hash includes each item's ${key}`);
  }
}

testItemsReachTheModel();
console.log("AI notes checks passed: the page's items reach the model.");
