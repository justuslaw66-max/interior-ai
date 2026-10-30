import { getObstacleFreeSpans } from "@/lib/built-in-free-span";

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

/** The stretches of [startMm, endMm] clear of the openings. */
function segmentsBetweenOpenings(startMm: number, endMm: number, blocked: Array<{ startMm: number; endMm: number }>): CabinetFitSegment[] {
  const segments: CabinetFitSegment[] = [];
  const push = (from: number, to: number) => segments.push({ startMm: from, endMm: to, widthMm: to - from, centerOffsetMm: from + (to - from) / 2 });
  let cursorMm = startMm;
  blocked.forEach((interval) => {
    if (interval.endMm <= startMm || interval.startMm >= endMm) return;
    if (interval.startMm > cursorMm) push(cursorMm, interval.startMm);
    cursorMm = Math.max(cursorMm, interval.endMm);
  });
  if (cursorMm < endMm) push(cursorMm, endMm);
  return segments;
}

/** The allowance at each end of a run: a run standing on the floor also keeps clear of the end walls' baseboards; a wall
 * cabinet hangs above them. */
function getEndClearancesMm(space: CabinetHostSpace, assemblyBottomMm: number): [number, number] {
  const onFloor = !(assemblyBottomMm > 0), segment = space.wallSegment;
  const baseboard = (value: number | undefined) => (onFloor ? Math.max(0, value ?? 0) : 0);
  return [
    Math.max(0, space.installationClearanceLeftMm ?? 0) + baseboard(segment?.startBaseboardClearanceMm),
    Math.max(0, space.installationClearanceRightMm ?? 0) + baseboard(segment?.endBaseboardClearanceMm),
  ];
}

/**
 * The stretches of a host a run can fill. On a face with obstacles (another wall at a corner, a panel, a column, the face's
 * two ends: `wallSegment.obstacles`, lib/room-built-in-region.ts), a run `assemblyDepthMm` deep standing out from the face by
 * the baseboard keeps the end allowance from each, measured from whatever its nearest point meets, and on the floor a
 * baseboard's depth more.
 */
export function getCabinetAvailableSegments(
  space: CabinetHostSpace,
  assemblyHeightMm: number,
  assemblyBottomMm = 0,
  assemblyDepthMm = 0
): CabinetFitSegment[] {
  if (!Number.isFinite(space.availableWidthMm) || space.availableWidthMm <= 0) return [];
  const halfWidthMm = space.availableWidthMm / 2;
  const depthMm = Number.isFinite(assemblyDepthMm) ? Math.max(0, assemblyDepthMm) : 0;
  const segment = space.wallSegment;
  const [startClearanceMm, endClearanceMm] = getEndClearancesMm(space, assemblyBottomMm);
  // With obstacles, the allowance is kept from them (the face's two ends are among them), not from the host's ends.
  const obstacles = segment?.obstacles ?? [];
  const startBoundaryMm = -halfWidthMm + (obstacles.length ? 0 : startClearanceMm);
  const endBoundaryMm = halfWidthMm - (obstacles.length ? 0 : endClearanceMm);
  if (endBoundaryMm <= startBoundaryMm) return [];
  const backMm = Math.max(0, space.baseboardOffsetMm ?? 0);
  const spans = obstacles.length
    ? getObstacleFreeSpans(obstacles, backMm, backMm + depthMm, Math.max(startClearanceMm, endClearanceMm), startBoundaryMm, endBoundaryMm)
    : [[startBoundaryMm, endBoundaryMm] as [number, number]];

  const blockedIntervals = mergeIntervals(
    space.openings
      .filter((opening) => openingBlocksHeight(opening, assemblyHeightMm, assemblyBottomMm))
      .map((opening) => ({ startMm: opening.offsetMm - opening.widthMm / 2, endMm: opening.offsetMm + opening.widthMm / 2 }))
      .filter((interval) => interval.endMm > interval.startMm)
  );
  return spans.flatMap(([from, to]) => segmentsBetweenOpenings(from, to, blockedIntervals));
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
