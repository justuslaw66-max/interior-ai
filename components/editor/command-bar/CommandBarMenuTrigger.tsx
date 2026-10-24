"use client";

import { Ellipsis, Menu } from "lucide-react";
import type { RefObject } from "react";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";

type CommandBarMenuTriggerProps = {
  /** Phones: Menu, at the start of the bar (UX 4d, the PhonePlan mockup); from md: More. */
  phone: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  lightingSettingsOpen: boolean;
  onToggle: () => void;
};

function triggerClass(phone: boolean) {
  if (phone) {
    return "inline-flex h-11 w-11 items-center justify-center rounded-[10px] text-label hover:bg-control-quiet-hover";
  }
  return "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-control-secondary-border bg-control-secondary text-sm font-bold leading-none text-label hover:bg-control-secondary-hover";
}

/**
 * The button that opens More (from md) or, on phones, the Menu, which also holds the account's
 * items. It's the bar's focus fallback (Client Preview, Pricing), under one id at every width.
 */
export function CommandBarMenuTrigger({ phone, buttonRef, open, lightingSettingsOpen, onToggle }: CommandBarMenuTriggerProps) {
  return (
    <button
      ref={buttonRef}
      id={CLIENT_PREVIEW_FALLBACK_ACTION_ID}
      type="button"
      data-testid="editor-command-overflow"
      aria-label={phone ? "Menu" : "More"}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={lightingSettingsOpen ? "lighting-settings-drawer" : undefined}
      className={triggerClass(phone)}
      onClick={onToggle}
    >
      {phone ? <Menu className="h-[22px] w-[22px]" aria-hidden="true" /> : <Ellipsis className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}
