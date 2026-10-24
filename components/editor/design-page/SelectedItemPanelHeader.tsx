"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
export type SelectedItemPanelLockLabel = "Lock" | "Unlock" | "Lock selected" | "Unlock selected";

type SelectedItemPanelHeaderProps = {
  title: string;
  isDesigner: boolean;
  canEdit: boolean;
  lockLabel: SelectedItemPanelLockLabel;
  onToggleLock: () => void;
  onDeselect: () => void;
};

/** "Selected", Pro's Lock, and Deselect (the mockup's ×), kept in view while the panel scrolls. */
export function SelectedItemPanelHeader({ title, isDesigner, canEdit, lockLabel, onToggleLock, onDeselect }: SelectedItemPanelHeaderProps) {
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-3 rounded-t-xl border-b border-separator bg-surface-floating/95 px-4 py-2 backdrop-blur">
      <span className="text-[13px] font-bold text-label-secondary">Selected</span>
      <div className="flex items-center gap-1">
        {isDesigner ? (
          <Button
            disabled={!canEdit}
            onClick={onToggleLock}
            variant="secondary" size="compact"
          >
            {lockLabel}
          </Button>
        ) : null}
        <Button
          variant="quiet"
          size="icon"
          data-testid="selected-item-deselect"
          aria-label={`Deselect ${title}`}
          onClick={onDeselect}
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
