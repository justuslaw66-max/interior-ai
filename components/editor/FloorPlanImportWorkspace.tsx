"use client";

import { useEffect, useState } from "react";
import FloorPlanImportAssistant from "./FloorPlanImportAssistant";
import FloorPlanImportHistory from "./FloorPlanImportHistory";
import { FloorPlanUploadChooseStep, type FloorPlanUploadChooseState } from "./FloorPlanUploadChooseStep";
import { useFloorPlanImportSelection } from "./useFloorPlanImportSelection";
import { useFloorPlanImportCancel } from "./useFloorPlanImportCancel";
import { FloorPlanImportCancelScope } from "./FloorPlanImportProgressCard";

type FloorPlanImportWorkspaceProps = {
  request: { file: File; trainingBenchmarkOptIn: boolean } | null;
  choose: FloorPlanUploadChooseState;
  trainingBenchmarkOptIn: boolean;
  disabled: boolean; proMode: boolean;
  onChooseFile: () => void; onHistoryConfirmationOpenChange: (open: boolean) => void;
  onTrainingBenchmarkOptInChange: (value: boolean) => void;
  /** Cancel upload was pressed and hasn't been answered yet. */
  onImportCancellingChange?: (cancelling: boolean) => void;
};

function useHistoryConfirmationGuard(onChange: (open: boolean) => void) {
  const [secondaryOptionsOpen, setSecondaryOptionsOpen] = useState(false);
  const [historyConfirmationOpen, setHistoryConfirmationOpen] = useState(false);
  useEffect(() => {
    onChange(secondaryOptionsOpen && historyConfirmationOpen);
    return () => onChange(false);
  }, [historyConfirmationOpen, onChange, secondaryOptionsOpen]);
  return { secondaryOptionsOpen, setSecondaryOptionsOpen, setHistoryConfirmationOpen };
}

export default function FloorPlanImportWorkspace({
  request, choose, trainingBenchmarkOptIn, disabled, proMode,
  onChooseFile, onHistoryConfirmationOpenChange, onTrainingBenchmarkOptInChange, onImportCancellingChange,
}: FloorPlanImportWorkspaceProps) {
  const {
    activeRequest, resumeJobId, resumeFileName, lastUpload, activeImportJobId, historyRefreshKey,
    activeJobSnapshot, reviewSession, selectImportJob, recordActiveImportJob, recordJobUpdate,
  } = useFloorPlanImportSelection(request, choose.accountKey ?? "guest");
  const { secondaryOptionsOpen, setSecondaryOptionsOpen, setHistoryConfirmationOpen } = useHistoryConfirmationGuard(onHistoryConfirmationOpenChange);
  const cancelImport = useFloorPlanImportCancel({ request: activeRequest, resumeJobId,
    onActiveJobIdChange: recordActiveImportJob, onJobUpdate: recordJobUpdate, onCancelled: () => selectImportJob(null) });
  const subtle = "text-label-secondary";
  const hasActiveImport=Boolean(activeRequest||resumeJobId);
  return (
    <div
      className="mx-auto min-w-0 max-w-[1320px]"
      data-testid="floor-plan-import-workspace"
    >
      <main className="min-w-0">
        {hasActiveImport && choose.fileProblem ? (
          <p role="alert" className="mb-3 text-sm font-semibold text-on-danger-tint">
            {choose.fileProblem}
          </p>
        ) : null}
        {hasActiveImport ? (
          <FloorPlanImportCancelScope cancel={cancelImport.value} onCancellingChange={onImportCancellingChange}><FloorPlanImportAssistant
            key={reviewSession}
            file={activeRequest?.file ?? null}
            resumeJobId={activeRequest ? null : resumeJobId} resumeFileName={resumeFileName}
            trainingBenchmarkOptIn={request?.trainingBenchmarkOptIn ?? false}
            disabled={disabled} proMode={proMode}
            onChooseFile={onChooseFile}
            onActiveJobIdChange={cancelImport.trackJobId}
            onJobUpdate={cancelImport.trackJob}
          /></FloorPlanImportCancelScope>
        ) : (
          <FloorPlanUploadChooseStep {...choose} disabled={disabled} onChooseFile={onChooseFile}
            lastUpload={lastUpload} onContinueLastUpload={selectImportJob} />
        )}
      </main>
      <details
        className="mt-4 rounded-xl border border-box-border bg-surface-elevated-secondary p-3" data-surface="floating"
        data-testid="floor-plan-import-secondary-options" data-floor-plan-workspace-history="true"
        open={secondaryOptionsOpen}
        onToggle={(event) => setSecondaryOptionsOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer text-sm font-semibold" data-floor-plan-workspace-focus="primary">
          Previous uploads & privacy
        </summary>
        <p className={`mt-1 text-xs leading-5 ${subtle}`}>
          Most people can ignore this section. Open it to resume an older
          upload, manage your private files, or change optional data settings.
        </p>
        <div className="mt-3 grid min-w-0 items-start gap-3 lg:grid-cols-2">
          <div
            className="rounded-lg bg-tile p-3"
            data-testid="floor-plan-private-upload-disclosure"
          >
            <div className="text-xs font-semibold">Private by default</div>
            <p className={`mt-1 text-xs leading-5 ${subtle}`}>
              Your uploaded files are kept for a limited time and can be deleted
              without deleting your design. When AI reading is used, pages of
              your floor plan are sent to our AI provider with storage of its
              replies turned off.
            </p>
            <label className="mt-3 flex items-start gap-2 text-xs leading-5 text-label-secondary">
              <input
                type="checkbox"
                className="mt-1"
                checked={trainingBenchmarkOptIn}
                disabled={disabled}
                onChange={(event) =>
                  onTrainingBenchmarkOptInChange(event.target.checked)
                }
              />
              <span>
                Allow us to use this upload to test and improve floor plan detection.
              </span>
            </label>
          </div>
          <FloorPlanImportHistory
            disabled={disabled}
            activeJobId={activeImportJobId} openJobId={hasActiveImport ? activeImportJobId : null}
            activeJobSnapshot={activeJobSnapshot}
            refreshKey={historyRefreshKey}
            onResume={selectImportJob}
            onConfirmationOpenChange={setHistoryConfirmationOpen}
          />
        </div>
      </details>
    </div>
  );
}
