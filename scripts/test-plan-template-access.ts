import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const planPanelPath = path.join(process.cwd(), "components", "editor", "DesignControlsPlanPanel.tsx");
const source = fs.readFileSync(planPanelPath, "utf8");

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

console.log("Plan template access guardrails passed.");
