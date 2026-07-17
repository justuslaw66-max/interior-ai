import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const designPageSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignPageWorkspace.tsx"
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
const roomEnvironmentSource = fs.readFileSync(
  path.join(process.cwd(), "components", "scene", "RoomEnvironment.tsx"),
  "utf8"
);
const housePlanRendererSource = fs.readFileSync(
  path.join(process.cwd(), "components", "editor", "renderers", "HousePlanRenderer3D.tsx"),
  "utf8"
);

assert.match(
  editorConfigurationSource,
  /EDITOR_3D_MAX_POLAR_ANGLE = Math\.PI - 0\.02;/,
  "3D orbit controls should allow underside rotation for inspection."
);

assert.match(
  designPageSource,
  /maxPolarAngle:\s*EDITOR_3D_MAX_POLAR_ANGLE/,
  "The design page should pass the named maximum polar angle guardrail to the Canvas shell."
);

assert.match(
  designSceneCanvasSource,
  /<OrbitControls[\s\S]*?maxPolarAngle=\{configuration\.orbit\.maxPolarAngle\}/,
  "The Canvas shell should apply its configured maximum polar angle to 3D OrbitControls."
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

assert.match(
  housePlanRendererSource,
  /floorPickEnabledRef\.current = floorVisible;/,
  "Hidden whole-home floors should also stop receiving pointer raycasts."
);

assert.match(
  housePlanRendererSource,
  /raycast=\{raycastFloorSurface\}/,
  "Whole-home floor selection should use the visibility-aware raycast."
);

assert.match(
  housePlanRendererSource,
  /pickEnabledRef\.current = shouldRender;/,
  "Cutaway wall visibility should also control wall pointer raycasts."
);

assert.match(
  housePlanRendererSource,
  /raycast=\{raycastWhenPickable\}/,
  "Wall surfaces should use the cutaway-aware raycast."
);

assert.match(
  housePlanRendererSource,
  /openingPickEnabledRef\.current = camera\.position\.y >= floorWorldY - 0\.02;/,
  "Opening hit proxies should not intercept pointer rays from below their floor."
);

assert.match(
  housePlanRendererSource,
  /const ceilingWorldY = floorWorldY \+ wallHeight;/,
  "Ceiling selection should account for the stacked-floor world offset."
);

assert.match(
  housePlanRendererSource,
  /if \(raycaster\.ray\.direction\.y <= 0\.001\) return;/,
  "Ceiling caps should accept only upward pointer rays from the underside."
);

assert.match(
  housePlanRendererSource,
  /const canPickCeilingCap = camera\.position\.y < ceilingWorldY - 0\.005;/,
  "Ceiling caps should stop rendering and receiving hits above the ceiling plane."
);

assert.match(
  housePlanRendererSource,
  /<RoomCeilingCapMesh[\s\S]*?floorWorldY=\{floorYOffset\}/,
  "Each room ceiling should receive its floor world offset."
);

assert.match(
  housePlanRendererSource,
  /if \(onSelectSurfaceTarget\) \{[\s\S]*?onSelectSurfaceTarget\(\{[\s\S]*?\}\);[\s\S]*?\} else \{\s*onSelectRoom\?\.\(target\.roomId\);\s*\}/,
  "A structure click should select either its surface target or its room, never both."
);

console.log("Editor 3D floor cutaway guardrails passed.");
