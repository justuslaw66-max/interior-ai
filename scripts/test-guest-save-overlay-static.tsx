import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  GuestSavePromptDialog,
  type GuestSavePromptDialogProps,
} from "../components/editor/design-page/GuestSavePromptDialog";
import {
  consumeGuestPromptSession,
  createGuestPromptSession,
} from "../lib/guest-save-prompt";
import { GuestSavePromptController } from "../lib/useGuestSavePromptController";
import { createGuestPromptScopeKey } from "../lib/useDesignPagePersistenceWorkspaceRegistration";

const root = process.cwd();
const read = (path: string) => readFileSync(`${root}/${path}`, "utf8");

const promptSource = read(
  "components/editor/design-page/GuestSavePromptDialog.tsx"
);
const persistenceSource = read("lib/useDesignPagePersistence.ts");
const controllerSource = read("lib/useGuestSavePromptController.ts");
const workspaceSource = read(
  "components/editor/design-page/DesignPageWorkspace.tsx"
);
const commandBarSource = read("components/editor/EditorCommandBar.tsx");
const aiPanelSource = read("components/editor/DesignControlsAiPanel.tsx");
const cartSource = read("components/CartSidebar.tsx");

const noOp = () => undefined;
const baseProps: GuestSavePromptDialogProps = {
  reason: null,
  busy: false,
  lifecycleScopeKey: "static-test",
  onCancel: noOp,
  onContinueWithoutSaving: noOp,
  onSaveAndContinue: noOp,
};
const render = (props: Partial<GuestSavePromptDialogProps>) =>
  renderToStaticMarkup(
    createElement(GuestSavePromptDialog, { ...baseProps, ...props })
  );

const closed = render({});
assert.doesNotMatch(closed, /role="dialog"|guest-save-prompt-primary/);
const open = render({ reason: "save" });
assert.equal((open.match(/role="dialog"/g) ?? []).length, 1);
assert.match(open, /aria-modal="true"/);
assert.match(open, /Save and sync this design/);
assert.match(open, /aria-label="Close save and sync prompt"/);

let continuationCalls = 0;
const firstSession = createGuestPromptSession(
  "checkout",
  1,
  "scope-a",
  () => continuationCalls += 1
);
consumeGuestPromptSession(firstSession, firstSession, true)?.();
assert.equal(continuationCalls, 1);
assert.equal(consumeGuestPromptSession(firstSession, firstSession, true), null);
const cancelledSession = createGuestPromptSession(
  "ai-layout",
  2,
  "scope-a",
  () => continuationCalls += 1
);
assert.equal(
  consumeGuestPromptSession(cancelledSession, cancelledSession, false),
  undefined
);
assert.equal(continuationCalls, 1);
const staleSession = createGuestPromptSession(
  "save",
  3,
  "scope-old",
  () => continuationCalls += 1
);
assert.equal(
  consumeGuestPromptSession(
    staleSession,
    { ...staleSession, scopeKey: "scope-new" },
    true
  ),
  null
);
assert.equal(continuationCalls, 1);

assert.match(
  promptSource,
  /<EditorDialog[\s\S]*?title="Save and sync this design\?"[\s\S]*?manageBackground/,
  "Guest Save Prompt must compose the shared managed EditorDialog lifecycle."
);
assert.match(promptSource, /reason: GuestPromptReason \| null/);
assert.match(promptSource, /onCancel: \(\) => void/);
assert.match(promptSource, /onContinueWithoutSaving: \(\) => void/);
assert.match(promptSource, /getGuestPromptReturnFocusIds\(reason\)/);
assert.match(promptSource, /GUEST_PROMPT_CLOSE_ACTION_ID/);
assert.match(promptSource, /GUEST_PROMPT_CONTINUE_ACTION_ID/);
assert.match(promptSource, /GUEST_PROMPT_PRIMARY_ACTION_ID/);
assert.doesNotMatch(
  promptSource,
  /fixed inset-0 z-50 flex items-center justify-center bg-black\/40/,
  "The former custom modal shell must not survive."
);

assert.match(
  persistenceSource,
  /useGuestSavePromptController\(\{/,
  "Persistence must delegate to the single Guest Prompt lifecycle owner."
);
assert.match(controllerSource, /createGuestPromptSession\(/);
assert.match(controllerSource, /consumeGuestPromptSession\(/);
assert.match(controllerSource, /class GuestSavePromptController/);
assert.match(controllerSource, /invalidateScope\(scopeKey: string\)/);
assert.match(controllerSource, /dispose\(\)/);
assert.match(
  persistenceSource,
  /guestPromptScopeKey/,
  "Route, design, project, mode, and auth identity must bind the prompt session."
);
assert.doesNotMatch(persistenceSource, /const \[guestPromptReason/);
assert.doesNotMatch(persistenceSource, /guestPromptActionRef/);

assert.match(
  workspaceSource,
  /guestSave:\s*\{[\s\S]*?reason:\s*persistenceState\.guestPrompt\?\.reason \?\? null/,
  "Workspace rendering must not reduce the typed prompt reason to a boolean."
);
assert.doesNotMatch(
  workspaceSource,
  /Boolean\(persistenceState\.guestPromptReason\)/
);

assert.match(commandBarSource, /id=\{GUEST_SAVE_OPENER_ID\}/);
assert.match(aiPanelSource, /id=\{GUEST_AI_LAYOUT_OPENER_ID\}/);
assert.match(cartSource, /id=\{GUEST_CHECKOUT_OPENER_ID\}/);
assert.match(cartSource, /onGuestCapture\("checkout"/);
assert.match(cartSource, /if \(busy \|\| checkoutLock\.active\(\)\) return;/);
assert.match(cartSource, /await checkoutLock\.run\(async \(\) => \{/);

function productionScopeKey(overrides: Partial<{
  pathname: string;
  requestedDesignId: string;
  designId: string;
  workspace: string;
  mode: string;
  plan: string;
  designer: boolean;
  preview: boolean;
  authenticated: boolean;
}> = {}) {
  const identity = {
    pathname: "/design",
    requestedDesignId: "requested-a",
    designId: "design-a",
    workspace: "workspace-a",
    mode: "homeowner",
    plan: "free",
    designer: false,
    preview: false,
    authenticated: false,
    ...overrides,
  };
  return createGuestPromptScopeKey({
    boundaries: {
      base: {
        derived: {
          navigation: {
            pathname: identity.pathname,
            searchParams: new URLSearchParams({ designId: identity.requestedDesignId }),
            urlWorkspace: identity.workspace,
          },
        },
        state: {
          identity: {
            designId: identity.designId,
            session: identity.authenticated ? { user: { id: "user-a" } } : null,
          },
          brief: { mode: identity.mode },
          access: { plan: identity.plan },
        },
      },
    },
    derived: {
      access: {
        isDesigner: identity.designer,
        isClientPreview: identity.preview,
      },
    },
  } as Parameters<typeof createGuestPromptScopeKey>[0]);
}

const productionScopeBaseline = productionScopeKey();
for (const changedIdentity of [
  productionScopeKey({ pathname: "/design/shared" }),
  productionScopeKey({ requestedDesignId: "requested-b" }),
  productionScopeKey({ designId: "design-b" }),
  productionScopeKey({ workspace: "workspace-b" }),
  productionScopeKey({ mode: "designer" }),
  productionScopeKey({ plan: "pro" }),
  productionScopeKey({ designer: true }),
  productionScopeKey({ preview: true }),
  productionScopeKey({ authenticated: true }),
]) {
  assert.notEqual(changedIdentity, productionScopeBaseline);
}

async function testControllerGenerationAndScopeOwnership() {
  let activeScopeKey = "route-a|requested-a|design-a|workspace-a|mode-a|guest";
  let claimCalls = 0;
  let signInCalls = 0;
  let continuationCalls = 0;
  const snapshots: Array<ReturnType<GuestSavePromptController["snapshotForScope"]>> = [];
  const parameters = () => ({
    scopeKey: activeScopeKey,
    claimGuestDesign: async () => { claimCalls += 1; },
    requestSignIn: () => { signInCalls += 1; },
  });
  const controller = new GuestSavePromptController(
    parameters(),
    (snapshot) => snapshots.push(snapshot)
  );

  controller.open("save", () => { continuationCalls += 1; });
  const generationA = controller.snapshotForScope(activeScopeKey).session;
  assert.ok(generationA);
  controller.open("checkout", () => { continuationCalls += 1; });
  const generationB = controller.snapshotForScope(activeScopeKey).session;
  assert.ok(generationB);
  assert.equal(generationA.consumed, true);

  controller.cancel(generationA);
  controller.continueWithoutSaving(generationA);
  await controller.saveAndContinue(generationA);
  assert.equal(controller.snapshotForScope(activeScopeKey).session, generationB);
  assert.equal(continuationCalls, 0);
  assert.equal(claimCalls, 0);
  assert.equal(signInCalls, 0);

  controller.continueWithoutSaving(generationB);
  assert.equal(continuationCalls, 1);
  assert.equal(controller.snapshotForScope(activeScopeKey).session, null);

  for (const changedIdentity of [
    "route-b|requested-a|design-a|workspace-a|mode-a|guest",
    "route-b|requested-b|design-a|workspace-a|mode-a|guest",
    "route-b|requested-b|design-b|workspace-a|mode-a|guest",
    "route-b|requested-b|design-b|workspace-b|mode-a|guest",
    "route-b|requested-b|design-b|workspace-b|mode-b|guest",
    "route-b|requested-b|design-b|workspace-b|mode-b|authenticated",
  ]) {
    controller.open("ai-layout", () => { continuationCalls += 1; });
    const stale = controller.snapshotForScope(activeScopeKey).session;
    assert.ok(stale);
    activeScopeKey = changedIdentity;
    controller.configure(parameters());
    controller.invalidateScope(activeScopeKey);
    controller.continueWithoutSaving(stale);
    assert.equal(controller.snapshotForScope(activeScopeKey).session, null);
  }
  assert.equal(continuationCalls, 1);

  controller.open("save", noOp);
  const primary = controller.snapshotForScope(activeScopeKey).session;
  assert.ok(primary);
  await Promise.all([
    controller.saveAndContinue(primary),
    controller.saveAndContinue(primary),
  ]);
  assert.equal(claimCalls, 1);
  assert.equal(signInCalls, 1);
  assert.ok(snapshots.length > 0);
  controller.dispose();

  let releaseClaim: (() => void) | undefined;
  let pendingSignInCalls = 0;
  const pendingController = new GuestSavePromptController(
    {
      scopeKey: "route-pending|design-pending|guest",
      claimGuestDesign: () => new Promise<void>((resolve) => {
        releaseClaim = resolve;
      }),
      requestSignIn: () => { pendingSignInCalls += 1; },
    },
    noOp
  );
  pendingController.open("save", noOp);
  const pendingPrimary = pendingController.snapshotForScope(
    "route-pending|design-pending|guest"
  ).session;
  assert.ok(pendingPrimary);
  const pendingAction = pendingController.saveAndContinue(pendingPrimary);
  pendingController.configure({
    scopeKey: "route-pending|design-pending|authenticated",
    claimGuestDesign: async () => undefined,
    requestSignIn: () => { pendingSignInCalls += 1; },
  });
  pendingController.invalidateScope(
    "route-pending|design-pending|authenticated"
  );
  assert.ok(releaseClaim);
  releaseClaim();
  await pendingAction;
  assert.equal(pendingSignInCalls, 0);
  pendingController.dispose();
}

void testControllerGenerationAndScopeOwnership()
  .then(() => console.log("Guest Save Prompt static lifecycle checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
