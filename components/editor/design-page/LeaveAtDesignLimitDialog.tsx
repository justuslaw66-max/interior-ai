"use client";

import ConfirmDialog from "@/components/ConfirmDialog";
import { FREE_PLAN_DESIGN_LIMIT } from "@/lib/design-limits";
import { CLIENT_PREVIEW_FALLBACK_ACTION_ID } from "@/lib/useClientPreviewCommandBarFocus";
import type { LeaveAtDesignLimitPrompt } from "@/lib/useLeaveForMyDesigns";

/**
 * Asked only when leaving for My designs couldn't save a design because the Free plan's designs are
 * full (Q7). Cancel stays in the editor, and focus goes back to More.
 */
export function LeaveAtDesignLimitDialog({ open, onLeave, onStay }: LeaveAtDesignLimitPrompt) {
  return (
    <ConfirmDialog
      open={open}
      title="Your designs are full"
      description={`The Free plan keeps ${FREE_PLAN_DESIGN_LIMIT} designs, so this one can't be saved to your account. If you leave, it stays on this device until you open another design.`}
      confirmLabel="Leave without saving"
      returnFocusIds={[CLIENT_PREVIEW_FALLBACK_ACTION_ID]}
      onCancel={onStay}
      onConfirm={onLeave}
    />
  );
}
