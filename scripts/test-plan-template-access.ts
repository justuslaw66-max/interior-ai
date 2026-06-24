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
  /data-testid="plan-open-templates"[\s\S]*?onClick=\{openTemplatePicker\}/,
  "Guided plan editing should expose a Templates button that visibly jumps to the picker after rooms exist."
);

assert.match(
  source,
  /data-testid="manual-panel-templates"[\s\S]*?onClick=\{openTemplatePicker\}/,
  "Manual plan editing should expose a Templates button that visibly jumps to the picker after rooms exist."
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
  /data-testid="plan-floor-finish-options"[\s\S]*?data-testid=\{`plan-floor-material-\$\{material\.id\}`\}/,
  "The floor finish shortcut should reveal selectable material swatches."
);

assert.match(
  source,
  /data-testid="room-setup-floor-finish-shortcut"[\s\S]*?data-testid="room-setup-change-floor-finish"[\s\S]*?setRoomFinishPanelOpen\(true\)/,
  "Guided room setup should surface floor finish editing before the collapsed size panel."
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
