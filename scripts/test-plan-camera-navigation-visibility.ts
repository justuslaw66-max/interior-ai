import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const cameraHelperPath = path.join(process.cwd(), "lib", "plan-camera-2d.ts");
const camera2DPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "camera",
  "EditorCamera2D.tsx"
);
const source = fs.readFileSync(designPagePath, "utf8");
const cameraHelperSource = fs.readFileSync(cameraHelperPath, "utf8");
const camera2DSource = fs.readFileSync(camera2DPath, "utf8");
const roomNavigatorBlock =
  source.match(
    /\{viewMode === "3d" && hasWholeHousePlan && floatingPlanOverlayStackVisible && \([\s\S]*?<RoomPanNavigator[\s\S]*?<\/DraggableFloatingPanel>\s*\)\}/
  )?.[0] ?? "";

assert.match(
  roomNavigatorBlock,
  /viewMode === "3d" && hasWholeHousePlan && floatingPlanOverlayStackVisible[\s\S]*?<RoomPanNavigator/,
  "Room navigator should be limited to the 3D whole-home panel, not the 2D homeowner plan view."
);

assert.doesNotMatch(
  roomNavigatorBlock,
  /viewMode === "2d"/,
  "Room navigator must not render in the 2D plan view."
);

assert.match(
  source,
  /applyPlan2DCameraInvariant/,
  "2D plan view must use the centralized camera invariant helper."
);

assert.match(
  source,
  /Plan2DCameraInvariantGuard[\s\S]*?recoverPlan2DCameraIfNeeded/,
  "2D plan view must mount a runtime guard that recovers degenerate camera states."
);

assert.match(
  source,
  /data-plan-2d-camera-valid=\{[\s\S]*?planDebugMetrics\.cameraValid/,
  "2D plan view must expose camera validity for regression tests."
);

assert.match(
  source,
  /data-plan-2d-projected-room-min-height-px=\{[\s\S]*?planDebugMetrics\.projectedRoomMinHeightPx/,
  "2D plan view must expose projected room height so flattened-room regressions are testable."
);

assert.match(
  cameraHelperSource,
  /export function applyPlan2DCameraInvariant[\s\S]*?controls\.maxPolarAngle = Math\.PI/,
  "2D MapControls must allow the established top-down orientation instead of forcing polar angle 0."
);

assert.match(
  cameraHelperSource,
  /export function isPlan2DCameraDegenerate/,
  "2D camera helper should expose a degeneration detector."
);

assert.match(
  cameraHelperSource,
  /export function recoverPlan2DCameraIfNeeded/,
  "2D camera helper should expose a recovery helper."
);

assert.match(
  camera2DSource,
  /applyPlan2DCameraInvariant/,
  "EditorCamera2D should use the same centralized invariant as the design page."
);

assert.doesNotMatch(
  source,
  /viewMode === "2d"[\s\S]*?controls\.maxPolarAngle = 0;/,
  "2D MapControls must not force polar angle 0 with a non-Y camera up vector, because that flattens rooms into lines."
);

console.log("Plan camera navigation visibility guardrails passed.");
