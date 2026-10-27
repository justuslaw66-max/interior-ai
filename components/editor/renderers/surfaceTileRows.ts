import type { SurfaceMaterialRenderInfo } from "@/lib/surface-material-runtime";

/** The rows of a laid surface's canvas: rows `first` to `end - 1`, row `row` starting `top(row)` px below the canvas's top. */
export type SurfaceTileRows = { first: number; end: number; top: (row: number) => number };

/**
 * The columns of a laid surface's canvas: columns `first` to `end - 1`, column `col` starting `left(col, rowOffset)` px from
 * its left, in a row shifted by `rowOffset` px (a brick layout's half tile).
 */
export type SurfaceTileColumns = { first: number; end: number; left: (col: number, rowOffset: number) => number };

/** A wall panel (a laminate sheet) is laid from the floor and the face's start, and never turns its picture. */
export function isWallPanel(material: SurfaceMaterialRenderInfo): boolean {
  return material.surface_material.surface_category === "wall_panel";
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Where the rows of tiles or sheets fall on a surface's canvas.
 *
 * Tiles are laid from the top edge of the canvas, as they always have been. Wall panels stand on the floor, so when the caller
 * says how high the surface's bottom edge is (`bottomAboveFloorMeters`), their sheets are laid from the floor up: a cut sheet
 * is at the top of the wall, and the parts of a wall beside, below and above a door or window, each painted on its own canvas,
 * share one set of joints. A row's number then counts sheets up from the floor, so a sheet is drawn the same in every part it
 * crosses.
 */
export function getSurfaceTileRows({
  material,
  canvasHeightPx,
  surfaceHeightMeters,
  tileHeightPx,
  bottomAboveFloorMeters,
}: {
  material: SurfaceMaterialRenderInfo;
  canvasHeightPx: number;
  surfaceHeightMeters: number;
  tileHeightPx: number;
  bottomAboveFloorMeters?: number | null;
}): SurfaceTileRows {
  if (!isWallPanel(material) || !isFiniteNumber(bottomAboveFloorMeters)) {
    return { first: -2, end: Math.ceil(canvasHeightPx / tileHeightPx) + 3, top: (row) => row * tileHeightPx };
  }
  // The floor, in canvas pixels below the canvas's top; row k's bottom edge is k rows above it.
  const floorPx = canvasHeightPx + (bottomAboveFloorMeters * canvasHeightPx) / surfaceHeightMeters;
  return {
    first: Math.floor((floorPx - canvasHeightPx) / tileHeightPx) - 1,
    end: Math.ceil(floorPx / tileHeightPx) + 1,
    top: (row) => floorPx - (row + 1) * tileHeightPx,
  };
}

/**
 * Where the columns fall. Tiles start a column at the canvas's left edge, as before. For wall panels, when the caller says how
 * far along the wall face the canvas's left edge is (`startAlongFaceMeters`, measured the way the picture runs), sheets are
 * laid from the face's start: the parts beside and above a door share their sheet edges, and a column's number counts sheets
 * from the start, so a sheet's picture carries on across the parts.
 */
export function getSurfaceTileColumns({
  material,
  canvasWidthPx,
  surfaceWidthMeters,
  tileWidthPx,
  startAlongFaceMeters,
}: {
  material: SurfaceMaterialRenderInfo;
  canvasWidthPx: number;
  surfaceWidthMeters: number;
  tileWidthPx: number;
  startAlongFaceMeters?: number | null;
}): SurfaceTileColumns {
  if (!isWallPanel(material) || !isFiniteNumber(startAlongFaceMeters)) {
    // The painter's own arithmetic, unchanged, so tiles land on exactly the same pixels.
    const end = Math.ceil((canvasWidthPx + tileWidthPx * 3) / tileWidthPx);
    return { first: 0, end, left: (col, rowOffset) => -tileWidthPx - rowOffset + col * tileWidthPx };
  }
  // The face's start, in canvas pixels left of the canvas's left edge; column k's left edge is k columns after it.
  const startPx = (startAlongFaceMeters * canvasWidthPx) / surfaceWidthMeters;
  return {
    first: Math.floor(startPx / tileWidthPx) - 1,
    end: Math.ceil((startPx + canvasWidthPx) / tileWidthPx) + 1,
    left: (col, rowOffset) => col * tileWidthPx - startPx - rowOffset,
  };
}

/** The rows and columns of a laid surface's canvas (see getSurfaceTileRows and getSurfaceTileColumns). */
export function getSurfaceTileGrid(input: Parameters<typeof getSurfaceTileRows>[0] & Parameters<typeof getSurfaceTileColumns>[0]) {
  return { rows: getSurfaceTileRows(input), cols: getSurfaceTileColumns(input) };
}
