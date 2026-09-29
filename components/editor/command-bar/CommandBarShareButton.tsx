"use client";

import { Share2 } from "lucide-react";
import { GUEST_SHARE_OPENER_ID } from "@/lib/guest-save-prompt";

type CommandBarShareButtonProps = {
  dark: boolean;
  isSharing: boolean;
  /** Without a handler there is no Share button. */
  onShare?: () => void;
};

/**
 * Share: copies a link to the design, saving it to the cloud first if it isn't there yet (audit
 * finding SX1). Guests are asked to sign in. From md the bar's one black action (UX 4c, as in the
 * mockup), with its label from lg; on phones a plain 44px icon at the end of the header (UX 4d,
 * the PhonePlan mockup). While a link is on its way the button ignores clicks but stays
 * focusable, so keyboard users keep their place.
 */
export function CommandBarShareButton({ dark, isSharing, onShare }: CommandBarShareButtonProps) {
  if (!onShare) return null;
  return (
    <button
      id={GUEST_SHARE_OPENER_ID}
      type="button"
      data-testid="editor-command-share"
      aria-label="Share"
      title="Copy a link to this design"
      aria-busy={isSharing}
      aria-disabled={isSharing}
      className={
        dark
          ? "designer-primary-action inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-[10px] text-sm font-bold leading-none aria-disabled:cursor-wait aria-disabled:opacity-70 md:h-9 md:w-9 md:rounded-lg lg:w-auto lg:pl-3.5 lg:pr-4"
          : "inline-flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-[10px] text-sm font-bold leading-none text-neutral-900 hover:bg-neutral-100 aria-disabled:cursor-wait aria-disabled:opacity-70 md:h-9 md:w-9 md:rounded-lg md:border md:border-neutral-900 md:bg-neutral-900 md:text-white md:hover:bg-neutral-800 lg:w-auto lg:pl-3.5 lg:pr-4"
      }
      onClick={isSharing ? undefined : onShare}
    >
      <Share2 className="h-5 w-5 md:h-4 md:w-4" aria-hidden="true" />
      <span className="hidden lg:inline">{isSharing ? "Sharing…" : "Share"}</span>
    </button>
  );
}
