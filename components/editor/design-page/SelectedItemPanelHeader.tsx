"use client";

import { X } from "lucide-react";
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
    <div className="sticky top-0 z-20 -mx-4 -mt-4 flex items-center justify-between gap-3 rounded-t-xl border-b border-neutral-200 bg-white/95 px-4 py-2 backdrop-blur">
      <span className="text-[13px] font-bold text-neutral-600">Selected</span>
      <div className="flex items-center gap-1">
        {isDesigner ? (
          <button
            type="button"
            disabled={!canEdit}
            onClick={onToggleLock}
            className="min-h-8 rounded-lg border border-neutral-200 px-3 text-xs font-semibold text-neutral-900 hover:bg-neutral-50 disabled:opacity-50"
          >
            {lockLabel}
          </button>
        ) : null}
        <button
          type="button"
          data-testid="selected-item-deselect"
          aria-label={`Deselect ${title}`}
          onClick={onDeselect}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-neutral-700 hover:bg-neutral-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-neutral-900 md:h-8 md:w-8"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
