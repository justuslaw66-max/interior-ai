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
  /function getSharedWallOverlapRanges\(/,
  "House-plan 3D walls should calculate exact partial shared-wall overlap ranges."
);

assert.match(
  source,
  /function splitWallPartsAtSharedBoundaries\(/,
  "House-plan 3D walls should split wall parts before shared-wall ownership is applied."
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

assert.match(
  source,
  /const parts = splitWallPartsAtSharedBoundaries\([\s\S]*?buildWallParts\(segment, wallOpenings\)/,
  "Wall parts should be split at partial shared boundaries so unshared bathroom wall ends still render."
);

assert.match(
  source,
  /else if \(!isInteriorSharedWall\) \{[\s\S]*?targetOpacity = resolveCutawayWallOpacity\(\{[\s\S]*?roomDepth: room\.d,[\s\S]*?wall: segment\.wall,[\s\S]*?baseOpacity,[\s\S]*?targetX: targetRoom\.x,/,
  "Inactive whole-home walls should use wall-aware target cutaway so adjacent room fronts do not appear swapped."
);

assert.match(
  source,
  /else if \(!isInteriorSharedWall\) \{[\s\S]*?targetOpacity = resolveCutawayWallOpacity\(\{[\s\S]*?wall: segment\.wall,[\s\S]*?targetX: targetRoom\.x,/,
  "Inactive rooms should hide their own camera-facing exterior walls in whole-home 3D."
);

assert.match(
  source,
  /const selectedTargetKey = getStructureTargetKey\(\s*selectedStructureTarget\?\.roomId === activeRoomId \? selectedStructureTarget : null\s*\);/,
  "Switching active rooms should suppress stale selected wall outlines."
);

assert.doesNotMatch(
  source,
  /data-testid="house-room-3d-label"|activeFloorBounds|from "@react-three\/drei\/web\/Html"/,
  "Whole-home 3D should stay uncluttered without persistent floating room or floor labels."
);

console.log("House-plan wall rendering guardrails passed.");
