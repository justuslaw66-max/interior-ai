"use client";

import { useCallback, useState } from "react";
import {
  readActiveFloorPlanImportId,
  writeActiveFloorPlanImportId,
} from "@/lib/floor-plan-import-client";
import FloorPlanImportAssistant from "./FloorPlanImportAssistant";
import FloorPlanImportHistory from "./FloorPlanImportHistory";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";

type FloorPlanImportWorkspaceProps = {
  request: { file: File; trainingBenchmarkOptIn: boolean } | null;
  trainingBenchmarkOptIn: boolean;
  dark: boolean;
  disabled: boolean;
  onChooseFile: () => void;
  onTrainingBenchmarkOptInChange: (value: boolean) => void;
};

export default function FloorPlanImportWorkspace({
  request,
  trainingBenchmarkOptIn,
  dark,
  disabled,
  onChooseFile,
  onTrainingBenchmarkOptInChange,
}: FloorPlanImportWorkspaceProps) {
  const initialStoredJobId = () =>
    typeof window === "undefined"
      ? null
      : readActiveFloorPlanImportId(window.localStorage);
  const [resumeJobId, setResumeJobId] = useState<string | null>(initialStoredJobId);
  const [activeImportJobId, setActiveImportJobId] = useState<string | null>(initialStoredJobId);
  const [ignoredRequest, setIgnoredRequest] = useState<typeof request>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [activeJobSnapshot, setActiveJobSnapshot] =
    useState<ConsumerFloorPlanImportJob | null>(null);

  const selectImportJob = useCallback((jobId: string | null) => {
    writeActiveFloorPlanImportId(window.localStorage, jobId);
    setResumeJobId(jobId);
    setIgnoredRequest(request);
    setActiveImportJobId(jobId);
    if (!jobId) setActiveJobSnapshot(null);
    setHistoryRefreshKey((value) => value + 1);
  }, [request]);

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
  const hasActiveImport = Boolean(
    (request && request !== ignoredRequest) || resumeJobId
  );
  return (
    <div
      className="mx-auto min-w-0 max-w-[1320px]"
      data-testid="floor-plan-import-workspace"
    >
      <main className="min-w-0">
        {hasActiveImport ? (
          <FloorPlanImportAssistant
            file={request && request !== ignoredRequest ? request.file : null}
            resumeJobId={request && request !== ignoredRequest ? null : resumeJobId}
            trainingBenchmarkOptIn={request?.trainingBenchmarkOptIn ?? false}
            dark={dark}
            disabled={disabled}
            onChooseFile={onChooseFile}
            onActiveJobIdChange={recordActiveImportJob}
            onJobUpdate={recordJobUpdate}
          />
        ) : (
          <div
            className={
              dark
                ? "designer-recessed flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-white/10 p-6 text-center"
                : "flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm"
            }
            data-testid="floor-plan-import-dialog-empty-state"
          >
            <div
              aria-hidden="true"
              className={
                dark
                  ? "flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-2xl"
                  : "flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-100 text-2xl"
              }
            >
              ⌗
            </div>
            <h3 className="mt-4 text-lg font-semibold">
              Start with a clear floor-plan file
            </h3>
            <p className={`mt-2 max-w-md text-sm leading-6 ${subtle}`}>
              Upload an image, PDF, DXF, IFC, or DWG. We will detect the plan
              and show it here at a readable size before creating anything.
            </p>
            <button
              type="button"
              className={
                dark
                  ? "designer-control-active mt-5 rounded-lg border px-4 py-2.5 text-sm font-semibold"
                  : "mt-5 rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"
              }
              disabled={disabled}
              onClick={onChooseFile}
            >
              Choose floor-plan file
            </button>
          </div>
        )}
      </main>
      <details
        className={
          dark
            ? "designer-recessed mt-4 rounded-xl p-3"
            : "mt-4 rounded-xl border border-neutral-200 bg-white p-3"
        }
        data-testid="floor-plan-import-secondary-options"
      >
        <summary className="cursor-pointer text-sm font-semibold">
          Previous imports & privacy
        </summary>
        <p className={`mt-1 text-xs leading-5 ${subtle}`}>
          Most people can ignore this section. Open it to resume an older
          import, manage private source files, or change optional data settings.
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
              Source files are retained temporarily and can be deleted without
              deleting the editable plan. When vision recognition is enabled,
              plan pages are sent to the configured model with response storage
              disabled.
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
                Allow this upload to improve internal detection benchmarks.
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
          />
        </div>
      </details>
    </div>
  );
}
