import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const source = fs.readFileSync(designPagePath, "utf8");

assert.match(
  source,
  /data-testid="scene-performance-control"/,
  "Scene performance control should remain test-addressable."
);

assert.match(
  source,
  /designControlsPanelVisibleForLayout\s*\?\s*isDesigner\s*\?\s*"md:left-\[28rem\]"\s*:\s*"md:left-\[23\.5rem\]"/,
  "Scene performance control should shift beside the design panel on tablet/desktop."
);

assert.match(
  source,
  /className=\{[^}]*showDesignerTheme[\s\S]*md:left-\[23\.5rem\][\s\S]*md:left-\[28rem\]/,
  "Scene performance layout should account for both homeowner and designer panel offsets."
);

console.log("Editor floating overlay layout guardrails passed.");
