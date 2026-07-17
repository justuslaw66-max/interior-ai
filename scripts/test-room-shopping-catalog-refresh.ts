import assert from "node:assert/strict";

import { CATALOG_ITEMS } from "@/lib/catalog";
import {
  resolveRoomShoppingItems,
  summarizeShoppingRooms,
} from "@/lib/room-shopping";

const template = Object.values(CATALOG_ITEMS)[0];
assert.ok(template, "The catalog fixture requires at least one product");

const productId = "restored-live-catalog-product";
const title = "Restored Live Catalog Product";
const catalogItems = {
  [productId]: {
    ...template,
    id: productId,
    title,
  },
};
const room = {
  id: "room_living",
  name: "Living Room",
  roomType: "living" as const,
  items: [
    {
      instanceId: "restored-live-catalog-item",
      productId,
      variantId: template.defaultVariantId,
      position: [0, 0, 0] as [number, number, number],
    },
  ],
};

const [summary] = summarizeShoppingRooms(
  [room],
  room.id,
  catalogItems
);
assert.deepEqual(summary.previewNames, [title]);
assert.equal(summary.needsReviewCount, 0);

const [shoppingItem] = resolveRoomShoppingItems(room, catalogItems);
assert.equal(shoppingItem.title, title);
assert.equal(shoppingItem.productId, productId);

console.log("Room-shopping catalog refresh checks passed.");
