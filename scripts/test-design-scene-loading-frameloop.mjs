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

assert.match(
  source,
  /opacity: state\.showSceneLoadingVeil \? 0 : 1/,
  "the loading veil must continue to make the scene canvas non-visible",
);
assert.match(
  source,
  /const DESIGN_SCENE_FRAMELOOP = "demand";[\s\S]*frameloop=\{DESIGN_SCENE_FRAMELOOP\}/,
  "the design canvas must render only when product state or controls invalidate it",
);
assert.doesNotMatch(
  source,
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

console.log("CH-0029 demand-driven design-scene frameloop contract passed.");
