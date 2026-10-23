import type { RegisteredPageEvidence } from "./deterministic-evidence";
import type { FloorPlanLocalOcrProvider } from "./local-ocr";
import { loadFloorPlanPdfRuntime } from "./pdf-runtime";
import type { ScaleBarWord } from "./scale-bar-evidence";
import type { ScaleBarStripReader } from "./scale-bar-pages";
import type { FloorPlanAdapterContext, StoredFloorPlanSource } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";

type Strip = { left: number; top: number; right: number; bottom: number };

/** Strip pixels per rendered-page pixel: scale-bar numbers are often 3 pt tall, about 6 rendered pixels; four times
 *  that gives the OCR letters of about 24 pixels, which it reads reliably. */
const STRIP_MAGNIFICATION = 4;
const STRIP_OCR_TIMEOUT_MS = 10_000;

type PdfDocument = Awaited<ReturnType<Awaited<ReturnType<typeof loadFloorPlanPdfRuntime>>["createLoadingTask"]>["promise"]>;

/** Renders one strip of a PDF page at magnification, on white, as PNG bytes. */
async function renderStrip(pdf: PdfDocument, rendered: FloorPlanRenderedPage, strip: Strip) {
  const { createCanvas } = await import("@napi-rs/canvas");
  const page = await pdf.getPage(rendered.pageNumber);
  const pageScale = rendered.widthPx / page.getViewport({ scale: 1 }).width;
  const viewport = page.getViewport({ scale: pageScale * STRIP_MAGNIFICATION,
    offsetX: -strip.left * STRIP_MAGNIFICATION, offsetY: -strip.top * STRIP_MAGNIFICATION });
  const widthPx = Math.max(1, Math.ceil((strip.right - strip.left) * STRIP_MAGNIFICATION));
  const heightPx = Math.max(1, Math.ceil((strip.bottom - strip.top) * STRIP_MAGNIFICATION));
  const canvas = createCanvas(widthPx, heightPx);
  const canvasContext = canvas.getContext("2d");
  canvasContext.fillStyle = "#ffffff";
  canvasContext.fillRect(0, 0, widthPx, heightPx);
  await page.render({
    canvas: canvas as unknown as HTMLCanvasElement,
    canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
    viewport,
  }).promise;
  return { bytes: new Uint8Array(canvas.toBuffer("image/png")), widthPx, heightPx };
}

/** OCR words of a strip, placed back on the rendered page. Lines are left out: their words are read on their own. */
function wordsOnPage(candidates: Array<{ text: string; bbox: Strip }>, strip: Strip): ScaleBarWord[] {
  return candidates.filter((candidate) => !/\s/.test(candidate.text)).map((candidate) => ({
    text: candidate.text,
    center: {
      x: strip.left + (candidate.bbox.left + candidate.bbox.right) / 2 / STRIP_MAGNIFICATION,
      y: strip.top + (candidate.bbox.top + candidate.bbox.bottom) / 2 / STRIP_MAGNIFICATION,
    },
    widthPx: (candidate.bbox.right - candidate.bbox.left) / STRIP_MAGNIFICATION,
    heightPx: (candidate.bbox.bottom - candidate.bbox.top) / STRIP_MAGNIFICATION,
  }));
}

/**
 * Reads the numbers beside a ruled bar on a PDF page whose type was outlined, with the server's local OCR. The PDF is
 * opened once, on the first strip, and closed by `close`. None for other sources, without local OCR, or when
 * FLOOR_PLAN_SCALE_BAR_OCR_DISABLED=1.
 */
export function createScaleBarStripReader(source: StoredFloorPlanSource, renderedPages: FloorPlanRenderedPage[],
  provider: FloorPlanLocalOcrProvider | null, context: FloorPlanAdapterContext): ScaleBarStripReader | null {
  if (source.mimeType !== "application/pdf" || !provider || process.env.FLOOR_PLAN_SCALE_BAR_OCR_DISABLED === "1") return null;
  let opened: Promise<{ pdf: PdfDocument; destroy: () => Promise<void> }> | null = null;
  const open = () => opened ??= loadFloorPlanPdfRuntime().then(async ({ createLoadingTask }) => {
    const task = createLoadingTask(source.bytes);
    return { pdf: await task.promise, destroy: () => task.destroy() };
  });
  return {
    async read(page: RegisteredPageEvidence, strip: Strip) {
      const rendered = renderedPages.find((entry) => entry.pageNumber === page.pageNumber);
      if (!rendered || context.signal?.aborted) return [];
      const image = await renderStrip((await open()).pdf, rendered, strip);
      const result = await provider.recognizePage(
        { pageNumber: page.pageNumber, widthPx: image.widthPx, heightPx: image.heightPx, mimeType: "image/png", bytes: image.bytes },
        { timeoutMs: STRIP_OCR_TIMEOUT_MS, maxCandidates: 60, minSourceConfidence: 60, signal: context.signal, singleLine: true });
      return wordsOnPage(result.candidates, strip);
    },
    async close() {
      if (opened) await (await opened).destroy();
    },
  };
}
