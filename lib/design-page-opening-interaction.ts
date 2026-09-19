import type { DesignPagePhysicalWallHost } from "@/lib/design-page-opening-host";
import { getCanonicalPlanLine, type PlanPoint2D } from "@/lib/wall-segment-geometry";

export const OPENING_INTERACTION_TOLERANCE_METERS = 0.001;

type OpeningInteractionHost = Pick<
  DesignPagePhysicalWallHost,
  "segment" | "roomSegment" | "tangent" | "spanMeters"
>;

export function projectWorldPointToOpeningHost(
  host: OpeningInteractionHost,
  point: PlanPoint2D
) {
  return (point.x - host.segment.x1) * host.tangent.x +
    (point.z - host.segment.z1) * host.tangent.z;
}

export function projectWorldDeltaToOpeningHost(
  host: Pick<OpeningInteractionHost, "tangent">,
  delta: PlanPoint2D
) {
  return delta.x * host.tangent.x + delta.z * host.tangent.z;
}

export function worldPointAtOpeningHostAlong(
  host: OpeningInteractionHost,
  alongMeters: number
): PlanPoint2D {
  return {
    x: host.segment.x1 + host.tangent.x * alongMeters,
    z: host.segment.z1 + host.tangent.z * alongMeters,
  };
}

export function legacyOpeningOffsetAtWorldPoint(
  host: Pick<OpeningInteractionHost, "roomSegment">,
  point: PlanPoint2D
) {
  const line = getCanonicalPlanLine(host.roomSegment);
  if (!line) return null;
  const perpendicular = point.x * line.normal.x + point.z * line.normal.z - line.lineOffset;
  if (Math.abs(perpendicular) > OPENING_INTERACTION_TOLERANCE_METERS) return null;
  const along = point.x * line.tangent.x + point.z * line.tangent.z;
  return along - (line.low + line.high) / 2;
}

export function worldPointAtLegacyOpeningOffset(
  host: Pick<OpeningInteractionHost, "roomSegment">,
  offsetMeters: number
): PlanPoint2D | null {
  const line = getCanonicalPlanLine(host.roomSegment);
  if (!line) return null;
  const along = (line.low + line.high) / 2 + offsetMeters;
  return {
    x: line.tangent.x * along + line.normal.x * line.lineOffset,
    z: line.tangent.z * along + line.normal.z * line.lineOffset,
  };
}

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), high);
}

export function clampOpeningCenterAlong({
  host,
  centerAlongMeters,
  widthMeters,
  edgePaddingMeters = 0,
}: {
  host: Pick<OpeningInteractionHost, "spanMeters">;
  centerAlongMeters: number;
  widthMeters: number;
  edgePaddingMeters?: number;
}) {
  const halfWidth = widthMeters / 2;
  return clamp(
    centerAlongMeters,
    edgePaddingMeters + halfWidth,
    host.spanMeters - edgePaddingMeters - halfWidth
  );
}

export function moveOpeningCenterFromWorldPoint({
  host,
  pointerWorld,
  grabDeltaAlongMeters,
  widthMeters,
  edgePaddingMeters = 0,
}: {
  host: OpeningInteractionHost;
  pointerWorld: PlanPoint2D;
  grabDeltaAlongMeters: number;
  widthMeters: number;
  edgePaddingMeters?: number;
}) {
  const centerAlongMeters = clampOpeningCenterAlong({
    host,
    centerAlongMeters:
      projectWorldPointToOpeningHost(host, pointerWorld) + grabDeltaAlongMeters,
    widthMeters,
    edgePaddingMeters,
  });
  const worldCenter = worldPointAtOpeningHostAlong(host, centerAlongMeters);
  return {
    centerAlongMeters,
    worldCenter,
    offsetMeters: legacyOpeningOffsetAtWorldPoint(host, worldCenter),
  };
}

export function resizeOpeningFromWorldPoint({
  host,
  pointerWorld,
  fixedAlongMeters,
  movingEdge,
  minimumWidthMeters,
  edgePaddingMeters = 0,
}: {
  host: OpeningInteractionHost;
  pointerWorld: PlanPoint2D;
  fixedAlongMeters: number;
  movingEdge: "start" | "end";
  minimumWidthMeters: number;
  edgePaddingMeters?: number;
}) {
  const low = edgePaddingMeters;
  const high = host.spanMeters - edgePaddingMeters;
  const maximumWidth = Math.max(0, high - low);
  const minimumWidth = Math.min(minimumWidthMeters, maximumWidth);
  const pointerAlong = clamp(projectWorldPointToOpeningHost(host, pointerWorld), low, high);
  const movingAlongMeters = movingEdge === "start"
    ? Math.min(pointerAlong, fixedAlongMeters - minimumWidth)
    : Math.max(pointerAlong, fixedAlongMeters + minimumWidth);
  const boundedMoving = clamp(movingAlongMeters, low, high);
  const startAlongMeters = Math.min(boundedMoving, fixedAlongMeters);
  const endAlongMeters = Math.max(boundedMoving, fixedAlongMeters);
  const centerAlongMeters = (startAlongMeters + endAlongMeters) / 2;
  const worldCenter = worldPointAtOpeningHostAlong(host, centerAlongMeters);
  return {
    startAlongMeters,
    endAlongMeters,
    centerAlongMeters,
    widthMeters: endAlongMeters - startAlongMeters,
    worldCenter,
    offsetMeters: legacyOpeningOffsetAtWorldPoint(host, worldCenter),
  };
}
