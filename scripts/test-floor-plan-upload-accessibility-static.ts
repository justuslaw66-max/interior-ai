import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");

const panel = read("components/editor/FloorPlanUploadPanel.tsx");
const dialog = read("components/editor/FloorPlanUploadWorkspaceDialog.tsx");
const uploadLifecycle = read(
  "components/editor/useFloorPlanUploadDialogLifecycle.ts"
);
const workspaceFocus = read("components/editor/useFloorPlanWorkspaceFocus.ts");
const planPanel = read("components/editor/DesignControlsPlanPanel.tsx");
const emptySurfacesActions = read(
  "components/editor/design-controls-plan/EmptyFloorPlanSurfacesActions.tsx"
);
const workspaceOpener = read("components/editor/FloorPlanWorkspaceOpener.tsx");
const planPanelOpener = read("lib/open-floor-plan-upload-workspace.ts");
const focusContract = read("lib/floor-plan-upload-dialog-focus.ts");
const addressSearch = read("components/editor/FloorPlanAddressSearch.tsx");
const workspace = read("components/editor/FloorPlanImportWorkspace.tsx");
const assistant = read("components/editor/FloorPlanImportAssistant.tsx");
const pageSelection = read("components/editor/FloorPlanPageSelectionPanel.tsx");
const review = read(
  "components/editor/floor-plan-import-review/FloorPlanImportReviewPanel.tsx"
);
const history = read("components/editor/FloorPlanImportHistory.tsx");
const historyConfirmation = read(
  "components/editor/useFloorPlanHistoryConfirmationState.ts"
);
const lifecycle = read(
  "components/editor/design-system/useEditorDialogLifecycle.ts"
);
const registry = read("components/editor/design-system/editorDialogRegistry.ts");
const childDialogHarness = read(
  "tests/required/fixtures/floor-plan-upload-dialog-harness.tsx"
);
const emptyEntryHarness = read(
  "tests/required/fixtures/floor-plan-empty-entry-harness.tsx"
);

assert.match(uploadLifecycle, /useEditorDialogLifecycle\(\{/);
assert.match(uploadLifecycle, /manageBackground:\s*true/);
assert.match(uploadLifecycle, /lockBodyScroll:\s*true/);
assert.match(uploadLifecycle, /cancelFocusRestorationOnUnmount:\s*true/);
assert.match(workspace, /data-editor-dialog-initial-focus/);
assert.match(dialog, /data-testid="floor-plan-import-dialog"/);
assert.match(dialog, /role="dialog"/);
assert.match(dialog, /aria-modal="true"/);
assert.match(dialog, /h-\[100dvh\]/);
assert.match(dialog, /sm:h-\[calc\(100dvh-2rem\)\]/);
assert.match(dialog, /sm:max-w-\[1600px\]/);
assert.doesNotMatch(panel, /window\.addEventListener\("keydown"/);
assert.doesNotMatch(panel, /document\.body\.style\.overflow\s*=/);

assert.match(planPanel, /id:\s*FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID,[\s\S]*?testId:\s*"plan-tool-import-2d"[\s\S]*?openFloorPlanUploadPicker\(FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID\)/);
assert.match(planPanel, /<EmptyFloorPlanSurfacesActions[\s\S]*?onSelectUploadMode=\{\(\) => setPlanStartMode\("upload"\)\}/);
assert.match(emptySurfacesActions, /<FloorPlanWorkspaceOpener[\s\S]*?semanticId=\{FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID\}[\s\S]*?data-testid="floor-plan-surfaces-upload"/);
assert.match(planPanel, /<EmptyFloorPlanProUploadAction[\s\S]*?onSelectUploadMode=\{\(\) => setPlanStartMode\("upload"\)\}/);
assert.match(emptySurfacesActions, /<FloorPlanWorkspaceOpener[\s\S]*?semanticId=\{FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID\}[\s\S]*?data-testid="plan-start-upload"/);
assert.match(addressSearch, /id=\{FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID\}[\s\S]*?onClick=\{requestUpload\}/);
assert.match(planPanel, /openFloorPlanUploadPicker\(FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID\)/);
assert.match(panel, /id=\{FLOOR_PLAN_IMPORT_ACTION_ID\}[\s\S]*?dialog\.openWorkspace\(FLOOR_PLAN_IMPORT_ACTION_ID\)/);
assert.match(panel, /id=\{FLOOR_PLAN_WORKSPACE_LAUNCH_ACTION_ID\}[\s\S]*?forwardedOpener \?\? FLOOR_PLAN_WORKSPACE_LAUNCH_ACTION_ID/);
assert.match(panel, /id=\{FLOOR_PLAN_FILE_INPUT_ACTION_ID\}[\s\S]*?captureFloorPlanWorkspaceOpener\(\)/);
assert.match(planPanel, /id=\{FLOOR_PLAN_WORKSPACE_FALLBACK_ACTION_ID\}[\s\S]*?data-testid="plan-section-toggle-floorPlan"/);
assert.match(workspaceOpener, /id=\{semanticId\}[\s\S]*?openFloorPlanUploadWorkspace\([\s\S]*?semanticId/);
assert.match(planPanelOpener, /forwardFloorPlanWorkspaceOpener\(launcher, openerId\)/);
assert.match(focusContract, /const SUPPORTED_OPENER_IDS = new Set\(\[[\s\S]*?FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID[\s\S]*?FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID[\s\S]*?FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID[\s\S]*?FLOOR_PLAN_ADDRESS_UPLOAD_ACTION_ID[\s\S]*?FLOOR_PLAN_IMPORT_ACTION_ID[\s\S]*?FLOOR_PLAN_WORKSPACE_LAUNCH_ACTION_ID/);

assert.match(uploadLifecycle, /returnFocusIds/);
assert.match(panel, /lifecycleScopeKey/);
assert.match(uploadLifecycle, /focusRestorationEnabledRef/);
assert.match(uploadLifecycle, /useFloorPlanWorkspaceFocus/);
assert.match(workspaceFocus, /isElementInTopmostEditorDialog/);
assert.match(planPanelOpener, /captureFloorPlanWorkspaceOpener/);
assert.doesNotMatch(focusContract, /SUPPORTED_OPENER_IDS[\s\S]*?FLOOR_PLAN_FILE_INPUT_ACTION_ID/);

assert.doesNotMatch(childDialogHarness, /FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID/);
assert.doesNotMatch(childDialogHarness, /FLOOR_PLAN_SURFACES_UPLOAD_ACTION_ID/);
assert.doesNotMatch(childDialogHarness, /<FloorPlanWorkspaceOpener/);
assert.match(emptyEntryHarness, /import DesignControlsPlanPanel/);
assert.match(emptyEntryHarness, /planRoomCount:\s*0/);
assert.match(emptyEntryHarness, /<EmptyFloorPlanSurfacesActions/);
assert.match(emptyEntryHarness, /<EmptyFloorPlanProUploadAction/);
assert.match(emptyEntryHarness, /<FloorPlanUploadPanel/);
assert.doesNotMatch(emptyEntryHarness, /semanticId=\{FLOOR_PLAN_PRO_START_UPLOAD_ACTION_ID\}/);
assert.doesNotMatch(emptyEntryHarness, /<FloorPlanWorkspaceOpener/);

assert.match(workspace, /data-floor-plan-workspace-state="empty"/);
assert.match(workspace, /data-floor-plan-workspace-history/);
assert.match(assistant, /data-floor-plan-workspace-state="working"/);
assert.match(assistant, /data-floor-plan-workspace-state="failure"/);
assert.match(assistant, /data-floor-plan-workspace-state="ready"/);
assert.match(assistant, /data-floor-plan-workspace-state="review"/);
assert.match(pageSelection, /data-floor-plan-workspace-state="page-selection"/);
assert.match(review, /data-floor-plan-workspace-focus/);

assert.match(history, /onConfirmationOpenChange/);
assert.match(
  `${historyConfirmation}\n${history}`,
  /const open = historyOpen[\s\S]*?event\.key !== "Escape" \|\| !open[\s\S]*?event\.preventDefault\(\)[\s\S]*?event\.stopPropagation\(\)[\s\S]*?onKeyDownCapture=\{guardConfirmationEscape\}/
);
assert.match(workspace, /onHistoryConfirmationOpenChange/);
assert.match(dialog, /historyConfirmationOpen/);
assert.match(uploadLifecycle, /closeDisabled:\s*historyConfirmationOpen/);
assert.doesNotMatch(history, /<EditorDialog/);

assert.match(lifecycle, /lockBodyScroll/);
assert.match(registry, /dialogBodyScrollOwners/);
assert.match(registry, /acquireBodyScrollLock/);
assert.match(registry, /releaseBodyScrollLock/);
assert.match(registry, /restoreBodyScroll/);

console.log("Floor Plan Upload static modal lifecycle checks passed.");
