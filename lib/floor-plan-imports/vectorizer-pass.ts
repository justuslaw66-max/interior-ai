import type { RegisteredPageEvidence, PageSemanticEvidence } from "./deterministic-evidence";
import type { FloorPlanAdapterContext } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";
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
  /** The adapter's ordinary semantic merge, with the vectorizer's observations preferred. */
  mergeSemantics: (deterministic: PageSemanticEvidence, semantic: PageSemanticEvidence) => PageSemanticEvidence;
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
 * Local vectorizer pass over raster pages. It is slow (minutes), so only the
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
    try {
      const evidence = await provider.analyzePage(
        { pageNumber: page.pageNumber, widthPx: page.widthPx, heightPx: page.heightPx, mimeType: derivative.mimeType, bytes: derivative.bytes },
        { timeoutMs, signal: context.signal }
      );
      page.semantics = input.mergeSemantics(page.semantics, registerVectorizerEvidence(page, evidence, derivative.bytes));
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
    }
  }
  return diagnostics;
}
