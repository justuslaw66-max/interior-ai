import assert from "node:assert/strict";
import {
  buildHousePlan2D,
  HOUSE_PLAN_TEMPLATES,
  type HousePlanRoom2D,
} from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import { canonicalFloorPlanToDesignSnapshot } from "@/lib/floor-plan-legacy-adapters";
import { loadPingYiCourtV2ReviewSeedBundle } from "@/lib/floor-plan-seeds/ping-yi-court-review-intake";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { isPointInPlanarRing } from "@/lib/floor-plan-planar-union";
import {
  buildLegacyFloorSlabsForTest,
  buildLegacyWallBandsForTest,
  getLegacyPhysicalWallCutEndOptionsForTest,
  getLegacyWallSurfaceJoinRangesForTest,
  getLegacyWallOpeningCountsForTest,
  getLegacySharedWallMatchesForTest,
  getLegacyWallSurfaceSeamOverlaps,
  resolveLegacyCameraCutawaySegmentKeysForTest,
} from "@/components/editor/renderers/HousePlanRenderer3D";
import {
  buildLegacyWallBandCoreGeometry,
  buildLegacyWallFaceRenderPatchesForTest,
  buildWallFinishShellGeometry,
  buildWallParts,
  buildWallSurfacePanels,
  getLogicalWallPanelForPart,
  getSelectableWallFacePanelId,
  getSelectableWallSurfacePanelId,
  getSharedWallMatches,
  getSharedWallOverlapRanges,
  getSharedWallRenderOwnerRoomId,
  getSharedWallRoomIds,
  getWallOpenings,
  getWallSegments,
  isWallSurfacePanelCutawayEligible,
  resolveAtomicWallCutawayRenderState,
  splitWallPartsAtSharedBoundaries,
  withWallSurfacePanelSupportIntervals,
  type WallOpening3D,
} from "@/components/editor/renderers/house-plan-3d/geometry";

assert.equal(
  isWallSurfacePanelCutawayEligible({
    forceCutaway: true,
    hasSharedSupport: false,
    isSelected: false,
  }),
  true,
  "An exposed finish shell on either physical side must disappear with its camera-facing cutaway wall."
);
assert.equal(
  isWallSurfacePanelCutawayEligible({
    forceCutaway: true,
    hasSharedSupport: true,
    isSelected: false,
  }),
  false,
  "A shared partition must remain visible even when an exterior wall is cut away."
);
assert.equal(
  isWallSurfacePanelCutawayEligible({
    forceCutaway: true,
    hasSharedSupport: false,
    isSelected: true,
  }),
  false,
  "The selected canonical panel must stay pinned visible during a cutaway."
);

assert.deepEqual(
  resolveAtomicWallCutawayRenderState(1),
  {
    visible: true,
    opacity: 1,
    transparent: false,
    depthWrite: true,
  },
  "A wall returning from cutaway must become opaque and own depth in the same frame it becomes visible."
);
assert.deepEqual(
  resolveAtomicWallCutawayRenderState(0),
  {
    visible: false,
    opacity: 0,
    transparent: true,
    depthWrite: false,
  },
  "A cutaway wall must be hidden atomically instead of fading across the workspace grid."
);

const finishShellGeometry = buildWallFinishShellGeometry({
  widthMeters: 1.55,
  heightMeters: 2.5,
  thicknessMeters: 0.0015,
});
assert.equal(
  finishShellGeometry.userData.removedInnerFaceTriangleCount,
  2,
  "A physical finish shell must omit the flush inner broad face so the opposite room cannot raycast or render it."
);
const finishShellNormals = finishShellGeometry.getAttribute("normal");
for (
  let triangleIndex = 0;
  triangleIndex < finishShellNormals.count;
  triangleIndex += 3
) {
  assert.equal(
    [0, 1, 2].every(
      (offset) =>
        finishShellNormals.getZ(triangleIndex + offset) < -0.999
    ),
    false,
    "No finish-shell triangle may become a second broad depth owner on the structural boundary."
  );
}
finishShellGeometry.dispose();

const rectangularRoom: HousePlanRoom2D = {
  id: "right-angle-room",
  name: "Right-angle room",
  roomType: "living",
  x: 0,
  z: 0,
  w: 4,
  d: 3,
  height: 2.6,
  wallThickness: 0.2,
  shape: "custom_polygon",
  polygon: [
    { x: -2, z: -1.5 },
    { x: 2, z: -1.5 },
    { x: 2, z: 1.5 },
    { x: -2, z: 1.5 },
  ],
};
const supportedFloorSlab = buildLegacyFloorSlabsForTest({
  rooms: [rectangularRoom],
  defaultWallHeight: 2.6,
  stackedFloors: false,
})[0];
assert.ok(supportedFloorSlab);
assert.equal(
  supportedFloorSlab.thicknessMeters,
  0.1,
  "A compatibility floor without an explicit slab depth should use the architectural 100 mm default."
);
const supportedFloorOuter = supportedFloorSlab.polygons[0]?.outer ?? [];
assert.deepEqual(
  {
    minX: Math.min(...supportedFloorOuter.map((point) => point.xMm)),
    maxX: Math.max(...supportedFloorOuter.map((point) => point.xMm)),
    minZ: Math.min(...supportedFloorOuter.map((point) => point.zMm)),
    maxZ: Math.max(...supportedFloorOuter.map((point) => point.zMm)),
  },
  { minX: -2100, maxX: 2100, minZ: -1600, maxZ: 1600 },
  "Visible walls must remain fully supported to their outer face."
);
assert.equal(
  isPointInPlanarRing({ xMm: 2090, zMm: 0 }, supportedFloorOuter),
  true,
  "A visible wall must not overhang the structural floor slab."
);
const cameraIndependentFloorSlab = buildLegacyFloorSlabsForTest({
  rooms: [rectangularRoom],
  defaultWallHeight: 2.6,
  stackedFloors: false,
})[0];
assert.ok(cameraIndependentFloorSlab);
const cameraIndependentFloorOuter =
  cameraIndependentFloorSlab.polygons[0]?.outer ?? [];
assert.equal(
  isPointInPlanarRing(
    { xMm: 2090, zMm: 0 },
    cameraIndependentFloorOuter
  ),
  true,
  "The structural slab perimeter must remain continuous when camera-facing walls are cut away."
);
assert.equal(
  isPointInPlanarRing(
    { xMm: -2090, zMm: 0 },
    cameraIndependentFloorOuter
  ),
  true,
  "Both opposing wall lines must retain equal structural floor support."
);
const doorwayRoom: HousePlanRoom2D = {
  ...rectangularRoom,
  id: "doorway-room",
  shape: "rectangle",
  polygon: undefined,
};
const twoDoorRoom: HousePlanRoom2D = {
  ...doorwayRoom,
  id: "two-door-room",
  name: "Two door room",
  w: 6,
  d: 4,
};
const twoDoorNorthSegment = getWallSegments(twoDoorRoom).find(
  (segment) => segment.wall === "north"
);
assert.ok(twoDoorNorthSegment);
const twoDoorOpenings: WallOpening3D[] = [
  {
    id: "left-door",
    sourceId: "left-door",
    offset: -1,
    width: 1,
    height: 2.1,
    bottom: 0,
    kind: "door",
  },
  {
    id: "right-door",
    sourceId: "right-door",
    offset: 1,
    width: 1,
    height: 2.1,
    bottom: 0,
    kind: "door",
  },
];
const panelsAroundTwoDoors = buildWallParts(
  twoDoorNorthSegment,
  twoDoorOpenings
);
assert.deepEqual(
  panelsAroundTwoDoors.map((part) => Number(part.length.toFixed(3))),
  [1.5, 1, 1.5],
  "Two doors should create exactly three selectable full-height panels, including the narrow panel between them."
);
assert.equal(
  new Set(panelsAroundTwoDoors.map((part) => part.key)).size,
  panelsAroundTwoDoors.length,
  "Every wall panel around multiple doors must have a unique selection identity."
);
const twoDoorSelectionIds = panelsAroundTwoDoors.map(
  getSelectableWallFacePanelId
);
assert.equal(
  new Set(twoDoorSelectionIds).size,
  panelsAroundTwoDoors.length,
  "Every wall face around multiple doors must receive its own dedicated selectable-face id."
);
assert(
  twoDoorSelectionIds.every(
    (selectionId, index) => selectionId !== panelsAroundTwoDoors[index]?.key
  ),
  "A new exact-face id must never collide with its legacy parent-panel id."
);
const twoDoorPhysicalSideIds = twoDoorSelectionIds.flatMap((facePanelId) => [
  getSelectableWallSurfacePanelId(facePanelId, 1),
  getSelectableWallSurfacePanelId(facePanelId, -1),
]);
assert.equal(
  new Set(twoDoorPhysicalSideIds).size,
  panelsAroundTwoDoors.length * 2,
  "Every post-split panel must expose two different physical-side ids without selecting the opposite face."
);
const twoDoorRendererOpenings: RoomRendererOpening[] = twoDoorOpenings.map(
  (opening) => ({
    id: opening.id,
    roomId: twoDoorRoom.id,
    wall: "north",
    kind: opening.kind,
    offset: opening.offset,
    width: opening.width,
    height: opening.height,
    bottom: opening.bottom,
  })
);
const twoDoorFacePatches = buildLegacyWallFaceRenderPatchesForTest({
  rooms: [twoDoorRoom],
  openings: twoDoorRendererOpenings,
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.equal(
  new Set(twoDoorFacePatches.map((patch) => patch.key)).size,
  twoDoorFacePatches.length,
  "Every visible compatibility wall patch must have one unique render identity."
);
const narrowNorthPatch = twoDoorFacePatches.find(
  (patch) =>
    patch.kind === "panel" &&
    patch.segmentKey.endsWith("-north") &&
    Math.abs(
      Math.hypot(
        patch.end.x - patch.start.x,
        patch.end.z - patch.start.z
      ) - 1
    ) <= 0.002
);
assert.ok(
  narrowNorthPatch,
  "The narrow wall between two doors must be represented by one complete finish patch."
);
const twoDoorWallBands = buildLegacyWallBandsForTest({
  rooms: [twoDoorRoom],
  openings: twoDoorRendererOpenings,
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert(twoDoorWallBands.length > 0);
const twoDoorCoreGeometries = twoDoorWallBands.map((band, index) =>
  buildLegacyWallBandCoreGeometry({
    band,
    facePatches: twoDoorFacePatches,
    removeTopCap: index === twoDoorWallBands.length - 1,
  })
);
assert(
  twoDoorCoreGeometries.some(
    (geometry) =>
      Number(geometry.userData.removedCoveredTriangleCount) > 0
  ),
  "The structural shell must omit broad triangles covered by visible finish patches."
);
assert(
  twoDoorCoreGeometries.every(
    (geometry) =>
      Number(geometry.userData.wallFaceRenderPatchCount) > 0
  ),
  "Every wall-height band must reconcile against the canonical finish coverage."
);
assert.deepEqual(
  [
    ...new Set(
      twoDoorCoreGeometries.flatMap(
        (geometry) =>
          (geometry.userData.unmatchedWallFacePatchKeys as string[]) ?? []
      )
    ),
  ],
  [],
  "Every finish patch overlapping a wall-height band must replace at least one structural broad-face triangle."
);
twoDoorCoreGeometries.forEach((geometry) => geometry.dispose());
const partialNorthNeighbor: HousePlanRoom2D = {
  ...doorwayRoom,
  id: "partial-north-neighbor",
  name: "Partial north neighbor",
  x: 2.5,
  z: -3,
  w: 1,
  d: 2,
};
const panelsAtRoomBoundary = splitWallPartsAtSharedBoundaries(
  twoDoorRoom,
  [twoDoorRoom, partialNorthNeighbor],
  twoDoorNorthSegment,
  panelsAroundTwoDoors
);
assert.deepEqual(
  panelsAtRoomBoundary.map((part) => Number(part.length.toFixed(3))),
  [1.5, 1, 0.5, 1],
  "Structural wall fragments should still stop at shared-room boundaries."
);
const logicalPanelsAtRoomBoundary = panelsAtRoomBoundary.map((part) =>
  getLogicalWallPanelForPart(panelsAroundTwoDoors, part)
);
assert(
  logicalPanelsAtRoomBoundary.every((panel) => Boolean(panel)),
  "Every structural fragment must resolve back to its uninterrupted wall panel."
);
const logicalSelectionIdsAtRoomBoundary = logicalPanelsAtRoomBoundary.map(
  (panel) => getSelectableWallFacePanelId(panel!)
);
assert.equal(
  new Set(logicalSelectionIdsAtRoomBoundary).size,
  3,
  "A shared-room boundary must not turn one uninterrupted wall into an extra selectable/material section."
);
assert.equal(
  logicalSelectionIdsAtRoomBoundary[2],
  logicalSelectionIdsAtRoomBoundary[3],
  "Both structural fragments on the same side of an opening must behave as one wall panel."
);
assert.notEqual(
  logicalSelectionIdsAtRoomBoundary[1],
  logicalSelectionIdsAtRoomBoundary[2],
  "The real opening must continue to separate the between-doors panel from its neighbor."
);
const tinySharedFragment = {
  key: `${twoDoorNorthSegment.key}-tiny-shared-fragment`,
  x: 2.1,
  z: twoDoorNorthSegment.z,
  length: 0.2,
};
assert.deepEqual(
  getSharedWallRoomIds(
    twoDoorRoom,
    [twoDoorRoom, partialNorthNeighbor],
    twoDoorNorthSegment,
    tinySharedFragment
  ),
  [partialNorthNeighbor.id],
  "A shared wall fragment narrower than 350 mm must not be misclassified as an exterior face."
);
assert.equal(
  getSharedWallMatches(
    twoDoorRoom,
    [twoDoorRoom, partialNorthNeighbor],
    twoDoorNorthSegment,
    tinySharedFragment
  ).length,
  1,
  "A narrow shared fragment must resolve its opposite room instead of rendering a second overlapping exterior surface."
);
assert.equal(
  getSharedWallRenderOwnerRoomId(
    twoDoorRoom,
    [twoDoorRoom, partialNorthNeighbor],
    twoDoorNorthSegment,
    tinySharedFragment
  ),
  partialNorthNeighbor.id,
  "Narrow shared fragments must use the same deterministic physical-wall owner as larger fragments."
);
assert.equal(
  panelsAtRoomBoundary.find(
    (part) => Math.abs(part.x) <= 0.001
  )?.key,
  `${twoDoorNorthSegment.key}-part-1`,
  "The small wall panel between two doors must remain one independently selectable piece."
);
assert.equal(
  getSelectableWallFacePanelId(
    panelsAtRoomBoundary.find(
      (part) => Math.abs(part.x) <= 0.001
    )!
  ),
  `${twoDoorNorthSegment.key}-part-1-selectable-face`,
  "The small between-doors panel must keep a stable exact-face selection id."
);
const betweenDoorsFacePanelId = getSelectableWallFacePanelId(
  panelsAtRoomBoundary.find(
    (part) => Math.abs(part.x) <= 0.001
  )!
);
assert.equal(
  getSelectableWallSurfacePanelId(betweenDoorsFacePanelId, 1),
  `${twoDoorNorthSegment.key}-part-1-selectable-face-side-positive`,
  "The positive side of the between-doors panel must have its own stable target."
);
assert.equal(
  getSelectableWallSurfacePanelId(betweenDoorsFacePanelId, -1),
  `${twoDoorNorthSegment.key}-part-1-selectable-face-side-negative`,
  "The opposite side of the between-doors panel must not reuse the selected face target."
);

const studioTemplate = HOUSE_PLAN_TEMPLATES.find(
  (template) => template.id === "studio"
);
assert.ok(studioTemplate, "The real Studio template must remain available.");
const studioRooms: HousePlanRoom2D[] = studioTemplate.rooms.map((room) => ({
  id: room.id,
  name: room.name,
  roomType: room.roomType,
  x: room.x,
  z: room.z,
  w: room.width,
  d: room.depth,
  height: 2.5,
  wallThickness: room.wallThickness ?? 0.12,
  shape: room.shape,
  polygon: room.planPolygon,
}));
const studioOpenings: RoomRendererOpening[] = studioTemplate.doorways.map(
  (doorway, index) => ({
    id: `studio-doorway-${index}`,
    roomId: doorway.fromRoomId,
    wall: doorway.wall,
    kind: "door",
    offset: doorway.offsetMeters ?? 0,
    width: doorway.widthMeters ?? 0.9,
    height: 2.1,
    bottom: 0,
    doorStyle: doorway.operation === "open" ? "open" : "swing",
  })
);
const studioLiving = studioRooms.find((room) => room.id === "living");
assert.ok(studioLiving);
const studioLivingEast = getWallSegments(studioLiving).find(
  (segment) => segment.wall === "east"
);
assert.ok(studioLivingEast);
const studioLivingEastOpenings = getWallOpenings(
  studioLiving,
  studioLivingEast,
  studioRooms,
  studioOpenings
);
assert.deepEqual(
  studioLivingEastOpenings
    .map((opening) => Number(opening.offset.toFixed(2)))
    .sort((a, b) => a - b),
  [-1.35, 0.4],
  "The Studio Living east face must combine its direct Kitchen doorway with the mirrored Entry doorway."
);
const studioLivingEastPanels = buildWallSurfacePanels(
  studioLiving,
  studioLivingEast,
  studioLivingEastOpenings
);
assert.deepEqual(
  studioLivingEastPanels.map((panel) => Number(panel.part.length.toFixed(2))),
  [0.45, 0.7, 1.55],
  "The Studio Living east face must expose exactly its three uninterrupted visible pieces."
);
assert.equal(
  new Set(studioLivingEastPanels.map((panel) => panel.panelId)).size,
  3,
  "Every Studio Living east visible piece must have one globally unique canonical panel id."
);
assert(
  studioLivingEastPanels.every((panel) =>
    panel.panelId.startsWith("wall-panel:v2:1:living:east:")
  ),
  "Studio panel identity must use the v2 room-facing topology contract."
);
const studioLivingStructuralParts = splitWallPartsAtSharedBoundaries(
  studioLiving,
  studioRooms,
  studioLivingEast,
  buildWallParts(studioLivingEast, studioLivingEastOpenings)
);
assert.deepEqual(
  studioLivingStructuralParts.map((part) => Number(part.length.toFixed(2))),
  [0.45, 0.45, 0.25, 0.25, 1.3],
  "Studio structural ownership may split at Kitchen/Entry and Entry/Bathroom boundaries."
);
const studioPanelByPartKey = new Map(
  studioLivingEastPanels.map((panel) => [panel.part.key, panel.panelId])
);
const studioStructuralPanelIds = studioLivingStructuralParts.map((part) => {
  const logicalPart = getLogicalWallPanelForPart(
    studioLivingEastPanels.map((panel) => panel.part),
    part
  );
  assert.ok(logicalPart, `Structural fragment ${part.key} must map to a panel.`);
  const panelId = studioPanelByPartKey.get(logicalPart.key);
  assert.ok(panelId);
  return panelId;
});
assert.equal(
  studioStructuralPanelIds[1],
  studioStructuralPanelIds[2],
  "Both halves of the 0.70 m Living piece must map to one canonical panel."
);
assert.equal(
  studioStructuralPanelIds[3],
  studioStructuralPanelIds[4],
  "Both halves of the 1.55 m Living piece must map to one canonical panel."
);
assert.equal(
  new Set(studioStructuralPanelIds).size,
  3,
  "Shared-room ownership boundaries must not create extra Studio surface targets."
);
const studioPanelsWithSupport = withWallSurfacePanelSupportIntervals(
  studioLivingEastPanels,
  studioLivingEast,
  studioLivingStructuralParts
);
assert.deepEqual(
  studioPanelsWithSupport.map(
    (panel) => panel.supportingStructuralIntervals.length
  ),
  [1, 2, 2],
  "Canonical Studio panels must explicitly retain every internal structural interval they cover."
);
assert(
  studioPanelsWithSupport[1]?.legacyPanelIds.some((alias) =>
    alias.includes("shared-split-")
  ) &&
    studioPanelsWithSupport[2]?.legacyPanelIds.some((alias) =>
      alias.includes("shared-split-")
    ),
  "Canonical panels must keep legacy shared-fragment aliases so old finishes can be consolidated and removed."
);

const oppositeStudioPanelIds = studioRooms
  .filter((room) => ["kitchen", "entry", "bathroom"].includes(room.id))
  .flatMap((room) => {
    const west = getWallSegments(room).find((segment) => segment.wall === "west");
    assert.ok(west);
    return buildWallSurfacePanels(
      room,
      west,
      getWallOpenings(room, west, studioRooms, studioOpenings)
    ).map((panel) => panel.panelId);
  });
assert(
  oppositeStudioPanelIds.every(
    (panelId) =>
      !studioLivingEastPanels.some((livingPanel) => livingPanel.panelId === panelId)
  ),
  "Kitchen, Entry, and Bathroom-facing surfaces must never reuse a Living panel id."
);

const focusedStudioWallBands = buildLegacyWallBandsForTest({
  rooms: [studioLiving],
  topologyRooms: studioRooms,
  openings: studioOpenings,
  defaultWallHeight: 2.5,
  stackedFloors: false,
});
const focusedStudioDoorHeightBand = focusedStudioWallBands.find(
  (band) => band.bottomMeters <= 1 && band.topMeters >= 1
);
assert.ok(focusedStudioDoorHeightBand);
const studioEastDirection = [
  Math.cos(studioLivingEast.rotationY),
  -Math.sin(studioLivingEast.rotationY),
] as const;
const focusedStudioEastPointAt = (offset: number) => ({
  xMm: Math.round(
    (studioLiving.x +
      studioLivingEast.x +
      studioEastDirection[0] * offset) *
      1000
  ),
  zMm: Math.round(
    (studioLiving.z +
      studioLivingEast.z +
      studioEastDirection[1] * offset) *
      1000
  ),
});
const focusedStudioBandContains = (offset: number) => {
  const point = focusedStudioEastPointAt(offset);
  return focusedStudioDoorHeightBand.polygons.some(
    (polygon) =>
      isPointInPlanarRing(point, polygon.outer) &&
      !polygon.holes.some((hole) => isPointInPlanarRing(point, hole))
  );
};
assert.equal(
  focusedStudioBandContains(-1.35),
  false,
  "Focus room rendering must retain the direct Kitchen doorway in the Living east wall."
);
assert.equal(
  focusedStudioBandContains(0.4),
  false,
  "Focus room rendering must retain the mirrored Entry doorway owned by a hidden adjacent room."
);
assert.equal(
  focusedStudioBandContains(-2.175),
  true,
  "Focus room rendering must keep the first solid Living east wall panel."
);
assert.equal(
  focusedStudioBandContains(-0.475),
  true,
  "Focus room rendering must keep the narrow Living east panel between both doorways."
);
assert.equal(
  focusedStudioBandContains(1.625),
  true,
  "Focus room rendering must keep the final Living east wall panel."
);

const studioFaceRenderPatches =
  buildLegacyWallFaceRenderPatchesForTest({
    rooms: studioRooms,
    openings: studioOpenings,
    defaultWallHeight: 2.5,
    stackedFloors: false,
  });
assert.equal(
  new Set(studioFaceRenderPatches.map((patch) => patch.key)).size,
  studioFaceRenderPatches.length,
  "Every real Studio finish patch must have one globally unique render identity."
);
const studioWallBands = buildLegacyWallBandsForTest({
  rooms: studioRooms,
  openings: studioOpenings,
  defaultWallHeight: 2.5,
  stackedFloors: false,
});
const studioCoreGeometries = studioWallBands.map((band, index) =>
  buildLegacyWallBandCoreGeometry({
    band,
    facePatches: studioFaceRenderPatches,
    removeTopCap: index === studioWallBands.length - 1,
  })
);
assert.deepEqual(
  [
    ...new Set(
      studioCoreGeometries.flatMap(
        (geometry) =>
          (geometry.userData.unmatchedWallFacePatchKeys as string[]) ?? []
      )
    ),
  ],
  [],
  "Every Studio panel and doorway-fragment patch must replace its structural broad face in each overlapping height band."
);
assert(
  studioCoreGeometries.every(
    (geometry) =>
      Number(geometry.userData.removedCoveredTriangleCount) > 0
  ),
  "Every real Studio wall-height band must omit all competing broad-face triangles beneath finish patches."
);
studioCoreGeometries.forEach((geometry) => geometry.dispose());

const actualTwoHundredMillimeterNeighbor: HousePlanRoom2D = {
  ...doorwayRoom,
  id: "actual-200mm-neighbor",
  name: "Actual 200 mm neighbor",
  x: 0,
  z: -2.5,
  w: 0.2,
  d: 1,
};
assert.deepEqual(
  getSharedWallOverlapRanges(
    twoDoorRoom,
    [twoDoorRoom, actualTwoHundredMillimeterNeighbor],
    twoDoorNorthSegment
  ).map((range) => Number((range.end - range.start).toFixed(3))),
  [0.2],
  "A true 200 mm shared overlap must be discovered instead of filtered by the removed 350 mm threshold."
);

const narrowBetweenDoorPanels = buildWallSurfacePanels(
  doorwayRoom,
  getWallSegments(doorwayRoom).find((segment) => segment.wall === "north")!,
  [
    {
      id: "narrow-left",
      sourceId: "narrow-left",
      offset: -0.55,
      width: 1,
      kind: "door",
    },
    {
      id: "narrow-right",
      sourceId: "narrow-right",
      offset: 0.55,
      width: 1,
      kind: "door",
    },
  ]
);
assert.equal(
  Number(narrowBetweenDoorPanels[1]?.part.length.toFixed(3)),
  0.1,
  "A legitimate 100 mm wall between two doorways must remain an independently selectable panel."
);

const duplicateAndOverlappingOpeningPanels = buildWallSurfacePanels(
  doorwayRoom,
  getWallSegments(doorwayRoom).find((segment) => segment.wall === "north")!,
  [
    {
      id: "duplicate-direct",
      sourceId: "canonical-opening",
      offset: -0.3,
      width: 0.8,
      kind: "door",
    },
    {
      id: "duplicate-mirrored",
      sourceId: "canonical-opening",
      offset: -0.3,
      width: 0.8,
      kind: "door",
    },
    {
      id: "overlapping-opening",
      sourceId: "overlapping-opening",
      offset: 0.3,
      width: 0.8,
      kind: "door",
    },
  ]
);
assert.deepEqual(
  duplicateAndOverlappingOpeningPanels.map((panel) =>
    Number(panel.part.length.toFixed(3))
  ),
  [1.3, 1.3],
  "Duplicate direct/mirrored records and overlapping openings must collapse into one deterministic gap."
);
const seamSegment = {
  key: "doorway-room-north",
  roomId: doorwayRoom.id,
  side: "north" as const,
  axis: "x" as const,
  x: 0,
  z: -1.5,
  length: 4,
  rotationY: 0,
};
const seamOverlaps = getLegacyWallSurfaceSeamOverlaps(
  seamSegment,
  [
    {
      key: "full-left",
      x: -1.25,
      z: -1.5,
      length: 1.5,
      height: 2.6,
      centerY: 1.3,
    },
    {
      key: "lintel",
      x: 0,
      z: -1.5,
      length: 1,
      height: 0.5,
      centerY: 2.35,
    },
    {
      key: "full-right",
      x: 1.25,
      z: -1.5,
      length: 1.5,
      height: 2.6,
      centerY: 1.3,
    },
  ],
  2.6
);
assert.deepEqual(
  seamOverlaps.get("lintel"),
  { startMeters: 0.006, endMeters: 0.006 },
  "A lintel finish should cover both internal part boundaries."
);
assert.deepEqual(
  seamOverlaps.get("full-left"),
  { startMeters: 0, endMeters: 0 },
  "A full-height side wall must not extend into the doorway beneath a lintel."
);
assert.deepEqual(
  seamOverlaps.get("full-right"),
  { startMeters: 0, endMeters: 0 },
  "The opposite full-height side wall must also stop at the doorway."
);
const northRectangleCutEnds = getLegacyPhysicalWallCutEndOptionsForTest({
  rooms: [doorwayRoom],
  excludedSegmentKeys: new Set(["doorway-room-north"]),
});
for (const segmentKey of ["doorway-room-east", "doorway-room-west"]) {
  const options = northRectangleCutEnds.find(
    (entry) => entry.segmentKey === segmentKey
  );
  assert.equal(
    options?.squareStart,
    true,
    `${segmentKey} must stop flush at the north cutaway endpoint.`
  );
  assert.equal(
    options?.squareEnd,
    false,
    `${segmentKey} must retain its closed south corner.`
  );
}
const southRectangleCutEnds = getLegacyPhysicalWallCutEndOptionsForTest({
  rooms: [doorwayRoom],
  excludedSegmentKeys: new Set(["doorway-room-south"]),
});
for (const segmentKey of ["doorway-room-east", "doorway-room-west"]) {
  const options = southRectangleCutEnds.find(
    (entry) => entry.segmentKey === segmentKey
  );
  assert.equal(
    options?.squareStart,
    false,
    `${segmentKey} must retain its closed north corner.`
  );
  assert.equal(
    options?.squareEnd,
    true,
    `${segmentKey} must stop flush at the south cutaway endpoint.`
  );
}
const doorwayFloorSlab = buildLegacyFloorSlabsForTest({
  rooms: [doorwayRoom],
  openings: [
    {
      id: "east-door",
      roomId: doorwayRoom.id,
      wall: "east",
      kind: "door",
      offset: 0,
      width: 0.9,
      height: 2.1,
    },
  ],
  defaultWallHeight: 2.6,
  stackedFloors: false,
})[0];
assert.ok(doorwayFloorSlab);
const doorwayFloorOuter = doorwayFloorSlab.polygons[0]?.outer ?? [];
assert.equal(
  isPointInPlanarRing({ xMm: 2090, zMm: 0 }, doorwayFloorOuter),
  false,
  "Door gaps must not expose a raised strip of structural slab across the finished floor."
);
assert.equal(
  isPointInPlanarRing({ xMm: 2090, zMm: 1000 }, doorwayFloorOuter),
  true,
  "The wall beside a doorway must remain supported to its outer face."
);
const adjacentPolygonRooms: HousePlanRoom2D[] = [
  {
    ...rectangularRoom,
    id: "polygon-left",
    name: "Polygon left",
    x: -2,
  },
  {
    ...rectangularRoom,
    id: "polygon-right",
    name: "Polygon right",
    x: 2,
  },
];
const polygonSharedWallMatches = getLegacySharedWallMatchesForTest(
  adjacentPolygonRooms
);
assert.deepEqual(
  polygonSharedWallMatches.find(
    (entry) => entry.segmentKey === "polygon-left-1"
  )?.matches,
  [{ roomId: "polygon-right", segmentKey: "polygon-right-3" }],
  "Coincident custom-polygon edges must resolve as one shared physical wall."
);
assert.deepEqual(
  polygonSharedWallMatches.find(
    (entry) => entry.segmentKey === "polygon-right-3"
  )?.matches,
  [{ roomId: "polygon-left", segmentKey: "polygon-left-1" }],
  "Custom-polygon shared-wall matching must be symmetric."
);
const physicalCutEndOptions = getLegacyPhysicalWallCutEndOptionsForTest({
  rooms: adjacentPolygonRooms,
  excludedSegmentKeys: new Set(["polygon-left-2"]),
});
assert.equal(
  physicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-left-1"
  )?.squareEnd,
  true,
  "A surviving wall should stop flush where its own neighboring wall is cut away."
);
assert.equal(
  physicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-right-3"
  )?.squareStart,
  true,
  "Every copy of a shared physical wall must inherit the same flush cutaway endpoint."
);
const mirroredPhysicalCutEndOptions =
  getLegacyPhysicalWallCutEndOptionsForTest({
    rooms: adjacentPolygonRooms,
    excludedSegmentKeys: new Set(["polygon-left-0"]),
  });
assert.equal(
  mirroredPhysicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-left-1"
  )?.squareStart,
  true,
  "The opposite end of a surviving wall must also stop flush at a cutaway."
);
assert.equal(
  mirroredPhysicalCutEndOptions.find(
    (entry) => entry.segmentKey === "polygon-right-3"
  )?.squareEnd,
  true,
  "Reversed shared-wall copies must inherit the flush endpoint on both sides."
);
const leftCameraPolygonCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: adjacentPolygonRooms,
  activeRoomId: "polygon-left",
  cameraX: -12,
  cameraZ: 0,
  viewDirectionX: 1,
  viewDirectionZ: 0,
});
const rightCameraPolygonCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: adjacentPolygonRooms,
  activeRoomId: "polygon-left",
  cameraX: 12,
  cameraZ: 0,
  viewDirectionX: -1,
  viewDirectionZ: 0,
});
for (const cutawayKeys of [leftCameraPolygonCutawayKeys, rightCameraPolygonCutawayKeys]) {
  assert.equal(
    cutawayKeys.has("polygon-left-1") || cutawayKeys.has("polygon-right-3"),
    false,
    "The shared middle wall must remain visible from both opposing camera directions."
  );
}
const tJunctionRooms: HousePlanRoom2D[] = [
  {
    ...rectangularRoom,
    id: "t-top-left",
    name: "T top left",
    x: -1,
    z: -1,
    w: 2,
    d: 2,
    polygon: [
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: 1, z: 1 },
      { x: -1, z: 1 },
    ],
  },
  {
    ...rectangularRoom,
    id: "t-top-right",
    name: "T top right",
    x: 1,
    z: -1,
    w: 2,
    d: 2,
    polygon: [
      { x: -1, z: -1 },
      { x: 1, z: -1 },
      { x: 1, z: 1 },
      { x: -1, z: 1 },
    ],
  },
  {
    ...rectangularRoom,
    id: "t-bottom",
    name: "T bottom",
    x: 0,
    z: 1,
    w: 4,
    d: 2,
    polygon: [
      { x: -2, z: -1 },
      { x: 2, z: -1 },
      { x: 2, z: 1 },
      { x: -2, z: 1 },
    ],
  },
];
const tJunctionBands = buildLegacyWallBandsForTest({
  rooms: tJunctionRooms,
  openings: [],
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.equal(tJunctionBands.length, 1);
assert.equal(tJunctionBands[0].polygons.length, 1);
assert.equal(
  tJunctionBands[0].polygons[0].outer.length,
  4,
  "A T-junction wall union should keep one rectangular exterior without protruding miter spikes."
);
assert.equal(tJunctionBands[0].polygons[0].holes.length, 3);
assert(
  tJunctionBands[0].polygons[0].holes.every((hole) => hole.length === 4),
  "A T-junction should leave three clean rectangular room interiors without intersecting wall ends."
);
const rectangularBands = buildLegacyWallBandsForTest({
  rooms: [rectangularRoom],
  openings: [],
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.deepEqual(
  rectangularBands[0].polygons[0].outer,
  [
    { xMm: 2100, zMm: -1600 },
    { xMm: 2100, zMm: 1600 },
    { xMm: -2100, zMm: 1600 },
    { xMm: -2100, zMm: -1600 },
  ],
  "A rectangular room must have four clean unioned exterior corners without stepped end caps."
);
assert.deepEqual(rectangularBands[0].polygons[0].holes, [[
  { xMm: -1900, zMm: -1400 },
  { xMm: -1900, zMm: 1400 },
  { xMm: 1900, zMm: 1400 },
  { xMm: 1900, zMm: -1400 },
]]);
const firstSurfaceJoin = getLegacyWallSurfaceJoinRangesForTest(
  rectangularRoom,
  0.2
)[0];
assert.ok(
  Math.abs(firstSurfaceJoin.plus.length - 3.8) < 0.000001,
  "The interior finish should end at the two inside wall corners."
);
assert.ok(
  Math.abs(firstSurfaceJoin.minus.length - 4.2) < 0.000001,
  "The exterior finish should extend only to the two outside wall corners."
);
assert.equal(firstSurfaceJoin.plus.centerDelta, 0);
assert.equal(firstSurfaceJoin.minus.centerDelta, 0);

const rectangularCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: [rectangularRoom],
  activeRoomId: rectangularRoom.id,
  cameraX: 6,
  cameraZ: 5,
});
assert.deepEqual(
  [...rectangularCutawayKeys].sort(),
  ["right-angle-room-1", "right-angle-room-2"],
  "A south-east dollhouse camera should remove the east and south wall segments."
);
const zoomedCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: [rectangularRoom],
  activeRoomId: rectangularRoom.id,
  cameraX: 0.25,
  cameraZ: 0.2,
  viewDirectionX: -6,
  viewDirectionZ: -5,
});
const distantCutawayKeys = resolveLegacyCameraCutawaySegmentKeysForTest({
  rooms: [rectangularRoom],
  activeRoomId: rectangularRoom.id,
  cameraX: 60,
  cameraZ: 50,
  viewDirectionX: -6,
  viewDirectionZ: -5,
});
assert.deepEqual(
  [...zoomedCutawayKeys].sort(),
  [...distantCutawayKeys].sort(),
  "Dolly zoom must not change the cutaway wall set when the viewing direction is unchanged."
);
const cutawaySurfaceJoins = getLegacyWallSurfaceJoinRangesForTest(
  rectangularRoom,
  0.2,
  rectangularCutawayKeys
);
const retainedNorthSurfaceJoin = cutawaySurfaceJoins.find(
  (join) => join.segmentKey === "right-angle-room-0"
);
assert.ok(retainedNorthSurfaceJoin);
assert.ok(
  Math.abs(retainedNorthSurfaceJoin.plus.length - 3.9) < 0.000001
);
assert.ok(
  Math.abs(retainedNorthSurfaceJoin.minus.length - 4.1) < 0.000001
);
const retainedWestSurfaceJoin = cutawaySurfaceJoins.find(
  (join) => join.segmentKey === "right-angle-room-3"
);
assert.ok(retainedWestSurfaceJoin);
assert.ok(
  Math.abs(retainedWestSurfaceJoin.plus.length - 2.9) < 0.000001
);
assert.ok(
  Math.abs(retainedWestSurfaceJoin.minus.length - 3.1) < 0.000001
);
const flushCutawaySurfaceJoins = getLegacyWallSurfaceJoinRangesForTest(
  rectangularRoom,
  0.2,
  rectangularCutawayKeys,
  0
);
const flushNorthSurfaceJoin = flushCutawaySurfaceJoins.find(
  (join) => join.segmentKey === "right-angle-room-0"
);
assert.ok(flushNorthSurfaceJoin);
assert.ok(
  Math.abs(flushNorthSurfaceJoin.plus.length - 3.9) < 0.000001,
  "A finish plane should terminate flush with its exposed square cut."
);
assert.ok(
  Math.abs(flushNorthSurfaceJoin.minus.length - 4.1) < 0.000001,
  "Both finish sides should share the same flush cut boundary."
);
const rectangularCutawayBands = buildLegacyWallBandsForTest({
  rooms: [rectangularRoom],
  openings: [],
  defaultWallHeight: 2.6,
  stackedFloors: false,
  excludedSegmentKeys: rectangularCutawayKeys,
});
const cutawayContains = (xMm: number, zMm: number) =>
  rectangularCutawayBands[0].polygons.some(
    (polygon) =>
      isPointInPlanarRing({ xMm, zMm }, polygon.outer) &&
      !polygon.holes.some((hole) => isPointInPlanarRing({ xMm, zMm }, hole))
  );
assert(cutawayContains(0, -1550), "The rear wall should remain after cutaway.");
assert(cutawayContains(-2050, 0), "The left wall should remain after cutaway.");
assert(!cutawayContains(2050, 0), "The camera-facing right wall body must be removed.");
assert(!cutawayContains(0, 1550), "The camera-facing front wall body must be removed.");

const seed = loadPingYiCourtV2ReviewSeedBundle().fixtures.find(
  (fixture) => fixture.layoutId === "4-room"
);
assert.ok(seed, "Expected the Ping Yi 4-room compatibility fixture.");

const adapted = canonicalFloorPlanToDesignSnapshot(seed.document);
const compatibilityFloorPlan = { ...adapted.snapshot.floorPlan };
delete compatibilityFloorPlan.canonicalDocument;
delete compatibilityFloorPlan.canonicalGeometryHash;
const stored = snapshotToStored({
  ...adapted.snapshot,
  floorPlan: compatibilityFloorPlan,
});
const refreshed = storedToSnapshot(JSON.parse(JSON.stringify(stored)));
assert.equal(
  refreshed.floorPlan?.canonicalDocument,
  undefined,
  "The regression fixture must exercise the refreshed compatibility renderer, not the canonical branch."
);

const plan = buildHousePlan2D(refreshed.rooms, 5, 4);
const refreshedSharedPolygonWalls = getLegacySharedWallMatchesForTest(
  plan.rooms
).filter((entry) => entry.matches.length > 0);
assert.equal(
  refreshedSharedPolygonWalls.length,
  32,
  "The refreshed nine-room compatibility plan must deduplicate every shared polygon-wall representation."
);
assert(
  refreshedSharedPolygonWalls.every((entry) => entry.matches.length === 1),
  "Every refreshed shared wall segment should resolve to exactly one physical counterpart."
);
const openings = adapted.openings.map((opening) => ({
  id: opening.id,
  roomId: opening.roomId,
  wall: opening.wall,
  kind: opening.kind,
  offset: opening.offsetMm / 1000,
  width: opening.widthMm / 1000,
  height:
    typeof opening.heightMm === "number" ? opening.heightMm / 1000 : undefined,
  bottom:
    typeof opening.bottomMm === "number" ? opening.bottomMm / 1000 : undefined,
}));
const slabs = buildLegacyFloorSlabsForTest({
  rooms: plan.rooms,
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.equal(slabs.length, 1);
assert.equal(
  slabs[0].polygons.length,
  1,
  "A refreshed compatibility import must keep the apartment on one continuous slab."
);
assert.equal(slabs[0].polygons[0].holes.length, 0);

const openingHosts = getLegacyWallOpeningCountsForTest(plan.rooms, openings)
  .flatMap((room) => room.segments)
  .flat();
for (const windowNumber of [1, 2, 3, 4, 5, 6, 7]) {
  assert(
    openingHosts.some((id) => id.startsWith(`window:${windowNumber}:`)),
    `Compatibility wall projection must retain window ${windowNumber} on its polygon edge.`
  );
}

const wallBands = buildLegacyWallBandsForTest({
  rooms: plan.rooms,
  openings,
  defaultWallHeight: 2.6,
  stackedFloors: false,
});
assert.deepEqual(
  wallBands.map(({ bottomMeters, topMeters }) => [bottomMeters, topMeters]),
  [
    [0, 0.9],
    [0.9, 2.1],
    [2.1, 2.6],
  ],
  "Window sills and lintels must survive refresh instead of becoming floor-to-ceiling wall gaps."
);
assert.equal(wallBands[0].polygons.length, 1);
assert.equal(wallBands[2].polygons.length, 1);

console.log("Legacy refreshed floor-plan watertight rendering checks passed.");
