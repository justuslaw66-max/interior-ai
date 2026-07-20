import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as THREE from "three";

import { CABINET_MATERIALS } from "../features/cabinetry/catalog/materials";
import {
  CABINET_PREVIEW_FRONT_EDGE_OFFSET_M,
  createCabinetPreviewFrontEdgePositions,
  resolveCabinetPreviewFrontEdgeStyle,
} from "../features/cabinetry/components/CabinetSceneItem";
import { resolveCabinetPreviewCameraPose } from "../features/cabinetry/components/CabinetPreviewCameraController";
import { generateCabinetParts } from "../features/cabinetry/generateCabinetParts";
import {
  disposeCabinetObject3DResources,
  disposeCabinetOwnedTextures,
} from "../features/cabinetry/hooks/useCabinetSceneResourceOwnership";
import { createCabinetPreset } from "../features/cabinetry/presets";

const root = process.cwd();
const studioSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const guidedViewSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudioGuidedView.tsx"),
  "utf8"
);
const detailedViewSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudioDetailedView.tsx"),
  "utf8"
);
const studioCompositionSource =
  `${studioSource}\n${guidedViewSource}\n${detailedViewSource}`;
const previewSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetPreview3D.tsx"),
  "utf8"
);
const previewRendererSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetPreviewRenderer3D.tsx"),
  "utf8"
);
const previewSceneSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetPreviewScene3D.tsx"),
  "utf8"
);
const detailedPreviewsSource = readFileSync(
  resolve(
    root,
    "features/cabinetry/components/CabinetStudioDetailedPreviews.tsx"
  ),
  "utf8"
);
const previewInteractionSource = readFileSync(
  resolve(
    root,
    "features/cabinetry/components/CabinetStudioPreviewInteractionController.tsx"
  ),
  "utf8"
);
const cameraSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetPreviewCameraController.tsx"),
  "utf8"
);
const sceneItemSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetSceneItem.tsx"),
  "utf8"
);
const resourceOwnershipSource = readFileSync(
  resolve(root, "features/cabinetry/hooks/useCabinetSceneResourceOwnership.ts"),
  "utf8"
);
const designItemPlanSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetDesignItemPlan2D.tsx"),
  "utf8"
);
const designItemSpatialSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetDesignItemSpatial3D.tsx"),
  "utf8"
);
const sceneItemsLayerSource = readFileSync(
  resolve(root, "components/editor/design-page/SceneItemsLayer.tsx"),
  "utf8"
);

assert.match(
  previewRendererSource,
  /<Canvas[\s\S]*?data-cabinet-preview-renderer="rc5"[\s\S]*?data-shadow-maps-enabled="false"[\s\S]*?data-front-axis="negative-z"[\s\S]*?shadows=\{false\}[\s\S]*?outputColorSpace:\s*THREE\.SRGBColorSpace[\s\S]*?toneMapping:\s*THREE\.ACESFilmicToneMapping/,
  "Cabinet Preview must keep shadow maps disabled with sRGB output and ACES tone mapping."
);
assert.match(
  previewSource,
  /<CabinetPreviewRenderer3D[\s\S]*?<CabinetPreviewScene3D/,
  "The preview adapter must compose separate runtime and scene boundaries."
);
assert.doesNotMatch(
  previewSource,
  /<Canvas|useFrame\(|useThree\(|<Environment|<OrbitControls/,
  "The preview adapter must not regain Canvas, render-loop, or scene-detail ownership."
);
assert.match(
  studioSource,
  /import \{ useCabinetDesktopPreviewActive \} from "\.\/CabinetPreview3D"/,
  "The coordinator must retain responsive preview lifecycle ownership."
);
assert.match(
  guidedViewSource,
  /import \{ CabinetPreview3D \} from "\.\/CabinetPreview3D"/,
  "The Guided view must compose its extracted preview boundary."
);
assert.doesNotMatch(
  studioCompositionSource,
  /<Canvas|useFrame\(|useThree\(/,
  "The studio composition must not regain direct ownership of the 3D renderer."
);
assert.match(
  detailedPreviewsSource,
  /data-testid="cabinet-preview"[\s\S]*?data-shadow-maps-enabled="false"[\s\S]*?data-front-axis="negative-z"[\s\S]*?data-render-color-space="srgb"[\s\S]*?data-tone-mapping="aces-filmic"/,
  "The Cabinet Preview container must expose its verified runtime renderer policy."
);
assert.match(
  previewRendererSource,
  /data-preview-definition-id=\{definitionId\}[\s\S]*?data-preview-preset-id=\{presetId \?\? ""\}[\s\S]*?data-preview-view=\{view\}[\s\S]*?data-preview-ready=\{previewReady \? "true" : "false"\}[\s\S]*?<CabinetPreviewReadySignal/,
  "Every Cabinet Preview canvas must expose a frame-backed definition/view readiness signal."
);
assert.match(
  guidedViewSource,
  /mobilePreviewOpen && desktopPreviewActive === false[\s\S]*?desktopPreviewActive: desktopPreviewActive === true/,
  "The Guided view must preserve responsive preview ownership."
);
assert.match(
  detailedPreviewsSource,
  /!desktopPreviewActive \? \([\s\S]*?<CabinetPreview3D/,
  "The compact detailed preview must mount only when the desktop preview is inactive."
);
assert.match(
  previewInteractionSource,
  /const preview = desktopPreviewActive \? \([\s\S]*?<CabinetPreview3D/,
  "The desktop interaction controller must mount only the active Canvas tree."
);
assert.match(
  previewSceneSource,
  /<Environment\s+resolution=\{128\}>[\s\S]*?<Lightformer[\s\S]*?<hemisphereLight[\s\S]*?<directionalLight/,
  "Cabinet Preview must use its deterministic procedural environment and no-shadow light rig."
);
assert.doesNotMatch(
  previewSceneSource,
  /<ambientLight|castShadow(?!=\{false\})/,
  "Cabinet Preview must not restore ambient wash or shadow-casting lights."
);
assert.match(
  previewRendererSource,
  /useFrame\(\(\) =>[\s\S]*?frameCountRef\.current < 3[\s\S]*?onReady\(previewKey\)/,
  "The render loop must remain limited to frame-backed readiness reporting."
);
assert.doesNotMatch(
  previewRendererSource,
  /price|checkout|permission|subscription|authentication|persistence/i,
  "The preview render loop must not own business policy."
);
assert.match(
  designItemPlanSource,
  /projectSceneRoomItem\(sceneEntry, "plan"\)[\s\S]*?viewMode="2d"/,
  "The placed-cabinet plan adapter must own only plan projection and 2D mapping."
);
assert.match(
  designItemSpatialSource,
  /projectSceneRoomItem\(sceneEntry, "spatial"\)[\s\S]*?viewMode="3d"/,
  "The placed-cabinet spatial adapter must own only spatial projection and 3D mapping."
);
assert.match(
  sceneItemsLayerSource,
  /configuration\.viewMode === "3d"[\s\S]*?CabinetDesignItemSpatial3D[\s\S]*?: CabinetDesignItemPlan2D/,
  "The generic scene layer must dispatch to distinct cabinet 2D and 3D adapters."
);
for (const rendererAdapterSource of [designItemPlanSource, designItemSpatialSource]) {
  assert.doesNotMatch(
    rendererAdapterSource,
    /price|checkout|permission|subscription|authentication|persistence|localStorage|fetch\s*\(/i,
    "Placed-cabinet render adapters must not own business or persistence policy."
  );
}
assert.match(
  sceneItemSource,
  /useCabinetSceneResourceOwnership\(\{[\s\S]*?assembly,[\s\S]*?previewFrontEdges,[\s\S]*?materials: definition\.materials/,
  "Cabinet scene items must delegate owned Three.js cleanup to the lifecycle hook."
);
assert.doesNotMatch(
  sceneItemSource,
  /new THREE\.TextureLoader\(|\.geometry\?\.dispose\(|loadedTextures/,
  "Cabinet scene rendering must not duplicate resource lifecycle implementation."
);
assert.match(
  resourceOwnershipSource,
  /let cancelled = false[\s\S]*?if \(cancelled\)[\s\S]*?texture\.dispose\(\)[\s\S]*?return \(\) => \{[\s\S]*?cancelled = true[\s\S]*?disposeCabinetOwnedTextures\(loadedTextures\)/,
  "Texture loading must dispose late results and all textures owned by the mounted scene item."
);

const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
const sharedMaterial = new THREE.MeshStandardMaterial();
let geometryDisposeCount = 0;
let materialDisposeCount = 0;
sharedGeometry.dispose = () => {
  geometryDisposeCount += 1;
};
sharedMaterial.dispose = () => {
  materialDisposeCount += 1;
};
const ownedGroup = new THREE.Group();
ownedGroup.add(
  new THREE.Mesh(sharedGeometry, sharedMaterial),
  new THREE.Mesh(sharedGeometry, sharedMaterial)
);
disposeCabinetObject3DResources(ownedGroup);
assert.equal(geometryDisposeCount, 1, "Shared cabinet geometry must be disposed exactly once.");
assert.equal(materialDisposeCount, 1, "Shared cabinet material must be disposed exactly once.");

const ownedTexture = new THREE.Texture();
let textureDisposeCount = 0;
ownedTexture.dispose = () => {
  textureDisposeCount += 1;
};
disposeCabinetOwnedTextures([ownedTexture, ownedTexture]);
assert.equal(textureDisposeCount, 1, "Each owned cabinet texture must be disposed exactly once.");
assert.match(cameraSource, /fitDistanceForPlane/, "Named views must use FOV-aware fitting.");
assert.match(
  sceneItemSource,
  /PREVIEW_FRONT_EDGE_PART_TYPES[\s\S]*?"door_front"[\s\S]*?"drawer_front"/,
  "Preview separation edges must be limited to door and drawer fronts."
);
assert.match(
  sceneItemSource,
  /sourceType:\s*"cabinet_preview_front_edge"[\s\S]*?previewOnly:\s*true/,
  "Front separation edges must remain explicitly preview-only."
);
assert.match(
  sceneItemSource,
  /<meshBasicMaterial\s+transparent\s+opacity=\{0\}\s+colorWrite=\{false\}\s+depthWrite=\{false\}/,
  "The assembly selection outline must not write an invisible filled box into the depth buffer."
);
assert.doesNotMatch(
  sceneItemSource,
  /highlightBounds[\s\S]*?<meshBasicMaterial[^>]*opacity=\{0\.06\}/,
  "Module and part selection bounds must not restore a coplanar filled overlay."
);

const matteBlack = CABINET_MATERIALS.find(
  (material) => material.id === "matte_black_laminate"
);
assert(matteBlack, "The released matte black laminate must remain available.");
assert.equal(matteBlack.color, "#1f2326", "RC-5 must preserve the matte black base color.");
assert.equal(matteBlack.roughness, 0.84, "RC-5 must preserve matte black roughness.");
assert(
  resolveCabinetPreviewFrontEdgeStyle(matteBlack.color).opacity >= 0.5,
  "Dark fronts must receive a readable but line-only preview edge."
);

const wardrobe = createCabinetPreset("wardrobe", "preview-renderer-policy");
const wardrobeParts = generateCabinetParts(wardrobe);
const frontParts = wardrobeParts.filter(
  (part) => part.type === "door_front" || part.type === "drawer_front"
);
assert(frontParts.length > 0, "The Wardrobe fixture must include front parts.");
for (const part of frontParts) {
  const positions = createCabinetPreviewFrontEdgePositions(part);
  assert(positions, `${part.id} must receive a preview seam outline.`);
  assert.equal(positions.length, 24, "A front outline must contain exactly four line segments.");
  const zCoordinates = Array.from(positions).filter((_, index) => index % 3 === 2);
  const expectedZ = part.position.z / 1000 - CABINET_PREVIEW_FRONT_EDGE_OFFSET_M;
  assert(
    zCoordinates.every((coordinate) => Math.abs(coordinate - expectedZ) < 1e-6),
    "Front outlines must use one fixed outward Z plane without rear/depth edges."
  );
}
const hardwarePart = wardrobeParts.find((part) => part.type === "handle");
assert(hardwarePart, "The Wardrobe fixture must include edge-pull hardware.");
assert.equal(
  createCabinetPreviewFrontEdgePositions(hardwarePart),
  null,
  "Preview seam outlines must never be added to hardware."
);

const wardrobeAspect = 0.82;
const wardrobeFov = 42;
const widthM = wardrobe.totalWidth / 1000;
const heightM = wardrobe.height / 1000;
const depthM = wardrobe.depth / 1000;
const halfVerticalSpan = Math.tan((wardrobeFov * Math.PI) / 360);
const frontPose = resolveCabinetPreviewCameraPose({
  view: "front",
  widthMm: wardrobe.totalWidth,
  heightMm: wardrobe.height,
  depthMm: wardrobe.depth,
  verticalFovDeg: wardrobeFov,
  aspect: wardrobeAspect,
});
assert(frontPose.position[2] < 0, "Front must remain on the verified negative-Z axis.");
const frontSurfaceDistance = Math.abs(frontPose.position[2]) - depthM / 2;
assert(
  frontSurfaceDistance * halfVerticalSpan >= (heightM * 1.14) / 2,
  "Front must fit Wardrobe height with the RC-5 framing margin."
);
assert(
  frontSurfaceDistance * halfVerticalSpan * wardrobeAspect >= (widthM * 1.14) / 2,
  "Front must fit Wardrobe width at the preview aspect ratio."
);
const topPose = resolveCabinetPreviewCameraPose({
  view: "top",
  widthMm: wardrobe.totalWidth,
  heightMm: wardrobe.height,
  depthMm: wardrobe.depth,
  verticalFovDeg: wardrobeFov,
  aspect: wardrobeAspect,
});
assert(
  topPose.position[1] > heightM,
  "Top eye must sit above the cabinet, with distance added to targetY."
);
const topSurfaceDistance = topPose.position[1] - heightM;
assert(
  topSurfaceDistance * halfVerticalSpan >= (depthM * 1.14) / 2,
  "Top must fit cabinet depth with the RC-5 framing margin."
);
assert(
  topSurfaceDistance * halfVerticalSpan * wardrobeAspect >= (widthM * 1.14) / 2,
  "Top must fit cabinet width at the preview aspect ratio."
);

console.log("Cabinet Preview renderer policy checks passed.");
