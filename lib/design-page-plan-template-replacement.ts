import type { DesignSnapshot, RoomSnapshot } from "@/lib/room-types";

/**
 * Replaces the editable rooms without carrying source geometry from the prior
 * document into the newly selected starter plan.
 */
export function buildPlanTemplateReplacementSnapshot(
  previous: DesignSnapshot,
  rooms: RoomSnapshot[],
  activeRoomId: string
): DesignSnapshot {
  const replacement: DesignSnapshot = {
    ...previous,
    version: 3,
    rooms,
    activeRoomId,
  };
  delete replacement.floorPlan;
  return replacement;
}
