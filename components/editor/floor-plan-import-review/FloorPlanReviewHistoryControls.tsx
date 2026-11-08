"use client";

import { useEffect } from "react";
import { Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { reviewHistoryShortcut } from "@/lib/floor-plan-review-history";
import type { FloorPlanReviewHistoryControls as Controls } from "../useFloorPlanReviewHistory";

/**
 * Undo and Redo over the upload review's corrections (`useFloorPlanReviewHistory.ts`), and their
 * keys. Both stand still while the review is busy (a save, a detection retry), as its tools do.
 */
export default function FloorPlanReviewHistoryControls({ history, disabled }: { history: Controls; disabled: boolean }) {
  const { undo, redo } = history;
  useEffect(() => {
    if (disabled) return;
    const isMac = navigator.platform.toLowerCase().includes("mac");
    const onKeyDown = (event: KeyboardEvent) => {
      const action = reviewHistoryShortcut(event, { isMac, root: document });
      if (!action) return;
      event.preventDefault();
      if (action === "undo") undo();
      else redo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [disabled, redo, undo]);

  return <div className="flex items-center gap-1" role="group" aria-label="Review changes">
    <Button size="compact" data-testid="floor-plan-review-undo" title="Undo the last correction (Cmd/Ctrl+Z)"
      disabled={disabled || !history.canUndo} onClick={undo}>
      <Undo2 className="h-4 w-4" aria-hidden="true" /> Undo
    </Button>
    <Button size="compact" data-testid="floor-plan-review-redo" title="Redo (Cmd/Ctrl+Shift+Z)"
      disabled={disabled || !history.canRedo} onClick={redo}>
      <Redo2 className="h-4 w-4" aria-hidden="true" /> Redo
    </Button>
  </div>;
}
