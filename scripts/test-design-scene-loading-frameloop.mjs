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
  /const loadingFrameloop = \([^)]+\) => showSceneLoadingVeil \? "demand" : "always";[\s\S]*frameloop=\{loadingFrameloop\(state\.showSceneLoadingVeil\)\}/,
  "a non-visible loading canvas must render only on invalidation",
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

console.log("CH-0029 hidden-scene frameloop contract passed.");
