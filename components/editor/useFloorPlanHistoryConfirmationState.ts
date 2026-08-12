"use client";

import { useEffect } from "react";

export function useFloorPlanHistoryConfirmationState(
  singleDeleteId: string | null,
  bulkDeleteScope: string | null,
  historyOpen: boolean,
  onOpenChange: (open: boolean) => void
) {
  const open = historyOpen && Boolean(singleDeleteId || bulkDeleteScope);
  useEffect(() => {
    onOpenChange(open);
    return () => onOpenChange(false);
  }, [onOpenChange, open]);
}
