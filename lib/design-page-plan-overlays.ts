import {
  metersToMm,
  mmToMeters,
  type RoomOpening2D,
} from "@/lib/editorScene";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import {
  DEFAULT_DOOR_HEIGHT_MM,
  DEFAULT_WINDOW_HEIGHT_MM,
  DEFAULT_WINDOW_SILL_MM,
} from "@/lib/design-page-opening-dimensions";
import {
  resolveDesignPageOpeningHost,
} from "@/lib/design-page-opening-host";
import {
  clampOpeningCenterAlong,
  legacyOpeningOffsetAtWorldPoint,
  projectWorldPointToOpeningHost,
  worldPointAtLegacyOpeningOffset,
  worldPointAtOpeningHostAlong,
} from "@/lib/design-page-opening-interaction";
import {
  applyOpeningKindPlanToMetrics,
  type DesignPageOpeningMetricsPatch,
} from "@/lib/design-page-opening-metrics";

export type {
  RoomRendererAnnotation,
  RoomRendererFixedElement,
  RoomRendererOpening,
} from "@/lib/design-page-plan-overlay-model";

export {
  mapPlanAnnotationsToRoomRenderer,
  mapPlanFixedElementsToRoomRenderer,
  mapPlanOpeningsToRoomRenderer,
  movePlanAnnotation,
  movePlanFixedElement,
} from "@/lib/design-page-plan-overlay-projections";

export type PlanOpeningMetricsParams = {
  rooms: readonly HousePlanRoom2D[];
  planWidthMeters: number;
  planDepthMeters: number;
};

export const PLAN_OPENING_DEFAULT_HEIGHT_METERS = DEFAULT_DOOR_HEIGHT_MM / 1000;
export const PLAN_WINDOW_DEFAULT_HEIGHT_METERS = DEFAULT_WINDOW_HEIGHT_MM / 1000;
export const PLAN_WINDOW_DEFAULT_BOTTOM_METERS = DEFAULT_WINDOW_SILL_MM / 1000;
export const PLAN_OPENING_MIN_HEIGHT_METERS = 0.001;
export const PLAN_OPENING_MAX_HEIGHT_METERS = 3.2;
const PLAN_OPENING_MIN_WIDTH_METERS = 0.4;
export const PLAN_OPENING_EDGE_PADDING_METERS = 0.03;

export {
  resolvePlanOpeningVerticalMetrics,
  type PlanOpeningVerticalMetrics,
} from "@/lib/design-page-plan-opening-vertical";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getPlanOpeningWallSpanMeters(
  opening: RoomOpening2D,
  params: PlanOpeningMetricsParams
): number {
  const resolution = resolveDesignPageOpeningHost(opening, params.rooms);
  return resolution.status === "resolved" ? resolution.host.spanMeters : 0;
}

export function clampPlanOpeningMetrics(
  opening: RoomOpening2D,
  params: PlanOpeningMetricsParams
): RoomOpening2D {
  let resolution = resolveDesignPageOpeningHost(opening, params.rooms);
  let requestedWorldPoint: { x: number; z: number } | null = null;
  const owningRoom = opening.roomId
    ? params.rooms.find((room) => room.id === opening.roomId)
    : undefined;
  if (resolution.status !== "resolved" && owningRoom?.shape === "rectangle") {
    resolution = resolveDesignPageOpeningHost(
      { ...opening, offsetMm: 0 },
      params.rooms
    );
    if (resolution.status === "resolved") {
      requestedWorldPoint = worldPointAtLegacyOpeningOffset(
        resolution.host, mmToMeters(opening.offsetMm)
      );
    }
  }
  if (resolution.status !== "resolved") return opening;
  const host = resolution.host;
  const spanMeters = host.spanMeters;
  const requestedWidthMeters = mmToMeters(opening.widthMm);
  const maxWidthMeters = Math.max(
    PLAN_OPENING_MIN_WIDTH_METERS,
    spanMeters - PLAN_OPENING_EDGE_PADDING_METERS * 2
  );
  const widthMeters = clamp(
    Number.isFinite(requestedWidthMeters) ? requestedWidthMeters : 0.9,
    PLAN_OPENING_MIN_WIDTH_METERS,
    maxWidthMeters
  );
  const low = widthMeters / 2 + PLAN_OPENING_EDGE_PADDING_METERS;
  const high = spanMeters - widthMeters / 2 - PLAN_OPENING_EDGE_PADDING_METERS;
  const alongSegmentMeters = clampOpeningCenterAlong({
    host,
    centerAlongMeters: clamp(
      requestedWorldPoint
        ? projectWorldPointToOpeningHost(host, requestedWorldPoint)
        : host.alongSegmentMeters,
      low,
      high
    ),
    widthMeters,
    edgePaddingMeters: PLAN_OPENING_EDGE_PADDING_METERS,
  });
  const clampedWorldCenter = worldPointAtOpeningHostAlong(host, alongSegmentMeters);
  const offsetMeters = legacyOpeningOffsetAtWorldPoint(host, clampedWorldCenter);
  if (offsetMeters === null) return opening;

  return {
    ...opening,
    widthMm: metersToMm(widthMeters),
    offsetMm: metersToMm(offsetMeters),
  };
}

function offsetForReassignedWall(
  opening: RoomOpening2D,
  wall: RoomOpening2D["wall"],
  params: PlanOpeningMetricsParams
) {
  if (wall === opening.wall) return opening.offsetMm;
  const previous = resolveDesignPageOpeningHost(opening, params.rooms);
  const requestedWorldCenter = previous.status === "resolved"
    ? previous.host.worldCenter
    : previous.requestedWorldCenter;
  const reassigned = resolveDesignPageOpeningHost(
    { ...opening, wall, offsetMm: 0 },
    params.rooms
  );
  if (!requestedWorldCenter || reassigned.status !== "resolved") return 0;
  const centerAlongMeters = clampOpeningCenterAlong({
    host: reassigned.host,
    centerAlongMeters: projectWorldPointToOpeningHost(
      reassigned.host,
      requestedWorldCenter
    ),
    widthMeters: mmToMeters(opening.widthMm),
    edgePaddingMeters: PLAN_OPENING_EDGE_PADDING_METERS,
  });
  const worldCenter = worldPointAtOpeningHostAlong(
    reassigned.host,
    centerAlongMeters
  );
  const offsetMeters = legacyOpeningOffsetAtWorldPoint(
    reassigned.host,
    worldCenter
  );
  return offsetMeters === null ? 0 : metersToMm(offsetMeters);
}

export function updatePlanOpeningMetrics(
  openings: RoomOpening2D[],
  id: string,
  metrics: DesignPageOpeningMetricsPatch,
  params: PlanOpeningMetricsParams
): RoomOpening2D[] {
  return openings.map((opening) =>
    opening.id === id ? buildPlanOpeningMetricsCandidate(opening, metrics, params) : opening
  );
}

function nextOpeningEvidence(
  opening: RoomOpening2D,
  metrics: Parameters<typeof buildPlanOpeningMetricsCandidate>[1]
) {
  const evidence = {
    ...opening.evidence,
    ...(metrics.widthMeters !== undefined && metrics.widthEvidence ? { width: metrics.widthEvidence } : {}),
    ...(metrics.heightMeters !== undefined && metrics.heightEvidence ? { height: metrics.heightEvidence } : {}),
    ...(metrics.bottomMeters !== undefined && metrics.bottomEvidence ? { sillHeight: metrics.bottomEvidence } : {}),
  };
  return Object.keys(evidence).length ? evidence : undefined;
}

export function buildPlanOpeningMetricsCandidate(
  opening: RoomOpening2D,
  metrics: DesignPageOpeningMetricsPatch,
  params: PlanOpeningMetricsParams
): RoomOpening2D {
  const plannedMetrics = applyOpeningKindPlanToMetrics(opening, metrics);
  const evidence = nextOpeningEvidence(opening, plannedMetrics);
  const wall = plannedMetrics.wall ?? opening.wall;
  const reassignedOffsetMm = plannedMetrics.wall
    ? offsetForReassignedWall(opening, wall, params)
    : opening.offsetMm;
  return clampPlanOpeningMetrics(
    {
      ...opening,
      widthMm:
        plannedMetrics.widthMeters !== undefined
          ? metersToMm(plannedMetrics.widthMeters)
          : opening.widthMm,
      offsetMm:
        plannedMetrics.offsetMeters !== undefined
          ? metersToMm(plannedMetrics.offsetMeters)
          : reassignedOffsetMm,
      ...(plannedMetrics.heightMeters !== undefined
        ? { heightMm: metersToMm(plannedMetrics.heightMeters) } : {}),
      ...(plannedMetrics.bottomMeters !== undefined
        ? { bottomMm: metersToMm(Math.max(0, plannedMetrics.bottomMeters)) } : {}),
      kind: plannedMetrics.kind ?? opening.kind,
      wall,
      ...(evidence ? { evidence } : {}),
    },
    params
  );
}

export function movePlanOpening(
  openings: RoomOpening2D[],
  id: string,
  offsetMeters: number,
  params?: PlanOpeningMetricsParams
): RoomOpening2D[] {
  return openings.map((opening) => {
    if (opening.id !== id) return opening;

    const nextOpening = { ...opening, offsetMm: metersToMm(offsetMeters) };
    return params ? clampPlanOpeningMetrics(nextOpening, params) : nextOpening;
  });
}
