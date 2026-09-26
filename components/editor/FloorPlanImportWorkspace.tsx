"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readActiveFloorPlanImportId,
  writeActiveFloorPlanImportId,
} from "@/lib/floor-plan-import-client";
import FloorPlanImportAssistant from "./FloorPlanImportAssistant";
import FloorPlanImportHistory from "./FloorPlanImportHistory";
import { FloorPlanUploadChooseStep, type FloorPlanUploadChooseState } from "./FloorPlanUploadChooseStep";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";

type FloorPlanImportWorkspaceProps = {
  request: { file: File; trainingBenchmarkOptIn: boolean } | null;
  choose: FloorPlanUploadChooseState;
  trainingBenchmarkOptIn: boolean;
  dark: boolean; disabled: boolean; proMode: boolean;
  onChooseFile: () => void; onHistoryConfirmationOpenChange: (open: boolean) => void;
  onTrainingBenchmarkOptInChange: (value: boolean) => void;
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

const initialStoredJobId = () => typeof window === "undefined" ? null : readActiveFloorPlanImportId(window.localStorage);

export default function FloorPlanImportWorkspace({
  request, choose,
  trainingBenchmarkOptIn,
  dark, disabled, proMode,
  onChooseFile, onHistoryConfirmationOpenChange,
  onTrainingBenchmarkOptInChange,
}: FloorPlanImportWorkspaceProps) {
  const [resumeJobId, setResumeJobId] = useState<string | null>(initialStoredJobId);
  const [activeImportJobId, setActiveImportJobId] = useState<string | null>(initialStoredJobId);
  const [ignoredRequest, setIgnoredRequest] = useState<typeof request>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeJobSnapshot, setActiveJobSnapshot] = useState<ConsumerFloorPlanImportJob | null>(null);
  const [reviewSession, setReviewSession] = useState(0);
  const { secondaryOptionsOpen, setSecondaryOptionsOpen, setHistoryConfirmationOpen } = useHistoryConfirmationGuard(onHistoryConfirmationOpenChange);

  const selectImportJob = useCallback((jobId: string | null) => {
    if(jobId!==activeImportJobId){setReviewSession(value=>value+1);setActiveJobSnapshot(null);}
    writeActiveFloorPlanImportId(window.localStorage, jobId);
    setResumeJobId(jobId);
    setIgnoredRequest(request);
    setActiveImportJobId(jobId);
    setHistoryRefreshKey((value) => value + 1);
  }, [request,activeImportJobId]);

  const recordActiveImportJob = useCallback((jobId: string | null) => {
    writeActiveFloorPlanImportId(window.localStorage, jobId);
    setActiveImportJobId(jobId);
    if (!jobId) setActiveJobSnapshot(null);
    setHistoryRefreshKey((value) => value + 1);
  }, []);

  const recordJobUpdate = useCallback((job: ConsumerFloorPlanImportJob) => {
    setActiveJobSnapshot(job);
    setActiveImportJobId(job.id);
  }, []);

  const subtle = dark ? "text-neutral-400" : "text-neutral-500";
  const activeRequest=request!==ignoredRequest?request:null;
  const hasActiveImport=Boolean(activeRequest||resumeJobId);
  return (
    <div
      className="mx-auto min-w-0 max-w-[1320px]"
      data-testid="floor-plan-import-workspace"
    >
      <main className="min-w-0">
        {hasActiveImport && choose.fileProblem ? (
          <p role="alert" className={`mb-3 text-sm font-semibold ${dark ? "text-red-300" : "text-red-700"}`}>
            {choose.fileProblem}
          </p>
        ) : null}
        {hasActiveImport ? (
          <FloorPlanImportAssistant
            key={reviewSession}
            file={activeRequest?.file ?? null}
            resumeJobId={activeRequest ? null : resumeJobId}
            trainingBenchmarkOptIn={request?.trainingBenchmarkOptIn ?? false}
            dark={dark} disabled={disabled} proMode={proMode}
            onChooseFile={onChooseFile}
            onActiveJobIdChange={recordActiveImportJob}
            onJobUpdate={recordJobUpdate}
          />
        ) : (
          <FloorPlanUploadChooseStep {...choose} dark={dark} disabled={disabled} onChooseFile={onChooseFile} />
        )}
      </main>
      <details
        className={
          dark
            ? "designer-recessed mt-4 rounded-xl p-3"
            : "mt-4 rounded-xl border border-neutral-200 bg-white p-3"
        }
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
            className={
              dark
                ? "designer-raised rounded-lg p-3"
                : "rounded-lg bg-neutral-50 p-3"
            }
            data-testid="floor-plan-private-upload-disclosure"
          >
            <div className="text-xs font-semibold">Private by default</div>
            <p className={`mt-1 text-xs leading-5 ${subtle}`}>
              Your uploaded files are kept for a limited time and can be deleted
              without deleting your design. When AI reading is used, pages of
              your floor plan are sent to our AI provider with storage of its
              replies turned off.
            </p>
            <label
              className={`mt-3 flex items-start gap-2 text-xs leading-5 ${
                dark ? "text-neutral-300" : "text-neutral-600"
              }`}
            >
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
            dark={dark}
            disabled={disabled}
            activeJobId={activeImportJobId}
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
