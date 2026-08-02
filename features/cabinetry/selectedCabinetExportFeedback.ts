export type SelectedCabinetExportKind =
  | "placed-package"
  | "installer-work-order"
  | "project-field-verification"
  | "project-finish-schedule"
  | "project-schedule"
  | "project-schedule-csv"
  | "project-scope"
  | "project-procurement"
  | "project-quote"
  | "project-purchase-readiness"
  | "project-fabrication-release"
  | "project-approval"
  | "project-revision"
  | "project-drawing-set"
  | "project-cut-list"
  | "project-cnc-batch"
  | "project-installation-plan"
  | "project-rfq"
  | "project-handoff";

export const SELECTED_CABINET_EXPORT_FEEDBACK: Record<
  SelectedCabinetExportKind,
  { success: string; failure: string; consoleLabel: string }
> = {
  "placed-package": {
    success: "Placed millwork package exported",
    failure: "Placed millwork package export failed",
    consoleLabel: "placed millwork package",
  },
  "installer-work-order": {
    success: "Installer work order exported",
    failure: "Installer work order export failed",
    consoleLabel: "installer work order",
  },
  "project-field-verification": {
    success: "Field verification package exported",
    failure: "Field verification package export failed",
    consoleLabel: "field verification package",
  },
  "project-finish-schedule": {
    success: "Finish schedule exported",
    failure: "Finish schedule export failed",
    consoleLabel: "finish schedule",
  },
  "project-schedule": {
    success: "Project millwork schedule exported",
    failure: "Project millwork schedule export failed",
    consoleLabel: "project millwork schedule",
  },
  "project-schedule-csv": {
    success: "Project millwork schedule CSV exported",
    failure: "Project millwork schedule CSV export failed",
    consoleLabel: "project millwork schedule CSV",
  },
  "project-scope": {
    success: "Project scope package exported",
    failure: "Project scope package export failed",
    consoleLabel: "project scope package",
  },
  "project-procurement": {
    success: "Project procurement package exported",
    failure: "Project procurement package export failed",
    consoleLabel: "project procurement package",
  },
  "project-quote": {
    success: "Project quote package exported",
    failure: "Project quote package export failed",
    consoleLabel: "project quote package",
  },
  "project-purchase-readiness": {
    success: "Purchase readiness package exported",
    failure: "Purchase readiness package export failed",
    consoleLabel: "purchase readiness package",
  },
  "project-fabrication-release": {
    success: "Fabrication release package exported",
    failure: "Fabrication release package export failed",
    consoleLabel: "fabrication release package",
  },
  "project-approval": {
    success: "Approval package exported",
    failure: "Approval package export failed",
    consoleLabel: "approval package",
  },
  "project-revision": {
    success: "Revision package exported",
    failure: "Revision package export failed",
    consoleLabel: "revision package",
  },
  "project-drawing-set": {
    success: "Drawing set package exported",
    failure: "Drawing set package export failed",
    consoleLabel: "drawing set package",
  },
  "project-cut-list": {
    success: "Cut-list package exported",
    failure: "Cut-list package export failed",
    consoleLabel: "cut-list package",
  },
  "project-cnc-batch": {
    success: "CNC batch manifest exported",
    failure: "CNC batch manifest export failed",
    consoleLabel: "CNC batch manifest",
  },
  "project-installation-plan": {
    success: "Installation plan exported",
    failure: "Installation plan export failed",
    consoleLabel: "installation plan",
  },
  "project-rfq": {
    success: "Project millwork RFQ exported",
    failure: "Project millwork RFQ export failed",
    consoleLabel: "project millwork RFQ",
  },
  "project-handoff": {
    success: "Project handoff bundle exported",
    failure: "Project handoff bundle export failed",
    consoleLabel: "project handoff bundle",
  },
};
