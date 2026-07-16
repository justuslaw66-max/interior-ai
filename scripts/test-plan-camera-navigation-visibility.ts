import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPagePath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageWorkspace.tsx"
);
const cameraHelperPath = path.join(process.cwd(), "lib", "plan-camera-2d.ts");
const camera2DPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "camera",
  "EditorCamera2D.tsx"
);
const cameraInvariantGuardPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "camera",
  "Plan2DCameraInvariantGuard.tsx"
);
const designSceneCanvasPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignSceneCanvas.tsx"
);
const viewportOverlayPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "design-page",
  "DesignPageViewportOverlayLayer.tsx"
);
const cameraControllerPath = path.join(
  process.cwd(),
  "lib",
  "useDesignPageCameraNavigation.ts"
);
const source = fs.readFileSync(designPagePath, "utf8");
const cameraHelperSource = fs.readFileSync(cameraHelperPath, "utf8");
const camera2DSource = fs.readFileSync(camera2DPath, "utf8");
const cameraInvariantGuardSource = fs.readFileSync(cameraInvariantGuardPath, "utf8");
const designSceneCanvasSource = fs.readFileSync(designSceneCanvasPath, "utf8");
const viewportOverlaySource = fs.readFileSync(viewportOverlayPath, "utf8");
const cameraControllerSource = fs.readFileSync(cameraControllerPath, "utf8");
const roomNavigatorBlock =
  viewportOverlaySource.match(
    /\{state\.railVisible && state\.navigator && navigatorRailElement[\s\S]*?\? createPortal\([\s\S]*?<RoomPanNavigator[\s\S]*?navigatorRailElement\s*\)[\s\S]*?: null\}/
  )?.[0] ?? "";

assert.match(
  source,
  /import\s+\{\s*DesignPageViewportOverlayLayer\s*\}\s+from\s+"@\/components\/editor\/design-page\/DesignPageViewportOverlayLayer"/,
  "The design page should import the viewport-overlay composition."
);
assert.match(
  source,
  /<DesignPageViewportOverlayLayer[\s\S]*?railVisible:\s*floatingPlanOverlayStackVisible[\s\S]*?navigator:\s*viewMode === "3d" && hasWholeHousePlan/,
  "The design page should pass the shared rail policy and 3D whole-home navigator state into the viewport overlay."
);
assert.doesNotMatch(
  source,
  /<RoomPanNavigator/,
  "The design page should delegate room-navigator rendering to the viewport overlay."
);
assert.match(
  viewportOverlaySource,
  /import RoomPanNavigator from "@\/components\/editor\/RoomPanNavigator"/,
  "The viewport overlay should own the room-navigator import."
);

assert.match(
  roomNavigatorBlock,
  /state\.railVisible && state\.navigator && navigatorRailElement[\s\S]*?<RoomPanNavigator/,
  "Room navigator should require the shared rail, 3D whole-home navigator state, and mounted portal target."
);

assert.doesNotMatch(
  roomNavigatorBlock,
  /viewMode === "2d"/,
  "Room navigator must not render in the 2D plan view."
);

assert.match(
  cameraControllerSource,
  /applyPlan2DCameraInvariant/,
  "2D plan view must use the centralized camera invariant helper."
);

assert.match(
  designSceneCanvasSource,
  /<Plan2DCameraInvariantGuard[\s\S]*?onDiagnosticsChange=\{actions\.onPlanDiagnosticsChange\}/,
  "The scene Canvas shell must mount the runtime camera-invariant guard."
);

assert.match(
  source,
  /<DesignSceneCanvas[\s\S]*?onPlanDiagnosticsChange:\s*handlePlan2DCameraDiagnosticsChange/,
  "The design page must wire camera diagnostics into the scene Canvas shell."
);

assert.match(
  cameraInvariantGuardSource,
  /recoverPlan2DCameraIfNeeded/,
  "2D plan view must mount a runtime guard that recovers degenerate camera states."
);

assert.match(
  designSceneCanvasSource,
  /data-plan-2d-camera-valid=\{[\s\S]*?planDiagnostics\.valid/,
  "2D plan view must expose camera validity for regression tests."
);

assert.match(
  designSceneCanvasSource,
  /data-plan-2d-projected-room-min-height-px=\{[\s\S]*?planDiagnostics\.projectedRoomMinHeightPx/,
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
  `${source}\n${viewportOverlaySource}\n${cameraControllerSource}\n${designSceneCanvasSource}`,
  /viewMode === "2d"[\s\S]*?controls\.maxPolarAngle = 0;/,
  "2D MapControls must not force polar angle 0 with a non-Y camera up vector, because that flattens rooms into lines."
);

console.log("Plan camera navigation visibility guardrails passed.");
