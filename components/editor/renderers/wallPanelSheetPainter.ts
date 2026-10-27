import type { SurfacePhysicalTileSample } from "@/lib/surface-material-physical-sampling";

/**
 * A wall panel's picture that is shorter than its sheet, painted at real size from the sheet's foot and repeated straight
 * up (J, 27 Oct 2026: "Real size, from the floor"). Greenlam's 4.25'x10' pictures cover 2600 of a sheet's 3050 mm, so a
 * 2.6 m wall shows the whole picture once, and a taller wall shows the picture's foot again in its top strip. Tiles
 * keep the mirrored, randomly offset repeat (surfaceTilePainter.ts).
 *
 * The context is translated to the sheet's centre, as surfaceTilePainter.ts draws a tile, and canvas y runs down the wall,
 * so the sheet's foot is at `drawHeight / 2`.
 */

/** Where the repeating picture sits, as [a, b, c, d, e, f] for the pattern's matrix: its foot on the sheet's, at real size. */
export function getWallPanelSheetPatternTransform({
  imageHeightPx,
  sample,
  drawWidth,
  drawHeight,
}: {
  imageHeightPx: number;
  sample: Pick<SurfacePhysicalTileSample, "needWidthMm" | "needHeightMm" | "pxPerMm">;
  drawWidth: number;
  drawHeight: number;
}): [number, number, number, number, number, number] {
  // Image pixels to canvas pixels, at the picture's real size on this sheet.
  const scaleX = drawWidth / (sample.needWidthMm * sample.pxPerMm.x);
  const scaleY = drawHeight / (sample.needHeightMm * sample.pxPerMm.y);
  return [scaleX, 0, 0, scaleY, -drawWidth / 2, drawHeight / 2 - imageHeightPx * scaleY];
}

export function fillWallPanelSheetFromFoot({
  context,
  image,
  imageHeightPx,
  sample,
  drawWidth,
  drawHeight,
}: {
  context: CanvasRenderingContext2D;
  image: CanvasImageSource;
  imageHeightPx: number;
  sample: SurfacePhysicalTileSample;
  drawWidth: number;
  drawHeight: number;
}) {
  const pattern = context.createPattern(image, "repeat");
  if (!pattern) return;
  pattern.setTransform(new DOMMatrix(getWallPanelSheetPatternTransform({ imageHeightPx, sample, drawWidth, drawHeight })));
  context.fillStyle = pattern;
  context.fillRect(-drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
}
