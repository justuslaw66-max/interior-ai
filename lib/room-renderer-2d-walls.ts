import { EDITOR_GEOMETRY_TOLERANCES } from "@/lib/editor-geometry-tolerances";
import {
  getPlanSegmentFrame,
  projectPointOntoPlanSegment,
} from "@/lib/wall-segment-geometry";
export { mergeSharedWallSegments2D } from "@/lib/room-renderer-2d-wall-topology";

type WallSide2D = "north" | "south" | "east" | "west";

type RoomLike2D = {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  wallThickness?: number;
  shape?: "rectangle" | "l_shape" | "custom_polygon";
  polygon?: Array<{ x: number; z: number }>;
};

type OpeningLike2D = {
  roomId?: string;
  wall: WallSide2D;
  offset: number;
  width: number;
  kind: "door" | "window";
  hostWorldCenter?: { x: number; z: number };
};

export type RoomWallSegment2D = {
  key: string;
  roomIds: string[];
  roomWalls: Record<string, WallSide2D>;
  /** Room-centre coordinate on the segment's running axis, used by opening offsets. */
  roomAxisCenters: Record<string, number>;
  wall: WallSide2D;
  orientation: "horizontal" | "vertical";
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  thickness: number;
};

export type WallBandPart2D = RoomWallSegment2D & {
  key: string;
};

export type WallBandCornerCap2D = {
  key: string;
  size: number;
  x: number;
  z: number;
};

const WALL_THICKNESS_FALLBACK_METERS = 0.12;
const WALL_SEGMENT_EPSILON = EDITOR_GEOMETRY_TOLERANCES.wallSegmentMeters;

function roundWallCoordinate(value: number): number {
  return Number(value.toFixed(4));
}

function getRoomOutlinePoints(room: RoomLike2D): Array<[number, number]> {
  if (room.shape === "custom_polygon" && room.polygon && room.polygon.length >= 3) {
    const points = room.polygon.map((point): [number, number] => [
      room.x + point.x,
      room.z + point.z,
    ]);
    return [...points, points[0]];
  }

  const left = room.x - room.w / 2;
  const right = room.x + room.w / 2;
  const top = room.z - room.d / 2;
  const bottom = room.z + room.d / 2;

  if (room.shape === "l_shape") {
    const notchW = room.w * 0.42;
    const notchD = room.d * 0.42;
    return [
      [left, top],
      [right, top],
      [right, bottom - notchD],
      [right - notchW, bottom - notchD],
      [right - notchW, bottom],
      [left, bottom],
      [left, top],
    ];
  }

  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
    [left, top],
  ];
}

function getLocalRoomOutlinePoints(room: RoomLike2D): Array<[number, number]> {
  return getRoomOutlinePoints({ ...room, x: 0, z: 0 });
}

function insetPointTowardRoomCenter(
  x: number,
  z: number,
  room: RoomLike2D,
  inset: number
): [number, number] {
  const dx = room.x - x;
  const dz = room.z - z;
  const length = Math.hypot(dx, dz);
  if (length <= WALL_SEGMENT_EPSILON) return [x, z];
  return [x + (dx / length) * inset, z + (dz / length) * inset];
}

export function buildInnerFloorGeometry2D(room: RoomLike2D): Array<[number, number]> {
  const inset = Math.max(0, (room.wallThickness ?? WALL_THICKNESS_FALLBACK_METERS) / 2);

  if (room.shape === "custom_polygon") {
    return getLocalRoomOutlinePoints(room);
  }

  return getRoomOutlinePoints(room)
    .map(([x, z]) => insetPointTowardRoomCenter(x, z, room, inset))
    .map(([x, z]): [number, number] => [
      roundWallCoordinate(x - room.x),
      roundWallCoordinate(z - room.z),
    ]);
}

function inferWallSide(
  room: RoomLike2D,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): WallSide2D {
  const dx = (x1 + x2) / 2 - room.x;
  const dz = (z1 + z2) / 2 - room.z;
  if (Math.abs(dz) >= Math.abs(dx)) return dz <= 0 ? "north" : "south";
  return dx <= 0 ? "west" : "east";
}

export function buildRoomWallSegments2D(rooms: RoomLike2D[]): RoomWallSegment2D[] {
  const segments: RoomWallSegment2D[] = [];

  for (const room of rooms) {
    const points = getRoomOutlinePoints(room);
    for (let index = 0; index < points.length - 1; index += 1) {
      const [x1, z1] = points[index];
      const [x2, z2] = points[index + 1];
      const length = Math.hypot(x2 - x1, z2 - z1);
      if (length <= WALL_SEGMENT_EPSILON) continue;

      const orientation =
        Math.abs(z1 - z2) <= Math.abs(x1 - x2) ? "horizontal" : "vertical";
      segments.push({
        key: `${room.id}-${index}`,
        roomIds: [room.id],
        roomWalls: {
          [room.id]: inferWallSide(room, x1, z1, x2, z2),
        },
        roomAxisCenters: {
          [room.id]: orientation === "horizontal" ? room.x : room.z,
        },
        wall: inferWallSide(room, x1, z1, x2, z2),
        orientation,
        x1: roundWallCoordinate(x1),
        z1: roundWallCoordinate(z1),
        x2: roundWallCoordinate(x2),
        z2: roundWallCoordinate(z2),
        thickness: Math.max(0.025, room.wallThickness ?? WALL_THICKNESS_FALLBACK_METERS),
      });
    }
  }

  return segments;
}

function normalizeSegment(segment: RoomWallSegment2D): RoomWallSegment2D {
  const frame = getPlanSegmentFrame(segment);
  if (!frame) return segment;
  if (frame.tangent.x > 0 || (Math.abs(frame.tangent.x) <= 0.000001 && frame.tangent.z > 0)) {
    return segment;
  }
  return {
    ...segment,
    x1: segment.x2,
    z1: segment.z2,
    x2: segment.x1,
    z2: segment.z1,
  };
}

export function buildWallBandCornerCaps2D(
  segments: RoomWallSegment2D[]
): WallBandCornerCap2D[] {
  const endpoints = new Map<
    string,
    { x: number; z: number; segments: RoomWallSegment2D[] }
  >();

  for (const segment of segments) {
    const segmentEndpoints: Array<[number, number]> = [
      [segment.x1, segment.z1],
      [segment.x2, segment.z2],
    ];

    for (const [x, z] of segmentEndpoints) {
      const roundedX = roundWallCoordinate(x);
      const roundedZ = roundWallCoordinate(z);
      const key = `wall-cap-${roundedX}:${roundedZ}`;
      const existing = endpoints.get(key);
      endpoints.set(key, {
        x: roundedX,
        z: roundedZ,
        segments: [...(existing?.segments ?? []), segment],
      });
    }
  }

  return Array.from(endpoints.entries()).flatMap(([key, endpoint]) => {
    const orientations = new Set(endpoint.segments.map((segment) => segment.orientation));
    if (endpoint.segments.length > 1 && orientations.size === 1) return [];
    return [
      {
        key,
        size: Math.max(
          0.025,
          ...endpoint.segments.map((segment) => segment.thickness)
        ),
        x: endpoint.x,
        z: endpoint.z,
      },
    ];
  });
}

function getOpeningRangeOnSegment(
  segment: RoomWallSegment2D,
  opening: OpeningLike2D
): { start: number; end: number; kind: OpeningLike2D["kind"] } | null {
  if (opening.roomId) {
    if (!segment.roomIds.includes(opening.roomId)) return null;
    if (segment.roomWalls[opening.roomId] !== opening.wall) return null;
  } else if (opening.wall !== segment.wall) {
    return null;
  }

  const frame = getPlanSegmentFrame(segment);
  if (!frame) return null;
  const low = 0;
  const high = frame.length;
  const projectedHost = opening.hostWorldCenter
    ? projectPointOntoPlanSegment(opening.hostWorldCenter, segment)
    : null;
  const roomAxisCenter = opening.roomId ? segment.roomAxisCenters[opening.roomId] : undefined;
  const axisCenter = roomAxisCenter ?? (
    segment.orientation === "horizontal" ? frame.center.x : frame.center.z
  );
  const fallbackPoint = segment.orientation === "horizontal"
    ? { x: axisCenter + opening.offset, z: frame.center.z }
    : { x: frame.center.x, z: axisCenter + opening.offset };
  const center = projectedHost?.alongFromStart ??
    projectPointOntoPlanSegment(fallbackPoint, segment)?.alongFromStart;
  if (center === undefined) return null;
  const start = Math.max(low, center - opening.width / 2);
  const end = Math.min(high, center + opening.width / 2);
  if (end - start <= WALL_SEGMENT_EPSILON) return null;
  return { start, end, kind: opening.kind };
}

function buildSegmentSlice(
  segment: RoomWallSegment2D,
  start: number,
  end: number,
  keySuffix: string
): WallBandPart2D {
  const frame = getPlanSegmentFrame(segment);
  if (!frame) return { ...segment, key: `${segment.key}-${keySuffix}` };
  return {
    ...segment,
    key: `${segment.key}-${keySuffix}`,
    x1: roundWallCoordinate(frame.start.x + frame.tangent.x * start),
    z1: roundWallCoordinate(frame.start.z + frame.tangent.z * start),
    x2: roundWallCoordinate(frame.start.x + frame.tangent.x * end),
    z2: roundWallCoordinate(frame.start.z + frame.tangent.z * end),
  };
}

export function splitWallBandByOpenings2D(
  segment: RoomWallSegment2D,
  openings: OpeningLike2D[]
): { parts: WallBandPart2D[]; windowMarkers: WallBandPart2D[] } {
  const normalizedSegment = normalizeSegment(segment);
  const frame = getPlanSegmentFrame(normalizedSegment);
  const low = 0;
  const high = frame?.length ?? 0;
  const ranges = openings
    .map((opening) => getOpeningRangeOnSegment(normalizedSegment, opening))
    .filter((range): range is NonNullable<typeof range> => Boolean(range))
    .sort((first, second) => first.start - second.start);

  const parts: WallBandPart2D[] = [];
  const windowMarkers: WallBandPart2D[] = [];
  let cursor = low;

  ranges.forEach((range, index) => {
    if (range.start - cursor > WALL_SEGMENT_EPSILON) {
      parts.push(buildSegmentSlice(normalizedSegment, cursor, range.start, `part-${index}`));
    }
    if (range.kind === "window") {
      windowMarkers.push(
        buildSegmentSlice(normalizedSegment, range.start, range.end, `window-${index}`)
      );
    }
    cursor = Math.max(cursor, range.end);
  });

  if (high - cursor > WALL_SEGMENT_EPSILON) {
    parts.push(buildSegmentSlice(normalizedSegment, cursor, high, "part-end"));
  }

  return {
    parts: ranges.length ? parts : [buildSegmentSlice(normalizedSegment, low, high, "part")],
    windowMarkers,
  };
}

export function buildWallBandGeometry2D(part: WallBandPart2D): {
  position: [number, number];
  size: [number, number];
  rotationY: number;
} {
  const length = Math.max(
    WALL_SEGMENT_EPSILON,
    Math.hypot(part.x2 - part.x1, part.z2 - part.z1)
  );
  return {
    position: [
      roundWallCoordinate((part.x1 + part.x2) / 2),
      roundWallCoordinate((part.z1 + part.z2) / 2),
    ],
    size: [length, Math.max(0.025, part.thickness)],
    rotationY: -Math.atan2(part.z2 - part.z1, part.x2 - part.x1),
  };
}
