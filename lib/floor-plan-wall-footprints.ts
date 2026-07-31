import type {
  FloorPlanPointMmV2,
  FloorPlanWallPathV2,
} from "@/lib/floor-plan-document-v2";

export type CanonicalFloorPlanWallFootprint = {
  startLeft: FloorPlanPointMmV2;
  endLeft: FloorPlanPointMmV2;
  endRight: FloorPlanPointMmV2;
  startRight: FloorPlanPointMmV2;
};

type WallLineSegment = {
  start: FloorPlanPointMmV2;
  end: FloorPlanPointMmV2;
  startOffsetMm: number;
  endOffsetMm: number;
};

type WallSolid = WallLineSegment & {
  bottomMm: number;
  topMm: number;
  footprint: CanonicalFloorPlanWallFootprint;
};

type WallWithFootprints = {
  path: FloorPlanWallPathV2;
  thicknessMm: number;
  centerlineSegments: WallLineSegment[];
  solids: WallSolid[];
};

const WALL_JOIN_EPSILON_MM = 0.01;

function roundWallJoinCoordinate(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundedWallJoinPoint(point: FloorPlanPointMmV2): FloorPlanPointMmV2 {
  return {
    xMm: roundWallJoinCoordinate(point.xMm),
    zMm: roundWallJoinCoordinate(point.zMm),
  };
}

export function buildRectangularWallFootprint(
  segment: WallLineSegment,
  thicknessMm: number
): CanonicalFloorPlanWallFootprint {
  const dx = segment.end.xMm - segment.start.xMm;
  const dz = segment.end.zMm - segment.start.zMm;
  const length = Math.hypot(dx, dz);
  if (length <= WALL_JOIN_EPSILON_MM) {
    return {
      startLeft: { ...segment.start },
      endLeft: { ...segment.end },
      endRight: { ...segment.end },
      startRight: { ...segment.start },
    };
  }
  const halfThicknessMm = thicknessMm / 2;
  const normalX = (-dz / length) * halfThicknessMm;
  const normalZ = (dx / length) * halfThicknessMm;
  return {
    startLeft: roundedWallJoinPoint({
      xMm: segment.start.xMm + normalX,
      zMm: segment.start.zMm + normalZ,
    }),
    endLeft: roundedWallJoinPoint({
      xMm: segment.end.xMm + normalX,
      zMm: segment.end.zMm + normalZ,
    }),
    endRight: roundedWallJoinPoint({
      xMm: segment.end.xMm - normalX,
      zMm: segment.end.zMm - normalZ,
    }),
    startRight: roundedWallJoinPoint({
      xMm: segment.start.xMm - normalX,
      zMm: segment.start.zMm - normalZ,
    }),
  };
}

type WallJoinSide = 1 | -1;
type WallJoinEndpoint = "start" | "end";

function offsetWallLine(
  segment: WallLineSegment,
  thicknessMm: number,
  side: WallJoinSide
) {
  const dx = segment.end.xMm - segment.start.xMm;
  const dz = segment.end.zMm - segment.start.zMm;
  const length = Math.hypot(dx, dz);
  if (length <= WALL_JOIN_EPSILON_MM) return null;
  const direction = { xMm: dx / length, zMm: dz / length };
  const halfThicknessMm = thicknessMm / 2;
  return {
    point: {
      xMm: segment.start.xMm + (-direction.zMm * halfThicknessMm) * side,
      zMm: segment.start.zMm + (direction.xMm * halfThicknessMm) * side,
    },
    direction,
  };
}

function intersectWallOffsetLines(
  first: ReturnType<typeof offsetWallLine>,
  second: ReturnType<typeof offsetWallLine>
) {
  if (!first || !second) return null;
  const determinant =
    first.direction.xMm * second.direction.zMm -
    first.direction.zMm * second.direction.xMm;
  if (Math.abs(determinant) <= 0.000001) return null;
  const deltaX = second.point.xMm - first.point.xMm;
  const deltaZ = second.point.zMm - first.point.zMm;
  const distanceAlongFirst =
    (deltaX * second.direction.zMm - deltaZ * second.direction.xMm) /
    determinant;
  return roundedWallJoinPoint({
    xMm: first.point.xMm + first.direction.xMm * distanceAlongFirst,
    zMm: first.point.zMm + first.direction.zMm * distanceAlongFirst,
  });
}

function isSafeWallJoinPoint(
  point: FloorPlanPointMmV2 | null,
  joint: FloorPlanPointMmV2,
  maximumThicknessMm: number
): point is FloorPlanPointMmV2 {
  if (!point || !Number.isFinite(point.xMm) || !Number.isFinite(point.zMm)) {
    return false;
  }
  return (
    Math.hypot(point.xMm - joint.xMm, point.zMm - joint.zMm) <=
    Math.max(250, maximumThicknessMm * 4)
  );
}

function setSolidFootprintEndpoint(
  solid: WallSolid,
  endpoint: WallJoinEndpoint,
  side: WallJoinSide,
  point: FloorPlanPointMmV2
) {
  if (endpoint === "start") {
    solid.footprint = {
      ...solid.footprint,
      ...(side === 1 ? { startLeft: point } : { startRight: point }),
    };
    return;
  }
  solid.footprint = {
    ...solid.footprint,
    ...(side === 1 ? { endLeft: point } : { endRight: point }),
  };
}

function joinAdjacentWallSolids(
  previous: WallSolid,
  next: WallSolid,
  thicknessMm: number
) {
  if (
    Math.abs(previous.endOffsetMm - next.startOffsetMm) > WALL_JOIN_EPSILON_MM ||
    Math.hypot(
      previous.end.xMm - next.start.xMm,
      previous.end.zMm - next.start.zMm
    ) > WALL_JOIN_EPSILON_MM
  ) {
    return;
  }
  const left = intersectWallOffsetLines(
    offsetWallLine(previous, thicknessMm, 1),
    offsetWallLine(next, thicknessMm, 1)
  );
  const right = intersectWallOffsetLines(
    offsetWallLine(previous, thicknessMm, -1),
    offsetWallLine(next, thicknessMm, -1)
  );
  if (isSafeWallJoinPoint(left, previous.end, thicknessMm)) {
    setSolidFootprintEndpoint(previous, "end", 1, left);
    setSolidFootprintEndpoint(next, "start", 1, left);
  }
  if (isSafeWallJoinPoint(right, previous.end, thicknessMm)) {
    setSolidFootprintEndpoint(previous, "end", -1, right);
    setSolidFootprintEndpoint(next, "start", -1, right);
  }
}

function miterContinuousWallSolids(wall: WallWithFootprints) {
  const verticalRuns = new Map<string, WallSolid[]>();
  for (const solid of wall.solids) {
    const key = `${solid.bottomMm}:${solid.topMm}`;
    const run = verticalRuns.get(key) ?? [];
    run.push(solid);
    verticalRuns.set(key, run);
  }
  for (const run of verticalRuns.values()) {
    run.sort((left, right) => left.startOffsetMm - right.startOffsetMm);
    for (let index = 0; index < run.length - 1; index += 1) {
      joinAdjacentWallSolids(run[index], run[index + 1], wall.thicknessMm);
    }
  }
}

type AuthoredWallEndpoint = {
  wall: WallWithFootprints;
  endpoint: WallJoinEndpoint;
  segment: WallLineSegment;
  joint: FloorPlanPointMmV2;
  angle: number;
};

function buildAuthoredWallEndpoint(
  wall: WallWithFootprints,
  endpoint: WallJoinEndpoint
): AuthoredWallEndpoint | null {
  const segment =
    endpoint === "start"
      ? wall.centerlineSegments[0]
      : wall.centerlineSegments.at(-1);
  if (!segment) return null;
  const dx = segment.end.xMm - segment.start.xMm;
  const dz = segment.end.zMm - segment.start.zMm;
  const length = Math.hypot(dx, dz);
  if (length <= WALL_JOIN_EPSILON_MM) return null;
  const directionSign = endpoint === "start" ? 1 : -1;
  return {
    wall,
    endpoint,
    segment,
    joint: endpoint === "start" ? segment.start : segment.end,
    angle: Math.atan2((dz / length) * directionSign, (dx / length) * directionSign),
  };
}

function authoredEndpointOriginalSide(
  endpoint: WallJoinEndpoint,
  outwardSide: WallJoinSide
): WallJoinSide {
  return endpoint === "start" ? outwardSide : outwardSide === 1 ? -1 : 1;
}

function authoredEndpointOffsetLine(
  reference: AuthoredWallEndpoint,
  outwardSide: WallJoinSide
) {
  return offsetWallLine(
    reference.segment,
    reference.wall.thicknessMm,
    authoredEndpointOriginalSide(reference.endpoint, outwardSide)
  );
}

function setAuthoredEndpointPoint(
  reference: AuthoredWallEndpoint,
  outwardSide: WallJoinSide,
  point: FloorPlanPointMmV2
) {
  const originalSide = authoredEndpointOriginalSide(reference.endpoint, outwardSide);
  const wallLengthMm = reference.wall.centerlineSegments.at(-1)?.endOffsetMm ?? 0;
  for (const solid of reference.wall.solids) {
    const touchesEndpoint =
      reference.endpoint === "start"
        ? Math.abs(solid.startOffsetMm) <= WALL_JOIN_EPSILON_MM
        : Math.abs(solid.endOffsetMm - wallLengthMm) <= WALL_JOIN_EPSILON_MM;
    if (touchesEndpoint) {
      setSolidFootprintEndpoint(solid, reference.endpoint, originalSide, point);
    }
  }
}

function miterAuthoredWallNode(references: AuthoredWallEndpoint[]) {
  if (references.length < 2) return;
  const sorted = [...references].sort((left, right) => left.angle - right.angle);
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[(index + 1) % sorted.length];
    const angularGap =
      (next.angle - current.angle + Math.PI * 2) % (Math.PI * 2);
    if (angularGap <= 0.000001) continue;
    const point = intersectWallOffsetLines(
      authoredEndpointOffsetLine(current, 1),
      authoredEndpointOffsetLine(next, -1)
    );
    const maximumThicknessMm = Math.max(
      current.wall.thicknessMm,
      next.wall.thicknessMm
    );
    if (!isSafeWallJoinPoint(point, current.joint, maximumThicknessMm)) continue;
    setAuthoredEndpointPoint(current, 1, point);
    setAuthoredEndpointPoint(next, -1, point);
  }
}

function wallFootprintIsStable(
  solid: WallSolid,
  wall: WallWithFootprints
) {
  const thicknessMm = wall.thicknessMm;
  const dx = solid.end.xMm - solid.start.xMm;
  const dz = solid.end.zMm - solid.start.zMm;
  const lengthMm = Math.hypot(dx, dz);
  if (lengthMm <= WALL_JOIN_EPSILON_MM) return false;
  // A span shorter than its own thickness is normally an adjacency ownership
  // transition rather than a distinct physical wall. A square swept footprint
  // unions safely with its neighbors; two independently extended miters can
  // cross and expose the corner notch seen in imported plans.
  const wallLengthMm =
    wall.centerlineSegments.at(-1)?.endOffsetMm ?? lengthMm;
  if (
    wall.path.kind === "line" &&
    wallLengthMm < thicknessMm - WALL_JOIN_EPSILON_MM
  ) {
    return false;
  }

  const points = [
    solid.footprint.startLeft,
    solid.footprint.endLeft,
    solid.footprint.endRight,
    solid.footprint.startRight,
  ];
  let signedAreaTwice = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    signedAreaTwice +=
      current.xMm * next.zMm - next.xMm * current.zMm;
  }
  const containsPoint = (point: FloorPlanPointMmV2) => {
    let inside = false;
    for (
      let index = 0, previousIndex = points.length - 1;
      index < points.length;
      previousIndex = index++
    ) {
      const current = points[index];
      const previous = points[previousIndex];
      const edgeX = current.xMm - previous.xMm;
      const edgeZ = current.zMm - previous.zMm;
      const edgeLengthSquared = edgeX * edgeX + edgeZ * edgeZ;
      if (edgeLengthSquared > WALL_JOIN_EPSILON_MM * WALL_JOIN_EPSILON_MM) {
        const projection = Math.max(
          0,
          Math.min(
            1,
            ((point.xMm - previous.xMm) * edgeX +
              (point.zMm - previous.zMm) * edgeZ) /
              edgeLengthSquared
          )
        );
        const nearestX = previous.xMm + edgeX * projection;
        const nearestZ = previous.zMm + edgeZ * projection;
        if (
          Math.hypot(point.xMm - nearestX, point.zMm - nearestZ) <=
          WALL_JOIN_EPSILON_MM
        ) {
          return true;
        }
      }
      const crossesRay =
        current.zMm > point.zMm !== previous.zMm > point.zMm;
      if (
        crossesRay &&
        point.xMm <
          ((previous.xMm - current.xMm) *
            (point.zMm - current.zMm)) /
            (previous.zMm - current.zMm) +
            current.xMm
      ) {
        inside = !inside;
      }
    }
    return inside;
  };
  const containsOwnCenterline = [0.25, 0.5, 0.75].every((amount) =>
    containsPoint({
      xMm: solid.start.xMm + dx * amount,
      zMm: solid.start.zMm + dz * amount,
    })
  );
  return (
    Number.isFinite(signedAreaTwice) &&
    Math.abs(signedAreaTwice) >=
      Math.max(1, lengthMm * thicknessMm * 0.25) &&
    containsOwnCenterline
  );
}

function stabilizeWallFootprints(walls: WallWithFootprints[]) {
  for (const wall of walls) {
    for (const solid of wall.solids) {
      if (wallFootprintIsStable(solid, wall)) continue;
      solid.footprint = buildRectangularWallFootprint(
        solid,
        wall.thicknessMm
      );
    }
  }
}

/**
 * Derive watertight wall footprints from authored wall topology. Continuous
 * arc fragments and every wall incident to the same authored vertex share the
 * same corner coordinates. The compiler scene remains unchanged; only the 3D
 * extrusion footprint is enriched.
 */
export function applyCanonicalWallFootprintJoins<TWall extends WallWithFootprints>(
  walls: TWall[]
) {
  for (const wall of walls) miterContinuousWallSolids(wall);

  const endpointsByVertexId = new Map<string, AuthoredWallEndpoint[]>();
  for (const wall of walls) {
    const endpointDefinitions = [
      { vertexId: wall.path.startVertexId, endpoint: "start" as const },
      { vertexId: wall.path.endVertexId, endpoint: "end" as const },
    ];
    for (const definition of endpointDefinitions) {
      const reference = buildAuthoredWallEndpoint(wall, definition.endpoint);
      if (!reference) continue;
      const references = endpointsByVertexId.get(definition.vertexId) ?? [];
      references.push(reference);
      endpointsByVertexId.set(definition.vertexId, references);
    }
  }
  for (const references of endpointsByVertexId.values()) {
    miterAuthoredWallNode(references);
  }
  stabilizeWallFootprints(walls);
  return walls;
}
