import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";

// "Narrow" (UX phase 4g, audit ST9): only rooms people spend time in, under 2.15 m on a side, and
// as an improvement, not a review. A hall, a bathroom or a utility room is meant to be narrow.
const NARROW_ROOM_TYPES: ReadonlySet<string> = new Set(["living", "bedroom", "dining"]);
const NARROW_ROOM_METERS = 2.15;

export function narrowRoomIssues(rooms: readonly HousePlanRoom2D[]) {
  return rooms
    .filter((room) => NARROW_ROOM_TYPES.has(room.roomType) && Math.min(room.w, room.d) < NARROW_ROOM_METERS)
    .map((room) => ({
      id: `narrow-room-${room.id}`,
      category: "accessibility" as const,
      severity: "improvement" as const,
      roomId: room.id,
      target: { roomId: room.id },
      title: `${room.name} is narrow`,
      detail: "Very narrow rooms can feel hard to move through once furniture is added.",
      suggestedFix: `Give ${room.name} more breathing room or keep furniture light.`,
      action: "review_furniture_fit" as const,
    }));
}
