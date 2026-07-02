import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const source = fs.readFileSync(designPagePath, "utf8");

assert.match(
  source,
  /cameraNavigation=\{\{\s*enabled: isDesigner && !floorPlanTraceRoomMode && !floorPlanTraceOpeningMode,/,
  "In-canvas 2D camera navigation handles should be hidden from the normal homeowner plan view."
);

assert.doesNotMatch(
  source,
  /cameraNavigation=\{\{\s*enabled: !floorPlanTraceRoomMode && !floorPlanTraceOpeningMode,/,
  "2D camera navigation handles must not be enabled for every plan user."
);

console.log("Plan camera navigation visibility guardrails passed.");
