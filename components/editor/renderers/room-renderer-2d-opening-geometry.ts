import type { DesignPageOpeningHostResolution } from "@/lib/design-page-opening-host";
import type { FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";

export type Opening2D = {
  id: string;
  roomId?: string;
  wall: "north" | "south" | "east" | "west";
  offset: number;
  width: number;
  height?: number;
  kind: "door" | "window";
  doorStyle?: "swing" | "sliding" | "folding" | "open";
  hostWorldCenter?: { x: number; z: number };
  hostTangent?: { x: number; z: number };
  hostInwardNormal?: { x: number; z: number };
  hostResolution?: DesignPageOpeningHostResolution;
  widthEvidence?: FloorPlanPropertyEvidenceV2;
};

export type OpeningSegment2D = {
  id: string;
  roomId?: string;
  kind: Opening2D["kind"];
  doorStyle?: NonNullable<Opening2D["doorStyle"]>;
  wall: Opening2D["wall"];
  inwardNormal?: { x: number; z: number };
  points: [[number, number, number], [number, number, number]];
};

export type OpeningRenderSegment2D = OpeningSegment2D & {
  offset: number;
  width: number;
  center: [number, number, number];
  hitSize: [number, number];
  hitRotationRad?: number;
  identityLabelPosition: [number, number, number];
  labelPosition: [number, number, number];
};

type OpeningRoomBounds = { id: string; x: number; z: number; w: number; d: number };
const coordinate = (value: number | undefined, fallback: number) => value ?? fallback;

function vectorOpeningSegment(
  opening: Opening2D,
  minimumHitLength: number,
  hitDepth: number
): OpeningRenderSegment2D {
  const center = opening.hostWorldCenter!;
  const tangent = opening.hostTangent!;
  const normal = opening.hostInwardNormal ?? { x: 0, z: 0 };
  const halfWidth = opening.width / 2;
  return {
    id: opening.id, roomId: opening.roomId, kind: opening.kind,
    doorStyle: opening.doorStyle, wall: opening.wall,
    inwardNormal: opening.hostInwardNormal, offset: opening.offset, width: opening.width,
    center: [center.x, 0.003, center.z],
    hitSize: [Math.max(opening.width, minimumHitLength), hitDepth],
    hitRotationRad: Math.atan2(tangent.z, tangent.x),
    identityLabelPosition: [center.x + normal.x * 0.22, 0.07, center.z + normal.z * 0.22],
    labelPosition: [center.x - normal.x * 0.34, 0.07, center.z - normal.z * 0.34],
    points: [
      [center.x - tangent.x * halfWidth, 0.0022, center.z - tangent.z * halfWidth],
      [center.x + tangent.x * halfWidth, 0.0022, center.z + tangent.z * halfWidth],
    ],
  };
}

function horizontalOpeningSegment(
  opening: Opening2D,
  room: OpeningRoomBounds | undefined,
  defaultDepth: number,
  minimumHitLength: number,
  hitDepth: number
): OpeningRenderSegment2D {
  const centerX = room?.x ?? 0;
  const centerZ = room?.z ?? 0;
  const boundary = coordinate(
    opening.hostWorldCenter?.z,
    centerZ + (opening.wall === "north" ? -(room?.d ?? defaultDepth) / 2 : (room?.d ?? defaultDepth) / 2)
  );
  const alongCenter = coordinate(opening.hostWorldCenter?.x, centerX + opening.offset);
  const start = alongCenter - opening.width / 2;
  const end = start + opening.width;
  const inwardSign = opening.wall === "north" ? 1 : -1;
  return {
    id: opening.id, roomId: opening.roomId, kind: opening.kind,
    doorStyle: opening.doorStyle, wall: opening.wall,
    offset: opening.offset, width: opening.width,
    center: [alongCenter, 0.003, boundary],
    hitSize: [Math.max(opening.width, minimumHitLength), hitDepth],
    identityLabelPosition: [alongCenter, 0.07, boundary + inwardSign * 0.22],
    labelPosition: [alongCenter, 0.07, boundary - inwardSign * 0.34],
    points: [[start, 0.0022, boundary], [end, 0.0022, boundary]],
  };
}

function verticalOpeningSegment(
  opening: Opening2D,
  room: OpeningRoomBounds | undefined,
  defaultWidth: number,
  minimumHitLength: number,
  hitDepth: number
): OpeningRenderSegment2D {
  const centerX = room?.x ?? 0;
  const centerZ = room?.z ?? 0;
  const boundary = coordinate(
    opening.hostWorldCenter?.x,
    centerX + (opening.wall === "west" ? -(room?.w ?? defaultWidth) / 2 : (room?.w ?? defaultWidth) / 2)
  );
  const alongCenter = coordinate(opening.hostWorldCenter?.z, centerZ + opening.offset);
  const start = alongCenter - opening.width / 2;
  const end = start + opening.width;
  const inwardSign = opening.wall === "west" ? 1 : -1;
  return {
    id: opening.id, roomId: opening.roomId, kind: opening.kind,
    doorStyle: opening.doorStyle, wall: opening.wall,
    offset: opening.offset, width: opening.width,
    center: [boundary, 0.003, alongCenter],
    hitSize: [hitDepth, Math.max(opening.width, minimumHitLength)],
    identityLabelPosition: [boundary + inwardSign * 0.22, 0.07, alongCenter],
    labelPosition: [boundary - inwardSign * 0.34, 0.07, alongCenter],
    points: [[boundary, 0.0022, start], [boundary, 0.0022, end]],
  };
}

function cardinalOpeningSegment(
  opening: Opening2D,
  room: OpeningRoomBounds | undefined,
  defaultWidth: number,
  defaultDepth: number,
  minimumHitLength: number,
  hitDepth: number
) {
  return opening.wall === "north" || opening.wall === "south"
    ? horizontalOpeningSegment(opening, room, defaultDepth, minimumHitLength, hitDepth)
    : verticalOpeningSegment(opening, room, defaultWidth, minimumHitLength, hitDepth);
}

export function buildOpeningRenderSegments({
  openings, rooms, defaultWidth, defaultDepth, minimumHitLength, hitDepth,
}: {
  openings: readonly Opening2D[];
  rooms: readonly OpeningRoomBounds[];
  defaultWidth: number;
  defaultDepth: number;
  minimumHitLength: number;
  hitDepth: number;
}): OpeningRenderSegment2D[] {
  return openings.flatMap((opening) => {
    if (opening.hostResolution && opening.hostResolution.status !== "resolved") return [];
    if (opening.hostWorldCenter && opening.hostTangent) {
      return [vectorOpeningSegment(opening, minimumHitLength, hitDepth)];
    }
    return [cardinalOpeningSegment(
      opening,
      opening.roomId ? rooms.find((room) => room.id === opening.roomId) : undefined,
      defaultWidth, defaultDepth, minimumHitLength, hitDepth
    )];
  });
}
