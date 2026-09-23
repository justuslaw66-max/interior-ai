import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  RetailerConfirmationDialog,
} from "../components/RetailerConfirmationDialog";
import {
  RETAILER_CONFIRMATION_CART_FALLBACK_ID,
  RETAILER_CONFIRMATION_CANCEL_ACTION_ID,
  RETAILER_CONFIRMATION_CLOSE_ACTION_ID,
  RETAILER_CONFIRMATION_CONTINUE_ACTION_ID,
  RETAILER_CONFIRMATION_DIALOG_ID,
  RETAILER_CONFIRMATION_GLOBAL_OPENER_ID,
  RETAILER_CONFIRMATION_SAME_TAB_ACTION_ID,
  cancelRetailerConfirmationSession,
  canonicalRetailerGroupIdentity,
  consumeRetailerConfirmationSession,
  countRetailerTabs,
  createRetailerConfirmationScopeKey,
  createRetailerConfirmationSession,
  getRetailerGroupOpenerId,
  getRetailerConfirmationReturnFocusIds,
  updateRetailerConfirmationSameTab,
  type RetailerConfirmationLine,
} from "../lib/retailer-confirmation";

const line = (
  overrides: Partial<RetailerConfirmationLine> = {}
): RetailerConfirmationLine => ({
  instanceId: "line-1",
  productId: "product-1",
  variantId: "variant-1",
  name: "Synthetic chair",
  category: "chair",
  retailer: "Safe Retailer",
  buyUrl: "/synthetic-retailer/product-1",
  qty: 1,
  linkOpenCount: 1,
  isBundleLine: false,
  ...overrides,
});

assert.equal(countRetailerTabs([]), 0);
assert.equal(countRetailerTabs([line()]), 1);
assert.equal(countRetailerTabs([line({ qty: 3, linkOpenCount: 3 })]), 3);
assert.equal(countRetailerTabs([line({ qty: 4, linkOpenCount: 4 })]), 4);
assert.equal(
  countRetailerTabs([line({ qty: 7, linkOpenCount: 1, isBundleLine: true })]),
  1,
  "A bundle purchase option must contribute one retailer link."
);
assert.equal(
  countRetailerTabs([
    line({ instanceId: "duplicate-1" }),
    line({ instanceId: "duplicate-2" }),
  ]),
  2,
  "Duplicate destinations must not be deduplicated."
);
assert.equal(countRetailerTabs([line({ buyUrl: null, linkOpenCount: 9 })]), 0);

const groupIdentity = canonicalRetailerGroupIdentity("  Safe   Retailer  ");
assert.equal(groupIdentity, "safe retailer--20-20-53-61-66-65-20-20-20-52-65-74-61-69-6c-65-72-20-20");
assert.equal(
  getRetailerGroupOpenerId(groupIdentity),
  "retailer-confirmation-group-action-safe%20retailer--20-20-53-61-66-65-20-20-20-52-65-74-61-69-6c-65-72-20-20"
);
assert.notEqual(
  canonicalRetailerGroupIdentity("Safe Retailer"),
  canonicalRetailerGroupIdentity("safe retailer"),
  "Distinct preserved retailer groups must never share a semantic opener ID."
);

const capturedLine = line({ qty: 4, linkOpenCount: 4 });
const session = createRetailerConfirmationSession({
  generation: 1,
  opener: { kind: "retailer-group", groupIdentity },
  title: "Buy from Safe Retailer",
  lines: [capturedLine],
  tabCount: 4,
  openInSameTab: false,
  scopeKey: "design-a|cart-a",
});
capturedLine.qty = 9;
assert.equal(session.lines[0]?.qty, 4, "The session must own a captured line snapshot.");
assert.deepEqual(getRetailerConfirmationReturnFocusIds(session.opener), [
  getRetailerGroupOpenerId(groupIdentity),
  RETAILER_CONFIRMATION_CART_FALLBACK_ID,
]);

const sameTabSession = updateRetailerConfirmationSameTab(session, session, true);
assert.equal(sameTabSession?.openInSameTab, true);
assert.equal(session.openInSameTab, false, "Preference updates must preserve prior snapshots.");
assert.equal(
  consumeRetailerConfirmationSession(sameTabSession, { ...sameTabSession!, generation: 2 }),
  null,
  "A stale generation must not consume the active session."
);
const consumed = consumeRetailerConfirmationSession(sameTabSession, sameTabSession!);
assert.equal(consumed?.generation, 1);
assert.equal(
  consumeRetailerConfirmationSession(sameTabSession, sameTabSession!),
  null,
  "Continue must consume one generation at most once."
);

const cancelled = createRetailerConfirmationSession({
  generation: 2,
  opener: { kind: "global" },
  title: "Buy external items",
  lines: [line({ qty: 4, linkOpenCount: 4 })],
  tabCount: 4,
  openInSameTab: false,
  scopeKey: "design-a|cart-b",
});
assert.equal(cancelRetailerConfirmationSession(cancelled, cancelled), true);
assert.equal(cancelRetailerConfirmationSession(cancelled, cancelled), false);
assert.deepEqual(getRetailerConfirmationReturnFocusIds(cancelled.opener), [
  RETAILER_CONFIRMATION_GLOBAL_OPENER_ID,
  RETAILER_CONFIRMATION_CART_FALLBACK_ID,
]);

const scopeA = createRetailerConfirmationScopeKey("design-a", [
  {
    instanceId: "line-1",
    productId: "product-1",
    variantId: "variant-1",
    qty: 4,
    includeInCheckout: true,
    purchaseOptionId: null,
    bundleGroupId: null,
    bundleRole: null,
    bundleQuantity: null,
  },
]);
const scopeB = createRetailerConfirmationScopeKey("design-a", [
  {
    instanceId: "line-1",
    productId: "product-1",
    variantId: "variant-1",
    qty: 5,
    includeInCheckout: true,
    purchaseOptionId: null,
    bundleGroupId: null,
    bundleRole: null,
    bundleQuantity: null,
  },
]);
assert.notEqual(scopeA, scopeB, "Cart quantity changes must invalidate pending confirmation.");

const closed = renderToStaticMarkup(
  createElement(RetailerConfirmationDialog, {
    session: null,
    busy: false,
    isDesignerTheme: false,
    onCancel: () => undefined,
    onContinue: () => undefined,
    onToggleSameTab: () => undefined,
  })
);
assert.doesNotMatch(closed, /role="dialog"|retailer-confirmation-dialog/);

const openSession = createRetailerConfirmationSession({
  generation: 3,
  opener: { kind: "global" },
  title: "Buy external items",
  lines: [line({ qty: 4, linkOpenCount: 4 })],
  tabCount: 4,
  openInSameTab: false,
  scopeKey: scopeA,
});
const open = renderToStaticMarkup(
  createElement(RetailerConfirmationDialog, {
    session: openSession,
    busy: false,
    isDesignerTheme: false,
    onCancel: () => undefined,
    onContinue: () => undefined,
    onToggleSameTab: () => undefined,
  })
);
for (const expected of [
  'role="dialog"',
  'aria-modal="true"',
  RETAILER_CONFIRMATION_DIALOG_ID,
  RETAILER_CONFIRMATION_CLOSE_ACTION_ID,
  RETAILER_CONFIRMATION_SAME_TAB_ACTION_ID,
  RETAILER_CONFIRMATION_CANCEL_ACTION_ID,
  RETAILER_CONFIRMATION_CONTINUE_ACTION_ID,
  "Buy external items",
  "This will open <span class=\"font-semibold\">4</span> tabs",
]) {
  assert.ok(open.includes(expected), `Open confirmation must retain ${expected}.`);
}

const cartSource = readFileSync(`${process.cwd()}/components/CartSidebar.tsx`, "utf8");
const dialogSource = readFileSync(
  `${process.cwd()}/components/RetailerConfirmationDialog.tsx`,
  "utf8"
);
for (const [pattern, message] of [
  [/tabs <= 3[\s\S]*?doBuyLines/, "three-tab direct-open threshold"],
  [/onClick=\{\(\) => void doBuyLines\(\[x\]/, "row-level threshold bypass"],
  [/setTimeout\(resolve, 350\)/, "350 ms retailer pacing"],
  [/fetch\("\/api\/track\/click"/, "click tracking endpoint"],
  [/searchParams\.set\("clickKey", clickKey\)/, "click-key URL construction"],
  [/searchParams\.set\("utm_source", "interior-ai"\)/, "affiliate UTM source"],
  [/searchParams\.set\("utm_medium", "affiliate"\)/, "affiliate UTM medium"],
  [/onGuestCapture\("checkout"/, "unchanged Guest Save Shopify call site"],
] as const) {
  assert.match(cartSource, pattern, `CartSidebar must preserve ${message}.`);
}
assert.doesNotMatch(cartSource, /GuestSavePromptReason|ConfirmDialog/);
assert.match(dialogSource, /<EditorDialog/, "Retailer confirmation must use EditorDialog directly.");
assert.doesNotMatch(dialogSource, /ConfirmDialog/);

console.log("Retailer confirmation static lifecycle checks passed.");
