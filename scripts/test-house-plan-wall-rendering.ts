import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const rendererPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "renderers",
  "HousePlanRenderer3D.tsx"
);
const source = fs.readFileSync(rendererPath, "utf8");

assert.match(
  source,
  /function getSharedWallRoomIds\(/,
  "House-plan 3D walls should detect shared room wall segments."
);

assert.match(
  source,
  /function getSharedWallRenderOwnerRoomId\(/,
  "Shared wall segments should resolve to a single render owner."
);

assert.match(
  source,
  /activeRoomId && \(room\.id === activeRoomId \|\| sharedRoomIds\.includes\(activeRoomId\)\)/,
  "The active room should own shared walls so selected rooms keep crisp boundaries."
);

assert.match(
  source,
  /const isDuplicateSharedWall = sharedWallOwnerRoomId !== room\.id;/,
  "Duplicate shared wall meshes should be suppressed to avoid z-fighting artifacts."
);

assert.match(
  source,
  /if \(isDuplicateSharedWall\) return null;/,
  "Duplicate shared wall meshes should not render."
);

console.log("House-plan wall rendering guardrails passed.");
