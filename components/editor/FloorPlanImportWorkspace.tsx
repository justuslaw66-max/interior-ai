"use client";

import { useCallback, useState } from "react";
import {
  readActiveFloorPlanImportId,
  writeActiveFloorPlanImportId,
} from "@/lib/floor-plan-import-client";
import FloorPlanImportAssistant from "./FloorPlanImportAssistant";
import FloorPlanImportHistory from "./FloorPlanImportHistory";

type FloorPlanImportWorkspaceProps = {
  request: { file: File; trainingBenchmarkOptIn: boolean } | null;
  trainingBenchmarkOptIn: boolean;
  dark: boolean;
  disabled: boolean;
  onTrainingBenchmarkOptInChange: (value: boolean) => void;
  onSourceContentDeleted: () => void;
};

export default function FloorPlanImportWorkspace({
  request,
  trainingBenchmarkOptIn,
  dark,
  disabled,
  onTrainingBenchmarkOptInChange,
  onSourceContentDeleted,
}: FloorPlanImportWorkspaceProps) {
  const initialStoredJobId = () =>
    typeof window === "undefined"
      ? null
      : readActiveFloorPlanImportId(window.localStorage);
  const [resumeJobId, setResumeJobId] = useState<string | null>(initialStoredJobId);
  const [activeImportJobId, setActiveImportJobId] = useState<string | null>(initialStoredJobId);
  const [ignoredRequest, setIgnoredRequest] = useState<typeof request>(null);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const selectImportJob = useCallback((jobId: string | null) => {
    writeActiveFloorPlanImportId(window.localStorage, jobId);
    setResumeJobId(jobId);
    setIgnoredRequest(request);
    setActiveImportJobId(jobId);
    setHistoryRefreshKey((value) => value + 1);
  }, [request]);

  const recordActiveImportJob = useCallback((jobId: string | null) => {
    writeActiveFloorPlanImportId(window.localStorage, jobId);
    setActiveImportJobId(jobId);
    setHistoryRefreshKey((value) => value + 1);
  }, []);

  const subtle = dark ? "text-neutral-400" : "text-neutral-500";
  return (
    <>
      <div className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg bg-neutral-50 p-3"} data-testid="floor-plan-private-upload-disclosure">
        <p className={`text-xs leading-4 ${subtle}`}>
          Private by default. Server copies are retained temporarily; clear or delete the source whenever you no longer need it.
        </p>
        <label className={`mt-2 flex items-start gap-2 text-[11px] leading-4 ${dark ? "text-neutral-300" : "text-neutral-600"}`}>
          <input
            type="checkbox"
            className="mt-0.5"
            checked={trainingBenchmarkOptIn}
            disabled={disabled}
            onChange={(event) => onTrainingBenchmarkOptInChange(event.target.checked)}
          />
          <span>Optional: allow this upload to improve internal detection benchmarks. Unchecked by default.</span>
        </label>
        <p className={`mt-1 text-[10px] ${subtle}`}>This choice never extends private-source retention.</p>
      </div>
      <FloorPlanImportHistory
        dark={dark}
        disabled={disabled}
        activeJobId={activeImportJobId}
        refreshKey={historyRefreshKey}
        onResume={selectImportJob}
      />
      <FloorPlanImportAssistant
        file={request && request !== ignoredRequest ? request.file : null}
        resumeJobId={request && request !== ignoredRequest ? null : resumeJobId}
        trainingBenchmarkOptIn={request?.trainingBenchmarkOptIn ?? false}
        dark={dark}
        disabled={disabled}
        onActiveJobIdChange={recordActiveImportJob}
        onSourceContentDeleted={onSourceContentDeleted}
      />
    </>
  );
}
