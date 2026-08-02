import type {
  RegisteredPageEvidence,
  SourcePointPx,
  SourceVectorCurveEvidence,
  SourceVectorPath,
  SourceVectorSegment,
} from "./deterministic-evidence";

export type RegisteredOpeningSpanCandidate = {
  orientation: "horizontal" | "vertical";
  start: SourcePointPx;
  end: SourcePointPx;
  widthPx: number;
  thicknessPx: number;
};

export type RegisteredSourceOpeningSupport = {
  kind: "door" | "window";
  operation: "swing" | "sliding" | "folding" | "fixed";
  proof:
    | "swing_arc_and_leaf"
    | "sliding_staggered_panels"
    | "folding_connected_leaves"
    | "paired_fixed_frame_lines";
  confidence: number;
  pathIds: string[];
  subpathIds: string[];
  segmentIds: string[];
  curveIds: string[];
};

export type RegisteredSourceOpeningSupportResult = {
  support: RegisteredSourceOpeningSupport | null;
  ambiguous: boolean;
  boundedOut: boolean;
  matchCounts: {
    swing: number;
    sliding: number;
    folding: number;
    fixed: number;
  };
};

type SourceUnit = {
  id: string;
  pathId: string;
  closed: boolean;
  bbox: SourceVectorPath["bbox"];
  segments: SourceVectorSegment[];
  curves: SourceVectorCurveEvidence[];
};

function distance(left: SourcePointPx, right: SourcePointPx) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function sourceUnits(
  page: RegisteredPageEvidence,
  boundarySegmentIds: Set<string>,
  countCheck: () => boolean
): { units: SourceUnit[]; boundedOut: boolean } {
  const segmentById = new Map(page.vectorSegments.map((segment) => [segment.id, segment]));
  const curveById = new Map(
    page.vectorPaths.flatMap((path) => path.curves ?? []).map((curve) => [curve.id, curve])
  );
  const units: SourceUnit[] = [];
  for (const path of page.vectorPaths) {
    if (!countCheck()) return { units: [], boundedOut: true };
    if (path.evidenceKind !== "pdf_vector") continue;
    if (path.paintOperation === "fill" || path.paintOperation === "clip") continue;
    const subpaths = path.subpaths?.length
      ? path.subpaths
      : [
          {
            id: path.id,
            closed: path.closed,
            segmentIds: path.segmentIds,
            curveIds: (path.curves ?? []).map((curve) => curve.id),
            bbox: path.bbox,
          },
        ];
    for (const subpath of subpaths) {
      if (!countCheck()) return { units: [], boundedOut: true };
      const segments = subpath.segmentIds.flatMap((id) => {
        const segment = segmentById.get(id);
        return segment && !boundarySegmentIds.has(id) ? [segment] : [];
      });
      const curves = subpath.curveIds.flatMap((id) => {
        const curve = curveById.get(id);
        return curve ? [curve] : [];
      });
      if (!segments.length && !curves.length) continue;
      units.push({
        id: subpath.id,
        pathId: path.id,
        closed: subpath.closed,
        bbox: subpath.bbox,
        segments,
        curves,
      });
    }
  }
  return { units, boundedOut: false };
}

function axisValue(candidate: RegisteredOpeningSpanCandidate, point: SourcePointPx) {
  return candidate.orientation === "horizontal" ? point.x : point.y;
}

function normalValue(candidate: RegisteredOpeningSpanCandidate, point: SourcePointPx) {
  return candidate.orientation === "horizontal" ? point.y : point.x;
}

function projection(candidate: RegisteredOpeningSpanCandidate, segment: SourceVectorSegment) {
  const from = Math.min(axisValue(candidate, segment.start), axisValue(candidate, segment.end));
  const to = Math.max(axisValue(candidate, segment.start), axisValue(candidate, segment.end));
  return {
    from,
    to,
    length: to - from,
    constant: (normalValue(candidate, segment.start) + normalValue(candidate, segment.end)) / 2,
    normalDelta: Math.abs(normalValue(candidate, segment.start) - normalValue(candidate, segment.end)),
  };
}

function gapRange(candidate: RegisteredOpeningSpanCandidate) {
  return {
    from: Math.min(axisValue(candidate, candidate.start), axisValue(candidate, candidate.end)),
    to: Math.max(axisValue(candidate, candidate.start), axisValue(candidate, candidate.end)),
    normal: (normalValue(candidate, candidate.start) + normalValue(candidate, candidate.end)) / 2,
  };
}

function overlap(from: number, to: number, otherFrom: number, otherTo: number) {
  return Math.max(0, Math.min(to, otherTo) - Math.max(from, otherFrom));
}

function orderedPolyline(unit: SourceUnit) {
  if (unit.closed || unit.curves.length || unit.segments.length < 4 || unit.segments.length > 64) {
    return null;
  }
  const points: SourcePointPx[] = [unit.segments[0].start, unit.segments[0].end];
  for (const segment of unit.segments.slice(1)) {
    const previous = points[points.length - 1];
    if (distance(previous, segment.start) <= 1) points.push(segment.end);
    else if (distance(previous, segment.end) <= 1) points.push(segment.start);
    else return null;
  }
  return points;
}

function arcEvidence(unit: SourceUnit, widthPx: number) {
  const width = unit.bbox.right - unit.bbox.left;
  const height = unit.bbox.bottom - unit.bbox.top;
  const radius = (width + height) / 2;
  if (
    radius < widthPx * 0.55 ||
    radius > widthPx * 1.35 ||
    Math.min(width, height) / Math.max(width, height) < 0.72
  ) {
    return null;
  }
  let start: SourcePointPx;
  let end: SourcePointPx;
  if (unit.curves.length) {
    start = unit.curves[0].start;
    end = unit.curves[unit.curves.length - 1].end;
  } else {
    const points = orderedPolyline(unit);
    if (!points) return null;
    start = points[0];
    end = points[points.length - 1];
    const length = unit.segments.reduce(
      (total, segment) => total + distance(segment.start, segment.end),
      0
    );
    if (length < radius * 1.25 || length > radius * 1.85) return null;
    const xSigns = new Set(
      unit.segments.map((segment) => Math.sign(segment.end.x - segment.start.x)).filter(Boolean)
    );
    const ySigns = new Set(
      unit.segments.map((segment) => Math.sign(segment.end.y - segment.start.y)).filter(Boolean)
    );
    if (xSigns.size > 1 || ySigns.size > 1) return null;
  }
  if (Math.abs(start.x - end.x) < radius * 0.68 || Math.abs(start.y - end.y) < radius * 0.68) {
    return null;
  }
  return {
    start,
    end,
    radius,
    pivots: [
      { x: start.x, y: end.y },
      { x: end.x, y: start.y },
    ],
  };
}

function swingSupports(
  units: SourceUnit[],
  candidate: RegisteredOpeningSpanCandidate
): RegisteredSourceOpeningSupport[] {
  const range = gapRange(candidate);
  const endpointTolerance = Math.max(4, candidate.thicknessPx * 0.55, candidate.widthPx * 0.12);
  const normalTolerance = Math.max(3, candidate.thicknessPx * 0.75);
  const matches: RegisteredSourceOpeningSupport[] = [];
  for (const arcUnit of units) {
    const arc = arcEvidence(arcUnit, candidate.widthPx);
    if (!arc) continue;
    for (const pivot of arc.pivots) {
      for (const leafUnit of units) {
        if (leafUnit.id === arcUnit.id) continue;
        const longSegments = leafUnit.segments.filter((segment) => {
          const length = distance(segment.start, segment.end);
          return length >= arc.radius * 0.72 && length <= arc.radius * 1.2;
        });
        for (const leaf of longSegments) {
          const leafOther =
            distance(leaf.start, pivot) <= endpointTolerance
              ? leaf.end
              : distance(leaf.end, pivot) <= endpointTolerance
                ? leaf.start
                : null;
          if (!leafOther) continue;
          const leafArcEndpoint =
            distance(leafOther, arc.start) <= endpointTolerance
              ? arc.start
              : distance(leafOther, arc.end) <= endpointTolerance
                ? arc.end
                : null;
          if (!leafArcEndpoint) continue;
          const wallArcEndpoint = leafArcEndpoint === arc.start ? arc.end : arc.start;
          const wallAxis = [axisValue(candidate, pivot), axisValue(candidate, wallArcEndpoint)].sort(
            (left, right) => left - right
          );
          if (
            Math.abs(wallAxis[0] - range.from) > endpointTolerance ||
            Math.abs(wallAxis[1] - range.to) > endpointTolerance ||
            Math.abs(normalValue(candidate, pivot) - range.normal) > normalTolerance ||
            Math.abs(normalValue(candidate, wallArcEndpoint) - range.normal) > normalTolerance
          ) {
            continue;
          }
          matches.push({
            kind: "door",
            operation: "swing",
            proof: "swing_arc_and_leaf",
            confidence: 0.96,
            pathIds: [...new Set([arcUnit.pathId, leafUnit.pathId])].sort(),
            subpathIds: [arcUnit.id, leafUnit.id].sort(),
            segmentIds: [...new Set([...arcUnit.segments.map((segment) => segment.id), leaf.id])].sort(),
            curveIds: arcUnit.curves.map((curve) => curve.id).sort(),
          });
        }
      }
    }
  }
  return deduplicate(matches);
}

type ParallelMatch = { unit: SourceUnit; segment: SourceVectorSegment; projection: ReturnType<typeof projection> };

function parallelMatches(
  units: SourceUnit[],
  candidate: RegisteredOpeningSpanCandidate,
  minRatio: number,
  maxRatio: number,
  normalTolerance: number
) {
  const range = gapRange(candidate);
  return units.flatMap((unit) => {
    const best = unit.segments
      .map((segment) => ({ unit, segment, projection: projection(candidate, segment) }))
      .filter(({ projection: item }) =>
        item.normalDelta <= Math.max(1, candidate.widthPx * 0.02) &&
        item.length >= candidate.widthPx * minRatio &&
        item.length <= candidate.widthPx * maxRatio &&
        Math.abs(item.constant - range.normal) <= normalTolerance
      )
      .sort((left, right) => right.projection.length - left.projection.length)[0];
    return best ? [best] : [];
  });
}

function fixedSupport(units: SourceUnit[], candidate: RegisteredOpeningSpanCandidate) {
  const matches = parallelMatches(
    units,
    candidate,
    0.82,
    1.2,
    Math.max(4, candidate.thicknessPx * 1.8)
  );
  const distinctConstants = matches.filter(
    (match, index) =>
      !matches.slice(0, index).some(
        (earlier) => Math.abs(earlier.projection.constant - match.projection.constant) <= 0.75
      )
  );
  if (distinctConstants.length < 2) return null;
  return supportFromMatches(
    distinctConstants,
    "window",
    "fixed",
    "paired_fixed_frame_lines",
    0.94
  );
}

function slidingSupports(units: SourceUnit[], candidate: RegisteredOpeningSpanCandidate) {
  const range = gapRange(candidate);
  const matches = parallelMatches(
    units,
    candidate,
    0.35,
    0.78,
    Math.max(4, candidate.thicknessPx * 1.8)
  );
  const supports: RegisteredSourceOpeningSupport[] = [];
  for (let leftIndex = 0; leftIndex < matches.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < matches.length; rightIndex += 1) {
      const left = matches[leftIndex];
      const right = matches[rightIndex];
      if (Math.abs(left.projection.constant - right.projection.constant) <= 0.75) continue;
      const unionFrom = Math.min(left.projection.from, right.projection.from);
      const unionTo = Math.max(left.projection.to, right.projection.to);
      const shared = overlap(
        left.projection.from,
        left.projection.to,
        right.projection.from,
        right.projection.to
      );
      if (
        unionFrom > range.from + candidate.widthPx * 0.15 ||
        unionTo < range.to - candidate.widthPx * 0.15 ||
        shared < candidate.widthPx * 0.05 ||
        shared > candidate.widthPx * 0.45
      ) {
        continue;
      }
      supports.push(
        supportFromMatches(
          [left, right],
          "door",
          "sliding",
          "sliding_staggered_panels",
          0.94
        )
      );
    }
  }
  return deduplicate(supports);
}

function foldingSupports(units: SourceUnit[], candidate: RegisteredOpeningSpanCandidate) {
  const range = gapRange(candidate);
  const axisTolerance = candidate.widthPx * 0.2;
  const normalTolerance = Math.max(candidate.thicknessPx * 2, candidate.widthPx * 0.35);
  const diagonals = units.flatMap((unit) =>
    unit.segments.flatMap((segment) => {
      const axisDelta = Math.abs(axisValue(candidate, segment.end) - axisValue(candidate, segment.start));
      const normalDelta = Math.abs(normalValue(candidate, segment.end) - normalValue(candidate, segment.start));
      const midpointNormal = (normalValue(candidate, segment.start) + normalValue(candidate, segment.end)) / 2;
      return axisDelta >= candidate.widthPx * 0.18 &&
        normalDelta >= candidate.widthPx * 0.12 &&
        Math.abs(midpointNormal - range.normal) <= normalTolerance
        ? [{ unit, segment }]
        : [];
    })
  );
  const supports: RegisteredSourceOpeningSupport[] = [];
  for (let leftIndex = 0; leftIndex < diagonals.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < diagonals.length; rightIndex += 1) {
      const left = diagonals[leftIndex];
      const right = diagonals[rightIndex];
      const pairings = [
        [left.segment.start, left.segment.end, right.segment.start, right.segment.end],
        [left.segment.start, left.segment.end, right.segment.end, right.segment.start],
        [left.segment.end, left.segment.start, right.segment.start, right.segment.end],
        [left.segment.end, left.segment.start, right.segment.end, right.segment.start],
      ] as const;
      const joined = pairings.find(([, sharedLeft, sharedRight]) =>
        distance(sharedLeft, sharedRight) <= Math.max(2, candidate.widthPx * 0.03)
      );
      if (!joined) continue;
      const [outerLeft, , , outerRight] = joined;
      const outerAxis = [axisValue(candidate, outerLeft), axisValue(candidate, outerRight)].sort(
        (a, b) => a - b
      );
      if (
        Math.abs(outerAxis[0] - range.from) > axisTolerance ||
        Math.abs(outerAxis[1] - range.to) > axisTolerance
      ) {
        continue;
      }
      supports.push(
        supportFromMatches(
          [
            { unit: left.unit, segment: left.segment, projection: projection(candidate, left.segment) },
            { unit: right.unit, segment: right.segment, projection: projection(candidate, right.segment) },
          ],
          "door",
          "folding",
          "folding_connected_leaves",
          0.93
        )
      );
    }
  }
  return deduplicate(supports);
}

function supportFromMatches(
  matches: ParallelMatch[],
  kind: RegisteredSourceOpeningSupport["kind"],
  operation: RegisteredSourceOpeningSupport["operation"],
  proof: RegisteredSourceOpeningSupport["proof"],
  confidence: number
): RegisteredSourceOpeningSupport {
  return {
    kind,
    operation,
    proof,
    confidence,
    pathIds: [...new Set(matches.map((match) => match.unit.pathId))].sort(),
    subpathIds: [...new Set(matches.map((match) => match.unit.id))].sort(),
    segmentIds: [...new Set(matches.map((match) => match.segment.id))].sort(),
    curveIds: [],
  };
}

function deduplicate(supports: RegisteredSourceOpeningSupport[]) {
  const byKey = new Map<string, RegisteredSourceOpeningSupport>();
  for (const support of supports) {
    const key = `${support.operation}:${support.subpathIds.join(",")}`;
    byKey.set(key, support);
  }
  return [...byKey.values()];
}

export function findRegisteredSourceOpeningSupport(
  page: RegisteredPageEvidence,
  candidate: RegisteredOpeningSpanCandidate,
  boundarySegmentIds: Set<string>,
  countCheck: () => boolean
): RegisteredSourceOpeningSupportResult {
  const collected = sourceUnits(page, boundarySegmentIds, countCheck);
  if (collected.boundedOut) {
    return {
      support: null,
      ambiguous: false,
      boundedOut: true,
      matchCounts: { swing: 0, sliding: 0, folding: 0, fixed: 0 },
    };
  }
  const swing = swingSupports(collected.units, candidate);
  const sliding = slidingSupports(collected.units, candidate);
  const folding = foldingSupports(collected.units, candidate);
  const fixed = fixedSupport(collected.units, candidate);
  const matchCounts = {
    swing: swing.length,
    sliding: sliding.length,
    folding: folding.length,
    fixed: fixed ? 1 : 0,
  };
  const dynamic = [...swing, ...sliding, ...folding];
  if (dynamic.length === 1) {
    return {
      support: dynamic[0],
      ambiguous: false,
      boundedOut: false,
      matchCounts,
    };
  }
  if (dynamic.length > 1) {
    return { support: null, ambiguous: true, boundedOut: false, matchCounts };
  }
  return fixed
    ? { support: fixed, ambiguous: false, boundedOut: false, matchCounts }
    : {
        support: null,
        ambiguous: false,
        boundedOut: false,
        matchCounts,
      };
}
