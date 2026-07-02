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
  /designControlsPanelVisibleForLayout\s*\?\s*isDesigner\s*\?\s*"md:left-\[28rem\] md:top-56"\s*:\s*"md:left-\[23\.5rem\] md:top-56"/,
  "Scene performance control should shift beside the design panel and below the top status bar on tablet/desktop."
);

assert.match(
  source,
  /className=\{[^}]*showDesignerTheme[\s\S]*md:left-\[23\.5rem\] md:top-56[\s\S]*md:left-\[28rem\] md:top-56/,
  "Scene performance layout should account for both homeowner and designer panel offsets."
);

console.log("Editor floating overlay layout guardrails passed.");
