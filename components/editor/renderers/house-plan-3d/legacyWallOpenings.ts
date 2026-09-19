import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomRendererOpening } from "@/lib/design-page-plan-overlays";
import type { WallOpening3D, WallSegment3D } from "./geometry";
import { projectOpeningWorldCenterOntoLegacySegment } from "./legacyOpeningProjection";
import { openingMatchesHostSegment } from "./openingVerticalGeometry";

function legacyOpeningWorldCenter(
  opening: RoomRendererOpening,
  sourceRoom: HousePlanRoom2D
) {
  if (opening.hostWorldCenter) return opening.hostWorldCenter;
  const horizontal = opening.wall === "north" || opening.wall === "south";
  return {
    x: horizontal
      ? sourceRoom.x + opening.offset
      : sourceRoom.x + (opening.wall === "west" ? -sourceRoom.w / 2 : sourceRoom.w / 2),
    z: horizontal
      ? sourceRoom.z + (opening.wall === "north" ? -sourceRoom.d / 2 : sourceRoom.d / 2)
      : sourceRoom.z + opening.offset,
  };
}

function projectedOpening(
  opening: RoomRendererOpening,
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  id: string
): WallOpening3D[] {
  const center = opening.hostWorldCenter;
  const offset = center
    ? projectOpeningWorldCenterOntoLegacySegment(room, segment, center, opening.width)
    : opening.offset;
  if (offset === null) return [];
  return [{
    id, sourceId: opening.id, offset, width: opening.width,
    height: opening.height, bottom: opening.bottom, kind: opening.kind,
  }];
}

export function getWallOpenings(
  room: HousePlanRoom2D,
  segment: WallSegment3D,
  rooms: readonly HousePlanRoom2D[],
  openings: readonly RoomRendererOpening[]
): WallOpening3D[] {
  const renderable = openings.filter(
    (opening) => !opening.hostResolution || opening.hostResolution.status === "resolved"
  );
  const direct = renderable.flatMap((opening) =>
    openingMatchesHostSegment(opening, room.id, segment)
      ? projectedOpening(opening, room, segment, opening.id)
      : []
  );
  const mirrored = renderable.flatMap((opening) => {
    if (!opening.roomId || openingMatchesHostSegment(opening, room.id, segment)) return [];
    const sourceRoom = rooms.find((candidate) => candidate.id === opening.roomId);
    if (!sourceRoom) return [];
    const targetTangent = { x: Math.cos(segment.rotationY), z: -Math.sin(segment.rotationY) };
    const sourceTangent = opening.hostTangent ??
      (opening.wall === "north" || opening.wall === "south" ? { x: 1, z: 0 } : { x: 0, z: 1 });
    if (Math.abs(targetTangent.x * sourceTangent.z - targetTangent.z * sourceTangent.x) > 0.01) return [];
    return projectedOpening(
      { ...opening, hostWorldCenter: legacyOpeningWorldCenter(opening, sourceRoom) },
      room,
      segment,
      `${opening.id}-mirrored-${room.id}`
    );
  });
  return [...direct, ...mirrored];
}
