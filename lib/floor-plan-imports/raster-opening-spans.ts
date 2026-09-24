import { createHash } from "node:crypto";
import type { RegisteredPageEvidence, SemanticOpeningSymbol, SourcePointPx } from "./deterministic-evidence";
import type { FloorPlanAdapterContext } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";
import type { GrayRaster } from "./raster-dimension-ticks";
import { locateRasterOpeningEnds, type RasterOpeningEnds } from "./raster-opening-rails";

type Observation = { symbolIndex: number; kind: SemanticOpeningSymbol["kind"]; hintStart: SourcePointPx; hintEnd: SourcePointPx;
  span: RasterOpeningEnds | null; reason: string };
export type RasterOpeningSpanEvidence = { coordinateSpace: "rendered_px"; imageSha256: string;
  widthPx: number; heightPx: number; observations: Observation[] };

const sourcePoint = (page: RegisteredPageEvidence, point: { xRatio: number; yRatio: number }) =>
  ({ x: point.xRatio * page.widthPx, y: point.yRatio * page.heightPx });

/** Pixel evidence is separate from immutable semantic hints and never changes wall or room linework. */
export function detectRasterOpeningSpans(page: RegisteredPageEvidence, raster: GrayRaster): Observation[] {
  if (raster.width !== page.widthPx || raster.height !== page.heightPx || raster.data.length !== raster.width * raster.height) {
    throw new Error("Opening sampling must use the exact registered page coordinate space.");
  }
  return page.semantics.openingSymbols.flatMap((symbol, symbolIndex) => {
    if (!symbol.spanStart || !symbol.spanEnd) return [];
    const hintStart = sourcePoint(page, symbol.spanStart), hintEnd = sourcePoint(page, symbol.spanEnd);
    const found = symbolIndex < 128 ? locateRasterOpeningEnds(raster, hintStart, hintEnd, symbol.kind)
      : { span: null, reason: "opening_search_budget_exceeded" };
    return [{ symbolIndex, kind: symbol.kind, hintStart, hintEnd, ...found }];
  });
}

export async function registerRasterOpeningSpans(page: RegisteredPageEvidence, rendered: FloorPlanRenderedPage | undefined, context?: FloorPlanAdapterContext) {
  if (!rendered || !context?.store.readDerivative || !page.vectorSegments.some((segment) => segment.evidenceKind === "raster_linework") ||
    !page.semantics.openingSymbols.some((symbol) => symbol.spanStart && symbol.spanEnd)) return;
  const derivative = await context.store.readDerivative(rendered.assetKey);
  if (!derivative) throw new Error("The registered raster page is unavailable for opening association.");
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(derivative.bytes).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  page.openingSpanEvidence = { coordinateSpace: "rendered_px", imageSha256: createHash("sha256").update(derivative.bytes).digest("hex"),
    widthPx: info.width, heightPx: info.height, observations: detectRasterOpeningSpans(page, { width: info.width, height: info.height, data }) };
}

export function sourceOpeningSpan(page: RegisteredPageEvidence, symbol: SemanticOpeningSymbol, symbolIndex: number) {
  if (!symbol.spanStart || !symbol.spanEnd) return { points: null, pixelSupported: false };
  const first = sourcePoint(page, symbol.spanStart), second = sourcePoint(page, symbol.spanEnd);
  const evidence = page.openingSpanEvidence, observation = evidence?.observations.find((item) => item.symbolIndex === symbolIndex);
  const same = (a: SourcePointPx, b: SourcePointPx) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-8;
  const valid = evidence?.coordinateSpace === "rendered_px" && evidence.widthPx === page.widthPx && evidence.heightPx === page.heightPx &&
    observation?.kind === symbol.kind && same(observation.hintStart, first) && same(observation.hintEnd, second) && observation.reason === "source_supported";
  const span = valid ? observation?.span : null;
  return { points: span ? [span.start, span.end] : [first, second], pixelSupported: Boolean(span) };
}
