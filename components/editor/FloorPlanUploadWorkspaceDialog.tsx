"use client";

import { createPortal } from "react-dom";
import type { RefObject } from "react";
import { X } from "lucide-react";
import FloorPlanImportWorkspace from "./FloorPlanImportWorkspace";
import type { FloorPlanUploadChooseState } from "./FloorPlanUploadChooseStep";
import {
  FLOOR_PLAN_WORKSPACE_CLOSE_ACTION_ID,
  FLOOR_PLAN_WORKSPACE_HEADER_UPLOAD_ACTION_ID,
} from "@/lib/floor-plan-upload-dialog-focus";
import { Button } from "@/components/ui/Button";

type FloorPlanUploadWorkspaceDialogProps = {
  open: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  historyConfirmationOpen: boolean;
  disabled: boolean; proMode: boolean;
  request: { file: File; trainingBenchmarkOptIn: boolean } | null;
  choose: FloorPlanUploadChooseState;
  trainingBenchmarkOptIn: boolean;
  onClose: () => void;
  onChooseFile: () => void;
  onConfirmationOpenChange: (open: boolean) => void;
  onTrainingBenchmarkOptInChange: (value: boolean) => void;
};

function WorkspaceHeader({
  disabled,
  signedIn,
  closeButtonRef,
  historyConfirmationOpen,
  onClose,
  onChooseFile,
}: Pick<
  FloorPlanUploadWorkspaceDialogProps,
  "disabled" | "closeButtonRef" | "historyConfirmationOpen" | "onClose" | "onChooseFile"
> & { signedIn: boolean }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-separator bg-surface-elevated/95 px-4 py-3 sm:px-6 sm:py-4">
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-on-success-tint">
          Private upload
        </div>
        <h2 id="floor-plan-import-dialog-title" className="truncate text-lg font-semibold sm:text-xl">
          Upload floor plan
        </h2>
        <p className="hidden text-xs text-label-secondary sm:block">
          Upload once. AI builds an editable 2D and 3D design.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {signedIn ? (
          <Button
            id={FLOOR_PLAN_WORKSPACE_HEADER_UPLOAD_ACTION_ID}
            data-floor-plan-workspace-focus="primary"
            variant="primary" size="touch"
            disabled={disabled}
            onClick={onChooseFile}
          >Choose file</Button>
        ) : null}
        <button ref={closeButtonRef} id={FLOOR_PLAN_WORKSPACE_CLOSE_ACTION_ID}
          type="button" aria-label="Close floor plan upload"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-box-border bg-control-secondary text-control-label-idle hover:bg-control-quiet-hover"
          disabled={historyConfirmationOpen} onClick={onClose}>
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

/** The upload window, in a portal to the page body. */
export function FloorPlanUploadWorkspaceDialog(
  {
    open,
    dialogRef,
    panelRef,
    closeButtonRef,
    historyConfirmationOpen,
    disabled, proMode,
    request, choose,
    trainingBenchmarkOptIn,
    onClose,
    onChooseFile,
    onConfirmationOpenChange,
    onTrainingBenchmarkOptInChange,
  }: FloorPlanUploadWorkspaceDialogProps
) {
  if (!open) return null;
  return createPortal(
    <div ref={dialogRef} aria-labelledby="floor-plan-import-dialog-title"
      aria-modal="true" role="dialog" tabIndex={-1}
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm sm:p-4"
      data-testid="floor-plan-import-dialog" data-floor-plan-import-backdrop="true"
      onMouseDown={(event) => {
        if (!historyConfirmationOpen && event.target === event.currentTarget) onClose();
      }}>
      <section ref={panelRef} data-testid="floor-plan-import-dialog-panel" tabIndex={-1}
        className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-surface-elevated text-label shadow-2xl outline-hidden sm:h-[calc(100dvh-2rem)] sm:max-w-[1600px] sm:rounded-2xl sm:border sm:border-separator">
        <WorkspaceHeader disabled={disabled} signedIn={choose.signedIn} closeButtonRef={closeButtonRef}
          historyConfirmationOpen={historyConfirmationOpen} onClose={onClose}
          onChooseFile={onChooseFile} />
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-well p-3 sm:p-5 lg:p-6">
          <FloorPlanImportWorkspace request={request} choose={choose}
            trainingBenchmarkOptIn={trainingBenchmarkOptIn}
            disabled={disabled} proMode={proMode} onChooseFile={onChooseFile}
            onHistoryConfirmationOpenChange={onConfirmationOpenChange}
            onTrainingBenchmarkOptInChange={onTrainingBenchmarkOptInChange} />
        </div>
      </section>
    </div>,
    document.body
  );
}
