import {
  pointInPolygon,
  type RegisteredPageEvidence,
  type RegisteredRoomBoundary,
  type SemanticBoundingBox,
  type SemanticFixtureSymbol,
  type SemanticRoomBoundary,
  type SourcePointPx,
  type SourceVectorSegment,
} from "./deterministic-evidence";
import { assessRegisteredRoomCoverage } from "./room-topology-completeness";

type EdgeSupport = {
  shiftedStart: SourcePointPx;
  shiftedEnd: SourcePointPx;
  sourceSegmentIds: string[];
  sourcePathIds: string[];
  medianResidualPx: number;
  maxResidualPx: number;
  coverageRatio: number;
};

export type VisionGuidedTopologyResult = {
  rooms: RegisteredRoomBoundary[];
  complete: boolean;
  blockers: string[];
  diagnostics: {
    proposalCount: number;
    registeredRoomCount: number;
    rejectedProposalCount: number;
    rejectionCounts: {
      invalidProposal: number;
      outsidePlanRegion: number;
      unsupportedEdge: number;
      unsnappableCorner: number;
      invalidPolygon: number;
      ambiguousLabel: number;
      incompatibleFixtureCluster: number;
      excessiveResidual: number;
    };
    medianSourceDeviationPx: number;
    maxSourceDeviationPx: number;
  };
};

const MIN_PROPOSAL_CONFIDENCE = 0.5;
const MIN_SEGMENT_LENGTH_PX = 8;
const MIN_EDGE_LENGTH_PX = 14;
const MAX_POLYGON_POINTS = 24;
const OPEN_PLAN_ROOM_TYPES = new Set(["living", "dining", "kitchen"]);
const SANITARY_FIXTURE_KINDS = new Set<
  SemanticFixtureSymbol["kind"]
>(["toilet", "bathtub", "shower", "basin"]);

function pointDistance(left: SourcePointPx, right: SourcePointPx) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function inferRoomIdentityFromFixtures(
  fixtures: readonly SemanticFixtureSymbol[]
): {
  label: "Bathroom";
  roomType: "toilet";
  confidence: number;
} | null {
  const supported = fixtures.filter(
    (fixture) =>
      fixture.confidence >= MIN_PROPOSAL_CONFIDENCE &&
      SANITARY_FIXTURE_KINDS.has(fixture.kind)
  );
  const kinds = new Set(supported.map((fixture) => fixture.kind));
  const hasToilet = kinds.has("toilet");
  const hasBathing = kinds.has("bathtub") || kinds.has("shower");
  const hasBasin = kinds.has("basin");
  if (!(hasToilet && (hasBathing || hasBasin)) && !(hasBathing && hasBasin)) {
    return null;
  }
  return {
    label: "Bathroom",
    roomType: "toilet",
    confidence: Math.min(...supported.map((fixture) => fixture.confidence)),
  };
}

function pointInBox(point: SourcePointPx, box: SemanticBoundingBox, page: RegisteredPageEvidence) {
  const padding = Math.max(2, Math.hypot(page.widthPx, page.heightPx) * 0.001);
  return (
    point.x >= box.leftRatio * page.widthPx - padding &&
    point.x <= box.rightRatio * page.widthPx + padding &&
    point.y >= box.topRatio * page.heightPx - padding &&
    point.y <= box.bottomRatio * page.heightPx + padding
  );
}

function segmentMidpoint(segment: SourceVectorSegment): SourcePointPx {
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

function sourceSegmentsForWalls(page: RegisteredPageEvidence) {
  const semanticTextBoxes = [
    ...page.semantics.roomLabels.flatMap((label) => (label.bbox ? [label.bbox] : [])),
    ...page.semantics.dimensionLabels.flatMap((label) =>
      label.bbox ? [label.bbox] : []
    ),
  ];
  return page.vectorSegments.filter((segment) => {
    if (pointDistance(segment.start, segment.end) < MIN_SEGMENT_LENGTH_PX) return false;
    if ((segment.confidence ?? 1) < 0.55) return false;
    const midpoint = segmentMidpoint(segment);
    if (semanticTextBoxes.some((box) => pointInBox(midpoint, box, page))) return false;
    return !page.text.some((text) => {
      const box = {
        leftRatio: (text.center.x - text.widthPx / 2) / page.widthPx,
        topRatio: (text.center.y - text.heightPx / 2) / page.heightPx,
        rightRatio: (text.center.x + text.widthPx / 2) / page.widthPx,
        bottomRatio: (text.center.y + text.heightPx / 2) / page.heightPx,
      };
      return pointInBox(midpoint, box, page);
    });
  });
}

function median(values: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function intervalCoverage(intervals: Array<[number, number]>, length: number) {
  const sorted = intervals
    .map(([start, end]) => [
      Math.max(0, Math.min(length, Math.min(start, end))),
      Math.max(0, Math.min(length, Math.max(start, end))),
    ] as [number, number])
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0]);
  if (!sorted.length) return 0;
  let covered = 0;
  let [start, end] = sorted[0];
  for (const [nextStart, nextEnd] of sorted.slice(1)) {
    if (nextStart <= end + 2) {
      end = Math.max(end, nextEnd);
      continue;
    }
    covered += end - start;
    [start, end] = [nextStart, nextEnd];
  }
  return (covered + end - start) / Math.max(1, length);
}

function bathroomFixtureClusters(page: RegisteredPageEvidence) {
  const fixtures = (page.semantics.fixtureSymbols ?? []).filter(
    (fixture) =>
      fixture.confidence >= MIN_PROPOSAL_CONFIDENCE &&
      SANITARY_FIXTURE_KINDS.has(fixture.kind)
  );
  const diagonal = Math.hypot(page.widthPx, page.heightPx);
  const maximumClusterDistance = diagonal * 0.16;
  const visited = new Set<number>();
  const clusters: SemanticFixtureSymbol[][] = [];
  const fixturePoint = (fixture: SemanticFixtureSymbol) => ({
    x: fixture.centerXRatio * page.widthPx,
    y: fixture.centerYRatio * page.heightPx,
  });
  for (let fixtureIndex = 0; fixtureIndex < fixtures.length; fixtureIndex += 1) {
    if (visited.has(fixtureIndex)) continue;
    const queue = [fixtureIndex];
    const cluster: SemanticFixtureSymbol[] = [];
    visited.add(fixtureIndex);
    while (queue.length) {
      const currentIndex = queue.shift()!;
      const current = fixtures[currentIndex];
      cluster.push(current);
      for (
        let candidateIndex = 0;
        candidateIndex < fixtures.length;
        candidateIndex += 1
      ) {
        if (visited.has(candidateIndex)) continue;
        if (
          pointDistance(
            fixturePoint(current),
            fixturePoint(fixtures[candidateIndex])
          ) <= maximumClusterDistance
        ) {
          visited.add(candidateIndex);
          queue.push(candidateIndex);
        }
      }
    }
    if (inferRoomIdentityFromFixtures(cluster)) clusters.push(cluster);
  }
  return clusters;
}

function fixtureBoundsPx(
  page: RegisteredPageEvidence,
  fixtures: readonly SemanticFixtureSymbol[]
) {
  const fallbackHalfSize = Math.max(
    4,
    Math.hypot(page.widthPx, page.heightPx) * 0.006
  );
  const boxes = fixtures.map((fixture) =>
    fixture.bbox
      ? {
          left: fixture.bbox.leftRatio * page.widthPx,
          top: fixture.bbox.topRatio * page.heightPx,
          right: fixture.bbox.rightRatio * page.widthPx,
          bottom: fixture.bbox.bottomRatio * page.heightPx,
        }
      : {
          left: fixture.centerXRatio * page.widthPx - fallbackHalfSize,
          top: fixture.centerYRatio * page.heightPx - fallbackHalfSize,
          right: fixture.centerXRatio * page.widthPx + fallbackHalfSize,
          bottom: fixture.centerYRatio * page.heightPx + fallbackHalfSize,
        }
  );
  return {
    left: Math.min(...boxes.map((box) => box.left)),
    top: Math.min(...boxes.map((box) => box.top)),
    right: Math.max(...boxes.map((box) => box.right)),
    bottom: Math.max(...boxes.map((box) => box.bottom)),
  };
}

function fixtureSeededRoomBoundaries(
  page: RegisteredPageEvidence
): SemanticRoomBoundary[] {
  const sourceSegments = sourceSegmentsForWalls(page);
  const diagonal = Math.hypot(page.widthPx, page.heightPx);
  const minimumSegmentLength = Math.max(18, diagonal * 0.025);
  const coordinateTolerance = Math.max(2, Math.min(5, diagonal * 0.0025));
  const pointInsideFixtureBox = (
    point: SourcePointPx,
    fixtures: readonly SemanticFixtureSymbol[]
  ) =>
    fixtures.some((fixture) => {
      if (!fixture.bbox) return false;
      const padding = Math.max(1, diagonal * 0.001);
      return (
        point.x >= fixture.bbox.leftRatio * page.widthPx - padding &&
        point.x <= fixture.bbox.rightRatio * page.widthPx + padding &&
        point.y >= fixture.bbox.topRatio * page.heightPx - padding &&
        point.y <= fixture.bbox.bottomRatio * page.heightPx + padding
      );
    });
  const axisSegments = (
    fixtures: readonly SemanticFixtureSymbol[],
    orientation: "horizontal" | "vertical"
  ) =>
    sourceSegments.flatMap((segment) => {
      const dx = segment.end.x - segment.start.x;
      const dy = segment.end.y - segment.start.y;
      const length = Math.hypot(dx, dy);
      if (length < minimumSegmentLength) return [];
      const horizontal = Math.abs(dx) >= Math.abs(dy) * 4;
      const vertical = Math.abs(dy) >= Math.abs(dx) * 4;
      if (
        (orientation === "horizontal" && !horizontal) ||
        (orientation === "vertical" && !vertical)
      ) {
        return [];
      }
      const midpoint = segmentMidpoint(segment);
      if (pointInsideFixtureBox(midpoint, fixtures)) return [];
      return [
        {
          coordinate:
            orientation === "horizontal" ? midpoint.y : midpoint.x,
          strength: segment.strokeWidthPx,
          interval:
            orientation === "horizontal"
              ? ([segment.start.x, segment.end.x] as [number, number])
              : ([segment.start.y, segment.end.y] as [number, number]),
        },
      ];
    });
  const bestShellLine = (
    candidates: Array<{
      coordinate: number;
      strength: number;
      interval: [number, number];
    }>,
    side: "before" | "after",
    fixtureEdge: number,
    spanStart: number,
    spanEnd: number
  ) => {
    const spanLength = Math.max(1, spanEnd - spanStart);
    return candidates
      .filter((candidate) =>
        side === "before"
          ? candidate.coordinate < fixtureEdge - 1
          : candidate.coordinate > fixtureEdge + 1
      )
      .map((seed) => {
        const members = candidates.filter(
          (candidate) =>
            Math.abs(candidate.coordinate - seed.coordinate) <=
            coordinateTolerance
        );
        return {
          coordinate: median(members.map((member) => member.coordinate)),
          strength: Math.max(...members.map((member) => member.strength)),
          coverage: intervalCoverage(
            members.map(
              (member) =>
                [
                  member.interval[0] - spanStart,
                  member.interval[1] - spanStart,
                ] as [number, number]
            ),
            spanLength
          ),
          distance: Math.abs(seed.coordinate - fixtureEdge),
        };
      })
      .filter((candidate) => candidate.coverage >= 0.42)
      .sort(
        (left, right) =>
          right.coverage - left.coverage ||
          right.strength - left.strength ||
          left.distance - right.distance
      )[0]?.coordinate;
  };

  return bathroomFixtureClusters(page).flatMap((fixtures) => {
    const identity = inferRoomIdentityFromFixtures(fixtures);
    if (!identity) return [];
    const bounds = fixtureBoundsPx(page, fixtures);
    const centers = fixtures.map((fixture) => ({
      x: fixture.centerXRatio * page.widthPx,
      y: fixture.centerYRatio * page.heightPx,
    }));
    const centerBounds = {
      left: Math.min(...centers.map((point) => point.x)),
      top: Math.min(...centers.map((point) => point.y)),
      right: Math.max(...centers.map((point) => point.x)),
      bottom: Math.max(...centers.map((point) => point.y)),
    };
    const verticals = axisSegments(fixtures, "vertical");
    const horizontals = axisSegments(fixtures, "horizontal");
    const left = bestShellLine(
      verticals,
      "before",
      centerBounds.left,
      bounds.top,
      bounds.bottom
    );
    const right = bestShellLine(
      verticals,
      "after",
      centerBounds.right,
      bounds.top,
      bounds.bottom
    );
    const top = bestShellLine(
      horizontals,
      "before",
      centerBounds.top,
      bounds.left,
      bounds.right
    );
    const bottom = bestShellLine(
      horizontals,
      "after",
      centerBounds.bottom,
      bounds.left,
      bounds.right
    );
    if (
      left === undefined ||
      right === undefined ||
      top === undefined ||
      bottom === undefined
    ) {
      return [];
    }
    const width = right - left;
    const height = bottom - top;
    if (
      width < page.widthPx * 0.035 ||
      height < page.heightPx * 0.06 ||
      width > page.widthPx * 0.32 ||
      height > page.heightPx * 0.55
    ) {
      return [];
    }
    return [
      {
        label: identity.label,
        roomType: identity.roomType,
        confidence: identity.confidence,
        evidenceKind: "vision" as const,
        points: [
          { xRatio: left / page.widthPx, yRatio: top / page.heightPx },
          { xRatio: right / page.widthPx, yRatio: top / page.heightPx },
          { xRatio: right / page.widthPx, yRatio: bottom / page.heightPx },
          { xRatio: left / page.widthPx, yRatio: bottom / page.heightPx },
        ],
      },
    ];
  });
}

function openingCoverageAllowance(
  page: RegisteredPageEvidence,
  start: SourcePointPx,
  end: SourcePointPx
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (!length) return 0;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  let allowance = 0;
  for (const opening of page.semantics.openingSymbols.filter(
    (entry) => entry.confidence >= 0.5
  )) {
    const center = {
      x: opening.centerXRatio * page.widthPx,
      y: opening.centerYRatio * page.heightPx,
    };
    const relativeX = center.x - start.x;
    const relativeY = center.y - start.y;
    const projection = relativeX * ux + relativeY * uy;
    const perpendicular = Math.abs(relativeX * nx + relativeY * ny);
    if (
      projection < -length * 0.05 ||
      projection > length * 1.05 ||
      perpendicular > Math.max(10, Math.hypot(page.widthPx, page.heightPx) * 0.01)
    ) {
      continue;
    }
    const span =
      opening.spanStart && opening.spanEnd
        ? pointDistance(
            {
              x: opening.spanStart.xRatio * page.widthPx,
              y: opening.spanStart.yRatio * page.heightPx,
            },
            {
              x: opening.spanEnd.xRatio * page.widthPx,
              y: opening.spanEnd.yRatio * page.heightPx,
            }
          )
        : opening.bbox
          ? Math.max(
              (opening.bbox.rightRatio - opening.bbox.leftRatio) * page.widthPx,
              (opening.bbox.bottomRatio - opening.bbox.topRatio) * page.heightPx
            )
          : 0;
    allowance += Math.min(length * 0.28, span);
  }
  return Math.min(0.3, allowance / length);
}

function pathIdsForSegments(page: RegisteredPageEvidence) {
  const result = new Map<string, string[]>();
  for (const path of page.vectorPaths) {
    for (const segmentId of path.segmentIds) {
      const current = result.get(segmentId) ?? [];
      current.push(path.id);
      result.set(segmentId, current);
    }
  }
  return result;
}

function supportEdge(
  page: RegisteredPageEvidence,
  segments: readonly SourceVectorSegment[],
  sourcePathIds: ReadonlyMap<string, string[]>,
  start: SourcePointPx,
  end: SourcePointPx
): EdgeSupport | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_EDGE_LENGTH_PX) return null;
  const ux = dx / length;
  const uy = dy / length;
  const nx = -uy;
  const ny = ux;
  const diagonal = Math.hypot(page.widthPx, page.heightPx);
  // Model coordinates are deliberately non-authoritative and can be tens of
  // pixels away on a full-resolution page. Search broadly, then snap to an
  // actual source line and enforce the much tighter 3 px median / 6 px maximum
  // source residual below.
  const searchDistancePx = Math.max(12, Math.min(64, diagonal * 0.035));
  const groupTolerancePx = Math.max(1.5, Math.min(4, diagonal * 0.002));
  const candidates = segments.flatMap((segment) => {
    const segmentDx = segment.end.x - segment.start.x;
    const segmentDy = segment.end.y - segment.start.y;
    const segmentLength = Math.hypot(segmentDx, segmentDy);
    if (!segmentLength) return [];
    const alignment = Math.abs(
      ux * (segmentDx / segmentLength) + uy * (segmentDy / segmentLength)
    );
    if (alignment < Math.cos((20 * Math.PI) / 180)) return [];
    const midpoint = segmentMidpoint(segment);
    const offset = (midpoint.x - start.x) * nx + (midpoint.y - start.y) * ny;
    if (Math.abs(offset) > searchDistancePx) return [];
    const project = (point: SourcePointPx) =>
      (point.x - start.x) * ux + (point.y - start.y) * uy;
    const interval: [number, number] = [project(segment.start), project(segment.end)];
    if (Math.max(...interval) < -4 || Math.min(...interval) > length + 4) return [];
    return [{ segment, offset, interval }];
  });
  if (!candidates.length) return null;

  const evaluatedGroups = candidates.map((seed) => {
    const members = candidates.filter(
      (candidate) => Math.abs(candidate.offset - seed.offset) <= groupTolerancePx
    );
    const coverageRatio = intervalCoverage(
      members.map((member) => member.interval),
      length
    );
    return {
      members,
      coverageRatio,
      distanceFromProposal: Math.abs(median(members.map((member) => member.offset))),
    };
  });
  const best = evaluatedGroups.sort(
    (left, right) =>
      right.coverageRatio - left.coverageRatio ||
      left.distanceFromProposal - right.distanceFromProposal ||
      right.members.length - left.members.length
  )[0];
  const allowance = openingCoverageAllowance(page, start, end);
  if (best.coverageRatio + allowance < 0.56 || best.coverageRatio < 0.28) {
    return null;
  }
  const snappedOffset = median(best.members.map((member) => member.offset));
  const residuals = best.members.map((member) =>
    Math.abs(member.offset - snappedOffset)
  );
  const sourceSegmentIds = [...new Set(best.members.map((member) => member.segment.id))];
  return {
    shiftedStart: {
      x: start.x + nx * snappedOffset,
      y: start.y + ny * snappedOffset,
    },
    shiftedEnd: {
      x: end.x + nx * snappedOffset,
      y: end.y + ny * snappedOffset,
    },
    sourceSegmentIds,
    sourcePathIds: [
      ...new Set(sourceSegmentIds.flatMap((segmentId) => sourcePathIds.get(segmentId) ?? [])),
    ],
    medianResidualPx: median(residuals),
    maxResidualPx: Math.max(...residuals, 0),
    coverageRatio: best.coverageRatio,
  };
}

function lineIntersection(
  firstStart: SourcePointPx,
  firstEnd: SourcePointPx,
  secondStart: SourcePointPx,
  secondEnd: SourcePointPx
): SourcePointPx | null {
  const firstDx = firstEnd.x - firstStart.x;
  const firstDy = firstEnd.y - firstStart.y;
  const secondDx = secondEnd.x - secondStart.x;
  const secondDy = secondEnd.y - secondStart.y;
  const determinant = firstDx * secondDy - firstDy * secondDx;
  if (Math.abs(determinant) < 1e-6) return null;
  const relativeX = secondStart.x - firstStart.x;
  const relativeY = secondStart.y - firstStart.y;
  const ratio = (relativeX * secondDy - relativeY * secondDx) / determinant;
  return {
    x: firstStart.x + ratio * firstDx,
    y: firstStart.y + ratio * firstDy,
  };
}

function polygonArea(points: readonly SourcePointPx[]) {
  return Math.abs(
    points.reduce((total, point, index) => {
      const next = points[(index + 1) % points.length];
      return total + point.x * next.y - next.x * point.y;
    }, 0) / 2
  );
}

function cross(
  first: SourcePointPx,
  second: SourcePointPx,
  third: SourcePointPx
) {
  return (
    (second.x - first.x) * (third.y - first.y) -
    (second.y - first.y) * (third.x - first.x)
  );
}

function removeRedundantPoints(points: SourcePointPx[]) {
  const deduplicated = points.filter(
    (point, index) =>
      index === 0 || pointDistance(point, points[index - 1]) >= 2
  );
  if (
    deduplicated.length > 2 &&
    pointDistance(deduplicated[0], deduplicated[deduplicated.length - 1]) < 2
  ) {
    deduplicated.pop();
  }
  let changed = true;
  while (changed && deduplicated.length > 3) {
    changed = false;
    for (let index = 0; index < deduplicated.length; index += 1) {
      const previous = deduplicated[(index - 1 + deduplicated.length) % deduplicated.length];
      const point = deduplicated[index];
      const next = deduplicated[(index + 1) % deduplicated.length];
      const span = Math.max(1, pointDistance(previous, next));
      if (Math.abs(cross(previous, point, next)) / span <= 2) {
        deduplicated.splice(index, 1);
        changed = true;
        break;
      }
    }
  }
  return deduplicated;
}

function orientation(a: SourcePointPx, b: SourcePointPx, c: SourcePointPx) {
  const value = cross(a, b, c);
  return Math.abs(value) < 1e-7 ? 0 : value > 0 ? 1 : -1;
}

function pointOnSegment(point: SourcePointPx, start: SourcePointPx, end: SourcePointPx) {
  return (
    Math.abs(cross(start, end, point)) <= 1e-5 &&
    point.x >= Math.min(start.x, end.x) - 1e-5 &&
    point.x <= Math.max(start.x, end.x) + 1e-5 &&
    point.y >= Math.min(start.y, end.y) - 1e-5 &&
    point.y <= Math.max(start.y, end.y) + 1e-5
  );
}

function segmentsIntersect(
  firstStart: SourcePointPx,
  firstEnd: SourcePointPx,
  secondStart: SourcePointPx,
  secondEnd: SourcePointPx
) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  if (
    firstOrientation !== secondOrientation &&
    thirdOrientation !== fourthOrientation
  ) {
    return true;
  }
  return (
    (firstOrientation === 0 && pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (secondOrientation === 0 && pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (thirdOrientation === 0 && pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (fourthOrientation === 0 && pointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function selfIntersects(points: readonly SourcePointPx[]) {
  for (let first = 0; first < points.length; first += 1) {
    const firstNext = (first + 1) % points.length;
    for (let second = first + 1; second < points.length; second += 1) {
      const secondNext = (second + 1) % points.length;
      if (
        first === second ||
        firstNext === second ||
        secondNext === first ||
        (first === 0 && secondNext === 0)
      ) {
        continue;
      }
      if (
        segmentsIntersect(
          points[first],
          points[firstNext],
          points[second],
          points[secondNext]
        )
      ) {
        return true;
      }
    }
  }
  return false;
}

function roomsOverlap(
  left: RegisteredRoomBoundary,
  right: RegisteredRoomBoundary
) {
  if (
    left.bbox.right <= right.bbox.left ||
    right.bbox.right <= left.bbox.left ||
    left.bbox.bottom <= right.bbox.top ||
    right.bbox.bottom <= left.bbox.top
  ) {
    return false;
  }
  const pointOnPolygonBoundary = (
    point: SourcePointPx,
    polygon: readonly SourcePointPx[]
  ) =>
    polygon.some((start, index) =>
      pointOnSegment(point, start, polygon[(index + 1) % polygon.length])
    );
  const strictlyInside = (
    point: SourcePointPx,
    polygon: readonly SourcePointPx[]
  ) => pointInPolygon(point, [...polygon]) && !pointOnPolygonBoundary(point, polygon);
  const leftInterior = left.sourcePoints.some((point) =>
    strictlyInside(point, right.sourcePoints)
  );
  const rightInterior = right.sourcePoints.some((point) =>
    strictlyInside(point, left.sourcePoints)
  );
  const centroid = (points: readonly SourcePointPx[]) => ({
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  });
  if (
    leftInterior ||
    rightInterior ||
    strictlyInside(centroid(left.sourcePoints), right.sourcePoints) ||
    strictlyInside(centroid(right.sourcePoints), left.sourcePoints)
  ) {
    return true;
  }
  for (let leftIndex = 0; leftIndex < left.sourcePoints.length; leftIndex += 1) {
    const leftStart = left.sourcePoints[leftIndex];
    const leftEnd = left.sourcePoints[(leftIndex + 1) % left.sourcePoints.length];
    for (let rightIndex = 0; rightIndex < right.sourcePoints.length; rightIndex += 1) {
      const rightStart = right.sourcePoints[rightIndex];
      const rightEnd = right.sourcePoints[(rightIndex + 1) % right.sourcePoints.length];
      const firstOrientation = orientation(leftStart, leftEnd, rightStart);
      const secondOrientation = orientation(leftStart, leftEnd, rightEnd);
      const thirdOrientation = orientation(rightStart, rightEnd, leftStart);
      const fourthOrientation = orientation(rightStart, rightEnd, leftEnd);
      if (
        firstOrientation !== 0 &&
        secondOrientation !== 0 &&
        thirdOrientation !== 0 &&
        fourthOrientation !== 0 &&
        firstOrientation !== secondOrientation &&
        thirdOrientation !== fourthOrientation
      ) {
        return true;
      }
    }
  }
  return false;
}

function roomContainsRoom(
  outer: RegisteredRoomBoundary,
  inner: RegisteredRoomBoundary
) {
  const pointOnOuterBoundary = (point: SourcePointPx) =>
    outer.sourcePoints.some((start, index) =>
      pointOnSegment(
        point,
        start,
        outer.sourcePoints[(index + 1) % outer.sourcePoints.length]
      )
    );
  return (
    inner.sourcePoints.every(
      (point) =>
        pointInPolygon(point, outer.sourcePoints) || pointOnOuterBoundary(point)
    ) &&
    inner.sourcePoints.some(
      (point) =>
        pointInPolygon(point, outer.sourcePoints) && !pointOnOuterBoundary(point)
    )
  );
}

function sourceLabelKeys(room: RegisteredRoomBoundary) {
  return new Set(
    (room.sourceLabels ?? []).map(
      (label) =>
        `${label.label.trim().toLocaleLowerCase()}:${label.centerXRatio.toFixed(4)}:${label.centerYRatio.toFixed(4)}`
    )
  );
}

function isContainedDuplicate(
  candidate: RegisteredRoomBoundary,
  other: RegisteredRoomBoundary
) {
  const candidateArea = polygonArea(candidate.sourcePoints);
  const otherArea = polygonArea(other.sourcePoints);
  if (otherArea <= candidateArea * 1.15 || !roomContainsRoom(other, candidate)) {
    return false;
  }
  const candidateLabels = sourceLabelKeys(candidate);
  if ((candidate.sourceFixtures?.length ?? 0) > 0) return false;
  if (candidateLabels.size === 0) return true;
  const otherLabels = sourceLabelKeys(other);
  return [...candidateLabels].some((key) => otherLabels.has(key));
}

function insideConfirmedPlanRegion(
  page: RegisteredPageEvidence,
  points: readonly SourcePointPx[]
) {
  const region = page.semantics.planRegion;
  if (!region || region.confidence < 0.5) return true;
  const paddingX = page.widthPx * 0.02;
  const paddingY = page.heightPx * 0.02;
  return points.every(
    (point) =>
      point.x >= region.bbox.leftRatio * page.widthPx - paddingX &&
      point.x <= region.bbox.rightRatio * page.widthPx + paddingX &&
      point.y >= region.bbox.topRatio * page.heightPx - paddingY &&
      point.y <= region.bbox.bottomRatio * page.heightPx + paddingY
  );
}

/**
 * Converts semantic room-boundary proposals into geometry only after each edge
 * has independently registered to deterministic source linework. Proposals
 * that cannot satisfy the all-room topology gate are returned only as
 * diagnostics and never reach the canonical document.
 */
export function registerVisionGuidedRoomBoundaries(
  page: RegisteredPageEvidence
): VisionGuidedTopologyResult {
  const proposals = [
    ...(page.semantics.roomBoundaries ?? []),
    ...fixtureSeededRoomBoundaries(page),
  ].filter(
    (proposal) =>
      proposal.confidence >= MIN_PROPOSAL_CONFIDENCE &&
      proposal.points.length >= 3 &&
      proposal.points.length <= MAX_POLYGON_POINTS
  );
  const segments = sourceSegmentsForWalls(page);
  const sourcePathIds = pathIdsForSegments(page);
  const rejectionCounts = {
    invalidProposal: 0,
    outsidePlanRegion: 0,
    unsupportedEdge: 0,
    unsnappableCorner: 0,
    invalidPolygon: 0,
    ambiguousLabel: 0,
    incompatibleFixtureCluster: 0,
    excessiveResidual: 0,
  };
  const registeredCandidates: Array<{
    room: RegisteredRoomBoundary;
    medianResidualPx: number;
    maxResidualPx: number;
    supportScore: number;
  }> = [];
  for (const [proposalIndex, proposal] of proposals.entries()) {
    const proposedPoints = removeRedundantPoints(
      proposal.points.map((point) => ({
        x: point.xRatio * page.widthPx,
        y: point.yRatio * page.heightPx,
      }))
    );
    if (
      proposedPoints.length < 3 ||
      proposedPoints.length > MAX_POLYGON_POINTS
    ) {
      rejectionCounts.invalidProposal += 1;
      continue;
    }
    if (!insideConfirmedPlanRegion(page, proposedPoints)) {
      rejectionCounts.outsidePlanRegion += 1;
      continue;
    }
    const supports = proposedPoints.map((start, index) =>
      supportEdge(
        page,
        segments,
        sourcePathIds,
        start,
        proposedPoints[(index + 1) % proposedPoints.length]
      )
    );
    if (supports.some((support) => !support)) {
      rejectionCounts.unsupportedEdge += 1;
      continue;
    }
    const completeSupports = supports as EdgeSupport[];
    const snappedPoints = completeSupports.map((support, index) => {
      const previous =
        completeSupports[(index - 1 + completeSupports.length) % completeSupports.length];
      return lineIntersection(
        previous.shiftedStart,
        previous.shiftedEnd,
        support.shiftedStart,
        support.shiftedEnd
      );
    });
    if (snappedPoints.some((point) => !point)) {
      rejectionCounts.unsnappableCorner += 1;
      continue;
    }
    const completePoints = snappedPoints as SourcePointPx[];
    const pageArea = page.widthPx * page.heightPx;
    if (
      completePoints.some(
        (point) =>
          point.x < 0 ||
          point.y < 0 ||
          point.x > page.widthPx ||
          point.y > page.heightPx
      ) ||
      completePoints.some(
        (point, index) =>
          pointDistance(point, completePoints[(index + 1) % completePoints.length]) <
          MIN_EDGE_LENGTH_PX
      ) ||
      polygonArea(completePoints) < pageArea * 0.002 ||
      polygonArea(completePoints) > pageArea * 0.9 ||
      selfIntersects(completePoints)
    ) {
      rejectionCounts.invalidPolygon += 1;
      continue;
    }
    const labels = page.semantics.roomLabels.filter((label) =>
      pointInPolygon(
        {
          x: label.centerXRatio * page.widthPx,
          y: label.centerYRatio * page.heightPx,
        },
        completePoints
      )
    );
    const sourceFixtures = (page.semantics.fixtureSymbols ?? []).filter(
      (fixture) =>
        fixture.confidence >= MIN_PROPOSAL_CONFIDENCE &&
        pointInPolygon(
          {
            x: fixture.centerXRatio * page.widthPx,
            y: fixture.centerYRatio * page.heightPx,
          },
          completePoints
        )
    );
    const fixtureIdentity = inferRoomIdentityFromFixtures(sourceFixtures);
    const openPlan =
      labels.length > 1 &&
      labels.every((entry) => OPEN_PLAN_ROOM_TYPES.has(entry.roomType)) &&
      new Set(labels.map((entry) => entry.roomType)).size > 1;
    if (labels.length > 1 && !openPlan) {
      rejectionCounts.ambiguousLabel += 1;
      continue;
    }
    if (
      fixtureIdentity &&
      labels.some(
        (entry) =>
          entry.roomType !== "toilet" &&
          entry.roomType !== "service_yard"
      )
    ) {
      rejectionCounts.incompatibleFixtureCluster += 1;
      continue;
    }
    const label =
      labels.find(
        (entry) =>
          entry.label.trim().toLocaleLowerCase() ===
          proposal.label.trim().toLocaleLowerCase()
      ) ?? labels[0] ?? null;
    const medianResidualPx = median(
      completeSupports.map((support) => support.medianResidualPx)
    );
    const maxResidualPx = Math.max(
      ...completeSupports.map((support) => support.maxResidualPx)
    );
    if (medianResidualPx > 3 || maxResidualPx > 6) {
      rejectionCounts.excessiveResidual += 1;
      continue;
    }
    registeredCandidates.push({
      room: {
        key: `room-${proposalIndex + 1}`,
        label: openPlan
          ? "Open Plan"
          : label?.label ??
            fixtureIdentity?.label ??
            `Room ${proposalIndex + 1}`,
        roomType:
          openPlan
            ? labels.find((entry) => entry.roomType === "living")?.roomType ??
              labels.find((entry) => entry.roomType === "dining")?.roomType ??
              label?.roomType ??
              "other"
            : label?.roomType ?? fixtureIdentity?.roomType ?? "other",
        confidence: Math.min(
          proposal.confidence,
          ...(labels.length
            ? labels.map((entry) => entry.confidence)
            : [proposal.confidence]),
          0.55 + 0.4 * median(completeSupports.map((support) => support.coverageRatio))
        ),
        pathId: `vision-source-snap-${proposalIndex + 1}`,
        bbox: {
          left: Math.min(...completePoints.map((point) => point.x)),
          top: Math.min(...completePoints.map((point) => point.y)),
          right: Math.max(...completePoints.map((point) => point.x)),
          bottom: Math.max(...completePoints.map((point) => point.y)),
        },
        sourcePoints: completePoints,
        sourceLabels: labels,
        sourceFixtures,
        registrationKind: "vision_guided_source_snap",
        sourceEdges: completeSupports.map((support, edgeIndex) => ({
          evidenceId: `vision-source-snap-${proposalIndex + 1}-edge-${edgeIndex + 1}`,
          kind: "wall_centerline",
          thicknessMm: 200,
          sourcePathIds: support.sourcePathIds,
          sourceSegmentIds: support.sourceSegmentIds,
        })),
      },
      medianResidualPx,
      maxResidualPx,
      supportScore: median(
        completeSupports.map((support) => support.coverageRatio)
      ),
    });
  }

  // A furniture or fixture rectangle can be perfectly source-supported while
  // sitting inside a real room. Suppress only strictly contained candidates
  // that are unlabeled or compete for the same positioned source label.
  const withoutContainedDuplicates = registeredCandidates.filter(
    (candidate, index, candidates) =>
      !candidates.some(
        (other, otherIndex) =>
          index !== otherIndex &&
          isContainedDuplicate(candidate.room, other.room)
      )
  );
  const candidatePriority = (
    candidate: (typeof registeredCandidates)[number]
  ) => {
    const labels = candidate.room.sourceLabels ?? [];
    const normalizedProposalLabel = candidate.room.label
      .trim()
      .toLocaleLowerCase();
    const exactLabelMatch = labels.some(
      (label) =>
        label.label.trim().toLocaleLowerCase() === normalizedProposalLabel
    );
    return (
      labels.length * 10 +
      (candidate.room.sourceFixtures?.length ?? 0) * 8 +
      (exactLabelMatch ? 4 : 0) +
      candidate.supportScore +
      candidate.room.confidence
    );
  };
  const selected: typeof registeredCandidates = [];
  for (const candidate of [...withoutContainedDuplicates].sort(
    (left, right) =>
      candidatePriority(right) - candidatePriority(left) ||
      polygonArea(right.room.sourcePoints) -
        polygonArea(left.room.sourcePoints)
  )) {
    if (
      selected.some((current) =>
        roomsOverlap(current.room, candidate.room)
      )
    ) {
      continue;
    }
    selected.push(candidate);
  }
  selected.sort(
    (left, right) =>
      left.room.bbox.top - right.room.bbox.top ||
      left.room.bbox.left - right.room.bbox.left
  );
  const rooms = selected.map((candidate, index) => ({
    ...candidate.room,
    key: `room-${index + 1}`,
  }));
  // Room names are editable metadata, not structural evidence. A high-quality
  // boundary set must still contain closed, non-overlapping, source-supported
  // faces, but a stray or ambiguously positioned printed label is preserved as
  // an annotation instead of preventing creation of the measured plan.
  const blockers = assessRegisteredRoomCoverage(page, rooms).blockers.filter(
    (blocker) => blocker !== "unmapped_or_duplicate_room_labels"
  );
  if (
    rooms.some((room, index) =>
      rooms.slice(index + 1).some((other) => roomsOverlap(room, other))
    )
  ) {
    blockers.push("overlapping_room_boundaries");
  }
  if (registeredCandidates.length === 0) {
    blockers.push("unregistered_semantic_room_boundaries");
  }
  const residuals = selected.flatMap((candidate) => [
    candidate.medianResidualPx,
    candidate.maxResidualPx,
  ]);
  return {
    rooms: blockers.length ? [] : rooms,
    complete: blockers.length === 0 && rooms.length > 0,
    blockers: [...new Set(blockers)],
    diagnostics: {
      proposalCount: proposals.length,
      registeredRoomCount: rooms.length,
      rejectedProposalCount: proposals.length - registeredCandidates.length,
      rejectionCounts,
      medianSourceDeviationPx: residuals.length ? median(residuals) : 0,
      maxSourceDeviationPx: Math.max(...residuals, 0),
    },
  };
}
