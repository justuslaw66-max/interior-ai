"use client";

import { useCallback, useEffect, useRef, type MutableRefObject } from "react";

import {
  needsSaveBeforeLeaving,
  type DesignPageSaveStatusInput,
  type LeaveForMyDesignsOutcome,
} from "@/lib/design-page-save-status";
import { shouldConfirmPlanTemplateReplacement } from "@/lib/design-page-template-furnishings";
import type { StoredDesign } from "@/lib/room-persistence";
import type { DesignSnapshot } from "@/lib/room-types";
import type { ManualSaveOptions } from "@/lib/useDesignPageExplicitCloudSaveController";

type LeaveSaveInput = Pick<
  DesignPageSaveStatusInput,
  "designId" | "isAuthenticated" | "hasPendingCloudSnapshotChanges" | "isSaving" | "lastCloudSaveError"
> & {
  designSnapshot: DesignSnapshot;
  currentStoredDesignFingerprint: string;
  getStoredDesign: () => StoredDesign;
  saveDesignToCloud: (options?: ManualSaveOptions) => Promise<string | null>;
  /** Saves running for leaving; autosave waits while there are any. */
  leaveSaves: MutableRefObject<number>;
};

/**
 * Leaving the editor for My designs (MD1, Q7): saves first when needsSaveBeforeLeaving says so,
 * then leaves, stays (the save failed, or the design changed while it saved), or reports that the
 * Free plan's designs are full. Autosave waits meanwhile: a write it started would supersede this
 * save, which would then report nothing saved and keep the editor open with the design saved.
 */
export function useDesignPageLeaveSave(input: LeaveSaveInput) {
  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  });
  const latestFingerprintRef = useRef(input.currentStoredDesignFingerprint);
  useEffect(() => {
    latestFingerprintRef.current = input.currentStoredDesignFingerprint;
  }, [input.currentStoredDesignFingerprint]);

  return useCallback(async (): Promise<LeaveForMyDesignsOutcome> => {
    const current = inputRef.current;
    const openings = current.getStoredDesign().floorPlan?.openings ?? [];
    const designHasContent = shouldConfirmPlanTemplateReplacement(current.designSnapshot, openings);
    if (!needsSaveBeforeLeaving({ ...current, designHasContent })) return "leave";
    const savedFingerprint = current.currentStoredDesignFingerprint;
    let atDesignLimit = false;
    current.leaveSaves.current += 1;
    const savedId = await current
      .saveDesignToCloud({ onDesignLimit: () => { atDesignLimit = true; } })
      .finally(() => { current.leaveSaves.current -= 1; });
    if (atDesignLimit) return "design-limit";
    return savedId !== null && latestFingerprintRef.current === savedFingerprint ? "leave" : "stay";
  }, []);
}
