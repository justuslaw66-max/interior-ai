import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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

const portal = read("app/api/stripe/portal/route.ts");
assert.match(portal, /\/design\?refresh_plan=true/);

const checkout = read("app/api/stripe/checkout/route.ts");
assert.match(checkout, /key !== "interval"/);
assert.match(checkout, /code: "invalid_interval"/);
assert.match(checkout, /subscription_exists/);

const plansDialog = read("components/editor/design-page/PlansDialog.tsx");
assert.match(plansDialog, /Start monthly — \{state\.monthlyLabel\}/);
assert.match(plansDialog, /Start yearly — \{state\.yearlyLabel\}/);

const designPage = read("components/editor/design-page/DesignPageWorkspace.tsx");
const editorChromeController = read("lib/useDesignPageEditorChromeController.ts");
const designPageExport = read("lib/useDesignPageExport.ts");
assert.match(designPage, /monthlyLabel: PRO_PLAN_PRICING\.monthly\.label/);
assert.match(designPage, /yearlyLabel: PRO_PLAN_PRICING\.yearly\.label/);
assert.match(
  designPage,
  /useDesignPageEditorChromeController\(\{[\s\S]*?dialogs:\s*\{[\s\S]*?setPlansOpen: setShowPlans,[\s\S]*?billing:\s*\{ openPortal: openBillingPortal \}/,
  "The workspace should inject plan and billing collaborators into the chrome controller."
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
assert.match(designPageExport, /!isPro\(plan\)[\s\S]*\{ name: "hero", yaw: 0 \}/);

console.log("Pro billing UI/source checks passed.");
