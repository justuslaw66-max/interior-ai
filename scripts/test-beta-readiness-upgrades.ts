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
import {
  buildRoomHealthSummary,
  resolveDesignPageRoomHealthReviewTarget,
} from "../lib/room-health-summary";
import { buildShareExportFidelitySummary } from "../lib/share-export-fidelity";
import { createRoom, type DesignSnapshot } from "../lib/room-types";

const root = process.cwd();
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};
const designPageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const designPageEditorCommandBarSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageEditorCommandBar.tsx"),
  "utf8"
);
const designPageOnboardingSource = readFileSync(
  join(root, "lib/useDesignPageOnboarding.ts"),
  "utf8"
);
const designPageQaMarkersSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageQaMarkers.tsx"),
  "utf8"
);
const designPageRoomReadModelSource = readFileSync(
  join(root, "lib/useDesignPageRoomReadModel.ts"),
  "utf8"
);
const designPagePlanPresentationSource = readFileSync(
  join(root, "lib/useDesignPagePlanPresentationModel.ts"),
  "utf8"
);
const betaStartPanelSource = readFileSync(
  join(root, "components/editor/design-page/BetaStartPanel.tsx"),
  "utf8"
);
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

for (const source of [stripeCheckoutSource, shopifyCheckoutSource]) {
  assert.match(source, /resolveCheckoutBoundaryDiagnostics/, "checkout routes should run boundary diagnostics.");
  assert.match(source, /buildCheckoutBoundaryResponsePayload/, "checkout routes should return safe diagnostics.");
}
assert.match(
  stripeCheckoutProSource,
  /export \{ POST \} from "\.\.\/checkout\/route"/,
  "The legacy Pro checkout endpoint should delegate to the canonical secured handler."
);
for (const source of [stripeCheckoutSource]) {
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
  /href="\/admin\/catalog\/health"/,
  "The admin overview should link operators to catalog health diagnostics."
);
assert.match(
  adminPageSource,
  /Checkout started \(24h\)/,
  "The admin overview should expose checkout activity."
);
assert.match(
  adminPageSource,
  /Webhook failures \(24h\)/,
  "The admin overview should expose provider failure activity without secret values."
);
assert.match(
  feedbackSource,
  /beta_feedback_submitted/,
  "The beta feedback widget should emit the event consumed by operational triage."
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
assert.equal(
  resolveDesignPageRoomHealthReviewTarget({
    ...roomHealth,
    level: "ready",
  }),
  null
);
assert.equal(
  resolveDesignPageRoomHealthReviewTarget({
    ...roomHealth,
    level: "blocked",
    shoppingNeedsReviewCount: 1,
  }),
  "shopping"
);
assert.equal(
  resolveDesignPageRoomHealthReviewTarget({
    ...roomHealth,
    level: "blocked",
    shoppingNeedsReviewCount: 0,
    exportIssueCount: 1,
  }),
  "export"
);
assert.equal(
  resolveDesignPageRoomHealthReviewTarget({
    ...roomHealth,
    level: "review",
    shoppingNeedsReviewCount: 0,
    exportIssueCount: 0,
    crampedPlacementCount: 1,
  }),
  "placement"
);
assert.equal(
  resolveDesignPageRoomHealthReviewTarget({
    ...roomHealth,
    level: "review",
    shoppingNeedsReviewCount: 0,
    exportIssueCount: 0,
    blockedPlacementCount: 0,
    crampedPlacementCount: 0,
  }),
  "plan"
);
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
  designPageRoomReadModelSource,
  /const activeRoomHealthSummary = useMemo/,
  "the room read model should compute active room health from live editor state."
);
assert.match(
  designPageEditorCommandBarSource,
  /healthLevel=\{\s*configuration\.showRoomHealth\s*\?\s*room\.health\?\.level\s*:\s*undefined\s*\}/,
  "the command-bar wrapper should render room health in the top room status bar."
);
assert.match(
  designPageSource,
  /health:\s*activeRoomHealthSummary\s*\?\s*\{[\s\S]*level:\s*activeRoomHealthSummary\.level,[\s\S]*score:\s*activeRoomHealthSummary\.placementScore,[\s\S]*nextAction:\s*activeRoomHealthSummary\.nextAction,/,
  "the workspace should pass live room health through the command-bar boundary."
);
assert.match(
  designPageRoomReadModelSource,
  /const reviewActiveRoomHealth = useCallback/,
  "the room read model should route room health review into the relevant workflow."
);
assert.match(
  designPageEditorCommandBarSource,
  /onReviewHealth=\{actions\.room\.onReviewHealth\}/,
  "the command-bar wrapper should pass the active room health action to the room status bar."
);
assert.match(
  designPageSource,
  /room:\s*\{[\s\S]*onReviewHealth:\s*reviewActiveRoomHealth,[\s\S]*onFitPlan:\s*handleFitPlanView,/,
  "the workspace should pass the active room review action through the command-bar boundary."
);
assert.match(
  designPagePlanPresentationSource,
  /const compactRoomPlanStatusBar\s*=\s*[\s\S]*showPlanGuidedActionsToggle \|\| layout\.commercePanelVisible;[\s\S]*const showRoomPlanStatusHealth = !showPlanGuidedActionsToggle;/,
  "the plan presentation model should own compact and health-visibility policy."
);
assert.match(
  designPageSource,
  /compactRoomStatus:\s*compactRoomPlanStatusBar,[\s\S]*showRoomHealth:\s*showRoomPlanStatusHealth,/,
  "the workspace should pass compact and health-visibility policy through the command-bar boundary."
);
assert.match(
  designPageEditorCommandBarSource,
  /<RoomPlanStatusBar[\s\S]*compact=\{configuration\.compactRoomStatus\}[\s\S]*onReviewHealth=\{actions\.room\.onReviewHealth\}/,
  "the command-bar wrapper should own compact room-status composition."
);
assert.doesNotMatch(
  designPageSource,
  /from "@\/components\/editor\/RoomPlanStatusBar"|<RoomPlanStatusBar/,
  "the workspace should delegate room-status imports and rendering to DesignPageEditorCommandBar."
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
  designPageOnboardingSource,
  /const firstRunActivationState = useMemo/,
  "the design-page onboarding controller should compute first-run activation state."
);
assert.match(
  designPageSource,
  /useDesignPageOnboarding/,
  "design page should mount the first-run onboarding controller."
);
assert.match(
  designPageQaMarkersSource,
  /data-testid="qa-first-run-activation"/,
  "design page QA markers should expose first-run activation progress."
);
assert.match(
  designPageSource,
  /<DesignPageRuntimeQaMarkers/,
  "design page should mount the runtime QA markers."
);
assert.match(
  betaStartPanelSource,
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
