import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const planPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPlanPanel.tsx");
const source = fs.readFileSync(planPanelPath, "utf8");
const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const designPageSource = fs.readFileSync(designPagePath, "utf8");

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

console.log("Plan template access guardrails passed.");
