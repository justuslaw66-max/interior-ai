import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  resolveCameraViewForFloorWorldY,
  resolveCameraViewForRoomOrigin,
  resolveCanonicalFloorElevationMeters,
  resolveFloorUndersideCutawayElevationMeters,
} from "@/lib/floor-plan-scene-elevation";
import { resolveEditorInitial3DFitKey } from "@/lib/design-page-editor-configuration";
import {
  buildHorizontalRoomGeometry,
  getRectangleWallSegments,
} from "@/components/editor/renderers/house-plan-3d/geometry";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";

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
  resolveCameraViewForRoomOrigin(localCameraView, { x: 0, y: 0, z: 0 }),
  localCameraView,
  "A lone room at the plan origin should keep the default camera framing unchanged."
);
const offOriginRoomCameraView = resolveCameraViewForRoomOrigin(localCameraView, { x: 8, y: 3.475, z: -2 });
assert.deepEqual(
  offOriginRoomCameraView,
  { pos: [14.2, 7.075, 5.2], target: [8, 4.475, -2], fov: 45 },
  "A lone off-origin room should frame the camera on its plan position and finished-floor plane."
);
assert.notEqual(
  offOriginRoomCameraView.pos,
  localCameraView.pos,
  "Room-origin camera projection should return new vectors rather than aliasing the preset."
);
assert.deepEqual(
  localCameraView,
  { pos: [6.2, 3.6, 7.2], target: [0, 1, 0], fov: 45 },
  "Camera projection should not mutate the local preset or a persisted world camera view."
);

const singleRoomFitKeyInput = {
  activeRoomId: "raised-room",
  designId: "design-a",
  roomOrigin: { x: 0, y: 3.475, z: 0 },
  hasWholeHousePlan: false,
};
assert.equal(
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, wholeHomeResponsiveKey: "viewport-a" }),
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, wholeHomeResponsiveKey: "viewport-b" }),
  "A single-room viewport resize should not reapply the initial default camera fit."
);
assert.notEqual(
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, wholeHomeResponsiveKey: "viewport-a" }),
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, roomOrigin: { x: 0, y: -1.25, z: 0 }, wholeHomeResponsiveKey: "viewport-a" }),
  "Changing the active canonical floor should create a new single-room initialization identity."
);
assert.notEqual(
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, wholeHomeResponsiveKey: "viewport-a" }),
  resolveEditorInitial3DFitKey({ ...singleRoomFitKeyInput, roomOrigin: { x: 8, y: 3.475, z: 0 }, wholeHomeResponsiveKey: "viewport-a" }),
  "Moving the lone room on the plan should create a new single-room initialization identity."
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
const roomCeilingCapMeshSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "renderers", "house-plan-3d",
    "RoomCeilingCapMesh.tsx"),
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

for (const retiredShell of [
  ["components", "scene", "RoomEnvironment.tsx"],
  ["components", "editor", "design-page", "DesignSceneSingleRoom.tsx"],
]) {
  assert.equal(
    fs.existsSync(path.join(process.cwd(), ...retiredShell)),
    false,
    "Single rooms render through the house-plan scene, so the legacy single-room shell and its cutaway must stay retired."
  );
}

assert.doesNotMatch(
  sceneRegionWorkspaceRegistrationSource,
  /floorWorldY:/,
  "The scene registration should not project a floor plane for a separate single-room renderer."
);
assert.doesNotMatch(
  sceneRegionWorkspaceRegistrationSource,
  /usesHousePlanScene/,
  "Every design with rooms uses the house-plan scene, so no renderer-routing flag should remain."
);

assert.match(
  sceneRegionWorkspaceRegistrationSource,
  /initialCameraView:\s*resolveCameraViewForFloorWorldY\([\s\S]*?DEFAULT_EDITOR_CAMERA_VIEW,\s*scene\.hasWholeHousePlan \? 0 : resolveCanonicalFloorElevationMeters\(room\.activeRoom \?\? \{\}\) \?\? 0\s*\)/,
  "The initial single-room Canvas camera should start on the active room's canonical floor plane, and a multi-room plan at world Y zero."
);

assert.match(
  editorInteractionRegistrationSource,
  /activeRoomFloorWorldY:\s*resolveCanonicalFloorElevationMeters\(activeRoom \?\? \{\}\) \?\? 0/,
  "Camera navigation should receive the active room's canonical floor elevation."
);
assert.match(
  editorInteractionRegistrationSource,
  /const \{ housePlan2D, planViewWidth, planViewDepth, activeRoomPlanOffset \} =\s*documentRoom\.derived\.plan;[\s\S]*?activeRoomFloorWorldY:[^\n]*\n\s*activeRoomPlanOffset,/,
  "Camera navigation should receive the active room's plan position."
);

assert.match(
  cameraNavigationSource,
  /activeRoomPlanOffset: \{ x: activeRoomPlanX, z: activeRoomPlanZ \}[\s\S]*?const activeRoomOrigin = useMemo\(\(\) => \(\{ x: activeRoomPlanX, y: activeRoomFloorWorldY, z: activeRoomPlanZ \}\)[\s\S]*?const singleRoomDefaultCameraView = useMemo\(\(\) => resolveCameraViewForRoomOrigin\(defaultCameraView, activeRoomOrigin\)/,
  "Single-room default navigation should frame the active room at its plan position and floor plane."
);

assert.match(
  cameraNavigationSource,
  /pending3DViewRef\.current = hasWholeHousePlan[\s\S]*?: singleRoomDefaultCameraView;[\s\S]*?transitionToCameraView\(hasWholeHousePlan \? getWholeHome3DView\(\) : singleRoomDefaultCameraView, 420\)/,
  "3D entry and Fit Room should use the floor-relative single-room camera view."
);

assert.match(
  cameraNavigationSource,
  /const wholeHomeResponsiveKey = \[[\s\S]*?const fitKey = resolveEditorInitial3DFitKey\(\{ activeRoomId: rooms\[0\]\?\.id \?\? null, designId, roomOrigin: activeRoomOrigin, hasWholeHousePlan, wholeHomeResponsiveKey \}\);[\s\S]*?applyQueued3DView\(hasWholeHousePlan \? getWholeHome3DView\(\) : singleRoomDefaultCameraView, 260\)/,
  "A ready single-room scene should apply its room-origin default camera view."
);

assert.match(
  cameraNavigationSource,
  /const getEyeLevelView[\s\S]*?resolveCameraViewForRoomOrigin\([\s\S]*?activeRoomOrigin\)[\s\S]*?const getFocusView[\s\S]*?resolveCameraViewForRoomOrigin\([\s\S]*?activeRoomOrigin\)/,
  "Eye-level and item-focus views should translate their room-local composition to the active room's plan position and floor."
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
  designSceneStructureLayerSource,
  /if \(state\.wholeHome\.rooms\.length > 0\) \{[\s\S]*?<HousePlanRenderer3D\s+rooms=\{visibleRooms\}/,
  "Every design with rooms, including a lone room, should render its floors through the house-plan cutaway."
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
  roomCeilingCapMeshSource,
  /const ceilingWorldY = floorWorldY \+ wallHeight;/,
  "Ceiling selection should account for the stacked-floor world offset."
);

assert.match(
  roomCeilingCapMeshSource,
  /if \(raycaster\.ray\.direction\.y <= 0\.001\) return;/,
  "Ceiling caps should accept only upward pointer rays from the underside."
);

assert.match(
  roomCeilingCapMeshSource,
  /const canPickCeilingCap = camera\.position\.y < ceilingWorldY - 0\.005;/,
  "Ceiling caps should stop rendering and receiving hits above the ceiling plane."
);

assert.match(
  housePlanRendererSource,
  /<RoomCeilingCapMesh[\s\S]*?floorWorldY=\{floorYOffset\}/,
  "Each room ceiling should receive its floor world offset."
);

// The ceiling covers the walls out to their outer faces. Seen from outside and below the ceiling --
// which is most of how this editor is used -- a wall's top face points away from the camera, so
// whatever the ceiling does not cover is a wall-thickness strip of nothing between the wall's top
// edge and the ceiling's edge. The room outline, the wall centreline, left half that strip open;
// the inner faces left all of it.
assert.match(
  roomCeilingCapMeshSource,
  /buildHorizontalRoomGeometry\(room, wallThickness \/ 2\)/,
  "The ceiling surface should cover the walls out to their outer faces."
);
const ceilingInsetProbeRoom = {
  id: "ceiling-inset-probe", name: "Ceiling inset probe", roomType: "living", shape: "rectangle",
  x: 0, z: 0, w: 4, d: 3,
} as HousePlanRoom2D;
const ceilingInsetProbeThickness = 0.2;
const insetCeiling = buildHorizontalRoomGeometry(
  ceilingInsetProbeRoom, ceilingInsetProbeThickness / 2
);
insetCeiling.computeBoundingBox();
const insetCeilingBox = insetCeiling.boundingBox;
assert.ok(insetCeilingBox, "Precondition: the inset ceiling surface has a bounding box.");
assert.ok(
  Math.abs((insetCeilingBox.max.x - insetCeilingBox.min.x)
    - (ceilingInsetProbeRoom.w + ceilingInsetProbeThickness)) < 1e-4 &&
  Math.abs((insetCeilingBox.max.z - insetCeilingBox.min.z)
    - (ceilingInsetProbeRoom.d + ceilingInsetProbeThickness)) < 1e-4,
  "A ceiling offset by half the wall thickness should measure the building's outside, so its edge "
  + "lands exactly on the outer faces: no strip of wall top left uncovered, and no overhang past "
  + "them either."
);
insetCeiling.dispose();

assert.match(
  roomCeilingCapMeshSource,
  /polygonOffset\b/,
  "Covering the wall heads puts the ceiling surface back in their plane, so it needs the polygon "
  + "offset the floor surface has always used against its slab."
);

assert.doesNotMatch(
  roomCeilingCapMeshSource,
  /buildRoomEdgeBandGeometry|CeilingSlabEdge|CEILING_THICKNESS_METERS/,
  "The ceiling is its surface and nothing else. An edge band around the room outline, which is the "
  + "wall centreline, is a rim standing proud of the wall head when it rises above the ceiling "
  + "plane, and a double-sided ribbon buried inside the wall when it hangs below one, intersecting "
  + "the wall's own geometry and hatching at the corners. Neither draws anything the room can see: "
  + "the outline sits behind the wall's inner face and inside its outer one."
);

// A separate, latent defect in the same corner, recorded because two reverted attempts went into
// finding it. The rectangle wall segments are exactly room.w and room.d long and centred on the
// room outline, so each corner leaves a wallThickness / 2 square that no wall fills while the
// square inside it is filled twice, giving those two boxes coincident top and bottom faces there.
// It is why a ceiling slab widened to the wall faces hangs past the corners in open air. Tiling
// the ring (w + thickness along x, d - thickness along z) closes both halves at once, but it also
// pushes each wall's end into the adjoining wall's visible face and seams every corner, so the
// wall meshes have to handle their own ends before that is worth doing.
const cornerProbeRoom = {
  id: "corner-probe", name: "Corner probe", roomType: "living", shape: "rectangle",
  x: 0, z: 0, w: 4, d: 3,
} as HousePlanRoom2D;
const cornerProbeWallThickness = 0.2;
const cornerProbeWalls = getRectangleWallSegments(cornerProbeRoom).map((segment) => {
  const alongHalf = segment.length / 2;
  const acrossHalf = cornerProbeWallThickness / 2;
  const halfX = segment.axis === "x" ? alongHalf : acrossHalf;
  const halfZ = segment.axis === "x" ? acrossHalf : alongHalf;
  return {
    minX: segment.x - halfX, maxX: segment.x + halfX,
    minZ: segment.z - halfZ, maxZ: segment.z + halfZ,
  };
});
const coveredByAWall = (x: number, z: number) => cornerProbeWalls.some((wall) =>
  x >= wall.minX - 1e-9 && x <= wall.maxX + 1e-9 &&
  z >= wall.minZ - 1e-9 && z <= wall.maxZ + 1e-9);
const outerFaceOffset = cornerProbeWallThickness / 2;
assert.ok(
  coveredByAWall(cornerProbeRoom.w / 2 + outerFaceOffset - 1e-6, 0),
  "Precondition: a wall does reach its own outer face along its length, which is why the offset "
  + "looks right until you get to a corner."
);
const wallsCovering = (x: number, z: number) => cornerProbeWalls.filter((wall) =>
  x > wall.minX + 1e-9 && x < wall.maxX - 1e-9 &&
  z > wall.minZ + 1e-9 && z < wall.maxZ - 1e-9).length;
assert.equal(
  wallsCovering(
    cornerProbeRoom.w / 2 + outerFaceOffset / 2,
    -cornerProbeRoom.d / 2 - outerFaceOffset / 2
  ),
  0,
  "No wall fills the outer corner, so a ceiling slab offset out to the wall faces would overhang "
  + "there. Close the wall corners before offsetting the slab."
);
assert.equal(
  wallsCovering(
    cornerProbeRoom.w / 2 - outerFaceOffset / 2,
    -cornerProbeRoom.d / 2 + outerFaceOffset / 2
  ),
  2,
  "The other half of the same defect: two wall boxes cover the inner corner square, so their top "
  + "and bottom faces are coincident there and z-fight into a hatched patch at some camera "
  + "angles. A ring of walls that tiles instead (w + thickness along x, d - thickness along z) "
  + "would close the gap and drop the overlap together."
);

assert.match(
  housePlanRendererSource,
  /if \(onSelectSurfaceTarget\) \{[\s\S]*?onSelectSurfaceTarget\(\{[\s\S]*?\}\);[\s\S]*?\} else \{\s*onSelectRoom\?\.\(target\.roomId\);\s*\}/,
  "A structure click should select either its surface target or its room, never both."
);

console.log("Editor 3D floor cutaway guardrails passed.");
