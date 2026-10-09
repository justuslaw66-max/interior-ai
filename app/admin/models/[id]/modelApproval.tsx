"use client";

import type { ModelAssetStatus } from "@/lib/modelAssetStatus";
import { useAdminConfirmation } from "../../useAdminConfirmation";

/**
 * Saving a model as approved makes it eligible for the live catalog, so it's confirmed first
 * (UX audit AD4). Saving any other change, or a model already approved, isn't.
 */
export function useModelApprovalConfirmation(initialStatus: ModelAssetStatus) {
  const { confirm, dialog } = useAdminConfirmation();
  const requestSave = (nextStatus: ModelAssetStatus, save: () => void) => {
    if (nextStatus !== "approved" || initialStatus === "approved") return save();
    confirm({
      title: "Approve this model?",
      description:
        "An approved model can appear in the live catalog once its catalog entry is published. Your other changes are saved with it.",
      confirmLabel: "Approve and save",
      onConfirm: save,
    });
  };
  return { requestSave, dialog };
}

/** Why the server refused to approve the model. */
export function ModelApprovalBlockers({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <div className="font-medium">Approval blockers</div>
      <div className="mt-2 space-y-1">
        {issues.map((issue) => (
          <div key={issue}>{issue}</div>
        ))}
      </div>
    </div>
  );
}
