import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ShoppingListPage, type ShoppingListPageProps } from "../components/editor/shop/ShoppingListPage";
import {
  SHOPPING_LIST_TITLE_ID,
  focusAfterShoppingListEdit,
} from "../components/editor/shop/useShoppingListFocus";
import {
  removalFocusCandidates,
  shoppingListLines,
  type ShoppingList,
  type ShoppingListLine,
} from "../lib/shopping-list";

// CH-0015A's Cart gate prerequisite, re-pinned in UX phase 3c-2 (J, 27 Sep): the Selection Tray is
// gone, and the gate owns the Shopping list, the page Shop shows over the canvas (audit findings
// FU7, FU8). The browser matrix is tests/required/cart-overlay-accessibility.spec.ts; buying at a
// shop is the Retailer gate's (test-retailer-confirmation-static).

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noop = () => undefined;

const line = (instanceId: string, title: string, group = "castlery.com"): ShoppingListLine => ({
  instanceId, roomId: "living", roomName: "Living Room", productId: `${instanceId}-product`, variantId: `${instanceId}-variant`,
  title, detail: "Synthetic finish", imageUrl: null, fallbackImageUrl: null, addCount: 1, price: 100, priceLabel: "S$100",
  buyUrl: group === "unavailable" ? null : `https://${group}/${instanceId}`, shopifyVariantId: group === "here" ? "gid://1" : null,
  cheaperSwap: null,
});
const list: ShoppingList = {
  retailers: [
    { id: "castlery.com", name: "Castlery", subtotal: 200, lines: [line("a", "Alpha Armchair"), line("b", "Beta Side Table")] },
    { id: "safe-retailer.test", name: "Safe Retailer", subtotal: 100, lines: [line("c", "Gamma Lamp", "safe-retailer.test")] },
  ],
  checkoutHere: { subtotal: 100, lines: [line("d", "Delta Rug", "here")] },
  unavailable: [line("e", "Epsilon Shelf", "unavailable")],
  total: 400,
  productCount: 5,
};

// The page's reading order: each shop, then Checkout here, then Not sold online yet.
assert.deepEqual(shoppingListLines(list).map((entry) => entry.instanceId), ["a", "b", "c", "d", "e"]);

// Removing a product: the next product's Remove, else the one before it, nearest first.
assert.deepEqual(removalFocusCandidates(list, "a"), ["b", "c", "d", "e"]);
assert.deepEqual(removalFocusCandidates(list, "c"), ["d", "e", "b", "a"]);
assert.deepEqual(removalFocusCandidates(list, "e"), ["d", "c", "b", "a"]);
assert.deepEqual(removalFocusCandidates(list, "missing"), []);
const only: ShoppingList = { retailers: [{ ...list.retailers[0], lines: [line("a", "Alpha Armchair")] }], checkoutHere: null, unavailable: [], total: 100, productCount: 1 };
assert.deepEqual(removalFocusCandidates(only, "a"), []);

// Focus moves once the list shows the edit, on a fake page with the rows' controls.
function fakePage(lines: readonly ShoppingListLine[], swaps: readonly string[] = []) {
  const focused: string[] = [];
  const control = (name: string) => ({ focus: () => focused.push(name) });
  const rows = lines.map((entry) => ({
    dataset: { instanceId: entry.instanceId },
    querySelector: (selector: string) =>
      selector === '[data-testid="shopping-list-remove"]'
        ? control(`remove:${entry.instanceId}`)
        : selector === '[data-testid="shopping-list-swap"]' && swaps.includes(entry.instanceId)
          ? control(`swap:${entry.instanceId}`)
          : null,
  }));
  const page = {
    querySelectorAll: (selector: string) => (selector === '[data-testid="shopping-list-row"]' ? rows : []),
    ownerDocument: { getElementById: (id: string) => (id === SHOPPING_LIST_TITLE_ID ? control("heading") : null) },
  } as unknown as HTMLElement;
  return { page, focused };
}
const without = (removed: readonly string[]) => shoppingListLines(list).filter((entry) => !removed.includes(entry.instanceId));
{
  const after = without(["a"]);
  const { page, focused } = fakePage(after);
  focusAfterShoppingListEdit(page, { kind: "remove", instanceId: "a", candidates: removalFocusCandidates(list, "a") }, after);
  assert.deepEqual(focused, ["remove:b"], "Removing the first product focuses the next product's Remove.");
}
{
  const after = without(["e"]);
  const { page, focused } = fakePage(after);
  focusAfterShoppingListEdit(page, { kind: "remove", instanceId: "e", candidates: removalFocusCandidates(list, "e") }, after);
  assert.deepEqual(focused, ["remove:d"], "Removing the last product focuses the one before it.");
}
{
  // A set takes its parts with it: focus skips the lines that went too.
  const after = without(["b", "c"]);
  const { page, focused } = fakePage(after);
  focusAfterShoppingListEdit(page, { kind: "remove", instanceId: "b", candidates: removalFocusCandidates(list, "b") }, after);
  assert.deepEqual(focused, ["remove:d"]);
}
{
  const { page, focused } = fakePage([]);
  focusAfterShoppingListEdit(page, { kind: "remove", instanceId: "a", candidates: removalFocusCandidates(only, "a") }, []);
  assert.deepEqual(focused, ["heading"], "Removing the only product focuses the Shopping list heading.");
}
{
  const lines = shoppingListLines(list);
  const { page, focused } = fakePage(lines);
  focusAfterShoppingListEdit(page, { kind: "remove", instanceId: "a", candidates: removalFocusCandidates(list, "a") }, lines);
  assert.deepEqual(focused, [], "A removal that didn't happen moves nothing.");
}
{
  const swapped = shoppingListLines(list).map((entry) => (entry.instanceId === "a" ? { ...entry, productId: "cheaper-product" } : entry));
  const withSwap = fakePage(swapped, ["a"]);
  focusAfterShoppingListEdit(withSwap.page, { kind: "swap", instanceId: "a", productId: "a-product" }, swapped);
  assert.deepEqual(withSwap.focused, ["swap:a"], "After a swap, focus stays on the row's Swap when there is one.");
  const noSwap = fakePage(swapped);
  focusAfterShoppingListEdit(noSwap.page, { kind: "swap", instanceId: "a", productId: "a-product" }, swapped);
  assert.deepEqual(noSwap.focused, ["remove:a"], "When the cheaper product has no swap, focus goes to the row's Remove.");
  const unchanged = fakePage(shoppingListLines(list));
  focusAfterShoppingListEdit(unchanged.page, { kind: "swap", instanceId: "a", productId: "a-product" }, shoppingListLines(list));
  assert.deepEqual(unchanged.focused, [], "A swap that didn't happen moves nothing.");
}

// The page: a section named by its heading, which can take focus; one Remove per product, named.
const actions: ShoppingListPageProps["actions"] = {
  buyAtRetailer: noop, openLine: noop, closeBuyList: noop, checkoutHere: noop,
  dismissNotice: noop, remove: noop, swapForCheaper: noop, goFurnish: noop,
};
const html = renderToStaticMarkup(createElement(ShoppingListPage, {
  list, canEdit: true, busy: false, notice: null, buyList: { retailer: null, openedIds: new Set<string>() }, actions,
}));
assert.match(html, new RegExp(`<section data-testid="shopping-list-page" aria-labelledby="${SHOPPING_LIST_TITLE_ID}"`));
assert.match(html, new RegExp(`<h1 id="${SHOPPING_LIST_TITLE_ID}" tabindex="-1" class="[^"]*focus-visible:ring-2[^"]*">Shopping list</h1>`));
assert.equal((html.match(/data-testid="shopping-list-row"/g) ?? []).length, 5);
assert.equal((html.match(/data-testid="shopping-list-remove"/g) ?? []).length, 5);
for (const entry of shoppingListLines(list)) {
  assert.match(html, new RegExp(`data-instance-id="${entry.instanceId}"`));
  assert.ok(html.includes(`aria-label="Remove ${entry.title} from the design"`), `${entry.title} keeps a named Remove.`);
}
const rowOrder = Array.from(html.matchAll(/data-testid="shopping-list-row" data-instance-id="([^"]+)"/g), (match) => match[1]);
assert.deepEqual(rowOrder, ["a", "b", "c", "d", "e"], "Rows follow the reading order focus moves through.");

// Wiring: the page wraps Remove and Swap with focus, and the canvas behind Shop is out of reach.
const pageSource = read("components/editor/shop/ShoppingListPage.tsx");
assert.match(pageSource, /const \{ remove, swapForCheaper \} = useShoppingListFocus\(list, actions, pageRef\);/);
assert.match(pageSource, /const rowActions = \{ \.\.\.actions, remove, swapForCheaper \};/);
assert.match(pageSource, /<ShoppingListSections list=\{list\} canEdit=\{canEdit\} actions=\{rowActions\} \/>/);
assert.match(pageSource, /<section ref=\{pageRef\}/);
const focusSource = read("components/editor/shop/useShoppingListFocus.ts");
assert.match(focusSource, /useEffect\(\(\) => \{[\s\S]*?focusAfterShoppingListEdit\(pageRef\.current, pending, shoppingListLines\(list\)\);\s*\}, \[list, pageRef\]\);/);
const workspace = read("components/editor/design-page/DesignPageWorkspace.tsx");
assert.match(workspace, /<CanvasBehindPage covered=\{panelRegionModel\.state\.shopping !== null\}><DesignPageSceneRegion/);
const region = read("components/editor/design-page/DesignPagePanelRegion.tsx");
assert.match(region, /data-testid="canvas-behind-page" className="h-full w-full" inert=\{covered\} aria-hidden=\{covered \|\| undefined\}/);
assert.match(read("lib/useDesignPageEditorChromeController.ts"), /commandState\.editorMode !== "buy"/);
// Undo from the toast, by keyboard, keeps focus on the current step.
assert.match(read("components/editor/command-bar/CommandBarActionToast.tsx"), /if \(hadFocus\) document\.getElementById\("editor-command-workspace-action"\)\?\.focus\(\);/);

// The Tray is gone: no drawer, no cart state, nothing named Selection Tray in the editor.
assert.equal(existsSync(join(process.cwd(), "components/ItemCartDrawer.tsx")), false);
assert.equal(existsSync(join(process.cwd(), "lib/design-page-item-cart.ts")), false);
for (const path of [
  "components/editor/design-page/DesignPageDialogLayer.tsx",
  "lib/design-page-dialog-layer-model.ts",
  "lib/useDesignPageCoreShellBaseRegistration.ts",
  "lib/useDesignPagePanelMode.ts",
]) {
  assert.doesNotMatch(read(path), /selection-tray|ItemCart|itemCart/, `${path} keeps nothing of the Tray.`);
}

console.log("Cart gate (Shopping list) static checks passed.");
