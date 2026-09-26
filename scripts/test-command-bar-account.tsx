import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CommandBarAccountMenu } from "../components/editor/command-bar/CommandBarAccountMenu";
import { CommandBarGetProButton } from "../components/editor/command-bar/CommandBarGetProButton";
import {
  getPlansReturnFocusIds,
  PLANS_ACCOUNT_OPENER_ID,
  PLANS_DIRECT_FALLBACK_ID,
  PLANS_GET_PRO_OPENER_ID,
  PLANS_UPGRADE_OPENER_ID,
} from "../lib/plans-dialog-focus";

// The account corner (audit finding D): Sign in for guests, an Account menu for members, Get Pro
// from a capability, and none of them before the session has loaded.

const noop = () => undefined;
type AccountProps = ComponentProps<typeof CommandBarAccountMenu>;
const base: AccountProps = {
  dark: false, containerRef: createRef<HTMLDivElement>(), open: false, onToggle: noop, onClose: noop,
  menuButtonClass: "menu-button", menuPanelClass: "menu-panel", isAuthed: true, accountReady: true,
  accountName: "justus", planLabel: "Free", canManageBilling: false, isOpeningBillingPortal: false,
  onManageBilling: noop, onViewPlans: noop,
};
const account = (props: Partial<AccountProps>) =>
  renderToStaticMarkup(createElement(CommandBarAccountMenu, { ...base, ...props }));

const pending = account({ accountReady: false });
assert.match(pending, /data-testid="editor-command-account-pending"/);
assert.doesNotMatch(pending, /<button/, "Nothing is clickable until the session has loaded.");
assert.match(pending, /h-\[30px\] w-\[30px\]/, "The placeholder keeps the bar from shifting.");

const guest = account({ isAuthed: false, accountName: null });
assert.match(guest, /data-testid="editor-command-sign-in"[^>]*aria-label="Sign in"/, "Guests get a Sign in button in the bar.");
assert.match(guest, />Sign in</);
assert.doesNotMatch(guest, /editor-command-account"|role="menu"/, "Guests have no Account menu.");

const member = account({});
assert.match(member, new RegExp(`id="${PLANS_ACCOUNT_OPENER_ID}"[^>]*data-testid="editor-command-account"[^>]*aria-label="Account"`));
assert.match(member, /rounded-full[^"]*"[^>]*><span aria-hidden="true">J<\/span>/, "Members see their initial.");
assert.doesNotMatch(account({ accountName: null }), /<span aria-hidden="true">/, "No name falls back to the person icon.");
const menu = account({ open: true });
assert.match(menu, /data-testid="editor-account-plan"[^>]*>Free</);
assert.match(menu, /data-testid="editor-command-view-plans"[^>]*>Pricing</);
assert.match(menu, /data-testid="editor-command-sign-out"/);
assert.doesNotMatch(menu, /editor-command-sign-in/, "The menu no longer offers Sign in.");
assert.match(account({ open: true, canManageBilling: true }), /data-testid="editor-command-manage-billing"/);

const getPro = (canUpgrade: boolean, accountReady = true) =>
  renderToStaticMarkup(createElement(CommandBarGetProButton, { dark: false, accountReady, canUpgrade, onGetPro: noop }));
assert.equal(getPro(false), "", "Get Pro waits for the plan and never shows for Pro.");
assert.equal(getPro(true, false), "", "Get Pro waits for the session, like Sign in and Account.");
assert.match(getPro(true), new RegExp(`id="${PLANS_GET_PRO_OPENER_ID}"[^>]*data-testid="editor-command-get-pro"`));
assert.match(getPro(true), /class="hidden [^"]*lg:inline-flex[^"]*"[^>]*>Get Pro</, "Below lg, Pricing is in the Account menu.");

// Pricing hands focus back to whatever opened it, with one stable array per opener.
assert.deepEqual(getPlansReturnFocusIds(false), [PLANS_ACCOUNT_OPENER_ID, PLANS_DIRECT_FALLBACK_ID]);
assert.deepEqual(getPlansReturnFocusIds(true, PLANS_GET_PRO_OPENER_ID), [PLANS_UPGRADE_OPENER_ID]);
const fromGetPro = getPlansReturnFocusIds(false, PLANS_GET_PRO_OPENER_ID);
assert.deepEqual(fromGetPro, [PLANS_GET_PRO_OPENER_ID, PLANS_ACCOUNT_OPENER_ID, PLANS_DIRECT_FALLBACK_ID]);
assert.equal(getPlansReturnFocusIds(false, PLANS_GET_PRO_OPENER_ID), fromGetPro,
  "A new array each render would restart the dialog's focus session.");

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const chrome = read("lib/useDesignPageEditorChromeController.ts");
assert.match(chrome, /const openPlans = \(\) => \{ actions\.dialogs\.setPlansOpenerId\(null\); actions\.dialogs\.setPlansOpen\(true\); \};/);
assert.match(chrome, /const getPro = \(\) => \{ actions\.dialogs\.setPlansOpenerId\(PLANS_GET_PRO_OPENER_ID\); actions\.dialogs\.setPlansOpen\(true\); \};[\s\S]*?onGetPro: getPro,/);
assert.match(read("lib/useDesignPagePresentationQaFacade.ts"), /canUpgrade: state\.editor\.planLoaded && !editorCapabilities\.manageSubscription,/,
  "Get Pro follows the subscription capability, once the plan has loaded.");
assert.match(read("lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  /accountReady: base\.state\.identity\.sessionStatus !== "loading", planLoaded: deferredPaywall\.state\.planLoaded,/);
assert.match(read("lib/useDesignPageBilling.ts"), /finally \{\s*setPlanLoaded\(true\);\s*\}/,
  "A failed plan request still counts as loaded, so Get Pro isn't held back for ever.");
assert.match(read("components/editor/design-page/PlansDialog.tsx"), /getPlansReturnFocusIds\(state\.openedFromUpgrade, state\.openerId\)/);
assert.match(read("components/editor/EditorCommandBar.tsx"),
  /<CommandBarGetProButton dark=\{dark\} accountReady=\{accountReady\} canUpgrade=\{canUpgrade\} onGetPro=\{onGetPro\} \/>/);

console.log("Command bar account checks passed.");
