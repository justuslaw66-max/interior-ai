import type { FloorPlanSourceMeasurementV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "./deterministic-evidence";
import type { PageScaleSolution } from "./pdf-raster-evidence";

/** The id of a calibration's measurement taken from a printed scale bar; the review shows it as set from the bar. */
export const SCALE_BAR_MEASUREMENT_ID = "scale-bar-1";

function label(page: RegisteredPageEvidence) {
  const bar = page.scaleBar!;
  return `${bar.values[0]}-${bar.values[bar.values.length - 1]} ${bar.unit === "m" ? "m" : "mm"}`;
}

/**
 * The page scale a printed scale bar gives: one span from its first to its last numbered tick. It is a printed length,
 * so the geometry built on it is measured, not assumed; it ranks below printed dimensions, which sit on the plan
 * itself, and above the vectorizer's door-width estimate.
 */
export function scaleBarPageScale(page: RegisteredPageEvidence): PageScaleSolution | null {
  const bar = page.scaleBar;
  if (!bar) return null;
  const observedLengthPx = Math.hypot(bar.end.x - bar.start.x, bar.end.y - bar.start.y);
  return {
    pageNumber: page.pageNumber,
    millimetresPerPixel: bar.millimetresPerPixel,
    dimensionCount: bar.values.length,
    rmsResidualMm: bar.rmsResidualPx * bar.millimetresPerPixel,
    confidence: bar.labelSource === "pdf_text" ? 0.95 : 0.85,
    evidence: [{ valueMm: bar.lengthMm, observedLengthPx, residualMm: observedLengthPx * bar.millimetresPerPixel - bar.lengthMm,
      segmentId: `scale-bar ${label(page)}`, start: bar.start, end: bar.end }],
    basis: "scale_bar",
  };
}

/** Scale bars on the pages, best first (most numbered ticks). */
export function scaleBarPageScales(pages: readonly RegisteredPageEvidence[]): PageScaleSolution[] {
  return pages.flatMap((page) => scaleBarPageScale(page) ?? [])
    .sort((left, right) => right.dimensionCount - left.dimensionCount);
}

/** The calibration's measurement for a scale-bar scale: the bar's first and last numbered ticks and its length. */
export function scaleBarMeasurement(page: RegisteredPageEvidence): FloorPlanSourceMeasurementV2 | undefined {
  const bar = page.scaleBar;
  if (!bar) return undefined;
  return {
    id: SCALE_BAR_MEASUREMENT_ID,
    firstPx: { x: bar.start.x, y: bar.start.y },
    secondPx: { x: bar.end.x, y: bar.end.y },
    confirmedLengthMm: Math.round(bar.lengthMm),
    inputUnit: "mm",
    sourceQuality: "clean",
    confirmedAt: new Date(0).toISOString(),
  };
}
