import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { DesignPageOpeningHostResolution, OpeningHostInput } from "@/lib/design-page-opening-host";
import type { RoomWallSegment2D } from "@/lib/room-renderer-2d-walls";
import { getCanonicalPlanLine, pointOnCanonicalPlanLine, projectPointOntoPlanSegment } from "@/lib/wall-segment-geometry";

function projectedSegment(opening: OpeningHostInput): RoomWallSegment2D {
  const host = opening.canonicalHost!;
  const roomId = opening.roomId;
  return {
    key: `canonical:${host.floorId}:${opening.canonicalWallId}`,
    x1: host.startMm.x / 1000, z1: host.startMm.z / 1000,
    x2: host.endMm.x / 1000, z2: host.endMm.z / 1000,
    thickness: host.thicknessMm / 1000, wall: opening.wall,
    orientation: opening.wall === "north" || opening.wall === "south" ? "horizontal" : "vertical",
    roomIds: roomId ? [roomId] : [], roomWalls: roomId ? { [roomId]: opening.wall } : {},
    roomAxisCenters: {},
  };
}

function failure(opening: OpeningHostInput, unsupported: boolean): DesignPageOpeningHostResolution {
  const center = opening.requestedWorldCenterMm;
  return {
    status: unsupported ? "unsupported" : "invalid",
    code: unsupported ? "UNSUPPORTED_PHYSICAL_WALL" : "INVALID_OPENING_GEOMETRY",
    diagnostic: `Opening ${opening.id} has ${unsupported ? "a curved" : "an invalid"} canonical host projection.`,
    consumerMessage: unsupported
      ? "This opening is retained on its curved wall. Position and width editing on curves is not supported."
      : "This opening needs a valid wall position before it can be edited.",
    requestedWorldCenter: center ? { x: center.x / 1000, z: center.z / 1000 } : undefined,
  };
}

/** Uses only an atomically regenerated compiler projection, including walls without rooms. */
export function resolveCanonicalOpeningHost(
  opening: OpeningHostInput, rooms: ReadonlyMap<string, HousePlanRoom2D>
): DesignPageOpeningHostResolution {
  const canonical = opening.canonicalHost!;
  if (canonical.pathKind !== "line") return failure(opening, true);
  const segment = projectedSegment(opening);
  const line = getCanonicalPlanLine(segment);
  if (!opening.canonicalWallId || !line || !Number.isFinite(opening.offsetMm) ||
      !Number.isFinite(canonical.offsetOriginMm) || !Number.isFinite(opening.widthMm) || opening.widthMm <= 0 ||
      ![segment.x1, segment.x2, segment.z1, segment.z2, segment.thickness].every(Number.isFinite)) {
    return failure(opening, false);
  }
  const center = pointOnCanonicalPlanLine(line.tangent, line.normal, line.lineOffset, (line.low + line.high) / 2 + (opening.offsetMm + canonical.offsetOriginMm) / 1000);
  const projected = projectPointOntoPlanSegment(center, segment)!;
  const room = opening.roomId ? rooms.get(opening.roomId) : undefined;
  const normal = projected.frame.normal;
  const normalSign = room && normal.x * (room.x - center.x) + normal.z * (room.z - center.z) < 0 ? -1 : 1;
  return { status: "resolved", host: {
    physicalWallId: segment.key, segment, roomId: opening.roomId, roomWall: opening.wall,
    roomSegmentKey: segment.key, roomSegment: segment,
    offsetOriginMeters: canonical.offsetOriginMm / 1000,
    segmentOffsetMeters: projected.offsetFromCenter, alongSegmentMeters: projected.alongFromStart,
    worldCenter: center, tangent: projected.frame.tangent,
    inwardNormal: { x: normal.x * normalSign, z: normal.z * normalSign }, spanMeters: projected.frame.length,
  } };
}
