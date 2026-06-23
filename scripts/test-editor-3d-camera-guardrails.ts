import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPagePath = path.join(process.cwd(), "app", "design", "page.tsx");
const source = fs.readFileSync(designPagePath, "utf8");

assert.match(
  source,
  /const EDITOR_3D_MIN_POLAR_ANGLE = 0\.08;/,
  "3D orbit controls should keep a small top-down buffer to avoid camera singularities."
);

assert.match(
  source,
  /const EDITOR_3D_MAX_POLAR_ANGLE = Math\.PI \/ 2 - 0\.04;/,
  "3D orbit controls must not allow the camera below the target/floor plane."
);

assert.match(
  source,
  /minPolarAngle=\{EDITOR_3D_MIN_POLAR_ANGLE\}/,
  "3D OrbitControls should use the named minimum polar angle guardrail."
);

assert.match(
  source,
  /maxPolarAngle=\{EDITOR_3D_MAX_POLAR_ANGLE\}/,
  "3D OrbitControls should use the named maximum polar angle guardrail."
);

assert.doesNotMatch(
  source,
  /maxPolarAngle=\{Math\.PI - 0\.02\}/,
  "3D OrbitControls must not allow underside orbiting beneath the floor."
);

console.log("Editor 3D camera guardrails passed.");
