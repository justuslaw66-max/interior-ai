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
  getInsetPolygonFaces,
  insetPolygonEdges,
  insetPolygonEdgesWithSteps,
  isInsetStep,
} from "../lib/room-finished-outline";
import { getRoomWallClearance } from "../lib/room-finished-faces";
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
  getDeepestWallFinish,
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
// A room from an imported plan (J: "Two: drawn rooms, then imported"): its finishes are saved under the plan's wall ids, and
// each edge of its outline names the wall it lies on (planEdgeWallIds), so edge N's depth is its wall's finish.
const importedOutline = [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }];
const imported = room({
  default: { paintColorHex: "#ffffff" },
  faces: { "plan-north": { materialId: NORDIC_ACACIA, panelBacking: DEEPEST }, "wall-1": { materialId: NORDIC_ACACIA } },
  panels: { "wall-panel:v2:1:lam:wall-2:segment-start:segment-end:interior": { materialId: NORDIC_ACACIA } },
}, {
  floorElevationMm: 0, planShape: "custom_polygon", planPolygon: importedOutline,
  planEdgeWallIds: ["plan-north", "plan-east", "plan-south", "plan-west"],
});
assert.deepEqual(getRoomWallFinishDepths(imported), { "wall-0": 0.044 },
  "edge 0 takes its wall's laminate; neither a drawn face's key (wall-1) nor a panel counts: the imported 3D view draws neither");
assert.deepEqual(getRoomWallFinishDepths({ ...imported, planEdgeWallIds: undefined }), {},
  "an imported room saved before its edges were named keeps the bare wall");
assert.deepEqual(getRoomWallFinishDepths({ ...imported, planEdgeWallIds: ["plan-north", "plan-east"] }), {},
  "and so does one whose outline no longer matches them");
assert.deepEqual(getRoomWallFinishDepths({ ...imported, planEdgeWallIds: ["plan-west", "plan-north", "plan-east", "plan-south"] }),
  { "wall-1": 0.044 }, "kept per surfaces and edges: a plan edit can move the room's edges onto other walls");
const importedPlanRoom = buildHousePlan2D([imported], 4, 3).rooms[0];
assert.deepEqual(getRoomWallFinishDepths(importedPlanRoom), { "wall-0": 0.044 }, "the plan room carries the edges (edgeWallIds)");
assert.deepEqual(getRoomClearInsideMetrics(importedPlanRoom, (mm) => `${Math.round(mm)}`), ["Clear inside 3880 × 2836"]);
assert.equal(getDeepestWallFinish(importedPlanRoom, "wall-0")?.materialId, NORDIC_ACACIA);
assert.equal(getDeepestWallFinish(importedPlanRoom, "wall-1"), null);
near(clampToRoomInsideFinishes(0, -9, 1, 0.6, 4, 3, getFurnitureWallInset(0.12), 0, "custom_polygon", importedOutline, undefined,
  getRoomWallFinishDepths(imported))[1], -1.5 + getFurnitureWallInset(0.12) + 0.044 + 0.3, "furniture stops at the imported wall's panel");

// The outline inside the panels: each edge moves in by its own depth.
assert.deepEqual(
  insetPolygonEdges([{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }], [0.01, 0.044, 0, 0])
    .map(({ x, z }) => [Math.round(x * 1000), Math.round(z * 1000)]),
  [[-2000, -1490], [1956, -1490], [1956, 1500], [-2000, 1500]]
);
// Two near-parallel edges moved in by different depths meet in a step, not metres away: a north wall drawn as two edges with
// a 0.1 mm kink and a 44 mm laminate on its west half. The one-point outline (the clamp's and the cabinets') keeps the
// step's deeper end at that corner.
const kinked = [{ x: -2, z: -1.5 }, { x: 0, z: -1.5001 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }];
const kinkInsets = [0.104, 0.06, 0.06, 0.06, 0.06];
const mm = (point: { x: number; z: number }) => [Math.round(point.x * 1000) || 0, Math.round(point.z * 1000) || 0];
assert.deepEqual(insetPolygonEdgesWithSteps(kinked, kinkInsets).map((corner) => isInsetStep(corner) ? corner.map(mm) : mm(corner)), [
  [-1940, -1396], [[0, -1396], [0, -1440]], [1940, -1440], [1940, 1440], [-1940, 1440],
]);
assert.deepEqual(insetPolygonEdges(kinked, kinkInsets).map(mm), [[-1940, -1396], [0, -1396], [1940, -1440], [1940, 1440], [-1940, 1440]]);
// An outline closed with its first point repeated (as a drawn arc room is) has an edge of no length: its corner still moves in.
// Two edges in line moved in by different depths step at their corner too (a south wall drawn as two pieces, 200 and 100
// mm walls): each piece's face stands at its own depth up to the corner, where the one-point outline leans the shallower.
const splitSouth = [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 2 }, { x: 0, z: 2 }, { x: -2, z: 2 }];
const splitInsets = [0.06, 0.06, 0.1, 0.05, 0.06];
assert.deepEqual(getInsetPolygonFaces(splitSouth, splitInsets).slice(2, 4).map(({ start, end }) => [mm(start), mm(end)]),
  [[[1940, 1900], [0, 1900]], [[0, 1950], [-1940, 1950]]]);
assert.deepEqual(insetPolygonEdges(splitSouth, splitInsets).map(mm)[3], [0, 1900], "the one-point outline keeps the deeper end");
// The 2D strips draw each piece at its own depth: a 44 mm laminate on one piece and a 10 mm one on the other.
const splitStrips = getRoomPanelStrips2D({
  id: "split", name: "Split", roomType: "living", shape: "custom_polygon", polygon: splitSouth, w: 4, d: 4, x: 0, z: 0, wallThickness: 0.12,
  surfaces: { walls: { default: { paintColorHex: "#ffffff" }, faces: { "wall-2": { materialId: NORDIC_ACACIA, panelBacking: DEEPEST }, "wall-3": { materialId: NORDIC_ACACIA } } } },
}).strips;
assert.deepEqual(splitStrips.map((strip) => [strip.faceId, strip.faceLine.map(([x, , z]) => mm({ x, z }))]), [
  ["wall-2", [[1940, 1896], [0, 1896]]], ["wall-3", [[0, 1930], [-1940, 1930]]],
]);
// Every other corner is where the two moved lines cross, as before: a triangle's sharp corner beside a 44 mm panel ends the
// panel's 2D strip at the other wall's finished face (it doesn't step through that wall), and the clamp's corner stays inside.
for (const [degrees, faceEnd, clampCorner] of [[45, 1.811, 1.956], [40, 1.783, 1.948], [30, 1.7, 1.924], [20, 1.539, 1.879]]) {
  const height = 4 * Math.tan((degrees * Math.PI) / 180);
  const triangle = [{ x: -2, z: -1 }, { x: 2, z: -1 }, { x: -2, z: -1 + height }];
  const triangleWalls = { default: { paintColorHex: "#ffffff" }, faces: { "wall-0": { materialId: NORDIC_ACACIA, panelBacking: DEEPEST } } };
  const [triangleStrip] = getRoomPanelStrips2D({
    id: "tri", name: "Tri", roomType: "living", shape: "custom_polygon", polygon: triangle, w: 4, d: height, x: 0, z: 0, wallThickness: 0.12,
    surfaces: { walls: triangleWalls },
  }).strips;
  assert.equal(Math.round(triangleStrip.faceLine[1][0] * 1000), Math.round(faceEnd * 1000), `${degrees}°`);
  const clampOutline = getRoomOutlineInsideFinishes({ shape: "custom_polygon", polygon: triangle, w: 4, d: height }, { "wall-0": 0.044 });
  assert.equal(Math.round((clampOutline.polygon?.[1].x ?? 0) * 1000), Math.round(clampCorner * 1000), `${degrees}° clamp`);
}
// A face that would turn back on itself is passed over, and its neighbours meet past it: a 10 mm chamfer at a corner, and a
// 5 mm jog in a wall beside a 44 mm panel (the two pieces' faces then step at the jog). An 8 cm jog keeps its own face.
const chamfered = [{ x: -2, z: -1.5 }, { x: 1.99, z: -1.5 }, { x: 2, z: -1.49 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }];
assert.deepEqual(insetPolygonEdges(chamfered, chamfered.map(() => 0.06)).map(mm).slice(1, 3), [[1940, -1440], [1940, -1440]]);
const jogged = (rise: number) => [
  { x: -2, z: -1.5 }, { x: 0, z: -1.5 }, { x: 0, z: -1.5 + rise }, { x: 2, z: -1.5 + rise }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 },
];
const jogInsets = [0.104, 0.06, 0.06, 0.06, 0.06, 0.06];
assert.deepEqual(insetPolygonEdgesWithSteps(jogged(0.005), jogInsets).slice(1, 3).map((corner) => isInsetStep(corner) ? corner.map(mm) : mm(corner)),
  [[[0, -1396], [0, -1435]], [[0, -1396], [0, -1435]]]);
assert.deepEqual(insetPolygonEdgesWithSteps(jogged(0.08), jogInsets).slice(1, 3).map((corner) => isInsetStep(corner) ? corner.map(mm) : mm(corner)),
  [[-60, -1396], [-60, -1360]]);
const closedTwice = [{ x: -2, z: -1.5 }, { x: 2, z: -1.5 }, { x: 2, z: 1.5 }, { x: -2, z: 1.5 }, { x: -2, z: -1.5 }];
assert.deepEqual(insetPolygonEdges(closedTwice, closedTwice.map(() => 0.06)).map(mm),
  [[-1940, -1440], [1940, -1440], [1940, 1440], [-1940, 1440], [-1940, -1440]]);
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
near(getRoomWallClearance(tiledWithPanel, { x: 1.3, z: 0 }, { w: 1, d: 0.5 }), 2 - 0.06 - 0.044 - 0.5 - 1.3,
  "a room snapshot's clearance: to the east panel's face, nearer than the north wall's");
// An L-shape's or drawn shape's checks measure to its own walls (lib/room-finished-faces.ts), each in front of its own panel:
// a console 2 cm off the built-in L's notch wall (wall-2, at z = 0.24 m) is against a wall, not 25 cm from the far one.
const lRoom = room(
  { default: { paintColorHex: "#ffffff" }, faces: { "wall-1": { materialId: NORDIC_ACACIA, panelBacking: DEEPEST }, "wall-2": { materialId: NORDIC_ACACIA } } },
  { planShape: "l_shape" }
);
const notchConsoleZ = (gap: number) => 0.24 - 0.06 - gap - consoleDepth / 2;
const lWallMessage = (lRoomWalls: RoomSnapshot, z: number) => evaluateConstraints({
  design: { items: [{ instanceId: "c", productId: CONSOLE, position: [1.1, 0, z], rotationY: Math.PI }] },
  movedItemId: "c",
  room: { width: 4, depth: 3, wallThickness: 0.12, wallFinishRoom: lRoomWalls },
}).find((result) => result.id === "wall-gap")?.message ?? "";
assert.match(lWallMessage(lRoom, notchConsoleZ(0.01 + 0.02)), /Placed nicely against wall \(2cm gap\)/, "2 cm off the notch wall's panel");
assert.match(lWallMessage(lRoom, notchConsoleZ(0.02)), /Too tight to wall \(1cm\)/, "2 cm off the bare notch wall is 1 cm off its panel");
assert.match(lWallMessage(room({ default: { paintColorHex: "#ffffff" } }, { planShape: "l_shape" }), notchConsoleZ(-0.15)),
  /Too tight to wall \(-15cm\)/, "15 cm into the notch's wall, which the bounding rectangle didn't see");
near(getRoomWallClearance(lRoom, { x: 1.1, z: notchConsoleZ(0.05) }, { w: 1.5, d: consoleDepth }), 0.04,
  "placement scoring's clearance: to the notch wall's panel, 10 mm in front of the wall");

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
