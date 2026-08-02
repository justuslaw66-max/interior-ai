export type FloorPlanValidationPoint = {
  xMm: number;
  zMm: number;
};

export type FloorPlanValidationLineSegment = {
  wallIndex: number;
  start: FloorPlanValidationPoint;
  end: FloorPlanValidationPoint;
};

export type FloorPlanValidationCanonicalWallSegment = FloorPlanValidationLineSegment & {
  startVertexId: string;
  endVertexId: string;
};

export const FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS = Object.freeze({
  maxLineWallsPerFloor: 12_000,
  maxIntersectionPairChecks: 100_000,
});

type SweepAxis = "x" | "z";

type BoundedSegment = FloorPlanValidationLineSegment & {
  ordinal: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};

type HeapEntry = {
  maximum: number;
  ordinal: number;
};

export type PotentialLineIntersectionPairs = {
  pairs: Array<[number, number]>;
  pairChecks: number;
  sweepAxis: SweepAxis;
  budgetExceeded: boolean;
};

export type FloorPlanWallIntersectionProblem = {
  firstWallIndex: number;
  secondWallIndex: number;
  kind: "crossing" | "overlapping";
};

export type FloorPlanWallIntersectionResult = PotentialLineIntersectionPairs & {
  problems: FloorPlanWallIntersectionProblem[];
};

class MinimumHeap {
  private readonly entries: HeapEntry[] = [];

  get size(): number {
    return this.entries.length;
  }

  peek(): HeapEntry | undefined {
    return this.entries[0];
  }

  push(entry: HeapEntry): void {
    const entries = this.entries;
    entries.push(entry);
    let index = entries.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareHeapEntry(entries[parent], entry) <= 0) break;
      entries[index] = entries[parent];
      index = parent;
    }
    entries[index] = entry;
  }

  pop(): HeapEntry | undefined {
    const entries = this.entries;
    const first = entries[0];
    const last = entries.pop();
    if (!first || !last || entries.length === 0) return first;

    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= entries.length) break;
      const child = right < entries.length && compareHeapEntry(entries[right], entries[left]) < 0
        ? right
        : left;
      if (compareHeapEntry(entries[child], last) >= 0) break;
      entries[index] = entries[child];
      index = child;
    }
    entries[index] = last;
    return first;
  }
}

function compareHeapEntry(left: HeapEntry, right: HeapEntry): number {
  return left.maximum - right.maximum || left.ordinal - right.ordinal;
}

function boundsFor(segment: FloorPlanValidationLineSegment, ordinal: number): BoundedSegment {
  return {
    ...segment,
    ordinal,
    minX: Math.min(segment.start.xMm, segment.end.xMm),
    maxX: Math.max(segment.start.xMm, segment.end.xMm),
    minZ: Math.min(segment.start.zMm, segment.end.zMm),
    maxZ: Math.max(segment.start.zMm, segment.end.zMm),
  };
}

function minimum(segment: BoundedSegment, axis: SweepAxis): number {
  return axis === "x" ? segment.minX : segment.minZ;
}

function maximum(segment: BoundedSegment, axis: SweepAxis): number {
  return axis === "x" ? segment.maxX : segment.maxZ;
}

function intervalsOverlap(
  first: BoundedSegment,
  second: BoundedSegment,
  axis: SweepAxis
): boolean {
  return minimum(first, axis) <= maximum(second, axis) &&
    minimum(second, axis) <= maximum(first, axis);
}

function sortForSweep(segments: BoundedSegment[], axis: SweepAxis): BoundedSegment[] {
  return segments.slice().sort((left, right) =>
    minimum(left, axis) - minimum(right, axis) ||
    maximum(left, axis) - maximum(right, axis) ||
    left.wallIndex - right.wallIndex ||
    left.ordinal - right.ordinal
  );
}

function countAxisOverlaps(segments: BoundedSegment[], axis: SweepAxis): number {
  const activeMaxima = new MinimumHeap();
  let overlaps = 0;
  for (const segment of sortForSweep(segments, axis)) {
    const currentMinimum = minimum(segment, axis);
    while (activeMaxima.peek() && activeMaxima.peek()!.maximum < currentMinimum) {
      activeMaxima.pop();
    }
    overlaps += activeMaxima.size;
    activeMaxima.push({ maximum: maximum(segment, axis), ordinal: segment.ordinal });
  }
  return overlaps;
}

function isFiniteSegment(segment: FloorPlanValidationLineSegment): boolean {
  return Number.isFinite(segment.start.xMm) &&
    Number.isFinite(segment.start.zMm) &&
    Number.isFinite(segment.end.xMm) &&
    Number.isFinite(segment.end.zMm);
}

function orientation(
  first: FloorPlanValidationPoint,
  second: FloorPlanValidationPoint,
  third: FloorPlanValidationPoint
): number {
  return (second.xMm - first.xMm) * (third.zMm - first.zMm) -
    (second.zMm - first.zMm) * (third.xMm - first.xMm);
}

export function floorPlanPointOnLineSegment(
  point: FloorPlanValidationPoint,
  start: FloorPlanValidationPoint,
  end: FloorPlanValidationPoint
): boolean {
  return orientation(start, end, point) === 0 &&
    point.xMm >= Math.min(start.xMm, end.xMm) &&
    point.xMm <= Math.max(start.xMm, end.xMm) &&
    point.zMm >= Math.min(start.zMm, end.zMm) &&
    point.zMm <= Math.max(start.zMm, end.zMm);
}

export function floorPlanLineSegmentsIntersect(
  firstStart: FloorPlanValidationPoint,
  firstEnd: FloorPlanValidationPoint,
  secondStart: FloorPlanValidationPoint,
  secondEnd: FloorPlanValidationPoint
): boolean {
  const firstA = orientation(firstStart, firstEnd, secondStart);
  const firstB = orientation(firstStart, firstEnd, secondEnd);
  const secondA = orientation(secondStart, secondEnd, firstStart);
  const secondB = orientation(secondStart, secondEnd, firstEnd);
  if ((firstA > 0) !== (firstB > 0) && (secondA > 0) !== (secondB > 0)) return true;
  return (
    (firstA === 0 && floorPlanPointOnLineSegment(secondStart, firstStart, firstEnd)) ||
    (firstB === 0 && floorPlanPointOnLineSegment(secondEnd, firstStart, firstEnd)) ||
    (secondA === 0 && floorPlanPointOnLineSegment(firstStart, secondStart, secondEnd)) ||
    (secondB === 0 && floorPlanPointOnLineSegment(firstEnd, secondStart, secondEnd))
  );
}

function collinearOverlapLength(
  firstStart: FloorPlanValidationPoint,
  firstEnd: FloorPlanValidationPoint,
  secondStart: FloorPlanValidationPoint,
  secondEnd: FloorPlanValidationPoint
): number {
  if (
    orientation(firstStart, firstEnd, secondStart) !== 0 ||
    orientation(firstStart, firstEnd, secondEnd) !== 0
  ) {
    return 0;
  }
  const useX = Math.abs(firstEnd.xMm - firstStart.xMm) >=
    Math.abs(firstEnd.zMm - firstStart.zMm);
  const first = useX
    ? [firstStart.xMm, firstEnd.xMm]
    : [firstStart.zMm, firstEnd.zMm];
  const second = useX
    ? [secondStart.xMm, secondEnd.xMm]
    : [secondStart.zMm, secondEnd.zMm];
  return Math.max(
    0,
    Math.min(Math.max(...first), Math.max(...second)) -
      Math.max(Math.min(...first), Math.min(...second))
  );
}

/**
 * Returns the deterministic AABB broad-phase pairs that may intersect.
 *
 * The sweep axis is selected from the input's interval-overlap counts. This
 * avoids the classic quadratic case where many parallel CAD walls share a
 * long range on one axis but are separated on the other. Exact segment
 * predicates remain in the compiler, so every document within the declared
 * work budget receives the same validation result as exhaustive pair scans.
 */
export function findPotentialLineIntersectionPairs(
  input: FloorPlanValidationLineSegment[],
  options: { maxPairChecks?: number } = {}
): PotentialLineIntersectionPairs {
  const maxPairChecks = options.maxPairChecks ??
    FLOOR_PLAN_GEOMETRY_VALIDATION_LIMITS.maxIntersectionPairChecks;
  if (!Number.isSafeInteger(maxPairChecks) || maxPairChecks < 0) {
    throw new RangeError("maxPairChecks must be a non-negative safe integer");
  }

  const segments = input.filter(isFiniteSegment).map(boundsFor);
  const xOverlaps = countAxisOverlaps(segments, "x");
  const zOverlaps = countAxisOverlaps(segments, "z");
  const sweepAxis: SweepAxis = xOverlaps <= zOverlaps ? "x" : "z";
  const perpendicularAxis: SweepAxis = sweepAxis === "x" ? "z" : "x";
  const sorted = sortForSweep(segments, sweepAxis);
  const byOrdinal = new Map(segments.map((segment) => [segment.ordinal, segment]));
  const activeOrdinals = new Set<number>();
  const activeMaxima = new MinimumHeap();
  const pairs: Array<[number, number]> = [];
  let pairChecks = 0;

  for (const segment of sorted) {
    const currentMinimum = minimum(segment, sweepAxis);
    while (activeMaxima.peek() && activeMaxima.peek()!.maximum < currentMinimum) {
      const expired = activeMaxima.pop();
      if (expired) activeOrdinals.delete(expired.ordinal);
    }

    for (const ordinal of activeOrdinals) {
      if (pairChecks >= maxPairChecks) {
        return { pairs: [], pairChecks, sweepAxis, budgetExceeded: true };
      }
      pairChecks += 1;
      const other = byOrdinal.get(ordinal);
      if (!other || !intervalsOverlap(segment, other, perpendicularAxis)) continue;
      pairs.push(segment.wallIndex < other.wallIndex
        ? [segment.wallIndex, other.wallIndex]
        : [other.wallIndex, segment.wallIndex]);
    }

    activeOrdinals.add(segment.ordinal);
    activeMaxima.push({
      maximum: maximum(segment, sweepAxis),
      ordinal: segment.ordinal,
    });
  }

  pairs.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
  return { pairs, pairChecks, sweepAxis, budgetExceeded: false };
}

export function findCanonicalWallIntersectionProblems(
  segments: FloorPlanValidationCanonicalWallSegment[],
  options: { maxPairChecks?: number } = {}
): FloorPlanWallIntersectionResult {
  const broadPhase = findPotentialLineIntersectionPairs(segments, options);
  if (broadPhase.budgetExceeded) return { ...broadPhase, problems: [] };

  const byWallIndex = new Map(segments.map((segment) => [segment.wallIndex, segment]));
  const problems: FloorPlanWallIntersectionProblem[] = [];
  for (const [firstWallIndex, secondWallIndex] of broadPhase.pairs) {
    const first = byWallIndex.get(firstWallIndex);
    const second = byWallIndex.get(secondWallIndex);
    if (!first || !second || !floorPlanLineSegmentsIntersect(
      first.start,
      first.end,
      second.start,
      second.end
    )) continue;
    const sharedVertex = first.startVertexId === second.startVertexId ||
      first.startVertexId === second.endVertexId ||
      first.endVertexId === second.startVertexId ||
      first.endVertexId === second.endVertexId;
    const overlapLength = collinearOverlapLength(
      first.start,
      first.end,
      second.start,
      second.end
    );
    if (!sharedVertex || overlapLength > 0.5) {
      problems.push({
        firstWallIndex,
        secondWallIndex,
        kind: overlapLength > 0.5 ? "overlapping" : "crossing",
      });
    }
  }
  return { ...broadPhase, problems };
}
