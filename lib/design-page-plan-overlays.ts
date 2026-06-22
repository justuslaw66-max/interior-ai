import {
  metersToMm,
  mmToMeters,
  type EditorAnnotation2D,
  type FixedElement2D,
  type RoomOpening2D,
} from "@/lib/editorScene";

export type RoomRendererOpening = {
  id: string;
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  kind: "door" | "window";
  offset: number;
  width: number;
};

export type RoomRendererFixedElement = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  label?: string;
};

export type RoomRendererAnnotation = {
  id: string;
  x: number;
  z: number;
  text: string;
  kind: "note" | "callout" | "room_tag";
  anchorX?: number;
  anchorZ?: number;
};

type PlanOpeningRoomBounds = {
  id: string;
  w: number;
  d: number;
};

type PlanOpeningMetricsParams = {
  rooms?: PlanOpeningRoomBounds[];
  planWidthMeters: number;
  planDepthMeters: number;
};

const PLAN_OPENING_MIN_WIDTH_METERS = 0.4;
const PLAN_OPENING_EDGE_PADDING_METERS = 0.03;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function getPlanOpeningWallSpanMeters(
  opening: RoomOpening2D,
  params: PlanOpeningMetricsParams
): number {
  const room = opening.roomId
    ? params.rooms?.find((entry) => entry.id === opening.roomId)
    : undefined;

  if (opening.wall === "north" || opening.wall === "south") {
    return room?.w ?? params.planWidthMeters;
  }

  return room?.d ?? params.planDepthMeters;
}

export function clampPlanOpeningMetrics(
  opening: RoomOpening2D,
  params: PlanOpeningMetricsParams
): RoomOpening2D {
  const spanMeters = Math.max(
    PLAN_OPENING_MIN_WIDTH_METERS + PLAN_OPENING_EDGE_PADDING_METERS * 2,
    getPlanOpeningWallSpanMeters(opening, params)
  );
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
  const maxOffsetMeters = Math.max(
    0,
    spanMeters / 2 - widthMeters / 2 - PLAN_OPENING_EDGE_PADDING_METERS
  );
  const requestedOffsetMeters = mmToMeters(opening.offsetMm);

  return {
    ...opening,
    widthMm: metersToMm(widthMeters),
    offsetMm: metersToMm(
      clamp(
        Number.isFinite(requestedOffsetMeters) ? requestedOffsetMeters : 0,
        -maxOffsetMeters,
        maxOffsetMeters
      )
    ),
  };
}

export function updatePlanOpeningMetrics(
  openings: RoomOpening2D[],
  id: string,
  metrics: {
    widthMeters?: number;
    offsetMeters?: number;
    kind?: RoomOpening2D["kind"];
  },
  params: PlanOpeningMetricsParams
): RoomOpening2D[] {
  return openings.map((opening) => {
    if (opening.id !== id) return opening;

    const nextOpening = {
      ...opening,
      widthMm:
        metrics.widthMeters !== undefined
          ? metersToMm(metrics.widthMeters)
          : opening.widthMm,
      offsetMm:
        metrics.offsetMeters !== undefined
          ? metersToMm(metrics.offsetMeters)
          : opening.offsetMm,
      kind: metrics.kind ?? opening.kind,
    };

    return clampPlanOpeningMetrics(nextOpening, params);
  });
}

export function mapPlanOpeningsToRoomRenderer(openings: RoomOpening2D[]): RoomRendererOpening[] {
  return openings.map((opening) => ({
    id: opening.id,
    roomId: opening.roomId,
    wall: opening.wall,
    kind: opening.kind,
    offset: mmToMeters(opening.offsetMm),
    width: mmToMeters(opening.widthMm),
  }));
}

export function mapPlanFixedElementsToRoomRenderer(
  fixedElements: FixedElement2D[]
): RoomRendererFixedElement[] {
  return fixedElements.map((fixed) => ({
    id: fixed.id,
    x: mmToMeters(fixed.xMm),
    z: mmToMeters(fixed.zMm),
    w: mmToMeters(fixed.widthMm),
    d: mmToMeters(fixed.depthMm),
    label: fixed.label,
  }));
}

export function mapPlanAnnotationsToRoomRenderer(
  annotations: EditorAnnotation2D[]
): RoomRendererAnnotation[] {
  return annotations.map((note) => ({
    id: note.id,
    x: mmToMeters(note.xMm),
    z: mmToMeters(note.zMm),
    text: note.text,
    kind: note.kind,
    anchorX: note.anchorXMm !== undefined ? mmToMeters(note.anchorXMm) : undefined,
    anchorZ: note.anchorZMm !== undefined ? mmToMeters(note.anchorZMm) : undefined,
  }));
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

export function movePlanFixedElement(
  fixedElements: FixedElement2D[],
  id: string,
  xMeters: number,
  zMeters: number
): FixedElement2D[] {
  return fixedElements.map((fixed) =>
    fixed.id === id
      ? {
          ...fixed,
          xMm: metersToMm(xMeters),
          zMm: metersToMm(zMeters),
        }
      : fixed
  );
}

export function movePlanAnnotation(
  annotations: EditorAnnotation2D[],
  id: string,
  xMeters: number,
  zMeters: number
): EditorAnnotation2D[] {
  return annotations.map((note) =>
    note.id === id
      ? {
          ...note,
          xMm: metersToMm(xMeters),
          zMm: metersToMm(zMeters),
        }
      : note
  );
}
