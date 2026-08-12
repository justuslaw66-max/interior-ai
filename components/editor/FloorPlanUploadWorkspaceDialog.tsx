"use client";

import { createPortal } from "react-dom";
import type { RefObject } from "react";
import FloorPlanImportWorkspace from "./FloorPlanImportWorkspace";
import {
  FLOOR_PLAN_WORKSPACE_CLOSE_ACTION_ID,
  FLOOR_PLAN_WORKSPACE_HEADER_UPLOAD_ACTION_ID,
} from "@/lib/floor-plan-upload-dialog-focus";

type FloorPlanUploadWorkspaceDialogProps = {
  open: boolean;
  dialogRef: RefObject<HTMLDivElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  closeButtonRef: RefObject<HTMLButtonElement | null>;
  historyConfirmationOpen: boolean;
  dark: boolean;
  disabled: boolean;
  buttonClass: string;
  subtleClass: string;
  request: { file: File; trainingBenchmarkOptIn: boolean } | null;
  trainingBenchmarkOptIn: boolean;
  onClose: () => void;
  onChooseFile: () => void;
  onConfirmationOpenChange: (open: boolean) => void;
  onTrainingBenchmarkOptInChange: (value: boolean) => void;
};

function WorkspaceHeader({
  dark,
  disabled,
  buttonClass,
  subtleClass,
  closeButtonRef,
  historyConfirmationOpen,
  onClose,
  onChooseFile,
}: Pick<
  FloorPlanUploadWorkspaceDialogProps,
  "dark" | "disabled" | "buttonClass" | "subtleClass" |
  "closeButtonRef" | "historyConfirmationOpen" | "onClose" | "onChooseFile"
>) {
  return (
    <header className={dark
      ? "flex shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-neutral-950/95 px-4 py-3 sm:px-6 sm:py-4"
      : "flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 bg-white/95 px-4 py-3 sm:px-6 sm:py-4"}>
      <div className="min-w-0">
        <div className={dark
          ? "text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-300"
          : "text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-700"}>
          Import workspace
        </div>
        <h2 id="floor-plan-import-dialog-title" className="truncate text-lg font-semibold sm:text-xl">
          Import a floor plan
        </h2>
        <p className={`${subtleClass} hidden sm:block`}>
          Upload once. AI builds an editable 2D and 3D design.
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button id={FLOOR_PLAN_WORKSPACE_HEADER_UPLOAD_ACTION_ID} type="button"
          data-floor-plan-workspace-focus="primary" className={buttonClass}
          disabled={disabled} onClick={onChooseFile}>Choose file</button>
        <button ref={closeButtonRef} id={FLOOR_PLAN_WORKSPACE_CLOSE_ACTION_ID}
          type="button" aria-label="Close floor-plan import"
          className={dark
            ? "designer-control flex h-10 w-10 items-center justify-center rounded-full border text-xl text-neutral-100 hover:bg-white/10"
            : "flex h-10 w-10 items-center justify-center rounded-full border border-neutral-200 bg-white text-xl text-neutral-700 hover:bg-neutral-100"}
          disabled={historyConfirmationOpen} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </header>
  );
}

export function FloorPlanUploadWorkspaceDialog(
  {
    open,
    dialogRef,
    panelRef,
    closeButtonRef,
    historyConfirmationOpen,
    dark,
    disabled,
    buttonClass,
    subtleClass,
    request,
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
        className={dark
          ? "flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-neutral-950 text-neutral-100 shadow-2xl outline-none sm:h-[calc(100dvh-2rem)] sm:max-w-[1600px] sm:rounded-2xl sm:border sm:border-white/10"
          : "flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-white text-neutral-950 shadow-2xl outline-none sm:h-[calc(100dvh-2rem)] sm:max-w-[1600px] sm:rounded-2xl sm:border sm:border-neutral-200"}>
        <WorkspaceHeader dark={dark} disabled={disabled} buttonClass={buttonClass}
          subtleClass={subtleClass} closeButtonRef={closeButtonRef}
          historyConfirmationOpen={historyConfirmationOpen} onClose={onClose}
          onChooseFile={onChooseFile} />
        <div className={dark
          ? "min-h-0 flex-1 overflow-y-auto bg-neutral-950 p-3 sm:p-5 lg:p-6"
          : "min-h-0 flex-1 overflow-y-auto bg-neutral-100/70 p-3 sm:p-5 lg:p-6"}>
          <FloorPlanImportWorkspace request={request}
            trainingBenchmarkOptIn={trainingBenchmarkOptIn} dark={dark}
            disabled={disabled} onChooseFile={onChooseFile}
            onHistoryConfirmationOpenChange={onConfirmationOpenChange}
            onTrainingBenchmarkOptInChange={onTrainingBenchmarkOptInChange} />
        </div>
      </section>
    </div>,
    document.body
  );
}
