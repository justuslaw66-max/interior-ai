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
import { disposeCabinetObject3DResources } from "../features/cabinetry/hooks/useCabinetSceneResourceOwnership";
import {
  CabinetTextureCache,
  type CabinetTextureLoader,
} from "../features/cabinetry/cabinetLaminateTextures";
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
const scenePreviewEdgesSource = readFileSync(
  resolve(
    root,
    "features/cabinetry/components/cabinetScenePreviewEdges.ts"
  ),
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
  previewRendererSource,
  /<Canvas\s+frameloop="demand"[\s\S]*?data-frameloop="demand"/,
  "Cabinet Preview must render on demand so a settled preview stops redrawing."
);
assert.match(
  previewRendererSource,
  /<Canvas[\s\S]*?gl=\{\{(?:(?!\}\})[\s\S])*?preserveDrawingBuffer:\s*true,/,
  "Cabinet Preview must keep its last frame in the drawing buffer so page snapshots never paint a settled canvas as empty."
);
assert.match(
  previewRendererSource,
  /frameCountRef\.current < 3\) \{\s*(?:\/\/[^\n]*\n\s*)*invalidate\(\);\s*return;/,
  "On-demand readiness must request each frame it counts."
);
assert.match(
  resourceOwnershipSource,
  /attachCabinetMaterialTexture\(assembly, materialRef\.id, texture\);[\s\S]*?invalidate\(\);/,
  "A texture that arrives after the scene settled must request a frame."
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
  /useLayoutEffect\(\(\) => \{[\s\S]*?acquireCabinetLaminateTexture\([\s\S]*?return \(\) => releases\.forEach\(\(release\) => release\(\)\);/,
  "A rebuilt cabinet must lease its laminate pictures before its first frame and release every lease on change or unmount."
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

assert.match(cameraSource, /fitDistanceForPlane/, "Named views must use FOV-aware fitting.");
assert.match(
  scenePreviewEdgesSource,
  /PREVIEW_FRONT_EDGE_PART_TYPES[\s\S]*?"door_front"[\s\S]*?"drawer_front"/,
  "Preview separation edges must be limited to door and drawer fronts."
);
assert.match(
  scenePreviewEdgesSource,
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

void checkCabinetTextureCache()
  .then(() => console.log("Cabinet Preview renderer policy checks passed."))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

/** The page's shared laminate pictures (features/cabinetry/cabinetLaminateTextures.ts). */
async function checkCabinetTextureCache() {
  const pending = new Map<string, { onLoad: (texture: THREE.Texture) => void; onError: () => void }>();
  const loads: string[] = [];
  const load: CabinetTextureLoader = (url, onLoad, onError) => {
    loads.push(url);
    pending.set(url, { onLoad, onError });
  };
  const disposed: string[] = [];
  const watchDisposal = (texture: THREE.Texture, label: string) => {
    texture.dispose = () => {
      disposed.push(label);
    };
    return texture;
  };
  const arrive = (url: string) => {
    const texture = watchDisposal(new THREE.Texture(), url);
    pending.get(url)!.onLoad(texture);
    pending.delete(url);
    return texture;
  };
  const settle = () => new Promise<void>((done) => queueMicrotask(done));
  const view = 1;
  const otherView = 2;
  const cache = new CabinetTextureCache(load, 2);

  // A cabinet's first lease waits for the picture; the picture is set up to repeat in sRGB.
  const attached: THREE.Texture[] = [];
  const releaseFirst = cache.acquire("oak", view, (texture) => attached.push(texture));
  assert.equal(attached.length, 0, "A picture that is still loading must not be attached yet.");
  const oak = arrive("oak");
  assert.deepEqual(attached, [oak], "A picture must be attached when it arrives.");
  assert.equal(oak.colorSpace, THREE.SRGBColorSpace);
  assert.equal(oak.wrapS, THREE.RepeatWrapping);
  assert.equal(oak.wrapT, THREE.RepeatWrapping);

  // A rebuild releases the old cabinet's lease and takes a new one in the same commit: the picture
  // is attached at once, before the rebuilt cabinet's first frame, and isn't loaded again.
  releaseFirst();
  const rebuilt: THREE.Texture[] = [];
  const releaseRebuilt = cache.acquire("oak", view, (texture) => rebuilt.push(texture));
  assert.deepEqual(rebuilt, [oak], "A rebuilt cabinet must get its loaded picture at once, within the lease.");
  await settle();
  // The growing lists are compared as copies: strict deepEqual narrows the value it checks, and a
  // narrowed list would fail next build's type check where it is read again.
  assert.deepEqual([...loads], ["oak"], "A loaded picture must not be loaded again.");
  assert.deepEqual([...disposed], []);

  // Unused pictures stay for a quick return, until there are more than the cache's size; the least
  // recently used goes first, and a picture in use never does.
  const releaseWalnut = cache.acquire("walnut", view, () => undefined);
  arrive("walnut");
  releaseWalnut();
  releaseRebuilt();
  const releaseAsh = cache.acquire("ash", view, () => undefined);
  arrive("ash");
  await settle();
  assert.deepEqual([...disposed], ["walnut"], "The least recently used unused picture must be disposed first.");
  const releaseElm = cache.acquire("elm", view, () => undefined);
  await settle();
  assert.deepEqual([...disposed], ["walnut", "oak"]);
  assert.equal(cache.size(), 2, "Pictures in use must stay, even past the cache's size.");

  // A cabinet released before its picture arrives is never called; a picture whose entry was
  // disposed while it loaded is disposed when it arrives.
  const lateCalls: THREE.Texture[] = [];
  const releaseLate = cache.acquire("teak", view, (texture) => lateCalls.push(texture));
  releaseLate();
  releaseAsh();
  releaseElm();
  await settle();
  arrive("teak");
  assert.deepEqual(lateCalls, [], "A released lease must never be attached.");
  assert.ok(disposed.includes("teak"), "A picture whose entry was disposed while it loaded must be disposed.");

  // Past the cache's size, a rebuild still finds its picture: pruning waits until the rebuilt
  // cabinet has leased it again.
  const fullCache = new CabinetTextureCache(load, 1);
  const releaseMaple = fullCache.acquire("maple", view, () => undefined);
  const maple = arrive("maple");
  fullCache.acquire("cherry", view, () => undefined);
  arrive("cherry");
  releaseMaple();
  const rebuiltMaple: THREE.Texture[] = [];
  fullCache.acquire("maple", view, (texture) => rebuiltMaple.push(texture));
  await settle();
  assert.deepEqual(rebuiltMaple, [maple], "A rebuild past the cache's size must keep its picture.");
  assert.equal(loads.filter((url) => url === "maple").length, 1);
  assert.ok(!disposed.includes("maple") && !disposed.includes("cherry"), "Pictures in use must never be disposed.");
  assert.equal(fullCache.size(), 2);

  // Releasing a lease twice releases only that lease.
  const twiceCache = new CabinetTextureCache(load, 1);
  const releaseTwice = twiceCache.acquire("fir", view, () => undefined);
  twiceCache.acquire("fir", view, () => undefined);
  arrive("fir");
  releaseTwice();
  releaseTwice();
  twiceCache.acquire("yew", view, () => undefined);
  arrive("yew");
  await settle();
  assert.ok(!disposed.includes("fir"), "Releasing a lease twice must not release another cabinet's lease.");

  // Two cabinets wait for one picture and one of them goes: only the other gets it, even when both
  // passed the same callback.
  const shared = new CabinetTextureCache(load, 4);
  const gone: THREE.Texture[] = [];
  const staying: THREE.Texture[] = [];
  const releaseGone = shared.acquire("beech", view, (texture) => gone.push(texture));
  shared.acquire("beech", view, (texture) => staying.push(texture));
  releaseGone();
  const beech = arrive("beech");
  assert.deepEqual(gone, [], "A cabinet released before its picture arrives must not get it.");
  assert.deepEqual(staying, [beech]);
  const sameCallback: THREE.Texture[] = [];
  const attachTwice = (texture: THREE.Texture) => sameCallback.push(texture);
  const releaseOneOfTwo = shared.acquire("larch", view, attachTwice);
  shared.acquire("larch", view, attachTwice);
  releaseOneOfTwo();
  const larch = arrive("larch");
  assert.deepEqual(sameCallback, [larch], "Each lease must stand alone, even with the same callback.");

  // Another 3D view gets its own copy of a loaded picture at once, sharing its image: nothing is
  // loaded again, and disposing one view's copy leaves the other's.
  const views = new CabinetTextureCache(load, 1);
  const releaseRoom = views.acquire("pine", view, () => undefined);
  const pine = arrive("pine");
  const previewCopies: THREE.Texture[] = [];
  const releasePreview = views.acquire("pine", otherView, (texture) => previewCopies.push(texture));
  assert.equal(previewCopies.length, 1, "Another view must get a loaded picture at once.");
  const previewPine = watchDisposal(previewCopies[0]!, "pine (preview)");
  assert.notEqual(previewPine, pine, "Each view must get its own copy of a picture.");
  assert.equal(previewPine.source, pine.source, "A view's copy must share the loaded image.");
  assert.equal(previewPine.colorSpace, THREE.SRGBColorSpace);
  assert.equal(previewPine.wrapS, THREE.RepeatWrapping);
  assert.equal(loads.filter((url) => url === "pine").length, 1, "Another view's copy must not load the picture again.");
  releasePreview();
  await settle();
  assert.ok(disposed.includes("pine (preview)"), "A closed view's copy must be disposed like any unused picture.");
  assert.ok(!disposed.includes("pine"), "Disposing one view's copy must leave the other view's.");

  // A picture that fails leaves the plain colour; the next cabinet to ask loads it again.
  const failed: THREE.Texture[] = [];
  views.acquire("broken", view, (texture) => failed.push(texture));
  pending.get("broken")!.onError();
  pending.delete("broken");
  assert.deepEqual(failed, []);
  views.acquire("broken", view, () => undefined);
  assert.equal(loads.filter((url) => url === "broken").length, 2, "A failed picture must be tried again.");

  // The page leaving disposes every picture, in use or not.
  views.clear();
  assert.ok(disposed.includes("pine"), "Clearing must dispose pictures in use.");
  assert.equal(views.size(), 0);
  releaseRoom();
}
