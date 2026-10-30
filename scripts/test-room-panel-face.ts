import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getRoomPanelStrips2D } from "../components/editor/renderers/roomPanelStrips2D";
import { evaluateConstraints } from "../lib/constraints/evaluate";
import { clampToRoom, getFurnitureWallInset } from "../lib/design-page-geometry";
import { buildCabinetryAvailableSpaces } from "../features/cabinetry/roomCabinetHosts";
import {
  clampToRoomInsideFinishes,
  getFurnitureRoomFrameInsideFinishes,
  getRoomClearInsideMetrics,
  getRoomOutlineInsideFinishes,
  getRoomSideFinishDepths,
  getRoomWallClearances,
  insetPolygonEdges,
  isBuiltInItem,
} from "../lib/room-finished-outline";
import { mapPlanOpeningsToRoomRenderer } from "../lib/design-page-plan-overlays";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "../lib/floor-materials";
import type { PersistedPlanOpening, RoomSnapshot } from "../lib/room-types";
import { buildRoomWallFinishQuantities } from "../lib/surface-material-wall-panels";
import { getWallPanelSurfaceSettings } from "../lib/surface-settings";
import { getWallPanelAssignment, getWholeWallPanelId, replaceWallPanelAssignment } from "../lib/wall-panel-ids";
import { buildHousePlan2D } from "../lib/design-page-house-plan";
import type { RoomRendererOpening } from "../lib/design-page-plan-overlays";
import {
  buildWallSurfacePanels,
  getWallOpenings,
  getWallSegments,
} from "../components/editor/renderers/house-plan-3d/geometry";
import { buildOpeningWallSurfacePanels } from "../components/editor/renderers/house-plan-3d/openingWallSurfacePanels";
import { withContinuousWallSelection } from "../components/editor/renderers/house-plan-3d/continuousWallSelection";
import { buildLegacyPhysicalOpeningAssemblies } from "../components/editor/renderers/house-plan-3d/LegacyWallOpeningMeshes";
import {
  getRectangleWallClearances,
  getRoomWallFaceIds,
  getRoomWallFinishDepths,
  getWallPanelFaceId,
} from "../lib/room-wall-finish-depths";
import { clampToPlacementRoom, isPlacementContainedInRoom } from "../lib/useDesignPagePlacementRoomQueries";

// The room measured to the laminate panel's face (J, 29 Oct 2026): "Add a clear size", "At the deepest panel", "Fix it, all
// from the face". A laminate stands 10 mm off the wall by default (MDF 9 mm and 1 mm of laminate), 44 mm at most.
const NORDIC_ACACIA = "greenlam-woodgrains-5394";
const ANIMA_WALL_TILE = "gardenia-wall-tile-anima-beige-0006044-120x120-196214-0";
const DEEPEST = { board: "mdf", boardThicknessMm: 18, fixing: "battens" } as const;
const V2_EAST = "wall-panel:v2:1:lam:east:segment-start:segment-end:interior";
const V2_EAST_OUTSIDE = "wall-panel:v2:1:lam:east:segment-start:segment-end:exterior";
const near = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} ${actual} ≠ ${expected}`);

function room(walls: NonNullable<RoomSnapshot["surfaces"]>["walls"], extra: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    id: "lam", name: "Living Room", roomType: "living", geometry: { width: 4, depth: 3, height: 2.6, wallThickness: 0.12 },
    planPosition: { x: 0, z: 0 }, surfaces: { walls }, items: [], zones: [], savedViews: [], ...extra,
  };
}

// Faces and panel ids: a v2 id names its face. Only this room's panels on the inside of a wall stand into it: not one on the
// wall's outside face, nor a duplicated room's copy of its source's panels (saved under the source's id, so never drawn
// here), nor an older id (laminates came after v2 ids).
assert.deepEqual(getRoomWallFaceIds({ planShape: "rectangle" }), ["north", "east", "south", "west"]);
assert.deepEqual(getRoomWallFaceIds({ planShape: "l_shape" }), ["wall-0", "wall-1", "wall-2", "wall-3", "wall-4", "wall-5"]);
assert.deepEqual(
  [
    V2_EAST, "wall-panel:v2:1:lam:3:segment-start:opening-d1-start:interior", V2_EAST_OUTSIDE,
    "wall-panel:v2:1:room_17:east:segment-start:segment-end:interior", "lam-north-selectable-face", "lam-3-side-positive",
  ].map((id) => getWallPanelFaceId(id, "lam")),
  ["east", "wall-3", null, null, null, null]
);

// Depths: each face's deepest finish, panels included; paint and tiles count as nothing.
const laminate = room({ default: { materialId: NORDIC_ACACIA } });
assert.deepEqual(getRoomWallFinishDepths(laminate), { north: 0.01, east: 0.01, south: 0.01, west: 0.01 });
assert.deepEqual(getRoomWallFinishDepths(room({ default: { materialId: ANIMA_WALL_TILE } })), {});
assert.deepEqual(getRoomWallFinishDepths(room({ default: { paintColorHex: "#ffffff" } })), {});
const tiledWithPanel = room({
  default: { materialId: ANIMA_WALL_TILE },
  faces: { north: { materialId: NORDIC_ACACIA } },
  panels: { [V2_EAST]: { materialId: NORDIC_ACACIA, panelBacking: DEEPEST } },
});
assert.deepEqual(getRoomWallFinishDepths(tiledWithPanel), { north: 0.01, east: 0.044 }, "part of the east wall counts for all of it");
const laminateMoved: RoomSnapshot = { ...laminate, planPosition: { x: 3, z: 0 } };
assert.equal(getRoomWallFinishDepths(laminate), getRoomWallFinishDepths(laminateMoved),
  "kept while the room's surfaces are the same object, as for the copy the 2D plan draws while a room is dragged");
const paintedWithOutsidePanel = room({
  default: { paintColorHex: "#ffffff" },
  panels: { [V2_EAST_OUTSIDE]: { materialId: NORDIC_ACACIA, panelBacking: DEEPEST } },
});
assert.deepEqual(getRoomWallFinishDepths(paintedWithOutsidePanel), {}, "a panel on the wall's outside face stands outside");
assert.deepEqual(
  getRoomWallFinishDepths({ ...laminate, floorElevationMm: 0 }), {},
  "a room from an imported plan keeps the bare wall: its walls draw the finish flat (the next PR)"
);

// The outline inside the panels: each edge moves in by its own depth.
assert.deepEqual(
  insetPolygonEdges([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }], [0.01, 0.044, 0, 0])
    .map(({ x, z }) => [Math.round(x * 1000), Math.round(z * 1000)]),
  [[-2000, -1490], [1956, -1490], [1956, 1500], [-2000, 1500]]
);
const lInside = getRoomOutlineInsideFinishes({ shape: "l_shape", w: 4, d: 3 }, { "wall-2": 0.02, "wall-3": 0.02 });
assert.equal(lInside.shape, "custom_polygon");
assert.deepEqual(lInside.polygon?.map(({ x, z }) => [Math.round(x * 1000), Math.round(z * 1000)]), [
  [-2000, -1500], [2000, -1500], [2000, 220], [300, 220], [300, 1500], [-2000, 1500],
], "the L's notch edges, at z = 0.24 m and x = 0.32 m, move in by 20 mm");
const plain = { shape: "rectangle" as const, w: 4, d: 3 };
assert.equal(getRoomOutlineInsideFinishes(plain, {}), plain, "a room without panels keeps its outline");
const notchDepths = { "wall-2": 0.02 };
assert.equal(
  getRoomOutlineInsideFinishes({ shape: "l_shape", w: 4, d: 3 }, notchDepths), getRoomOutlineInsideFinishes({ shape: "l_shape", w: 4, d: 3 }, notchDepths),
  "the same inset outline while the room's depths and outline are the same, so an item's clamp and re-clamp keep it"
);

// Furniture stops at each panel: 2 cm in front of it, as it stops 2 cm in front of a bare wall.
const inset = getFurnitureWallInset(0.12);
const [bareX, bareZ] = clampToRoom(5, -5, 1, 0.5, 4, 3, inset, 0);
const [panelX, panelZ] = clampToRoomInsideFinishes(5, -5, 1, 0.5, 4, 3, inset, 0, "rectangle", undefined, undefined, getRoomWallFinishDepths(tiledWithPanel));
near(bareX - panelX, 0.044, "east panel");
near(panelZ - bareZ, 0.01, "north panel");
const [againstEast] = clampToPlacementRoom(tiledWithPanel, 5, 0, 1, 0.5);
near(againstEast, 2 - 0.06 - 0.044 - 0.02 - 0.5);
const contained = (x: number) => isPlacementContainedInRoom({ room: tiledWithPanel, position: [x, 0, 0], rotationY: 0, dimensions: { w: 1000, d: 500, h: 800 } });
assert.equal(contained(bareX), false, "against the bare wall it would sit inside the panel");
assert.equal(contained(againstEast), true);
// In the 3D view a rectangle shrinks and shifts, so the item's wall snap stops at each panel too.
const frame = getFurnitureRoomFrameInsideFinishes(
  { roomWidth: 4, roomDepth: 3, roomPlanShape: "rectangle", roomWallFinishDepths: getRoomWallFinishDepths(tiledWithPanel) }, { x: 10, z: 20 }
);
near(frame.roomWidth, 4 - 0.044);
near(frame.roomDepth, 3 - 0.01);
near(frame.roomOriginX, 10 - 0.022);
near(frame.roomOriginZ, 20 + 0.005);
const lFrame = getFurnitureRoomFrameInsideFinishes(
  { roomWidth: 4, roomDepth: 3, roomPlanShape: "l_shape", roomWallFinishDepths: { "wall-1": 0.01 } }, { x: 0, z: 0 }
);
assert.equal(lFrame.roomPlanShape, "custom_polygon", "another shape takes the inset outline");

// The checks measure from the finished face. A TV console snapped against a painted wall reads 2 cm, not "Too tight" at -4 cm.
const CONSOLE = "tv-real-castlery-sloane-tv-console-150";
const consoleDepth = 0.4;
function wallMessage(walls: NonNullable<RoomSnapshot["surfaces"]>["walls"], z: number) {
  const results = evaluateConstraints({
    design: { items: [{ instanceId: "c", productId: CONSOLE, position: [0, 0, z], rotationY: 0 }] },
    movedItemId: "c",
    room: { width: 4, depth: 3, wallThickness: 0.12, wallFinishRoom: room(walls) },
  });
  return results.find((result) => result.id === "wall-gap")?.message ?? "";
}
assert.match(wallMessage({ default: { paintColorHex: "#ffffff" } }, -1.5 + inset + consoleDepth / 2), /Placed nicely against wall \(2cm gap\)/);
assert.match(wallMessage({ default: { materialId: NORDIC_ACACIA } }, -1.5 + inset + 0.01 + consoleDepth / 2), /\(2cm gap\)/);
assert.match(wallMessage({ default: { materialId: NORDIC_ACACIA } }, -1.5 + inset + consoleDepth / 2), /Too tight to wall \(1cm\)/, "into the panel");
const clear = getRectangleWallClearances({
  width: 4, depth: 3, wallThickness: 0.12, depths: { east: 0.044 }, center: { x: 1.3, z: 0 }, footprint: { w: 1, d: 0.5 },
});
near(clear.x, 2 - 0.06 - 0.044 - 0.5 - 1.3);
near(clear.z, 1.5 - 0.06 - 0.25);
// Each axis takes the nearer finished face: an item 3.8 m wide, 5 mm east of the centre, is 1 mm from a 44 mm west panel.
const wide = getRectangleWallClearances({
  width: 4, depth: 3, wallThickness: 0.12, depths: { west: 0.044 }, center: { x: 0.005, z: 0 }, footprint: { w: 3.8, d: 0.5 },
});
near(wide.x, 0.001);
near(getRoomWallClearances(tiledWithPanel, { x: 1.3, z: 0 }, { w: 1, d: 0.5 }).x, clear.x, "a room snapshot's clearances");
// An L-shape's or drawn shape's checks measure its rectangle: each side stops at the deepest panel along it.
const lRoom = room(
  { default: { paintColorHex: "#ffffff" }, faces: { "wall-1": { materialId: NORDIC_ACACIA, panelBacking: DEEPEST }, "wall-2": { materialId: NORDIC_ACACIA } } },
  { planShape: "l_shape" }
);
assert.deepEqual(getRoomSideFinishDepths(lRoom, { w: 4, d: 3 }), { east: 0.044 }, "the notch's walls are inside the rectangle");
assert.deepEqual(getRoomSideFinishDepths(tiledWithPanel, { w: 4, d: 3 }), { north: 0.01, east: 0.044 }, "a rectangle's walls are its sides");
const lLaminate = room({ default: { materialId: NORDIC_ACACIA } }, { planShape: "l_shape" });
assert.match(
  evaluateConstraints({
    design: { items: [{ instanceId: "c", productId: CONSOLE, position: [0, 0, -1.5 + inset + 0.01 + consoleDepth / 2], rotationY: 0 }] },
    movedItemId: "c",
    room: { width: 4, depth: 3, wallThickness: 0.12, wallFinishRoom: lLaminate },
  }).find((result) => result.id === "wall-gap")?.message ?? "",
  /\(2cm gap\)/,
  "an L-shaped room's checks measure from its panels as a rectangle's do"
);

// Built-ins: a wall's host is its finished face, from the finished face of the wall at one end to the other's (half each wall
// in, and its panel), and its back stands on the face (J, 29 Oct 2026: "Face, back flush"; features/cabinetry/roomCabinetHosts.ts).
const [north, east] = buildCabinetryAvailableSpaces({ activeRoom: tiledWithPanel, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.deepEqual([north.availableWidthMm, east.availableWidthMm], [4000 - 120 - 44, 3000 - 120 - 10]);
near(north.wallSegment!.startZmm, -1500 + 60 + 10, "the north host stands on its panel's face");
near(north.wallSegment!.endXmm, 2000 - 60 - 44, "and stops at the east wall's panel");
near(east.wallSegment!.startXmm, 2000 - 60 - 44, "the east host is its panel's face");
const builtIn = (x: number) => isPlacementContainedInRoom({
  room: tiledWithPanel, position: [x, 0, 0], rotationY: 0, dimensions: { w: 1000, d: 500, h: 800 }, builtIn: true,
});
assert.equal(builtIn(2 - 0.06 - 0.044 - 0.5), true, "a built-in may stand against the panel's face");
assert.equal(contained(2 - 0.06 - 0.044 - 0.5), false, "furniture keeps 2 cm off it");
assert.equal(builtIn(2 - 0.06 - 0.044 - 0.5 + 0.001), false, "but not into the panel");
assert.deepEqual([isBuiltInItem({ assetType: "parametric_cabinet" }), isBuiltInItem({ assetType: "catalog" })], [true, false]);

// The clear size inside the panels, for the room inspector; nothing without panels.
const metres = (valueMm: number) => `${(valueMm / 1000).toFixed(2)} m`;
const planRoom = { id: "lam", name: "Living Room", roomType: "living" as const, shape: "rectangle" as const, w: 4, d: 3, wallThickness: 0.12, x: 0, z: 0 };
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: laminate.surfaces }, metres), ["Clear inside 3.86 m × 2.86 m"]);
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: tiledWithPanel.surfaces }, metres), ["Clear inside 3.84 m × 2.87 m"]);
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: { walls: { default: { paintColorHex: "#ffffff" } } } }, metres), []);

// The 2D plan draws each panel inside its wall band, its face as a line.
const { strips } = getRoomPanelStrips2D({ ...planRoom, surfaces: tiledWithPanel.surfaces });
assert.deepEqual(strips.map((strip) => strip.faceId), ["north", "east"]);
assert.deepEqual(strips.map((strip) => strip.finish.materialId), [NORDIC_ACACIA, NORDIC_ACACIA],
  "a strip is drawn in its deepest finish: the east wall's is its panel's laminate, not the face's tile");
const OTHER_LAMINATE = "greenlam-woodgrains-5003";
assert.equal(
  getRoomPanelStrips2D({ ...planRoom, surfaces: { walls: { default: { materialId: NORDIC_ACACIA }, panels: { [V2_EAST]: { materialId: OTHER_LAMINATE } } } } })
    .strips.find((strip) => strip.faceId === "east")?.finish.materialId,
  OTHER_LAMINATE, "a panel as deep as the room's laminate wins: it's the one the 3D view draws there"
);
const eastFace = strips[1].faceLine.map(([x, , z]) => [Math.round(x * 1000), Math.round(z * 1000)]);
assert.deepEqual(eastFace, [[1896, -1430], [1896, 1440]], "60 mm in from the centre line, then 44 mm of panel; mitred at the north panel");
assert.deepEqual(getRoomPanelStrips2D({ ...planRoom, surfaces: { walls: { default: { paintColorHex: "#fff" } } } }).strips, []);
const draggedRoom = { ...planRoom, surfaces: tiledWithPanel.surfaces };
assert.equal(getRoomPanelStrips2D({ ...draggedRoom, x: 0.5 }), getRoomPanelStrips2D({ ...draggedRoom, x: 0.6 }), "the same strips while a room is dragged");

// A strip stops at a doorway, where the 3D view's panel stops, and runs on under a window's sill (29 Oct 2026).
const opening = (id: string, wall: PersistedPlanOpening["wall"], extra: Partial<PersistedPlanOpening> = {}): PersistedPlanOpening =>
  ({ id, roomId: "lam", wall, offsetMm: 0, widthMm: 900, heightMm: 2100, bottomMm: 0, kind: "door", ...extra });
const stripRoom = { ...planRoom, surfaces: laminate.surfaces };
const neighbour = { ...stripRoom, id: "next", name: "Study", roomType: "bedroom" as const, x: 3.5, w: 3, surfaces: undefined };
const facesWith = (openings: PersistedPlanOpening[], faceId: string) => {
  const context = { rooms: [stripRoom, neighbour], openings: mapPlanOpeningsToRoomRenderer(openings, [stripRoom, neighbour]) };
  return getRoomPanelStrips2D(stripRoom, context).strips.filter((strip) => strip.faceId === faceId)
    .map((strip) => strip.faceLine.map(([x, , z]) => Math.round((faceId === "north" || faceId === "south" ? x : z) * 1000)));
};
assert.deepEqual(facesWith([], "north"), [[-1930, 1930]], "a 10 mm panel: 70 mm in from the centre line at each end");
assert.deepEqual(facesWith([opening("d1", "north")], "north"), [[-1930, -450], [450, 1930]], "a 900 mm door, centred");
assert.deepEqual(
  facesWith([opening("w1", "north", { kind: "window", widthMm: 1200, heightMm: 1200, bottomMm: 900 })], "north"), [[-1930, 1930]],
  "a window's panel runs on under its sill"
);
assert.deepEqual(facesWith([opening("d2", "north", { offsetMm: -1520 })], "north"), [[-1070, 1930]],
  "a door 30 mm from the corner leaves nothing of the strip beside it");
assert.deepEqual(facesWith([opening("d3", "west", { roomId: "next", offsetMm: 0 })], "east"), [[-1430, -450], [450, 1430]],
  "a door the room next door hosts in a shared wall stops this side's strip too");
assert.deepEqual(facesWith([opening("d4", "south")], "south"), [[1930, 450], [-450, -1930]], "the south face runs east to west");
assert.deepEqual(facesWith([opening("d5", "west")], "west"), [[1430, 450], [-450, -1430]], "the west face runs south to north");
for (const [label, bottomMm] of [["down to the floor", 0], ["on a 50 mm sill, under which the 3D view draws no panel", 50]] as const) {
  assert.deepEqual(
    facesWith([opening("w2", "north", { kind: "window", widthMm: 1200, heightMm: 2000, bottomMm })], "north"),
    [[-1930, -600], [600, 1930]], `a window ${label} stops the strip`
  );
}
// A drawn L: a door on the notch's wall that ends at the notch corner leaves no piece of the strip past it.
const drawnL = { ...stripRoom, id: "ell", shape: "custom_polygon" as const, w: 4, d: 4,
  polygon: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 }] };
const notchWall = getWallSegments(drawnL)[2];
const notchDoor: RoomRendererOpening = { id: "dn", roomId: "ell", wall: "north", kind: "door", offset: notchWall.length / 2 - 0.45,
  width: 0.9, height: 2.1, bottom: 0, hostSegmentKey: notchWall.key, hostWorldCenter: { x: 0.45, z: 0 } };
assert.deepEqual(
  getRoomPanelStrips2D(drawnL, { rooms: [drawnL], openings: [notchDoor] }).strips.filter((strip) => strip.faceId === "wall-2")
    .map((strip) => strip.faceLine.map(([x]) => Math.round(x * 1000))),
  [[1930, 900]], "wall-2 runs from (2, 0) to the notch corner; its strip stops at the door, 900 mm short of the corner"
);
const notchStartWall = getWallSegments(drawnL)[3];
const notchStartDoor: RoomRendererOpening = { ...notchDoor, id: "ds", offset: -notchStartWall.length / 2 + 0.45,
  hostSegmentKey: notchStartWall.key, hostWorldCenter: { x: 0, z: 0.45 } };
assert.deepEqual(
  getRoomPanelStrips2D(drawnL, { rooms: [drawnL], openings: [notchStartDoor] }).strips.filter((strip) => strip.faceId === "wall-3")
    .map((strip) => strip.faceLine.map(([, , z]) => Math.round(z * 1000))),
  [[900, 1930]], "wall-3 starts at the notch corner: a door there leaves no piece of the strip before it"
);
const stripContext = { rooms: [stripRoom], openings: mapPlanOpeningsToRoomRenderer([opening("d1", "north")], [stripRoom]) };
assert.equal(getRoomPanelStrips2D({ ...stripRoom, x: 0.5 }, stripContext), getRoomPanelStrips2D({ ...stripRoom, x: 0.6 }, stripContext),
  "the same strips while a room with a door is dragged: its doorways are measured where the room is saved");
assert.equal(
  getRoomPanelStrips2D(stripRoom, stripContext),
  getRoomPanelStrips2D(stripRoom, { rooms: [stripRoom], openings: mapPlanOpeningsToRoomRenderer([opening("d1", "north")], [stripRoom]) }),
  "and while the plan's openings are rebuilt with the same doorways, as on an edit elsewhere"
);

// A whole wall's finish stays on its pieces once a door splits the wall, until a piece is given its own (J, 29 Oct 2026:
// "Keep it on the pieces"): the 3D view, the inspector and the apply action read it under each piece, and the bill of
// materials counts it there. Before, a door gave the pieces new ids and the finish vanished, though it still counted for depth.
const WHOLE_NORTH = "wall-panel:v2:1:lam:north:segment-start:segment-end:interior";
const northPieceIds = [
  "wall-panel:v2:1:lam:north:segment-start:opening-d1-start:interior",
  "wall-panel:v2:1:lam:north:lam-north-d1-lintel_start:lam-north-d1-lintel_end:interior",
];
assert.deepEqual(northPieceIds.map((id) => getWholeWallPanelId([id])), [WHOLE_NORTH, WHOLE_NORTH]);
assert.equal(getWholeWallPanelId(["lam-north-part-0", WHOLE_NORTH.replace(":interior", ":exterior")]),
  WHOLE_NORTH.replace(":interior", ":exterior"), "the first v2 id's whole wall, on its own side");
assert.equal(getWholeWallPanelId(["lam-north-part-0", null]), null, "older ids have no whole wall");
const wholeNorthWalls = { default: { paintColorHex: "#ffffff" }, panels: { [WHOLE_NORTH]: { materialId: NORDIC_ACACIA, panelBacking: DEEPEST } } };
const pieceFinish = (walls: typeof wholeNorthWalls, id: string) => getWallPanelSurfaceSettings(
  { walls }, "north", id, normalizeFloorRotationDeg, clampFloorPatternScale).materialId ?? "paint";
assert.deepEqual(northPieceIds.map((id) => pieceFinish(wholeNorthWalls, id)), [NORDIC_ACACIA, NORDIC_ACACIA]);
const onePiecePainted = { ...wholeNorthWalls, panels: { ...wholeNorthWalls.panels, [northPieceIds[0]]: { paintColorHex: "#d0d0d0" } } };
assert.deepEqual(northPieceIds.map((id) => pieceFinish(onePiecePainted, id)), ["paint", NORDIC_ACACIA], "a piece's own finish wins");
assert.equal(pieceFinish(wholeNorthWalls, northPieceIds[0].replace(":interior", ":exterior")), "paint",
  "a wall's outside takes only its own whole-wall finish");
const laminateRows = (walls: typeof wholeNorthWalls, openings: PersistedPlanOpening[]) =>
  buildRoomWallFinishQuantities([room(walls)], openings)[0].assignedPanels.filter((panel) => panel.settings.materialId === NORDIC_ACACIA)
    .map((panel) => [panel.faceId, Math.round(panel.areaSqm * 100) / 100]);
assert.deepEqual(laminateRows(wholeNorthWalls, [opening("d1", "north")]), [["north", 8.51]],
  "the wall less its 900 × 2100 mm doorway: the pieces beside it and the one above");
assert.deepEqual(laminateRows(wholeNorthWalls, [opening("w1", "north", { kind: "window", widthMm: 1200, heightMm: 1200, bottomMm: 900 })]),
  [["north", 8.96]], "a window's wall is one target, as before");
// As the 3D view draws the north wall's inside: the pieces beside the door, then the one above it, which can't be selected
// and shows the whole wall's finish only while a side piece still does.
const RIGHT_OF_DOOR = "wall-panel:v2:1:lam:north:opening-d1-end:segment-end:interior";
type Walls = NonNullable<RoomSnapshot["surfaces"]>["walls"];
const drawnNorth = (walls: Walls, openings: PersistedPlanOpening[] = [opening("d1", "north")]) => {
  const [planRoom3D] = buildHousePlan2D([room(walls)], 0, 0).rooms;
  const segment = getWallSegments(planRoom3D).find((candidate) => candidate.wall === "north")!;
  const wallOpenings = getWallOpenings(planRoom3D, segment, [planRoom3D], mapPlanOpeningsToRoomRenderer(openings, [planRoom3D]));
  return withContinuousWallSelection(planRoom3D, segment, wallOpenings, [
    ...buildWallSurfacePanels(planRoom3D, segment, wallOpenings),
    ...buildOpeningWallSurfacePanels(planRoom3D, [planRoom3D], segment, wallOpenings, 2.6).filter((panel) => panel.role === "interior"),
  ], 2.6, 0.12).map((panel) => getWallPanelSurfaceSettings(planRoom3D.surfaces, panel.faceId, panel.selectionPanelId ?? panel.panelId,
    normalizeFloorRotationDeg, clampFloorPatternScale, [panel.panelId, ...panel.legacyPanelIds], panel.inheritsWholeWall !== false)
    .materialId ?? "paint");
};
const paintPieces = (ids: string[]) => ({ ...wholeNorthWalls, panels: { ...wholeNorthWalls.panels,
  ...Object.fromEntries(ids.map((id) => [id, { paintColorHex: "#d0d0d0" }])) } });
assert.deepEqual(drawnNorth(wholeNorthWalls), [NORDIC_ACACIA, NORDIC_ACACIA, NORDIC_ACACIA]);
assert.deepEqual(drawnNorth(paintPieces([northPieceIds[0]])), ["paint", NORDIC_ACACIA, NORDIC_ACACIA], "one side painted");
assert.deepEqual(drawnNorth(paintPieces([northPieceIds[0], RIGHT_OF_DOOR])), ["paint", "paint", "paint"],
  "both sides painted: the piece above the door follows them");
assert.deepEqual(laminateRows(paintPieces([northPieceIds[0], RIGHT_OF_DOOR]), [opening("d1", "north")]), [],
  "and orders no laminate for it");
// It goes by the pieces beside its own door: with two doors, painting both sides of one leaves the other's lintel laminate.
const twoDoors = [opening("d1", "north", { offsetMm: -1000 }), opening("d2", "north", { offsetMm: 1000 })];
const besideD1 = ["wall-panel:v2:1:lam:north:segment-start:opening-d1-start:interior",
  "wall-panel:v2:1:lam:north:opening-d1-end:opening-d2-start:interior"];
assert.deepEqual(drawnNorth(paintPieces(besideD1), twoDoors), ["paint", "paint", NORDIC_ACACIA, "paint", NORDIC_ACACIA],
  "the pieces left of, between and right of the doors, then the pieces above d1 and d2");
assert.deepEqual(laminateRows(paintPieces(besideD1), twoDoors), [["north", 1.88]], "0.55 × 2.6 m right of d2 and 0.9 × 0.5 m above it");
assert.deepEqual(drawnNorth(wholeNorthWalls, [opening("dw", "north", { widthMm: 4000 })]), [NORDIC_ACACIA],
  "a door as wide as the wall: the piece above it keeps the whole wall's finish");
// Once both sides have their own, the piece above the door shows the face's finish, as a door's lintel always did: here the
// room's laminate, under a whole wall painted in 3D before the door.
// A paint is saved with no material, as the apply action saves it (createSurfaceSettingsPatch).
const savedPaint = (paintColorHex: string) => ({ materialId: null, paintColorHex });
const laminateRoomPaintedWall: Walls = { default: { materialId: NORDIC_ACACIA }, panels: { [WHOLE_NORTH]: savedPaint("#ffffff"),
  [northPieceIds[0]]: savedPaint("#222222"), [RIGHT_OF_DOOR]: savedPaint("#222222") } };
assert.deepEqual(drawnNorth(laminateRoomPaintedWall), ["paint", "paint", NORDIC_ACACIA]);
// Saving and clearing a piece: its own finish over the whole wall's, which stays for the wall's other pieces.
const savedPanels = { [WHOLE_NORTH]: { materialId: NORDIC_ACACIA }, [northPieceIds[0]]: { paintColorHex: "#d0d0d0" } };
assert.deepEqual(getWallPanelAssignment(savedPanels, RIGHT_OF_DOOR, []), { materialId: NORDIC_ACACIA }, "a piece without its own");
assert.deepEqual(getWallPanelAssignment(savedPanels, northPieceIds[0], []), { paintColorHex: "#d0d0d0" });
assert.deepEqual(replaceWallPanelAssignment(savedPanels, northPieceIds[0], ["lam-north-part-0"]), { [WHOLE_NORTH]: { materialId: NORDIC_ACACIA } },
  "a cleared piece shows the whole wall's finish again");
assert.deepEqual(Object.keys(replaceWallPanelAssignment(savedPanels, RIGHT_OF_DOOR, [], { paintColorHex: "#000000" })).sort(),
  [northPieceIds[0], RIGHT_OF_DOOR, WHOLE_NORTH].sort(), "saving a piece keeps the whole wall's finish for the others");
// A door's outline stands in front of the deeper of its wall's two faces: here the room next door's 44 mm panel.
const sharedDoorRooms = buildHousePlan2D([
  room({ default: { paintColorHex: "#ffffff" } }, { id: "a" }),
  room({ default: { materialId: NORDIC_ACACIA, panelBacking: DEEPEST } }, { id: "b", planPosition: { x: 3.5, z: 0 },
    geometry: { width: 3, depth: 3, height: 2.6, wallThickness: 0.12 } }),
], 0, 0).rooms;
const [sharedDoor] = buildLegacyPhysicalOpeningAssemblies({ visibleRooms: sharedDoorRooms, topologyRooms: sharedDoorRooms, defaultWallHeight: 2.6,
  openings: mapPlanOpeningsToRoomRenderer([opening("d6", "east", { roomId: "a" })], sharedDoorRooms) });
assert.deepEqual([sharedDoor.room.id, sharedDoor.panelDepth], ["a", 0.044]);

// The wiring: the active room's clamp, the checks' callers, the 3D window outline and the inside corners.
const read = (path: string) => readFileSync(path, "utf8");
assert.match(read("lib/useDesignPageHousePlanState.ts"), /clampToRoomInsideFinishes\([\s\S]*?getRoomWallFinishDepths\(activeRoom\)\s*\)/);
assert.match(
  read("lib/useDesignPageSceneItemDrag.ts"),
  /: clampToRoomInsideFinishes\([^\n]*\n(?:[^\n]*\n){7}\s*targetRoom\.planHoles,\s*getRoomWallFinishDepths\(targetRoom\)\s*\)/,
  "an item dragged into another room is clamped to that room's own shape and panels"
);
for (const file of ["lib/useDesignPageSceneItemDrag.ts", "lib/useDesignPageSelectionTransforms.ts"]) {
  assert.match(read(file), /room: \{ width: roomWidth, depth: roomDepth, wallThickness, wallFinishRoom: activeRoom \}/, file);
}
assert.match(read("lib/useDesignPageAiWorkspaceRegistration.ts"), /wallFinishRoom: activeRoom \?\? null/);
assert.match(read("components/editor/design-page/SceneItemsLayer.tsx"), /\{\.\.\.getFurnitureRoomFrameInsideFinishes\(sceneEntry, roomOffset\)\}/);
assert.match(read("components/editor/renderers/house-plan-3d/WindowOpeningMesh.tsx"), /wallThickness \/ 2 \+ panelDepth \+ 0\.003/);
assert.match(
  read("components/editor/renderers/house-plan-3d/geometry.ts"),
  /const adjacentFace = halfThickness \+ \(isInteriorSurface && segment\.key > adjacentSegment\.key\s*\? getRoomWallFinishDepths\(room\)/
);
assert.match(
  read("components/editor/renderers/RoomRenderer2D.tsx"),
  /<RoomPanelFaces2D rooms=\{wallBandRooms\} planRooms=\{rooms\} openings=\{openings\} shown=\{wallBandLayout\.parts\.length > 0\} isPro=\{isPro\} \/>/
);
assert.equal((read("lib/useDesignPageSurfaceActions.ts").match(/\b(get|replace)WallPanelAssignment\(/g) ?? []).length, 7,
  "the apply, adjust and reset actions read and save a piece's finish with lib/wall-panel-ids.ts");
assert.match(read("lib/useDesignPageCommerceOnboardingRegistration.ts"), /wallFinishRoom: activeRoom \?\? null/,
  "onboarding's first-sofa check measures to the active room's panels");
assert.match(read("lib/useDesignPageOnboarding.ts"), /room: \{ width: roomWidth, depth: roomDepth, wallThickness, wallFinishRoom \}/);
assert.match(read("components/editor/renderers/house-plan-3d/wallAndOpeningMeshes.tsx"),
  /const highlightDepth = Math\.max\(thresholdDepth \+ 0\.024, wallThickness \+ 2 \* \(panelDepth \+ 0\.003\)\);/,
  "a door's outline stands in front of a deep panel");
assert.match(read("components/editor/renderers/house-plan-3d/LegacyWallOpeningMeshes.tsx"), /panelDepth=\{assembly\.panelDepth\}/);
assert.match(read("components/editor/renderers/RoomPanelFaces2D.tsx"), /color=\{getWallFinishPlanColor\(strip\.finish, isPro, palette\)\}/,
  "A panel strip takes its deepest finish's plan colour.");
assert.match(read("components/editor/renderers/house-plan-3d/wallAndOpeningMeshes.tsx"),
  /\[panel\.panelId, \.\.\.panel\.legacyPanelIds\], panel\.inheritsWholeWall !== false\);/, "the 3D panel reads the piece-above-a-door rule");
assert.match(read("lib/useDesignPageSelectionInspectorModel.ts"), /metrics: getRoomClearInsideMetrics\(selectedPlanRoom,/);

console.log("Room measured to the panel face checks passed.");
