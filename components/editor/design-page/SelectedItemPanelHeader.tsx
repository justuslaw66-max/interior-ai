"use client";

import { Lock, LockOpen, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
export type SelectedItemPanelLockLabel = "Lock" | "Unlock" | "Lock selected" | "Unlock selected";

type SelectedItemPanelHeaderProps = {
  title: string;
  canEdit: boolean;
  lockLabel: SelectedItemPanelLockLabel;
  onToggleLock: () => void;
  onDeselect: () => void;
};

/**
 * "Selected", Lock and Deselect (the mockup's ×), kept in view while the panel scrolls. Lock is for
 * everyone who can edit, as in Canva and Figma (14 Nov 2026): a locked item can't be moved, turned,
 * resized or removed until it's unlocked here.
 */
export function SelectedItemPanelHeader({ title, canEdit, lockLabel, onToggleLock, onDeselect }: SelectedItemPanelHeaderProps) {
  const unlocking = lockLabel.startsWith("Unlock");
  const LockIcon = unlocking ? LockOpen : Lock;
  return (
    <div className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-3 rounded-t-xl border-b border-separator bg-surface-floating/95 px-4 py-2 backdrop-blur">
      <span className="text-[13px] font-bold text-label-secondary">Selected</span>
      <div className="flex items-center gap-1">
        {canEdit ? (
          <Button data-testid="selected-item-lock" onClick={onToggleLock} variant="secondary" size="compact">
            <LockIcon className="h-3.5 w-3.5" aria-hidden="true" />
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
