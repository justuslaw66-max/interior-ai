import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PlanToolSection,
  type CollapsiblePlanSection,
} from "../components/editor/design-controls-plan/PlanToolComponents";
import { buildDesignControlsPanelModel } from "../lib/design-page-controls-panel-model";
import { buildDesignPageDialogLayerModel } from "../lib/design-page-dialog-layer-model";
import { resolveEditorCapabilities } from "../lib/editor-capabilities";

const planPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPlanPanel.tsx");
const source = fs.readFileSync(planPanelPath, "utf8");
const planToolComponentsSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-controls-plan",
    "PlanToolComponents.tsx"
  ),
  "utf8"
);
const consumerRoomSetupSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "ConsumerRoomSetupCard.tsx"),
  "utf8"
);
const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const designPageSource = fs.readFileSync(designPagePath, "utf8");
const presentationWorkspaceSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPagePresentationWorkspaceRegistration.ts"
  ),
  "utf8"
);
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
const planAuthoringRegistrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPagePlanAuthoringRegistration.ts"
  ),
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
const explicitCloudSaveControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageExplicitCloudSaveController.ts"),
  "utf8"
);
const cloudBaselineControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageCloudBaselineController.ts"),
  "utf8"
);
const cloudLoadControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageCloudLoadController.ts"),
  "utf8"
);
const persistenceNewPlanFacadeSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPagePersistenceNewPlanFacade.ts"),
  "utf8"
);
const persistenceRegistrationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPagePersistenceRegistration.ts"),
  "utf8"
);
const persistenceWorkspaceRegistrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPagePersistenceWorkspaceRegistration.ts"
  ),
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
const presentationBackupRegistrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPagePresentationBackupRegistrationFacade.ts"
  ),
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
const betaStartControllerSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageBetaStartController.ts"),
  "utf8"
);
const betaSmokePath = path.join(process.cwd(), "tests", "e2e", "00-beta-smoke.spec.ts");
const betaSmokeSource = fs.readFileSync(betaSmokePath, "utf8");
const consumerRoomSetupE2ESource = fs.readFileSync(
  path.join(process.cwd(), "tests", "e2e", "23-consumer-room-setup.spec.ts"),
  "utf8"
);

assert.match(
  source,
  /const templatePickerRef = useRef<HTMLDivElement \| null>\(null\);[\s\S]*?const openTemplatePicker = \(\) => \{[\s\S]*?setPlanStartMode\("template"\);[\s\S]*?useEffect\(\(\) => \{[\s\S]*?planStartMode !== "template"[\s\S]*?requestAnimationFrame[\s\S]*?templatePickerRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);/,
  "Opening templates from either the panel or command bar should scroll to the starter floor plan picker."
);

const planToolSectionContracts = [
  { section: "importFloorPlan", title: "Import floor plan" },
  { section: "drawRoom", title: "Draw room" },
  { section: "openings", title: "Place doors and windows" },
  { section: "templates", title: "Templates" },
] as const satisfies ReadonlyArray<{
  section: CollapsiblePlanSection;
  title: string;
}>;
const wiredPlanToolSections = Array.from(
  source.matchAll(/renderPlanToolSection\(\{\s*section: "([^"]+)"/g),
  (match) => match[1]
);
assert.deepStrictEqual(
  wiredPlanToolSections,
  planToolSectionContracts.map(({ section }) => section),
  "The plan panel should wire each stable plan-tool section exactly once."
);

const renderedPlanToolSections = planToolSectionContracts.map(
  ({ section, title }) => ({
    section,
    title,
    markup: renderToStaticMarkup(
      PlanToolSection({
        dark: false,
        section,
        title,
        collapsed: true,
        onToggle: () => undefined,
        children: "Collapsed section content",
      })
    ),
  })
);
const renderedPlanToolSectionMarkup = renderedPlanToolSections
  .map(({ markup }) => markup)
  .join("");

for (const { section, title, markup } of renderedPlanToolSections) {
  const testId = `plan-tool-section-${section}`;
  assert.strictEqual(
    renderedPlanToolSectionMarkup.match(
      new RegExp(`data-testid="${testId}"`, "g")
    )?.length,
    1,
    `${testId} should identify exactly one rendered plan-tool section.`
  );
  assert.match(
    markup,
    /<button type="button"[^>]*aria-expanded="false"[^>]*>/,
    `${testId} should retain native keyboard activation and collapsed state.`
  );
  assert.ok(
    markup.includes(`>${title}</span>`),
    `${testId} should keep its accessible visible section name independent from its test ID.`
  );
}
assert.doesNotMatch(
  source,
  /data-testid=\{`plan-tool-section-/,
  "The plan panel should delegate stable section identity to PlanToolSection."
);
assert.match(
  planToolComponentsSource,
  /export function PlanToolSection\([\s\S]*?<button[\s\S]*?type="button"[\s\S]*?aria-expanded=\{!collapsed\}[\s\S]*?onClick=\{onToggle\}/,
  "The stable plan-tool section owner should route native pointer and keyboard activation through onToggle."
);

assert.match(
  source,
  /data-testid="plan-tool-palette"[\s\S]*?overflow-hidden rounded-sm border[\s\S]*?Room setup[\s\S]*?ConsumerRoomSetupCard[\s\S]*?Import floor plan[\s\S]*?Draw room[\s\S]*?Place doors and windows[\s\S]*?Templates/,
  "Consumer plan editing should lead with one focused Room setup card while retaining grouped advanced tools."
);

assert.match(
  planToolComponentsSource,
  /const sectionClass =[\s\S]*border-b[\s\S]*last:border-b-0[\s\S]*const headerClass =[\s\S]*px-3 py-2\.5/,
  "Plan subcategory rows should remain compact secondary tools inside the Room setup umbrella."
);

assert.match(
  consumerRoomSetupSource,
  /data-testid="plan-start-template"[\s\S]*?onClick=\{actions\.chooseTemplate\}[\s\S]*?Starter layouts/,
  "The primary consumer setup should visibly expose starter layouts."
);

assert.match(
  consumerRoomSetupSource,
  /data-testid="room-setup-measurement-units"[\s\S]*?aria-pressed=\{selected\}[\s\S]*?min-h-11[\s\S]*?touchFriendly[\s\S]*?testId="room-setup-width-input"[\s\S]*?touchFriendly[\s\S]*?testId="room-setup-depth-input"/,
  "Consumer room units and dimensions should expose pressed state, immediate validation fields, and touch-sized controls."
);

assert.match(
  consumerRoomSetupSource,
  /data-testid="room-setup-scale-summary"[\s\S]*?role="status"[\s\S]*?Visible scale:[\s\S]*?data-testid="plan-tool-door"[\s\S]*?data-testid="plan-tool-window"/,
  "Consumer room setup should keep scale and door/window correction paths visible."
);

assert.match(
  consumerRoomSetupSource,
  /id="room-setup-opening-status"[\s\S]*?data-testid="room-setup-continue-furnish"[\s\S]*?aria-describedby=\{hasConnectionBlockers \? "room-setup-opening-status" : undefined\}/,
  "Blocked Consumer progression should be disabled and described by the visible doorway correction status."
);

assert.match(
  source,
  /importFloorPlan: !isDesigner,[\s\S]*?drawRoom: !isDesigner,[\s\S]*?openings: !isDesigner,[\s\S]*?templates: !isDesigner/,
  "Consumer advanced plan sections should start collapsed while Pro retains the dense tool surface."
);

assert.match(
  source,
  /track\("launch_path_selected", \{[\s\S]*?path: "template"[\s\S]*?source: isDesigner \? "pro_plan_tools" : "consumer_room_setup"/,
  "Room-setup path selection should emit privacy-safe source telemetry."
);

for (const pathName of ["template", "draw", "upload", "ai"] as const) {
  assert.match(
    betaStartControllerSource,
    new RegExp(`track\\("launch_path_selected", \\{ path: "${pathName}", source: "beta_start" \\}\\)`),
    `Beta start should record the ${pathName} launch path without room contents.`
  );
}

assert.match(
  documentStateControllerSource,
  /track\("display_unit_changed", \{[\s\S]*?previous_unit: previousUnit,[\s\S]*?unit,[\s\S]*?\}\);/,
  "Display-unit changes should be measured centrally without recording dimensions."
);

assert.match(
  consumerRoomSetupE2ESource,
  /plan_measurement_unit[\s\S]*?room-setup-width-input[\s\S]*?aria-invalid[\s\S]*?data-model-value-mm[\s\S]*?plan-focus-control[\s\S]*?plan-canvas-guidance/,
  "The Consumer room-setup gate should cover invalid input recovery, saved units, and opening correction guidance."
);
assert.doesNotMatch(
  consumerRoomSetupE2ESource,
  /test\.(?:skip|fixme)|test\.info\(\)\.skip/,
  "The Consumer room-setup candidate test must not declare skips or conditional exclusions."
);

assert.match(
  source,
  /const openFloorPlanUploadPicker = \(\) => \{[\s\S]*?flushSync\(\(\) => setPlanStartMode\("upload"\)\)[\s\S]*?getElementById\("floor-plan-upload"\)[\s\S]*?floor-plan-upload-input[\s\S]*?\.click\(\)/,
  "The import action should mount the upload panel and open its file picker within the same user gesture."
);

assert.match(
  source,
  /testId: "plan-tool-import-2d"[\s\S]*?label: "Import 2D drawing"[\s\S]*?onClick: openFloorPlanUploadPicker/,
  "The import tile should invoke the working file-picker flow."
);

assert.match(
  source,
  /testId: "plan-tool-rectangle-wall"[\s\S]*?label: "Rectangle wall"[\s\S]*?startDrawRoomMode\("rectangle_wall"\)/,
  "The rectangle wall tile should keep the existing draw-from-scratch flow."
);

assert.match(
  source,
  /const planToolGridClass =[\s\S]*?grid grid-cols-3 gap-2/,
  "Plan tools should use the compact three-column layout."
);

assert.match(
  planToolComponentsSource,
  /const className = \[[\s\S]*?rounded-\[2px\][\s\S]*?bg-\[#f6f6f7\][\s\S]*?hover:bg-\[#f1f2f3\]/,
  "Plan tool cards should keep the flat, compact architectural-tool treatment."
);

assert.doesNotMatch(
  planToolComponentsSource,
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
  planToolComponentsSource,
  /aria-pressed=\{typeof active === "boolean" \? active : undefined\}[\s\S]*?aria-keyshortcuts=\{shortcut\}/,
  "Selectable plan tools should expose pressed state and keyboard shortcuts."
);

const wallToolMappings = [
  ["plan-tool-straight-wall", "Straight wall", "B", "straight_wall"],
  ["plan-tool-rectangle-wall", "Rectangle wall", "F", "rectangle_wall"],
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
  planAuthoringRegistrationSource,
  /useDesignPagePlanUnderlayFacade\([\s\S]*?planWorkspace\.configuration\.underlay/,
  "Plan authoring should keep underlay registration at its deferred plan-facade slot."
);

assert.match(
  cameraControllerSource,
  /const previousViewModeRef = useRef<EditorViewMode>\(viewMode\);[\s\S]*?const suppressNext3DViewSaveRef = useRef\(false\);[\s\S]*?const pending3DViewRef = useRef<CameraView \| null>\(null\);[\s\S]*?previousViewMode === "3d" && !suppressNext3DViewSaveRef\.current/,
  "The 2D camera fit effect should only preserve a real previous 3D camera."
);

assert.match(
  cameraControllerSource,
  /pending3DViewRef\.current = hasWholeHousePlan[\s\S]*?getWholeHome3DView\(\)[\s\S]*?singleRoomDefaultCameraView;[\s\S]*?setViewMode\(next\);/,
  "Switching to 3D should queue the floor-relative fitted view instead of applying it to the still-mounted 2D camera."
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
  /useDesignPagePersistenceWorkspaceRegistration\(\{[\s\S]*?useDesignPageRequestedDesignWorkspaceRegistration\(\{[\s\S]*?const newPlanState = persistenceWorkspaceRegistration\.state\.newPlan[\s\S]*?const newPlanActions = persistenceWorkspaceRegistration\.actions\.newPlan/,
  "Workspace should consume the persistence registration's new-plan state and actions."
);
assert.match(
  persistenceWorkspaceRegistrationSource,
  /useDesignPagePersistenceRegistration\(\{[\s\S]*?pendingReplacement: underlay\.state\.pendingTemplateReplacement[\s\S]*?requestPlanChoiceForNextTemplate:\s*underlay\.actions\.requirePlanChoiceForNextTemplate[\s\S]*?requestSignIn: coreShell\.actions\.paywall\.signInWithReturn[\s\S]*?showToast: coreShell\.actions\.feedback\.showRuleToast[\s\S]*?clearPlanAnnotations: \(\) =>[\s\S]*?setPlanAnnotations\(\[\]\)/,
  "The persistence workspace owner should wire explicit New-plan intent, replacement, sign-in, toast, and annotation collaborators into the registration."
);
assert.match(
  persistenceRegistrationSource,
  /useDesignPagePersistenceNewPlanFacade\(\{[\s\S]*?clearHistory: \(\) => history\.clear\(\)[\s\S]*?clearPlanAnnotations: actions\.clearPlanAnnotations/,
  "The persistence registration should wire document history and annotation clearing into the new-plan facade."
);
assert.match(
  persistenceNewPlanFacadeSource,
  /closeMyDesigns: persistence\.actions\.closeMyDesigns[\s\S]*?preserveCurrentDesign: persistence\.actions\.preserveCurrentDesign[\s\S]*?detachCurrentDesignForNewDraft:\s*persistence\.actions\.detachCurrentDesignForNewDraft/,
  "The facade should wire persistence-owned close, preserve, and detach actions into the new-plan controller."
);

assert.match(
  newPlanControllerSource,
  /const openNewPlanPicker = useCallback\(\(\) => \{\s*requestPlanChoiceForNextTemplate\(\);\s*closeMyDesigns\(\);\s*setGuidedPlanStartMode\("template"\);\s*goPlan\(\);\s*setViewMode\("2d"\);\s*setDesignPanelOpen\(true\);\s*setDesignPanelCollapsed\(false\);\s*showToast\("Search by address or choose a floor plan template"\);\s*\},/,
  "The controller-owned New plan action should retain explicit choice intent before opening the template workflow."
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
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?openNewPlan:\s*persistence\.actions\.newPlan\.openNewPlanPicker/,
  "The presentation workspace should inject New plan at the presentation/QA boundary."
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
  access: { isClientPreview: false, isAuthenticated: true, capabilities: resolveEditorCapabilities("pro"), designerTheme: false },
  billing: { upgrade: {}, plans: {}, startingCheckout: false, annualSavingsLabel: "", upgradeActions: {}, plansActions: {} },
  persistence: {
    guestSave: {
      reason: null,
      busy: false,
      lifecycleScopeKey: "plan-template-test",
      onCancel: noop,
      onContinueWithoutSaving: noop,
      onSaveAndContinue: noop,
    },
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
  /<MyDesignsDialog[\s\S]*?\{\.\.\.dialogs\.myDesigns\}[\s\S]*?onOpenTemplates=\{openMyDesignTemplates\}[\s\S]*?\/>[\s\S]*?<PlanTemplateChoiceDialog\s+\{\.\.\.dialogs\.planTemplateChoice\}\s*\/>/,
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
  explicitCloudSaveControllerSource,
  /preparePreserveWrite[\s\S]*?designApi\.update\(binding\.designId, payload\)[\s\S]*?designApi\.create\(payload\)[\s\S]*?executePreserveSave[\s\S]*?executeDesignPageCloudWrite\(\{[\s\S]*?commitPreservedDesign\(input, result\)/,
  "Preserving the current design should bind and validate an existing update or saved-copy creation before adopting its revision."
);

assert.match(
  persistenceControllerSource,
  /const detachCurrentDesignForNewDraft = useCallback\(\(\) => \{[\s\S]*?detachCloudBaseline\(\);[\s\S]*?cloudWriteQueue\.invalidate\(\{[\s\S]*?designId: null,[\s\S]*?setDesignId\(null\);[\s\S]*?setShareToken\(null\);[\s\S]*?setShareEnabled\(false\);[\s\S]*?setLastPersistedSnapshotFingerprint\(null\);[\s\S]*?localStorage\.removeItem\(storageKey\);/,
  "A separate plan should invalidate old writes and remove cloud/share identity before local autosave resumes."
);
assert.match(
  cloudBaselineControllerSource,
  /function useDetachCloudBaseline[\s\S]*?documentEpochRef\.current \+= 1;[\s\S]*?createDetachedCloudBaseline\(\)/,
  "Detaching a cloud baseline must invalidate the prior document epoch."
);

assert.match(
  persistenceControllerSource,
  /const snapshot = getStoredDesignForPersistence\(\);[\s\S]*?executeDesignPageCloudWrite\(\{[\s\S]*?kind: "update",[\s\S]*?fingerprint,[\s\S]*?expectedUpdatedAt: binding\.revision/,
  "Queued autosave should bind the exact pre-template snapshot and let the queue reject stale epochs before mutation."
);

assert.match(
  cloudLoadControllerSource,
  /invalidateCloudWrites\(\);[\s\S]*?requestCoordinator\.start\(\)[\s\S]*?!input\.requestCoordinator\.isCurrent\(request\)[\s\S]*?baseline\.installLoaded\([\s\S]*?commitLoadedCloudDesign/,
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
  presentationBackupRegistrationSource,
  /useDesignPageLocalBackupHydration\(\{[\s\S]*?storageKey:\s*DESIGN_PAGE_LOCAL_BACKUP_STORAGE_KEY[\s\S]*?localBackupPersistenceActionsRef\.current\.loadDesign/,
  "The presentation-backup registration should retain the mount-time hydration boundary."
);
assert.match(
  designPageSource,
  /useDesignPagePresentationBackupRegistrationFacade\(\{/,
  "The design page should consume mount-time hydration through its grouped registration."
);
assert.match(
  localBackupHydrationSource,
  /const initialInputRef = useRef\(input\);[\s\S]*?const hydrationStartedRef = useRef\(false\);[\s\S]*?const restoreRawBackup = useCallback\(async[\s\S]*?normalizeDesignPageLocalBackup\(\{[\s\S]*?if \(restored\.cloudDesignId\) \{[\s\S]*?setDesignId\(restored\.cloudDesignId\);[\s\S]*?loadResult === "missing"[\s\S]*?setDesignId\(null\);[\s\S]*?setLocalBackupHydrated\(true\);[\s\S]*?useEffect\(\(\) => \{[\s\S]*?if \(hydrationStartedRef\.current\) return;[\s\S]*?hydrationStartedRef\.current = true;[\s\S]*?if \(!raw\) \{[\s\S]*?setLocalBackupHydrated\(true\);[\s\S]*?void restoreRawBackup\(raw\);[\s\S]*?\}, \[restoreRawBackup\]\);/,
  "The local-backup boundary should retain one-shot restore semantics, release valid or empty hydration, and leave invalid backups blocked for recovery."
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
