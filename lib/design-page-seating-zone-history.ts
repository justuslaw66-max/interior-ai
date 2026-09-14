import type { HistoryManager } from "@/lib/historyManager";
import type { DesignPageHistorySnapshot } from "@/lib/useDesignPageHistory";
import type { DesignSnapshot, ZoneMin } from "@/lib/room-types";
import { updateActiveRoomZones, type AutoSeatingZoneCreationSource } from "@/lib/design-page-zone-orchestration";

export type SeatingZoneHistory = Pick<HistoryManager<DesignPageHistorySnapshot>, "begin" | "commit" | "completeLastCommand">;

/** The onboarding consequence belongs to the item placement; explicit zone creation remains separate. */
export function commitSeatingZone({ source, sofaId, zones, history, setSnapshot }: {
  source: AutoSeatingZoneCreationSource; sofaId: string; zones: ZoneMin[]; history: SeatingZoneHistory;
  setSnapshot: (updater: (previous: DesignSnapshot) => DesignSnapshot) => void;
}) {
  const update = () => setSnapshot((previous) => updateActiveRoomZones(previous, zones));
  if (source === "onboarding_post_placement" && history.completeLastCommand({
    commandIds: ["replace-room-items", "replace-active-room-items"],
    matches: (before, after) => {
      const roomId = after.designSnapshot.activeRoomId;
      return !before.designSnapshot.rooms.some((room) => room.items.some((item) => item.instanceId === sofaId)) &&
        Boolean(after.designSnapshot.rooms.find((room) => room.id === roomId)?.items.some((item) => item.instanceId === sofaId));
    }, update,
  })) return;
  history.begin("auto_create_seating_zone");
  update();
  history.commit();
}
