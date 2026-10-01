import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { ShareShoppingSection } from "../app/share/[shareToken]/(presentation)/ShareShoppingSection";
import { buildSharePageRooms, sharePageSummary } from "../lib/public-share-page-model";
import type { RoomSnapshot } from "../lib/room-types";
import type { ShoppingList, ShoppingListLine } from "../lib/shopping-list";

// A shared design's page and its export page (UX audit SX7 and SX8, phase 4e): the page is for the
// person the design was shared with. Three actions, the 3D view, the rooms, the Shopping list
// grouped by shop, notes, and "Start your own design"; the export page has one Download PDF.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const line = (instanceId: string, roomId: string, price: number, extra: Partial<ShoppingListLine> = {}): ShoppingListLine => ({
  instanceId,
  roomId,
  roomName: roomId === "living" ? "Living Room" : "Bedroom",
  productId: `product-${instanceId}`,
  variantId: "default",
  title: `Product ${instanceId}`,
  detail: "Oak",
  imageUrl: null,
  fallbackImageUrl: null,
  addCount: 1,
  price,
  priceLabel: price > 0 ? `S$${price}` : "Price on request",
  buyUrl: price > 0 ? `https://www.castlery.com/sg/products/${instanceId}` : null,
  shopifyVariantId: null,
  cheaperSwap: null,
  ...extra,
});

const castleryLines = [line("a", "living", 1200), line("b", "living", 300), line("c", "bedroom", 500)];
const list: ShoppingList = {
  retailers: [{ id: "castlery.com", name: "Castlery", lines: castleryLines, subtotal: 2000 }],
  checkoutHere: null,
  unavailable: [line("d", "bedroom", 0)],
  total: 2000,
  productCount: 4,
};

// Rooms: name, size, products and subtotal; the storey only when there's more than one.
const room = (id: string, name: string, floorLevel = 1): RoomSnapshot =>
  ({
    id,
    name,
    roomType: "living",
    floorLevel,
    geometry: { width: 4.5, depth: 3, wallThickness: 0.12 },
    items: [],
    zones: [],
    savedViews: [],
  }) as unknown as RoomSnapshot;
const rooms = buildSharePageRooms([room("living", "Living Room"), room("bedroom", "Bedroom")], list);
assert.deepEqual(
  rooms.map(({ name, floorLabel, sizeLabel, productCount, productLabel, subtotal }) => ({ name, floorLabel, sizeLabel, productCount, productLabel, subtotal })),
  [
    { name: "Living Room", floorLabel: null, sizeLabel: "4.5 × 3 m", productCount: 2, productLabel: "2 products", subtotal: 1500 },
    { name: "Bedroom", floorLabel: null, sizeLabel: "4.5 × 3 m", productCount: 2, productLabel: "2 products", subtotal: 500 },
  ]
);
const twoFloors = buildSharePageRooms([room("living", "Living Room"), room("bedroom", "Bedroom", 2)], list);
assert.deepEqual(twoFloors.map((entry) => entry.floorLabel), ["Level 1", "Level 2"]);
assert.equal(sharePageSummary(2, list), "2 rooms · 4 products · S$2,000");
assert.equal(sharePageSummary(1, { ...list, total: 0, productCount: 0 }), "1 room · 0 products");

// The Shopping list: each shop with its subtotal, the other-shops note, then what isn't sold online.
const markup = renderToStaticMarkup(<ShareShoppingSection list={list} checkoutLines={[]} />);
assert.match(markup, /<section id="shopping-preview"/);
assert.match(markup, /<h2 id="share-shopping-heading"[^>]*>Shopping list<\/h2>/);
assert.match(markup, /<section[^>]*aria-label="Castlery"[\s\S]*?<h3[^>]*>Castlery<\/h3>[\s\S]*?3 products(?:<!-- -->)? · castlery\.com[\s\S]*?S\$2,000/);
assert.match(markup, /Products sold by other shops open on their own websites\./);
assert.match(markup, /<section[^>]*aria-label="Not sold online yet"/);
assert.equal(markup.match(/View product<span class="sr-only">/g)?.length, 3, "A link for each product a shop sells.");
assert.doesNotMatch(markup, /Checkout here|share-live-commerce/, "Checkout here stays hidden without Shopify products.");
assert.doesNotMatch(markup, /Checkout readiness|Missing commerce mapping|Valid but excluded|Cart-ready|Needs commerce/);

const withHere = renderToStaticMarkup(
  <ShareShoppingSection
    list={{ ...list, checkoutHere: { lines: [line("e", "living", 90, { shopifyVariantId: "gid://shopify/ProductVariant/1" })], subtotal: 90 } }}
    checkoutLines={[{ merchandiseId: "gid://shopify/ProductVariant/1", quantity: 1, productId: "product-e" } as never]}
  />
);
assert.match(withHere, /aria-label="Checkout here"[\s\S]*?data-testid="share-live-commerce"/);

const empty = renderToStaticMarkup(
  <ShareShoppingSection list={{ retailers: [], checkoutHere: null, unavailable: [], total: 0, productCount: 0 }} checkoutLines={[]} />
);
assert.match(empty, /No products added to this shared design yet/);
assert.doesNotMatch(empty, /share-checkout-readiness/);

// The header: three actions, a summary line that links to the Shopping list, no Beta badge,
// reference hash or handoff card; the plans and schedules sit with the rooms.
const actions = read("components/SharePageActions.tsx");
assert.deepEqual(
  [...actions.matchAll(/data-testid="(share-[a-z-]+)"/g)].map((match) => match[1]),
  ["share-page-actions", "share-copy-link", "share-download-pdf", "share-copy-to-edit"]
);
assert.doesNotMatch(actions, /\(Beta\)|navigator\.share|data-testid="share-(?:native-share|export-pack|shopping-list)"/);
const header = read("app/share/[shareToken]/(presentation)/ShareHeader.tsx");
assert.match(header, /data-testid="share-client-handoff-summary"[\s\S]*?\{summary\}[\s\S]*?href="#shopping-preview"[\s\S]*?data-testid="share-shopping-list"[\s\S]*?min-h-11/);
assert.match(read("app/share/[shareToken]/(presentation)/ShareRoomsSection.tsx"), /<ShareExportPackLink shareToken=\{shareToken\} \/>/);
assert.match(read("app/share/[shareToken]/(presentation)/ShareExportPackLink.tsx"), /<Link[\s\S]*?data-testid="share-export-pack"[\s\S]*?Plans and schedules/);

const page = read("app/share/[shareToken]/(presentation)/page.tsx");
const order = ["<ShareHeader", "<ShareViewer", "<ShareFloorPlanPreview", "<ShareRoomsSection", "<ShareShoppingSection", "<ShareNotes", "<ShareFooterCTA"];
assert.deepEqual(order.map((tag) => page.indexOf(tag)), [...order.map((tag) => page.indexOf(tag))].sort((a, b) => a - b), "Header, 3D, plan, rooms, Shopping list, notes, footer.");
assert.ok(order.every((tag) => page.includes(tag)));
for (const source of [page, header, read("app/share/[shareToken]/(presentation)/ShareShoppingSection.tsx")]) {
  assert.doesNotMatch(source, /Reference \{|Practical checks|Checkout readiness|Health|Open export pack|share-presentation-views/);
}
assert.match(read("components/ShareFooterCTA.tsx"), /Made with Interior AI<\/div>[\s\S]*?Start your own design/);
assert.doesNotMatch(read("components/ShareFooterCTA.tsx"), /\(beta\)/i);

// The export page (SX8): one Download PDF with the watermark note; Style and Budget only when set.
const exportPage = read("app/share/[shareToken]/export/page.tsx");
assert.match(exportPage, /\{publicDesign\.style \? <div>Style: \{publicDesign\.style\}<\/div> : null\}/);
assert.match(exportPage, /\{publicDesign\.budget \? <div>Budget: \{publicDesign\.budget\}<\/div> : null\}/);
assert.doesNotMatch(exportPage, /Not specified|Export Access|Open PDF download|PrintButton/);
assert.doesNotMatch(read("app/share/[shareToken]/export/pdf/route.ts"), /Not specified/);

console.log("Share page checks passed.");
