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
  /const sharedWallMatches = getSharedWallMatches\(room, rooms, segment, part\);[\s\S]*?const isInteriorSharedWall = sharedWallMatches\.length > 0;/,
  "Interior shared room-to-room walls should be identified before camera cutaway is applied."
);

assert.match(
  source,
  /if \(!segment\.wall\) \{[\s\S]*?getWallSegments\(otherRoom\)[\s\S]*?segmentKey: otherSegment\.key/,
  "Imported custom-polygon rooms should match coincident physical wall segments."
);

assert.match(
  source,
  /sharedWallMatches\.flatMap\(\(\{ room: sharedRoom, segment: sharedSegment \}\)[\s\S]*?getWallSurfaceFaceId\(sharedRoom, sharedSegment\)/,
  "A shared polygon wall owner should render both room finishes without duplicate coplanar meshes."
);

assert.match(
  source,
  /const cutawayEligible = forceCutaway && !isInteriorSharedWall;[\s\S]*?cutawayEligible,[\s\S]*?forceCutaway: cutawayEligible/,
  "Only exterior camera-facing walls should use the dollhouse cutaway; shared partitions must stay consistent."
);

assert.match(
  source,
  /if \(getSharedWallOverlapRanges\(room, rooms, segment\)\.length > 0\) \{\s*continue;\s*\}/,
  "The camera cutaway resolver should never remove shared middle-wall segments."
);

assert.match(
  source,
  /function useLegacyCameraCutawaySegmentKeys\([\s\S]*?resolveLegacyCameraCutawaySegmentKeysForTest\([\s\S]*?setCutawaySegmentKeys\(nextKeys\);/,
  "The refreshed compatibility wall union should track camera-facing segments as the camera moves."
);

assert.match(
  source,
  /camera\.getWorldDirection\(viewDirectionRef\.current\)[\s\S]*?viewDirectionX: viewDirection\.x,[\s\S]*?viewDirectionZ: viewDirection\.z/,
  "Compatibility cutaway selection should follow camera viewing direction instead of zoom distance."
);

assert.match(
  source,
  /const virtualCameraDistance =[\s\S]*?const stableCameraX =[\s\S]*?const stableCameraZ =[\s\S]*?cameraX: stableCameraX,[\s\S]*?cameraZ: stableCameraZ/,
  "Cutaway thresholds should evaluate from a stable virtual camera distance."
);

assert.match(
  source,
  /buildLegacyWallBandsForTest\(\{[\s\S]*?excludedSegmentKeys: legacyCutawaySegmentKeys/,
  "The opaque compatibility wall body must exclude the same camera-facing segments as its finishes."
);

assert.match(
  source,
  /forceCutaway=\{legacyCutawaySegmentKeys\.has\(segment\.key\)\}/,
  "Compatibility wall finishes and their unioned structural body should share one cutaway decision."
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
  /buildOpeningSillParts\([\s\S]*?segmentWallHeight,[\s\S]*?segmentWallHeight[\s\S]*?\)/,
  "Compatibility windows must retain their sill wall instead of becoming floor-to-ceiling gaps."
);

assert.match(
  source,
  /buildLegacyFloorSlabsForTest\([\s\S]*?buildPlanarUnionPolygons\(group\.regions\)/,
  "Compatibility rooms should render on one unioned floor slab after refresh."
);
const floorSlabBuilderSource = source.slice(
  source.indexOf("export function buildLegacyFloorSlabsForTest"),
  source.indexOf("export function buildLegacyWallBandsForTest")
);
assert.match(
  floorSlabBuilderSource,
  /buildWallParts\(segment, wallOpenings\)[\s\S]*?buildOpeningSillParts\([\s\S]*?for \(const part of baseParts\)[\s\S]*?legacyWallPartRegion/,
  "Floor support should follow base-contacting wall parts and window sills without crossing door gaps."
);
assert.doesNotMatch(
  floorSlabBuilderSource,
  /excludedSegmentKeys/,
  "Camera wall cutaways must not carve wall-shaped steps into the compatibility slab perimeter."
);
const renderedFloorSlabCallSource = source.slice(
  source.indexOf("floorSlabs: buildLegacyFloorSlabsForTest"),
  source.indexOf("wallBands: buildLegacyWallBandsForTest")
);
assert.doesNotMatch(
  renderedFloorSlabCallSource,
  /legacyCutawaySegmentKeys|excludedSegmentKeys/,
  "The rendered compatibility slab must stay independent from camera wall visibility."
);
assert.match(
  source,
  /legacy-watertight-floor-slab-3d[\s\S]*?attach="material-0"[\s\S]*?opacity=\{0\}[\s\S]*?colorWrite=\{false\}[\s\S]*?attach="material-1"[\s\S]*?opacity=\{0\}[\s\S]*?colorWrite=\{false\}/,
  "The structural support slab must not add a second-colored cap or edge around the visible room floor."
);
const openingThresholdSource = source.slice(
  source.indexOf("function OpeningThresholdMesh"),
  source.indexOf("function RoomFloorMesh")
);
assert.match(
  openingThresholdSource,
  /<boxGeometry args=\{\[threshold\.length, 0\.03, thresholdDepth\]\} \/>[\s\S]*?<meshBasicMaterial transparent opacity=\{0\} depthWrite=\{false\} \/>/,
  "Door thresholds should remain an invisible editing target until hovered or selected."
);

assert.match(
  source,
  /buildLegacyWallBandsForTest\([\s\S]*?buildPlanarUnionPolygons\(regions\)/,
  "Compatibility wall boxes should be replaced by unioned height bands."
);
assert.match(
  source,
  /position=\{\[0, band\.bottomMeters, 0\]\}[\s\S]*?depth: Math\.max\(0\.001, band\.topMeters - band\.bottomMeters\)/,
  "Wall bands should terminate at the finished-floor level instead of extending below the slab top."
);

assert.match(
  source,
  /const capExtension = wallThicknessMeters \/ 2;[\s\S]*?touchesStart && !endJoinOptions\.squareStart[\s\S]*?touchesEnd && !endJoinOptions\.squareEnd/,
  "Unioned compatibility wall endpoints should overlap junctions by exactly half the wall thickness."
);

assert.match(
  source,
  /const left = joinedLegacyWallPartAxisRange\([\s\S]*?endJoinOptions[\s\S]*?const right = joinedLegacyWallPartAxisRange\([\s\S]*?endJoinOptions/,
  "Compatibility wall footprints should use the same graph-style cap range on both faces."
);

assert.match(
  source,
  /function legacyWallCutEndJoinOptions\([\s\S]*?squareStart:[\s\S]*?excludedSegmentKeys\.has\(startNeighbor\.key\)[\s\S]*?squareEnd:[\s\S]*?excludedSegmentKeys\.has\(endNeighbor\.key\)/,
  "Only endpoints touching a removed wall should become square cut boundaries."
);

assert.match(
  source,
  /function legacyWallAdjacentSegment\([\s\S]*?legacyWallEndpointLocal\(segment, endpoint\)[\s\S]*?legacyWallEndpointLocal\(candidate, "start"\)[\s\S]*?legacyWallEndpointLocal\(candidate, "end"\)/,
  "Cutaway adjacency must match physical endpoints instead of assuming every rectangle wall uses array-order direction."
);

assert.match(
  source,
  /function legacyPhysicalWallCutEndJoinOptions\([\s\S]*?const exposedEndpoints = rooms\.flatMap[\s\S]*?endpointMatches\(endpoints\.start, endpoint\)[\s\S]*?endpointMatches\(endpoints\.end, endpoint\)/,
  "Every wall copy ending at an exposed plan endpoint must use the same flush cut boundary."
);

assert.match(
  source,
  /joinedLegacyWallSurfacePart\([\s\S]*?surface\.side,[\s\S]*?wallThickness,[\s\S]*?\{ squareStart, squareEnd \}/,
  "Visible wall finishes should use the real wall thickness and the same selective cut boundary as the wall body."
);

assert.match(
  source,
  /squareStart && partTouchesSegmentStart[\s\S]*?WALL_SECTION_CAP_COLOR[\s\S]*?squareEnd && partTouchesSegmentEnd[\s\S]*?WALL_SECTION_CAP_COLOR/,
  "Exposed dollhouse wall ends should receive clean section-cap faces."
);

assert.match(
  source,
  /function LegacyWallBandMesh[\s\S]*?<meshStandardMaterial[\s\S]*?flatShading/,
  "Merged architectural wall shells should use hard face normals without diagonal smoothing facets."
);

assert.match(
  source,
  /WALL_SURFACE_OFFSET_METERS[\s\S]*?polygonOffsetFactor=\{-4\}[\s\S]*?polygonOffsetUnits=\{-4\}/,
  "Visible wall finishes should remain decisively in front of the merged structural shell."
);

assert.match(
  source,
  /partLength=\{joinedSurface\.length\}[\s\S]*?centerOffset=\{joinedSurface\.centerDelta\}/,
  "Visible wall finishes should follow the same junction overlap as the merged wall body."
);

assert.match(
  source,
  /showEdgeBand=\{!canonicalPlan && !hasLegacyMergedSlab\}/,
  "A merged compatibility slab must suppress the old hollow per-room edge bands."
);

assert.match(
  source,
  /renderBase=\{!hasLegacyMergedWalls\}/,
  "Unioned compatibility walls must suppress independent visible wall boxes."
);

assert.match(
  source,
  /renderSurfaces=\{!hasLegacyMergedWalls\}/,
  "Unioned compatibility walls must suppress duplicate visible finish planes that would z-fight with the merged shell."
);

assert.match(
  source,
  /ref=\{surfaceMeshRef\}[\s\S]*?visible=\{renderSurface\}/,
  "Hidden compatibility finishes should retain their separate invisible interaction mesh without drawing a second wall layer."
);

assert.match(
  source,
  /renderSurfaces && squareStart && partTouchesSegmentStart[\s\S]*?renderSurfaces && squareEnd && partTouchesSegmentEnd/,
  "Merged compatibility walls should not draw separate section-cap planes over their structural end faces."
);

assert.match(
  source,
  /<CutawayWallMesh[\s\S]*?wallHeight=\{segmentWallHeight\}/,
  "Rendered wall geometry should use the selected wall face height."
);

assert.match(
  source,
  /const roomWallThickness = Math\.max\([\s\S]*?room\.wallThickness \?\? STRUCTURE_THICKNESS_METERS[\s\S]*?\);/,
  "Whole-home 3D should honor the canonical room wall thickness instead of using a fixed mesh thickness."
);

assert.match(
  source,
  /<CutawayWallMesh[\s\S]*?wallThickness=\{roomWallThickness\}/,
  "Rendered wall geometry should receive the same wall thickness used by the 2D room model."
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
