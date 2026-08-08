import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ItemCartDrawer, {
  runCartMutationWithFocus,
  type ItemCartDrawerProps,
} from "../components/ItemCartDrawer";

const noOp = () => undefined;
const baseProps: ItemCartDrawerProps = {
  items: [],
  onRemove: noOp,
  onUpdateQty: noOp,
  onClear: noOp,
  onAddAllToRoom: noOp,
  isOpen: false,
  onToggle: noOp,
};

function render(props: Partial<ItemCartDrawerProps>) {
  return renderToStaticMarkup(createElement(ItemCartDrawer, { ...baseProps, ...props }));
}

const populatedItems: ItemCartDrawerProps["items"] = [
  { id: "chair-1", productId: "chair", title: "Reading Chair", qty: 2 },
  { id: "table-1", productId: "table", title: "Side Table", qty: 1 },
];
const closed = render({ items: populatedItems });
assert.match(closed, /aria-haspopup="dialog"/);
assert.match(closed, /aria-expanded="false"/);
assert.doesNotMatch(closed, /role="dialog"/);
assert.doesNotMatch(closed, /data-testid="selection-tray-close"/);
assert.doesNotMatch(closed, /Reading Chair|Side Table|Add All to Room/);

const emptyOpen = render({ isOpen: true });
assert.match(emptyOpen, /role="dialog"/);
assert.match(emptyOpen, /aria-modal="true"/);
assert.match(emptyOpen, /Selection Tray/);
assert.match(emptyOpen, /data-testid="selection-tray-close"/);
assert.match(emptyOpen, /data-editor-dialog-state="mounting"/);
assert.match(emptyOpen, /No items selected/);
assert.doesNotMatch(emptyOpen, /data-testid="selection-tray-clear"/);

const populatedOpen = render({ isOpen: true, items: populatedItems });
for (const expected of [
  "Reading Chair",
  "Side Table",
  "Decrease Reading Chair quantity",
  "Increase Reading Chair quantity",
  "Remove Reading Chair",
  'data-testid="selection-tray-add-all"',
  'data-testid="selection-tray-clear"',
]) {
  assert.ok(populatedOpen.includes(expected), `Populated tray must retain ${expected}.`);
}
assert.equal((populatedOpen.match(/data-testid="selection-tray-add-all"/g) ?? []).length, 1);
assert.equal((populatedOpen.match(/data-testid="selection-tray-clear"/g) ?? []).length, 1);

const mutationOrder: string[] = [];
runCartMutationWithFocus(
  () => mutationOrder.push("focus surviving close"),
  () => mutationOrder.push("mutate populated cart"),
);
assert.deepEqual(mutationOrder, ["focus surviving close", "mutate populated cart"]);

const drawerSource = readFileSync(
  `${process.cwd()}/components/ItemCartDrawer.tsx`,
  "utf8"
);
assert.match(
  drawerSource,
  /cancelFocusRestorationOnUnmount/,
  "The tray must cancel semantic restoration when its route owner unmounts."
);
assert.match(
  drawerSource,
  /waitForEntryTransition/,
  "The tray must own focus during entry and defer close-button focus until interactive."
);
assert.match(
  drawerSource,
  /data-\[editor-dialog-state=mounting\]:translate-x-full/,
  "The tray must derive its off-canvas entry geometry from the explicit mounting state."
);
assert.doesNotMatch(
  drawerSource,
  /starting:translate-x-full/,
  "The tray must not depend on an ambiguous starting-style paint boundary."
);
assert.match(
  drawerSource,
  /onClick=\{onAddAllToRoom\}/,
  "The populated Add All action must retain its commerce callback without a duplicate close path."
);
for (const [pattern, message] of [
  [/runCartMutationWithFocus\(onBeforeMutation, onClear\)/, "Clear"],
  [/item\.qty <= 1[\s\S]*?runCartMutationWithFocus\(onBeforeMutation, update\)/, "decrement-to-zero"],
  [/runCartMutationWithFocus\(onBeforeMutation, \(\) => onRemove\(item\.productId\)\)/, "Remove"],
] as const) {
  assert.match(
    drawerSource,
    pattern,
    `${message} must focus a surviving modal control before removing its focused action.`
  );
}

console.log("Cart overlay static lifecycle checks passed.");
