"use client";

import { useAdminConfirmation } from "../../useAdminConfirmation";
import { describeImportStatusChange } from "./importStatusChange";

/**
 * A job's status change can't be undone, so `requestChange` asks first and `apply` runs only from
 * the dialog's confirm button. Saving the job at its current status (its notes, say) doesn't ask.
 */
export function useImportStatusChange(currentStatus: string, apply: (nextStatus: string) => void) {
  const { confirm, dialog } = useAdminConfirmation();
  const requestChange = (nextStatus: string) => {
    if (nextStatus === currentStatus) return apply(nextStatus);
    confirm({ ...describeImportStatusChange(nextStatus), onConfirm: () => apply(nextStatus) });
  };
  return { requestChange, dialog };
}
