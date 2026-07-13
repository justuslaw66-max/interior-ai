import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { CABINET_MATERIALS } from "../features/cabinetry/catalog/materials";
import {
  CABINET_PREVIEW_FRONT_EDGE_OFFSET_M,
  createCabinetPreviewFrontEdgePositions,
  resolveCabinetPreviewFrontEdgeStyle,
} from "../features/cabinetry/components/CabinetSceneItem";
import { resolveCabinetPreviewCameraPose } from "../features/cabinetry/components/CabinetPreviewCameraController";
import { generateCabinetParts } from "../features/cabinetry/generateCabinetParts";
import { createCabinetPreset } from "../features/cabinetry/presets";

const root = process.cwd();
const studioSource = readFileSync(
  resolve(root, "features/cabinetry/components/CabinetryStudio.tsx"),
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

assert.match(
  studioSource,
  /<Canvas[\s\S]*?data-cabinet-preview-renderer="rc5"[\s\S]*?data-shadow-maps-enabled="false"[\s\S]*?data-front-axis="negative-z"[\s\S]*?shadows=\{false\}[\s\S]*?outputColorSpace:\s*THREE\.SRGBColorSpace[\s\S]*?toneMapping:\s*THREE\.ACESFilmicToneMapping/,
  "Cabinet Preview must keep shadow maps disabled with sRGB output and ACES tone mapping."
);
assert.match(
  studioSource,
  /data-testid="cabinet-preview"[\s\S]*?data-shadow-maps-enabled="false"[\s\S]*?data-front-axis="negative-z"[\s\S]*?data-render-color-space="srgb"[\s\S]*?data-tone-mapping="aces-filmic"/,
  "The Cabinet Preview container must expose its verified runtime renderer policy."
);
assert.match(
  studioSource,
  /data-preview-definition-id=\{definition\.id\}[\s\S]*?data-preview-preset-id=\{definition\.sourcePresetId \?\? ""\}[\s\S]*?data-preview-view=\{view\}[\s\S]*?data-preview-ready=\{previewReady \? "true" : "false"\}[\s\S]*?<CabinetPreviewReadySignal/,
  "Every Cabinet Preview canvas must expose a frame-backed definition/view readiness signal."
);
assert.match(
  studioSource,
  /mobilePreviewOpen && desktopPreviewActive === false[\s\S]*?desktopPreviewActive === true[\s\S]*?desktopPreviewActive === false[\s\S]*?desktopPreviewActive === true/,
  "Responsive Cabinet Preview layouts must mount only the active Canvas tree."
);
assert.match(
  studioSource,
  /<Environment\s+resolution=\{128\}>[\s\S]*?<Lightformer[\s\S]*?<hemisphereLight[\s\S]*?<directionalLight/,
  "Cabinet Preview must use its deterministic procedural environment and no-shadow light rig."
);
assert.doesNotMatch(
  studioSource,
  /<ambientLight|castShadow(?!=\{false\})/,
  "Cabinet Preview must not restore ambient wash or shadow-casting lights."
);
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
