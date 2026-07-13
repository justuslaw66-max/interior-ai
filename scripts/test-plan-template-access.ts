import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const planPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPlanPanel.tsx");
const source = fs.readFileSync(planPanelPath, "utf8");
const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const designPageSource = fs.readFileSync(designPagePath, "utf8");
const betaSmokePath = path.join(process.cwd(), "tests", "e2e", "00-beta-smoke.spec.ts");
const betaSmokeSource = fs.readFileSync(betaSmokePath, "utf8");

assert.match(
  source,
  /const templatePickerRef = useRef<HTMLDivElement \| null>\(null\);[\s\S]*?const openTemplatePicker = \(\) => \{[\s\S]*?setPlanStartMode\("template"\);[\s\S]*?templatePickerRef\.current\?\.scrollIntoView\(\{ behavior: "smooth", block: "start" \}\);/,
  "Opening templates should scroll the controls panel to the starter floor plan picker."
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
  /testId: "plan-start-template"[\s\S]*?label: "Starter layouts"[\s\S]*?onClick: openTemplatePicker/,
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
  /!isDesigner && showTemplatePicker/,
  "The starter floor plan picker should remain available when planStartMode is template."
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
  /Choose a floor plan[\s\S]*?\{filteredPlanTemplates\.length\} options/,
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
  designPageSource,
  /const templateDoorOpenings: RoomOpening2D\[\] = template\.doorways\.flatMap/,
  "Applying a template should convert template doorway specs into plan openings."
);

assert.match(
  designPageSource,
  /const templateWindowOpenings: RoomOpening2D\[\] = template\.windows\.flatMap[\s\S]*?kind: "window" as const/,
  "Applying a template should convert exterior window specs into plan window openings."
);

assert.match(
  designPageSource,
  /const templateOpenings = \[\.\.\.templateDoorOpenings, \.\.\.templateWindowOpenings\]/,
  "Applying a template should install automatic doors and windows together."
);

assert.match(
  designPageSource,
  /setPlanOpenings\(templateOpenings\)/,
  "Applying a template should install automatic doorways instead of clearing openings."
);

assert.match(
  designPageSource,
  /setPlanOpenings\(templateOpenings\);[\s\S]*?setPlanFixedElements\(\[\]\);/,
  "Applying a template should clear standalone built-ins so old default rectangles do not float outside the new plan."
);

assert.match(
  designPageSource,
  /last3DViewRef\.current = null;[\s\S]*?floorCameraViewsRef\.current = \{\};[\s\S]*?suppressNext3DViewSaveRef\.current = true;[\s\S]*?setViewMode\("2d"\);/,
  "Applying a template should clear stale 3D camera memory before returning to 2D."
);

assert.match(
  designPageSource,
  /const previousViewModeRef = useRef<EditorViewMode>\(viewMode\);[\s\S]*?const suppressNext3DViewSaveRef = useRef\(false\);[\s\S]*?const pending3DViewRef = useRef<CameraView \| null>\(null\);[\s\S]*?previousViewMode === "3d" && !suppressNext3DViewSaveRef\.current/,
  "The 2D camera fit effect should only preserve a real previous 3D camera."
);

assert.match(
  designPageSource,
  /pending3DViewRef\.current = hasWholeHousePlan[\s\S]*?getWholeHome3DView\(\)[\s\S]*?DEFAULT_EDITOR_CAMERA_VIEW[\s\S]*?setViewMode\(next\);/,
  "Switching to 3D should queue the fitted view instead of applying it to the still-mounted 2D camera."
);

assert.match(
  designPageSource,
  /const applyQueued3DView = useCallback\([\s\S]*?!\(camera instanceof THREE\.PerspectiveCamera\)[\s\S]*?attempt < 8[\s\S]*?camera\.up\.set\(0, 1, 0\);[\s\S]*?transitionToCameraView\(nextView, durationMs\);/,
  "Queued 3D camera fits should wait for the perspective camera and restore the normal 3D up vector."
);

assert.match(
  designPageSource,
  /if \(pending3DViewRef\.current\) \{[\s\S]*?const pendingView = pending3DViewRef\.current;[\s\S]*?pending3DViewRef\.current = null;[\s\S]*?applyQueued3DView\(pendingView, 420\);/,
  "Queued 3D camera fits should run through the perspective-camera handoff helper."
);

assert.match(
  designPageSource,
  /onGoView3D=\{\(\) => handleEditorViewModeChange\("3d"\)\}/,
  "Plan-panel 3D navigation should use the camera-aware view mode handler."
);

assert.doesNotMatch(
  designPageSource,
  /kitchen-run-top|kitchen-island/,
  "The editor should not auto-seed default built-in rectangles on a new floor plan."
);

assert.match(
  designPageSource,
  /function shouldConfirmPlanTemplateReplacement\([\s\S]*?openings: RoomOpening2D\[\][\s\S]*?if \(itemCount > 0\) return true;[\s\S]*?isDefaultStarterLivingRoom[\s\S]*?openings\.length > 2/,
  "Template replacement should protect existing work while allowing the untouched starter room shell."
);

assert.match(
  designPageSource,
  /setPendingPlanTemplateReplacement\(\{ template, options \}\)[\s\S]*?return;[\s\S]*?const timestamp = Date\.now\(\)/,
  "Template apply should open an in-app confirmation before replacing meaningful existing work."
);

assert.match(
  designPageSource,
  /const openTemplatePickerFromLoad = useCallback\(\(\) => \{[\s\S]*?setShowMyDesigns\(false\);[\s\S]*?setGuidedPlanStartMode\("template"\);[\s\S]*?goPlan\(\);[\s\S]*?setViewMode\("2d"\);[\s\S]*?showRuleToast\("Choose an empty or furnished template"\);/,
  "The Load modal shortcut should close saved designs and open the template picker in 2D Plan mode."
);

assert.match(
  designPageSource,
  /data-testid="load-designs-template-shortcut"[\s\S]*?Saved designs are listed here\. Templates open in Plan[\s\S]*?data-testid="load-designs-open-templates"[\s\S]*?onClick=\{openTemplatePickerFromLoad\}/,
  "The Load modal should explain the saved-design/template distinction and expose a direct template shortcut."
);

assert.match(
  designPageSource,
  /<ConfirmDialog[\s\S]*?open=\{Boolean\(pendingPlanTemplateReplacement\)\}[\s\S]*?confirmLabel="Replace plan"[\s\S]*?handleConfirmPendingPlanTemplateReplacement/,
  "Template replacement confirmation should use the shared app dialog."
);

assert.match(
  designPageSource,
  /const \[localBackupHydrated, setLocalBackupHydrated\] = useState\(false\);[\s\S]*?finally \{[\s\S]*?setLocalBackupHydrated\(true\);[\s\S]*?if \(!localBackupHydrated\) return;[\s\S]*?writeLocalDesignBackup\(\)/,
  "Local backup writes should wait until stored furnished templates have hydrated."
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
  designPageSource,
  /options\?\.furnishingPackId[\s\S]*?targetRoom\.items = \[/,
  "Furnished template application should create normal room-scoped design items only when requested."
);

assert.match(
  designPageSource,
  /resolveTemplateFurnishingProduct\(intent\)/,
  "Furnished starter items should be resolved through catalog readiness before placement."
);

console.log("Plan template access guardrails passed.");
