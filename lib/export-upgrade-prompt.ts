import type { MutableRefObject } from "react";
import { track } from "@/lib/analytics";

export type ExportUpgradePrompt = { reason: "export_images" | "export_pdf"; source: string };

export type ExportOptions = {
  /** The Download dialog states the Free limits before the download, so it skips the upgrade prompt. */
  limitsShown?: boolean;
};

export const IMAGES_UPGRADE_PROMPT: ExportUpgradePrompt = {
  reason: "export_images",
  source: "export_images",
};
export const PDF_UPGRADE_PROMPT: ExportUpgradePrompt = {
  reason: "export_pdf",
  source: "export_pdf_free_completion",
};

/**
 * A Free export asks to upgrade at most once a session (audit finding PR6), and never after a
 * download from the Download dialog, which already said what Free includes.
 */
export function promptUpgradeOnce(
  prompted: MutableRefObject<boolean>,
  limitsShown: boolean,
  prompt: ExportUpgradePrompt,
  actions: {
    setUpgradeReason: (reason: ExportUpgradePrompt["reason"]) => void;
    setShowUpgrade: (open: boolean) => void;
  }
) {
  if (limitsShown || prompted.current) return;
  prompted.current = true;
  track("upgrade_prompt_shown", { source: prompt.source });
  actions.setUpgradeReason(prompt.reason);
  actions.setShowUpgrade(true);
}
