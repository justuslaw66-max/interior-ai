import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  executeCommandPaletteAction,
  type CommandPaletteSession,
} from "@/lib/command-palette-session";
import { resolveEditorDialogStackZIndexes } from "@/components/editor/design-system/editorDialogRegistry";

const root = process.cwd();
const workspaceSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPageWorkspace.tsx"
  ),
  "utf8"
);
const presentationWorkspaceSource = fs.readFileSync(
  path.join(root, "lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  "utf8"
);
const commandBarSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPageEditorCommandBar.tsx"
  ),
  "utf8"
);
const commandBarLeafSource = fs.readFileSync(
  path.join(root, "components", "editor", "EditorCommandBar.tsx"),
  "utf8"
);
const panelRegionSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "DesignPagePanelRegion.tsx"
  ),
  "utf8"
);
const clientPreviewFocusPath = path.join(
  root,
  "lib",
  "useClientPreviewCommandBarFocus.ts"
);
assert.ok(
  fs.existsSync(clientPreviewFocusPath),
  "Client Preview should have one focused persistent-panel focus lifecycle."
);
const clientPreviewFocusSource = fs.existsSync(clientPreviewFocusPath)
  ? fs.readFileSync(clientPreviewFocusPath, "utf8")
  : "";
const coreShellSource = fs.readFileSync(
  path.join(root, "lib", "useDesignPageCoreShellRegistration.ts"),
  "utf8"
);
const editorChromeSource = fs.readFileSync(
  path.join(root, "components/editor/design-page/DesignPageEditorChrome.tsx"),
  "utf8"
);
const editorChromeControllerSource = fs.readFileSync(
  path.join(root, "lib/useDesignPageEditorChromeController.ts"),
  "utf8"
);
const commandPaletteSource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-page",
    "EditorCommandPalette.tsx"
  ),
  "utf8"
);
const commandPaletteHookSource = fs.readFileSync(
  path.join(root, "lib/useDesignPageCommandPalette.ts"),
  "utf8"
);
const commandPaletteSessionPath = path.join(
  root,
  "lib",
  "command-palette-session.ts"
);
assert.ok(
  fs.existsSync(commandPaletteSessionPath),
  "The Command Palette should have one typed generation and semantic-focus session owner."
);
const commandPaletteSessionSource = fs.existsSync(commandPaletteSessionPath)
  ? fs.readFileSync(commandPaletteSessionPath, "utf8")
  : "";
const dialogRegistrySource = fs.readFileSync(
  path.join(
    root,
    "components",
    "editor",
    "design-system",
    "editorDialogRegistry.ts"
  ),
  "utf8"
);
const presentationQaFacadeSource = fs.readFileSync(
  path.join(root, "lib/useDesignPagePresentationQaFacade.ts"),
  "utf8"
);

assert.match(
  commandBarSource,
  /import type \{ ComponentProps \} from "react";/,
  "The design-page command bar should infer leaf contracts with ComponentProps."
);
assert.match(
  commandBarSource,
  /type EditorCommandBarProps = ComponentProps<typeof EditorCommandBar>;/,
  "The wrapper should infer the leaf command-bar contract."
);
assert.match(
  commandBarSource,
  /type RoomPlanStatusBarProps = ComponentProps<typeof RoomPlanStatusBar>;/,
  "The wrapper should infer the room-status contract."
);

for (const contractName of [
  "DesignPageEditorCommandBarState",
  "DesignPageEditorCommandBarConfiguration",
  "DesignPageEditorCommandBarActions",
] as const) {
  assert.match(
    commandBarSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

assert.match(
  commandBarSource,
  /type DesignPageEditorCommandBarProps = \{\s*state: DesignPageEditorCommandBarState;\s*configuration: DesignPageEditorCommandBarConfiguration;\s*actions: DesignPageEditorCommandBarActions;\s*\};/,
  "The wrapper should expose only grouped state, configuration, and actions at its boundary."
);

assert.match(
  commandBarSource,
  /const room = state\.room;[\s\S]*?const contextVisible =\s*!state\.commandBar\.isClientPreview &&\s*Boolean\(room \|\| state\.commandBar\.viewMode === "3d"\);/,
  "Room context and scene quality should stay hidden in client preview and available for rooms or 3D."
);
assert.match(
  commandBarSource,
  /const contextSlot = contextVisible \? \(\s*<>\s*\{room \? \([\s\S]*?<RoomPlanStatusBar[\s\S]*?\/>\s*\) : null\}\s*<\/>\s*\) : null;/,
  "The 3D-without-room case should retain the intentional truthy empty context fragment."
);
assert.match(
  commandBarSource,
  /const overflowSlot = contextVisible \? \(/,
  "The context and overflow slots should share the exact visibility gate."
);
assert.match(
  commandBarSource,
  /data-testid="editor-command-overflow-room-context"[\s\S]*?2xl:hidden[\s\S]*?data-testid="editor-command-overflow-room-name"[\s\S]*?room\.roomName[\s\S]*?room\.widthMeters\.toFixed\(1\)[\s\S]*?room\.depthMeters\.toFixed\(1\)/,
  "Compact desktop overflow should preserve room identity and dimensions when the header context is hidden."
);
assert.match(
  commandBarSource,
  /data-testid="editor-command-overflow-fit-view"[\s\S]*?actions\.room\.onFitPlan[\s\S]*?data-testid="editor-command-overflow-view-toggle"[\s\S]*?actions\.room\.onViewModeChange/,
  "Compact desktop overflow should preserve fit and view-switch actions."
);

assert.match(
  commandBarSource,
  /<RoomPlanStatusBar[\s\S]*?roomName=\{room\.roomName\}[\s\S]*?roomTypeLabel=\{room\.roomTypeLabel\}[\s\S]*?roomCount=\{room\.roomCount\}[\s\S]*?widthMeters=\{room\.widthMeters\}[\s\S]*?depthMeters=\{room\.depthMeters\}/,
  "The command context should preserve the active room identity, count, and dimensions."
);
assert.match(
  commandBarSource,
  /healthLevel=\{\s*configuration\.showRoomHealth\s*\? room\.health\?\.level\s*:\s*undefined\s*\}[\s\S]*?healthScore=\{\s*configuration\.showRoomHealth\s*\? room\.health\?\.score\s*:\s*undefined\s*\}[\s\S]*?healthNextAction=\{\s*configuration\.showRoomHealth\s*\? room\.health\?\.nextAction\s*:\s*undefined\s*\}/,
  "Guided-plan mode should suppress all room-health values with undefined props."
);
assert.match(
  commandBarSource,
  /disabled=\{state\.commandBar\.editorMode === "present"\}[\s\S]*?dark=\{configuration\.dark\}[\s\S]*?compact=\{configuration\.compactRoomStatus\}[\s\S]*?variant="command"/,
  "Room status should preserve presentation disabling, theme, compact layout, and command variant."
);
assert.match(
  commandBarSource,
  /onViewModeChange=\{actions\.room\.onViewModeChange\}[\s\S]*?onReviewHealth=\{actions\.room\.onReviewHealth\}[\s\S]*?onFitPlan=\{actions\.room\.onFitPlan\}/,
  "Room status should retain view, health-review, and fit actions."
);

const renameIndex = commandBarSource.indexOf(
  'data-testid="editor-command-overflow-rename-room"'
);
const sceneQualityIndex = commandBarSource.indexOf(
  'data-testid="editor-overflow-scene-quality"'
);
assert.ok(
  renameIndex >= 0 && sceneQualityIndex > renameIndex,
  "The overflow slot should keep Rename room before Scene quality."
);
assert.match(
  commandBarSource,
  /<button\s+type="button"\s+data-testid="editor-command-overflow-rename-room"/,
  "The overflow rename action should remain an explicit non-submit button with its stable test id."
);
assert.match(
  commandBarSource,
  /\(\["auto", "quality", "lite"\] as const\)\.map/,
  "Scene performance choices should retain auto, quality, lite order."
);
assert.match(
  commandBarSource,
  /data-testid=\{`scene-performance-\$\{option\}`\}[\s\S]*?data-active=\{active \? "true" : "false"\}/,
  "Scene performance choices should retain stable test ids and active-state attributes."
);
assert.match(
  commandBarSource,
  /option === "auto"[\s\S]*?state\.scenePerformance\.liteEnabled[\s\S]*?\? "Auto Lite"[\s\S]*?: "Auto"[\s\S]*?option === "quality"[\s\S]*?\? "Quality"[\s\S]*?: "Lite"/,
  "Automatic scene mode should retain its effective Auto Lite label."
);
assert.match(
  commandBarSource,
  /onClick=\{\(\) => actions\.scenePerformance\.changeMode\(option\)\}/,
  "Scene performance choices should stay wired to the grouped mode action."
);

assert.match(
  commandBarSource,
  /<EditorCommandBar\s*[\s\S]*?\{\.\.\.state\.commandBar\}[\s\S]*?\{\.\.\.actions\.commandBar\}[\s\S]*?dark=\{configuration\.dark\}[\s\S]*?contextSlot=\{contextSlot\}[\s\S]*?overflowSlot=\{overflowSlot\}/,
  "The wrapper should forward inferred leaf state and actions before installing its owned slots."
);

assert.match(
  workspaceSource,
  /import \{ DesignPageEditorChrome \} from "@\/components\/editor\/design-page\/DesignPageEditorChrome";/,
  "The workspace should import the page-specific editor chrome."
);
assert.match(
  editorChromeSource,
  /import \{ DesignPageEditorCommandBar \}[\s\S]*?<DesignPageEditorCommandBar[\s\S]*?state=\{state\.commandBar\}[\s\S]*?configuration=\{configuration\.commandBar\}[\s\S]*?actions=\{actions\.commandBar\}/,
  "The editor chrome should own the page-specific command-bar wrapper."
);
assert.doesNotMatch(
  workspaceSource,
  /from "@\/components\/editor\/EditorCommandBar"|from "@\/components\/editor\/RoomPlanStatusBar"/,
  "The workspace should no longer import command-bar leaf components directly."
);
assert.doesNotMatch(
  workspaceSource,
  /<EditorCommandBar\b|<RoomPlanStatusBar\b/,
  "The workspace should delegate command and room-status rendering to the wrapper."
);
assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?editor:\s*\{[\s\S]*?activeRoom:\s*documentRoom\.derived\.room\.activeRoom \?\? null[\s\S]*?scene:\s*\{[\s\S]*?configuration:\s*\{[\s\S]*?actions:\s*\{[\s\S]*?room:\s*\{[\s\S]*?scenePerformance:\s*\{/,
  "The presentation workspace should inject grouped command, room, and performance state, configuration, and actions through the presentation/QA facade."
);
assert.match(
  editorChromeControllerSource,
  /onMillwork: configuration\.canUseCabinetryStudio[\s\S]*?\? actions\.cabinetry\.openStudio[\s\S]*?: undefined/,
  "Unavailable Millwork should remain undefined so the leaf hides both command entries."
);
assert.match(
  presentationWorkspaceSource,
  /openNewPlan:\s*persistence\.actions\.newPlan\.openNewPlanPicker[\s\S]*?saveDesignToCloud:[\s\S]*?persistence\.actions\.persistence\.saveDesignToCloud[\s\S]*?openGuestPrompt:\s*persistence\.actions\.persistence\.openGuestPrompt/,
  "The presentation workspace should inject New plan and guest/cloud save collaborators."
);
assert.match(
  editorChromeControllerSource,
  /const save = async \(\) => \{[\s\S]*?openGuestPrompt\("save", \(\) => \{\}\)[\s\S]*?await actions\.persistence\.saveDesignToCloud\(\)[\s\S]*?showToast\("Saved to cloud"\)/,
  "The editor-chrome controller should preserve guest/cloud save behavior."
);
assert.match(
  editorChromeControllerSource,
  /onNewPlan: actions\.dialogs\.openNewPlan[\s\S]*?onSave: save/,
  "The editor-chrome controller should preserve New plan and save action wiring."
);

const sceneRegionIndex = workspaceSource.indexOf("<DesignPageSceneRegion");
const chromeCompositionIndex = workspaceSource.indexOf("<DesignPageEditorChrome");
assert.ok(
  sceneRegionIndex >= 0 && chromeCompositionIndex > sceneRegionIndex,
  "Workspace composition should keep editor chrome after the scene and viewport region."
);
const commandCompositionIndex = editorChromeSource.indexOf("<DesignPageEditorCommandBar");
const betaStartIndex = editorChromeSource.indexOf("<BetaStartPanel");
const toolRailIndex = editorChromeSource.indexOf("<EditorToolRail");
assert.ok(
  commandCompositionIndex >= 0 && betaStartIndex > commandCompositionIndex && toolRailIndex > betaStartIndex,
  "Editor chrome composition should remain Command bar, Beta start, then Tool rail."
);

assert.match(
  commandBarLeafSource,
  /id=\{CLIENT_PREVIEW_COMMAND_BAR_ID\}[\s\S]*?data-testid="editor-command-bar"[\s\S]*?inert=\{isClientPreview\}[\s\S]*?aria-hidden=\{isClientPreview\}/,
  "Client Preview should inert and accessibility-hide the one command-bar root."
);
assert.match(
  commandBarLeafSource,
  /onClickCapture=\{guardHiddenCommandAction\}/,
  "The command-bar root should block programmatic hidden action routing in one capture guard."
);
assert.match(
  clientPreviewFocusSource,
  /function guardHiddenCommandAction[\s\S]*?currentTarget\.inert[\s\S]*?preventDefault\(\)[\s\S]*?stopPropagation\(\)/,
  "The root guard should suppress events only while the command bar is inert."
);
assert.match(
  panelRegionSource,
  /id=\{CLIENT_PREVIEW_EXIT_ACTION_ID\}[\s\S]*?data-testid="client-preview-exit"[\s\S]*?aria-label="Exit Presentation"/,
  "The visible preview Exit action should expose one stable semantic focus target."
);
assert.doesNotMatch(
  commandBarLeafSource + panelRegionSource,
  /EditorDialog/,
  "The persistent command bar should not become a modal dialog."
);
assert.doesNotMatch(
  clientPreviewFocusSource,
  /EditorDialog|querySelector|setTimeout|requestAnimationFrame/,
  "Client Preview focus routing should not use modal, selector, timeout, or frame behavior."
);
for (const focusContractMarker of [
  "generationRef",
  "scopeKey",
  "semanticIdentity",
  "isConnected",
  "CLIENT_PREVIEW_EXIT_ACTION_ID",
  "CLIENT_PREVIEW_FALLBACK_ACTION_ID",
  "getAnimations",
] as const) {
  assert.match(
    clientPreviewFocusSource,
    new RegExp(`\\b${focusContractMarker}\\b`),
    `Client Preview focus lifecycle should retain ${focusContractMarker}.`
  );
}
assert.match(
  coreShellSource,
  /useClientPreviewBaseBoundary\([\s\S]*?searchParams\.get\("designId"\)[\s\S]*?designId/,
  "Preview focus scope should cancel on requested and loaded design identity changes."
);

assert.match(
  commandPaletteSource,
  /<EditorDialog[\s\S]*?title="Command palette"[\s\S]*?initialFocusRef=\{inputRef\}[\s\S]*?returnFocusIds=\{returnFocusIds\}[\s\S]*?hideWhenSuperseded[\s\S]*?manageBackground[\s\S]*?cancelFocusRestorationOnUnmount/,
  "The Command Palette should compose the shared modal lifecycle with input entry, semantic return, visual supersession, background management, and unmount cancellation."
);
assert.match(
  commandPaletteSource,
  /overlayClassName="[^"]*z-\[95\][^"]*!bg-black\/30[^"]*"[\s\S]*?!max-w-\[560px\][\s\S]*?!p-0/,
  "The shared dialog defaults should not change the Palette backdrop, width, or edge-to-edge panel."
);
assert.doesNotMatch(
  commandPaletteSource,
  /role="dialog"|aria-label="Command palette"|autoFocus|addEventListener|handleTab/,
  "The Palette leaf should not recreate dialog semantics, autofocus, listeners, or a focus trap outside EditorDialog."
);
assert.deepEqual(resolveEditorDialogStackZIndexes([95]), [95]);
assert.deepEqual(resolveEditorDialogStackZIndexes([95, 50]), [95, 96]);
assert.deepEqual(resolveEditorDialogStackZIndexes([50, 95]), [95, 96]);
assert.match(
  dialogRegistrySource,
  /refreshDialogVisualStack[\s\S]*?setProperty\("z-index"[\s\S]*?hideWhenSuperseded[\s\S]*?setProperty\("visibility", "hidden", "important"\)[\s\S]*?restoreDialogVisibility[\s\S]*?registerEditorDialogRoot[\s\S]*?refreshDialogVisualStack\(\)[\s\S]*?unregisterEditorDialogRoot[\s\S]*?restoreDialogVisualLayer[\s\S]*?refreshDialogVisualStack\(\)/,
  "Registered dialogs should receive visual stack ownership while a superseded Palette withdraws across nested stacking contexts and restores on close."
);
assert.match(
  commandPaletteHookSource,
  /useEffect\(\(\) => \{[\s\S]*?unmountedRef\.current = false[\s\S]*?return \(\) => \{[\s\S]*?unmountedRef\.current = true/,
  "The Palette hook should reset its unmount guard during Strict Mode effect setup before arming cleanup."
);
assert.match(
  dialogRegistrySource,
  /export function hasActiveEditorModal\(\)[\s\S]*?dialogStack\.length > 0[\s\S]*?hasExternalEditorModal\(\)/,
  "The shared registry should expose one narrow active-modal query for global shortcut ownership."
);
for (const marker of [
  "generation",
  "scopeKey",
  "query",
  "actionConsumed",
  "cancelled",
  "semanticIdentity",
  "returnFocusIds",
] as const) {
  assert.match(
    commandPaletteSessionSource,
    new RegExp(`\\b${marker}\\b`),
    `The typed Palette session should retain ${marker}.`
  );
}
assert.doesNotMatch(
  commandPaletteSessionSource,
  /querySelector|setTimeout|requestAnimationFrame|addEventListener/,
  "The Palette session/focus helper should not create selector, timer, frame, or listener ownership."
);
assert.match(
  commandPaletteHookSource,
  /hasActiveEditorModal\(\)[\s\S]*?event\.preventDefault\(\)[\s\S]*?return/,
  "Cmd/Ctrl+K should be consumed and ignored while another modal is active."
);
assert.match(
  commandPaletteSessionSource,
  /session\.actionConsumed = true;[\s\S]*?session\.query = "";/,
  "Palette action consumption should synchronously freeze duplicate execution and clear the session query."
);
assert.match(
  commandPaletteHookSource,
  /executeCommandPaletteAction\([\s\S]*?focusRestorationEnabledRef\.current = false[\s\S]*?flushSync\(\(\) => setSession\(null\)\)[\s\S]*?action\.run\(\)/,
  "Palette actions should consume once and synchronously close before running domain behavior."
);
const executionSession: CommandPaletteSession = {
  generation: 1,
  scopeKey: "palette-contract",
  query: "fit",
  opener: null,
  returnFocusIds: [],
  actionConsumed: false,
  cancelled: false,
};
const executionLog: string[] = [];
let paletteOpen = true;
let actionDialogOpen = false;
assert.equal(
  executeCommandPaletteAction(
    executionSession,
    () => {
      paletteOpen = false;
      executionLog.push("palette-closed");
    },
    () => {
      assert.equal(paletteOpen, false);
      actionDialogOpen = true;
      executionLog.push("action-dialog-opened");
    }
  ),
  true
);
assert.deepEqual(executionLog, ["palette-closed", "action-dialog-opened"]);
assert.equal(actionDialogOpen, true);
assert.equal(executionSession.query, "");
assert.equal(
  executeCommandPaletteAction(
    executionSession,
    () => executionLog.push("duplicate-close"),
    () => executionLog.push("duplicate-run")
  ),
  false
);
assert.deepEqual(executionLog, ["palette-closed", "action-dialog-opened"]);
assert.match(
  presentationQaFacadeSource,
  /commandPaletteScopeKey[\s\S]*?returnFocusIds: commandPalette\.state\.returnFocusIds[\s\S]*?onRunAction: commandPalette\.actions\.runAction/,
  "The presentation facade should wire lifecycle scope, semantic return, and owned execution to the Palette leaf."
);
assert.doesNotMatch(
  presentationQaFacadeSource,
  /open:\s*!state\.editor\.isClientPreview && commandPalette\.state\.open/,
  "Client Preview should invalidate the Palette session instead of merely masking its rendering."
);
assert.match(
  presentationWorkspaceSource,
  /commandPaletteScopeKey:[\s\S]*?pathname[\s\S]*?searchParams\.get\("designId"\)[\s\S]*?designId[\s\S]*?urlWorkspace[\s\S]*?editorMode[\s\S]*?plan[\s\S]*?isClientPreview/,
  "Palette scope should include route, requested/current design, project, editor mode, Consumer/Pro, and Preview ownership."
);

console.log("Design-page editor command-bar guardrails passed.");
