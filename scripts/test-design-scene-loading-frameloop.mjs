import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(
  path.join(
    process.cwd(),
    "components/editor/design-page/DesignSceneCanvas.tsx",
  ),
  "utf8",
);
const policySource = readFileSync(
  path.join(
    process.cwd(),
    "components/editor/design-page/designSceneDemandPolicy.tsx",
  ),
  "utf8",
);
const furnitureSource = readFileSync(
  path.join(
    process.cwd(),
    "components/scene/furniture/useFurnitureFiniteAnimations.ts",
  ),
  "utf8",
);
const exposureSource = readFileSync(
  path.join(
    process.cwd(),
    "components/editor/design-page/lighting/ExposureController.tsx",
  ),
  "utf8",
);
const performanceBridgeSource = readFileSync(
  path.join(process.cwd(), "components/scene/ScenePerformanceBridge.tsx"),
  "utf8",
);

assert.match(
  source,
  /opacity: state\.showSceneLoadingVeil \? 0 : 1/,
  "the loading veil must continue to make the scene canvas non-visible",
);
assert.match(
  policySource,
  /DESIGN_SCENE_FRAMELOOP = "demand"/,
  "the design canvas must render only when product state or controls invalidate it",
);
assert.match(source, /\{\.\.\.DESIGN_SCENE_DEMAND_PROPS\}/);
assert.doesNotMatch(
  `${source}\n${policySource}`,
  /frameloop=\{[^}]*"always"|frameloop="always"/,
  "the loaded design must not install a permanent render loop",
);
assert.match(
  source,
  /<OrbitControls[\s\S]*enabled=\{state\.controlsEnabled\}/,
  "interactive 3D controls must remain enabled by the existing product state",
);
assert.match(
  source,
  /<MapControls[\s\S]*enabled=\{state\.controlsEnabled\}/,
  "interactive 2D controls must remain enabled by the existing product state",
);
assert.match(
  policySource,
  /designSceneCameraMotionChanged[\s\S]*setSceneFiniteAnimationActive[\s\S]*requestSceneDemandFrame/,
  "camera damping must explicitly request bounded demand frames",
);
for (const kind of ["placement-scale", "locked-shake", "snap-bump"]) {
  assert.match(furnitureSource, new RegExp(kind));
}
assert.match(
  furnitureSource,
  /useFrame[\s\S]*requestFiniteFrame\(\)/,
  "item placement, shake, and snap animations must share finite invalidation",
);
assert.match(
  furnitureSource,
  /visibilityState === "visible"[\s\S]*snapBumpUntilRef\.current > 0[\s\S]*requestFiniteFrame\(\)/,
  "a hidden finite animation must request its terminal frame when visible again",
);
assert.match(
  furnitureSource,
  /if \(!interactive\) \{[\s\S]*placementStartRef\.current = null;[\s\S]*shakeUntilRef\.current = 0;[\s\S]*snapBumpUntilRef\.current = 0;/,
  "an inactive item owner must cancel every finite-animation clock",
);
assert.match(
  furnitureSource,
  /const startLockedShake = useCallback\(\(\) => \{\s*if \(!options\.interactive\) return;/,
  "an inactive item owner must not start a locked-item shake",
);
assert.match(
  exposureSource,
  /applyRendererLightingSettings[\s\S]*requestSceneDemandFrame\(invalidate\)/,
  "renderer exposure changes must request a demand frame",
);
assert.match(
  performanceBridgeSource,
  /if \(!enabled\) \{[\s\S]*return;[\s\S]*onFpsSample\(fps\);[\s\S]*onRendererSample\(/,
  "disabled performance sampling must not publish React state that re-invalidates the demand canvas",
);

console.log("CH-0029 demand-driven design-scene frameloop contract passed.");
