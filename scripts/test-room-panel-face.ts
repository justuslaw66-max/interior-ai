import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getRoomPanelStrips2D } from "../components/editor/renderers/roomPanelStrips2D";
import { evaluateConstraints } from "../lib/constraints/evaluate";
import { clampToRoom, getFurnitureWallInset } from "../lib/design-page-geometry";
import { buildCabinetryAvailableSpaces } from "../features/cabinetry/useDesignPageCabinetry";
import {
  clampToRoomInsideFinishes,
  getFurnitureRoomFrameInsideFinishes,
  getRoomClearInsideMetrics,
  getRoomOutlineInsideFinishes,
  getRoomSideFinishDepths,
  getRoomWallClearances,
  insetPolygonEdges,
} from "../lib/room-finished-outline";
import { mapPlanOpeningsToRoomRenderer } from "../lib/design-page-plan-overlays";
import { clampFloorPatternScale, normalizeFloorRotationDeg } from "../lib/floor-materials";
import type { PersistedPlanOpening, RoomSnapshot } from "../lib/room-types";
import { buildRoomWallFinishQuantities } from "../lib/surface-material-wall-panels";
import { getWallPanelSurfaceSettings } from "../lib/surface-settings";
import { getWholeWallPanelId } from "../lib/wall-panel-ids";
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

// Built-ins: a cabinet run along a wall is the clear length between the walls either side, less their panels.
const [north, east] = buildCabinetryAvailableSpaces({ activeRoom: tiledWithPanel, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.deepEqual([north.availableWidthMm, east.availableWidthMm], [4000 - 240 - 44, 3000 - 240 - 10]);

// The clear size inside the panels, for the room inspector; nothing without panels.
const metres = (valueMm: number) => `${(valueMm / 1000).toFixed(2)} m`;
const planRoom = { id: "lam", name: "Living Room", roomType: "living" as const, shape: "rectangle" as const, w: 4, d: 3, wallThickness: 0.12, x: 0, z: 0 };
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: laminate.surfaces }, metres), ["Clear inside 3.86 m × 2.86 m"]);
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: tiledWithPanel.surfaces }, metres), ["Clear inside 3.84 m × 2.87 m"]);
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: { walls: { default: { paintColorHex: "#ffffff" } } } }, metres), []);

// The 2D plan draws each panel inside its wall band, its face as a line.
const { strips } = getRoomPanelStrips2D({ ...planRoom, surfaces: tiledWithPanel.surfaces });
assert.deepEqual(strips.map((strip) => strip.faceId), ["north", "east"]);
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
    .map((strip) => strip.faceLine.map(([x, , z]) => Math.round((faceId === "north" ? x : z) * 1000)));
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
const stripContext = { rooms: [stripRoom], openings: mapPlanOpeningsToRoomRenderer([opening("d1", "north")], [stripRoom]) };
assert.equal(getRoomPanelStrips2D({ ...stripRoom, x: 0.5 }, stripContext), getRoomPanelStrips2D({ ...stripRoom, x: 0.6 }, stripContext),
  "the same strips while a room with a door is dragged: its doorways are measured where the room is saved");

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
const [wholeNorthWithDoor] = buildRoomWallFinishQuantities([room(wholeNorthWalls)], [opening("d1", "north")]);
assert.deepEqual(
  wholeNorthWithDoor.assignedPanels.map((panel) => [panel.faceId, panel.settings.materialId, Math.round(panel.areaSqm * 100) / 100]),
  [["north", NORDIC_ACACIA, 8.51]],
  "the wall less its 900 × 2100 mm doorway: the pieces beside it and the one above"
);

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
assert.match(read("lib/useDesignPageSurfaceActions.ts"),
  /return \[panelId, \.\.\.aliases, getWholeWallPanelId\(\[panelId\]\) \?\? ""\]\.map\(\(id\) => panels\[id\]\)\.find\(Boolean\);/,
  "a piece's finish is applied over its whole wall's");
assert.match(read("lib/useDesignPageSurfaceActions.ts"),
  /const inherited = !settings && !ownIds\.some[^\n]*\n\s*\[\.\.\.ownIds, \.\.\.\(inherited \? \[getWholeWallPanelId\(\[panelId\]\) \?\? ""\] : \[\]\)\]/,
  "resetting a piece that shows only its whole wall's finish resets that finish");
assert.match(read("lib/useDesignPageCommerceOnboardingRegistration.ts"), /wallFinishRoom: activeRoom \?\? null/,
  "onboarding's first-sofa check measures to the active room's panels");
assert.match(read("lib/useDesignPageOnboarding.ts"), /room: \{ width: roomWidth, depth: roomDepth, wallThickness, wallFinishRoom \}/);
assert.match(read("components/editor/renderers/house-plan-3d/wallAndOpeningMeshes.tsx"),
  /const highlightDepth = Math\.max\(thresholdDepth \+ 0\.024, wallThickness \+ 2 \* \(panelDepth \+ 0\.003\)\);/,
  "a door's outline stands in front of a deep panel");
assert.match(read("components/editor/renderers/house-plan-3d/LegacyWallOpeningMeshes.tsx"),
  /panelDepth=\{getRoomWallFinishDepths\(assembly\.room\)\[getWallSurfaceFaceId\(assembly\.room, assembly\.segment\)\] \?\? 0\}/);
assert.match(read("components/editor/renderers/RoomPanelFaces2D.tsx"), /color=\{getHouseRoomWallPlanColor\(room, strip\.faceId, isPro, palette\)\}/, "A panel strip takes its wall's plan colour.");
assert.match(read("lib/useDesignPageSelectionInspectorModel.ts"), /metrics: getRoomClearInsideMetrics\(selectedPlanRoom,/);

console.log("Room measured to the panel face checks passed.");
