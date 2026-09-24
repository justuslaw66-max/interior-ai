"use client";

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import { recoverProposedRoomLayout, type RecoverProposedRoomLayoutInput } from "@/lib/floor-plan-room-recovery";
import type { DesignSnapshot } from "@/lib/room-types";

// The subset of the imported-wall-editing controller's input this hook needs, spelled out here so
// the controller can import the hook without a dependency cycle.
export type UseDesignPageRoomRecoveryInput = {
  enabled: boolean;
  refs: { designSnapshot: MutableRefObject<DesignSnapshot> };
  actions: {
    setDesignSnapshot: Dispatch<SetStateAction<DesignSnapshot>>;
    runHistoryTransaction: (name: string, mutation: () => void) => void;
    showToast: (message: string) => void;
  };
};

export function useDesignPageRoomRecovery({ enabled, refs, actions }: UseDesignPageRoomRecoveryInput) {
  return useCallback((input: RecoverProposedRoomLayoutInput): boolean => {
    if (!enabled) { actions.showToast("Choose Edit local copy before recovering a room layout."); return false; }
    try {
      const next = recoverProposedRoomLayout(refs.designSnapshot.current, input);
      actions.runHistoryTransaction("Recover saved room layout", () => actions.setDesignSnapshot(next));
      actions.showToast("Layout recovered. Open Layouts to preview or restore its furniture at the original world positions.");
      return true;
    } catch (cause) {
      actions.showToast(cause instanceof Error ? cause.message : "Room layout recovery failed.");
      return false;
    }
  }, [enabled, refs.designSnapshot, actions]);
}
