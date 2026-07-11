import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  CABINET_PREVIEW_CAMERA_FOV_DEGREES,
  resolveCabinetPreviewCameraPose,
} from "@/features/cabinetry/previewCamera";
import { generateCabinetParts } from "@/features/cabinetry/generateCabinetParts";
import { getCabinetVisiblePreviewParts } from "@/features/cabinetry/previewParts";
import { CABINET_PREVIEW_RENDERING_POLICY } from "@/features/cabinetry/previewRenderingPolicy";
import { createCabinetPreset } from "@/features/cabinetry/presets";

assert.equal(
  CABINET_PREVIEW_RENDERING_POLICY.shadowMapsEnabled,
  false,
  "the compact Studio preview must not enable a directional shadow map",
);
assert.equal(
  CABINET_PREVIEW_RENDERING_POLICY.directionalLightCastsShadow,
  false,
  "the Studio preview light must not cast self-shadows onto cabinet parts",
);

const frontPose = resolveCabinetPreviewCameraPose("front", 900, 720, 580);
const tallFrontPose = resolveCabinetPreviewCameraPose("front", 1200, 2400, 620);
const narrowRunFrontPose = resolveCabinetPreviewCameraPose("front", 2400, 720, 580, 0.65);
const squareRunFrontPose = resolveCabinetPreviewCameraPose("front", 2400, 720, 580, 1);
const perspectivePose = resolveCabinetPreviewCameraPose("perspective", 900, 720, 580);
const sidePose = resolveCabinetPreviewCameraPose("side", 900, 720, 580);
const topPose = resolveCabinetPreviewCameraPose("top", 900, 720, 580);
const tallTopPose = resolveCabinetPreviewCameraPose("top", 1800, 2400, 600);
assert(
  frontPose.position[2] < 0,
  "the named Front view must approach the negative-Z cabinet-front side",
);
assert(
  perspectivePose.position[2] < 0,
  "the default perspective view must expose cabinet fronts rather than backs",
);
assert(
  Math.abs(tallFrontPose.position[2]) >= 2400 / 1000 * 1.5,
  "the named Front view should leave framing room around tall cabinets",
);
assert(
  Math.abs(narrowRunFrontPose.position[2]) > Math.abs(squareRunFrontPose.position[2]),
  "the named Front view should move back to fit wide runs in narrow preview panes",
);
assert.equal(CABINET_PREVIEW_CAMERA_FOV_DEGREES, 42, "preview fit math should match the Canvas FOV");
assert(sidePose.position[0] > 0 && sidePose.position[2] === 0, "Side view pose should remain stable");
assert(topPose.position[1] > 0 && topPose.up[2] === -1, "Top view pose should remain stable");
assert(
  tallTopPose.position[1] - tallTopPose.target[1] >= 2400 / 2000 + 3.2,
  "Top view fit distance should start above the cabinet surface, not its center",
);

const baseDefinition = createCabinetPreset("base", "preview-rendering-base");
const baseGeneratedParts = generateCabinetParts(baseDefinition);
assert(
  baseGeneratedParts.some((part) => part.type === "drawer_slide_pair"),
  "drawer slides must remain in generated fabrication and BOM source parts",
);
assert(
  getCabinetVisiblePreviewParts(baseDefinition, baseGeneratedParts).every(
    (part) => part.type !== "drawer_slide_pair",
  ),
  "concealed drawer-slide markers must not z-fight with visible drawer fronts",
);

const wallDefinition = createCabinetPreset("wall", "preview-rendering-wall");
const wallGeneratedParts = generateCabinetParts(wallDefinition);
assert(
  wallGeneratedParts.some((part) => part.type === "door_hinge_pair"),
  "door hinges must remain in generated fabrication and BOM source parts",
);
assert(
  getCabinetVisiblePreviewParts(wallDefinition, wallGeneratedParts).every(
    (part) => part.type !== "door_hinge_pair",
  ),
  "concealed hinge markers must not appear outside closed cabinet fronts",
);

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8",
);
const sceneItemSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetSceneItem.tsx"),
  "utf8",
);
const qaRunbookSource = readFileSync(
  resolve(process.cwd(), "docs/qa/cabinetry-studio-mvp.md"),
  "utf8",
);
const previewStart = studioSource.indexOf("function CabinetPreview3D(");
const previewEnd = studioSource.indexOf("export default function CabinetryStudio(");
assert(previewStart >= 0 && previewEnd > previewStart, "CabinetPreview3D source block should exist");
const previewSource = studioSource.slice(previewStart, previewEnd);

assert.match(
  previewSource,
  /shadows=\{CABINET_PREVIEW_RENDERING_POLICY\.shadowMapsEnabled\}/,
  "CabinetPreview3D should apply the tested shadow-map policy to Canvas",
);
assert.match(
  previewSource,
  /data-front-axis="negative-z"/,
  "CabinetPreview3D should expose its tested cabinet-front coordinate convention",
);
assert.match(
  previewSource,
  /castShadow=\{CABINET_PREVIEW_RENDERING_POLICY\.directionalLightCastsShadow\}/,
  "CabinetPreview3D should apply the tested cast-shadow policy to its directional light",
);
assert.doesNotMatch(
  previewSource,
  /<directionalLight[^>]*\scastShadow(?:\s|\/>|>)/s,
  "CabinetPreview3D must not reintroduce a bare castShadow flag",
);
assert.match(
  previewSource,
  /<ambientLight intensity=\{0\.48\} \/>/,
  "ambient material lighting should remain enabled",
);
assert.match(
  previewSource,
  /<directionalLight[\s\S]*?intensity=\{1\.15\}/,
  "directional material lighting should remain enabled",
);
assert.match(
  previewSource,
  /<directionalLight[\s\S]*?position=\{\[3, 5, -4\]\}/,
  "the directional key light should illuminate negative-Z cabinet fronts",
);
assert.match(
  previewSource,
  /<OrbitControls[\s\S]*?enabled=\{view === "perspective"\}/,
  "fixed Front, Side, and Top views must not be overwritten by orbit-control state",
);
const highlightStart = sceneItemSource.indexOf('viewMode === "3d" && highlightBounds');
const selectedStart = sceneItemSource.indexOf("{selected ?", highlightStart);
assert(highlightStart >= 0 && selectedStart > highlightStart, "selection highlight source should exist");
const highlightSource = sceneItemSource.slice(highlightStart, selectedStart);
assert.match(highlightSource, /opacity=\{0\}/, "module selection should render as an outline only");
assert.match(
  highlightSource,
  /depthWrite=\{false\}/,
  "module selection must not write a coplanar surface into the depth buffer",
);
assert.match(
  highlightSource,
  /colorWrite=\{false\}/,
  "module selection must not tint or z-fight with cabinet surfaces",
);
assert.match(
  qaRunbookSource,
  /all six Recommended templates in Chrome and Safari/,
  "the RC runbook should retain the cross-browser six-template regression check",
);
assert.match(
  qaRunbookSource,
  /Front, Side, and Top views—and the 3D view while orbiting/,
  "the RC runbook should cover every fixed view plus an orbitable 3D view",
);
assert.match(
  qaRunbookSource,
  /intended cabinet surfaces, continuous materials, and no repeated triangular surface artifacts/,
  "the RC runbook should verify both front orientation and clean material rendering",
);

console.log(
  "Cabinetry preview rendering policy checks passed: material lighting remains enabled and shadow-map acne is disabled.",
);
