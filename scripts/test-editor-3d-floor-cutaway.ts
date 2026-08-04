import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  resolveCameraViewForFloorWorldY,
  resolveCanonicalFloorElevationMeters,
  resolveFloorUndersideCutawayElevationMeters,
} from "@/lib/floor-plan-scene-elevation";
import { resolveEditorInitial3DFitKey } from "@/lib/design-page-editor-configuration";

function assertMetersEqual(actual: number, expected: number, message: string) {
  assert.ok(Math.abs(actual - expected) < 1e-12, message);
}

assert.equal(
  resolveCanonicalFloorElevationMeters({ floorElevationMm: 0 }),
  0,
  "The default canonical finished-floor elevation should be world Y zero."
);
assert.equal(
  resolveCanonicalFloorElevationMeters({ floorElevationMm: 3475 }),
  3.475,
  "A non-zero canonical floor elevation should convert from integer millimetres exactly once."
);
assert.equal(
  resolveCanonicalFloorElevationMeters({ floorElevationMm: -1250 }),
  -1.25,
  "Negative canonical elevations should remain valid for floors below the world origin."
);
for (const malformedElevation of [Number.NaN, Number.POSITIVE_INFINITY, 3.475]) {
  assert.equal(
    resolveCanonicalFloorElevationMeters({
      floorElevationMm: malformedElevation,
    }),
    null,
    "Malformed or non-integer persisted floor elevations must not enter the scene."
  );
}

assertMetersEqual(
  resolveFloorUndersideCutawayElevationMeters(0, 0.1),
  -0.035,
  "The default floor cutaway threshold should be derived below the finished-floor plane."
);
assertMetersEqual(
  resolveFloorUndersideCutawayElevationMeters(3.475, 0.225),
  3.39625,
  "A stacked floor cutaway threshold should include its exact world elevation."
);
assertMetersEqual(
  resolveFloorUndersideCutawayElevationMeters(-1.25, 0.2),
  -1.32,
  "A below-origin floor should retain the same slab-relative cutaway contract."
);

const localCameraView = {
  pos: [6.2, 3.6, 7.2] as [number, number, number],
  target: [0, 1, 0] as [number, number, number],
  fov: 45,
};
assert.deepEqual(
  resolveCameraViewForFloorWorldY(localCameraView, 3.475),
  { pos: [6.2, 7.075, 7.2], target: [0, 4.475, 0], fov: 45 },
  "A raised-floor camera preset should translate its position and target into world space exactly once."
);
assert.deepEqual(
  resolveCameraViewForFloorWorldY(localCameraView, -1.25),
  { pos: [6.2, 2.35, 7.2], target: [0, -0.25, 0], fov: 45 },
  "A below-origin camera preset should preserve its floor-relative composition."
);
assert.deepEqual(
  localCameraView,
  { pos: [6.2, 3.6, 7.2], target: [0, 1, 0], fov: 45 },
  "Camera projection should not mutate the local preset or a persisted world camera view."
);

const singleRoomFitKeyInput = {
  activeRoomId: "raised-room",
  designId: "design-a",
  floorWorldY: 3.475,
  hasWholeHousePlan: false,
};
assert.equal(
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, wholeHomeResponsiveKey: "viewport-a" }),
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, wholeHomeResponsiveKey: "viewport-b" }),
  "A single-room viewport resize should not reapply the initial default camera fit."
);
assert.notEqual(
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, wholeHomeResponsiveKey: "viewport-a" }),
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, floorWorldY: -1.25, wholeHomeResponsiveKey: "viewport-a" }),
  "Changing the active canonical floor should create a new single-room initialization identity."
);
assert.notEqual(
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, hasWholeHousePlan: true, wholeHomeResponsiveKey: "viewport-a" }),
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, hasWholeHousePlan: true, wholeHomeResponsiveKey: "viewport-b" }),
  "Whole-home camera fitting should remain responsive to viewport and plan-bound changes."
);

const sceneRegionWorkspaceRegistrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageSceneRegionWorkspaceRegistration.ts"
  ),
  "utf8"
);
const editorInteractionRegistrationSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "lib",
    "useDesignPageEditorInteractionRegistration.ts"
  ),
  "utf8"
);
const cameraNavigationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageCameraNavigation.ts"),
  "utf8"
);
const sceneRegionAdapterSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-page-scene-region-adapter.ts"),
  "utf8"
);
const designSceneStructureLayerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignSceneStructureLayer.tsx"
  ),
  "utf8"
);
const editorConfigurationSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "design-page-editor-configuration.ts"),
  "utf8"
);
const designSceneCanvasSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignSceneCanvas.tsx"
  ),
  "utf8"
);
const roomEnvironmentSource = fs.readFileSync(
  path.join(process.cwd(), "components", "scene", "RoomEnvironment.tsx"),
  "utf8"
);
const housePlanRendererSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "renderers", "HousePlanRenderer3D.tsx"),
  "utf8"
);
const housePlanSurfaceMeshesSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "renderers",
    "house-plan-3d",
    "surfaceMeshes.tsx"
  ),
  "utf8"
);
const housePlanWallAndOpeningMeshesSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "renderers",
    "house-plan-3d",
    "wallAndOpeningMeshes.tsx"
  ),
  "utf8"
);
const canonicalPlanRendererSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "renderers",
    "CanonicalFloorPlanStructure.tsx"
  ),
  "utf8"
);

assert.match(
  editorConfigurationSource,
  /EDITOR_3D_MAX_POLAR_ANGLE = Math\.PI - 0\.02;/,
  "3D orbit controls should allow underside rotation for inspection."
);

assert.match(
  sceneRegionWorkspaceRegistrationSource,
  /maxPolarAngle:\s*EDITOR_3D_MAX_POLAR_ANGLE/,
  "The scene registration should pass the named maximum polar angle guardrail to the Canvas shell."
);

assert.match(
  designSceneCanvasSource,
  /<OrbitControls[\s\S]*?maxPolarAngle=\{configuration\.orbit\.maxPolarAngle\}/,
  "The Canvas shell should apply its configured maximum polar angle to 3D OrbitControls."
);

assert.match(
  roomEnvironmentSource,
  /const floorVisible = camera\.position\.y > resolveFloorUndersideCutawayElevationMeters\(floorWorldY, slabThickness\);/,
  "Single-room floor visibility should be derived from its finished-floor world elevation."
);

assert.match(
  roomEnvironmentSource,
  /<group position=\{\[0, floorWorldY, 0\]\}>/,
  "The single-room shell should be positioned on its canonical finished-floor world plane."
);

assert.match(
  roomEnvironmentSource,
  /ceilingRef\.current\.visible = camera\.position\.y <= floorWorldY \+ height \+ wallThickness \+ outsideBuffer;/,
  "Single-room ceiling visibility should use the same finished-floor world elevation."
);

assert.match(
  sceneRegionWorkspaceRegistrationSource,
  /floorWorldY:\s*resolveCanonicalFloorElevationMeters\(room\.activeRoom \?\? \{\}\) \?\? 0/,
  "The scene registration should project the active room's canonical elevation into world metres."
);

assert.match(
  sceneRegionWorkspaceRegistrationSource,
  /initialCameraView:\s*resolveCameraViewForFloorWorldY\([\s\S]*?DEFAULT_EDITOR_CAMERA_VIEW,[\s\S]*?resolveCanonicalFloorElevationMeters\(room\.activeRoom \?\? \{\}\) \?\? 0[\s\S]*?\)/,
  "The initial single-room Canvas camera should start on the canonical floor plane."
);

assert.match(
  editorInteractionRegistrationSource,
  /activeRoomFloorWorldY:\s*resolveCanonicalFloorElevationMeters\(activeRoom \?\? \{\}\) \?\? 0/,
  "Camera navigation should receive the active room's canonical floor elevation."
);

assert.match(
  cameraNavigationSource,
  /const singleRoomDefaultCameraView = useMemo\([\s\S]*?resolveCameraViewForFloorWorldY\(defaultCameraView, activeRoomFloorWorldY\)/,
  "Single-room default navigation should derive a world-space camera view."
);

assert.match(
  cameraNavigationSource,
  /pending3DViewRef\.current = hasWholeHousePlan[\s\S]*?: singleRoomDefaultCameraView;[\s\S]*?transitionToCameraView\(hasWholeHousePlan \? getWholeHome3DView\(\) : singleRoomDefaultCameraView, 420\)/,
  "3D entry and Fit Room should use the floor-relative single-room camera view."
);

assert.match(
  cameraNavigationSource,
  /const wholeHomeResponsiveKey = \[[\s\S]*?const fitKey = resolveEditorInitial3DFitKey\(\{ activeRoomId: rooms\[0\]\?\.id \?\? null, designId, floorWorldY: activeRoomFloorWorldY, hasWholeHousePlan, wholeHomeResponsiveKey \}\);[\s\S]*?applyQueued3DView\(hasWholeHousePlan \? getWholeHome3DView\(\) : singleRoomDefaultCameraView, 260\)/,
  "A ready single-room scene should apply its floor-relative default camera view."
);

assert.match(
  cameraNavigationSource,
  /const getEyeLevelView[\s\S]*?resolveCameraViewForFloorWorldY\([\s\S]*?activeRoomFloorWorldY[\s\S]*?const getFocusView[\s\S]*?resolveCameraViewForFloorWorldY\([\s\S]*?activeRoomFloorWorldY/,
  "Eye-level and item-focus views should translate their local composition to the active floor."
);

assert.match(
  cameraNavigationSource,
  /const roomFloorWorldY = resolveCanonicalFloorElevationMeters\(room\) \?\? 0;[\s\S]*?resolveCameraViewForFloorWorldY\([\s\S]*?roomFloorWorldY/,
  "Selected canonical rooms should use their own floor elevation for 3D framing."
);

assert.match(
  cameraNavigationSource,
  /transitionToCameraView\(restore, 420\);/,
  "Restoring an already-world-space 3D camera view should not reapply room elevation."
);

assert.match(
  sceneRegionAdapterSource,
  /singleRoom:[\s\S]*?floorWorldY: room\.floorWorldY/,
  "The scene adapter should preserve the single-room finished-floor world elevation."
);

assert.match(
  designSceneStructureLayerSource,
  /<Room[\s\S]*?floorWorldY=\{state\.singleRoom\.floorWorldY\}/,
  "The structure layer should pass the canonical floor plane to the single-room renderer."
);

assert.match(
  roomEnvironmentSource,
  /floorSurfaceRef\.current\.visible = floorVisible;/,
  "Single-room floor surface visibility should follow the underside cutaway."
);

assert.match(
  roomEnvironmentSource,
  /slabRef\.current\.visible = floorVisible;/,
  "Single-room slab visibility should follow the underside cutaway."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /floorWorldY: number;/,
  "Whole-home floor adapters should require the finished-floor world elevation."
);

assert.match(
  housePlanRendererSource,
  /const floorYOffset = resolveHouseRoomFloorElevationMeters\(/,
  "Whole-home floors should derive world Y from the canonical room elevation owner."
);

assert.match(
  housePlanRendererSource,
  /<RoomFloorMesh[\s\S]*?floorWorldY=\{floorYOffset\}/,
  "Each whole-home floor should receive the canonical finished-floor world elevation."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /const floorVisible = camera\.position\.y > resolveFloorUndersideCutawayElevationMeters\(floorWorldY, slabThickness\);/,
  "Whole-home floor visibility should be derived from that floor's finished-floor world elevation."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /floorSurfaceRef\.current\.visible = floorVisible;/,
  "Whole-home floor surface visibility should follow the underside cutaway."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /floorBandRef\.current\.visible = floorVisible;/,
  "Whole-home slab edge visibility should follow the underside cutaway."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /slabRef\.current\.visible = camera\.position\.y > resolveFloorUndersideCutawayElevationMeters\(slab\.elevationMeters, slab\.thicknessMeters\);/,
  "The merged whole-home slab visibility should be derived from its finished-floor world elevation."
);

assert.match(
  canonicalPlanRendererSource,
  /slabRef\.current\.visible = camera\.position\.y > resolveFloorUndersideCutawayElevationMeters\(floor\.elevationMm \/ 1000, thicknessMeters\);/,
  "Canonical floor-plan slab visibility should be derived from its finished-floor world elevation."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /floorPickEnabledRef\.current = floorVisible;/,
  "Hidden whole-home floors should also stop receiving pointer raycasts."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /raycast=\{raycastFloorSurface\}/,
  "Whole-home floor selection should use the visibility-aware raycast."
);

assert.match(
  housePlanWallAndOpeningMeshesSource,
  /pickEnabledRef\.current = renderState\.visible;/,
  "Cutaway wall visibility should also control wall pointer raycasts."
);

assert.match(
  housePlanWallAndOpeningMeshesSource,
  /raycast=\{raycastWhenPickable\}/,
  "Wall surfaces should use the cutaway-aware raycast."
);

assert.match(
  housePlanWallAndOpeningMeshesSource,
  /openingPickEnabledRef\.current = camera\.position\.y >= floorWorldY - 0\.02;/,
  "Opening hit proxies should not intercept pointer rays from below their floor."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /const ceilingWorldY = floorWorldY \+ wallHeight;/,
  "Ceiling selection should account for the stacked-floor world offset."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /if \(raycaster\.ray\.direction\.y <= 0\.001\) return;/,
  "Ceiling caps should accept only upward pointer rays from the underside."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /const canPickCeilingCap = camera\.position\.y < ceilingWorldY - 0\.005;/,
  "Ceiling caps should stop rendering and receiving hits above the ceiling plane."
);

assert.match(
  housePlanRendererSource,
  /<RoomCeilingCapMesh[\s\S]*?floorWorldY=\{floorYOffset\}/,
  "Each room ceiling should receive its floor world offset."
);

assert.match(
  housePlanSurfaceMeshesSource,
  /const ceilingCapGeometry = useMemo\(\s*\(\) => buildHorizontalRoomGeometry\(room\),[\s\S]*const ceilingBandGeometry = useMemo\(\s*\(\) => buildRoomEdgeBandGeometry\(room, CEILING_THICKNESS_METERS\)/,
  "Ceiling surfaces and edge bands should terminate on the room wall boundary without an outward or inward offset."
);

assert.doesNotMatch(
  housePlanSurfaceMeshesSource,
  /ceilingEdge(Inset|Offset)/,
  "Ceiling geometry should not apply a half-wall inset or overhang."
);

assert.match(
  housePlanRendererSource,
  /if \(onSelectSurfaceTarget\) \{[\s\S]*?onSelectSurfaceTarget\(\{[\s\S]*?\}\);[\s\S]*?\} else \{\s*onSelectRoom\?\.\(target\.roomId\);\s*\}/,
  "A structure click should select either its surface target or its room, never both."
);

console.log("Editor 3D floor cutaway guardrails passed.");
