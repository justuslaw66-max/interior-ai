import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  ShoppingBuyListDialog,
  type ShoppingBuyListDialogProps,
} from "../components/editor/shop/ShoppingBuyListDialog";
import { CATALOG_ITEMS } from "../lib/catalog";
import type { DesignItem } from "../lib/room-types";
import { buildShoppingList, type ShoppingListLine, type ShoppingRetailer } from "../lib/shopping-list";
import {
  SHOPPING_BUY_LIST_DIALOG_ID,
  SHOPPING_FALLBACK_FOCUS_ID,
  shoppingBuyListReturnFocusIds,
  shoppingBuyOpenerId,
} from "../lib/shopping-list-buy";

// CH-0015G's Retailer gate prerequisite, re-pinned in UX phase 3c-2: buying at a retailer from the
// Shopping list (audit finding FU8; J's answer to Q2, 27 Sep). "Buy at <shop>" opens a shop's only
// product directly, or the shop's buy list, where each Open opens one tab. The browser matrix is
// tests/required/retailer-confirmation-accessibility.spec.ts.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noop = () => undefined;

// Stable ids: each shop's Buy is named by its website; the buy list has its own; focus falls back
// to the current step's tab when the Buy button has gone.
assert.equal(shoppingBuyOpenerId("castlery.com"), "shopping-buy-castlery.com");
assert.equal(shoppingBuyOpenerId("a shop/sg"), "shopping-buy-a%20shop%2Fsg");
assert.equal(SHOPPING_BUY_LIST_DIALOG_ID, "shopping-buy-list-dialog");
assert.equal(SHOPPING_FALLBACK_FOCUS_ID, "editor-command-workspace-action");
assert.deepEqual(shoppingBuyListReturnFocusIds("castlery.com"), ["shopping-buy-castlery.com", "editor-command-workspace-action"]);

// The buy list: closed, it renders nothing; open, it is a modal named for the shop, with one row and
// one Open per product, how many to add, progress, a status line for blocked tabs, and Done.
const line = (instanceId: string, title: string, addCount = 1): ShoppingListLine => ({
  instanceId, roomId: "living", roomName: "Living Room", productId: `${instanceId}-product`, variantId: `${instanceId}-variant`,
  title, detail: "Synthetic finish", imageUrl: null, fallbackImageUrl: null, addCount, price: 100, priceLabel: "S$100",
  buyUrl: `https://safe-retailer.test/${instanceId}`, shopifyVariantId: null, cheaperSwap: null,
});
const retailer: ShoppingRetailer = {
  id: "safe-retailer.test",
  name: "Safe Retailer",
  subtotal: 300,
  lines: [line("a", "Alpha Armchair", 3), line("b", "Beta Side Table"), line("c", "Gamma Floor Lamp")],
};
const dialog = (props: Partial<ShoppingBuyListDialogProps> = {}) =>
  renderToStaticMarkup(createElement(ShoppingBuyListDialog, {
    retailer, openedIds: new Set<string>(), notice: null, busy: false, onOpenLine: noop, onClose: noop, ...props,
  }));
assert.equal(dialog({ retailer: null }), "");
const open = dialog({ openedIds: new Set(["a"]) });
for (const expected of [
  'role="dialog"',
  'aria-modal="true"',
  `id="${SHOPPING_BUY_LIST_DIALOG_ID}"`,
  'data-testid="shopping-buy-list"',
  'aria-label="Close the buy list" data-testid="shopping-buy-list-close"',
  'data-testid="shopping-buy-list-done"',
  ">Buy at Safe Retailer<",
  "Open each product at Safe Retailer and add it to your cart there.",
  "You check out on safe-retailer.test. Prices and stock are confirmed there.",
]) {
  assert.ok(open.includes(expected), `The open buy list must keep ${expected}.`);
}
// The gate's layout test needs Close's ring in WebKit too, where the Tab trap's move isn't focus-visible.
assert.match(
  open,
  /data-testid="shopping-buy-list-close"[^>]*class="[^"]*focus:ring-2 focus:ring-blue-500 focus:ring-offset-2/,
  "The buy list's Close must show its ring on any focus, as the retailer dialog's Close did."
);
assert.match(open, /data-testid="shopping-buy-list-progress"[^>]*>1 of 3 opened</);
assert.equal((open.match(/data-testid="shopping-buy-list-row"/g) ?? []).length, 3);
assert.equal((open.match(/data-testid="shopping-buy-list-open"/g) ?? []).length, 3);
assert.match(open, /data-instance-id="a" data-opened="true"/);
assert.match(open, /data-instance-id="b" data-opened="false"/);
assert.match(open, /aria-label="Open Alpha Armchair at Safe Retailer again"/);
assert.match(open, /aria-label="Open Beta Side Table at Safe Retailer"/);
// How many to add has a line of its own, so a long variant name can't cut it off.
assert.match(open, /data-instance-id="a"[\s\S]*?>Synthetic finish<\/div><div data-testid="shopping-buy-list-add"[^>]*>Add 3 to your cart<\/div>/);
assert.match(open, /data-instance-id="b"[\s\S]*?data-testid="shopping-buy-list-add"[^>]*>Add 1 to your cart<\/div>/);
assert.match(open, /<p role="status" data-testid="shopping-buy-list-notice" class="sr-only"><\/p>/);
assert.match(
  dialog({ notice: { message: "Blocked.", tone: "warning" } }),
  /<p role="status" data-testid="shopping-buy-list-notice" class="[^"]*bg-amber-50[^"]*">Blocked\.<\/p>/
);
assert.equal(
  (dialog({ busy: true }).match(/data-testid="shopping-buy-list-open" aria-label="[^"]+" disabled=""/g) ?? []).length,
  3,
  "A checkout starting disables every Open."
);

// What a shop's list holds: shops by website (two spellings, one shop), each product once with how
// many to add (a set counts once), and products without a buy link apart, with no Buy.
const template = Object.values(CATALOG_ITEMS)[0];
const templateVariant = template.variants[0];
const synthetic = (key: string, retailerName: string, url: string, price: number, set?: { url: string; price: number }) => ({
  ...template,
  id: `${key}-product`,
  slug: `${key}-product`,
  title: `${key} product`,
  defaultVariantId: `${key}-variant`,
  variants: [{
    ...templateVariant,
    id: `${key}-variant`,
    label: "Synthetic finish",
    affiliateUrl: url || undefined,
    priceHint: price,
    available: true,
    purchaseOptions: set ? [{ id: `${key}-set`, label: "Set of 2", quantity: 2, affiliateUrl: set.url, priceHint: set.price }] : undefined,
  }],
  commerce: { type: "affiliate" as const, data: { retailer: retailerName, url, priceHint: price } },
});
const catalogItems = {
  ...CATALOG_ITEMS,
  "alpha-product": synthetic("alpha", "Safe Retailer", "https://safe-retailer.test/alpha", 420),
  "beta-product": synthetic("beta", "Safe Retailer Singapore", "https://www.safe-retailer.test/beta", 180, {
    url: "https://safe-retailer.test/beta-set", price: 320,
  }),
  "delta-product": synthetic("delta", "Second Retailer", "https://second-retailer.test/delta", 260),
  "missing-product": synthetic("missing", "Missing Link Retailer", "", 75),
};
const placed = (key: string, extra: Partial<DesignItem> = {}) =>
  ({ instanceId: `${key}-line`, productId: `${key}-product`, variantId: `${key}-variant`, position: [0, 0, 0], ...extra }) as DesignItem;
const list = buildShoppingList({
  rooms: [
    { id: "living", name: "Living Room", items: [placed("alpha", { qty: 3 }), placed("missing"), placed("delta")] },
    { id: "bedroom", name: "Bedroom", items: [placed("beta", { purchaseOptionId: "beta-set" })] },
  ],
  style: "modern",
  catalogItems,
});
assert.deepEqual(list.retailers.map(({ id, name }) => [id, name]), [
  ["safe-retailer.test", "Safe Retailer"],
  ["second-retailer.test", "Second Retailer"],
]);
assert.deepEqual(
  list.retailers[0].lines.map(({ instanceId, roomName, addCount, buyUrl }) => [instanceId, roomName, addCount, buyUrl]),
  [
    ["alpha-line", "Living Room", 3, "https://safe-retailer.test/alpha"],
    ["beta-line", "Bedroom", 1, "https://safe-retailer.test/beta-set"],
  ]
);
assert.equal(list.retailers[0].subtotal, 3 * 420 + 320);
assert.deepEqual(list.unavailable.map(({ instanceId, buyUrl }) => [instanceId, buyUrl]), [["missing-line", null]]);
assert.equal(list.checkoutHere, null);

// Buying: a shop's only product opens directly, several open the buy list, and each Open opens one
// tab. The tab opens at the click, before the click is recorded, so no pop-up blocker stops it; it
// loses its way back to this page; a blocked tab records no click. A failed record still opens the
// retailer's own address, with the click key and campaign tags when there are some.
const buy = read("lib/shopping-list-buy.ts");
assert.match(buy, /const tab = window\.open\("", "_blank"\);[\s\S]*?if \(!tab\) \{[\s\S]*?result: "blocked"[\s\S]*?return false;\s+\}\s+tab\.opener = null;\s+const url = await trackedRetailerUrl/);
assert.match(buy, /fetch\("\/api\/track\/click"/);
assert.match(buy, /body: JSON\.stringify\(\{ designId: designId \?\? null, productId: line\.productId, variantId: line\.variantId \}\)/);
assert.match(buy, /url\.searchParams\.set\("clickKey", data\.clickKey\)/);
assert.match(buy, /url\.searchParams\.set\("utm_source", "interior-ai"\);\s+url\.searchParams\.set\("utm_medium", "affiliate"\);/);
assert.match(buy, /\} catch \{\s+return line\.buyUrl;\s+\}/);
assert.doesNotMatch(buy, /noopener|setTimeout/, "No burst of tabs, paced or not.");
const hook = read("lib/useShoppingListBuy.ts");
assert.match(hook, /if \(retailer\.lines\.length === 1\) \{\s+void openLine\(retailer\.lines\[0\]\);\s+return;\s+\}\s+setRetailerId\(id\);/);
assert.match(hook, /setNotice\(\{ message: BLOCKED_TAB, tone: "warning" \}\)/);
// Checkout here stays the Guest Save Prompt's to interrupt.
assert.match(hook, /if \(isGuest\) \{\s+openGuestPrompt\("checkout"/);

// The buy list is an EditorDialog on the page body, over the whole editor, and a closed list
// returns focus to its Buy button.
const dialogSource = read("components/editor/shop/ShoppingBuyListDialog.tsx");
assert.match(dialogSource, /<EditorDialog[\s\S]*?returnFocusIds=\{returnFocusIds\}[\s\S]*?cancelFocusRestorationOnUnmount[\s\S]*?manageBackground/);
assert.match(dialogSource, /const returnFocusIds = useMemo\(/, "One focus plan per opening.");
assert.match(read("components/editor/shop/ShoppingListPage.tsx"), /createPortal\(\s*<ShoppingBuyListDialog[\s\S]*?document\.body\s*\)/);

console.log("Retailer buy list static checks passed.");
