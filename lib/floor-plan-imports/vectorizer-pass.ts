import type { RegisteredPageEvidence, PageSemanticEvidence } from "./deterministic-evidence";
import type { FloorPlanAdapterContext } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";
import { registeredVectorizerDrawing } from "./vectorizer-drawing";
import {
  floorPlanVectorizerRuntimeConfiguration,
  registerVectorizerEvidence,
  type FloorPlanVectorizerProvider,
} from "./vectorizer-evidence";

export type VectorizerPageDiagnostics = {
  providerId: string;
  status: "completed" | "failed";
  elapsedMs: number;
  roomCount: number;
  dimensionSpanCount: number;
  openingCount: number;
  scaleBasis: string | null;
  error: string | null;
};

type VectorizerPassInput = {
  pages: RegisteredPageEvidence[];
  renderedPages: FloorPlanRenderedPage[];
  context: FloorPlanAdapterContext;
  provider: FloorPlanVectorizerProvider | null;
  /** How many of the best-ranked pages to analyse. */
  pageLimit: number;
  rankPages: (pages: RegisteredPageEvidence[]) => RegisteredPageEvidence[];
  /** The adapter's ordinary semantic merge of the vectorizer's observations into this page. */
  mergeSemantics: (
    deterministic: PageSemanticEvidence,
    semantic: PageSemanticEvidence,
    page: RegisteredPageEvidence
  ) => PageSemanticEvidence;
};

function failedPass(providerId: string, started: number, cause: unknown): VectorizerPageDiagnostics {
  const message = cause instanceof Error ? cause.message : "unknown error";
  return {
    providerId,
    status: "failed",
    elapsedMs: Date.now() - started,
    roomCount: 0,
    dimensionSpanCount: 0,
    openingCount: 0,
    scaleBasis: null,
    error: message.slice(0, 240),
  };
}

/**
 * Local vectorizer pass over the candidate pages (see vectorizer-pdf-pages.ts). It is slow (minutes), so only the
 * best-ranked page(s) are analysed; a failure leaves the page exactly as the
 * other evidence sources made it.
 */
export async function applyVectorizerEvidence(input: VectorizerPassInput) {
  const { pages, context, provider } = input;
  const diagnostics = new Map<number, VectorizerPageDiagnostics>();
  if (!provider || !context.store.readDerivative || pages.length === 0) return diagnostics;
  const { timeoutMs } = floorPlanVectorizerRuntimeConfiguration();
  const renderedByPage = new Map(input.renderedPages.map((page) => [page.pageNumber, page]));
  const selected = pages.length <= input.pageLimit ? pages : input.rankPages(pages).slice(0, input.pageLimit);
  for (const page of selected) {
    const rendered = renderedByPage.get(page.pageNumber);
    const derivative = rendered ? await context.store.readDerivative(rendered.assetKey) : null;
    if (!derivative) continue;
    const started = Date.now();
    const pageImage = { pageNumber: page.pageNumber, widthPx: page.widthPx, heightPx: page.heightPx, mimeType: derivative.mimeType, bytes: derivative.bytes };
    try {
      const evidence = await provider.analyzePage(pageImage, { timeoutMs, signal: context.signal });
      page.semantics = input.mergeSemantics(page.semantics, registerVectorizerEvidence(page, evidence, derivative.bytes), page);
      diagnostics.set(page.pageNumber, {
        providerId: provider.id,
        status: "completed",
        elapsedMs: Date.now() - started,
        roomCount: evidence.rooms.length,
        dimensionSpanCount: evidence.semantics.dimensionLabels.length,
        openingCount: evidence.semantics.openingSymbols.length,
        scaleBasis: evidence.scale.basis,
        error: null,
      });
    } catch (cause) {
      const failed = failedPass(provider.id, started, cause);
      page.semantics.notes.push(`Local vectorizer unavailable: ${failed.error}. Other evidence sources are retained.`);
      diagnostics.set(page.pageNumber, failed);
      await drawFaithfullyAlone(page, pageImage, rendered, provider, context.signal);
    }
  }
  return diagnostics;
}

/**
 * With the faithful trace on, a page the vectorizer could not read (stage 1 failed or ran out of time) is still drawn
 * by it: the faithful trace does not need stage 1 (J, 24 Oct). It fails soft and says why; a cancelled import draws
 * nothing more.
 */
async function drawFaithfullyAlone(
  page: RegisteredPageEvidence,
  pageImage: Parameters<FloorPlanVectorizerProvider["analyzePage"]>[0],
  rendered: FloorPlanRenderedPage | undefined,
  provider: FloorPlanVectorizerProvider,
  signal?: AbortSignal
) {
  if (!provider.drawsFaithfully || !provider.drawPage || signal?.aborted) return;
  try {
    const result = await provider.drawPage(pageImage, { signal });
    if ("note" in result) {
      page.semantics.notes.push(result.note.slice(0, 240));
      return;
    }
    // The trace is in the rendered picture's pixels; the page may be registered at a slightly different size.
    const sx = rendered?.widthPx ? page.widthPx / rendered.widthPx : 1;
    const sy = rendered?.heightPx ? page.heightPx / rendered.heightPx : 1;
    page.faithfulDrawing = registeredVectorizerDrawing(result.drawing, sx, sy);
    page.semantics.notes.push("Faithful trace drawn on its own: the vectorizer could not read this page.");
  } catch (cause) {
    page.semantics.notes.push(`Faithful trace unavailable: ${cause instanceof Error ? cause.message.slice(0, 200) : "unknown error"}`);
  }
}
