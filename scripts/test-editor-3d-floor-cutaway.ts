import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPageSource = fs.readFileSync(
  path.join(process.cwd(), "app", "design", "page.tsx"),
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

assert.match(
  designPageSource,
  /const EDITOR_3D_MAX_POLAR_ANGLE = Math\.PI - 0\.02;/,
  "3D orbit controls should allow underside rotation for inspection."
);

assert.match(
  designPageSource,
  /maxPolarAngle=\{EDITOR_3D_MAX_POLAR_ANGLE\}/,
  "3D OrbitControls should use the named maximum polar angle guardrail."
);

assert.match(
  roomEnvironmentSource,
  /const floorVisible = camera\.position\.y > -slabThickness \* 0\.35;/,
  "Single-room floors should hide when the camera moves beneath the slab."
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
  housePlanRendererSource,
  /floorWorldY: number;/,
  "Whole-home floors should account for stacked-floor world height."
);

assert.match(
  housePlanRendererSource,
  /const floorVisible = camera\.position\.y > floorWorldY - slabThickness \* 0\.35;/,
  "Whole-home floors should hide only when the camera is beneath that floor."
);

assert.match(
  housePlanRendererSource,
  /floorSurfaceRef\.current\.visible = floorVisible;/,
  "Whole-home floor surface visibility should follow the underside cutaway."
);

assert.match(
  housePlanRendererSource,
  /floorBandRef\.current\.visible = floorVisible;/,
  "Whole-home slab edge visibility should follow the underside cutaway."
);

console.log("Editor 3D floor cutaway guardrails passed.");
