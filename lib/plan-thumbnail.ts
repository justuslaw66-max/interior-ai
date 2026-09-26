import { buildHousePlan2D, getHouseRoomPlanPolygon } from "@/lib/design-page-house-plan";
import {
  fitPlanThumbnail,
  PLAN_THUMBNAIL_DEFAULT_FILL,
  PLAN_THUMBNAIL_ROOM_FILLS,
  type DesignPlanThumbnail,
} from "@/lib/plan-thumbnail-frame";
import type { DesignSnapshot } from "@/lib/room-types";

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * A small drawing of a saved design's rooms for its My designs card: the floor of its active
 * room, one filled outline per room. Null when the design has no rooms.
 */
export function buildDesignPlanThumbnail(snapshot: DesignSnapshot): DesignPlanThumbnail | null {
  const [firstRoom] = snapshot.rooms;
  if (!firstRoom) return null;
  const plan = buildHousePlan2D(snapshot.rooms, firstRoom.geometry.width, firstRoom.geometry.depth);
  const activeRoom = plan.rooms.find((room) => room.id === snapshot.activeRoomId) ?? plan.rooms[0];
  const floor = activeRoom?.floorLevel ?? 1;
  const rooms = plan.rooms
    .filter((room) => (room.floorLevel ?? 1) === floor)
    .map((room) => ({ room, outline: getHouseRoomPlanPolygon(room) }))
    .filter(({ outline }) => outline.length >= 3);
  if (rooms.length === 0) return null;
  const frame = fitPlanThumbnail(rooms.flatMap(({ outline }) => outline));
  return {
    rooms: rooms.map(({ room, outline }) => ({
      id: room.id,
      points: outline.map((point) => `${round(frame.x(point.x))},${round(frame.y(point.z))}`).join(" "),
      fill: PLAN_THUMBNAIL_ROOM_FILLS[room.roomType] ?? PLAN_THUMBNAIL_DEFAULT_FILL,
    })),
  };
}
