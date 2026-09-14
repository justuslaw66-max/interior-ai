"use client";

import { useCallback } from "react";
import { recoverProposedRoomLayout, type RecoverProposedRoomLayoutInput } from "@/lib/floor-plan-room-recovery";
import type { UseDesignPageImportedWallEditingControllerInput } from "@/lib/useDesignPageImportedWallEditingController";

export function useDesignPageRoomRecovery({ enabled, refs, actions }: Pick<UseDesignPageImportedWallEditingControllerInput, "refs" | "actions"> & { enabled: boolean }) {
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
