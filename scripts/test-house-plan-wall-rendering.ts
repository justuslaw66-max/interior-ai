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
  /return \[room\.id, \.\.\.sharedRoomIds\]\.sort\(\)\[0\];/,
  "Shared walls should use one deterministic render owner to keep boundaries crisp."
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
  /const INACTIVE_WALL_OPACITY = 1;/,
  "Inactive whole-home walls should stay solid like active room walls."
);

assert.match(
  source,
  /const isInteriorSharedWall = isWallPartSharedWithAnotherRoom\(room, rooms, segment, part\);/,
  "Interior shared room-to-room walls should be identified before camera cutaway is applied."
);

assert.match(
  source,
  /if \(!isInteriorSharedWall\) \{[\s\S]*?targetOpacity = resolveCutawayWallOpacity\(\{[\s\S]*?cutawayOpacity: CAMERA_FACING_WALL_CUTAWAY_OPACITY,[\s\S]*?\}\);[\s\S]*?\}/,
  "Only non-shared outside walls should use camera-facing cutaway."
);

assert.match(
  source,
  /const nextTransparent = targetOpacity < 0\.999 \|\| material\.opacity < 0\.999;[\s\S]*?material\.transparent = nextTransparent;/,
  "Wall meshes should render in the transparent pass only during exterior cutaway or explicit opacity."
);

assert.match(
  source,
  /transparent=\{baseOpacity < 0\.999\}/,
  "Wall material transparency should be conditional on actual opacity."
);

assert.match(
  source,
  /room\.wallHeights\?\.\[wallFaceId\] \?\? roomWallHeight/,
  "Each wall face should use its own height override before falling back to the floor wall height."
);

assert.match(
  source,
  /buildOpeningLintelParts\([\s\S]*?segmentWallHeight,[\s\S]*?segmentWallHeight[\s\S]*?\)/,
  "Door and window lintels should follow the selected wall face height."
);

assert.match(
  source,
  /<CutawayWallMesh[\s\S]*?wallHeight=\{segmentWallHeight\}/,
  "Rendered wall geometry should use the selected wall face height."
);

assert.match(
  source,
  /const selectedTargetKey = getStructureTargetKey\(\s*selectedSurfaceTarget\?\.roomId === activeRoomId\s*\? selectedSurfaceTarget/,
  "The page-controlled surface selection should suppress stale outlines when rooms switch or selection clears."
);

assert.doesNotMatch(
  source,
  /data-testid="house-room-3d-label"|activeFloorBounds|from "@react-three\/drei\/web\/Html"/,
  "Whole-home 3D should stay uncluttered without persistent floating room or floor labels."
);

console.log("House-plan wall rendering guardrails passed.");
