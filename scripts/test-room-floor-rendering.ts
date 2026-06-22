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

console.log("Room floor rendering guardrails passed.");
