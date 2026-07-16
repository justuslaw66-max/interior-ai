import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { buildDesignControlsPanelModel } from "../lib/design-page-controls-panel-model";
import { buildDesignPageDialogLayerModel } from "../lib/design-page-dialog-layer-model";

const planPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPlanPanel.tsx");
const source = fs.readFileSync(planPanelPath, "utf8");
const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const designPageSource = fs.readFileSync(designPagePath, "utf8");
const floorPlanControllerPath = path.join(
  process.cwd(),
  "lib",
  "useDesignPageFloorPlanUnderlayController.ts"
);
const floorPlanControllerSource = fs.readFileSync(floorPlanControllerPath, "utf8");
const planWorkspaceFacadeSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPagePlanWorkspaceFacade.ts"),
  "utf8"
);
const cameraControllerPath = path.join(
  process.cwd(),
  "lib",
  "useDesignPageCameraNavigation.ts"
);
const cameraControllerSource = fs.readFileSync(cameraControllerPath, "utf8");
const persistenceControllerPath = path.join(
  process.cwd(),
  "lib",
  "useDesignPagePersistence.ts"
);
const persistenceControllerSource = fs.readFileSync(persistenceControllerPath, "utf8");
const persistenceNewPlanFacadeSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPagePersistenceNewPlanFacade.ts"),
  "utf8"
);
const documentStateControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageDocumentStateController.ts"),
  "utf8"
);
const localBackupSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-page-local-backup.ts"),
  "utf8"
);
const localBackupHydrationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageLocalBackupHydration.ts"),
  "utf8"
);
const newPlanControllerPath = path.join(
  process.cwd(),
  "lib",
  "useDesignPageNewPlanController.ts"
);
const newPlanControllerSource = fs.readFileSync(newPlanControllerPath, "utf8");
const executeNewPlanStart = newPlanControllerSource.indexOf(
  "export async function executeSaveCurrentAndStartNewPlan"
);
const newPlanHookStart = newPlanControllerSource.indexOf(
  "export function useDesignPageNewPlanController"
);
assert.ok(
  executeNewPlanStart >= 0 && newPlanHookStart > executeNewPlanStart,
  "The new-plan controller should expose its save-and-start executor before the React hook."
);
const executeNewPlanSource = newPlanControllerSource.slice(
  executeNewPlanStart,
  newPlanHookStart
);
const templateFurnishingsPath = path.join(
  process.cwd(),
  "lib",
  "design-page-template-furnishings.ts"
);
const templateFurnishingsSource = fs.readFileSync(templateFurnishingsPath, "utf8");
const myDesignsDialogPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "MyDesignsDialog.tsx"
);
const myDesignsDialogSource = fs.readFileSync(myDesignsDialogPath, "utf8");
const planTemplateChoiceDialogPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "PlanTemplateChoiceDialog.tsx"
);
const planTemplateChoiceDialogSource = fs.readFileSync(planTemplateChoiceDialogPath, "utf8");
const dialogLayerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignPageDialogLayer.tsx"
  ),
  "utf8"
);
const commandBarPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "EditorCommandBar.tsx"
);
const commandBarSource = fs.readFileSync(commandBarPath, "utf8");
const designPageCommandBarPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageEditorCommandBar.tsx"
);
const designPageCommandBarSource = fs.readFileSync(
  designPageCommandBarPath,
  "utf8"
);
const editorChromeControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageEditorChromeController.ts"),
  "utf8"
);
const betaSmokePath = path.join(process.cwd(), "tests", "e2e", "00-beta-smoke.spec.ts");
const betaSmokeSource = fs.readFileSync(betaSmokePath, "utf8");

assert.match(
  source,
  /const templatePickerRef = useRef<HTMLDivElement \| null>\(null\);[\s\S]*?const openTemplatePicker = \(\) => \{[\s\S]*?setPlanStartMode\("template"\);[\s\S]*?useEffect\(\(\) => \{[\s\S]*?planStartMode !== "template"[\s\S]*?requestAnimationFrame[\s\S]*?templatePickerRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);/,
  "Opening templates from either the panel or command bar should scroll to the starter floor plan picker."
);

assert.match(
  source,
  /data-testid=\{`plan-tool-section-\$\{section\}`\}/,
  "Plan tool sections should expose stable test ids."
);

assert.match(
  source,
  /data-testid="plan-tool-palette"[\s\S]*?overflow-hidden rounded-sm border[\s\S]*?Floor plan[\s\S]*?Import floor plan[\s\S]*?Draw room[\s\S]*?Place doors and windows[\s\S]*?Templates/,
  "Plan editing should use one compact Floor plan umbrella with grouped subcategories."
);

assert.match(
  source,
  /const planToolSectionClass =[\s\S]*border-b[\s\S]*last:border-b-0[\s\S]*const planToolSectionHeaderClass =[\s\S]*px-3 py-2\.5/,
  "Plan subcategory rows should be compact dividers inside the Floor plan umbrella, not large separate cards."
);

assert.match(
  source,
  /data-testid="plan-start-template"[\s\S]*?onClick=\{openTemplatePicker\}[\s\S]*?Starter layouts/,
  "The template tile should visibly jump to the starter floor plan picker."
);

assert.match(
  source,
  /testId: "plan-start-upload"[\s\S]*?label: "Import 2D drawing"[\s\S]*?setPlanStartMode\("upload"\)/,
  "The import tile should keep the existing upload flow."
);

assert.match(
  source,
  /testId: "plan-start-draw"[\s\S]*?label: "Rectangle wall"[\s\S]*?startDrawRoomMode\("rectangle_wall"\)/,
  "The rectangle wall tile should keep the existing draw-from-scratch flow."
);

assert.match(
  source,
  /const planToolGridClass =[\s\S]*?grid grid-cols-3 gap-2/,
  "Plan tools should use the compact three-column layout."
);

assert.match(
  source,
  /const planToolTileClass =[\s\S]*?rounded-\[2px\][\s\S]*?bg-\[#f6f6f7\][\s\S]*?hover:bg-\[#f1f2f3\]/,
  "Plan tool cards should keep the flat, compact architectural-tool treatment."
);

assert.doesNotMatch(
  source,
  /min-h-\[6\.5rem\]|block min-h-8 text-\[12px\]/,
  "Plan tool cards and labels should stay content-driven so one-line tools remain shorter."
);

assert.doesNotMatch(
  source,
  /<ellipse|\[opacity:\.58\]|hover:-translate-y-0\.5/,
  "Plan tool artwork should not regain fake floor shadows, blanket disabled fading, or floating-card motion."
);

assert.match(
  source,
  /data-testid="plan-wall-tool-grid"[\s\S]*?role="group"[\s\S]*?aria-label="Wall drawing tools"/,
  "Wall choices should be exposed as a named control group."
);

assert.match(
  source,
  /aria-pressed=\{typeof active === "boolean" \? active : undefined\}[\s\S]*?aria-keyshortcuts=\{shortcut\}/,
  "Selectable plan tools should expose pressed state and keyboard shortcuts."
);

const wallToolMappings = [
  ["plan-tool-straight-wall", "Straight wall", "B", "straight_wall"],
  ["plan-start-draw", "Rectangle wall", "F", "rectangle_wall"],
  ["plan-tool-arc-wall", "Arc wall", "H", "arc_wall"],
] as const;

for (const [testId, label, shortcut, mode] of wallToolMappings) {
  assert.match(
    source,
    new RegExp(
      `testId: "${testId}"[\\s\\S]*?label: "${label}"[\\s\\S]*?shortcut: "${shortcut}"[\\s\\S]*?active: floorPlanTraceRoomMode && floorPlanDrawRoomMode === "${mode}"[\\s\\S]*?startDrawRoomMode\\("${mode}"\\)`
    ),
    `${label} should keep its shortcut, action, and real drawing-state highlight in sync.`
  );
}

assert.match(
  source,
  /testId: "plan-tool-external-area"[\s\S]*?label: "External area"[\s\S]*?disabled: true[\s\S]*?title: "External area drawing is coming soon\."/,
  "External area should remain intentionally disabled with an accessible explanation."
);

assert.doesNotMatch(
  source,
  /data-testid="manual-plan-panel-actions"/,
  "The old catch-all manual action grid should not remain in the default Plan panel."
);

assert.doesNotMatch(
  source,
  /data-testid="plan-guided-actions-panel-toggle"/,
  "The Guided/Manual switch should be hidden from the primary Plan panel."
);

assert.match(
  source,
  /const showTemplatePicker = planStartMode === "template";[\s\S]*?\{showTemplatePicker && \(/,
  "The starter floor plan picker should open explicitly in both consumer and designer modes."
);

assert.match(
  source,
  /ref=\{templatePickerRef\}[\s\S]*?data-testid="starter-floor-plan-picker"/,
  "The starter floor plan picker should provide a stable scroll target."
);

assert.match(
  source,
  /data-testid="template-filter-panel"[\s\S]*?data-testid="template-bedroom-filter"[\s\S]*?<select[\s\S]*?data-testid="template-footprint-filter"[\s\S]*?<select[\s\S]*?data-testid="template-style-filter"/,
  "Template filters should use one simple bedroom row plus compact select menus."
);

assert.match(
  source,
  /Choose a floor plan[\s\S]*?\{filteredPlanTemplates\.length\} starter layouts/,
  "Template picker heading should be concise and show the filtered option count."
);

assert.match(
  source,
  /data-testid="template-bedroom-filter"/,
  "Template picker should expose bedroom filters."
);

assert.match(
  source,
  /data-testid="template-footprint-filter"/,
  "Template picker should expose footprint filters."
);

assert.match(
  source,
  /data-testid="selected-room-floor-finish"[\s\S]*?data-testid="plan-change-floor-finish"[\s\S]*?setRoomFinishPanelOpen/,
  "Selected-room controls should expose a visible shortcut for changing floor finish."
);

assert.match(
  source,
  /data-testid="room-surfaces-floor-panel"[\s\S]*?data-testid=\{`surface-floor-material-\$\{materialId\}`\}/,
  "The floor finish shortcut should reveal selectable catalog surface materials."
);

assert.doesNotMatch(
  source,
  /plan-floor-material-/,
  "Starter finish swatches should not be exposed in the floor material picker."
);

assert.match(
  source,
  /data-testid=\{`plan-template-preview-\$\{template\.id\}`\}/,
  "Template cards should include mini floor-plan previews."
);

assert.match(
  source,
  /data-testid=\{`plan-template-furnishing-marker-\$\{template\.id\}-\$\{intent\.id\}`\}/,
  "Template mini previews should show furnished starter markers."
);

assert.match(
  source,
  /data-testid=\{`apply-plan-template-\$\{template\.id\}`\}[\s\S]*?Empty layout/,
  "Template cards should keep a clear empty-layout action."
);

assert.match(
  source,
  /data-testid=\{`apply-furnished-template-\$\{template\.id\}`\}[\s\S]*?furnishingPackId/,
  "Template cards should expose a furnished starter action."
);

assert.match(
  source,
  /Good for: \{template\.bestFor\}/,
  "Template cards should explain who each layout is good for."
);

assert.match(
  source,
  /Zones: \{template\.zones\.slice\(0, 3\)\.join\(" · "\)\}/,
  "Template cards should show starter furniture zones."
);

assert.match(
  source,
  /template\.realLifeChecks\.slice\(0, 2\)[\s\S]*?\{template\.windows\.length\} windows/,
  "Template cards should surface real-life planning checks and window counts."
);

assert.match(
  floorPlanControllerSource,
  /const templateDoorOpenings: RoomOpening2D\[\] = template\.doorways\.flatMap/,
  "Applying a template should convert template doorway specs into plan openings."
);

assert.match(
  floorPlanControllerSource,
  /const templateWindowOpenings: RoomOpening2D\[\] = template\.windows\.flatMap[\s\S]*?kind: "window" as const/,
  "Applying a template should convert exterior window specs into plan window openings."
);

assert.match(
  floorPlanControllerSource,
  /const templateOpenings = \[[\s\S]*?\.\.\.templateDoorOpenings,[\s\S]*?\.\.\.templateWindowOpenings,[\s\S]*?\]/,
  "Applying a template should install automatic doors and windows together."
);

assert.match(
  floorPlanControllerSource,
  /setPlanOpenings\(templateOpenings\)/,
  "Applying a template should install automatic doorways instead of clearing openings."
);

assert.match(
  floorPlanControllerSource,
  /const templateFixedElements: FixedElement2D\[\] = \(template\.referenceZones \?\? \[\]\)\.map\([\s\S]*?kind: "reference_zone"[\s\S]*?locked: zone\.locked \?\? true/,
  "Applying a template should convert its reference zones into locked plan elements."
);

assert.match(
  floorPlanControllerSource,
  /setPlanOpenings\(templateOpenings\);[\s\S]*?setPlanFixedElements\(templateFixedElements\);/,
  "Applying a template should replace standalone built-ins with template-owned reference zones so stale rectangles cannot survive."
);

assert.match(
  floorPlanControllerSource,
  /prepareCameraForPlanTemplate\(\);[\s\S]*?floorCameraViewsRef\.current = \{\};[\s\S]*?setViewMode\("2d"\);/,
  "Applying a template should clear stale 3D camera memory before returning to 2D."
);
assert.match(
  planWorkspaceFacadeSource,
  /useDesignPageFloorPlanUnderlayController\(input\)/,
  "The plan workspace underlay boundary should delegate to the established controller."
);
assert.match(
  designPageSource,
  /useDesignPagePlanUnderlayFacade\(planWorkspaceConfiguration\.underlay\)/,
  "The workspace should keep underlay registration at its deferred plan-facade slot."
);

assert.match(
  cameraControllerSource,
  /const previousViewModeRef = useRef<EditorViewMode>\(viewMode\);[\s\S]*?const suppressNext3DViewSaveRef = useRef\(false\);[\s\S]*?const pending3DViewRef = useRef<CameraView \| null>\(null\);[\s\S]*?previousViewMode === "3d" && !suppressNext3DViewSaveRef\.current/,
  "The 2D camera fit effect should only preserve a real previous 3D camera."
);

assert.match(
  cameraControllerSource,
  /pending3DViewRef\.current = hasWholeHousePlan[\s\S]*?getWholeHome3DView\(\)[\s\S]*?defaultCameraView;[\s\S]*?setViewMode\(next\);/,
  "Switching to 3D should queue the fitted view instead of applying it to the still-mounted 2D camera."
);

assert.match(
  cameraControllerSource,
  /const applyQueued3DView = useCallback\([\s\S]*?!\(camera instanceof THREE\.PerspectiveCamera\)[\s\S]*?attempt < 8[\s\S]*?camera\.up\.set\(0, 1, 0\);[\s\S]*?transitionToCameraView\(nextView, durationMs\);/,
  "Queued 3D camera fits should wait for the perspective camera and restore the normal 3D up vector."
);

assert.match(
  cameraControllerSource,
  /if \(pending3DViewRef\.current\) \{[\s\S]*?const pendingView = pending3DViewRef\.current;[\s\S]*?pending3DViewRef\.current = null;[\s\S]*?applyQueued3DView\(pendingView, 420\);/,
  "Queued 3D camera fits should run through the perspective-camera handoff helper."
);

const goView3D = () => undefined;
const noop = () => undefined;
const controlsPanelModel = buildDesignControlsPanelModel({
  access: {},
  panel: { mode: "plan", state: {} },
  room: { state: {}, actions: { addDesignerRoom: noop } },
  floorPlan: {
    state: { floorPlanUnderlay: null, planRoomCount: 0 },
    actions: { onFloorPlanTraceRoomDrawModeChange: noop },
  },
  surfaces: { state: {}, actions: {} },
  shopping: { state: {}, actions: {} },
  ai: { state: {}, actions: {} },
  actions: {
    navigation: {},
    panel: {
      changeDesignPanelCollapsed: noop,
      goView3D,
      runAiLayout: noop,
      regenerateAiLayout: noop,
      changeActiveWallSurfaceSettings: noop,
      resetActiveWallSurface: noop,
      resetActiveCeilingSurface: noop,
      toggleGrid: noop,
      toggleSnap: noop,
    },
  },
} as unknown as Parameters<typeof buildDesignControlsPanelModel>[0]);
assert.strictEqual(
  controlsPanelModel.actions.onGoView3D,
  goView3D,
  "The pure controls model should preserve the camera-aware 3D navigation action."
);

assert.doesNotMatch(
  designPageSource,
  /kitchen-run-top|kitchen-island/,
  "The editor should not auto-seed default built-in rectangles on a new floor plan."
);

assert.match(
  templateFurnishingsSource,
  /function shouldConfirmPlanTemplateReplacement\([\s\S]*?openings: RoomOpening2D\[\][\s\S]*?if \(itemCount > 0\) return true;[\s\S]*?isDefaultStarterLivingRoom[\s\S]*?openings\.length > 2/,
  "Template replacement should protect existing work while allowing the untouched starter room shell."
);

assert.match(
  floorPlanControllerSource,
  /setPendingTemplateReplacement\(\{ template, options \}\)[\s\S]*?return;[\s\S]*?const timestamp = Date\.now\(\)/,
  "Template apply should open an in-app confirmation before replacing meaningful existing work."
);

for (const contractName of [
  "DesignPageNewPlanControllerState",
  "DesignPageNewPlanControllerActions",
  "UseDesignPageNewPlanControllerInput",
] as const) {
  assert.match(
    newPlanControllerSource,
    new RegExp(`export type ${contractName} =`),
    `${contractName} should remain an explicit grouped contract.`
  );
}

assert.match(
  newPlanControllerSource,
  /export type UseDesignPageNewPlanControllerInput = \{\s*state: DesignPageNewPlanControllerState;\s*actions: DesignPageNewPlanControllerActions;\s*\};/,
  "The new-plan controller should expose grouped state and action inputs."
);

assert.match(
  newPlanControllerSource,
  /export function useDesignPageNewPlanController\(\{\s*state: \{ isAuthenticated, pendingReplacement \},\s*actions: \{[\s\S]*?closeMyDesigns,[\s\S]*?showToast,[\s\S]*?\},\s*\}: UseDesignPageNewPlanControllerInput\)/,
  "The new-plan hook should consume its explicit grouped contract."
);

const persistenceHookIndex = persistenceNewPlanFacadeSource.indexOf(
  "useDesignPagePersistence({"
);
const newPlanHookIndex = persistenceNewPlanFacadeSource.indexOf(
  "useDesignPageNewPlanController({"
);
assert.ok(
  persistenceHookIndex >= 0 && newPlanHookIndex > persistenceHookIndex,
  "The facade should mount the new-plan controller after persistence exposes preserve and detach actions."
);

assert.match(
  designPageSource,
  /state: \{[\s\S]*?newPlan: \{ startingNewPlan, newPlanStartError \}[\s\S]*?actions: \{[\s\S]*?newPlan: \{[\s\S]*?openNewPlanPicker,[\s\S]*?saveCurrentAndStartNewPlan,[\s\S]*?useDesignPagePersistenceNewPlanFacade\(\{[\s\S]*?pendingReplacement: pendingPlanTemplateReplacement[\s\S]*?clearHistory: \(\) => history\.clear\(\)[\s\S]*?clearPlanAnnotations: \(\) => setPlanAnnotations\(\[\]\)[\s\S]*?requestSignIn: signInWithReturn[\s\S]*?showToast: showRuleToast/,
  "Workspace should consume the facade state/actions and wire history, annotation, sign-in, and toast collaborators."
);
assert.match(
  persistenceNewPlanFacadeSource,
  /closeMyDesigns: persistence\.actions\.closeMyDesigns[\s\S]*?preserveCurrentDesign: persistence\.actions\.preserveCurrentDesign[\s\S]*?detachCurrentDesignForNewDraft:\s*persistence\.actions\.detachCurrentDesignForNewDraft/,
  "The facade should wire persistence-owned close, preserve, and detach actions into the new-plan controller."
);

assert.match(
  newPlanControllerSource,
  /const openNewPlanPicker = useCallback\(\(\) => \{\s*closeMyDesigns\(\);\s*setGuidedPlanStartMode\("template"\);\s*goPlan\(\);\s*setViewMode\("2d"\);\s*setDesignPanelOpen\(true\);\s*setDesignPanelCollapsed\(false\);\s*showToast\("Search by address or choose a floor plan template"\);\s*\},/,
  "The controller-owned New plan action should preserve the exact close, template, Plan, 2D, expand, and guidance sequence."
);

assert.doesNotMatch(
  designPageSource,
  /const openNewPlanPicker = useCallback|const startingNewPlanRef = useRef|const saveCurrentAndStartNewPlan = useCallback/,
  "Workspace should consume new-plan behavior without retaining controller-owned implementations."
);

assert.match(
  commandBarSource,
  /data-testid="editor-command-new-plan"[\s\S]*?aria-label="Start a new floor plan"[\s\S]*?onClick=\{onNewPlan\}[\s\S]*?New plan/,
  "The command bar should expose a visible one-click New plan action."
);

assert.match(
  designPageCommandBarSource,
  /<EditorCommandBar[\s\S]*?\{\.\.\.actions\.commandBar\}/,
  "The design-page command-bar wrapper should forward its grouped actions to the leaf command bar."
);

assert.match(
  designPageSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?openNewPlan:\s*openNewPlanPicker/,
  "The workspace should inject New plan at the presentation/QA boundary."
);
assert.match(
  editorChromeControllerSource,
  /onNewPlan: actions\.dialogs\.openNewPlan/,
  "The editor-chrome controller should wire New plan to the controller-owned template-picker transition."
);

assert.match(
  myDesignsDialogSource,
  /data-testid="load-designs-template-shortcut"[\s\S]*?Saved designs are listed here\. Templates open in Plan[\s\S]*?data-testid="load-designs-open-templates"[\s\S]*?onClick=\{onOpenTemplates\}/,
  "The Load modal should explain the saved-design/template distinction and expose a direct template shortcut."
);

const openNewPlanPickerAction = () => undefined;
const cancelPlanChoice = () => undefined;
const replaceCurrentPlan = () => undefined;
const saveCurrentAndStartNew = () => undefined;
const signInForPlan = () => undefined;
const dialogModel = buildDesignPageDialogLayerModel({
  access: { isClientPreview: false, isAuthenticated: true, isPro: true, designerTheme: false },
  billing: { upgrade: {}, plans: {}, startingCheckout: false, annualSavingsLabel: "", upgradeActions: {}, plansActions: {} },
  persistence: {
    guestSave: { open: false, onNotNow: noop, onSaveAndContinue: noop },
    myDesigns: { data: {}, actions: { onOpenTemplates: openNewPlanPickerAction } },
    templateChoice: {
      data: { open: true, templateLabel: "Studio", busy: false, errorMessage: null },
      actions: { onCancel: cancelPlanChoice, onReplaceCurrent: replaceCurrentPlan,
        onSaveCurrentAndStartNew: saveCurrentAndStartNew, onSignIn: signInForPlan },
    },
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
assert.strictEqual(dialogModel.dialogs.myDesigns.onOpenTemplates, openNewPlanPickerAction);
assert.match(
  dialogLayerSource,
  /<MyDesignsDialog\s+\{\.\.\.dialogs\.myDesigns\}\s*\/>[\s\S]*?<PlanTemplateChoiceDialog\s+\{\.\.\.dialogs\.planTemplateChoice\}\s*\/>/,
  "The dialog layer should own My Designs before the plan-template choice dialog."
);

assert.match(
  executeNewPlanSource,
  /if \(!hasPendingReplacement \|\| inFlight\.current\) return;\s*if \(!isAuthenticated\) \{\s*requestSignIn\(\);\s*return;\s*\}\s*inFlight\.current = true;\s*setStarting\(true\);\s*setError\(null\);\s*try \{\s*const result = await preserveCurrentDesign\(\);/,
  "Starting a separate plan should synchronously reject missing, duplicate, and unauthenticated requests before preserving."
);

assert.match(
  executeNewPlanSource,
  /const result = await preserveCurrentDesign\(\);\s*if \(!result\.ok\) \{\s*setError\(\s*`We couldn't save your current design\. Nothing was replaced\. \$\{result\.error\}`\s*\);\s*return;\s*\}/,
  "A preservation failure should report that nothing was replaced and stop before mutating the current design."
);

assert.match(
  executeNewPlanSource,
  /if \(!result\.ok\) \{[\s\S]*?return;\s*\}\s*detachCurrentDesignForNewDraft\(\);\s*confirmPendingReplacement\(\);\s*clearHistory\(\);\s*clearPlanAnnotations\(\);\s*showToast\("Current design saved\. New plan started\."\);/,
  "Successful preservation should detach identity, apply the template, clear history and annotations, then confirm success in order."
);

assert.match(
  executeNewPlanSource,
  /finally \{\s*inFlight\.current = false;\s*setStarting\(false\);\s*\}/,
  "The synchronous new-plan guard and busy state should always reset in finally."
);

assert.match(
  persistenceControllerSource,
  /const preserveCurrentDesign = useCallback[\s\S]*?fetch\(designId \? `\/api\/designs\/\$\{designId\}` : "\/api\/designs"[\s\S]*?method: designId \? "PUT" : "POST"[\s\S]*?return \{ ok: true, savedDesignId \};/,
  "Preserving the current design should update an existing ID or create a saved copy without adopting it."
);

assert.match(
  persistenceControllerSource,
  /const detachCurrentDesignForNewDraft = useCallback\(\(\) => \{[\s\S]*?documentEpochRef\.current \+= 1;[\s\S]*?setDesignId\(null\);[\s\S]*?setShareToken\(null\);[\s\S]*?setShareEnabled\(false\);[\s\S]*?setLastPersistedSnapshotFingerprint\(null\);[\s\S]*?localStorage\.removeItem\(storageKey\);/,
  "A separate plan should invalidate old writes and remove cloud/share identity before local autosave resumes."
);

assert.match(
  persistenceControllerSource,
  /const scheduledEpoch = documentEpochRef\.current;[\s\S]*?enqueueCloudWrite[\s\S]*?scheduledEpoch !== documentEpochRef\.current[\s\S]*?getStoredDesignForPersistence\(\)/,
  "Queued autosave should reject stale document epochs before reading a newly applied template."
);

assert.match(
  persistenceControllerSource,
  /const loadDesign = useCallback[\s\S]*?const requestEpoch = documentEpochRef\.current;[\s\S]*?requestEpoch !== documentEpochRef\.current[\s\S]*?documentEpochRef\.current \+= 1;[\s\S]*?setDesignSnapshot\(snapshot\)/,
  "Loading another design should invalidate stale document requests and autosaves before changing identity."
);

assert.match(
  newPlanControllerSource,
  /const startingNewPlanRef = useRef\(false\);[\s\S]*?executeSaveCurrentAndStartNewPlan\(\{[\s\S]*?refs: \{ inFlight: startingNewPlanRef \},/,
  "The hook should provide its synchronous in-flight ref to the save-and-start executor."
);

assert.match(
  planTemplateChoiceDialogSource,
  /data-testid="new-plan-choice-dialog"[\s\S]*?data-testid="new-plan-cancel"[\s\S]*?data-testid="new-plan-replace-current"[\s\S]*?data-testid="new-plan-save-current"/,
  "The plan choice dialog should expose Cancel, Replace current, and Save current & start new actions."
);

assert.match(
  planTemplateChoiceDialogSource,
  /data-testid="new-plan-choice-error"[\s\S]*?role="alert"/,
  "A preservation failure should remain visible and accessible inside the plan choice dialog."
);

assert.strictEqual(dialogModel.dialogs.planTemplateChoice.onCancel, cancelPlanChoice);
assert.strictEqual(dialogModel.dialogs.planTemplateChoice.onReplaceCurrent, replaceCurrentPlan);
assert.strictEqual(dialogModel.dialogs.planTemplateChoice.onSaveCurrentAndStartNew, saveCurrentAndStartNew);
assert.strictEqual(dialogModel.dialogs.planTemplateChoice.onSignIn, signInForPlan);
assert.doesNotMatch(
  designPageSource,
  /<(?:MyDesignsDialog|PlanTemplateChoiceDialog)\b/,
  "The workspace should not retain template-related dialog leaf markup."
);

assert.match(
  documentStateControllerSource,
  /const \[localBackupHydrated, setLocalBackupHydrated\] = useState\(false\);/,
  "The document-state controller should own the local-backup hydration gate."
);
assert.match(
  designPageSource,
  /useDesignPageLocalBackupHydration\(\{[\s\S]*?storageKey:\s*DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY[\s\S]*?localBackupPersistenceActionsRef\.current\.loadDesign/,
  "The design page should register mount-time hydration through the local-backup boundary."
);
assert.match(
  localBackupHydrationSource,
  /const initialInputRef = useRef\(input\);[\s\S]*?useEffect\(\(\) => \{[\s\S]*?normalizeDesignPageLocalBackup\(\{[\s\S]*?finally \{[\s\S]*?setLocalBackupHydrated\(true\);[\s\S]*?\}, \[\]\);/,
  "The local-backup boundary should retain one-shot restore semantics and always release its hydration gate."
);
assert.doesNotMatch(
  localBackupHydrationSource,
  /eslint-disable-next-line react-hooks\/exhaustive-deps/,
  "Mount-only hydration should use an initial-input ref instead of suppressing dependency checks."
);
assert.match(
  localBackupSource,
  /export function normalizeDesignPageLocalBackup\([\s\S]*?JSON\.parse\(rawBackup\)[\s\S]*?migrateToV3/,
  "Local-backup parsing and legacy migration should remain pure and importable."
);

assert.match(
  persistenceControllerSource,
  /useEffect\(\(\) => \{[\s\S]*?if \(!localBackupHydrated\) return;[\s\S]*?writeLocalDesignBackup\(\);/,
  "Local backup writes should wait until the page-owned restore has hydrated."
);

assert.doesNotMatch(
  designPageSource,
  /window\.confirm\(/,
  "Template replacement confirmation should avoid native browser dialogs."
);

assert.match(
  betaSmokeSource,
  /apply-furnished-template-studio[\s\S]*?room-setup-step-furnish-meta[\s\S]*?itemCount\)\.toBeGreaterThanOrEqual\(1\)/,
  "The blocking beta smoke should start from a furnished template and assert starter items."
);

assert.match(
  betaSmokeSource,
  /load-designs-template-shortcut[\s\S]*?load-designs-open-templates[\s\S]*?starter-floor-plan-picker[\s\S]*?apply-furnished-template-studio[\s\S]*?load-design-\$\{seed\.designId\}/,
  "The blocking beta smoke should prove the Load modal shortcut opens templates before loading saved designs."
);

assert.match(
  floorPlanControllerSource,
  /options\?\.furnishingPackId[\s\S]*?targetRoom\.items = \[/,
  "Furnished template application should create normal room-scoped design items only when requested."
);

assert.match(
  floorPlanControllerSource,
  /resolveTemplateFurnishingProduct\(intent\)/,
  "Furnished starter items should be resolved through catalog readiness before placement."
);

console.log("Plan template access guardrails passed.");
