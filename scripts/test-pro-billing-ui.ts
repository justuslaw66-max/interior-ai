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

const designPage = read("app/design/page.tsx");
assert.match(designPage, /PRO_PLAN_PRICING\.monthly\.label/);
assert.match(designPage, /PRO_PLAN_PRICING\.yearly\.label/);
assert.match(designPage, /!isPro\(plan\)[\s\S]*\{ name: "hero", yaw: 0 \}/);

console.log("Pro billing UI/source checks passed.");
