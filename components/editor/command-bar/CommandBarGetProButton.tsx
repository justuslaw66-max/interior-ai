"use client";

import { PLANS_GET_PRO_OPENER_ID } from "@/lib/plans-dialog-focus";

type CommandBarGetProButtonProps = {
  /** The session has loaded, so Get Pro appears together with Sign in or Account. */
  accountReady: boolean;
  /** From the editor's capabilities, once the plan has loaded: Pro never sees it. */
  canUpgrade: boolean;
  onGetPro?: () => void;
};

/**
 * Get Pro opens Pricing (audit findings PR3 and D). Below `lg` the bar has no room for it, so
 * Pricing is in the Account menu there. Pricing hands focus back here when it closes.
 */
export function CommandBarGetProButton({ accountReady, canUpgrade, onGetPro }: CommandBarGetProButtonProps) {
  if (!accountReady || !canUpgrade || !onGetPro) return null;
  return (
    <button
      id={PLANS_GET_PRO_OPENER_ID}
      type="button"
      data-testid="editor-command-get-pro"
      aria-haspopup="dialog"
      className="hidden h-9 shrink-0 items-center justify-center rounded-lg border border-control-secondary-border bg-control-secondary px-3 text-sm font-bold leading-none text-on-accent-tint hover:bg-control-secondary-hover lg:inline-flex"
      onClick={onGetPro}
    >
      Get Pro
    </button>
  );
}
