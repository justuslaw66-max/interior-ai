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
  insetPolygonEdges,
} from "../lib/room-finished-outline";
import type { RoomSnapshot } from "../lib/room-types";
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
const V2_EAST = "wall-panel:v2:1:lam:east:start:end:full";
const near = (actual: number, expected: number, message?: string) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ""} ${actual} ≠ ${expected}`);

function room(walls: NonNullable<RoomSnapshot["surfaces"]>["walls"], extra: Partial<RoomSnapshot> = {}): RoomSnapshot {
  return {
    id: "lam", name: "Living Room", roomType: "living", geometry: { width: 4, depth: 3, height: 2.6, wallThickness: 0.12 },
    planPosition: { x: 0, z: 0 }, surfaces: { walls }, items: [], zones: [], savedViews: [], ...extra,
  };
}

// Faces and panel ids: a v2 id names its face; an older one starts with the wall's key.
assert.deepEqual(getRoomWallFaceIds({ planShape: "rectangle" }), ["north", "east", "south", "west"]);
assert.deepEqual(getRoomWallFaceIds({ planShape: "l_shape" }), ["wall-0", "wall-1", "wall-2", "wall-3", "wall-4", "wall-5"]);
assert.deepEqual(
  [V2_EAST, "lam-north-selectable-face", "lam-3-side-positive", "elsewhere-north", "lam-attic"].map((id) => getWallPanelFaceId(id, "lam")),
  ["east", "north", "wall-3", null, null]
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
assert.equal(getRoomWallFinishDepths(laminate), getRoomWallFinishDepths(laminate), "kept while the room is the same object");

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

// Built-ins: a cabinet run along a wall is the clear length between the walls either side, less their panels.
const [north, east] = buildCabinetryAvailableSpaces({ activeRoom: tiledWithPanel, activePlanRoom: null, planRoomCount: 1, planOpenings: [] });
assert.deepEqual([north.availableWidthMm, east.availableWidthMm], [4000 - 240 - 44, 3000 - 240 - 10]);

// The clear size inside the panels, for the room inspector; nothing without panels.
const metres = (valueMm: number) => `${(valueMm / 1000).toFixed(2)} m`;
const planRoom = { id: "lam", shape: "rectangle" as const, w: 4, d: 3, wallThickness: 0.12, x: 0, z: 0 };
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: laminate.surfaces }, metres), ["Clear inside 3.86 m × 2.86 m"]);
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: tiledWithPanel.surfaces }, metres), ["Clear inside 3.84 m × 2.87 m"]);
assert.deepEqual(getRoomClearInsideMetrics({ ...planRoom, surfaces: { walls: { default: { paintColorHex: "#ffffff" } } } }, metres), []);

// The 2D plan draws each panel inside its wall band, its face as a line.
const { strips } = getRoomPanelStrips2D({ ...planRoom, surfaces: tiledWithPanel.surfaces });
assert.deepEqual(strips.map((strip) => strip.faceId), ["north", "east"]);
const eastFace = strips[1].faceLine.map(([x, , z]) => [Math.round(x * 1000), Math.round(z * 1000)]);
assert.deepEqual(eastFace, [[1896, -1430], [1896, 1440]], "60 mm in from the centre line, then 44 mm of panel; mitred at the north panel");
assert.deepEqual(getRoomPanelStrips2D({ ...planRoom, surfaces: { walls: { default: { paintColorHex: "#fff" } } } }).strips, []);

// The wiring: the active room's clamp, the checks' callers, the 3D window outline and the inside corners.
const read = (path: string) => readFileSync(path, "utf8");
assert.match(read("lib/useDesignPageHousePlanState.ts"), /clampToRoomInsideFinishes\([\s\S]*?activeRoomWallFinishDepths\s*\)/);
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
assert.match(read("components/editor/renderers/RoomRenderer2D.tsx"), /<RoomPanelFaces2D rooms=\{wallBandRooms\} shown=\{wallBandLayout\.parts\.length > 0\} isPro=\{isPro\} \/>/);
assert.match(read("components/editor/renderers/RoomPanelFaces2D.tsx"), /color=\{getHouseRoomWallPlanColor\(room, strip\.faceId, isPro, palette\)\}/, "A panel strip takes its wall's plan colour.");
assert.match(read("lib/useDesignPageSelectionInspectorModel.ts"), /metrics: getRoomClearInsideMetrics\(selectedPlanRoom,/);

console.log("Room measured to the panel face checks passed.");
