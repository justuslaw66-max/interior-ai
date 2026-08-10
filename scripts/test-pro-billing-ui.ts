import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildDesignPageDialogLayerModel } from "../lib/design-page-dialog-layer-model";
import { resolveEditorCapabilities } from "../lib/editor-capabilities";

const root = path.resolve(__dirname, "..");
const read = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");

const pdfButton = read("components/PDFDownloadButton.tsx");
assert.match(pdfButton, /fetch\("\/api\/stripe\/checkout"/);
assert.match(pdfButton, /JSON\.stringify\(\{ interval: "monthly" \}\)/);
assert.doesNotMatch(pdfButton, /\/api\/stripe\/checkout-pro/);

const upgradeModal = read("components/UpgradeModal.tsx");
assert.match(upgradeModal, /PRO_PLAN_PRICING\.monthly\.label/);
assert.doesNotMatch(upgradeModal, /\$29\/month/);

const commandBar = read("components/editor/EditorCommandBar.tsx");
assert.match(commandBar, /data-testid="editor-command-manage-billing"/);
assert.match(commandBar, /data-testid="editor-command-view-plans"/);
assert.match(commandBar, /data-testid="editor-account-plan"/);

const designPageCommandBar = read(
  "components/editor/design-page/DesignPageEditorCommandBar.tsx"
);
assert.match(
  designPageCommandBar,
  /type CommandBarActions = Pick<[\s\S]*?HandlerKeys<EditorCommandBarProps>/,
  "The design-page command wrapper should retain every command-bar handler in its action contract."
);
assert.match(
  designPageCommandBar,
  /<EditorCommandBar[\s\S]*?\{\.\.\.actions\.commandBar\}/,
  "The design-page command wrapper should forward billing and plan actions to the command-bar leaf."
);

const success = read("app/billing/success/RefreshPlanButton.tsx");
assert.match(success, /data-testid="billing-activation-status"/);
assert.match(success, /href="\/design\?mode=designer"/);
assert.match(success, /MAX_ATTEMPTS = 20/);
assert.match(success, /checkout_success_viewed/);
assert.doesNotMatch(success, /upgrade_checkout_completed|verified:\s*true/);

const successPageTracking = read("app/billing/success/CheckoutCompletedTracking.tsx");
assert.match(successPageTracking, /checkout_success_viewed/);
assert.doesNotMatch(successPageTracking, /upgrade_checkout_completed/);

const portal = read("app/api/stripe/portal/route.ts");
assert.match(portal, /\/design\?refresh_plan=true/);

const checkout = read("app/api/stripe/checkout/route.ts");
assert.match(checkout, /key !== "interval"/);
assert.match(checkout, /code: "invalid_interval"/);
assert.match(checkout, /subscription_exists/);

const plansDialog = read("components/editor/design-page/PlansDialog.tsx");
assert.match(plansDialog, /Start monthly — \{state\.monthlyLabel\}/);
assert.match(plansDialog, /Start yearly — \{state\.yearlyLabel\}/);
for (const required of [
  "EditorDialog",
  'title="Plans"',
  'testId="plans-dialog"',
  'closeButtonTestId="plans-dialog-close"',
  "manageBackground",
  "returnFocusIds",
  "cancelFocusRestorationOnUnmount",
]) {
  assert.ok(
    plansDialog.includes(required),
    `Plans must use the shared modal lifecycle with ${required}`
  );
}
assert.doesNotMatch(
  plansDialog,
  /position:\s*"fixed"|event\.stopPropagation\(\)/,
  "Plans must not retain its custom overlay or backdrop owner."
);

const plansFocus = read("lib/plans-dialog-focus.ts");
for (const semanticId of [
  "editor-command-account-action",
  "editor-command-more-action",
  "upgrade-see-plans-action",
]) {
  assert.ok(
    plansFocus.includes(semanticId),
    `Plans must own the semantic opener identity ${semanticId}`
  );
}
assert.match(
  commandBar,
  /id=\{PLANS_ACCOUNT_OPENER_ID\}[\s\S]*?data-testid="editor-command-account"/,
  "The direct Plans path must return to the current semantic Account command."
);
assert.match(
  read("components/editor/design-page/UpgradeDialog.tsx"),
  /id=\{PLANS_UPGRADE_OPENER_ID\}[\s\S]*?data-testid="upgrade-see-plans"/,
  "The nested Plans path must return to the current Plans action inside Upgrade."
);
assert.match(
  read("lib/design-page-dialog-layer-model.ts"),
  /openedFromUpgrade:\s*billing\.upgrade\.open/,
  "Plans nested ownership must be derived from the existing Upgrade state."
);

const designPage = read("components/editor/design-page/DesignPageWorkspace.tsx");
const presentationWorkspace = read(
  "lib/useDesignPagePresentationWorkspaceRegistration.ts"
);
const coreShellRegistration = read(
  "lib/useDesignPageCoreShellRegistration.ts"
);
const editorChromeController = read("lib/useDesignPageEditorChromeController.ts");
const designPageExport = read("lib/useDesignPageExport.ts");
const paywallLifecycle = read("lib/useDesignPagePaywallTelemetryLifecycle.ts");
const paywallRegistrationFacade = read(
  "lib/useDesignPagePaywallRegistrationFacade.ts"
);
const dialogLayer = read("components/editor/design-page/DesignPageDialogLayer.tsx");
assert.match(
  dialogLayer,
  /<PlansDialog\s+\{\.\.\.dialogs\.plans\}\s*\/>/,
  "The fixed dialog layer should own Plans dialog composition."
);

const noop = () => undefined;
const plansModel = buildDesignPageDialogLayerModel({
  access: { isClientPreview: false, isAuthenticated: true, capabilities: resolveEditorCapabilities("free"), designerTheme: false },
  billing: {
    upgrade: {},
    plans: {
      open: true,
      layout: "annual_highlight",
      openingBillingPortal: false,
      monthlyLabel: "monthly-price",
      yearlyLabel: "yearly-price",
      yearlyEffectiveMonthlyLabel: "effective-monthly-price",
    },
    startingCheckout: false,
    annualSavingsLabel: "annual-savings",
    upgradeActions: {},
    plansActions: {},
  },
  persistence: {
    guestSave: {
      reason: null,
      busy: false,
      lifecycleScopeKey: "pro-billing-test",
      onCancel: noop,
      onContinueWithoutSaving: noop,
      onSaveAndContinue: noop,
    },
    myDesigns: { data: {}, actions: {} },
    templateChoice: { data: {}, actions: {} },
  },
  ai: { notes: {} },
  presentation: { presentExport: {} },
  editing: { roomRename: {}, annotation: {} },
  placement: { identity: {}, assessment: {}, activeRoomName: null, actions: {} },
  feedback: { beta: {}, toasts: {}, validation: {} },
  sharing: {},
  cabinetry: { state: {}, access: {}, configuration: {}, refs: {}, actions: {} },
  cart: {},
} as unknown as Parameters<typeof buildDesignPageDialogLayerModel>[0]);
assert.deepEqual(
  {
    monthly: plansModel.dialogs.plans.state.monthlyLabel,
    yearly: plansModel.dialogs.plans.state.yearlyLabel,
    effectiveMonthly: plansModel.dialogs.plans.state.yearlyEffectiveMonthlyLabel,
    savings: plansModel.dialogs.plans.state.annualSavingsLabel,
  },
  {
    monthly: "monthly-price",
    yearly: "yearly-price",
    effectiveMonthly: "effective-monthly-price",
    savings: "annual-savings",
  },
  "The pure dialog model should preserve shared Pro pricing labels."
);
assert.match(
  designPage,
  /useDesignPageWorkspaceDeferredPaywallRegistration\(\{[\s\S]*?boundaries:\s*\{ paywall: paywallRegistration \},[\s\S]*?navigation:\s*router,[\s\S]*?searchParams,[\s\S]*?authenticated: Boolean\(session\?\.user\)[\s\S]*?billing:\s*\{[\s\S]*?requestSignIn: signInWithReturn,[\s\S]*?lifecycle:\s*\{/,
  "The workspace should delegate deferred billing wiring through its registration boundary."
);
assert.match(
  coreShellRegistration,
  /useDesignPageWorkspacePaywallRegistration\(\{/,
  "The core shell should register early paywall telemetry through its boundary."
);
assert.match(
  paywallRegistrationFacade,
  /useDesignPagePaywallTelemetryController\(input\)[\s\S]*?useDesignPageWorkspacePaywallRegistration[\s\S]*?NEXT_PUBLIC_PAYWALL_EXPERIMENT_SLOT[\s\S]*?const replaceDesignUrl = useCallback\([\s\S]*?\[navigation\][\s\S]*?useDesignPagePaywallTelemetryLifecycle\(\{[\s\S]*?useDesignPageWorkspaceDeferredPaywallRegistration[\s\S]*?searchParams\.get\("session_id"\)[\s\S]*?searchParams\.get\("refresh_plan"\)[\s\S]*?paywall\.actions\.logFunnelEvent[\s\S]*?paywall\.derived\.paywallContextMeta[\s\S]*?searchParams\.get\("paywall_open"\)[\s\S]*?searchParams\.get\("plans_open"\)/,
  "The paywall registration facade should preserve early telemetry, navigation identity, query keys, and deferred billing ownership."
);
assert.doesNotMatch(
  designPage,
  /searchParams\.get\("(?:session_id|refresh_plan|paywall_open|plans_open)"\)/,
  "Workspace should no longer own deferred paywall query-key wiring."
);
assert.doesNotMatch(
  designPage,
  /useDesignPageBilling\(/,
  "The workspace should not compose billing outside the paywall lifecycle boundary."
);
assert.match(
  paywallLifecycle,
  /const billingController = useDesignPageBilling\(billing\)[\s\S]*?return billingController/,
  "The paywall lifecycle should preserve the billing controller contract."
);
assert.match(
  presentationWorkspace,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?dialogs:\s*\{[\s\S]*?setPlansOpen:\s*base\.actions\.dialogs\.setShowPlans,[\s\S]*?billing:\s*\{ openPortal:\s*deferredPaywall\.actions\.openBillingPortal \}/,
  "The presentation workspace should inject plan and billing collaborators into the presentation/QA facade."
);
assert.match(
  editorChromeController,
  /const openPlans = \(\) => \{[\s\S]*?actions\.dialogs\.setPlansOpen\(true\)[\s\S]*?const manageBilling = \(\) => \{[\s\S]*?actions\.billing\.openPortal\(\)[\s\S]*?onViewPlans: openPlans,[\s\S]*?onManageBilling: manageBilling/,
  "The chrome controller should provide plan and billing actions through the typed command-wrapper boundary."
);
assert.doesNotMatch(
  designPage,
  /<EditorCommandBar\b/,
  "The workspace should not bypass the command wrapper for billing actions."
);
assert.match(
  designPageExport,
  /const canExportMultipleViews = capabilities\.exportMultipleViews[\s\S]*?!canExportMultipleViews[\s\S]*?\{ name: "hero", yaw: 0 \}/,
  "Consumer image exports should remain limited by the centralized multi-view capability."
);

console.log("Pro billing UI/source checks passed.");
