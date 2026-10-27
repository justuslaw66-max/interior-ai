/**
 * Whole sheets for a wall finish sold by the sheet: Greenlam's 1220×2440 mm laminates (J, 25 Oct 2026: "Whole sheets";
 * 26 Oct: "Share offcuts"). Tiles and floors are still ordered by area, with 10% for cuts.
 *
 * The sheets are laid as the 3D view lays them: on each wall face from the floor up and from the face's start corner
 * (components/editor/renderers/surfaceTileRows.ts). Each sheet position the finish reaches needs one sheet:
 * - a position the finish fills from edge to edge takes a whole sheet, including one notched around a door or window;
 * - a cut piece (the narrow column at the end of a wall, the strip at the top of a wall taller than a sheet, the piece
 *   beside or above an opening) is cut from shared sheets. All the cut pieces of one finish in one room share sheets,
 *   upright, so the grain runs the way it is drawn; they are packed in shelves, tallest first (first-fit decreasing
 *   height), which a fitter can match or beat.
 * Saw cuts and the 1 mm joints between sheets are not allowed for.
 */

/** A rectangle of a wall finish on one wall face, in metres. */
export type WallFinishPiece = {
  /** The wall face the piece is on: sheets are laid afresh on each face. */
  faceKey: string;
  /** From the face's start corner, the way its sheets are laid. */
  start: number;
  end: number;
  /** Above the floor. */
  bottom: number;
  top: number;
};

export type SurfaceSheetSize = { widthMm: number; heightMm: number };

/** What the count reads of a surface material: the catalogue's record or the editor's render record. */
type SheetMaterial = {
  surface_material: { surface_category: string };
  physical_specs: { tile_width_mm?: number | null; tile_length_mm?: number | null };
};

type Sheet = { width: number; height: number };
type Box = { left: number; right: number; bottom: number; top: number };
type Shelf = { usedWidth: number };
type PackedSheet = { shelves: Shelf[]; usedHeight: number };

/** Sizes within a millimetre are equal, and slivers thinner than one are dropped. */
const TOLERANCE_METERS = 0.001;

/** A wall panel's sheet (width across the wall, height up it), or null for a finish ordered by area. */
export function getSurfaceSheetSize(material: SheetMaterial | null | undefined): SurfaceSheetSize | null {
  const widthMm = material?.physical_specs.tile_width_mm;
  const heightMm = material?.physical_specs.tile_length_mm;
  if (material?.surface_material.surface_category !== "wall_panel" || !widthMm || !heightMm) return null;
  return { widthMm, heightMm };
}

/** A sheet's area in square metres. */
export function getSheetAreaSqm(sheet: SurfaceSheetSize): number {
  return (sheet.widthMm * sheet.heightMm) / 1_000_000;
}

/** The sheet as laid: a quarter turn of the finish lays it on its side; any other angle is counted upright. */
function laidSheet(sheet: SurfaceSheetSize, rotationDeg: number): Sheet {
  const quarterTurned = Math.abs((((rotationDeg % 180) + 180) % 180) - 90) < 1;
  const width = sheet.widthMm / 1000;
  const height = sheet.heightMm / 1000;
  return quarterTurned ? { width: height, height: width } : { width, height };
}

/** The part of each sheet position on one face the finish reaches, as the box it is cut from. */
function sheetPositionBoxes(pieces: readonly WallFinishPiece[], sheet: Sheet): Box[] {
  const boxes = new Map<string, Box>();
  for (const piece of pieces) {
    const firstColumn = Math.floor((piece.start + TOLERANCE_METERS) / sheet.width);
    const lastColumn = Math.ceil((piece.end - TOLERANCE_METERS) / sheet.width) - 1;
    const firstRow = Math.floor((piece.bottom + TOLERANCE_METERS) / sheet.height);
    const lastRow = Math.ceil((piece.top - TOLERANCE_METERS) / sheet.height) - 1;
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      for (let row = firstRow; row <= lastRow; row += 1) {
        const left = Math.max(piece.start, column * sheet.width);
        const right = Math.min(piece.end, (column + 1) * sheet.width);
        const bottom = Math.max(piece.bottom, row * sheet.height);
        const top = Math.min(piece.top, (row + 1) * sheet.height);
        if (right - left <= TOLERANCE_METERS || top - bottom <= TOLERANCE_METERS) continue;
        const key = `${column}:${row}`;
        const box = boxes.get(key);
        boxes.set(key, box
          ? { left: Math.min(box.left, left), right: Math.max(box.right, right), bottom: Math.min(box.bottom, bottom), top: Math.max(box.top, top) }
          : { left, right, bottom, top });
      }
    }
  }
  return [...boxes.values()];
}

/**
 * Cut pieces packed upright into shelves across shared sheets, tallest first: each piece goes on the first shelf with
 * room across, else on a new shelf in the first sheet with room up, else on a new sheet. Pieces come tallest first, so
 * every shelf is already tall enough for the piece being placed.
 */
function packCutPieces(pieces: readonly Sheet[], sheet: Sheet): number {
  const sheets: PackedSheet[] = [];
  const tallestFirst = [...pieces].sort((a, b) => b.height - a.height || b.width - a.width);
  for (const piece of tallestFirst) {
    const shelf = sheets.flatMap((packed) => packed.shelves)
      .find((candidate) => candidate.usedWidth + piece.width <= sheet.width + TOLERANCE_METERS);
    if (shelf) {
      shelf.usedWidth += piece.width;
      continue;
    }
    const roomUp = sheets.find((packed) => packed.usedHeight + piece.height <= sheet.height + TOLERANCE_METERS);
    if (roomUp) {
      roomUp.shelves.push({ usedWidth: piece.width });
      roomUp.usedHeight += piece.height;
    } else {
      sheets.push({ shelves: [{ usedWidth: piece.width }], usedHeight: piece.height });
    }
  }
  return sheets.length;
}

/** Sheets for finished pieces laid out on their faces: whole positions one each, cut pieces packed onto shared sheets. */
export function countWallPanelSheets(pieces: readonly WallFinishPiece[], sheetSize: SurfaceSheetSize, rotationDeg = 0): number {
  const sheet = laidSheet(sheetSize, rotationDeg);
  const piecesByFace = new Map<string, WallFinishPiece[]>();
  for (const piece of pieces) piecesByFace.set(piece.faceKey, [...(piecesByFace.get(piece.faceKey) ?? []), piece]);
  let whole = 0;
  const cutPieces: Sheet[] = [];
  for (const facePieces of piecesByFace.values()) {
    for (const box of sheetPositionBoxes(facePieces, sheet)) {
      const cut = { width: box.right - box.left, height: box.top - box.bottom };
      if (cut.width >= sheet.width - TOLERANCE_METERS && cut.height >= sheet.height - TOLERANCE_METERS) whole += 1;
      else cutPieces.push(cut);
    }
  }
  return whole + packCutPieces(cutPieces, sheet);
}

/**
 * Sheets to order for one finish. Without its pieces (a room the plan can't lay out, or a face it doesn't draw), the
 * order area, which already has 10% for cuts, is rounded up to whole sheets.
 */
export function countSurfaceSheets({
  pieces,
  orderAreaSqm,
  rotationDeg,
  sheet,
}: {
  pieces: readonly WallFinishPiece[] | null | undefined;
  orderAreaSqm: number;
  rotationDeg: number;
  sheet: SurfaceSheetSize;
}): number {
  if (pieces && pieces.length > 0) return countWallPanelSheets(pieces, sheet, rotationDeg);
  if (orderAreaSqm <= 0) return 0;
  return Math.ceil(orderAreaSqm / getSheetAreaSqm(sheet) - 1e-9);
}

/** "1 sheet", "12 sheets". */
export function formatSheetCount(sheets: number): string {
  return `${sheets} ${sheets === 1 ? "sheet" : "sheets"}`;
}

/** "1220 × 2440 mm". */
export function formatSheetSize(sheet: SurfaceSheetSize): string {
  return `${sheet.widthMm} × ${sheet.heightMm} mm`;
}
