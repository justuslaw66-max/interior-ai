import type { FloorPlanSourceMeasurementV2 } from "@/lib/floor-plan-document-v2";
import type { RegisteredPageEvidence } from "./deterministic-evidence";
import type { ExtractionEnvelope, PageScaleSolution } from "./pdf-raster-evidence";
import { scaleBarMeasurement, scaleBarPageScales } from "./scale-bar-scale";
import { automaticScaleReviewMessage } from "./source-scale-cross-check";
import type { FloorPlanReviewIssue } from "./types";
import { vectorizerScaleEstimate, vectorizerScaleEstimateMessage } from "./vectorizer-scale-estimate";

/**
 * The scale a page gets when no printed dimension could be confirmed anywhere: the vectorizer's estimate (door swings
 * taken as standard leaves). It carries the geometry so the reviewer sees rooms at once, is marked assumed, keeps the
 * scale review critical until a width is confirmed, and "Update measurement" remaps everything to the confirmed width.
 */

const ASSUMED_BASIS = "assumed_opening_width";

export function isAssumedScale(scale: PageScaleSolution | null | undefined): boolean {
  return scale?.basis === ASSUMED_BASIS;
}

/** The fallback scale for the first page with an estimate, or none. */
export function assumedScaleFallback(pages: RegisteredPageEvidence[]): PageScaleSolution[] {
  for (const page of pages) {
    const estimate = vectorizerScaleEstimate(page);
    if (!estimate) continue;
    return [{ pageNumber: page.pageNumber, millimetresPerPixel: estimate.millimetresPerPixel, dimensionCount: 0,
      rmsResidualMm: 0, confidence: 0.3, evidence: [], basis: ASSUMED_BASIS }];
  }
  return [];
}

/** Scales for pages whose printed dimensions solved nothing: a printed scale bar, else the door-width estimate. */
export function fallbackPageScales(pages: RegisteredPageEvidence[]): PageScaleSolution[] {
  const bars = scaleBarPageScales(pages);
  return bars.length ? bars : assumedScaleFallback(pages);
}

/** Printed spans become editable dimensions once walls exist; a scale bar's span always does, as a reviewer's
 *  measurement would, so a plan scaled from its bar keeps the printed length it was scaled by. */
export function scaleEvidenceMakesDimensions(scale: PageScaleSolution, walls: readonly unknown[]): boolean {
  return walls.length > 0 || scale.basis === "scale_bar";
}

/** The critical scale issue for the selected page: none when a printed scale was solved on it. */
export function scaleUnresolvedIssues(envelope: ExtractionEnvelope, page: RegisteredPageEvidence | undefined,
  scale: PageScaleSolution | null): FloorPlanReviewIssue[] {
  const issue = (message: string): FloorPlanReviewIssue[] =>
    [{ id: "scale-review", code: "scale_unresolved", message, severity: "critical", resolved: false }];
  const estimateMessage = () => vectorizerScaleEstimateMessage(page) ?? automaticScaleReviewMessage(page);
  if (page && isAssumedScale(scale)) {
    return issue(`${estimateMessage()} The rooms below were placed at that estimated scale; every length is approximate until a width is confirmed.`);
  }
  if (scale && page) return [];
  const solvedOtherPage = page && (envelope.scales ?? (envelope.scale ? [envelope.scale] : [])).find(
    (entry) => entry.pageNumber !== page.pageNumber);
  return issue(solvedOtherPage
    ? `Dimensions were solved on source page ${solvedOtherPage.pageNumber}, but the selected plan is on page ${page.pageNumber}. Confirm dimensions from this plan page before geometry can be trusted.`
    : estimateMessage());
}

/** Whether the door openings behind the estimate are wanted as reference marks: no scale, or an assumed one. */
export function scaleEstimateMarksWanted(scale: PageScaleSolution | null): boolean {
  return !scale || isAssumedScale(scale);
}

/** The calibration's measurement when the scale is assumed: the first measured door opening, at the width the
 *  assumed leaf gives it — the same number the review's door-opening offer shows, so applying that opening unchanged
 *  stays assumed. The review shows it as "Set from an assumed width" and lets the reviewer correct it. */
function assumedScaleMeasurement(page: RegisteredPageEvidence): FloorPlanSourceMeasurementV2 | undefined {
  const door = vectorizerScaleEstimate(page)?.doorOpenings[0];
  if (!door) return undefined;
  return {
    id: "assumed-opening-width-1",
    firstPx: { x: door.sourcePx[0][0], y: door.sourcePx[0][1] },
    secondPx: { x: door.sourcePx[1][0], y: door.sourcePx[1][1] },
    confirmedLengthMm: Math.round(door.widthMmAtEstimate),
    inputUnit: "mm",
    sourceQuality: "clean",
    basis: ASSUMED_BASIS,
    confirmedAt: new Date(0).toISOString(),
  };
}

/** The accuracy fields of the source calibration built from a solved (or assumed) page scale, with the measurement
 *  behind it when that is a door width taken as standard or a printed scale bar. */
export function calibrationScaleFields(page: RegisteredPageEvidence, scale: PageScaleSolution) {
  return {
    rmsErrorPx: scale.rmsResidualMm / scale.millimetresPerPixel,
    ...(isAssumedScale(scale) ? { primaryMeasurement: assumedScaleMeasurement(page) }
      : scale.basis === "scale_bar" ? { primaryMeasurement: scaleBarMeasurement(page) } : {}),
  };
}

/** Solve-stage metrics: a scale counts as solved only when it came from printed dimensions. */
export function scaleSolvedMetrics(scale: PageScaleSolution | null) {
  return { scaleSolved: Boolean(scale) && !isAssumedScale(scale), scaleAssumed: isAssumedScale(scale) };
}
