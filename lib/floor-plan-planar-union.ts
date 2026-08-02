import type { FloorPlanPointMmV2 } from "@/lib/floor-plan-document-v2";

export type PlanarRegionMm = {
  outer: FloorPlanPointMmV2[];
  holes?: FloorPlanPointMmV2[][];
};

export type PlanarUnionPolygonMm = {
  outer: FloorPlanPointMmV2[];
  holes: FloorPlanPointMmV2[][];
};

type PlanarEdge = {
  start: FloorPlanPointMmV2;
  end: FloorPlanPointMmV2;
};

const COORDINATE_SCALE = 1000;
const INTERSECTION_EPSILON = 1e-8;
const MINIMUM_SEGMENT_MM = 0.001;
const BOUNDARY_SAMPLE_MM = 0.05;

function roundedCoordinate(value: number) {
  return Math.round(value * COORDINATE_SCALE) / COORDINATE_SCALE;
}

function roundedPoint(point: FloorPlanPointMmV2): FloorPlanPointMmV2 {
  return {
    xMm: roundedCoordinate(point.xMm),
    zMm: roundedCoordinate(point.zMm),
  };
}

function pointKey(point: FloorPlanPointMmV2) {
  const rounded = roundedPoint(point);
  return `${rounded.xMm}:${rounded.zMm}`;
}

function samePoint(first: FloorPlanPointMmV2, second: FloorPlanPointMmV2) {
  return pointKey(first) === pointKey(second);
}

function cross(
  first: FloorPlanPointMmV2,
  second: FloorPlanPointMmV2
) {
  return first.xMm * second.zMm - first.zMm * second.xMm;
}

function subtract(
  first: FloorPlanPointMmV2,
  second: FloorPlanPointMmV2
): FloorPlanPointMmV2 {
  return { xMm: first.xMm - second.xMm, zMm: first.zMm - second.zMm };
}

function interpolate(edge: PlanarEdge, ratio: number): FloorPlanPointMmV2 {
  return roundedPoint({
    xMm: edge.start.xMm + (edge.end.xMm - edge.start.xMm) * ratio,
    zMm: edge.start.zMm + (edge.end.zMm - edge.start.zMm) * ratio,
  });
}

function sanitizeRing(points: FloorPlanPointMmV2[]) {
  const result: FloorPlanPointMmV2[] = [];
  for (const point of points) {
    const rounded = roundedPoint(point);
    if (!result.length || !samePoint(result[result.length - 1], rounded)) {
      result.push(rounded);
    }
  }
  if (result.length > 1 && samePoint(result[0], result[result.length - 1])) {
    result.pop();
  }
  return result.length >= 3 ? result : [];
}

export function signedPlanarRingAreaSquareMm(points: FloorPlanPointMmV2[]) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    twiceArea += current.xMm * next.zMm - next.xMm * current.zMm;
  }
  return twiceArea / 2;
}

export function isPointInPlanarRing(
  point: FloorPlanPointMmV2,
  ring: FloorPlanPointMmV2[]
) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const currentPoint = ring[index];
    const previousPoint = ring[previous];
    const crossesRay =
      currentPoint.zMm > point.zMm !== previousPoint.zMm > point.zMm;
    if (!crossesRay) continue;
    const crossingX =
      ((previousPoint.xMm - currentPoint.xMm) *
        (point.zMm - currentPoint.zMm)) /
        (previousPoint.zMm - currentPoint.zMm) +
      currentPoint.xMm;
    if (point.xMm < crossingX) inside = !inside;
  }
  return inside;
}

function isPointInRegion(point: FloorPlanPointMmV2, region: PlanarRegionMm) {
  return (
    isPointInPlanarRing(point, region.outer) &&
    !(region.holes ?? []).some((hole) => isPointInPlanarRing(point, hole))
  );
}

function addSplitParameter(parameters: number[], value: number) {
  if (value < -INTERSECTION_EPSILON || value > 1 + INTERSECTION_EPSILON) return;
  parameters.push(Math.max(0, Math.min(1, value)));
}

function addEdgeIntersections(
  first: PlanarEdge,
  second: PlanarEdge,
  firstParameters: number[],
  secondParameters: number[]
) {
  const firstDirection = subtract(first.end, first.start);
  const secondDirection = subtract(second.end, second.start);
  const betweenStarts = subtract(second.start, first.start);
  const determinant = cross(firstDirection, secondDirection);
  if (Math.abs(determinant) > INTERSECTION_EPSILON) {
    addSplitParameter(
      firstParameters,
      cross(betweenStarts, secondDirection) / determinant
    );
    addSplitParameter(
      secondParameters,
      cross(betweenStarts, firstDirection) / determinant
    );
    return;
  }
  if (Math.abs(cross(betweenStarts, firstDirection)) > INTERSECTION_EPSILON) {
    return;
  }

  const firstLengthSquared =
    firstDirection.xMm * firstDirection.xMm +
    firstDirection.zMm * firstDirection.zMm;
  const secondLengthSquared =
    secondDirection.xMm * secondDirection.xMm +
    secondDirection.zMm * secondDirection.zMm;
  if (firstLengthSquared <= INTERSECTION_EPSILON || secondLengthSquared <= INTERSECTION_EPSILON) {
    return;
  }
  for (const point of [second.start, second.end]) {
    const delta = subtract(point, first.start);
    addSplitParameter(
      firstParameters,
      (delta.xMm * firstDirection.xMm + delta.zMm * firstDirection.zMm) /
        firstLengthSquared
    );
  }
  for (const point of [first.start, first.end]) {
    const delta = subtract(point, second.start);
    addSplitParameter(
      secondParameters,
      (delta.xMm * secondDirection.xMm + delta.zMm * secondDirection.zMm) /
        secondLengthSquared
    );
  }
}

function ringEdges(ring: FloorPlanPointMmV2[]) {
  return ring.map((start, index) => ({
    start,
    end: ring[(index + 1) % ring.length],
  }));
}

function simplifyRing(points: FloorPlanPointMmV2[]) {
  let result = sanitizeRing(points);
  let changed = true;
  while (changed && result.length >= 3) {
    changed = false;
    const next: FloorPlanPointMmV2[] = [];
    for (let index = 0; index < result.length; index += 1) {
      const previous = result[(index - 1 + result.length) % result.length];
      const current = result[index];
      const following = result[(index + 1) % result.length];
      const incoming = subtract(current, previous);
      const outgoing = subtract(following, current);
      if (Math.abs(cross(incoming, outgoing)) <= INTERSECTION_EPSILON) {
        changed = true;
        continue;
      }
      next.push(current);
    }
    result = next;
  }
  return result;
}

function chooseNextBoundaryEdge(
  previous: FloorPlanPointMmV2,
  current: FloorPlanPointMmV2,
  candidates: PlanarEdge[]
) {
  const incomingAngle = Math.atan2(
    current.zMm - previous.zMm,
    current.xMm - previous.xMm
  );
  return [...candidates].sort((left, right) => {
    const turn = (edge: PlanarEdge) => {
      const angle = Math.atan2(
        edge.end.zMm - edge.start.zMm,
        edge.end.xMm - edge.start.xMm
      );
      let value = angle - incomingAngle;
      while (value <= -Math.PI) value += Math.PI * 2;
      while (value > Math.PI) value -= Math.PI * 2;
      return value;
    };
    return turn(right) - turn(left);
  })[0];
}

function buildBoundaryLoops(segments: PlanarEdge[]) {
  const remaining = new Map(
    segments.map((segment) => [
      `${pointKey(segment.start)}>${pointKey(segment.end)}`,
      segment,
    ])
  );
  const loops: FloorPlanPointMmV2[][] = [];

  while (remaining.size) {
    const firstEntry = [...remaining.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )[0];
    const [firstKey, first] = firstEntry;
    remaining.delete(firstKey);
    const points = [first.start, first.end];
    let previous = first.start;
    let current = first.end;
    const maximumSteps = segments.length + 1;

    for (let step = 0; step < maximumSteps && !samePoint(current, first.start); step += 1) {
      const candidates = [...remaining.values()].filter((edge) =>
        samePoint(edge.start, current)
      );
      if (!candidates.length) break;
      const next = chooseNextBoundaryEdge(previous, current, candidates);
      remaining.delete(`${pointKey(next.start)}>${pointKey(next.end)}`);
      points.push(next.end);
      previous = current;
      current = next.end;
    }
    if (samePoint(current, first.start)) {
      const loop = simplifyRing(points.slice(0, -1));
      if (loop.length >= 3 && Math.abs(signedPlanarRingAreaSquareMm(loop)) > 0.001) {
        loops.push(loop);
      }
    }
  }
  return loops;
}

function polygonSortKey(polygon: PlanarUnionPolygonMm) {
  return polygon.outer
    .map(pointKey)
    .sort((left, right) => left.localeCompare(right))[0];
}

/**
 * Exact boundary union for plan-scale polygons. Every source edge is split at
 * intersections, and only sub-segments with occupied space on exactly one
 * side survive. The result contains no internal room edges or overlapping wall
 * caps, which makes it suitable for watertight floor slabs and wall bands.
 */
export function buildPlanarUnionPolygons(
  sourceRegions: PlanarRegionMm[],
  exclusionRings: FloorPlanPointMmV2[][] = []
): PlanarUnionPolygonMm[] {
  const regions = sourceRegions
    .map((region) => ({
      outer: sanitizeRing(region.outer),
      holes: (region.holes ?? []).map(sanitizeRing).filter((ring) => ring.length >= 3),
    }))
    .filter((region) => region.outer.length >= 3);
  const exclusions = exclusionRings
    .map(sanitizeRing)
    .filter((ring) => ring.length >= 3);
  if (!regions.length) return [];

  const edges = [
    ...regions.flatMap((region) => [region.outer, ...region.holes].flatMap(ringEdges)),
    ...exclusions.flatMap(ringEdges),
  ].filter(
    (edge) =>
      Math.hypot(
        edge.end.xMm - edge.start.xMm,
        edge.end.zMm - edge.start.zMm
      ) >= MINIMUM_SEGMENT_MM
  );
  const splitParameters = edges.map(() => [0, 1]);
  for (let first = 0; first < edges.length; first += 1) {
    for (let second = first + 1; second < edges.length; second += 1) {
      addEdgeIntersections(
        edges[first],
        edges[second],
        splitParameters[first],
        splitParameters[second]
      );
    }
  }

  const occupied = (point: FloorPlanPointMmV2) =>
    regions.some((region) => isPointInRegion(point, region)) &&
    !exclusions.some((ring) => isPointInPlanarRing(point, ring));
  const boundarySegments = new Map<string, PlanarEdge>();
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex += 1) {
    const edge = edges[edgeIndex];
    const parameters = [...splitParameters[edgeIndex]]
      .sort((left, right) => left - right)
      .filter(
        (value, index, values) =>
          index === 0 || Math.abs(value - values[index - 1]) > INTERSECTION_EPSILON
      );
    for (let index = 0; index < parameters.length - 1; index += 1) {
      const start = interpolate(edge, parameters[index]);
      const end = interpolate(edge, parameters[index + 1]);
      const dx = end.xMm - start.xMm;
      const dz = end.zMm - start.zMm;
      const length = Math.hypot(dx, dz);
      if (length < MINIMUM_SEGMENT_MM) continue;
      const midpoint = {
        xMm: (start.xMm + end.xMm) / 2,
        zMm: (start.zMm + end.zMm) / 2,
      };
      const sampleDistance = Math.min(
        BOUNDARY_SAMPLE_MM,
        Math.max(MINIMUM_SEGMENT_MM * 2, length / 10)
      );
      const normal = {
        xMm: (-dz / length) * sampleDistance,
        zMm: (dx / length) * sampleDistance,
      };
      const leftOccupied = occupied({
        xMm: midpoint.xMm + normal.xMm,
        zMm: midpoint.zMm + normal.zMm,
      });
      const rightOccupied = occupied({
        xMm: midpoint.xMm - normal.xMm,
        zMm: midpoint.zMm - normal.zMm,
      });
      if (leftOccupied === rightOccupied) continue;
      const segment = leftOccupied ? { start, end } : { start: end, end: start };
      boundarySegments.set(
        `${pointKey(segment.start)}>${pointKey(segment.end)}`,
        segment
      );
    }
  }

  const loops = buildBoundaryLoops([...boundarySegments.values()]);
  const outers = loops
    .filter((loop) => signedPlanarRingAreaSquareMm(loop) > 0)
    .map((outer) => ({ outer, holes: [] as FloorPlanPointMmV2[][] }));
  const holes = loops.filter((loop) => signedPlanarRingAreaSquareMm(loop) < 0);
  for (const hole of holes) {
    const owner = outers
      .filter((polygon) => isPointInPlanarRing(hole[0], polygon.outer))
      .sort(
        (left, right) =>
          Math.abs(signedPlanarRingAreaSquareMm(left.outer)) -
          Math.abs(signedPlanarRingAreaSquareMm(right.outer))
      )[0];
    owner?.holes.push(hole);
  }
  return outers.sort((left, right) =>
    polygonSortKey(left).localeCompare(polygonSortKey(right))
  );
}
