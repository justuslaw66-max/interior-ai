import type { WallPanelBacking } from "./room-types";
import type { SurfaceSheetSize, WallFinishPiece } from "./surface-material-sheets";

export type { WallPanelBacking };
export type WallPanelBoard = NonNullable<WallPanelBacking["board"]>;
export type WallPanelFixing = NonNullable<WallPanelBacking["fixing"]>;

/**
 * What a laminate sheet on a wall is bonded to (J, 28 Oct 2026: "do not allow it to go directly on a raw wall").
 *
 * Greenlam's Laminate Pasting Guideline Manual bonds thin HPL to a board: particle board, MDF or HDF, and plywood in some
 * regions (§4.2); plaster, gypsum board and concrete are "not recommended". So a laminate wall finish is always laminate on a
 * board, and an unset backing is the default one. J chose the default and the options (28 Oct):
 * - **Board:** MDF to start with, 9 mm; 6, 9, 12 or 18 mm.
 * - **Fixing:** glued flat to the wall by default, or on timber battens, 25 mm deep and 600 mm apart, for an uneven wall.
 * - **Size:** one board behind each sheet, the sheet's size, for the 4.25'x10' sheets too.
 * - **Joints:** at least 3 mm between bonded panels (Greenlam's manual, §5.1 step 11), and the edges at openings and wall ends
 *   edge-banded in the same laminate.
 * See docs/architecture/cabinet-laminates.md ("The board behind a laminate wall").
 */

export type NormalizedWallPanelBacking = {
  board: WallPanelBoard;
  boardThicknessMm: number;
  fixing: WallPanelFixing;
};

/** `label` heads the inspector's choice; `material` and `board` go mid-sentence ("on plywood", "13 particle boards"). */
export const WALL_PANEL_BOARD_OPTIONS: ReadonlyArray<{ id: WallPanelBoard; label: string; material: string; board: string }> = [
  { id: "mdf", label: "MDF", material: "MDF", board: "MDF board" },
  { id: "hdf", label: "HDF", material: "HDF", board: "HDF board" },
  { id: "particle_board", label: "Particle board", material: "particle board", board: "particle board" },
  { id: "plywood", label: "Plywood", material: "plywood", board: "plywood board" },
];
export const WALL_PANEL_BOARD_THICKNESSES_MM: readonly number[] = [6, 9, 12, 18];
export const WALL_PANEL_FIXING_OPTIONS: ReadonlyArray<{ id: WallPanelFixing; label: string }> = [
  { id: "glued", label: "Glued" },
  { id: "battens", label: "On battens" },
];

export const DEFAULT_WALL_PANEL_BACKING: NormalizedWallPanelBacking = {
  board: "mdf",
  boardThicknessMm: 9,
  fixing: "glued",
};

/** Timber battens behind a panel fixed on them: their depth off the wall and the spacing between their centres. */
export const WALL_PANEL_BATTEN_DEPTH_MM = 25;
export const WALL_PANEL_BATTEN_SPACING_MM = 600;

/**
 * A laminate sheet's thickness where the render data doesn't carry it (the 3D view and the inspector): Greenlam's sheets are
 * 1.0 mm (4'x8') and 0.7 mm (4.25'x10'), a difference under a millimetre in the panel's depth.
 */
export const LAMINATE_SHEET_THICKNESS_MM = 1;

/** Greenlam's least joint between bonded panels (Laminate Pasting Guideline Manual, §5.1 step 11). */
export const LAMINATE_WALL_PANEL_MIN_JOINT_MM = 3;

const BOARD_IDS = new Set<string>(WALL_PANEL_BOARD_OPTIONS.map((option) => option.id));
const FIXING_IDS = new Set<string>(WALL_PANEL_FIXING_OPTIONS.map((option) => option.id));

function isBoard(value: unknown): value is WallPanelBoard {
  return typeof value === "string" && BOARD_IDS.has(value);
}

function isFixing(value: unknown): value is WallPanelFixing {
  return typeof value === "string" && FIXING_IDS.has(value);
}

/** A saved backing, with the default for anything missing or unknown: never no board. */
export function normalizeWallPanelBacking(backing: WallPanelBacking | null | undefined): NormalizedWallPanelBacking {
  const thickness = backing?.boardThicknessMm;
  return {
    board: isBoard(backing?.board) ? backing.board : DEFAULT_WALL_PANEL_BACKING.board,
    boardThicknessMm:
      typeof thickness === "number" && WALL_PANEL_BOARD_THICKNESSES_MM.includes(thickness)
        ? thickness
        : DEFAULT_WALL_PANEL_BACKING.boardThicknessMm,
    fixing: isFixing(backing?.fixing) ? backing.fixing : DEFAULT_WALL_PANEL_BACKING.fixing,
  };
}

/** A finish's board: its own, or the default when it has none (a floor's settings, say). Never no board. */
export function getWallPanelBacking(settings: { panelBacking?: NormalizedWallPanelBacking } | null | undefined): NormalizedWallPanelBacking {
  return settings?.panelBacking ?? DEFAULT_WALL_PANEL_BACKING;
}

function boardOption(board: WallPanelBoard) {
  return WALL_PANEL_BOARD_OPTIONS.find((option) => option.id === board) ?? WALL_PANEL_BOARD_OPTIONS[0];
}

/** The board's material mid-sentence: "on MDF, 9 mm", "on plywood, 12 mm". */
export function formatWallPanelBoardMaterial(backing: NormalizedWallPanelBacking): string {
  return `${boardOption(backing.board).material}, ${backing.boardThicknessMm} mm`;
}

/** One board, as a line of its own: "MDF board, 9 mm", "Particle board, 9 mm", "Plywood board, 12 mm". */
export function formatWallPanelBoard(backing: NormalizedWallPanelBacking): string {
  const { board } = boardOption(backing.board);
  return `${board.charAt(0).toUpperCase()}${board.slice(1)}, ${backing.boardThicknessMm} mm`;
}

/** How far the finished panel stands off the wall: the laminate on its board, and the battens behind when fixed on them. */
export function getWallPanelBuildUpMm(laminateThicknessMm: number, backing: NormalizedWallPanelBacking): number {
  const battens = backing.fixing === "battens" ? WALL_PANEL_BATTEN_DEPTH_MM : 0;
  return laminateThicknessMm + backing.boardThicknessMm + battens;
}

/** A laminate panel's joint: at least Greenlam's 3 mm. */
export function getLaminateWallPanelJointMm(jointSizeMm: number): number {
  return Math.max(LAMINATE_WALL_PANEL_MIN_JOINT_MM, jointSizeMm);
}

/**
 * How deep the 3D view draws a wall finish off the wall face: a laminate sheet on its board (and battens) at its real build-up,
 * anything else as the thin skin it gives (`skinMeters`).
 */
export function getWallFinishDepthMeters(
  material: { suitability?: { laminate_sheet?: boolean } } | null | undefined,
  settings: { panelBacking?: NormalizedWallPanelBacking } | null | undefined,
  skinMeters: number
): number {
  if (!material?.suitability?.laminate_sheet) return skinMeters;
  return getWallPanelBuildUpMm(LAMINATE_SHEET_THICKNESS_MM, getWallPanelBacking(settings)) / 1000;
}

/** The joint a wall finish is drawn with: a laminate sheet's (the render data's laminate-sheet fact) at least 3 mm. */
export function getDrawnWallJointMm(
  material: { suitability?: { laminate_sheet?: boolean } } | null | undefined,
  jointSizeMm: number
): number {
  return material?.suitability?.laminate_sheet ? getLaminateWallPanelJointMm(jointSizeMm) : jointSizeMm;
}

/**
 * The battens behind the pieces, in whole metres: upright battens at 600 mm centres across each piece, with one at each end,
 * each the piece's height. A piece narrower than the spacing still takes one at each end.
 */
export function countWallPanelBattenMetres(pieces: readonly WallFinishPiece[]): number {
  const spacing = WALL_PANEL_BATTEN_SPACING_MM / 1000;
  const metres = pieces.reduce((sum, piece) => {
    const width = piece.end - piece.start;
    const height = piece.top - piece.bottom;
    if (width <= 0 || height <= 0) return sum;
    return sum + (Math.ceil(width / spacing - 1e-6) + 1) * height;
  }, 0);
  return Math.ceil(metres - 1e-6);
}

/** Whether a catalogue record is a laminate sheet for walls (lib/surface-material-suitability-source.ts reads it the same way). */
export function isLaminateWallSheet(material: {
  surface_material: { surface_category: string };
  classification: { flooring_type?: string | null };
} | null | undefined): boolean {
  return material?.surface_material.surface_category === "wall_panel" && material.classification.flooring_type === "laminate";
}

/** What to order behind a laminate finish: one board per sheet, the sheet's size, and the battens when it is fixed on them. */
export type WallPanelBackingOrder = NormalizedWallPanelBacking & {
  boards: number;
  boardSizeMm: SurfaceSheetSize;
  /** Whole metres of battens; null when glued. */
  battenMetres: number | null;
};

/**
 * The backing to order for a laminate finish's sheets. The battens are counted from the pieces the sheets are laid on, or,
 * for a face the plan doesn't lay out, from its area: one batten every 600 mm is about 1.7 m of batten per square metre.
 */
export function buildWallPanelBackingOrder({
  backing,
  sheets,
  sheet,
  pieces,
  surfaceAreaSqm,
}: {
  backing: NormalizedWallPanelBacking | null | undefined;
  sheets: number;
  sheet: SurfaceSheetSize;
  pieces: readonly WallFinishPiece[] | null;
  surfaceAreaSqm: number;
}): WallPanelBackingOrder {
  const normalized = backing ?? DEFAULT_WALL_PANEL_BACKING;
  const battenMetres =
    normalized.fixing !== "battens"
      ? null
      : pieces?.length
        ? countWallPanelBattenMetres(pieces)
        : Math.ceil(surfaceAreaSqm / (WALL_PANEL_BATTEN_SPACING_MM / 1000) - 1e-6);
  return { ...normalized, boards: sheets, boardSizeMm: sheet, battenMetres };
}

/** "on 13 MDF boards, 9 mm, glued", "on 1 particle board, 9 mm, glued", or "..., on 42 m of 25 mm battens". */
export function formatWallPanelBackingOrder(order: WallPanelBackingOrder): string {
  const boards = `on ${order.boards} ${boardOption(order.board).board}${order.boards === 1 ? "" : "s"}, ${order.boardThicknessMm} mm`;
  return order.battenMetres === null
    ? `${boards}, glued`
    : `${boards}, on ${order.battenMetres} m of ${WALL_PANEL_BATTEN_DEPTH_MM} mm battens`;
}
