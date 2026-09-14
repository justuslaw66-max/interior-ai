import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import { floorPlanImportResponseJson, loadConsumerFloorPlanImportJob, type ConsumerFloorPlanImportState } from "./useConsumerFloorPlanImportSession";
import { isPausedFloorPlanImportStatus, startAndPollFloorPlanImport } from "@/lib/floor-plan-import-client";

type ProgressInput = {
  setState: Dispatch<SetStateAction<ConsumerFloorPlanImportState>>;
  onJobUpdate?: (job: ConsumerFloorPlanImportJob) => void;
};

function showWorkingImportJob({ setState, onJobUpdate }: ProgressInput, job: ConsumerFloorPlanImportJob, fallbackMessage: string) {
  onJobUpdate?.(job);
  const estimate = job.progressEstimate;
  const nextProgress = estimate?.estimatedPercent ?? job.progress;
  setState((current) => ({
    kind: "working",
    message: estimate?.stageLabel ?? fallbackMessage,
    progress:
      current.kind === "working" && current.status === job.status
        ? Math.max(current.progress, nextProgress)
        : nextProgress,
    status: job.status,
    estimate,
  }));
}

export function useConsumerFloorPlanImportProgress({ setState, onJobUpdate }: ProgressInput) {
  const showWorkingJob = useCallback((job: ConsumerFloorPlanImportJob, message: string) =>
    showWorkingImportJob({ setState, onJobUpdate }, job, message), [setState, onJobUpdate]);
  const processAndPoll = useCallback(
    async (
      jobId: string,
      fallbackMessage: string,
      options: { continueSelectedPage?: boolean } = {}
    ) => {
      const statusUrl = `/api/floor-plan-imports/${encodeURIComponent(jobId)}`;
      const loadJob = () => loadConsumerFloorPlanImportJob(statusUrl);
      const initialJob = await loadJob();
      showWorkingJob(initialJob, fallbackMessage);
      return startAndPollFloorPlanImport({
        initialJob,
        startProcessing: async () =>
          floorPlanImportResponseJson(
            await fetch(`${statusUrl}/process`, { method: "POST" })
          ),
        loadJob,
        isPaused: options.continueSelectedPage
          ? (job) =>
              job.status === "selecting_page"
                ? false
                : isPausedFloorPlanImportStatus(job.status)
          : undefined,
        onProgress: (job) => showWorkingJob(job, fallbackMessage),
      });
    },
    [showWorkingJob]
  );
  return processAndPoll;
}
