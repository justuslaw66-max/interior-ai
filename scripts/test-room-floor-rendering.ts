import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const roomEnvironmentPath = path.join(
  process.cwd(),
  "components",
  "scene",
  "RoomEnvironment.tsx"
);
const housePlanRendererPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "renderers",
  "house-plan-3d",
  "surfaceMeshes.tsx"
);
const housePlanSource = fs.readFileSync(housePlanRendererPath, "utf8");
const ceilingShadowOccluderPath = path.join(
  process.cwd(),
  "components",
  "scene",
  "CeilingShadowOccluder.tsx"
);
const ceilingShadowOccluderSource = fs.readFileSync(
  ceilingShadowOccluderPath,
  "utf8"
);

assert.equal(
  fs.existsSync(roomEnvironmentPath),
  false,
  "Single rooms render their floors through the house-plan scene, so the legacy single-room environment must stay retired."
);

assert.match(
  housePlanSource,
  /const ROOM_FLOOR_SURFACE_OFFSET_METERS = 0\.006;/,
  "House-plan room floors must keep enough height above structural geometry to avoid z-fighting."
);

assert.match(
  housePlanSource,
  /position=\{\[0, ROOM_FLOOR_SURFACE_OFFSET_METERS, 0\]\}/,
  "House-plan room floor meshes must use the guarded surface offset."
);

assert.match(
  housePlanSource,
  /renderOrder=\{1 \+ floorLayerIndex\}[\s\S]*?polygonOffset[\s\S]*?polygonOffsetFactor=\{-1\}[\s\S]*?polygonOffsetUnits=\{-\(floorLayerIndex \+ 1\)\}/,
  "House-plan room floors must use deterministic depth bias when room surfaces overlap."
);

assert.match(
  ceilingShadowOccluderSource,
  /<mesh[\s\S]*?castShadow[\s\S]*?raycast=\{\(\) => null\}[\s\S]*?<meshBasicMaterial[\s\S]*?colorWrite=\{false\}[\s\S]*?depthWrite=\{false\}/,
  "A ceiling shadow occluder must cast shadows without drawing into the visible scene or intercepting picks."
);

assert.match(
  ceilingShadowOccluderSource,
  /geometry: THREE\.BufferGeometry;/,
  "A ceiling shadow occluder must be given its room-shaped caster geometry."
);
assert.doesNotMatch(
  ceilingShadowOccluderSource,
  /boxSize/,
  "Only the house-plan scene casts ceiling shadows, so the legacy box caster must stay retired."
);

assert.match(
  housePlanSource,
  /const ceilingShadowGeometry = useMemo\([\s\S]*?buildHorizontalRoomGeometry\([\s\S]*?room,[\s\S]*?wallHeight \* 2[\s\S]*?geometry=\{ceilingShadowGeometry\}[\s\S]*?<group ref=\{groupRef\}[\s\S]*?visible=\{false\}/,
  "Whole-home ceiling occlusion must use a height-bounded overhang while visual cutaway state remains independent."
);

console.log("Room floor rendering guardrails passed.");
