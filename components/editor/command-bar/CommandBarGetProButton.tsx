"use client";

import { PLANS_GET_PRO_OPENER_ID } from "@/lib/plans-dialog-focus";

type CommandBarGetProButtonProps = {
  dark: boolean;
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
export function CommandBarGetProButton({ dark, accountReady, canUpgrade, onGetPro }: CommandBarGetProButtonProps) {
  if (!accountReady || !canUpgrade || !onGetPro) return null;
  return (
    <button
      id={PLANS_GET_PRO_OPENER_ID}
      type="button"
      data-testid="editor-command-get-pro"
      aria-haspopup="dialog"
      className={
        dark
          ? "designer-control hidden h-[30px] shrink-0 items-center justify-center rounded-lg border px-3 text-sm font-semibold leading-none lg:inline-flex"
          : "hidden h-[30px] shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white px-3 text-sm font-semibold leading-none text-blue-700 hover:bg-neutral-50 lg:inline-flex"
      }
      onClick={onGetPro}
    >
      Get Pro
    </button>
  );
}
