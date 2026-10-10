import { describeAdminStatus } from "../../admin-status";

export type ImportStatusChangeCopy = {
  title: string;
  description: string;
  confirmLabel: string;
  destructive: boolean;
};

const NO_WAY_BACK = "A job can't go back to an earlier status.";
const FINAL = "the job can't change status again.";

/** What Admin asks before moving an import job to `to`: no status change can be undone (AD4). */
export function describeImportStatusChange(to: string): ImportStatusChangeCopy {
  if (to === "needs_review") {
    return {
      title: "Send this job to review?",
      description: `It moves to Catalog review. ${NO_WAY_BACK}`,
      confirmLabel: "Send to review",
      destructive: false,
    };
  }
  if (to === "approved") {
    return {
      title: "Approve this job?",
      description: `An approved job can be published to the live catalog. ${NO_WAY_BACK}`,
      confirmLabel: "Approve",
      destructive: false,
    };
  }
  if (to === "published") {
    return {
      title: "Publish this job?",
      description: `Published is final: ${FINAL}`,
      confirmLabel: "Publish",
      destructive: false,
    };
  }
  if (to === "failed") {
    return {
      title: "Mark this job as failed?",
      description: `Failed is final: ${FINAL}`,
      confirmLabel: "Mark as failed",
      destructive: true,
    };
  }
  const label = describeAdminStatus("importJob", to).label;
  return {
    title: `Move this job to ${label.toLowerCase()}?`,
    description: NO_WAY_BACK,
    confirmLabel: `Move to ${label.toLowerCase()}`,
    destructive: false,
  };
}
