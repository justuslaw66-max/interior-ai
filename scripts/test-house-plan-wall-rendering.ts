import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {
  getWallPaintColorFidelityFillIntensity,
  resolveWallSurfaceColorFillIntensity,
} from "@/lib/wall-paint-rendering";

const angelPinkFillIntensity =
  resolveWallSurfaceColorFillIntensity({
    hasTexture: false,
    paintColorHex: "#FBF1F2",
    neutralFillIntensity: 0.08,
  });
assert.ok(
  angelPinkFillIntensity > 0.77 && angelPinkFillIntensity <= 0.8,
  "Paint should receive the shared color-fidelity fill."
);
assert.ok(
  getWallPaintColorFidelityFillIntensity("#C2756D") <
    angelPinkFillIntensity,
  "Mid-tone paint should receive less compensation than near-white paint."
);
assert.equal(
  resolveWallSurfaceColorFillIntensity({
    hasTexture: true,
    paintColorHex: "#FBF1F2",
    neutralFillIntensity: 0.08,
  }),
  0,
  "Textured finishes must not receive paint color compensation."
);
assert.equal(
  resolveWallSurfaceColorFillIntensity({
    hasTexture: false,
    paintColorHex: null,
    neutralFillIntensity: 0.08,
  }),
  0.08,
  "Unpainted structural surfaces retain their low neutral fill."
);

const rendererPath = path.join(
  process.cwd(),
  "components",
  "editor",
  "renderers",
  "HousePlanRenderer3D.tsx"
);
const rendererSourcePaths = [
  rendererPath,
  path.join(path.dirname(rendererPath), "CanonicalFloorPlanStructure.tsx"),
  path.join(path.dirname(rendererPath), "house-plan-3d", "geometry.ts"),
  path.join(path.dirname(rendererPath), "house-plan-3d", "wallAndOpeningMeshes.tsx"),
  path.join(path.dirname(rendererPath), "house-plan-3d", "surfaceMeshes.tsx"),
  path.join(process.cwd(), "lib", "wall-paint-rendering.ts"),
];
const source = rendererSourcePaths
  .map((sourcePath) => fs.readFileSync(sourcePath, "utf8"))
  .join("\n");
const structureLayerSource = fs.readFileSync(
  path.join(
    process.cwd(),
    "components",
    "editor",
    "design-page",
    "DesignSceneStructureLayer.tsx"
  ),
  "utf8"
);
const surfaceWorkspaceSource = fs.readFileSync(
  path.join(process.cwd(), "lib", "useDesignPageSurfaceWorkspaceFacade.ts"),
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
  /function getSharedWallRoomIds\([\s\S]*?rangesOverlapBy\([\s\S]*?LEGACY_WALL_JOIN_TOLERANCE_METERS[\s\S]*?function getSharedWallMatches\([\s\S]*?rangesOverlapBy\([\s\S]*?LEGACY_WALL_JOIN_TOLERANCE_METERS/,
  "Even very narrow shared-wall fragments must stay shared instead of exposing an overlapping exterior face."
);

assert.doesNotMatch(
  source,
  /rangesOverlapBy\(partStart, partEnd, range\.start, range\.end, 0\.35\)/,
  "Shared-wall classification must not discard selectable fragments merely because they are narrower than 350 mm."
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
  /const cutawayEligible =\s*forceCutaway && !isInteriorSharedWall && !isSelectedWallFace;[\s\S]*?cutawayEligible,[\s\S]*?forceCutaway: cutawayEligible/,
  "Only unselected exterior camera-facing walls should use the dollhouse cutaway; shared partitions and selected faces must stay consistent."
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
  structureLayerSource,
  /topologyRooms=\{state\.wholeHome\.rooms\}/,
  "Focus room mode must preserve the whole-home room graph for shared-wall topology."
);

assert.match(
  structureLayerSource,
  /const topologyOpenings = mapPlanOpeningsToRoomRenderer\([\s\S]*?openings=\{topologyOpenings\}/,
  "Focus room mode must preserve adjacent-room openings for mirrored wall cuts."
);

assert.match(
  source,
  /topologyRooms\s*=\s*rooms/,
  "The legacy renderer must accept a whole-home topology graph independently of visible rooms."
);

assert.match(
  surfaceWorkspaceSource,
  /setSelectedWallSurfaceTarget\(\(current\) =>[\s\S]*?current\?\.roomId === roomId && current\.faceId === faceId[\s\S]*?\? current/,
  "Opening the wall material picker must preserve a canonical panel target instead of repainting the parent face."
);

assert.match(
  source,
  /forceCutaway=\{legacyCutawaySegmentKeys\.has\(segment\.key\)\}/,
  "Compatibility wall finishes and their unioned structural body should share one cutaway decision."
);

assert.match(
  source,
  /transparent: opacity < 0\.999,[\s\S]*?depthWrite: opacity >= 0\.999,/,
  "Only an already-settled translucent wall may enter the transparent pass; visible opaque walls must own depth."
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
  /function buildLegacyWallBandCoreGeometry\([\s\S]*?depth: Math\.max\(0\.001, band\.topMeters - band\.bottomMeters\)[\s\S]*?position=\{\[0, band\.bottomMeters, 0\]\}/,
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
  /joinedLegacyWallSurfacePart\([\s\S]*?surface\.side,[\s\S]*?wallThickness,[\s\S]*?\{ squareStart, squareEnd \},[\s\S]*?WALL_SURFACE_CUT_OVERLAP_METERS/,
  "Visible wall finishes should use the real wall thickness and share the same selective cut boundary."
);

assert.match(
  source,
  /const INACTIVE_WALL_COLOR = "#ddddda";[\s\S]*?const WALL_CUT_SURFACE_COLOR = INACTIVE_WALL_COLOR;[\s\S]*?function LegacyWallBandMesh[\s\S]*?<meshStandardMaterial[\s\S]*?color=\{INACTIVE_WALL_COLOR\}[\s\S]*?roughness=\{0\.86\}/,
  "Merged compatibility wall shells should use a neutral diffuse material that retains directional face shading."
);

assert.match(
  source,
  /function LegacyWallBandMesh[\s\S]*?<meshStandardMaterial[\s\S]*?flatShading/,
  "Merged architectural wall shells should keep hard face normals so triangulation cannot create faint wall creases."
);

assert.match(
  source,
  /const CANONICAL_WALL_BODY_COLOR = "#ddddda";[\s\S]*?const CANONICAL_WALL_CUT_SURFACE_COLOR = CANONICAL_WALL_BODY_COLOR;[\s\S]*?function CanonicalWallBodies3D[\s\S]*?<meshStandardMaterial[\s\S]*?color=\{CANONICAL_WALL_BODY_COLOR\}[\s\S]*?roughness=\{0\.86\}/,
  "Canonical wall bodies should use the same directionally shaded neutral material as compatibility walls."
);

assert.match(
  source,
  /const WALL_CUT_SURFACE_COLOR = INACTIVE_WALL_COLOR;/,
  "Compatibility wall cut surfaces should use exactly the structural wall neutral."
);

assert.match(
  source,
  /const CANONICAL_WALL_CUT_SURFACE_COLOR = CANONICAL_WALL_BODY_COLOR;/,
  "Canonical wall cut surfaces should use exactly the structural wall neutral."
);

const wallSurfaceSideSource = source.slice(
  source.indexOf("function WallSurfaceSideMesh"),
  source.indexOf("function WallSurfaceCutCapMesh")
);
assert.match(
  source,
  /const WALL_INDIRECT_FILL_INTENSITY = 0\.08;/,
  "Compatibility neutral wall fill should stay low enough to preserve face definition."
);
assert.match(
  wallSurfaceSideSource,
  /const wallColor =[\s\S]*?resolveWallSurfaceColorFillIntensity\(\{[\s\S]*?hasTexture: Boolean\(wallTexture\),[\s\S]*?paintColorHex: settings\.paintColorHex,[\s\S]*?neutralFillIntensity: WALL_INDIRECT_FILL_INTENSITY,[\s\S]*?<meshStandardMaterial[\s\S]*?color=\{wallColor\}[\s\S]*?emissiveIntensity=\{wallColorFillIntensity\}[\s\S]*?roughness=/,
  "Compatibility paint should use the shared color-fidelity fill while neutral and textured walls keep their original treatment."
);
assert.doesNotMatch(
  wallSurfaceSideSource,
  /emissiveIntensity=\{?0\.(?:8[5-9]|9\d)|WALL_PAINT_EMISSIVE_INTENSITY|WALL_EMISSIVE_INTENSITY/,
  "Compatibility wall finishes must not use a near-unlit emissive treatment that flattens directional face shading."
);

const canonicalWallSurfaceSource = source.slice(
  source.indexOf("function CanonicalWallSurfaceMesh"),
  source.indexOf("function CanonicalOpening3DSymbol")
);
assert.match(
  source,
  /const CANONICAL_WALL_INDIRECT_FILL_INTENSITY = 0\.08;/,
  "Canonical neutral wall fill should stay low enough to preserve face definition."
);
assert.match(
  canonicalWallSurfaceSource,
  /const displayedColor =[\s\S]*?resolveWallSurfaceColorFillIntensity\(\{[\s\S]*?hasTexture: Boolean\(texture\),[\s\S]*?paintColorHex: settings\.paintColorHex,[\s\S]*?neutralFillIntensity: CANONICAL_WALL_INDIRECT_FILL_INTENSITY,[\s\S]*?<meshStandardMaterial[\s\S]*?color=\{displayedColor\}[\s\S]*?emissiveIntensity=\{displayedColorFillIntensity\}[\s\S]*?roughness=/,
  "Canonical paint should use the same shared color-fidelity calibration as compatibility walls."
);
assert.doesNotMatch(
  canonicalWallSurfaceSource,
  /CANONICAL_PAINT_EMISSIVE_INTENSITY|CANONICAL_WALL_EMISSIVE_INTENSITY/,
  "Canonical wall finishes must not restore the strong flat-shading emissive path."
);
assert.match(
  source,
  /WALL_PAINT_COLOR_FIDELITY_MIN_FILL_INTENSITY = 0\.35[\s\S]*?WALL_PAINT_COLOR_FIDELITY_MAX_FILL_INTENSITY = 0\.8[\s\S]*?WALL_PAINT_COLOR_FIDELITY_LUMINANCE_SCALE = 0\.55[\s\S]*?WALL_PAINT_COLOR_FIDELITY_LUMINANCE_EXPONENT = 1\.25/,
  "Paint color-fidelity compensation must remain luminance-aware and capped below the near-unlit range."
);

assert.match(
  source,
  /function LegacyWallBandMesh[\s\S]*?buildLegacyWallBandCoreGeometry\([\s\S]*?removeTopCap: showTopCap[\s\S]*?position=\{\[0, band\.topMeters, 0\]\}[\s\S]*?legacy-watertight-wall-top-cap-3d[\s\S]*?<shapeGeometry args=\{\[shapes\]\}/,
  "The compatibility top cap must be the only depth owner at the exact union-footprint wall top."
);

assert.match(
  source,
  /function CanonicalWallBodies3D[\s\S]*?canonical-wall-top-cap-3d[\s\S]*?<shapeGeometry args=\{\[shapes\]\}/,
  "Canonical wall shells should cover structural join edges with one union-footprint top cap."
);

assert.doesNotMatch(
  wallSurfaceSideSource,
  /polygonOffset|polygonOffsetFactor|polygonOffsetUnits/,
  "Visible wall finishes must not use per-triangle depth bias that exposes their diagonal at grazing angles."
);

assert.match(
  source,
  /const WALL_SURFACE_THICKNESS_METERS = 0\.0015;/,
  "Visible wall finishes must use a real 1.5 mm shell rather than a depth-only separation."
);
assert.match(
  wallSurfaceSideSource,
  /buildWallFinishShellGeometry\(\{[\s\S]*?widthMeters: partLength,[\s\S]*?heightMeters: partHeight,[\s\S]*?thicknessMeters: WALL_SURFACE_THICKNESS_METERS/,
  "The visible finish must provide its own physical broad face, top, bottom, and edge depth."
);
assert.match(
  source,
  /function buildWallFinishShellGeometry\([\s\S]*?isInnerBroadFace[\s\S]*?removedInnerFaceTriangleCount \+= 1;[\s\S]*?continue;/,
  "A finish shell must omit its flush inner broad face so the opposite side cannot become a duplicate depth or selection owner."
);

assert.doesNotMatch(
  source,
  /hitMeshRef|raycastHitWhenPickable|partLength \+ 0\.02|partHeight \+ 0\.04/,
  "Wall fragments must not add oversized invisible hit planes that overlap neighboring selectable pieces."
);

assert.match(
  source,
  /const WALL_SURFACE_CUT_OVERLAP_METERS = 0;/,
  "Paint and material planes should terminate flush with exposed structural cuts."
);

assert.match(
  source,
  /function legacyWallSurfaceMiterOffset\([\s\S]*?const isInteriorSurface = side === getWallInteriorSurfaceSide\(segment\);[\s\S]*?intersectOffsetLines\([\s\S]*?legacyWallSurfaceMiterOffset\([\s\S]*?"start"[\s\S]*?legacyWallSurfaceMiterOffset\([\s\S]*?"end"/,
  "Decorative finishes should meet the matching interior or exterior face at a true side-aware wall miter."
);

assert.match(
  source,
  /touchesStart && endJoinOptions\.squareStart \? -cutOverlapMeters : 0[\s\S]*?touchesEnd && endJoinOptions\.squareEnd \? -cutOverlapMeters : 0/,
  "The finish boundary adjustment must remain scoped to camera-exposed wall endpoints."
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
  /renderBase=\{!hasLegacyMergedWalls\}[\s\S]*?renderSurfaces(?:=\{true\})?/,
  "Unioned compatibility walls must retain their offset finish planes so saved paint and wall materials remain visible."
);

assert.match(
  source,
  /ref=\{surfaceMeshRef\}[\s\S]*?visible=\{renderSurface\}/,
  "Compatibility walls should keep their independently controlled continuous visible surface mesh."
);

assert.doesNotMatch(
  source,
  /hasVisibleFinish|visible=\{renderSurface &&/,
  "Neutral compatibility faces must not expose the segmented structural shell beneath the finish layer."
);

assert.match(
  source,
  /function buildWallSurfacePanels\([\s\S]*?getWallSolidSpans\(segment, openings\)\.map/,
  "Room-facing finish panels must be built once from opening-bounded topology, independently of structural ownership splits."
);

assert.doesNotMatch(
  source,
  /<WallSurfacePanelMesh[\s\S]*?surfaceSeamOverlap=/,
  "Canonical room-facing panels must not use fragment seam extensions or competing coplanar finish overlap."
);

assert.match(
  source,
  /ref=\{surfaceMeshRef\}[\s\S]{0,160}?castShadow[\s\S]{0,80}?receiveShadow/,
  "The sole visible wall finish must own the wall's broad-face shadowing after the structural face is removed."
);

assert.match(
  source,
  /ref=\{materialRef\}[\s\S]*?depthTest[\s\S]*?depthWrite=\{baseOpacity >= 0\.999\}/,
  "Opaque finish planes should own normal depth so geometry behind a wall cannot show through."
);

assert.match(
  source,
  /material\.depthWrite = renderState\.depthWrite/,
  "Atomic cutaways should stop writing depth while every visible opaque wall layer occludes geometry behind it."
);

assert.doesNotMatch(
  source,
  /getSurfaceMaterialFallbackColor\(wallSurfaceMaterial\) \?\?[\s\S]{0,80}?active \?/,
  "Unfinished compatibility walls must use one neutral surface color across room-ownership splits."
);

const wallCutCapSource = source.slice(
  source.indexOf("function WallSurfaceCutCapMesh"),
  source.indexOf("export function CutawayWallMesh")
);
assert.match(
  wallCutCapSource,
  /const wallColor = isActive \? ACTIVE_WALL_COLOR : INACTIVE_WALL_COLOR;[\s\S]*?<meshStandardMaterial[\s\S]*?color=\{wallColor\}[\s\S]*?roughness=\{0\.86\}[\s\S]*?depthTest\s+depthWrite=\{baseOpacity >= 0\.999\}/,
  "Camera-exposed wall ends should remain depth-tested so hidden caps cannot draw through opaque walls."
);
assert.doesNotMatch(
  wallCutCapSource,
  /polygonOffset|renderOrder/,
  "Camera-exposed wall ends must meet the finish shell physically instead of winning through render-order bias."
);
assert.doesNotMatch(
  wallCutCapSource,
  /depthTest=\{false\}|depthWrite=\{false\}/,
  "Camera-cut end caps must never bypass normal wall occlusion."
);
assert.match(
  wallCutCapSource,
  /position=\{\[-partLength \/ 2, 0, 0\]\}[\s\S]*?wallThickness \+ WALL_SURFACE_THICKNESS_METERS \* 2[\s\S]*?position=\{\[partLength \/ 2, 0, 0\]\}[\s\S]*?wallThickness \+ WALL_SURFACE_THICKNESS_METERS \* 2/,
  "Both structural cut caps should terminate at the exact panel edge and bridge the complete finish thickness."
);
assert.doesNotMatch(
  wallCutCapSource,
  /settings|paintColorHex|materialId/,
  "Structural cut caps must not read or render the adjacent wall finish."
);

assert.match(
  source,
  /<WallSurfaceCutCapMesh[\s\S]*?showStart=\{squareStart && partTouchesSegmentStart\}[\s\S]*?showEnd=\{squareEnd && partTouchesSegmentEnd\}/,
  "Finish-aware cut caps must be limited to physical endpoints exposed by the camera cutaway."
);

assert.match(
  source,
  /showTopCap \? \([\s\S]*?position=\{\[0, band\.topMeters, 0\]\}[\s\S]*?legacy-watertight-wall-top-cap-3d[\s\S]*?<shapeGeometry args=\{\[shapes\]\} \/>[\s\S]*?<meshStandardMaterial[\s\S]*?color=\{WALL_CUT_SURFACE_COLOR\}[\s\S]*?roughness=\{0\.86\}[\s\S]*?depthTest\s+depthWrite=\{opacity >= 0\.999\}/,
  "Merged wall tops should own their exact depth without a duplicate structural cap or polygon bias."
);

assert.match(
  source,
  /buildLegacyWallFaceRenderPatchesForTest\([\s\S]*?buildWallSurfacePanels\([\s\S]*?buildOpeningLintelParts\([\s\S]*?buildOpeningSillParts\(/,
  "Render coverage must include canonical panels together with opening lintels and sills."
);
assert.match(
  source,
  /function triangleWallFacePatchCoverage\([\s\S]*?coveredArea[\s\S]*?function buildLegacyWallBandCoreGeometry\([\s\S]*?triangleWallFacePatchCoverage\([\s\S]*?if \(coverage\.covered\)[\s\S]*?removedCoveredTriangleCount \+= 1;[\s\S]*?continue;/,
  "The structural wall shell must physically omit broad triangles covered by the complete coplanar patch union."
);

assert.match(
  source,
  /band\.topMm === maximumTopMm \? \([\s\S]*?renderOrder=\{100\}[\s\S]*?canonical-wall-top-cap-3d[\s\S]*?<shapeGeometry args=\{\[shapes\]\} \/>[\s\S]*?<meshStandardMaterial[\s\S]*?color=\{CANONICAL_WALL_CUT_SURFACE_COLOR\}[\s\S]*?roughness=\{0\.86\}[\s\S]*?depthTest\s+depthWrite=\{opacity >= 0\.999\}[\s\S]*?polygonOffsetUnits=\{-4\}/,
  "Canonical wall tops should use the same depth-tested seamless cut-surface treatment."
);

assert.match(
  source,
  /legacyWallTopMetersByFloor[\s\S]*?showTopCap=\{[\s\S]*?band\.topMeters[\s\S]*?legacyWallTopMetersByFloor\.get\(band\.floorLevel\)/,
  "Compatibility wall caps should render only at the real floor-level wall top, never at opening-band boundaries."
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
  /const selectedLogicalTargetKey = getStructureTargetKey\(\s*selectedSurfaceTarget\?\.roomId === activeRoomId\s*\? selectedSurfaceTarget/,
  "The page-controlled surface selection should suppress stale outlines when rooms switch or selection clears."
);

assert.match(
  source,
  /pieceKey\?: string;[\s\S]*?panelAliases\?: string\[\];[\s\S]*?surfaceSide\?: 1 \| -1;[\s\S]*?const persistedWallPanelKey =[\s\S]*?`\$\{selectedLogicalTargetKey\}:\$\{selectedSurfaceTarget\.panelId\}`/,
  "Wall selection must restore the exact persisted canonical panel and carry its compatibility aliases."
);

assert.doesNotMatch(
  source,
  /selectedWallPiece|setSelectedWallPiece/,
  "Canonical renderer surface state must be the only selected-wall identity."
);

assert.match(
  source,
  /const visibleHoveredTargetKey =\s*selectedSurfaceTarget\?\.kind === "wall" && selectedTargetKey\s*\? null\s*: hoveredTargetKey;[\s\S]*?hoveredTargetKey=\{visibleHoveredTargetKey\}[\s\S]*?selectedTargetKey=\{selectedTargetKey\}/,
  "A selected wall panel should keep the only visible wall outline while pointer movement crosses neighboring panels."
);

assert.match(
  source,
  /const interiorWallSurfacePanels =\s*buildWallSurfacePanels\(room, segment, wallOpenings\);[\s\S]*?const wallSurfacePanels = \[[\s\S]*?buildWallSurfacePanels\([\s\S]*?"exterior"[\s\S]*?getSharedWallRoomIds\([\s\S]*?const wallPanelParts = interiorWallSurfacePanels\.map\(\s*\(panel\) => panel\.part\s*\);[\s\S]*?splitWallPartsAtSharedBoundaries\([\s\S]*?wallPanelParts/,
  "Interior and exposed exterior surface topology must be built before shared-room structural ownership splits."
);

assert.match(
  source,
  /<CutawayWallMesh[\s\S]*?renderSurfaces=\{!isFullHeightStructuralPart\}[\s\S]*?interactive=\{false\}[\s\S]*?resolvedWallSurfacePanels\.map\(\s*\(panel\) => \([\s\S]*?<WallSurfacePanelMesh/,
  "Structural fragments must not render finish planes or receive raycasts; one canonical panel mesh owns both."
);

assert.match(
  source,
  /export function WallSurfacePanelMesh\([\s\S]*?pieceKey: `wall:\$\{panel\.roomId\}:\$\{panel\.faceId\}:\$\{panel\.panelId\}`,[\s\S]*?panelAliases: panel\.legacyPanelIds,[\s\S]*?getWallPanelSurfaceSettings\([\s\S]*?panel\.panelId[\s\S]*?panel\.legacyPanelIds/,
  "Every finish mesh must resolve one canonical target and one settings object with deterministic legacy fallbacks."
);

assert.match(
  source,
  /function getWallSurfacePanelId\([\s\S]*?"wall-panel",[\s\S]*?"v2",[\s\S]*?normalizeWallPanelIdToken\(room\.id\)[\s\S]*?normalizeWallPanelIdToken\(getWallSurfaceFaceId\(room, segment\)\)[\s\S]*?startAnchor[\s\S]*?endAnchor[\s\S]*?role/,
  "Canonical panel ids must be versioned and anchored by room, face, boundaries, and surface role."
);

assert.match(
  source,
  /const minPartLength = LEGACY_WALL_JOIN_TOLERANCE_METERS;/,
  "Legitimate narrow structural intervals must survive down to the common 2 mm topology tolerance."
);

assert.match(
  source,
  /const tolerance = LEGACY_WALL_JOIN_TOLERANCE_METERS;/,
  "Shared-wall discovery must use the same 2 mm geometry tolerance instead of the former broad threshold."
);

assert.match(
  source,
  /const legacyPanelIds = \[[\s\S]*?getSelectableWallSurfacePanelId\(legacyFacePanelId, side\)[\s\S]*?legacyFacePanelId,[\s\S]*?getSelectableWallSurfacePanelId\(part\.key, side\)[\s\S]*?part\.key/,
  "Each canonical panel must carry all prior side-specific and non-side assignment aliases."
);

assert.match(
  source,
  /const target: StructureTarget = \{[\s\S]*?roomId: panel\.roomId,[\s\S]*?id: panel\.faceId,[\s\S]*?panelId: panel\.panelId,[\s\S]*?surfaceSide: panel\.side/,
  "Clicks on a panel must return the canonical room, face, panel, and physical side."
);

assert.match(
  source,
  /<WallSurfaceSideMesh[\s\S]*?target=\{target\}[\s\S]*?texturePanelLength=\{joinedSurface\.length\}[\s\S]*?interactive=\{interactive\}/,
  "The one complete panel finish mesh must own raycasting and a UV domain spanning the whole panel."
);

assert.match(
  source,
  /function isWallSurfacePanelCutawayEligible\([\s\S]*?return forceCutaway && !hasSharedSupport && !isSelected;[\s\S]*?const cutawayEligible = isWallSurfacePanelCutawayEligible\(\{[\s\S]*?forceCutaway,[\s\S]*?hasSharedSupport,[\s\S]*?isSelected,/,
  "Panel-level cutaway must hide both finish-shell sides while pinning the complete selected or shared panel visible."
);
assert.doesNotMatch(
  source,
  /cutawayEligible[\s\S]{0,240}?panel\.role === "interior"/,
  "Exterior finish shells must not bypass the physical wall cutaway and remain as paper-thin walls."
);
assert.match(
  source,
  /resolveAtomicWallCutawayRenderState\(targetOpacity\)[\s\S]*?material\.opacity = renderState\.opacity;[\s\S]*?material\.depthWrite = renderState\.depthWrite;[\s\S]*?groupRef\.current\.visible = renderState\.visible;/,
  "Cutaway walls must settle opacity and depth ownership before becoming visible."
);
assert.doesNotMatch(
  source,
  /material\.opacity \+ \(targetOpacity - material\.opacity\) \* 0\.28|referenceOpacity \+ \(targetOpacity - referenceOpacity\) \* 0\.28/,
  "Wall cutaway transitions must not fade through the planning grid."
);
assert.equal(
  designSceneCanvasSource.match(
    /material-depthTest[\s\S]{0,80}?material-depthWrite=\{false\}/g
  )?.length,
  2,
  "Both floor and ceiling planning grids must depth-test without owning depth."
);

assert.match(
  source,
  /onSelectSurfaceTarget\(\{[\s\S]*?panelId: target\.panelId,[\s\S]*?panelAliases: target\.panelAliases,[\s\S]*?surfaceSide: target\.surfaceSide/,
  "Scene selection must pass canonical identity, aliases, and physical side into editor state."
);

assert.match(
  source,
  /const outlinePoints:[\s\S]*?\[outlineLeftX, outlineBottomY, outlineZ\][\s\S]*?\[outlineRightX, outlineBottomY, outlineZ\][\s\S]*?\[outlineRightX, outlineTopY, outlineZ\][\s\S]*?\[outlineLeftX, outlineTopY, outlineZ\][\s\S]*?\[outlineLeftX, outlineBottomY, outlineZ\][\s\S]*?key=\{`wall-surface-panel-outline:\$\{panel\.panelId\}`\}[\s\S]*?renderOrder=\{25\}[\s\S]*?depthTest=\{false\}[\s\S]*?depthWrite=\{false\}/,
  "A selected canonical panel must draw one closed four-edge overlay that cannot be occluded by adjacent wall caps."
);

assert.doesNotMatch(
  source,
  /key=\{`wall-panel-outline:\$\{surface\.key\}/,
  "The renderer must not retain per-fragment duplicate wall outlines."
);

assert.doesNotMatch(
  source,
  /data-testid="house-room-3d-label"|activeFloorBounds|from "@react-three\/drei\/web\/Html"/,
  "Whole-home 3D should stay uncluttered without persistent floating room or floor labels."
);

console.log("House-plan wall rendering guardrails passed.");
