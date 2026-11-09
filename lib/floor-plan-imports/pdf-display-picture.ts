import type { FloorPlanAdapterContext } from "./source-adapter";

/**
 * A sharper picture of a PDF page, only for people to look at (9 Nov 2026).
 *
 * The import reads a PDF page from a picture at 144 dpi (`PDF_RENDER_SCALE` 2): for an A4 sheet, 1190 × 1684 px. That
 * picture is also what the review showed as "Original", so at the review's 4× zoom a vector PDF looked blurry next
 * to the traced drawing. This renders the same page again at 432 dpi, in the same frame (same aspect; the review
 * scales it into the page's own `widthPx` × `heightPx`), and keeps it as `displayAssetKey`. Nothing reads geometry
 * from it: the import's evidence, scale and coordinates all stay on the 144 dpi picture.
 */

/** 6 = 432 dpi: an A4 page at 3572 × 5052 px, about 3× the reading picture, enough for the review's 4× zoom. */
export const PDF_DISPLAY_SCALE = 6;
/** Pixels at most (an A4 page at 432 dpi is 18 MP); a larger sheet is drawn smaller. */
export const MAX_DISPLAY_PIXELS = 20_000_000;
/** Below this many times the reading picture's width it isn't worth keeping a second picture. */
const MIN_GAIN = 1.5;

type PdfPage = {
  getViewport(options: { scale: number }): { width: number; height: number };
  render(options: { canvas: unknown; canvasContext: unknown; viewport: unknown }): { promise: Promise<unknown> };
};
type Canvas = { width: number; height: number; getContext(kind: "2d"): unknown; toBuffer(type: "image/png"): Uint8Array };

/** The scale to draw the display picture at, or null when it wouldn't be meaningfully sharper than the reading one. */
export function pdfDisplayScale(unit: { width: number; height: number }, readingScale: number) {
  const scale = Math.min(PDF_DISPLAY_SCALE, Math.sqrt(MAX_DISPLAY_PIXELS / Math.max(1, unit.width * unit.height)));
  return scale >= readingScale * MIN_GAIN ? scale : null;
}

/** Renders and stores the page's display picture; its asset key, or undefined when it isn't worth one. */
export async function storePdfDisplayPicture(page: PdfPage, readingScale: number, pageNumber: number,
  createCanvas: (width: number, height: number) => Canvas, context: FloorPlanAdapterContext) {
  const scale = pdfDisplayScale(page.getViewport({ scale: 1 }), readingScale);
  if (scale === null) return undefined;
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
  return context.store.putDerivative({
    jobId: context.jobId, fileName: `page-${pageNumber}-display.png`, mimeType: "image/png", bytes: new Uint8Array(canvas.toBuffer("image/png")),
  });
}
