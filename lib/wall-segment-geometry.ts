export type PlanPoint2D = { x: number; z: number };

export type PlanSegment2D = {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
};

export type PlanSegmentFrame2D = {
  start: PlanPoint2D;
  end: PlanPoint2D;
  center: PlanPoint2D;
  tangent: PlanPoint2D;
  normal: PlanPoint2D;
  length: number;
};

export function getPlanSegmentFrame(
  segment: PlanSegment2D
): PlanSegmentFrame2D | null {
  const dx = segment.x2 - segment.x1;
  const dz = segment.z2 - segment.z1;
  const length = Math.hypot(dx, dz);
  if (!Number.isFinite(length) || length <= 0) return null;
  const tangent = { x: dx / length, z: dz / length };
  return {
    start: { x: segment.x1, z: segment.z1 },
    end: { x: segment.x2, z: segment.z2 },
    center: {
      x: (segment.x1 + segment.x2) / 2,
      z: (segment.z1 + segment.z2) / 2,
    },
    tangent,
    normal: { x: -tangent.z, z: tangent.x },
    length,
  };
}

export function projectPointOntoPlanSegment(
  point: PlanPoint2D,
  segment: PlanSegment2D
) {
  const frame = getPlanSegmentFrame(segment);
  if (!frame) return null;
  const dx = point.x - frame.start.x;
  const dz = point.z - frame.start.z;
  const alongFromStart = dx * frame.tangent.x + dz * frame.tangent.z;
  const perpendicular = dx * frame.normal.x + dz * frame.normal.z;
  return {
    frame,
    alongFromStart,
    offsetFromCenter: alongFromStart - frame.length / 2,
    perpendicular,
    projected: {
      x: frame.start.x + frame.tangent.x * alongFromStart,
      z: frame.start.z + frame.tangent.z * alongFromStart,
    },
  };
}

export function pointOnPlanSegmentAtCoordinate(
  segment: PlanSegment2D,
  axis: "x" | "z",
  value: number,
  tolerance = 0.001
): PlanPoint2D | null {
  const frame = getPlanSegmentFrame(segment);
  if (!frame) return null;
  const component = axis === "x" ? frame.tangent.x : frame.tangent.z;
  const startValue = axis === "x" ? frame.start.x : frame.start.z;
  if (Math.abs(component) <= tolerance) {
    return Math.abs(startValue - value) <= tolerance ? frame.center : null;
  }
  const along = (value - startValue) / component;
  if (along < -tolerance || along > frame.length + tolerance) return null;
  return {
    x: frame.start.x + frame.tangent.x * along,
    z: frame.start.z + frame.tangent.z * along,
  };
}

export function getCanonicalPlanLine(segment: PlanSegment2D) {
  const frame = getPlanSegmentFrame(segment);
  if (!frame) return null;
  let tangent = frame.tangent;
  if (tangent.x < 0 || (Math.abs(tangent.x) <= 0.000001 && tangent.z < 0)) {
    tangent = { x: -tangent.x, z: -tangent.z };
  }
  const normal = { x: -tangent.z, z: tangent.x };
  const lineOffset = frame.start.x * normal.x + frame.start.z * normal.z;
  const start = frame.start.x * tangent.x + frame.start.z * tangent.z;
  const end = frame.end.x * tangent.x + frame.end.z * tangent.z;
  return {
    tangent,
    normal,
    lineOffset,
    low: Math.min(start, end),
    high: Math.max(start, end),
  };
}

export function pointOnCanonicalPlanLine(
  tangent: PlanPoint2D,
  normal: PlanPoint2D,
  lineOffset: number,
  along: number
): PlanPoint2D {
  return {
    x: tangent.x * along + normal.x * lineOffset,
    z: tangent.z * along + normal.z * lineOffset,
  };
}
