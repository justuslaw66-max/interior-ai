import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SurfaceMaterialBomSection } from "../components/SurfaceMaterialBomSection";
import { ShoppingSurfacesSection } from "../components/editor/shop/ShoppingSurfacesSection";
import {
  buildSurfaceRoomSummaries,
  buildSurfaceSummaryRows,
} from "../components/editor/design-controls-plan/surfaceSummaryRows";
import type { PersistedPlanOpening, RoomSnapshot } from "../lib/room-types";
import { buildSurfaceMaterialCsvRows } from "../lib/share-shopping-csv";
import { shoppingSurfacesOf } from "../lib/shopping-surfaces";
import { buildRoomSurfaceAreaRows } from "../lib/surface-material-areas";
import { buildRoomSurfaceMaterialBomRows } from "../lib/surface-material-bom";
import { formatSurfaceMaterialBomOrder } from "../lib/surface-material-bom-result";
import { getRuntimeSurfaceMaterialById } from "../lib/surface-material-runtime";
import {
  countSurfaceSheets,
  countWallPanelSheets,
  formatSheetCount,
  formatSheetSize,
  getSurfaceSheetSize,
  type WallFinishPiece,
} from "../lib/surface-material-sheets";
import { buildRoomWallFinishQuantities } from "../lib/surface-material-wall-panels";
import { buildHousePlan2D } from "../lib/design-page-house-plan";
import { mapPlanOpeningsToRoomRenderer } from "../lib/design-page-plan-overlays";
import {
  buildWallSurfacePanels,
  getWallOpenings,
  getWallSegments,
  getWallSurfaceFaceId,
  joinedLegacyWallSurfacePart,
} from "../components/editor/renderers/house-plan-3d/geometry";
import { buildOpeningWallSurfacePanels } from "../components/editor/renderers/house-plan-3d/openingWallSurfacePanels";
import { getWallSurfacePartStartAlongFace } from "../components/editor/renderers/house-plan-3d/wallSurfaceLayout";

// Wall panels are ordered in whole sheets (J, 25 Oct 2026: "Whole sheets"), the cut pieces of one finish in one room
// sharing sheets (26 Oct: "Share offcuts"). Tiles and floors keep m² plus 10%.
const SHEET = { widthMm: 1220, heightMm: 2440 };
const NORDIC_ACACIA = "greenlam-woodgrains-5394";
const SILVER_OAK = "goodrich-geff-novaclick-gnv-002-silver-oak";
const ANIMA_WALL_TILE = "gardenia-wall-tile-anima-beige-0006044-120x120-196214-0";
const wall = (faceKey: string, start: number, end: number, bottom: number, top: number): WallFinishPiece =>
  ({ faceKey, start, end, bottom, top });

// The sheet: a wall panel's tile size, width across the wall and height up it. Tiles and floors have none.
assert.deepEqual(getSurfaceSheetSize(getRuntimeSurfaceMaterialById(NORDIC_ACACIA)), SHEET);
assert.equal(getSurfaceSheetSize(getRuntimeSurfaceMaterialById(ANIMA_WALL_TILE)), null, "a wall tile is ordered by area");
assert.equal(getSurfaceSheetSize(getRuntimeSurfaceMaterialById(SILVER_OAK)), null, "so is a floor");
assert.equal(getSurfaceSheetSize(null), null);

// The examples J chose from. A 4.2 x 2.6 m wall: 3 whole sheets; the 0.54 m column and the four 160 mm top strips are
// cut from 2 more (the column's sheet also gives the short strip; the three full-width strips share one).
assert.equal(countWallPanelSheets([wall("a", 0, 4.2, 0, 2.6)], SHEET), 5);
// The same wall with a 1.2 x 1.2 m window at 0.9 m: the two sheets the window crosses are notched, so still whole.
assert.equal(countWallPanelSheets([
  wall("a", 0, 1.5, 0, 2.6), wall("a", 2.7, 4.2, 0, 2.6), wall("a", 1.5, 2.7, 2.1, 2.6), wall("a", 1.5, 2.7, 0, 0.9),
], SHEET), 5);
// A 3.0 x 2.6 m wall with a 0.9 x 2.1 m door 0.3 m from the corner: 2 whole (one notched), 2 for the cut pieces.
assert.equal(countWallPanelSheets([
  wall("a", 0, 0.3, 0, 2.6), wall("a", 1.2, 3, 0, 2.6), wall("a", 0.3, 1.2, 2.1, 2.6),
], SHEET), 4);
// Exactly a sheet's size takes whole sheets, and a millimetre of rounding makes no sliver.
assert.equal(countWallPanelSheets([wall("a", 0, 2.44, 0, 2.44)], SHEET), 2);
assert.equal(countWallPanelSheets([wall("a", 0, 2.4400004, 0, 2.4399996)], SHEET), 2);
// Faces are laid separately, and their cut pieces share sheets: two 0.5 m wide walls take one sheet between them.
assert.equal(countWallPanelSheets([wall("a", 0, 0.5, 0, 2.44), wall("b", 0, 0.5, 0, 2.44)], SHEET), 1);
// A quarter turn lays the sheets on their side, 2440 across and 1220 up. Two 1.3 m walls: upright, a whole sheet each
// and an 80 mm strip each, from one more; on their side, four 1300 x 1220 pieces, one to a sheet.
const twoNarrowWalls = [wall("a", 0, 1.3, 0, 2.44), wall("b", 0, 1.3, 0, 2.44)];
assert.equal(countWallPanelSheets(twoNarrowWalls, SHEET), 3);
assert.equal(countWallPanelSheets(twoNarrowWalls, SHEET, 90), 4);
assert.equal(countWallPanelSheets(twoNarrowWalls, SHEET, 270), 4);
assert.equal(countWallPanelSheets(twoNarrowWalls, SHEET, 45), 3, "any other angle is counted upright");
// Without pieces the order area (with its 10%) is rounded up to whole sheets.
assert.equal(countSurfaceSheets({ pieces: null, orderAreaSqm: 3, rotationDeg: 0, sheet: SHEET }), 2);
assert.equal(countSurfaceSheets({ pieces: [], orderAreaSqm: 2.9768, rotationDeg: 0, sheet: SHEET }), 1);
assert.equal(countSurfaceSheets({ pieces: null, orderAreaSqm: 0, rotationDeg: 0, sheet: SHEET }), 0);
assert.equal(formatSheetCount(1), "1 sheet");
assert.equal(formatSheetCount(13), "13 sheets");
assert.equal(formatSheetSize(SHEET), "1220 × 2440 mm");

// The pieces are the finish as the 3D view draws it (house-plan-3d/wallSurfaceLayout.ts): along the drawn face, joined at
// the corners, from the face's start corner, and up from the floor. The areas stay on the wall line.
function room(surfaces: RoomSnapshot["surfaces"], roomType: RoomSnapshot["roomType"] = "living"): RoomSnapshot {
  return {
    id: "lam", name: "Living Room", roomType, geometry: { width: 4, depth: 3, height: 2.6 }, planPosition: { x: 0, z: 0 },
    surfaces, items: [], zones: [], savedViews: [],
  };
}
const door = (wallId: "north" | "south"): PersistedPlanOpening =>
  ({ id: `door-${wallId}`, roomId: "lam", wall: wallId, offsetMm: -1000, widthMm: 900, heightMm: 2100, bottomMm: 0, kind: "door" });
const panelled = room({ walls: { default: { materialId: NORDIC_ACACIA } } });
const rounded = (pieces: readonly WallFinishPiece[] | null) =>
  pieces?.map((piece) => [piece.faceKey, ...[piece.start, piece.end, piece.bottom, piece.top].map((value) => Math.round(value * 1000) || 0)]);
const [northDoor] = buildRoomWallFinishQuantities([panelled], [door("north")]);
assert.deepEqual(rounded(northDoor.remainingWallPieces), [
  ["lam-north", 0, 490, 0, 2600], ["lam-north", 1390, 3870, 0, 2600], ["lam-north", 490, 1390, 2100, 2600],
  ["lam-east", 0, 2880, 0, 2600], ["lam-south", 0, 3870, 0, 2600], ["lam-west", 0, 2860, 0, 2600],
], "120 mm walls: each drawn face starts 60 mm in from the wall line's corner, so a 4 m wall's face is 3.88 m; at each " +
  "inside corner the face whose key sorts later stops at the other's 10 mm panel (29 Oct 2026), so north and south lose " +
  "10 mm at their east ends and west 10 mm at each end");
const [southDoor] = buildRoomWallFinishQuantities([panelled], [door("south")]);
assert.deepEqual(rounded(southDoor.remainingWallPieces)?.filter(([faceKey]) => faceKey === "lam-south"), [
  ["lam-south", 3380, 3870, 0, 2600], ["lam-south", 0, 2480, 0, 2600], ["lam-south", 2480, 3380, 2100, 2600],
], "the same door on the south wall is near its far end: that face runs the other way (side -1), as it is drawn, from its " +
  "east end, 10 mm in from the corner at the east wall's panel");
// Every piece is where the 3D view draws that part (HousePlanRenderer3D.tsx, wallAndOpeningMeshes.tsx): the wall's height
// under its face id, the start its mesh is given and the joined length it paints, on both sides, beside, above and below a
// door and a window, in a rectangle and in a drawn polygon with a raised wall.
function drawnPiecesOf(snapshot: RoomSnapshot, openings: PersistedPlanOpening[]): WallFinishPiece[] {
  const plan = buildHousePlan2D([snapshot], 4, 3).rooms;
  const [planRoom] = plan;
  const wallThickness = planRoom.wallThickness ?? 0.025;
  return getWallSegments(planRoom).flatMap((segment) => {
    const height = planRoom.wallHeights?.[getWallSurfaceFaceId(planRoom, segment)] ?? planRoom.height ?? 2.6;
    const wallOpenings = getWallOpenings(planRoom, segment, plan, mapPlanOpeningsToRoomRenderer(openings, plan));
    return [
      ...buildWallSurfacePanels(planRoom, segment, wallOpenings),
      ...buildOpeningWallSurfacePanels(planRoom, plan, segment, wallOpenings, height).filter((panel) => panel.role === "interior"),
    ].map((panel) => {
      const joins = { squareStart: false, squareEnd: false };
      const start = getWallSurfacePartStartAlongFace({ room: planRoom, segment, part: panel.part, side: panel.side, wallThickness, ...joins });
      const length = joinedLegacyWallSurfacePart(planRoom, segment, panel.part, panel.side, wallThickness, joins).length;
      const partHeight = panel.part.height ?? height;
      const bottom = (panel.part.centerY ?? partHeight / 2) - partHeight / 2;
      return wall(segment.key, start, start + length, bottom, bottom + partHeight);
    });
  });
}
const window: PersistedPlanOpening = { id: "w", roomId: "lam", wall: "west", offsetMm: 300, widthMm: 1200, heightMm: 1200, bottomMm: 900, kind: "window" };
const openings = [door("north"), door("south"), window];
const byPosition = (pieces: readonly WallFinishPiece[] | null) => (rounded(pieces) ?? []).map(String).sort();
const [allOpenings] = buildRoomWallFinishQuantities([panelled], openings);
const drawnRectangle = drawnPiecesOf(panelled, openings);
assert.equal(drawnRectangle.length, 11, "three side parts and a lintel at each door, three side parts, a lintel and a sill at the window, two plain walls");
assert.deepEqual(byPosition(allOpenings.remainingWallPieces), byPosition(drawnRectangle));
const lShaped: RoomSnapshot = {
  ...panelled,
  geometry: { width: 4, depth: 4, height: 2.6, wallThickness: 0.2, wallHeights: { "wall-0": 3 } },
  planShape: "custom_polygon",
  planPolygon: [{ x: -2, z: -2 }, { x: 2, z: -2 }, { x: 2, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 2 }, { x: -2, z: 2 }],
};
const drawnL = drawnPiecesOf(lShaped, []);
const [lQuantities] = buildRoomWallFinishQuantities([lShaped]);
assert.deepEqual(byPosition(lQuantities.remainingWallPieces), byPosition(drawnL));
assert.deepEqual(
  rounded(lQuantities.remainingWallPieces)?.map(([, start, end, , top]) => [start, end, top]),
  [[0, 3800, 3000], [0, 1790, 2600], [0, 1790, 2600], [0, 2010, 2600], [0, 2010, 2600], [0, 3780, 2600]],
  "the first wall is raised to 3 m, saved under its face id; with 200 mm walls a face loses 100 mm at an outside corner " +
    "and gains 100 mm at the inside one, and where it meets a face whose key sorts earlier it stops at, or wraps, that " +
    "face's 10 mm panel (29 Oct 2026; without panels 3800, 1800, 1800, 2000, 2000, 3800)"
);
const pieceArea = (pieces: readonly WallFinishPiece[] | null) =>
  Math.round((pieces ?? []).reduce((sum, piece) => sum + (piece.end - piece.start) * (piece.top - piece.bottom), 0) * 100) / 100;
const [plainRoom] = buildRoomWallFinishQuantities([panelled]);
assert.deepEqual([Math.round(plainRoom.remainingWallAreaSqm * 100) / 100, pieceArea(plainRoom.remainingWallPieces)], [36.4, 35.05],
  "the area is measured on the wall line; the drawn faces are 120 mm shorter at the room's corners, and 10 mm more where a " +
    "panel stops at its neighbour's (35.15 m² without)");

// The bill of materials: whole sheets for the panels, with the area alongside; tiles as before.
const [bomRow] = buildRoomSurfaceMaterialBomRows([panelled]);
assert.deepEqual(
  [bomRow.surface, bomRow.surfaceAreaSqm, bomRow.orderAreaSqm, bomRow.sheetSizeMm, bomRow.orderSheets],
  ["walls", 36.4, 40.04, SHEET, 13],
  "a 4 x 3 x 2.6 m room: 10 whole sheets and 3 for the cut pieces (by area it would be 14)"
);
assert.equal(buildRoomSurfaceMaterialBomRows([panelled], [door("north")])[0].orderSheets, 13, "the door's sheet is notched");
const sheetSquare = { ...room({ walls: { default: { materialId: NORDIC_ACACIA } } }), geometry: { width: 2.56, depth: 2.56, height: 2.44 } };
assert.equal(buildRoomSurfaceMaterialBomRows([sheetSquare])[0].orderSheets, 8, "drawn faces of exactly 2440 x 2440 mm: two whole sheets each");
// A 4.25'x10' sheet (27 Oct 2026) stands floor to ceiling, so on 2.6 m walls every sheet is trimmed and none is whole: one
// per position, 1300 mm wide, except the two 280 mm end columns, which share one.
const [tenFootRow] = buildRoomSurfaceMaterialBomRows([room({ walls: { default: { materialId: "greenlam-solids-112" } } })]);
assert.deepEqual([tenFootRow.sheetSizeMm, tenFootRow.orderSheets], [{ widthMm: 1300, heightMm: 3050 }, 11]);
const tiled = buildRoomSurfaceMaterialBomRows([room({ walls: { default: { materialId: ANIMA_WALL_TILE } } })])[0];
assert.deepEqual([tiled.orderAreaSqm, tiled.sheetSizeMm, tiled.orderSheets], [40.04, null, null], "tiles stay by area");

// Each finish counts its own pieces: a face and a panel with their own finish come out of the room's default, and
// together the finishes' pieces are the room's, each once.
const northPanelId = "wall-panel:v2:1:lam:north:segment-start:opening-door-north-start:interior";
const mixed = room({ walls: {
  default: { materialId: NORDIC_ACACIA },
  faces: { east: { materialId: NORDIC_ACACIA } },
  panels: { [northPanelId]: { materialId: ANIMA_WALL_TILE } },
} });
const [mixedQuantities] = buildRoomWallFinishQuantities([mixed], [door("north")]);
assert.deepEqual(rounded(mixedQuantities.facePiecesById.get("east") ?? null), [["lam-east", 0, 2880, 0, 2600]]);
assert.deepEqual(rounded(mixedQuantities.assignedPanels[0]?.pieces ?? null), [["lam-north", 0, 490, 0, 2600]]);
assert.deepEqual(
  rounded(mixedQuantities.remainingWallPieces)?.map(([faceKey, start]) => `${faceKey}@${start}`),
  ["lam-north@1390", "lam-north@490", "lam-south@0", "lam-west@0"]
);
assert.deepEqual(
  byPosition([
    ...(mixedQuantities.remainingWallPieces ?? []),
    ...[...mixedQuantities.facePiecesById.values()].flatMap((pieces) => pieces ?? []),
    ...mixedQuantities.assignedPanels.flatMap((panel) => panel.pieces),
  ]),
  byPosition(northDoor.remainingWallPieces)
);
assert.deepEqual(
  buildRoomSurfaceAreaRows([mixed], [door("north")]).map((row) => [row.surfaceLabel, row.wallPieces?.length ?? null]),
  [["Remaining walls", 4], ["East wall", 1], ["North wall panel", 1]],
  "each wall row carries its pieces"
);
assert.deepEqual(
  buildRoomSurfaceMaterialBomRows([mixed], [door("north")]).map((row) => [row.surfaceLabel, row.orderSheets]),
  [["Remaining walls", 9], ["East wall", 4], ["North wall panel", null]]
);
// A finished face the plan doesn't draw has no pieces, and the remaining walls, whose area it takes, have none either.
const [undrawnFace] = buildRoomWallFinishQuantities([room({ walls: {
  default: { materialId: NORDIC_ACACIA }, faces: { "segment-9": { materialId: NORDIC_ACACIA } },
} })]);
assert.deepEqual([undrawnFace.facePiecesById.get("segment-9"), undrawnFace.remainingWallPieces], [null, null]);

// The share export's CSV, PDF and page.
// A laminate's sheets go on boards (28 Oct 2026): the order names them, and the CSV lists them on a line of their own.
const [csvRow, csvBoardRow] = buildSurfaceMaterialCsvRows([panelled]);
assert.deepEqual([csvRow.variantLabel, csvRow.quantity], ["All walls · 13 sheets of 1220 × 2440 mm on 13 MDF boards, 9 mm, glued", 13]);
assert.match(csvRow.reviewNote ?? "", /^Surface All walls; measured area 36\.40 m2; suggested order 13 sheets of 1220 × 2440 mm on 13 MDF boards, 9 mm, glued\. Pattern /);
assert.deepEqual([csvBoardRow.category, csvBoardRow.itemTitle, csvBoardRow.quantity], ["Wall Panel Board", "MDF board, 9 mm", 13]);
const [tileCsvRow] = buildSurfaceMaterialCsvRows([room({ walls: { default: { materialId: ANIMA_WALL_TILE } } })]);
assert.equal(tileCsvRow.variantLabel, "All walls · 40.04 m2 incl. 10% waste", "tiles keep their wording");
assert.match(tileCsvRow.reviewNote ?? "", /suggested order 40\.04 m2 with 10% waste\./);
assert.equal(formatSurfaceMaterialBomOrder(bomRow, String), "13 sheets of 1220 × 2440 mm on 13 MDF boards, 9 mm, glued");
assert.equal(formatSurfaceMaterialBomOrder(tiled, (area) => `${area} m2`), "40.04 m2 incl. 10% waste");
const pdfRoute = readFileSync(path.join(process.cwd(), "app/share/[shareToken]/export/pdf/route.ts"), "utf8");
assert.match(pdfRoute, /Order \$\{formatSurfaceMaterialBomOrder\(row, \(area\) => formatMeasurement\(area, "m2"\)\)\}/);
const bomHtml = renderToStaticMarkup(createElement(SurfaceMaterialBomSection, { rows: [bomRow, tiled], warnings: [] }));
assert.match(bomHtml, /<td class="p-2 text-right"><div>13 sheets<\/div><div class="text-xs text-gray-500">1220 × 2440 mm<span data-testid="surface-bom-backing" class="block">on 13 MDF boards, 9 mm, glued<\/span><\/div><\/td>/);
assert.match(bomHtml, /<td class="p-2 text-right"><div>40 m2<\/div><div class="text-xs text-gray-500">incl\. 10% waste<\/div><\/td>/);
assert.match(bomHtml, />Order<\/th>/);

// The editor: the Shopping list adds each finish's sheets, and the surface summary names them.
const [shopping] = shoppingSurfacesOf([panelled]);
assert.deepEqual(shopping.sheetOrder, {
  sheet: SHEET, sheets: 13, surfaceAreaSqm: 36.4,
  backing: [{ board: "mdf", boardThicknessMm: 9, fixing: "glued", boards: 13, boardSizeMm: SHEET, battenMetres: null }],
});
const [twoRooms] = shoppingSurfacesOf([panelled, { ...panelled, id: "lam-2", name: "Study" }]);
assert.deepEqual([twoRooms.where, twoRooms.sheetOrder?.sheets], ["Walls in the Living Room and Study", 26], "rooms don't share offcuts");
assert.equal(shoppingSurfacesOf([room({ floorMaterialId: SILVER_OAK })])[0].sheetOrder, null);
// Without its swatch, so the row renders without Next's image component.
const shoppingHtml = renderToStaticMarkup(createElement(ShoppingSurfacesSection, { surfaces: [{ ...shopping, swatchUrl: null }] }));
assert.match(shoppingHtml, /data-testid="shopping-surface-order"[^>]*>Order 13 sheets of 1220 × 2440 mm, for 36\.4 m²</);
assert.match(shoppingHtml, /data-testid="shopping-surface-backing"[^>]*>On 13 MDF boards, 9 mm, glued</);
const summaryRows = buildSurfaceSummaryRows(buildSurfaceRoomSummaries([mixed], [door("north")]), () => null);
assert.deepEqual(
  summaryRows.map((row) => [row.surfaceLabel, row.sheetsLabel]),
  [["Floor", null], ["Ceiling", null], ["Remaining walls", "9 sheets on MDF, 9 mm"], ["East wall", "4 sheets on MDF, 9 mm"], ["North wall panel", null]],
  "the same counts as the bill of materials"
);
assert.match(
  readFileSync(path.join(process.cwd(), "components/editor/DesignControlsPlanPanel.tsx"), "utf8"),
  /\{row\.materialName\} · \{formatDisplayArea\(row\.areaSqm, measurementUnit\)\}\{row\.sheetsLabel \? ` · \$\{row\.sheetsLabel\}` : null\}/
);

console.log("Surface material sheet checks passed.");
