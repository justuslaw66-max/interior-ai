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
  /data-testid="plan-open-templates"[\s\S]*?setPlanStartMode\("template"\)/,
  "Guided plan editing should expose a Templates button after rooms exist."
);

assert.match(
  source,
  /data-testid="manual-panel-templates"[\s\S]*?setPlanStartMode\("template"\)/,
  "Manual plan editing should expose a Templates button after rooms exist."
);

assert.match(
  source,
  /!isDesigner && showTemplatePicker/,
  "The starter floor plan picker should remain available when planStartMode is template."
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
  /data-testid=\{`apply-plan-template-\$\{template\.id\}`\}[\s\S]*?Plan only/,
  "Template cards should keep a plan-only action."
);

assert.match(
  source,
  /data-testid=\{`apply-furnished-template-\$\{template\.id\}`\}[\s\S]*?furnishingPackId/,
  "Template cards should expose a furnished starter action."
);

assert.match(
  source,
  /Best for: \{template\.bestFor\}/,
  "Template cards should explain who each layout is best for."
);

assert.match(
  source,
  /Zones: \{template\.zones\.slice\(0, 3\)\.join\(" · "\)\}/,
  "Template cards should show starter furniture zones."
);

assert.match(
  designPageSource,
  /const templateOpenings: RoomOpening2D\[\] = template\.doorways\.flatMap/,
  "Applying a template should convert template doorway specs into plan openings."
);

assert.match(
  designPageSource,
  /setPlanOpenings\(templateOpenings\)/,
  "Applying a template should install automatic doorways instead of clearing openings."
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
