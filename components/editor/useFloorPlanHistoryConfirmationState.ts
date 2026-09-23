"use client";

import { useEffect, type KeyboardEvent as ReactKeyboardEvent } from "react";

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
  return (event: ReactKeyboardEvent<HTMLDetailsElement>) => {
    if (event.key !== "Escape" || !open) return;
    event.preventDefault();
    event.stopPropagation();
  };
}
