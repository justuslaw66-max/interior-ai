"use client";

import { useCallback, useState } from "react";

import type { LeaveForMyDesignsOutcome } from "@/lib/design-page-save-status";

export type LeaveAtDesignLimitPrompt = {
  open: boolean;
  onLeave: () => void;
  onStay: () => void;
};

/**
 * More → My designs (MD1, Q7). The design is saved first (useDesignPageLeaveSave); then the editor
 * goes to My designs, stays open (the save failed, or the design changed while it saved), or, when
 * the Free plan's designs are full, asks whether to leave without saving.
 */
export function useLeaveForMyDesigns(actions: {
  saveBeforeLeaving: () => Promise<LeaveForMyDesignsOutcome>;
  myDesigns: () => void;
}) {
  const [askingAtDesignLimit, setAskingAtDesignLimit] = useState(false);
  const { saveBeforeLeaving, myDesigns } = actions;
  const openMyDesigns = useCallback(async () => {
    const outcome = await saveBeforeLeaving();
    if (outcome === "leave") myDesigns();
    if (outcome === "design-limit") setAskingAtDesignLimit(true);
  }, [myDesigns, saveBeforeLeaving]);
  const prompt: LeaveAtDesignLimitPrompt = {
    open: askingAtDesignLimit,
    onLeave: () => {
      setAskingAtDesignLimit(false);
      myDesigns();
    },
    onStay: () => setAskingAtDesignLimit(false),
  };
  return { openMyDesigns, prompt };
}
