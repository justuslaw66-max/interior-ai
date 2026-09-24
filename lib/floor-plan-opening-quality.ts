import {
  resolveDesignPageOpeningHost,
  resolveDesignPageOpeningHosts,
} from "@/lib/design-page-opening-host";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { RoomOpening2D } from "@/lib/editorScene";
import type { FloorPlanQualityIssue } from "@/lib/floor-plan-quality";

/**
 * The room whose wall physically hosts the opening, or null when no wall does.
 * Legacy single-room openings carry no roomId; the resolved host still names
 * the room they cut, so callers must not require opening.roomId.
 */
export function openingHostRoomId(
  opening: RoomOpening2D,
  rooms: readonly HousePlanRoom2D[]
): string | null {
  const resolution = resolveDesignPageOpeningHost(opening, rooms);
  return resolution.status === "resolved" ? resolution.host.roomId ?? null : null;
}

export function buildOpeningHostQualityIssues(
  openings: readonly RoomOpening2D[],
  rooms: readonly HousePlanRoom2D[]
): FloorPlanQualityIssue[] {
  return resolveDesignPageOpeningHosts(openings, rooms).flatMap(({ opening, resolution }) => {
    if (resolution.status === "resolved") return [];
    return [{
      id: `opening-host:${opening.id}`,
      category: "readiness",
      severity: "review",
      roomId: opening.roomId,
      target: {
        roomId: opening.roomId,
        wall: opening.wall,
        openingKind: opening.kind,
        openingId: opening.id,
      },
      title: `${opening.kind === "door" ? "Door" : "Window"} needs wall repair`,
      detail: resolution.consumerMessage,
      suggestedFix: `Select the ${opening.kind} and assign it to a wall that contains its requested position.`,
      action: "review_plan_layout",
    } satisfies FloorPlanQualityIssue];
  });
}
