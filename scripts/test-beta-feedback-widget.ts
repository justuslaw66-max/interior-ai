import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildDesignPageBetaFeedbackContext } from "../lib/design-page-beta-feedback";
import { buildDesignPageDialogLayerAdapter } from "../lib/design-page-dialog-layer-adapter";
import { buildDesignPageDialogLayerModel } from "../lib/design-page-dialog-layer-model";

const widgetSource = readFileSync(
  join(process.cwd(), "components/BetaFeedbackWidget.tsx"),
  "utf8"
);
const commandBarSource = readFileSync(
  join(process.cwd(), "components/editor/EditorCommandBar.tsx"),
  "utf8"
);
const designPageCommandBarSource = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/DesignPageEditorCommandBar.tsx"
  ),
  "utf8"
);
const designPageSource = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const presentationWorkspaceSource = readFileSync(
  join(process.cwd(), "lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  "utf8"
);
const dialogLayerSource = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignPageDialogLayer.tsx"),
  "utf8"
);
const editorChromeControllerSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageEditorChromeController.ts"),
  "utf8"
);
const appEventRouteSource = readFileSync(
  join(process.cwd(), "app/api/track/app-event/route.ts"),
  "utf8"
);
const appEventsSource = readFileSync(join(process.cwd(), "lib/app-events.ts"), "utf8");

assert.match(
  appEventsSource,
  /"beta_feedback_submitted"/,
  "beta feedback should be included in the typed app-event union."
);
assert.match(
  appEventRouteSource,
  /new Set<AppEventType>\(APP_EVENT_TYPES\)/,
  "beta feedback should be accepted through the shared typed app-event allow-list."
);
assert.match(
  appEventsSource,
  /AppEventLogResult[\s\S]*eventId/,
  "app event logging should return a persisted report id for smoke evidence."
);
assert.match(
  appEventRouteSource,
  /eventId:\s*result\.eventId/,
  "app-event route should return the persisted event id."
);
assert.match(
  commandBarSource,
  /data-testid="beta-feedback-open"/,
  "beta feedback entry point in the More menu should have a stable test id."
);
assert.match(
  commandBarSource,
  /data-testid="beta-feedback-open"[\s\S]*setOverflowOpen\(false\);[\s\S]*onFeedback\(\);/,
  "opening feedback should close the More menu first."
);
assert.match(
  designPageCommandBarSource,
  /<EditorCommandBar[\s\S]*?\{\.\.\.actions\.commandBar\}/,
  "the design-page command wrapper should preserve the leaf feedback action contract."
);
assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?dialogs:\s*\{[\s\S]*?setFeedbackOpen: base\.actions\.dialogs\.setFeedbackOpen/,
  "the presentation workspace should inject the feedback dialog setter into the presentation/QA facade."
);
assert.match(
  editorChromeControllerSource,
  /const openFeedback = \(\) => \{[\s\S]*?actions\.dialogs\.setFeedbackOpen\(true\);[\s\S]*?onFeedback: openFeedback/,
  "the chrome controller should open feedback through the typed command-wrapper boundary."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-dialog"/,
  "beta feedback dialog should have a stable test id."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-note"/,
  "beta feedback note field should have a stable test id."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-submit"/,
  "beta feedback submit action should have a stable test id."
);
assert.match(
  widgetSource,
  /role="status"/,
  "beta feedback submission state should be announced as status text."
);
assert.match(
  widgetSource,
  /data-testid="beta-feedback-report-id"/,
  "beta feedback success state should expose a copyable report id for staging signoff."
);
assert.match(
  widgetSource,
  /maxLength=\{1200\}/,
  "beta feedback notes should stay bounded before submission."
);
assert.match(
  widgetSource,
  /trimmed\.slice\(0,\s*1200\)/,
  "beta feedback payload should be capped even if the DOM limit is bypassed."
);
assert.match(
  widgetSource,
  /fetch\("\/api\/track\/app-event"/,
  "beta feedback should post to the durable app-event endpoint."
);
assert.match(
  widgetSource,
  /response\.json\(\)[\s\S]*setReportId/,
  "beta feedback should read the durable event id from the API response."
);
assert.match(
  widgetSource,
  /eventType:\s*"beta_feedback_submitted"/,
  "beta feedback should send the expected app-event type."
);
assert.match(
  widgetSource,
  /exportReadinessScore/,
  "beta feedback context should include export readiness."
);
assert.match(
  widgetSource,
  /viewportWidth[\s\S]*viewportHeight/,
  "beta feedback context should include viewport dimensions."
);

const feedbackContext = buildDesignPageBetaFeedbackContext({
  identity: { designId: "design-1", shareToken: "share-1" },
  editor: {
    mode: "designer",
    viewMode: "2d",
    plan: "pro",
    saveStatus: "saved",
    shareEnabled: true,
  },
  project: {
    activeRoomName: "Living room",
    roomCount: 3,
    itemCount: 8,
    openingCount: 4,
    exportReadinessScore: 92,
  },
  selection: { itemId: "item-1", productId: "product-1" },
  placement: {
    score: 88,
    kind: "great",
    targetRoomName: null,
    fallbackRoomName: "Living room",
  },
  shopping: { readyCount: 6, needsReviewCount: 2 },
  viewport: { width: 1440, height: 900 },
});
assert.deepEqual(
  {
    roomCount: feedbackContext.roomCount,
    itemCount: feedbackContext.itemCount,
    openingCount: feedbackContext.openingCount,
    activePlacementTarget: feedbackContext.activePlacementTarget,
    viewportWidth: feedbackContext.viewportWidth,
    viewportHeight: feedbackContext.viewportHeight,
  },
  {
    roomCount: 3,
    itemCount: 8,
    openingCount: 4,
    activePlacementTarget: "Living room",
    viewportWidth: 1440,
    viewportHeight: 900,
  },
  "the pure feedback-context builder should preserve editor counts, target fallback, and viewport dimensions."
);

const noop = () => undefined;
const dialogModel = buildDesignPageDialogLayerModel({
  access: {
    isClientPreview: false,
    isAuthenticated: true,
    isPro: true,
    designerTheme: false,
  },
  billing: {
    upgrade: { open: false },
    plans: {},
    startingCheckout: false,
    annualSavingsLabel: "",
    upgradeActions: {},
    plansActions: {},
  },
  persistence: {
    guestSave: { open: false, onNotNow: noop, onSaveAndContinue: noop },
    myDesigns: { data: {}, actions: {} },
    templateChoice: { data: {}, actions: {} },
  },
  ai: { notes: {} },
  presentation: {
    presentExport: { configuration: { open: true }, state: {}, actions: {} },
  },
  editing: { roomRename: {}, annotation: {} },
  placement: {
    identity: {},
    assessment: {},
    activeRoomName: null,
    actions: {},
  },
  feedback: {
    beta: { open: true, context: feedbackContext, onOpenChange: noop },
    toasts: {},
    validation: {},
  },
  sharing: {},
  cabinetry: {
    state: {},
    access: {},
    configuration: {},
    refs: {},
    actions: {},
  },
  cart: {},
} as unknown as Parameters<typeof buildDesignPageDialogLayerModel>[0]);
assert.equal(dialogModel.overlays.betaFeedback?.showTrigger, false);
assert.strictEqual(dialogModel.overlays.betaFeedback?.context, feedbackContext);

const editorLayer = buildDesignPageDialogLayerAdapter(dialogModel);
assert.strictEqual(editorLayer.overlays.betaFeedback, dialogModel.overlays.betaFeedback);
const previewLayer = buildDesignPageDialogLayerAdapter({
  ...dialogModel,
  state: { ...dialogModel.state, isClientPreview: true },
});
assert.equal(
  previewLayer.overlays.betaFeedback,
  null,
  "client preview should suppress beta feedback at the pure dialog-layer policy boundary."
);
assert.match(
  dialogLayerSource,
  /\{overlays\.betaFeedback\s*\?\s*\([\s\S]*?<BetaFeedbackWidget\s+\{\.\.\.overlays\.betaFeedback\}\s*\/>/,
  "the fixed dialog layer should own beta feedback rendering."
);
assert.doesNotMatch(
  designPageSource,
  /<BetaFeedbackWidget\b/,
  "the workspace should not retain beta-feedback leaf markup."
);
assert.match(
  designPageSource,
  /<DesignPagePanelRegion\s+\{\.\.\.panelRegionModel\}\s*\/>[\s\S]*?<DesignPageDialogLayer\s+\{\.\.\.dialogLayerModel\}\s*\/>/,
  "the workspace should compose the fixed dialog layer after the panel region."
);

console.log("Beta feedback widget checks passed.");
