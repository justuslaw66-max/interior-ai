import type { HistoryManager } from "@/lib/historyManager";
import type { DesignPageHistorySnapshot } from "@/lib/useDesignPageHistory";
import type { DesignSnapshot, ZoneMin } from "@/lib/room-types";
import { updateActiveRoomZones, type AutoSeatingZoneCreationSource } from "@/lib/design-page-zone-orchestration";

export type SeatingZoneHistory = Pick<HistoryManager<DesignPageHistorySnapshot>, "completeLastCommand">;

/**
 * The seating zone the onboarding flow adds right after a sofa is placed belongs to that
 * placement's undo step: it completes the placement command when the history still holds it as
 * the last command. Returns false when there is no such command to join, in which case the
 * caller records the zone as its own "Create seating area" transaction.
 */
export function joinSeatingZoneToPlacement({ source, sofaId, zones, history, setSnapshot }: {
  source: AutoSeatingZoneCreationSource; sofaId: string; zones: ZoneMin[]; history: SeatingZoneHistory;
  setSnapshot: (updater: (previous: DesignSnapshot) => DesignSnapshot) => void;
}): boolean {
  if (source !== "onboarding_post_placement") return false;
  return history.completeLastCommand({
    commandIds: ["replace-room-items", "replace-active-room-items"],
    matches: (before, after) => {
      const roomId = after.designSnapshot.activeRoomId;
      return !before.designSnapshot.rooms.some((room) => room.items.some((item) => item.instanceId === sofaId)) &&
        Boolean(after.designSnapshot.rooms.find((room) => room.id === roomId)?.items.some((item) => item.instanceId === sofaId));
    },
    update: () => setSnapshot((previous) => updateActiveRoomZones(previous, zones)),
  });
}
