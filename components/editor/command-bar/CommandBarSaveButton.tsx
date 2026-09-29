"use client";

import { LoaderCircle, Save } from "lucide-react";
import { GUEST_SAVE_OPENER_ID } from "@/lib/guest-save-prompt";

type CommandBarSaveButtonProps = {
  dark: boolean;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
};

/**
 * Save. Guests are asked to sign in first. Phones show a 44px icon (a spinner while saving) in the
 * header, as the PhonePlan mockup's plain icons (UX 4d); from md it's a 36px outline with its
 * label, as Share is the bar's one black action (UX 4c).
 */
export function CommandBarSaveButton({ dark, isSaving, onSave }: CommandBarSaveButtonProps) {
  const label = isSaving ? "Saving…" : "Save";
  const Icon = isSaving ? LoaderCircle : Save;
  return (
    <button id={GUEST_SAVE_OPENER_ID}
      type="button"
      data-testid="save-design"
      aria-label={label}
      className={
        dark
          ? "designer-control inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold leading-none disabled:cursor-wait disabled:opacity-70 md:h-9 md:w-auto md:rounded-lg md:border md:px-4"
          : "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-sm font-bold leading-none text-neutral-900 hover:bg-neutral-100 disabled:cursor-wait disabled:opacity-70 md:h-9 md:w-auto md:rounded-lg md:border md:border-neutral-300 md:bg-white md:px-4 md:hover:bg-neutral-50"
      }
      onClick={onSave}
      disabled={isSaving}
    >
      <Icon className={isSaving ? "h-5 w-5 motion-safe:animate-spin md:hidden" : "h-5 w-5 md:hidden"} aria-hidden="true" />
      <span className="hidden md:inline">{label}</span>
    </button>
  );
}
