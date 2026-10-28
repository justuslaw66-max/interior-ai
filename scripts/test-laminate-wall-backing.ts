import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { WallPanelBackingControls } from "../components/editor/design-page/WallPanelBackingControls";
import { buildWallBackingControls, buildWallJointControls } from "../lib/design-page-wall-finish-controls";
import {
  countWallPanelBattenMetres,
  DEFAULT_WALL_PANEL_BACKING,
  formatWallPanelBackingOrder,
  formatWallPanelBoard,
  formatWallPanelBoardMaterial,
  getDrawnWallJointMm,
  getWallFinishDepthMeters,
  getWallPanelBacking,
  getWallPanelBuildUpMm,
  normalizeWallPanelBacking,
} from "../lib/laminate-wall-backing";
import type { RoomSnapshot } from "../lib/room-types";
import { buildSurfaceMaterialCsvRows } from "../lib/share-shopping-csv";
import { shoppingSurfacesOf } from "../lib/shopping-surfaces";
import { buildRoomSurfaceMaterialBomRows } from "../lib/surface-material-bom";
import { getRuntimeSurfaceMaterialById } from "../lib/surface-material-runtime";
import { createSurfaceSettingsPatch, getWallFaceSurfaceSettings, getWallPanelSurfaceSettings } from "../lib/surface-settings";

// A laminate wall finish is always laminate on a board (J, 28 Oct 2026: "do not allow it to go directly on a raw wall").
// Greenlam's pasting manual bonds its laminates to particle board, MDF or HDF, or plywood; J chose MDF 9 mm, glued, by default,
// 6/9/12/18 mm boards, battens 25 mm deep and 600 mm apart, one board per sheet, and joints of at least 3 mm.
const NORDIC_ACACIA = "greenlam-woodgrains-5394";
const ANIMA_WALL_TILE = "gardenia-wall-tile-anima-beige-0006044-120x120-196214-0";
const SHEET = { widthMm: 1220, heightMm: 2440 };
const same = (value?: number | null) => value ?? 0;
const scale = (value?: number | null) => value ?? 1;

// The backing: never none, and anything unknown is the default.
assert.deepEqual(DEFAULT_WALL_PANEL_BACKING, { board: "mdf", boardThicknessMm: 9, fixing: "glued" });
assert.deepEqual(normalizeWallPanelBacking(undefined), DEFAULT_WALL_PANEL_BACKING);
assert.deepEqual(normalizeWallPanelBacking({ board: "plywood", boardThicknessMm: 12, fixing: "battens" }), {
  board: "plywood", boardThicknessMm: 12, fixing: "battens",
});
assert.deepEqual(
  normalizeWallPanelBacking({ board: "plaster" as never, boardThicknessMm: 7, fixing: "nailed" as never }),
  DEFAULT_WALL_PANEL_BACKING,
  "no plaster, and only the offered thicknesses"
);
assert.deepEqual(getWallPanelBacking(null), DEFAULT_WALL_PANEL_BACKING);

// How far the panel stands off the wall: laminate, board, and battens when fixed on them.
assert.equal(getWallPanelBuildUpMm(1, DEFAULT_WALL_PANEL_BACKING), 10);
assert.equal(getWallPanelBuildUpMm(0.7, { board: "hdf", boardThicknessMm: 6, fixing: "battens" }), 31.7);
const laminate = getRuntimeSurfaceMaterialById(NORDIC_ACACIA);
const tile = getRuntimeSurfaceMaterialById(ANIMA_WALL_TILE);
assert.ok(laminate?.suitability?.laminate_sheet && !tile?.suitability?.laminate_sheet);
assert.equal(getWallFinishDepthMeters(laminate, { panelBacking: DEFAULT_WALL_PANEL_BACKING }, 0.0015), 0.01, "the 3D view draws it 10 mm deep");
assert.equal(getWallFinishDepthMeters(laminate, { panelBacking: { board: "mdf", boardThicknessMm: 18, fixing: "battens" } }, 0.0015), 0.044);
assert.equal(getWallFinishDepthMeters(tile, { panelBacking: DEFAULT_WALL_PANEL_BACKING }, 0.0015), 0.0015, "a tile keeps its thin skin");

// Joints: a laminate's are at least Greenlam's 3 mm, as drawn and as offered; a tile's are as saved.
assert.equal(getDrawnWallJointMm(laminate, 1), 3);
assert.equal(getDrawnWallJointMm(laminate, 4), 4);
assert.equal(getDrawnWallJointMm(tile, 1), 1);

// The settings: the room's walls set the board, a face inherits it, a panel can have its own; a patch keeps a saved board.
const plywood = { board: "plywood", boardThicknessMm: 12, fixing: "battens" } as const;
const surfaces: RoomSnapshot["surfaces"] = {
  walls: {
    default: { materialId: NORDIC_ACACIA, panelBacking: plywood },
    faces: { north: { jointSizeMm: 4 } },
    panels: { "panel-1": { panelBacking: { board: "hdf", boardThicknessMm: 6 } } },
  },
};
assert.deepEqual(getWallFaceSurfaceSettings(surfaces, "north", same, scale).panelBacking, plywood, "a face inherits the board");
assert.deepEqual(
  getWallPanelSurfaceSettings(surfaces, "north", "panel-1", same, scale).panelBacking,
  { board: "hdf", boardThicknessMm: 6, fixing: "glued" },
  "a panel's own board; what it leaves out is the default, not half its face's"
);
assert.deepEqual(createSurfaceSettingsPatch(NORDIC_ACACIA, same, scale, { jointSizeMm: 5 }, { panelBacking: plywood }).panelBacking, plywood);
assert.equal("panelBacking" in createSurfaceSettingsPatch(ANIMA_WALL_TILE, same, scale, { jointSizeMm: 5 }, {}), false, "nothing added to a tile");

// The inspector: the board only for a laminate, and joints from 3 mm, a saved 1 mm reading as 3.
const laminateSettings = getWallFaceSurfaceSettings(surfaces, "east", same, scale);
assert.deepEqual(buildWallBackingControls({ material: laminate, settings: laminateSettings, disabled: false }), {
  backing: plywood, buildUpMm: 38, disabled: false,
});
assert.equal(buildWallBackingControls({ material: tile, settings: laminateSettings, disabled: false }), null);
const oneMillimetre = { ...laminateSettings, jointSizeMm: 1 };
const presets = { sizesMm: [1, 1.5, 2, 3, 4, 5], colours: ["#444442"] };
const joints = buildWallJointControls({ material: laminate, settings: oneMillimetre, disabled: false, paletteOpen: false, presets });
assert.deepEqual(joints.groutSizes.map((size) => [size.valueMm, size.selected]), [[3, true], [4, false], [5, false]]);
assert.equal(joints.label, "Joints");
assert.equal(buildWallJointControls({ material: tile, settings: oneMillimetre, disabled: false, paletteOpen: false, presets }).groutSizes[0].valueMm, 1);
const controlsHtml = renderToStaticMarkup(createElement(WallPanelBackingControls, {
  wallBacking: { backing: plywood, buildUpMm: 38, disabled: false },
  onChange: () => {},
}));
for (const testId of ["wall-panel-board", "wall-panel-board-thickness-6", "wall-panel-board-thickness-18", "wall-panel-fixing-glued", "wall-panel-fixing-battens"]) {
  assert.match(controlsHtml, new RegExp(`data-testid="${testId}"`), testId);
}
assert.match(controlsHtml, /<option value="plywood" selected="">Plywood<\/option>/);
assert.deepEqual(
  [...controlsHtml.matchAll(/<option value="([a-z_]+)"/g)].map((match) => match[1]),
  ["mdf", "hdf", "particle_board", "plywood"],
  "Greenlam's boards, and no bare wall to choose"
);
assert.match(controlsHtml, /Stands 38 mm off the wall, on 25 mm battens 600 mm apart\./);

// Battens: upright, 600 mm apart, one at each end of a piece.
const piece = (start: number, end: number, top = 2.6) => ({ faceKey: "a", start, end, bottom: 0, top });
assert.equal(countWallPanelBattenMetres([piece(0, 1.2)]), 8, "three battens of 2.6 m");
assert.equal(countWallPanelBattenMetres([piece(0, 1.3)]), 11, "four");
assert.equal(countWallPanelBattenMetres([piece(0, 0.5, 0.5)]), 1, "two short ones");

// The wording: a board on a line of its own, mid-sentence, and counted.
const particle = { board: "particle_board", boardThicknessMm: 9, fixing: "glued" } as const;
assert.deepEqual([formatWallPanelBoard(DEFAULT_WALL_PANEL_BACKING), formatWallPanelBoard(particle), formatWallPanelBoard(plywood)], [
  "MDF board, 9 mm", "Particle board, 9 mm", "Plywood board, 12 mm",
]);
assert.deepEqual([formatWallPanelBoardMaterial(DEFAULT_WALL_PANEL_BACKING), formatWallPanelBoardMaterial(plywood)], ["MDF, 9 mm", "plywood, 12 mm"]);
const order = (boards: number) => ({ ...particle, boards, boardSizeMm: SHEET, battenMetres: null });
assert.deepEqual([formatWallPanelBackingOrder(order(1)), formatWallPanelBackingOrder(order(2))], [
  "on 1 particle board, 9 mm, glued", "on 2 particle boards, 9 mm, glued",
]);

// Quantities: one board per sheet, the sheet's size, in the bill of materials, the CSV and the Shopping list.
function room(walls: NonNullable<RoomSnapshot["surfaces"]>["walls"], id = "lam", name = "Living Room"): RoomSnapshot {
  return {
    id, name, roomType: "living", geometry: { width: 4, depth: 3, height: 2.6 }, planPosition: { x: 0, z: 0 },
    surfaces: { walls }, items: [], zones: [], savedViews: [],
  };
}
const glued = room({ default: { materialId: NORDIC_ACACIA } });
const [gluedRow] = buildRoomSurfaceMaterialBomRows([glued]);
assert.deepEqual(gluedRow.backing, { board: "mdf", boardThicknessMm: 9, fixing: "glued", boards: 13, boardSizeMm: SHEET, battenMetres: null });
assert.equal(gluedRow.jointSizeMm, 3, "the BOM gives the joint as drawn");
const onBattens = room({ default: { materialId: NORDIC_ACACIA, panelBacking: plywood } });
const [battenRow] = buildRoomSurfaceMaterialBomRows([onBattens]);
// The drawn faces are 3.88 and 2.88 m: 8 and 6 battens of 2.6 m each, 28 in all.
assert.deepEqual([battenRow.backing?.boards, battenRow.backing?.battenMetres], [13, 73]);
assert.equal(formatWallPanelBackingOrder(battenRow.backing!), "on 13 plywood boards, 12 mm, on 73 m of 25 mm battens");
const csv = buildSurfaceMaterialCsvRows([onBattens]);
assert.deepEqual(
  csv.map((row) => [row.category, row.itemTitle, row.quantity]),
  [["Wall Surface Material", "Greenlam Nordic Acacia 5394", 13], ["Wall Panel Board", "Plywood board, 12 mm", 13], ["Wall Panel Battens", "Timber battens, 25 mm", 73]]
);
assert.equal(buildRoomSurfaceMaterialBomRows([room({ default: { materialId: ANIMA_WALL_TILE } })])[0].backing, null, "tiles have no board");
const [shopping] = shoppingSurfacesOf([glued, { ...onBattens, id: "lam-2", name: "Study" }]);
assert.deepEqual(
  shopping.sheetOrder?.backing.map(formatWallPanelBackingOrder),
  ["on 13 MDF boards, 9 mm, glued", "on 13 plywood boards, 12 mm, on 73 m of 25 mm battens"],
  "one line per kind of board"
);

console.log("Laminate wall backing checks passed.");
