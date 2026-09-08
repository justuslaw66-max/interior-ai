import assert from "node:assert/strict";

import {
  isWindowOpeningCaptureDriverWarning,
  WINDOW_OPENING_TRACE_MODE,
} from "../tests/e2e/window-opening-capture-runtime-policy";
import mountedTestInventory from "./window-opening-mounted-tests.json";

import {
  cameraTransition,
  observeCameraSettleOnRenderFrames,
  WINDOW_OPENING_CAMERA_SETTLE_CONFIG,
  type CameraSettleConfig,
  type CameraState,
} from "../tests/e2e/window-opening-camera-settle";

import {
  getLegacyWallOpeningCountsForTest,
} from "@/components/editor/renderers/HousePlanRenderer3D";
import {
  buildOpeningLintelParts,
  buildOpeningSillParts,
  getWallOpenings,
  getWallSegments,
  projectOpeningWorldCenterOntoLegacySegment,
  wallPartCenter,
} from "@/components/editor/renderers/house-plan-3d/geometry";
import {
  buildLegacyPhysicalOpeningAssemblies,
} from "@/components/editor/renderers/house-plan-3d/LegacyWallOpeningMeshes";
import { MountedCutawayWallMesh } from "@/components/editor/renderers/house-plan-3d/MountedCutawayWallMesh";
import { CutawayWallMesh } from "@/components/editor/renderers/house-plan-3d/wallAndOpeningMeshes";
import {
  openingMetersToMillimetres,
  openingMillimetresToMeters,
  resolveEffectiveOpeningDimensions,
} from "@/lib/design-page-opening-dimensions";
import {
  formatDisplayLength,
  formatDisplayLengthInput,
  getDisplayUnitMetadata,
  resolveDisplayLengthInput,
  type DisplayUnit,
} from "@/lib/display-units";
import {
  resolveDesignPageOpeningHost,
  resolveDesignPageOpeningHosts,
} from "@/lib/design-page-opening-host";
import {
  legacyOpeningOffsetAtWorldPoint,
  moveOpeningCenterFromWorldPoint,
  projectWorldDeltaToOpeningHost,
  resizeOpeningFromWorldPoint,
  worldPointAtOpeningHostAlong,
} from "@/lib/design-page-opening-interaction";
import {
  validateDesignPageOpeningPlacement,
} from "@/lib/design-page-opening-placement";
import {
  mapPlanOpeningsToRoomRenderer,
  updatePlanOpeningMetrics,
} from "@/lib/design-page-plan-overlays";
import { resolveDesignPageOpeningViewportState } from "@/lib/design-page-opening-viewport";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import {
  floorPlanPropertyEvidenceIsEditable,
  floorPlanPropertyEvidenceLabel,
} from "@/lib/floor-plan-measured-property-mutations";
import {
  applyOpeningKindPlanToMetrics,
  DesignPageOpeningKindMutationError,
  normalizeDesignPageOpeningMetrics,
  planDesignPageOpeningKindMutation,
} from "@/lib/design-page-opening-metrics";
import { HistoryManager } from "@/lib/historyManager";
import { snapshotToStored, storedToSnapshot } from "@/lib/room-persistence";
import { createRoom, type DesignSnapshot } from "@/lib/room-types";
import { shouldUseHousePlanScene } from "@/lib/useDesignPageSceneReadModel";
import { validateTracedOpeningPlacement } from "@/lib/floor-plan-tracing";
import { buildFloorPlanQualityReport } from "@/lib/floor-plan-quality";
import { buildRoomSurfaceMaterialBomResult } from "@/lib/surface-material-bom-result";
import {
  getCanonicalPlanLine,
  getPlanSegmentFrame,
  projectPointOntoPlanSegment,
  type PlanSegment2D,
} from "@/lib/wall-segment-geometry";

function room(
  id: string,
  x: number,
  z: number,
  w: number,
  d: number
): HousePlanRoom2D {
  return {
    id,
    name: id,
    roomType: "living",
    shape: "rectangle",
    x,
    z,
    w,
    d,
    height: 2.6,
    wallThickness: 0.12,
  };
}

function assertLegacyOpeningWorldCenterParity(
  opening: RoomOpening2D,
  rooms: HousePlanRoom2D[]
) {
  const projection = mapPlanOpeningsToRoomRenderer([opening], rooms)[0];
  assert.equal(projection.hostResolution?.status, "resolved");
  const centers = rooms.flatMap((candidate) =>
    getWallSegments(candidate).flatMap((segment) =>
      getWallOpenings(candidate, segment, rooms, [projection]).map((rendered) => {
        const local = wallPartCenter(segment, rendered.offset);
        return { x: candidate.x + local.x, z: candidate.z + local.z };
      })
    )
  );
  assert.ok(centers.length > 0);
  for (const center of centers) {
    assert.ok(
      Math.hypot(
        center.x - projection.hostWorldCenter!.x,
        center.z - projection.hostWorldCenter!.z
      ) < 0.0001,
      `${opening.id} must retain one 2D/legacy-3D world center from either room owner.`
    );
  }
}

const singleRoom = room("seed-room", 0, 0, 5, 4);
const seededOpenings: RoomOpening2D[] = [
  {
    id: "door-east-main",
    wall: "east",
    offsetMm: 0,
    widthMm: 900,
    kind: "door",
  },
  {
    id: "window-west-main",
    wall: "west",
    offsetMm: 0,
    widthMm: 1200,
    kind: "window",
  },
];

for (const opening of seededOpenings) {
  const resolution = resolveDesignPageOpeningHost(opening, [singleRoom]);
  assert.equal(resolution.status, "resolved");
  if (resolution.status === "resolved") {
    assert.equal(resolution.host.roomId, singleRoom.id);
    assert.equal(resolution.host.roomWall, opening.wall);
  }
}

const seededRendererOpenings = mapPlanOpeningsToRoomRenderer(
  seededOpenings,
  [singleRoom]
);
assert.deepEqual(
  seededRendererOpenings.map((opening) => opening.id).sort(),
  ["door-east-main", "window-west-main"],
  "Both seeded roomless openings must reach the legacy renderer projection."
);
const seededLegacyCounts = getLegacyWallOpeningCountsForTest(
  [singleRoom],
  seededRendererOpenings
).flatMap((entry) => entry.segments.flat());
assert.ok(seededLegacyCounts.includes("door-east-main"));
assert.ok(seededLegacyCounts.includes("window-west-main"));
assert.equal(
  shouldUseHousePlanScene({
    stackedFloorView: false,
    roomCount: 1,
    openingCount: seededOpenings.length,
    editingWallSurface: false,
    hasWallSurfaceFinishes: false,
    hasNonRectangularRoom: false,
  }),
  true,
  "A single-room scene with seeded openings must use the opening-aware legacy structure renderer."
);

const topologyCountedRooms = [singleRoom];
let topologyBuildCount = 0;
Object.defineProperty(topologyCountedRooms, "filter", {
  configurable: true,
  get() {
    topologyBuildCount += 1;
    return Array.prototype.filter;
  },
});
resolveDesignPageOpeningHosts(
  Array.from({ length: 12 }, (_, index) => ({
    ...seededOpenings[index % seededOpenings.length],
    id: `batched-opening-${index}`,
  })),
  topologyCountedRooms
);
Reflect.deleteProperty(topologyCountedRooms, "filter");
assert.equal(
  topologyBuildCount,
  1,
  "Batch host resolution must build immutable wall topology exactly once for N openings."
);

const upperRoom = room("upper", 0, -2, 4, 4);
const lowerRoom = room("lower", 0, 2, 4, 4);
const ambiguous = resolveDesignPageOpeningHost(
  {
    id: "ambiguous-roomless",
    wall: "west",
    offsetMm: 0,
    widthMm: 800,
  },
  [upperRoom, lowerRoom]
);
assert.equal(ambiguous.status, "ambiguous");
const ambiguousPersisted: RoomOpening2D = {
  id: "ambiguous-roomless",
  wall: "west",
  offsetMm: 0,
  widthMm: 800,
  kind: "window",
};
const ambiguousReadModel = mapPlanOpeningsToRoomRenderer(
  [ambiguousPersisted], [upperRoom, lowerRoom]
)[0];
assert.equal(ambiguousReadModel.id, ambiguousPersisted.id);
assert.equal(ambiguousReadModel.hostResolution?.status, "ambiguous");

const unsupportedRoom: HousePlanRoom2D = {
  ...room("unsupported-custom", 0, 0, 4, 4),
  shape: "custom_polygon",
  polygon: undefined,
};
assert.equal(
  resolveDesignPageOpeningHost({
    id: "unsupported-opening", roomId: unsupportedRoom.id, wall: "east",
    offsetMm: 0, widthMm: 800,
  }, [unsupportedRoom]).status,
  "unsupported",
  "A malformed custom wall topology must fail closed instead of inventing a rectangle."
);

const lRoom: HousePlanRoom2D = {
  ...room("l-room", 0, 0, 6, 4),
  shape: "l_shape",
};
assert.equal(
  resolveDesignPageOpeningHost(
    {
      id: "notch-edge",
      wall: "south",
      offsetMm: 2000,
      widthMm: 800,
    },
    [lRoom]
  ).status,
  "unresolved",
  "An L-shaped plan must not expose the missing part of its bounding rectangle."
);
const unresolvedOpening: RoomOpening2D = {
  id: "unresolved-l-opening",
  roomId: lRoom.id,
  wall: "south",
  offsetMm: 2000,
  widthMm: 800,
  kind: "window",
};
const unresolvedRendererOpening = mapPlanOpeningsToRoomRenderer(
  [unresolvedOpening],
  [lRoom]
)[0];
assert.equal(unresolvedRendererOpening.id, unresolvedOpening.id);
assert.equal(unresolvedRendererOpening.hostResolution?.status, "unresolved");
assert.equal(
  getWallSegments(lRoom).flatMap((segment) =>
    getWallOpenings(lRoom, segment, [lRoom], [unresolvedRendererOpening])
  ).length,
  0,
  "An unresolved persisted opening must remain in the read model without cutting any wall."
);
const repairedOpening = updatePlanOpeningMetrics(
  [unresolvedOpening],
  unresolvedOpening.id,
  { wall: "north" },
  { rooms: [lRoom], planWidthMeters: 6, planDepthMeters: 4 }
)[0];
assert.equal(repairedOpening.id, unresolvedOpening.id);
assert.equal(repairedOpening.wall, "north");
assert.equal(resolveDesignPageOpeningHost(repairedOpening, [lRoom]).status, "resolved");

const unresolvedQuality = buildFloorPlanQualityReport({
  rooms: [lRoom],
  openings: [unresolvedOpening],
  items: [],
  activeRoomId: lRoom.id,
});
assert.ok(
  unresolvedQuality.issues.some(
    (issue) => issue.id === `opening-host:${unresolvedOpening.id}`
  ),
  "An unresolved opening must remain discoverable through plan quality in 2D and 3D."
);
const bomRoom = createRoom(lRoom.id, "L room");
bomRoom.planShape = "l_shape";
bomRoom.geometry.width = lRoom.w;
bomRoom.geometry.depth = lRoom.d;
const bomResult = buildRoomSurfaceMaterialBomResult(
  [bomRoom],
  [unresolvedOpening]
);
assert.equal(bomResult.blocked, true);
assert.equal(bomResult.warnings[0]?.openingId, unresolvedOpening.id);
assert.equal(
  bomResult.warnings[0]?.code,
  "UNRESOLVED_OPENING_HOST",
  "BOM/export must emit a structured warning and leave the wall uncut."
);

const leftWing = room("left-wing", -3, 0, 2, 2);
const rightWing = room("right-wing", 3, 0, 2, 2);
const leftOpening: RoomOpening2D = {
  id: "left-opening",
  roomId: leftWing.id,
  wall: "north",
  offsetMm: 0,
  widthMm: 600,
  kind: "window",
};
const rightOpening: RoomOpening2D = {
  ...leftOpening,
  id: "right-opening",
  roomId: rightWing.id,
};
const leftHost = resolveDesignPageOpeningHost(leftOpening, [leftWing, rightWing]);
const rightHost = resolveDesignPageOpeningHost(rightOpening, [leftWing, rightWing]);
assert.equal(leftHost.status, "resolved");
assert.equal(rightHost.status, "resolved");
if (leftHost.status === "resolved" && rightHost.status === "resolved") {
  assert.notEqual(leftHost.host.physicalWallId, rightHost.host.physicalWallId);
}
assert.deepEqual(
  validateDesignPageOpeningPlacement(
    leftOpening,
    [rightOpening],
    leftOpening.id,
    {
      rooms: [leftWing, rightWing],
      planWidthMeters: 8,
      planDepthMeters: 2,
    }
  ),
  { valid: true },
  "Separate collinear physical walls must not collide."
);

// Trace frames perform readback even in mounted cases without explicit PNGs.
const captureWarning = {
  category: "consoleWarning", testId: "window-opening-12-shared-parallel-collision",
  pageId: "page-1",
  message: "[.WebGL-0x11c0051f000]GL Driver Message (OpenGL, Performance, GL_CLOSE_PATH_NV, High): GPU stall due to ReadPixels",
};
const acceptedCaptureWarnings: typeof captureWarning[] = [];
for (let count = 0; count < 4; count += 1) {
  assert.equal(isWindowOpeningCaptureDriverWarning(
    captureWarning, "/design", WINDOW_OPENING_TRACE_MODE, acceptedCaptureWarnings
  ), true);
  acceptedCaptureWarnings.push(captureWarning);
}
assert.equal(isWindowOpeningCaptureDriverWarning(
  captureWarning, "/design", WINDOW_OPENING_TRACE_MODE, acceptedCaptureWarnings
), false, "A fifth identical warning on the same page remains a failure.");
assert.equal(isWindowOpeningCaptureDriverWarning(
  { ...captureWarning, pageId: "page-2" }, "/design", WINDOW_OPENING_TRACE_MODE,
  acceptedCaptureWarnings
), true, "Another owned page has an independent four-warning bound.");
for (const entry of mountedTestInventory) {
  assert.equal(isWindowOpeningCaptureDriverWarning(
    { ...captureWarning, testId: entry.id }, "/design", WINDOW_OPENING_TRACE_MODE, []
  ), true, "Every fixed mounted case captures trace frames.");
}
assert.equal(isWindowOpeningCaptureDriverWarning({
  ...captureWarning, message: `${captureWarning.message} (this message will no longer repeat)`,
}, "/design", WINDOW_OPENING_TRACE_MODE, []), true);
for (const patch of [
  { category: "consoleError" }, { category: "pageError" },
  { category: "requestFailure", message: "net::ERR_NETWORK_IO_SUSPENDED" },
  { category: "responseError" }, { testId: "outside-active-test" },
  { testId: "unknown-test" }, { pageId: "" }, { pageId: "page-0" },
  { message: "" }, { message: "WebGL context lost" },
  { message: captureWarning.message.replace("ReadPixels", "DrawArrays") },
  { message: `${captureWarning.message} additional warning` },
]) {
  assert.equal(isWindowOpeningCaptureDriverWarning(
    { ...captureWarning, ...patch }, "/design", WINDOW_OPENING_TRACE_MODE, []
  ), false, `Reject non-capture event ${JSON.stringify(patch)}.`);
}
for (const route of [null, "/", "/api/design", "/design/other"]) {
  assert.equal(isWindowOpeningCaptureDriverWarning(
    captureWarning, route, WINDOW_OPENING_TRACE_MODE, []
  ), false);
}
for (const mode of ["off", "retain-on-failure", ""]) {
  assert.equal(isWindowOpeningCaptureDriverWarning(captureWarning, "/design", mode, []), false);
}

const sharedA = room("a-room", -2, 0, 4, 4);
const sharedB = room("b-room", 2, 0, 4, 4);
const sharedOpening: RoomOpening2D = {
  id: "shared-window",
  roomId: sharedA.id,
  wall: "east",
  offsetMm: 0,
  widthMm: 1200,
  kind: "window",
};
const sharedRendererOpening = mapPlanOpeningsToRoomRenderer(
  [sharedOpening],
  [sharedA, sharedB]
)[0];
assert.ok(sharedRendererOpening);
const segmentA = getWallSegments(sharedA).find((segment) => segment.wall === "east");
const segmentB = getWallSegments(sharedB).find((segment) => segment.wall === "west");
assert.ok(segmentA && segmentB);
// Exercise the production adapter with real sill/lintel parts, including the
// partial shared wall from mounted screenshot06. A hidden lexical owner must
// never suppress its focused neighbor's replacement wall faces.
for (const topology of [
  [sharedA, sharedB],
  [room("a-room", 0, 0, 4, 4), room("b-room", 3, 1, 2, 2)],
]) {
  const [owner, neighbor] = topology;
  const projected = mapPlanOpeningsToRoomRenderer([{
    ...sharedOpening, roomId: owner.id,
    offsetMm: topology[0] === sharedA ? 0 : 1000,
    widthMm: 800, heightMm: 1100, bottomMm: 950,
  }], topology);
  for (const [visibleRooms, expectedOwner] of [
    [topology, owner.id], [[owner], owner.id], [[neighbor], neighbor.id],
  ] as const) {
    const renderedParts = [];
    for (const mountedRoom of visibleRooms) {
      const segment = getWallSegments(mountedRoom).find((candidate) =>
        candidate.wall === (mountedRoom === owner ? "east" : "west")
      );
      assert.ok(segment);
      const openings = getWallOpenings(mountedRoom, segment, topology, projected);
      const parts = [
        ...buildOpeningLintelParts(segment, openings, 2.6, 2.6),
        ...buildOpeningSillParts(segment, openings, 2.6, 2.6),
      ];
      assert.equal(parts.length, 2);
      for (const part of parts) {
        const element = MountedCutawayWallMesh({
          room: mountedRoom, rooms: topology, visibleRooms, segment, part,
          wallHeight: 2.6, wallThickness: 0.12, wallOpacity: 1,
          renderBase: false, renderSurfaces: true, selectionPieceKey: null,
          selectionSettingsFallbackKeys: [], selectionPanelLength: part.length,
          selectionPanelCenterOffset: 0, forceCutaway: false,
          squareStart: false, squareEnd: false, activeRoomId: mountedRoom.id,
          isActive: true, interactive: false, hoveredTargetKey: null,
          selectedTargetKey: null, onHoverTarget: () => {},
          onClearHoverTarget: () => {}, onSelectTarget: () => {},
        });
        assert.equal(element.type, CutawayWallMesh);
        assert.equal(element.props.renderOwnerRoomId, expectedOwner);
        assert.equal(element.props.rooms, topology, "Retain both physical faces.");
        assert.equal(element.props.part, part, "Preserve the physical infill.");
        assert.equal(element.props.renderSurfaces, true);
        if (element.props.renderOwnerRoomId === mountedRoom.id) renderedParts.push(part);
      }
    }
    assert.equal(renderedParts.length, 2, "Exactly one mounted sill and lintel.");
    for (const [index, height, centerY] of [[0, 0.55, 2.325], [1, 0.95, 0.475]]) {
      const part = renderedParts[index];
      assert.ok(Math.abs((part.height ?? 0) - height) < 1e-9);
      assert.ok(Math.abs((part.centerY ?? 0) - centerY) < 1e-9);
      assert.ok(Math.abs(part.length - 0.8) < 1e-9);
    }
  }
}
assert.deepEqual(
  [
    getWallOpenings(sharedA, segmentA, [sharedA, sharedB], [sharedRendererOpening]),
    getWallOpenings(sharedB, segmentB, [sharedA, sharedB], [sharedRendererOpening]),
  ].map((openings) => openings.map((opening) => opening.sourceId)),
  [[sharedOpening.id], [sharedOpening.id]],
  "Both physical wall directions must resolve the same logical window."
);
const fullAssemblies = buildLegacyPhysicalOpeningAssemblies({
  visibleRooms: [sharedA, sharedB],
  topologyRooms: [sharedA, sharedB],
  openings: [sharedRendererOpening],
  defaultWallHeight: 2.6,
});
const focusAAssemblies = buildLegacyPhysicalOpeningAssemblies({
  visibleRooms: [sharedA],
  topologyRooms: [sharedA, sharedB],
  openings: [sharedRendererOpening],
  defaultWallHeight: 2.6,
});
const focusBAssemblies = buildLegacyPhysicalOpeningAssemblies({
  visibleRooms: [sharedB],
  topologyRooms: [sharedA, sharedB],
  openings: [sharedRendererOpening],
  defaultWallHeight: 2.6,
});
assert.deepEqual(
  [fullAssemblies.length, focusAAssemblies.length, focusBAssemblies.length],
  [1, 1, 1],
  "Full-home and both focus directions must mount exactly one physical assembly."
);
assert.equal(fullAssemblies[0].stableKey, focusAAssemblies[0].stableKey);
assert.equal(fullAssemblies[0].stableKey, focusBAssemblies[0].stableKey);
for (const assembly of [fullAssemblies[0], focusAAssemblies[0], focusBAssemblies[0]]) {
  assert.deepEqual(
    {
      x: assembly.room.x + assembly.threshold.x,
      z: assembly.room.z + assembly.threshold.z,
    },
    sharedRendererOpening.hostWorldCenter,
    "Scene-level focus transfer must retain the canonical world transform."
  );
}
assert.equal(
  validateTracedOpeningPlacement(
    sharedOpening,
    [sharedA, sharedB],
    [{
      id: "opposite-owner-door",
      roomId: sharedB.id,
      wall: "west",
      offsetMm: 0,
      widthMm: 900,
    }]
  ).valid,
  false,
  "Tracing must reject collisions from the opposite logical owner of one shared physical wall."
);

const partialOwner = room("partial-owner", 0, 0, 4, 6);
const partialNeighbor = room("partial-neighbor", 4, 2, 4, 2);
const partialOpening: RoomOpening2D = {
  id: "partial-overlap-window",
  roomId: partialOwner.id,
  wall: "east",
  offsetMm: 2000,
  widthMm: 800,
  kind: "window",
};
const partialHost = resolveDesignPageOpeningHost(
  partialOpening,
  [partialOwner, partialNeighbor]
);
assert.equal(partialHost.status, "resolved");
const partialProjection = mapPlanOpeningsToRoomRenderer(
  [partialOpening],
  [partialOwner, partialNeighbor]
)[0];
const partialOwnerSegment = getWallSegments(partialOwner).find(
  (segment) => segment.wall === "east"
);
assert.ok(partialOwnerSegment);
const partialDirectOpening = getWallOpenings(
  partialOwner,
  partialOwnerSegment,
  [partialOwner, partialNeighbor],
  [partialProjection]
)[0];
assert.ok(partialDirectOpening);
assert.deepEqual(
  {
    x: partialOwner.x + wallPartCenter(
      partialOwnerSegment,
      partialDirectOpening.offset
    ).x,
    z: partialOwner.z + wallPartCenter(
      partialOwnerSegment,
      partialDirectOpening.offset
    ).z,
  },
  partialProjection.hostWorldCenter,
  "The direct legacy owner must project the canonical shared-subsegment center onto its full room wall."
);
assertLegacyOpeningWorldCenterParity(partialOpening, [partialOwner, partialNeighbor]);
const oppositeOwnerOpening: RoomOpening2D = {
  ...partialOpening,
  id: "partial-opposite-owner",
  roomId: partialNeighbor.id,
  wall: "west",
  offsetMm: 0,
};
assertLegacyOpeningWorldCenterParity(oppositeOwnerOpening, [partialOwner, partialNeighbor]);
for (const [id, offsetMm] of [
  ["partial-near-start", 1100],
  ["partial-multiple-a", 1350],
  ["partial-multiple-b", 2650],
  ["partial-near-end", 2900],
] as const) {
  assertLegacyOpeningWorldCenterParity(
    { ...partialOpening, id, offsetMm, widthMm: 100 },
    [partialOwner, partialNeighbor]
  );
}
const partialAtBeginning = room("partial-at-beginning", 4, -2, 4, 2);
assertLegacyOpeningWorldCenterParity(
  { ...partialOpening, id: "partial-ending-mid-wall", offsetMm: -2000, widthMm: 100 },
  [partialOwner, partialAtBeginning]
);

const diagonalOwner: HousePlanRoom2D = {
  ...room("diagonal-owner", 0, 0, 4, 4),
  shape: "custom_polygon",
  polygon: [
    { x: -2, z: -2 },
    { x: 1, z: -2 },
    { x: 2, z: 2 },
    { x: -2, z: 2 },
  ],
};
const diagonalNeighbor: HousePlanRoom2D = {
  ...room("diagonal-neighbor", 4, 0, 5, 4),
  shape: "custom_polygon",
  polygon: [
    { x: -3, z: -2 },
    { x: 2, z: -2 },
    { x: 2, z: 2 },
    { x: -2, z: 2 },
  ],
};
const diagonalOpening: RoomOpening2D = {
  id: "diagonal-shared-window",
  roomId: diagonalOwner.id,
  wall: "east",
  offsetMm: 0,
  widthMm: 700,
  kind: "window",
};
const diagonalHost = resolveDesignPageOpeningHost(
  diagonalOpening,
  [diagonalOwner, diagonalNeighbor]
);
assert.equal(diagonalHost.status, "resolved");
if (diagonalHost.status === "resolved") {
  assert.ok(Math.abs(diagonalHost.host.worldCenter.x - 1.5) < 0.0001);
  assert.ok(Math.abs(diagonalHost.host.worldCenter.z) < 0.0001);
  assert.ok(Math.abs(diagonalHost.host.tangent.x) > 0.2);
  assert.ok(Math.abs(diagonalHost.host.tangent.z) > 0.8);
}
const diagonalProjection = mapPlanOpeningsToRoomRenderer(
  [diagonalOpening],
  [diagonalOwner, diagonalNeighbor]
)[0];
for (const targetRoom of [diagonalOwner, diagonalNeighbor]) {
  const targetSegment = getWallSegments(targetRoom).find((segment) =>
    projectOpeningWorldCenterOntoLegacySegment(
      targetRoom,
      segment,
      diagonalProjection.hostWorldCenter!,
      diagonalProjection.width
    ) !== null
  );
  assert.ok(targetSegment);
  const projected = getWallOpenings(
    targetRoom,
    targetSegment,
    [diagonalOwner, diagonalNeighbor],
    [diagonalProjection]
  );
  assert.equal(projected.length, 1);
  const center = wallPartCenter(targetSegment, projected[0].offset);
  assert.ok(
    Math.hypot(
      targetRoom.x + center.x - diagonalProjection.hostWorldCenter!.x,
      targetRoom.z + center.z - diagonalProjection.hostWorldCenter!.z
    ) < 0.0001,
    "Every diagonal-wall legacy projection must retain one canonical world center."
  );
}

const exactDiagonalRoom: HousePlanRoom2D = {
  ...room("exact-diagonal", 0, 0, 4, 4),
  shape: "custom_polygon",
  polygon: [
    { x: -2, z: -2.75 },
    { x: 1, z: 0.25 },
    { x: 2, z: 2 },
    { x: -2, z: 2 },
  ],
};
const exactDiagonalOpening: RoomOpening2D = {
  id: "exact-diagonal-window",
  roomId: exactDiagonalRoom.id,
  wall: "north",
  offsetMm: 0,
  widthMm: 800,
  kind: "window",
};
const exactDiagonalHost = resolveDesignPageOpeningHost(
  exactDiagonalOpening,
  [exactDiagonalRoom]
);
assert.equal(exactDiagonalHost.status, "resolved");
if (exactDiagonalHost.status === "resolved") {
  const host = exactDiagonalHost.host;
  assert.ok(Math.abs(Math.abs(host.tangent.x) - Math.SQRT1_2) < 0.000001);
  assert.ok(Math.abs(Math.abs(host.tangent.z) - Math.SQRT1_2) < 0.000001);
  const oneMeterAlong = {
    x: host.tangent.x,
    z: host.tangent.z,
  };
  assert.ok(
    Math.abs(oneMeterAlong.x * 1000) > 707 &&
      Math.abs(oneMeterAlong.x * 1000) < 708,
    "The former cardinal-x persistence would move a 45-degree opening only 707.107 mm."
  );
  assert.ok(
    Math.abs(projectWorldDeltaToOpeningHost(host, oneMeterAlong) - 1) < 0.000001,
    "A 1000 mm wall-local pointer move must remain exactly 1000 mm wall-local."
  );

  for (const deltaMeters of [1, -1]) {
    const pointerWorld = worldPointAtOpeningHostAlong(
      host,
      host.alongSegmentMeters + deltaMeters
    );
    const moved = moveOpeningCenterFromWorldPoint({
      host,
      pointerWorld,
      grabDeltaAlongMeters: 0,
      widthMeters: exactDiagonalOpening.widthMm / 1000,
      edgePaddingMeters: 0,
    });
    assert.ok(moved.offsetMeters !== null);
    assert.ok(Math.abs(moved.offsetMeters! - deltaMeters) < 0.001);
    const persisted = { ...exactDiagonalOpening, offsetMm: Math.round(moved.offsetMeters! * 1000) };
    const reloaded = resolveDesignPageOpeningHost(persisted, [exactDiagonalRoom]);
    assert.equal(reloaded.status, "resolved");
    if (reloaded.status === "resolved") {
      assert.ok(Math.abs(reloaded.host.alongSegmentMeters - moved.centerAlongMeters) < 0.001);
    }
  }

  const originalStart = host.alongSegmentMeters - exactDiagonalOpening.widthMm / 2000;
  const originalEnd = host.alongSegmentMeters + exactDiagonalOpening.widthMm / 2000;
  const resizedStart = resizeOpeningFromWorldPoint({
    host,
    pointerWorld: worldPointAtOpeningHostAlong(host, originalStart - 0.35),
    fixedAlongMeters: originalEnd,
    movingEdge: "start",
    minimumWidthMeters: 0.4,
    edgePaddingMeters: 0.03,
  });
  const resizedEnd = resizeOpeningFromWorldPoint({
    host,
    pointerWorld: worldPointAtOpeningHostAlong(host, originalEnd + 0.35),
    fixedAlongMeters: originalStart,
    movingEdge: "end",
    minimumWidthMeters: 0.4,
    edgePaddingMeters: 0.03,
  });
  assert.ok(Math.abs(resizedStart.widthMeters - 1.15) < 0.001);
  assert.ok(Math.abs(resizedEnd.widthMeters - 1.15) < 0.001);
  assert.ok(resizedStart.offsetMeters !== null && resizedEnd.offsetMeters !== null);
  assert.ok(
    Math.abs(
      legacyOpeningOffsetAtWorldPoint(host, resizedStart.worldCenter)! -
        resizedStart.offsetMeters!
    ) < 0.000001
  );
  const minimum = resizeOpeningFromWorldPoint({
    host,
    pointerWorld: worldPointAtOpeningHostAlong(host, originalEnd + 2),
    fixedAlongMeters: originalEnd,
    movingEdge: "start",
    minimumWidthMeters: 0.4,
    edgePaddingMeters: 0.03,
  });
  assert.ok(Math.abs(minimum.widthMeters - 0.4) < 0.001);
  const endpoint = resizeOpeningFromWorldPoint({
    host,
    pointerWorld: worldPointAtOpeningHostAlong(host, -10),
    fixedAlongMeters: originalEnd,
    movingEdge: "start",
    minimumWidthMeters: 0.4,
    edgePaddingMeters: 0.03,
  });
  assert.ok(endpoint.startAlongMeters >= 0.03);
}

const negativeDiagonal = {
  ...room("negative-diagonal", 0, 0, 4, 4),
  shape: "custom_polygon" as const,
  polygon: [
    { x: -2, z: -2 }, { x: 2, z: -2 },
    { x: 1, z: 2 }, { x: -2, z: 2 },
  ],
};
const reversedNegativeDiagonal = {
  ...negativeDiagonal,
  id: "negative-diagonal-reversed",
  polygon: [...negativeDiagonal.polygon].reverse(),
};
for (const candidate of [negativeDiagonal, reversedNegativeDiagonal]) {
  const result = resolveDesignPageOpeningHost({
    id: `${candidate.id}:opening`, roomId: candidate.id, wall: "east",
    offsetMm: 500, widthMm: 500,
  }, [candidate]);
  assert.equal(result.status, "resolved");
  if (result.status === "resolved") {
    assert.ok(Math.abs(result.host.tangent.x) > 0.2 && Math.abs(result.host.tangent.z) > 0.8);
    assert.ok(Math.abs(result.host.alongSegmentMeters - (result.host.spanMeters / 2 + 0.5)) < 0.001);
  }
}
for (const candidate of [
  {
    ...room("near-horizontal", 0, 0, 4, 4), shape: "custom_polygon" as const,
    polygon: [{ x: -2, z: -2 }, { x: 2, z: -1.999 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
    wall: "north" as const,
  },
  {
    ...room("near-vertical", 0, 0, 4, 4), shape: "custom_polygon" as const,
    polygon: [{ x: -2, z: -2 }, { x: 1.999, z: -2 }, { x: 2, z: 2 }, { x: -2, z: 2 }],
    wall: "east" as const,
  },
]) {
  assert.equal(resolveDesignPageOpeningHost({
    id: `${candidate.id}:opening`, roomId: candidate.id, wall: candidate.wall,
    offsetMm: 250, widthMm: 400,
  }, [candidate]).status, "resolved");
}

const orientationSegments: PlanSegment2D[] = [
  { x1: 0, z1: 0, x2: 4, z2: 0 },
  { x1: 0, z1: 0, x2: 0, z2: 4 },
  { x1: 0, z1: 0, x2: 4, z2: 3 },
  { x1: 0, z1: 0, x2: 4, z2: -3 },
  { x1: 4, z1: 3, x2: 0, z2: 0 },
  { x1: 0, z1: 0, x2: 4, z2: 0.001 },
  { x1: 0, z1: 0, x2: 0.001, z2: 4 },
];
for (const segment of orientationSegments) {
  const frame = getPlanSegmentFrame(segment);
  assert.ok(frame);
  const sample = {
    x: frame.start.x + frame.tangent.x * frame.length * 0.35 + frame.normal.x * 0.0005,
    z: frame.start.z + frame.tangent.z * frame.length * 0.35 + frame.normal.z * 0.0005,
  };
  const projected = projectPointOntoPlanSegment(sample, segment);
  assert.ok(projected);
  assert.ok(Math.abs(projected.alongFromStart - frame.length * 0.35) < 0.000001);
  assert.ok(Math.abs(projected.perpendicular - 0.0005) < 0.000001);
  assert.ok(getCanonicalPlanLine(segment));
}
const forwardLine = getCanonicalPlanLine(orientationSegments[2]);
const reverseLine = getCanonicalPlanLine(orientationSegments[4]);
assert.ok(forwardLine && reverseLine);
for (const value of [
  forwardLine.tangent.x - reverseLine.tangent.x,
  forwardLine.tangent.z - reverseLine.tangent.z,
  forwardLine.normal.x - reverseLine.normal.x,
  forwardLine.normal.z - reverseLine.normal.z,
  forwardLine.lineOffset - reverseLine.lineOffset,
  forwardLine.low - reverseLine.low,
  forwardLine.high - reverseLine.high,
]) {
  assert.ok(Math.abs(value) < 0.000001,
    "Reversing diagonal endpoints must preserve direction-independent physical identity geometry.");
}

function dimensions(
  input: Parameters<typeof resolveEffectiveOpeningDimensions>[0],
  wallHeightMm = 2600,
  defaults?: Parameters<typeof resolveEffectiveOpeningDimensions>[2]
) {
  return resolveEffectiveOpeningDimensions(input, wallHeightMm, defaults);
}

for (const [input, expectedState] of [
  [{ kind: "window" as const }, "missing"],
  [{ kind: "window" as const, heightMm: undefined }, "undefined"],
  [{ kind: "window" as const, heightMm: null }, "null"],
  [{ kind: "window" as const, heightMm: Number.NaN }, "non_finite"],
  [{ kind: "window" as const, heightMm: Number.POSITIVE_INFINITY }, "non_finite"],
  [{ kind: "window" as const, heightMm: Number.NEGATIVE_INFINITY }, "non_finite"],
  [{ kind: "window" as const, heightMm: -1 }, "negative"],
  [{ kind: "window" as const, heightMm: 0 }, "zero"],
] as const) {
  const resolved = dimensions(input);
  assert.equal(resolved.heightInputState, expectedState);
  assert.equal(resolved.heightMm, 1200);
  assert.equal(resolved.heightEstimated, true);
}
for (const bottomMm of [-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
  const resolved = dimensions({ kind: "window", bottomMm });
  assert.equal(resolved.bottom.status, "invalid");
  assert.equal(resolved.bottomEstimated, true);
}
assert.equal(dimensions({ kind: "window" }, 0.5).status, "unsupported");
assert.equal(dimensions({ kind: "window" }, Number.NaN).status, "unsupported");
assert.equal(openingMillimetresToMeters(1234), 1.234);
assert.equal(openingMetersToMillimetres(1.234), 1234);
assert.deepEqual(
  {
    heightMm: dimensions({ kind: "door" }).heightMm,
    bottomMm: dimensions({ kind: "door" }).bottomMm,
  },
  { heightMm: 2100, bottomMm: 0 },
  "Door defaults must remain 2100 mm with zero sill."
);
assert.deepEqual(
  {
    heightMm: dimensions({ kind: "window", heightMm: 2600, bottomMm: 0 }).heightMm,
    bottomMm: dimensions({ kind: "window", heightMm: 2600, bottomMm: 0 }).bottomMm,
  },
  { heightMm: 2600, bottomMm: 0 },
  "An intentional full-height window must remain full height."
);
assert.equal(
  dimensions({ kind: "window", heightMm: 2500, bottomMm: 900 }).heightMm,
  1700
);
assert.deepEqual(
  {
    bottomMm: dimensions({ kind: "window" }, 600).bottomMm,
    heightMm: dimensions({ kind: "window" }, 600).heightMm,
  },
  { bottomMm: 0, heightMm: 600 },
  "A short wall must receive a deterministic positive default without a second minimum."
);
assert.equal(
  dimensions({ kind: "window", heightMm: 2600, bottomMm: 0 }, 2200).heightMm,
  2200,
  "A wall-height reduction must deterministically constrain the effective opening."
);
const constrainedDimensions = dimensions(
  { kind: "window", heightMm: 2600, bottomMm: 0 },
  2200
);
assert.equal(constrainedDimensions.height.rawValueMm, 2600);
assert.equal(constrainedDimensions.height.effectiveValueMm, 2200);
assert.equal(constrainedDimensions.height.status, "constrained");
assert.equal(
  dimensions(
    { kind: "window" },
    3000,
    { windowHeightMm: 1350, windowSillMm: 1000 }
  ).heightMm,
  1350,
  "Floor/room defaults must be applied before compatibility constants."
);
assert.deepEqual(
  dimensions(
    { kind: "window" },
    3000,
    { windowHeightMm: 1350, windowSillMm: 750 }
  ).bottomMm,
  750,
  "Contextual sill defaults must remain authoritative when the raw value is sparse."
);
assert.deepEqual(
  normalizeDesignPageOpeningMetrics({
    currentOpening: undefined,
    metrics: { heightMeters: 2.6 },
    roomHeight: 2.2,
  }),
  { heightMeters: 2.6 },
  "Inspector normalization must preserve the raw authored value instead of storing its constrained render value."
);
assert.equal(
  dimensions({ kind: "window", heightMm: 1200, bottomMm: 900 }, 2100).topMm,
  2100,
  "The sill-plus-height wall boundary must be inclusive."
);

const sparseWindow: RoomOpening2D = {
  id: "sparse-window",
  roomId: singleRoom.id,
  wall: "north",
  offsetMm: 0,
  widthMm: 1200,
  kind: "window",
};
const widthOnly = updatePlanOpeningMetrics(
  [sparseWindow],
  sparseWindow.id,
  { widthMeters: 1.4 },
  { rooms: [singleRoom], planWidthMeters: 5, planDepthMeters: 4 }
)[0];
assert.equal(widthOnly.heightMm, undefined);
assert.equal(widthOnly.bottomMm, undefined);
assert.equal(widthOnly.evidence, undefined);

const widthConfirmed = updatePlanOpeningMetrics(
  [sparseWindow],
  sparseWindow.id,
  { widthMeters: 1.4, widthEvidence: "user_confirmed" },
  { rooms: [singleRoom], planWidthMeters: 5, planDepthMeters: 4 }
)[0];
assert.equal(widthConfirmed.widthMm, 1400);
assert.deepEqual(widthConfirmed.evidence, { width: "user_confirmed" });

const heightConfirmed = updatePlanOpeningMetrics(
  [sparseWindow],
  sparseWindow.id,
  { heightMeters: 1.3, heightEvidence: "user_confirmed" },
  { rooms: [singleRoom], planWidthMeters: 5, planDepthMeters: 4 }
)[0];
assert.equal(heightConfirmed.heightMm, 1300);
assert.equal(heightConfirmed.bottomMm, undefined);
assert.deepEqual(heightConfirmed.evidence, { height: "user_confirmed" });

const sillConfirmed = updatePlanOpeningMetrics(
  [sparseWindow],
  sparseWindow.id,
  { bottomMeters: 0, bottomEvidence: "user_confirmed" },
  { rooms: [singleRoom], planWidthMeters: 5, planDepthMeters: 4 }
)[0];
assert.equal(sillConfirmed.heightMm, undefined);
assert.equal(sillConfirmed.bottomMm, 0);
assert.deepEqual(sillConfirmed.evidence, { sillHeight: "user_confirmed" });
assert.equal(floorPlanPropertyEvidenceIsEditable("source_documented"), false);
assert.equal(floorPlanPropertyEvidenceIsEditable("site_measured"), false);
assert.equal(floorPlanPropertyEvidenceIsEditable("user_confirmed"), true);
assert.equal(floorPlanPropertyEvidenceLabel("assumed"), "Assumed");

const documentedWindow: RoomOpening2D = {
  ...sparseWindow,
  bottomMm: 900,
  heightMm: 1200,
  evidence: {
    width: "source_documented",
    height: "source_documented",
    sillHeight: "source_documented",
  },
};
const blockedKindPlan = planDesignPageOpeningKindMutation(documentedWindow, "door");
assert.equal(blockedKindPlan.status, "blocked");
assert.equal(blockedKindPlan.fields.width.changed, false);
assert.equal(blockedKindPlan.fields.height.changed, false);
assert.equal(blockedKindPlan.fields.sill.requiresOverride, true);
assert.throws(
  () => applyOpeningKindPlanToMetrics(documentedWindow, { kind: "door" }),
  (cause) => cause instanceof DesignPageOpeningKindMutationError
);
assert.deepEqual(
  planDesignPageOpeningKindMutation(
    { ...documentedWindow, bottomMm: undefined },
    "door"
  ).patch,
  { kind: "door" },
  "An absent sill must remain absent instead of being silently authored as zero."
);
assert.deepEqual(
  planDesignPageOpeningKindMutation(
    { ...documentedWindow, bottomMm: 0 },
    "door"
  ).patch,
  { kind: "door" },
  "An already-zero locked sill must not require an override."
);
assert.deepEqual(
  planDesignPageOpeningKindMutation(
    { ...documentedWindow, kind: "door", bottomMm: 0 },
    "window"
  ).patch,
  { kind: "window" },
  "Door-to-window must preserve an intentional zero sill."
);

function exerciseAtomicKindHistory() {
  let state = [documentedWindow];
  const history = new HistoryManager(() => state, (next) => { state = next; });
  const commit = (patch: Parameters<typeof updatePlanOpeningMetrics>[2]) => {
    let planned;
    try {
      planned = applyOpeningKindPlanToMetrics(state[0], patch);
    } catch (cause) {
      if (cause instanceof DesignPageOpeningKindMutationError) return false;
      throw cause;
    }
    history.executeCommand({
      id: "kind-change",
      description: "Edit opening",
      input: planned,
      execute: (metrics) => {
        state = updatePlanOpeningMetrics(
          state,
          documentedWindow.id,
          metrics,
          { rooms: [singleRoom], planWidthMeters: 5, planDepthMeters: 4 }
        );
      },
    });
    return true;
  };
  assert.equal(commit({ kind: "door" }), false);
  assert.equal(history.getStatus().pastCount, 0);
  assert.deepEqual(state, [documentedWindow]);
  assert.equal(commit(blockedKindPlan.approvedOverridePatch!), true);
  assert.equal(history.getStatus().pastCount, 1);
  assert.equal(state[0].kind, "door");
  assert.equal(state[0].bottomMm, 0);
  assert.equal(state[0].evidence?.sillHeight, "user_confirmed");
  assert.equal(history.undo(), "Edit opening");
  assert.deepEqual(state, [documentedWindow]);
  assert.equal(history.redo(), "Edit opening");
  assert.equal(state[0].kind, "door");
  assert.equal(state[0].bottomMm, 0);
}

function exerciseOpeningHistory() {
  let state = [sparseWindow];
  const history = new HistoryManager(
    () => state,
    (next) => {
      state = next;
    }
  );
  const execute = (
    description: string,
    patch: Parameters<typeof updatePlanOpeningMetrics>[2]
  ) => history.executeCommand({
    id: `opening:${description}`,
    description,
    input: patch,
    execute: (metrics) => {
      state = updatePlanOpeningMetrics(
        state,
        sparseWindow.id,
        metrics,
        { rooms: [singleRoom], planWidthMeters: 5, planDepthMeters: 4 }
      );
    },
  });

  execute("Move opening", { offsetMeters: 0.25 });
  assert.equal(history.getStatus().pastCount, 1);
  assert.equal(state[0].offsetMm, 250);
  assert.equal(history.undo(), "Move opening");
  assert.equal(state[0].offsetMm, 0);
  assert.equal(history.redo(), "Move opening");
  assert.equal(state[0].offsetMm, 250);

  execute("Resize opening", { widthMeters: 1.4, widthEvidence: "user_confirmed" });
  assert.equal(history.getStatus().pastCount, 2);
  assert.equal(state[0].widthMm, 1400);
  assert.deepEqual(state[0].evidence, { width: "user_confirmed" });
  assert.equal(history.undo(), "Resize opening");
  assert.equal(state[0].widthMm, 1200);
  assert.equal(state[0].evidence, undefined);
  assert.equal(history.redo(), "Resize opening");
  assert.deepEqual(state[0].evidence, { width: "user_confirmed" });
  history.undo();

  execute("Set window sill", {
    bottomMeters: 0.4,
    bottomEvidence: "user_confirmed",
  });
  assert.equal(history.getStatus().pastCount, 2);
  assert.equal(state[0].bottomMm, 400);
  assert.deepEqual(state[0].evidence, { sillHeight: "user_confirmed" });
  history.undo();
  assert.equal(state[0].bottomMm, undefined);
  assert.equal(state[0].evidence, undefined);
  history.redo();
  assert.equal(state[0].bottomMm, 400);
  assert.deepEqual(state[0].evidence, { sillHeight: "user_confirmed" });

  history.executeCommand({
    id: "delete-opening",
    description: "Delete opening",
    input: sparseWindow.id,
    execute: (id) => {
      state = state.filter((opening) => opening.id !== id);
    },
  });
  assert.equal(state.length, 0);
  assert.equal(history.undo(), "Delete opening");
  assert.equal(state.length, 1);
}

function exerciseOpeningPersistence() {
  const persistedOpening: RoomOpening2D = {
    ...sparseWindow,
    heightMm: 1300,
    evidence: { width: "site_measured", height: "user_confirmed" },
  };
  const snapshot: DesignSnapshot = {
    version: 3,
    rooms: [createRoom(singleRoom.id, "Seed room")],
    activeRoomId: singleRoom.id,
    floorPlan: { openings: [persistedOpening] },
  };
  const restored = storedToSnapshot(
    JSON.parse(JSON.stringify(snapshotToStored(snapshot)))
  );
  assert.deepEqual(restored.floorPlan?.openings, [persistedOpening]);
  assert.equal(restored.floorPlan?.openings?.[0].bottomMm, undefined);
  assert.equal(restored.floorPlan?.openings?.[0].evidence?.sillHeight, undefined);
  assert.equal(restored.floorPlan?.openings?.[0].evidence?.width, "site_measured");

  for (const candidate of [unresolvedOpening, repairedOpening]) {
    const candidateSnapshot: DesignSnapshot = {
      version: 3,
      rooms: [createRoom(lRoom.id, "L room")],
      activeRoomId: lRoom.id,
      floorPlan: { openings: [candidate] },
    };
    const candidateReloaded = storedToSnapshot(
      JSON.parse(JSON.stringify(snapshotToStored(candidateSnapshot)))
    ).floorPlan?.openings?.[0];
    assert.equal(candidateReloaded?.id, unresolvedOpening.id);
    assert.equal(candidateReloaded?.wall, candidate.wall);
  }
}

function resolveImperialOpeningInput(
  input: string,
  referenceMm: number,
  minMm: number,
  maxMm: number
) {
  const resolution = resolveDisplayLengthInput(input, "ft-in", {
    referenceMm,
    minMm,
    maxMm,
    snapStepMm: 1,
    stepBaseMm: minMm,
  });
  assert.equal(resolution.status, "valid", `${input} should be a valid imperial opening value.`);
  if (resolution.status !== "valid") throw new Error(`${input} did not resolve.`);
  return resolution.valueMm;
}

function exerciseOpeningDisplayUnitIntegration() {
  const openingHeightMm = 1100;
  const openingBottomMm = 700;
  const estimatedWindow: RoomOpening2D = {
    ...sparseWindow,
    widthMm: 1200,
    heightMm: openingHeightMm,
    bottomMm: openingBottomMm,
    evidence: { width: "assumed", height: "assumed", sillHeight: "assumed" },
  };
  const displayOnlyRecord = {
    opening: estimatedWindow,
    auditProvenance: [{ action: "imported", basis: "source_documented" }],
  };
  const beforeUnitSwitch = JSON.stringify(displayOnlyRecord);
  for (const unit of ["mm", "cm", "in", "ft-in"] satisfies DisplayUnit[]) {
    for (const valueMm of [
      estimatedWindow.widthMm,
      openingHeightMm,
      openingBottomMm,
    ]) {
      const displayed = formatDisplayLengthInput(valueMm, unit);
      assert.equal(
        resolveDisplayLengthInput(displayed, unit, { referenceMm: valueMm }).status,
        "valid"
      );
      formatDisplayLength(valueMm, unit);
    }
  }
  assert.equal(JSON.stringify(displayOnlyRecord), beforeUnitSwitch);
  assert.deepEqual(estimatedWindow.evidence, {
    width: "assumed",
    height: "assumed",
    sillHeight: "assumed",
  });
  assert.equal(formatDisplayLength(estimatedWindow.widthMm, "mm"), "1,200 mm");
  assert.equal(formatDisplayLength(estimatedWindow.widthMm, "ft-in"), "3′ 11.2″");
  assert.equal(formatDisplayLength(openingHeightMm, "ft-in"), "3′ 7.3″");
  assert.equal(formatDisplayLength(openingBottomMm, "ft-in"), "2′ 3.6″");
  assert.equal(getDisplayUnitMetadata("ft-in").indicator, "ft + in");

  const params = { rooms: [singleRoom], planWidthMeters: 5, planDepthMeters: 4 };
  const widthEdited = updatePlanOpeningMetrics(
    [estimatedWindow], estimatedWindow.id,
    {
      widthMeters: resolveImperialOpeningInput("4 ft 2 in", 1200, 400, 4940) / 1000,
      widthEvidence: "user_confirmed",
    },
    params
  )[0];
  assert.equal(widthEdited.widthMm, 1270);
  assert.equal(widthEdited.heightMm, estimatedWindow.heightMm);
  assert.equal(widthEdited.bottomMm, estimatedWindow.bottomMm);
  assert.deepEqual(widthEdited.evidence, {
    width: "user_confirmed",
    height: "assumed",
    sillHeight: "assumed",
  });

  const heightEdited = updatePlanOpeningMetrics(
    [estimatedWindow], estimatedWindow.id,
    {
      heightMeters: resolveImperialOpeningInput("3 ft 4 in", 1100, 1, 1900) / 1000,
      heightEvidence: "user_confirmed",
    },
    params
  )[0];
  assert.equal(heightEdited.widthMm, estimatedWindow.widthMm);
  assert.equal(heightEdited.heightMm, 1016);
  assert.equal(heightEdited.bottomMm, estimatedWindow.bottomMm);
  assert.deepEqual(heightEdited.evidence, {
    width: "assumed",
    height: "user_confirmed",
    sillHeight: "assumed",
  });

  const sillEdited = updatePlanOpeningMetrics(
    [estimatedWindow], estimatedWindow.id,
    {
      bottomMeters: resolveImperialOpeningInput("2 ft 6 in", 700, 0, 2599) / 1000,
      bottomEvidence: "user_confirmed",
    },
    params
  )[0];
  assert.equal(sillEdited.widthMm, estimatedWindow.widthMm);
  assert.equal(sillEdited.heightMm, estimatedWindow.heightMm);
  assert.equal(sillEdited.bottomMm, 762);
  assert.deepEqual(sillEdited.evidence, {
    width: "assumed",
    height: "assumed",
    sillHeight: "user_confirmed",
  });

  const protectedWindow: RoomOpening2D = {
    ...estimatedWindow,
    evidence: {
      width: "source_documented",
      height: "site_measured",
      sillHeight: "source_documented",
    },
  };
  const protectedBefore = JSON.stringify(protectedWindow);
  for (const unit of ["mm", "ft-in"] satisfies DisplayUnit[]) {
    formatDisplayLength(protectedWindow.widthMm, unit);
    formatDisplayLength(openingHeightMm, unit);
    formatDisplayLength(openingBottomMm, unit);
  }
  const protectedState = resolveDesignPageOpeningViewportState(
    { ...protectedWindow, wallSpanMeters: singleRoom.w },
    2600
  );
  assert.equal(JSON.stringify(protectedWindow), protectedBefore);
  assert.equal(protectedState?.inspector.widthEditable, false);
  assert.equal(protectedState?.inspector.heightEditable, false);
  assert.equal(protectedState?.inspector.sillEditable, false);

  const explicitImperialWindow = updatePlanOpeningMetrics(
    [estimatedWindow], estimatedWindow.id,
    {
      widthMeters: resolveImperialOpeningInput("4 ft 2 in", 1200, 400, 4940) / 1000,
      widthEvidence: "user_confirmed",
      heightMeters: resolveImperialOpeningInput("3 ft 4 in", 1100, 1, 1900) / 1000,
      heightEvidence: "user_confirmed",
      bottomMeters: resolveImperialOpeningInput("2 ft 6 in", 700, 0, 2599) / 1000,
      bottomEvidence: "user_confirmed",
    },
    params
  )[0];
  const doorWithZeroSill: RoomOpening2D = {
    ...explicitImperialWindow,
    id: "imperial-door",
    kind: "door",
    bottomMm: 0,
  };
  for (const unit of ["mm", "cm", "in", "ft-in"] satisfies DisplayUnit[]) {
    formatDisplayLength(doorWithZeroSill.bottomMm ?? 0, unit);
  }
  const snapshot: DesignSnapshot = {
    version: 3,
    rooms: [createRoom(singleRoom.id, "Seed room")],
    activeRoomId: singleRoom.id,
    floorPlan: { openings: [explicitImperialWindow, doorWithZeroSill] },
  };
  const restored = storedToSnapshot(JSON.parse(JSON.stringify(snapshotToStored(snapshot))));
  assert.deepEqual(restored.floorPlan?.openings?.[0], explicitImperialWindow);
  assert.equal(restored.floorPlan?.openings?.[1]?.bottomMm, 0);

  let historyState = [estimatedWindow];
  const history = new HistoryManager(
    () => historyState,
    (next) => { historyState = next; }
  );
  const imperialWidthEdit: Parameters<typeof updatePlanOpeningMetrics>[2] = {
    widthMeters: resolveImperialOpeningInput("4 ft 2 in", 1200, 400, 4940) / 1000,
    widthEvidence: "user_confirmed",
  };
  history.executeCommand({
    id: "imperial-width-edit",
    description: "Resize opening",
    input: imperialWidthEdit,
    execute: (metrics) => {
      historyState = updatePlanOpeningMetrics(
        historyState, estimatedWindow.id, metrics, params
      );
    },
  });
  assert.equal(historyState[0].widthMm, 1270);
  assert.equal(historyState[0].evidence?.width, "user_confirmed");
  assert.equal(history.undo(), "Resize opening");
  assert.deepEqual(historyState, [estimatedWindow]);
  assert.equal(history.redo(), "Resize opening");
  assert.equal(historyState[0].widthMm, 1270);
  assert.equal(historyState[0].evidence?.width, "user_confirmed");
}

function exerciseUnresolvedRepairHistory() {
  let state = [unresolvedOpening];
  const history = new HistoryManager(() => state, (next) => { state = next; });
  history.executeCommand({
    id: "repair-unresolved-opening",
    description: "Repair opening wall",
    input: "north" as const,
    execute: (wall) => {
      state = updatePlanOpeningMetrics(
        state, unresolvedOpening.id, { wall },
        { rooms: [lRoom], planWidthMeters: 6, planDepthMeters: 4 }
      );
    },
  });
  assert.equal(state[0].id, unresolvedOpening.id);
  assert.equal(resolveDesignPageOpeningHost(state[0], [lRoom]).status, "resolved");
  history.undo();
  assert.equal(resolveDesignPageOpeningHost(state[0], [lRoom]).status, "unresolved");
  history.redo();
  assert.equal(resolveDesignPageOpeningHost(state[0], [lRoom]).status, "resolved");
}

function cameraState(positionX: number): CameraState {
  return {
    projection: "perspective",
    position: [positionX, 5, 6],
    quaternion: [0, 0, 0, 1],
    target: [0, 1, 0],
    zoom: 1,
    fov: 46,
    near: 0.1,
    far: 300,
  };
}

function replaceBrowserGlobal(name: string, value: unknown) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  return () => previous
    ? Object.defineProperty(globalThis, name, previous)
    : Reflect.deleteProperty(globalThis, name);
}

async function observeCameraFrames(
  states: CameraState[],
  overrides: Partial<CameraSettleConfig> = {}
) {
  assert.ok(states.length > 0);
  let stateIndex = 0;
  let nextFrameId = 0;
  const cancelledFrames = new Set<number>();
  const dataset = {
    qaCameraState: JSON.stringify(states[0]),
    qaCameraRenderFrame: "1",
    qaCameraDampingEnabled: "true",
    qaCameraDampingFactor: "0.08",
  };
  const restoreDocument = replaceBrowserGlobal("document", { documentElement: { dataset } });
  const restoreRequest = replaceBrowserGlobal(
    "requestAnimationFrame",
    (callback: FrameRequestCallback) => {
      const frameId = ++nextFrameId;
      setImmediate(() => {
        if (cancelledFrames.has(frameId)) return;
        if (stateIndex < states.length - 1) {
          stateIndex += 1;
          dataset.qaCameraState = JSON.stringify(states[stateIndex]);
          dataset.qaCameraRenderFrame = String(stateIndex + 1);
        }
        callback(performance.now());
      });
      return frameId;
    }
  );
  const restoreCancel = replaceBrowserGlobal(
    "cancelAnimationFrame",
    (frameId: number) => cancelledFrames.add(frameId)
  );
  try {
    return await observeCameraSettleOnRenderFrames({
      ...WINDOW_OPENING_CAMERA_SETTLE_CONFIG,
      maximumDurationMs: 25,
      minimumStableDurationMs: 0,
      ...overrides,
    });
  } finally {
    restoreCancel();
    restoreRequest();
    restoreDocument();
  }
}

async function exerciseCameraSettleObservation() {
  const damping = await observeCameraFrames([
    cameraState(0), cameraState(1), cameraState(1.1),
    cameraState(1.104), cameraState(1.107), cameraState(1.1073),
    cameraState(1.10755),
  ]);
  assert.equal(damping.status, "settled");
  assert.equal(damping.stableSamples, 2);
  assert.equal(damping.renderFramesObserved, 6);

  const reset = await observeCameraFrames([
    cameraState(0), cameraState(0.0003), cameraState(0.001),
    cameraState(0.0013), cameraState(0.00155),
  ]);
  assert.equal(reset.status, "settled");
  assert.deepEqual(reset.samples.map((sample) => sample.stableSamples), [0, 1, 0, 1, 2]);

  const oneStableSample = await observeCameraFrames([
    cameraState(0), cameraState(1), cameraState(1.0003),
  ]);
  assert.equal(oneStableSample.status, "timed-out");
  assert.equal(oneStableSample.stableSamples, 1);
  assert.equal(oneStableSample.samples.length, 3);
  assert.match(oneStableSample.reason, /did not settle/);
  assert.ok(oneStableSample.samples[2].motion);

  const cumulativeMotion = await observeCameraFrames([
    cameraState(0), cameraState(0.004), cameraState(0.008),
  ]);
  assert.equal(cumulativeMotion.status, "timed-out");
  assert.deepEqual(cumulativeMotion.samples.map((sample) => sample.stableSamples), [0, 0, 0]);

  const stableWindowDrift = await observeCameraFrames(
    Array.from({ length: 18 }, (_, index) => cameraState(index * 0.00039)),
    { requiredStableSamples: 18 }
  );
  assert.equal(stableWindowDrift.status, "timed-out");
  assert.ok(stableWindowDrift.samples.every((sample) =>
    sample.projectedTailMotion === null || sample.projectedTailMotion.positionDistance <= 0.005
  ));
  assert.ok(stableWindowDrift.samples.some((sample) => sample.stableSamples === 12));
  assert.ok(stableWindowDrift.samples.some((sample, index) =>
    index > 0 && sample.stableSamples === 0
  ));

  const noOp = cameraTransition(cameraState(0), cameraState(0));
  assert.equal(noOp.positionDistance, 0);
  assert.ok(noOp.angleDeg < 10 && noOp.positionDistance < 0.75);
}

exerciseOpeningHistory();
exerciseAtomicKindHistory();
exerciseOpeningPersistence();
exerciseOpeningDisplayUnitIntegration();
exerciseUnresolvedRepairHistory();
exerciseCameraSettleObservation().then(
  () => console.log("Window-opening corrective behavior checks passed."),
  (cause) => {
    console.error(cause);
    process.exitCode = 1;
  }
);
