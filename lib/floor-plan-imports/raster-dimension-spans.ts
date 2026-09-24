import { createHash } from "node:crypto";
import type { RegisteredPageEvidence, SourcePointPx } from "./deterministic-evidence";
import type { FloorPlanAdapterContext } from "./source-adapter";
import type { FloorPlanRenderedPage } from "./types";
import { dimensionLineCoverage, locateDimensionTick, type GrayRaster } from "./raster-dimension-ticks";

export type RasterDimensionAssociation = {
  labelIndex: number;
  valueMm: number;
  hintStart: SourcePointPx;
  hintEnd: SourcePointPx;
  start: SourcePointPx | null;
  end: SourcePointPx | null;
  lineCoverage: number;
  status: "source_supported" | "needs_review";
  reason: string | null;
};
export type RasterDimensionSpanEvidence = {
  coordinateSpace: "rendered_px";
  imageSha256: string;
  observations: RasterDimensionAssociation[];
};

/** Kept outside general wall linework: dimension strokes cannot close architectural faces. */
export function detectRasterDimensionSpans(page: RegisteredPageEvidence, raster: GrayRaster) {
  if (raster.width !== page.widthPx || raster.height !== page.heightPx || raster.data.length !== raster.width * raster.height) {
    throw new Error("Dimension sampling must use the exact registered page coordinate space.");
  }
  return page.semantics.dimensionLabels.flatMap((label, labelIndex): RasterDimensionAssociation[] => {
    if (!label.extensionStart || !label.extensionEnd) return [];
    const point = (value: { xRatio: number; yRatio: number }) => ({ x: value.xRatio * raster.width, y: value.yRatio * raster.height });
    const hintStart = point(label.extensionStart), hintEnd = point(label.extensionEnd);
    const length = Math.hypot(hintEnd.x - hintStart.x, hintEnd.y - hintStart.y);
    const base = { labelIndex, valueMm: label.valueMm, hintStart, hintEnd, start: null, end: null, lineCoverage: 0, status: "needs_review" as const };
    if (labelIndex >= 256 || length < 32 || !Number.isFinite(length)) return [{ ...base, reason: "unsupported_search_span" }];
    const inward = { x: (hintEnd.x - hintStart.x) / length, y: (hintEnd.y - hintStart.y) / length };
    const first = locateDimensionTick(raster, hintStart, inward);
    const second = locateDimensionTick(raster, hintEnd, { x: -inward.x, y: -inward.y });
    if (!first.tick || !second.tick) return [{ ...base, reason: first.reason ?? second.reason }];
    const start = { x: first.tick.x, y: first.tick.y }, end = { x: second.tick.x, y: second.tick.y };
    const lineCoverage = dimensionLineCoverage(raster, start, end);
    return [{ ...base, start, end, lineCoverage, status: lineCoverage >= 0.9 ? "source_supported" : "needs_review",
      reason: lineCoverage >= 0.9 ? null : "dimension_line_not_supported" }];
  });
}

export async function registerRasterDimensionSpans(page: RegisteredPageEvidence, rendered: FloorPlanRenderedPage | undefined, context?: FloorPlanAdapterContext) {
  if (!rendered || !context?.store.readDerivative || !page.vectorSegments.some((segment) => segment.evidenceKind === "raster_linework") ||
    !page.semantics.dimensionLabels.some((label) => label.extensionStart && label.extensionEnd)) return;
  const derivative = await context.store.readDerivative(rendered.assetKey);
  if (!derivative) throw new Error("The registered raster page is unavailable for dimension association.");
  const { default: sharp } = await import("sharp");
  const { data, info } = await sharp(derivative.bytes).flatten({ background: "#ffffff" }).greyscale().raw().toBuffer({ resolveWithObject: true });
  page.dimensionSpanEvidence = { coordinateSpace: "rendered_px", imageSha256: createHash("sha256").update(derivative.bytes).digest("hex"),
    observations: detectRasterDimensionSpans(page, { width: info.width, height: info.height, data }) };
}
