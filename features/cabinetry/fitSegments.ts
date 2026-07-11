import type {
  CabinetFitAlignment,
  CabinetFitSegment,
  CabinetHostOpening,
  CabinetHostSpace,
} from "./types";

function openingBlocksHeight(
  opening: CabinetHostOpening,
  assemblyHeightMm: number,
  assemblyBottomMm: number
): boolean {
  if (opening.kind === "outlet") return false;
  const bottomMm = opening.bottomMm ?? 0;
  const topMm = bottomMm + (opening.heightMm ?? Number.POSITIVE_INFINITY);
  const assemblyTopMm = assemblyBottomMm + assemblyHeightMm;
  return bottomMm < assemblyTopMm && topMm > assemblyBottomMm;
}

function mergeIntervals(intervals: Array<{ startMm: number; endMm: number }>) {
  const sorted = [...intervals].sort((left, right) => left.startMm - right.startMm);
  const merged: Array<{ startMm: number; endMm: number }> = [];
  sorted.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.startMm > previous.endMm) {
      merged.push({ ...interval });
      return;
    }
    previous.endMm = Math.max(previous.endMm, interval.endMm);
  });
  return merged;
}

export function getCabinetAvailableSegments(
  space: CabinetHostSpace,
  assemblyHeightMm: number,
  assemblyBottomMm = 0
): CabinetFitSegment[] {
  if (!Number.isFinite(space.availableWidthMm) || space.availableWidthMm <= 0) return [];
  const halfWidthMm = space.availableWidthMm / 2;
  const startBoundaryMm =
    -halfWidthMm + Math.max(0, space.installationClearanceLeftMm ?? 0);
  const endBoundaryMm =
    halfWidthMm - Math.max(0, space.installationClearanceRightMm ?? 0);
  if (endBoundaryMm <= startBoundaryMm) return [];

  const blockedIntervals = mergeIntervals(
    space.openings
      .filter((opening) =>
        openingBlocksHeight(opening, assemblyHeightMm, assemblyBottomMm)
      )
      .map((opening) => ({
        startMm: Math.max(startBoundaryMm, opening.offsetMm - opening.widthMm / 2),
        endMm: Math.min(endBoundaryMm, opening.offsetMm + opening.widthMm / 2),
      }))
      .filter((interval) => interval.endMm > interval.startMm)
  );

  const segments: CabinetFitSegment[] = [];
  let cursorMm = startBoundaryMm;
  blockedIntervals.forEach((interval) => {
    if (interval.startMm > cursorMm) {
      const widthMm = interval.startMm - cursorMm;
      segments.push({
        startMm: cursorMm,
        endMm: interval.startMm,
        widthMm,
        centerOffsetMm: cursorMm + widthMm / 2,
      });
    }
    cursorMm = Math.max(cursorMm, interval.endMm);
  });
  if (cursorMm < endBoundaryMm) {
    const widthMm = endBoundaryMm - cursorMm;
    segments.push({
      startMm: cursorMm,
      endMm: endBoundaryMm,
      widthMm,
      centerOffsetMm: cursorMm + widthMm / 2,
    });
  }
  return segments;
}

export function chooseCabinetFitSegment(
  segments: CabinetFitSegment[],
  alignment: CabinetFitAlignment
): CabinetFitSegment | null {
  if (!segments.length) return null;
  if (alignment === "left") {
    return [...segments].sort((left, right) => left.startMm - right.startMm)[0];
  }
  if (alignment === "right") {
    return [...segments].sort((left, right) => right.endMm - left.endMm)[0];
  }
  return [...segments].sort((left, right) => {
    if (Math.abs(right.widthMm - left.widthMm) > 1) return right.widthMm - left.widthMm;
    return Math.abs(left.centerOffsetMm) - Math.abs(right.centerOffsetMm);
  })[0];
}
