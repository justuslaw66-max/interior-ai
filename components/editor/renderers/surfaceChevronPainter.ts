import { getChevronLayout, paintChevronPixels, type ChevronFacePixels } from "@/lib/surface-chevron-layout";
import {
  getImageDataForSource,
  readPhysicalPlankSources,
  type LoadedSurfacePhysicalSource,
} from "./surfaceTilePainter";

/** Without a catalogued end offset, a chevron's ends are cut at 45 degrees: each cut runs one piece width along it. */
const DEFAULT_END_OFFSET_WIDTHS = 1;

/**
 * Paints the chevron layout over the whole canvas (see lib/surface-chevron-layout.ts). Each piece shows one of the
 * material's faces, read at the canvas resolution; without faces, the one source image stands for every piece.
 * Returns false when the source pixels cannot be read or the piece cannot be laid as a chevron.
 */
export function paintChevronSurface({
  context,
  width,
  height,
  image,
  physicalSources,
  tileWidthPx,
  tileHeightPx,
  tileSizeMm,
  endOffsetMm,
  jointSizePx,
  jointRgb,
  seedBase,
}: {
  context: CanvasRenderingContext2D;
  width: number;
  height: number;
  image: CanvasImageSource;
  physicalSources: readonly LoadedSurfacePhysicalSource[] | null;
  tileWidthPx: number;
  tileHeightPx: number;
  tileSizeMm: { width: number; height: number };
  endOffsetMm: number | null | undefined;
  jointSizePx: number;
  jointRgb: readonly [number, number, number];
  seedBase: number;
}): boolean {
  const pieceWidth = Math.min(tileWidthPx, tileHeightPx);
  const pieceWidthMm = Math.min(tileSizeMm.width, tileSizeMm.height);
  const canvasPxPerMm = pieceWidth / pieceWidthMm;
  const layout = getChevronLayout({
    pieceWidth,
    pieceLength: Math.max(tileWidthPx, tileHeightPx),
    endOffset: endOffsetMm && endOffsetMm > 0 ? endOffsetMm * canvasPxPerMm : pieceWidth * DEFAULT_END_OFFSET_WIDTHS,
  });
  if (!layout) return false;

  const faces: ChevronFacePixels[] | undefined = physicalSources
    ? readPhysicalPlankSources(physicalSources, canvasPxPerMm)?.map((source) => source.imageData)
    : [getImageDataForSource(image)].filter((source): source is ImageData => Boolean(source));
  if (!faces || faces.length === 0) return false;

  const outputImageData = context.createImageData(width, height);
  paintChevronPixels({
    output: outputImageData.data,
    width,
    height,
    layout,
    faces,
    jointInset: Math.min(Math.max(0, jointSizePx / 2), Math.max(0, pieceWidth / 2 - 0.25)),
    jointRgb,
    seed: seedBase,
  });
  context.putImageData(outputImageData, 0, 0);
  return true;
}
