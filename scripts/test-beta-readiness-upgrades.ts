import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CATALOG_ITEMS } from "../lib/catalog";
import { buildCatalogCommerceReadiness } from "../lib/catalog-commerce-readiness";
import {
  buildProviderFailureBoundaryDiagnostics,
  isBetaCheckoutBoundary,
  resolveCheckoutBoundaryDiagnostics,
} from "../lib/beta-checkout-boundary";
import { buildBetaFeedbackTriage } from "../lib/beta-feedback-triage";
import { buildBetaLaunchReadinessSummary } from "../lib/beta-launch-readiness";
import { buildFirstRunActivationState } from "../lib/first-run-activation";
import {
  getPrimaryPlacementRecommendation,
  rankPlacementRecommendations,
} from "../lib/placement-recommendations";
import { buildRoomFixPreviewFromRecommendations } from "../lib/room-fix-preview";
import { buildRoomHealthSummary } from "../lib/room-health-summary";
import { buildShareExportFidelitySummary } from "../lib/share-export-fidelity";
import { createRoom, type DesignSnapshot } from "../lib/room-types";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const designPageSource = readFileSync(join(root, "app/design/page.tsx"), "utf8");
const adminPageSource = readFileSync(join(root, "app/admin/page.tsx"), "utf8");
const sharePageSource = readFileSync(join(root, "app/share/[shareToken]/page.tsx"), "utf8");
const exportPageSource = readFileSync(join(root, "app/share/[shareToken]/export/page.tsx"), "utf8");
const shareActionsSource = readFileSync(join(root, "components/SharePageActions.tsx"), "utf8");
const feedbackSource = readFileSync(join(root, "components/BetaFeedbackWidget.tsx"), "utf8");
const catalogRuntimeSource = readFileSync(join(root, "lib/catalog-runtime.ts"), "utf8");
const roomPlanStatusSource = readFileSync(
  join(root, "components/editor/RoomPlanStatusBar.tsx"),
  "utf8"
);
const stripeCheckoutSource = readFileSync(join(root, "app/api/stripe/checkout/route.ts"), "utf8");
const stripeCheckoutProSource = readFileSync(join(root, "app/api/stripe/checkout-pro/route.ts"), "utf8");
const shopifyCheckoutSource = readFileSync(join(root, "app/api/shopify/checkout/route.ts"), "utf8");
const smartPlacementE2eSource = readFileSync(
  join(root, "tests/e2e/17-smart-placement-smoke.spec.ts"),
  "utf8"
);

const unsafeStaging = resolveCheckoutBoundaryDiagnostics({
  APP_ENV: "staging",
  STRIPE_SECRET_KEY: "sk_live_forbidden",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_live_forbidden",
  DATABASE_URL: "postgres://example-production-primary",
});
assert.equal(unsafeStaging.checkoutSafe, false);
assert.ok(unsafeStaging.hardStops.some((stop) => /Live Stripe secret key/.test(stop)));
assert.ok(unsafeStaging.hardStops.some((stop) => /Production-like DATABASE_URL/.test(stop)));
assert.doesNotMatch(JSON.stringify(unsafeStaging), /sk_live_forbidden|pk_live_forbidden/);

const safeStaging = resolveCheckoutBoundaryDiagnostics({
  APP_ENV: "staging",
  STRIPE_SECRET_KEY: "sk_test_allowed",
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_allowed",
  DATABASE_URL: "postgres://example-staging",
});
assert.equal(safeStaging.checkoutSafe, true);
assert.equal(isBetaCheckoutBoundary(safeStaging), true);
const providerFailure = buildProviderFailureBoundaryDiagnostics(
  safeStaging,
  "stripe",
  "connection failed"
);
assert.equal(providerFailure.checkoutSafe, false);
assert.ok(
  providerFailure.hardStops.some((stop) => /provider connectivity/i.test(stop)),
  "provider failures should turn safe staging checkout into a beta hard stop."
);
assert.ok(
  providerFailure.warnings.some((warning) => /connection failed/.test(warning)),
  "provider failures should retain a redacted operational warning."
);

const productionWithTestKey = resolveCheckoutBoundaryDiagnostics({
  APP_ENV: "production",
  STRIPE_SECRET_KEY: "sk_test_forbidden",
  DATABASE_URL: "postgres://example-production",
});
assert.equal(productionWithTestKey.checkoutSafe, false);
assert.equal(isBetaCheckoutBoundary(productionWithTestKey), false);

for (const source of [stripeCheckoutSource, stripeCheckoutProSource, shopifyCheckoutSource]) {
  assert.match(source, /resolveCheckoutBoundaryDiagnostics/, "checkout routes should run boundary diagnostics.");
  assert.match(source, /buildCheckoutBoundaryResponsePayload/, "checkout routes should return safe diagnostics.");
}
for (const source of [stripeCheckoutSource, stripeCheckoutProSource]) {
  assert.match(
    source,
    /buildProviderFailureBoundaryDiagnostics[\s\S]*isBetaCheckoutBoundary/,
    "Stripe checkout routes should fail closed with beta boundary diagnostics after provider failures."
  );
}

const catalogItems = Object.values(CATALOG_ITEMS);
const commerceReadiness = buildCatalogCommerceReadiness(catalogItems);
assert.ok(commerceReadiness.totalProducts > 0);
assert.ok(commerceReadiness.replacementEligibleCount > 0);
assert.equal(
  commerceReadiness.issues.filter((issue) => issue.kind === "replacement-ineligible").length,
  commerceReadiness.replacementIneligibleCount
);
assert.match(
  catalogRuntimeSource,
  /CATALOG_VALIDATE_RUNTIME_ASSETS/,
  "runtime catalog validation should keep an explicit asset-file opt-in for release diagnostics."
);
assert.match(
  catalogRuntimeSource,
  /process\.env\.VERCEL === "1"/,
  "Vercel serverless runtime should not require static model assets in each function bundle."
);
assert.match(
  adminPageSource,
  /data-testid="catalog-commerce-readiness-dashboard"/,
  "admin overview should expose the catalog commerce readiness dashboard."
);
assert.match(
  adminPageSource,
  /data-testid="checkout-boundary-diagnostics"/,
  "admin overview should expose checkout boundary diagnostics."
);
assert.match(
  adminPageSource,
  /checkoutBoundaryDiagnostics\.stripeSecretMode/,
  "checkout boundary diagnostics should show secret mode without exposing secret values."
);
assert.match(
  adminPageSource,
  /data-testid="beta-feedback-triage"/,
  "admin overview should expose beta feedback triage."
);
assert.match(
  adminPageSource,
  /data-testid="beta-launch-readiness"/,
  "admin overview should expose beta launch readiness."
);
assert.match(
  adminPageSource,
  /data-testid="beta-launch-readiness-csv"/,
  "admin beta launch readiness should export CSV evidence."
);
assert.match(
  adminPageSource,
  /data-testid="beta-feedback-triage-csv"/,
  "admin beta feedback triage should export CSV."
);
assert.match(
  adminPageSource,
  /data-testid="beta-feedback-triage-severity"/,
  "admin beta feedback triage should show severity labels."
);
assert.match(
  adminPageSource,
  /beta_feedback_submitted/,
  "admin feedback triage should read submitted beta feedback events."
);
const criticalFeedback = buildBetaFeedbackTriage({
  context: { saveStatus: "failed", placementKind: "great", shoppingNeedsReviewCount: 0 },
});
assert.equal(criticalFeedback.severity, "critical");
assert.equal(criticalFeedback.route, "save");
const blockedLaunch = buildBetaLaunchReadinessSummary({
  checkout: unsafeStaging,
  catalog: commerceReadiness,
  feedback: [criticalFeedback],
  shareCreated24h: 0,
  exportOpened24h: 0,
});
assert.equal(blockedLaunch.status, "blocked");
const shoppingFeedback = buildBetaFeedbackTriage({
  context: { saveStatus: "saved", shoppingNeedsReviewCount: 2 },
});
assert.equal(shoppingFeedback.severity, "high");
assert.equal(shoppingFeedback.route, "shopping");

const product = CATALOG_ITEMS["armchair-real-castlery-avery-performance-armchair"];
assert.ok(product, "beta readiness fixture product should exist.");
const room = createRoom("room_beta", "Beta Room", "living", {
  width: 4.8,
  depth: 4.6,
  wallThickness: 0.12,
  height: 2.6,
  slabThickness: 0.1,
});
room.items = [
  {
    instanceId: "fixture-chair",
    productId: product.id,
    variantId: product.defaultVariantId,
    position: [0, 0, 0],
    rotationY: 0,
    includeInCheckout: true,
  },
];
const snapshot: DesignSnapshot = {
  version: 3,
  rooms: [room],
  activeRoomId: room.id,
  floorPlan: {
    openings: [
      {
        id: "door_beta",
        roomId: room.id,
        kind: "door",
        wall: "south",
        offsetMm: 0,
        widthMm: 900,
      },
    ],
  },
};
const fidelity = buildShareExportFidelitySummary(snapshot, CATALOG_ITEMS);
assert.match(fidelity.fingerprint, /^[a-f0-9]{8}$/);
assert.equal(fidelity.roomCount, 1);
assert.equal(fidelity.itemCount, 1);
assert.equal(fidelity.openingCount, 1);
for (const source of [sharePageSource, exportPageSource]) {
  assert.match(
    source,
    /buildShareExportFidelitySummary/,
    "share and export pages should use the shared fidelity summary."
  );
  assert.match(source, /data-room-count/, "share/export QA marker should include room count.");
  assert.match(source, /data-item-count/, "share/export QA marker should include item count.");
  assert.match(
    source,
    /data-missing-commerce-count/,
    "share/export QA marker should include missing-commerce count."
  );
}
assert.match(
  sharePageSource,
  /data-testid="share-handoff-integrity"/,
  "share page should show visible handoff integrity."
);
assert.match(
  sharePageSource,
  /data-testid="share-handoff-id"/,
  "share page should show a visible handoff ID."
);
assert.match(
  shareActionsSource,
  /data-testid="share-download-pdf"[\s\S]*Download PDF/,
  "share page actions should expose first-viewport PDF download."
);
assert.match(
  shareActionsSource,
  /data-testid="share-shopping-list"[\s\S]*Shopping list/,
  "share page actions should expose first-viewport shopping list access."
);
assert.match(
  sharePageSource,
  /id="shopping-preview"/,
  "share page shopping preview should be directly linkable from first-viewport actions."
);
assert.match(
  sharePageSource,
  /data-testid="share-room-health"/,
  "share page room list should show room health."
);
assert.match(
  exportPageSource,
  /data-testid="export-handoff-integrity"/,
  "export page should show visible handoff integrity."
);
assert.match(
  exportPageSource,
  /data-testid="export-handoff-id"/,
  "export page should show a visible handoff ID."
);
assert.match(
  exportPageSource,
  /data-testid="export-room-health"/,
  "export page room schedule should show room health."
);
assert.match(
  exportPageSource,
  /data-testid="export-room-health-detail"/,
  "export page room detail should include room health next action."
);

const ranked = rankPlacementRecommendations([
  { id: "small", kind: "try_smaller", label: "Try smaller", scoreDelta: 30 },
  { id: "restore", kind: "restore_valid", label: "Restore valid", scoreDelta: 5, fixesHardInvalid: true },
  { id: "improve", kind: "improve", label: "Improve", scoreDelta: 12 },
]);
assert.equal(ranked[0].id, "restore");
assert.equal(getPrimaryPlacementRecommendation(ranked)?.id, "restore");

const roomHealth = buildRoomHealthSummary({
  room,
  catalogItems: CATALOG_ITEMS,
  openings: snapshot.floorPlan?.openings,
});
assert.equal(roomHealth.itemCount, 1);
assert.ok(roomHealth.placementScore >= 0 && roomHealth.placementScore <= 100);
const roomFixPreview = buildRoomFixPreviewFromRecommendations(roomHealth, ranked);
assert.equal(roomFixPreview.requiresLayoutVersionRestore, true);
assert.ok(roomFixPreview.fixes.length >= 1);
assert.match(
  roomPlanStatusSource,
  /data-testid="room-plan-status-health"/,
  "room status bar should expose the active room health badge."
);
assert.match(
  roomPlanStatusSource,
  /onReviewHealth/,
  "room status bar health badge should support an actionable review callback."
);
assert.match(
  roomPlanStatusSource,
  /data-testid="room-plan-status-next-action"/,
  "room status bar should expose the active room next action."
);
assert.match(
  designPageSource,
  /const activeRoomHealthSummary = useMemo/,
  "design page should compute active room health from live editor state."
);
assert.match(
  designPageSource,
  /healthLevel=\{showRoomPlanStatusHealth \? activeRoomHealthSummary\?\.level : undefined\}/,
  "design page should pass room health to the top room status bar."
);
assert.match(
  designPageSource,
  /const reviewActiveRoomHealth = useCallback/,
  "design page should route room health review into the relevant workflow."
);
assert.match(
  designPageSource,
  /onReviewHealth=\{reviewActiveRoomHealth\}/,
  "room status bar should receive the active room health action."
);

const activation = buildFirstRunActivationState({
  templateChosen: true,
  itemCount: 1,
  saveState: "saved",
  shareToken: null,
  exportOpened: false,
});
assert.equal(activation.complete, false);
assert.equal(activation.nextStep?.id, "share_or_export");
assert.equal(activation.progressPercent, 75);
assert.match(
  designPageSource,
  /const firstRunActivationState = useMemo/,
  "design page should compute first-run activation state."
);
assert.match(
  designPageSource,
  /data-testid="qa-first-run-activation"/,
  "design page should expose first-run activation QA progress."
);
assert.match(
  designPageSource,
  /data-testid="beta-start-activation-progress"/,
  "beta start panel should show visible first-run activation progress."
);

for (const required of [
  "selectedItemId",
  "selectedItemProductId",
  "placementScore",
  "placementKind",
  "shoppingReadyCount",
  "shoppingNeedsReviewCount",
  "saveStatus",
  "shareEnabled",
  "activePlacementTarget",
]) {
  assert.ok(feedbackSource.includes(required), `feedback widget should type ${required}.`);
  assert.ok(designPageSource.includes(`${required}:`), `design page should send ${required}.`);
}

assert.match(smartPlacementE2eSource, /catalog-placement-confirm-panel/);
assert.match(smartPlacementE2eSource, /catalog-placement-target-room/);
assert.match(smartPlacementE2eSource, /catalog-placement-confirm/);
assert.match(
  packageJson.scripts?.["test:e2e:smart-placement"] ?? "",
  /17-smart-placement-smoke\.spec\.ts/,
  "smart placement smoke should have a dedicated Playwright script."
);

console.log("Beta readiness upgrade checks passed.");
