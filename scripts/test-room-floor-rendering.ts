import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const roomEnvironmentPath = path.join(
  process.cwd(),
  "components",
  "scene",
  "RoomEnvironment.tsx"
);
const source = fs.readFileSync(roomEnvironmentPath, "utf8");
const housePlanRendererPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "renderers",
  "house-plan-3d",
  "surfaceMeshes.tsx"
);
const housePlanSource = fs.readFileSync(housePlanRendererPath, "utf8");

assert.match(
  source,
  /export const ROOM_FLOOR_SURFACE_OFFSET = 0\.006;/,
  "Room floor must keep a small height offset above the slab to avoid z-fighting."
);

assert.match(
  source,
  /position=\{\[0, ROOM_FLOOR_SURFACE_OFFSET, 0\]\}/,
  "Room floor mesh must render above the slab top face."
);

assert.match(
  source,
  /polygonOffset:\s*true,/,
  "Room floor material should use polygon offset as an extra depth-fighting guard."
);

assert.match(
  source,
  /polygonOffsetFactor:\s*-1,/,
  "Room floor material should bias the wood floor toward the camera."
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

console.log("Room floor rendering guardrails passed.");
