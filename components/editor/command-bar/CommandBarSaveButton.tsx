"use client";

import { LoaderCircle, Save } from "lucide-react";
import { GUEST_SAVE_OPENER_ID } from "@/lib/guest-save-prompt";

type CommandBarSaveButtonProps = {
  dark: boolean;
  isSaving: boolean;
  onSave: () => void | Promise<void>;
};

/**
 * Save. Guests are asked to sign in first. Phones show only the icon (a spinner while saving), so
 * Share, More and Account still fit beside the Pro indicator; the label shows from `sm` up. Below
 * 390px even that is too wide, so the Pro indicator hides there (the dark Pro theme stays). An
 * outline, as Share is the bar's one black action (UX 4c); 36px from md.
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
          ? "designer-control inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border text-sm font-bold leading-none disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:px-4 md:h-9"
          : "inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg border border-neutral-300 bg-white text-sm font-bold leading-none text-neutral-900 hover:bg-neutral-50 disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:px-4 md:h-9"
      }
      onClick={onSave}
      disabled={isSaving}
    >
      <Icon className={isSaving ? "h-4 w-4 motion-safe:animate-spin sm:hidden" : "h-4 w-4 sm:hidden"} aria-hidden="true" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
