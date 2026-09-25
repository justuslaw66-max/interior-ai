import { OUTVOTE_MIN_SUPPORT } from "./dimension-span-candidates";
import { inspectScaleFromRegisteredEvidence, type RegisteredPageEvidence, type SemanticDimensionLabel, type SourceScaleSolution, type SourceVectorSegment } from "./deterministic-evidence";

const REVIEW_PREFIX = "Dimension association conflict:";
const TOLERANCE_PX = 3;
const SET_ASIDE_PREFIX = "Printed dimension set aside:";
type DimensionConflict = Pick<SourceScaleSolution["evidence"][number], "valueMm" | "segmentId" | "start" | "end" | "observedLengthPx"> & {
  residualPx: number; orientation: SemanticDimensionLabel["orientation"]; rawText: string | null;
  endpointStatus: "source_supported" | "unverified"; labelIndex: number;
};

function centeredSpan(segment: SourceVectorSegment, label: SemanticDimensionLabel, page: RegisteredPageEvidence) {
  const dx = Math.abs(segment.end.x - segment.start.x), dy = Math.abs(segment.end.y - segment.start.y);
  const orientation = dx >= dy ? "horizontal" : "vertical";
  const length = Math.hypot(dx, dy);
  if (label.orientation !== orientation || Math.min(dx, dy) > TOLERANCE_PX) return null;
  if (length < Math.hypot(page.widthPx, page.heightPx) * 0.1) return null;
  const distance = Math.hypot((segment.start.x + segment.end.x) / 2 - label.centerXRatio * page.widthPx,
    (segment.start.y + segment.end.y) / 2 - label.centerYRatio * page.heightPx);
  if (distance > Math.min(length * 0.12, Math.max(12, Math.hypot(page.widthPx, page.heightPx) * 0.025))) return null;
  return { segment, length, distance };
}

/** Labels that may not veto the candidate: any disagreeing label once OUTVOTE_MIN_SUPPORT locally supported spans agree
 *  (a misread digit - d12's 3650 for 3620, d11's 2510 for 2570 - or a tick taken from the neighbouring dimension), and
 *  numbers the vectorizer read but could not pair with two stops (their span is a search hint; a disagreement is
 *  expected noise). Their indexes, so that neither the conflict list nor the source-span interval counts them (they
 *  are reported as review items instead). */
export function visionOnlyLabelsSetAside(page: RegisteredPageEvidence, solution: SourceScaleSolution | null): Set<number> {
  const aside = new Set<number>();
  if (!solution) return aside;
  const outvoted = solution.evidence.length >= OUTVOTE_MIN_SUPPORT;
  for (const conflict of scaleDimensionConflicts(page, solution, new Set())) {
    if (outvoted || page.semantics.dimensionLabels[conflict.labelIndex]?.unpaired) aside.add(conflict.labelIndex);
  }
  return aside;
}

const unpairedLabelIndexes = (page: RegisteredPageEvidence) =>
  new Set(page.semantics.dimensionLabels.flatMap((label, index) => label.unpaired ? [index] : []));

/** Unpaired labels whose hint-found span does not sit on the candidate scale to the tolerance: joining a cluster at
 *  a few per cent off would sink it on the residual rule, so they are left out rather than argued with. */
function unpairedLabelsOffScale(page: RegisteredPageEvidence, solution: SourceScaleSolution): number[] {
  return [...unpairedLabelIndexes(page)].filter((labelIndex) => {
    const observed = page.dimensionSpanEvidence?.observations.find((entry) => entry.labelIndex === labelIndex);
    if (!observed?.start || !observed.end || observed.status !== "source_supported") return false;
    const length = Math.hypot(observed.end.x - observed.start.x, observed.end.y - observed.start.y);
    const expected = observed.valueMm / solution.millimetresPerPixel;
    return Math.abs(expected - length) > Math.min(TOLERANCE_PX, 0.01 * expected);
  });
}

/** The inspection with the labels that may not veto it left out. Paired labels (two stops measured by the vectorizer,
 *  or hints from another reader) decide the scale on their own first, exactly as before unpaired labels existed;
 *  unpaired labels that agree with that answer are then let in to strengthen it, and the ones that disagree are set
 *  aside as review items. Only when the paired labels reach no answer do the unpaired ones get to find one, again
 *  with the disagreeing ones set aside. */
function inspectWithoutVetoes(page: RegisteredPageEvidence) {
  const unpaired = unpairedLabelIndexes(page);
  const pairedOnly = inspectScaleFromRegisteredEvidence(page, unpaired);
  const everything = unpaired.size ? inspectScaleFromRegisteredEvidence(page) : pairedOnly;
  const seed = pairedOnly.solution ? pairedOnly : everything;
  const candidate = seed.solution;
  if (!candidate) return { setAside: new Set<number>(), inspection: everything };
  const setAside = new Set([...visionOnlyLabelsSetAside(page, candidate), ...unpairedLabelsOffScale(page, candidate)]);
  const widened = setAside.size || seed === pairedOnly ? inspectScaleFromRegisteredEvidence(page, setAside) : everything;
  // The widened answer stands only if it is the same answer with more behind it: a nudge of the median that tips a
  // paired label over the conflict tolerance would turn added support into a veto, so the seed is kept instead.
  const kept = widened.solution && Math.abs(widened.solution.millimetresPerPixel / candidate.millimetresPerPixel - 1) <= 0.01 &&
    widened.solution.dimensionCount >= candidate.dimensionCount &&
    scaleDimensionConflicts(page, widened.solution, setAside).length <= scaleDimensionConflicts(page, candidate, setAside).length;
  return { setAside, inspection: kept ? widened : seed };
}

function noteLabelsSetAside(page: RegisteredPageEvidence, candidate: SourceScaleSolution | null, setAside: Set<number>) {
  if (!setAside.size || !candidate) return;
  const labels = page.semantics.dimensionLabels;
  const values = (indexes: number[]) => indexes.map((index) => `${labels[index].valueMm} mm`).join(", ");
  const unpaired = [...setAside].filter((index) => labels[index].unpaired), outvoted = [...setAside].filter((index) => !labels[index].unpaired);
  const notes = [
    ...(outvoted.length ? [`${SET_ASIDE_PREFIX} ${values(outvoted)} disagreeing with ${candidate.evidence.length} locally confirmed spans (a misread digit, or the tick of the dimension next to it). Not used for the scale; check the printed number in the review.`] : []),
    ...(unpaired.length ? [`${SET_ASIDE_PREFIX} ${values(unpaired)} read on the plan but not matched to two stops, disagreeing with ${candidate.evidence.length} locally confirmed spans. Not used for the scale; check the printed number in the review.`] : []),
  ];
  for (const note of notes) if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
}

/** Cross-check nearby centered dimension spans independently of the winning ratio cluster. */
export function scaleDimensionConflicts(page: RegisteredPageEvidence, solution: SourceScaleSolution, setAside?: Set<number>) {
  const aside = setAside ?? visionOnlyLabelsSetAside(page, solution);
  return page.semantics.dimensionLabels.flatMap((label, labelIndex): DimensionConflict[] => {
    if (label.confidence < 0.45 || aside.has(labelIndex)) return [];
    const observed = page.dimensionSpanEvidence?.observations.find((entry) => entry.labelIndex === labelIndex && entry.valueMm === label.valueMm);
    if (observed) {
      if (observed.status !== "source_supported" || !observed.start || !observed.end) return [];
      const length = Math.hypot(observed.end.x - observed.start.x, observed.end.y - observed.start.y);
      const residualPx = Math.abs(label.valueMm / solution.millimetresPerPixel - length);
      return residualPx > TOLERANCE_PX ? [{ valueMm: label.valueMm, residualPx, segmentId: `raster-ticks:${page.pageNumber}:${labelIndex}`,
        start: observed.start, end: observed.end, observedLengthPx: length, orientation: label.orientation,
        rawText: label.rawText ?? null, endpointStatus: "source_supported" as const, labelIndex }] : [];
    }
    const spans = page.vectorSegments.map((segment) => centeredSpan(segment, label, page))
      .filter((span) => span !== null).sort((a, b) => a.distance - b.distance);
    const nearest = spans[0];
    if (!nearest) return [];
    // Two equally plausible, differently sized hosts require guided registration,
    // and cannot establish an independent contradiction by themselves.
    if (spans.slice(1).some((span) => span.distance <= nearest.distance + 3 && Math.abs(span.length - nearest.length) > TOLERANCE_PX)) return [];
    const residualPx = Math.abs(label.valueMm / solution.millimetresPerPixel - nearest.length);
    return residualPx > TOLERANCE_PX ? [{ valueMm: label.valueMm, residualPx, segmentId: nearest.segment.id,
      start: nearest.segment.start, end: nearest.segment.end, observedLengthPx: nearest.length,
      orientation: label.orientation, rawText: label.rawText ?? null, endpointStatus: "unverified" as const, labelIndex }] : [];
  });
}

function sourceSupportedScaleInterval(page: RegisteredPageEvidence, setAside: Set<number> = new Set()) {
  const sourceSpanIntervals = (page.dimensionSpanEvidence?.observations ?? []).flatMap((entry) => {
    if (entry.status !== "source_supported" || !entry.start || !entry.end || setAside.has(entry.labelIndex)) return [];
    const length = Math.hypot(entry.end.x - entry.start.x, entry.end.y - entry.start.y);
    return [{ valueMm: entry.valueMm, start: entry.start, end: entry.end,
      minimumMmPerPx: entry.valueMm / (length + TOLERANCE_PX), maximumMmPerPx: entry.valueMm / (length - TOLERANCE_PX) }];
  });
  const minimum = Math.max(...sourceSpanIntervals.map((span) => span.minimumMmPerPx));
  const maximum = Math.min(...sourceSpanIntervals.map((span) => span.maximumMmPerPx));
  return sourceSpanIntervals.length ? { minimum, maximum, feasible: minimum <= maximum, spans: sourceSpanIntervals } : null;
}

export function diagnoseSourceScale(page: RegisteredPageEvidence) {
  const { setAside, inspection: { solution: candidate, ...inspection } } = inspectWithoutVetoes(page);
  const conflicts = candidate ? scaleDimensionConflicts(page, candidate, setAside) : [];
  const sourceSpanScaleInterval = sourceSupportedScaleInterval(page, setAside);
  noteLabelsSetAside(page, candidate, setAside);
  if (sourceSpanScaleInterval && !sourceSpanScaleInterval.feasible) {
    const note = `${REVIEW_PREFIX} Raster-supported tick-to-tick dimensions do not share a common scale within ${TOLERANCE_PX} source pixels. Review the highlighted printed spans before selecting a calibration. Scale remains unconfirmed.`;
    if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
  }
  if (inspection.reason === "competing_clusters") {
    const note = `${REVIEW_PREFIX} Several locally supported scale candidates disagree. Their spans have unverified endpoints. Review the printed numbers and full dimension spans; scale remains unconfirmed.`;
    if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
  }
  if (conflicts.length) {
    const support = conflicts.every((item) => item.endpointStatus === "source_supported")
      ? "These tick-to-tick spans have raster line support; review their printed values and highlighted endpoints."
      : "These automatically associated spans have unverified endpoints. Check the printed numbers, endpoints and orientations before judging source distortion.";
    const note = `${REVIEW_PREFIX} ${conflicts.map((item) => `${item.valueMm} mm differs by ${item.residualPx.toFixed(1)} source pixels`).join("; ")}. ${support} Scale remains unconfirmed.`;
    if (!page.semantics.notes.includes(note)) page.semantics.notes.push(note);
  }
  return { status: !candidate ? "no_supported_cluster" as const : conflicts.length || sourceSpanScaleInterval?.feasible === false ? "rejected_associations" as const : "accepted" as const,
    candidate, conflicts, setAsideLabelIndexes: [...setAside], tolerancePx: TOLERANCE_PX, sourceDimensions: page.dimensionSpanEvidence ?? null, sourceSpanScaleInterval, ...inspection };
}

export function solveCrossCheckedScale(page: RegisteredPageEvidence): SourceScaleSolution | null {
  const diagnosis = diagnoseSourceScale(page);
  return diagnosis.status === "accepted" ? diagnosis.candidate : null;
}

export function automaticScaleReviewMessage(page: RegisteredPageEvidence | undefined) {
  return page?.semantics.notes.findLast((note) => note.startsWith(REVIEW_PREFIX) || note.startsWith("Independent dimension conflict:")) ??
    "Confirm one known distance. At least two printed dimensions must agree before automatic geometry can be trusted.";
}
