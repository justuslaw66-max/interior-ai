"use client";

import { useEffect, useMemo, useState } from "react";
import {
  floorPlanImportResponseJson,
  parseFloorPlanImportDocument,
  parseFloorPlanImportIssues,
  useConsumerFloorPlanImportSession,
} from "./useConsumerFloorPlanImportSession";
import { useConsumerFloorPlanImportProgress } from "./useConsumerFloorPlanImportProgress";
import {
  isFloorPlanMvpBlockingIssue,
  type FloorPlanReviewIssue,
} from "@/lib/floor-plan-imports/types";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import FloorPlanImportReviewPanel from "./floor-plan-import-review/FloorPlanImportReviewPanel";
import { floorPlanReviewSubmissionForSending } from "@/lib/floor-plan-import-review-submission";
import FloorPlanReviewDraftSave from "./floor-plan-import-review/FloorPlanReviewDraftSave";
import { SourceTraceAction,type SourceTraceRequest } from "./floor-plan-import-review/source-trace-action";
import { PhotoReviewAction,requestDetectionReview,photoReviewBusy,canRequestDetectionReview,type PhotoReviewRequest } from "./floor-plan-import-review/photo-review-action";
import { readFloorPlanPageSelection } from "@/lib/floor-plan-imports/page-selection";
import { useConsumerFloorPlanImportActionScope } from "./useConsumerFloorPlanImportActionScope";
import { useConsumerFloorPlanImportCreation } from "./useConsumerFloorPlanImportCreation";
import { FloorPlanImportPausedNotice } from "./FloorPlanImportPausedNotice";
import FloorPlanPageSelectionPanel from "./FloorPlanPageSelectionPanel";
import { FloorPlanImportOpeningCard, FloorPlanImportProgressCard } from "./FloorPlanImportProgressCard";
import FloorPlanImportReadyCard from "./FloorPlanImportReadyCard";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { Button } from "@/components/ui/Button";

type FloorPlanImportAssistantProps = {
  file: File | null;
  trainingBenchmarkOptIn?: boolean;
  disabled?: boolean; proMode?: boolean;
  resumeJobId?: string | null; resumeFileName?: string | null;
  onChooseFile?: () => void;
  onActiveJobIdChange?: (jobId: string | null) => void;
  onJobUpdate?: (job: ConsumerFloorPlanImportJob) => void;
};

export default function FloorPlanImportAssistant({
  file,
  trainingBenchmarkOptIn = false,
  disabled = false, proMode = false,
  resumeJobId = null, resumeFileName = null,
  onChooseFile,
  onActiveJobIdChange,
  onJobUpdate,
}: FloorPlanImportAssistantProps) {
  const beginAction = useConsumerFloorPlanImportActionScope(file, resumeJobId, trainingBenchmarkOptIn);
  const {
    state,
    setState,
    candidate,
    setCandidate, replaceCandidate, reviewHistory,
    issues,
    setIssues,
    title,
    setTitle,
  } = useConsumerFloorPlanImportSession({
    file,
    resumeJobId,
    trainingBenchmarkOptIn,
    onActiveJobIdChange,
    onJobUpdate,
  });
  const [entranceOpeningId, setEntranceOpeningId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingSource, setDeletingSource] = useState(false);
  const [sourceDeleted, setSourceDeleted] = useState(false);
  const [sourceDeletionQueued, setSourceDeletionQueued] = useState(false);
  const [savedUnderlaysScrubbed, setSavedUnderlaysScrubbed] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [savedDraftVersion, setSavedDraftVersion] = useState<number | null>(null);
  const [retryingDetection, setRetryingDetection] = useState(false);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number | null>(
    null
  );

  useEffect(() => {
    setSubmitting(false); setDeletingSource(false);
    setEntranceOpeningId("");
    setSourceDeleted(false);
    setSourceDeletionQueued(false);
    setSavedUnderlaysScrubbed(0);
    setDeleteError(null);
    setCreateError(null);
    setReviewError(null); setSavedDraftVersion(null);
    setRetryingDetection(false);
    setSelectedPageNumber(null);
  }, [file, resumeJobId, trainingBenchmarkOptIn]);

  const activeJob = state.kind === "job" ? state.job : null;
  const createDesign = useConsumerFloorPlanImportCreation({ activeJob, title, beginAction, setSubmitting, setCreateError, onActiveJobIdChange });
  const pageSelection = useMemo(
    () => readFloorPlanPageSelection(activeJob?.candidateJson),
    [activeJob?.candidateJson]
  );
  useEffect(() => {
    if (
      activeJob?.status !== "selecting_page" ||
      !pageSelection?.candidates.length
    ) {
      return;
    }
    setSelectedPageNumber(
      pageSelection.selectedPageNumber ??
        pageSelection.candidates[0].pageNumber
    );
  }, [activeJob?.status, pageSelection]);

  const processAndPoll = useConsumerFloorPlanImportProgress({ setState, onJobUpdate });
  const sourceContentDeleted = Boolean(
    sourceDeleted || activeJob?.sourceAsset?.contentDeletedAt
  );
  const sourceDeletionPending = Boolean(
    !sourceContentDeleted &&
      (sourceDeletionQueued || activeJob?.sourceDeletionRequestedAt)
  );
  const retentionDate = activeJob?.sourceRetentionExpiresAt
    ? new Date(activeJob.sourceRetentionExpiresAt)
    : null;
  const floor = candidate?.floors[0] ?? null;
  const canonicalRoomCount = candidate?.floors.reduce(
    (total, entry) => total + entry.rooms.length,
    0
  ) ?? 0;
  const canonicalDimensionCount = candidate?.floors.reduce(
    (total, entry) => total + entry.dimensions.length,
    0
  ) ?? 0;
  const cadPreview = activeJob?.adapterId?.includes("dxf") ||
    activeJob?.adapterId?.includes("ifc") ||
    activeJob?.adapterId?.includes("dwg")
    ? activeJob.renderedPagesJson?.[0] ?? null
    : null;
  const cannotFinishReason = useMemo(() => {
    if (!candidate || !floor) return "No canonical plan candidate is available.";
    if (!floor.rooms.length || !floor.walls.length) {
      return cadPreview
        ? "The CAD source does not contain enough reviewed room topology to create a design. The importer will not promote unrelated linework into rooms."
        : "Automatic room detection was too weak. Use Set scale + Draw room in this isolated review; the importer will not invent a layout.";
    }
    return null;
  }, [cadPreview, candidate, floor]);

  const submitReview = async (
    reviewIssues: FloorPlanReviewIssue[] = issues,
    draft = false
  ) => {
    if (
      !activeJob ||
      !candidate ||
      (!draft && reviewIssues.some(isFloorPlanMvpBlockingIssue))
    ) {
      return;
    }
    const signal = beginAction();
    setSubmitting(true);
    setReviewError(null);
    try {
      const nextCandidate = floorPlanReviewSubmissionForSending(candidate, entranceOpeningId);
      await floorPlanImportResponseJson(
        await fetch(`/api/floor-plan-imports/${activeJob.id}/candidate`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate: nextCandidate,
            reviewIssues,
            candidateVersion: activeJob.candidateVersion,
            correctionNote: draft
              ? "Consumer saved an incomplete review draft; unresolved evidence remains unconfirmed."
              : "Consumer confirmed the AI-generated floor plan against the uploaded source.",
          }),
        })
      );
      signal.throwIfAborted();
      const job = await processAndPoll(
        activeJob.id,
        draft ? "Validating review draft" : "Validating your corrections", { signal }
      );
      signal.throwIfAborted();
      replaceCandidate(parseFloorPlanImportDocument(job.candidateJson), { keepHistory: draft }); // a draft keeps its undo
      setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
      setState({ kind: "job", job });
      if (draft) setSavedDraftVersion(job.candidateVersion);
    } catch (cause) {
      if (signal.aborted) return;
      setReviewError(userFacingErrorMessage(cause, "Unable to save floor-plan review"));
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  };

  const confirmSelectedPage = async () => {
    if (
      !activeJob ||
      activeJob.status !== "selecting_page" ||
      selectedPageNumber === null
    ) {
      return;
    }
    const signal = beginAction();
    setSubmitting(true);
    try {
      await floorPlanImportResponseJson(
        await fetch(
          `/api/floor-plan-imports/${activeJob.id}/select-page`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              pageNumber: selectedPageNumber,
              candidateVersion: activeJob.candidateVersion,
            }),
          }
        )
      );
      signal.throwIfAborted();
      const job = await processAndPoll(
        activeJob.id,
        "Analysing the selected floor plan",
        { continueSelectedPage: true, signal }
      );
      signal.throwIfAborted();
      replaceCandidate(parseFloorPlanImportDocument(job.candidateJson));
      setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
      setState({ kind: "job", job });
    } catch (cause) {
      if (signal.aborted) return;
      setState({
        kind: "error",
        message: userFacingErrorMessage(cause, "Unable to analyze the selected page"),
      });
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  };

  const retryDetection = async (photo?:PhotoReviewRequest,trace?:SourceTraceRequest) => {
    if (!activeJob || !canRequestDetectionReview(activeJob.status,Boolean(trace))) return;
    const signal = beginAction();
    setRetryingDetection(true);
    setReviewError(null);
    try {
      const job=await requestDetectionReview({activeJob,photo,trace,candidate,signal,onActiveJobIdChange,processAndPoll});
      signal.throwIfAborted();
      replaceCandidate(parseFloorPlanImportDocument(job.candidateJson));
      setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
      setState({ kind: "job", job });
    } catch (cause) {
      if (signal.aborted) return;
      if(photo||trace){setReviewError(userFacingErrorMessage(cause, "Unable to recompute this review"));return;}
      setState({
        kind: "error",
        message: userFacingErrorMessage(cause, "Unable to retry floor-plan detection"),
      });
    } finally {
      if (!signal.aborted) setRetryingDetection(false);
    }
  };

  const deletePrivateSource = async () => {
    if (!activeJob || sourceContentDeleted || sourceDeletionPending) return;
    const signal = beginAction();
    setDeletingSource(true);
    setDeleteError(null);
    try {
      const payload = await floorPlanImportResponseJson(
        await fetch(`/api/floor-plan-imports/${activeJob.id}/source`, {
          method: "DELETE",
        })
      );
      signal.throwIfAborted();
      const deletionQueued = payload.deletionState === "queued";
      const deletionCompleted = payload.deletionState === "deleted";
      if (!deletionQueued && !deletionCompleted) {
        throw new Error("The private-source deletion status is missing");
      }
      setSavedUnderlaysScrubbed(
        typeof payload.designUnderlaysScrubbed === "number"
          ? payload.designUnderlaysScrubbed
          : 0
      );
      setSourceDeletionQueued(deletionQueued);
      setSourceDeleted(deletionCompleted);
      setState((current) =>
        current.kind === "job"
          ? {
              kind: "job",
              job: {
                ...current.job,
                trainingBenchmarkOptIn: false,
                sourceDeletionRequestedAt: new Date().toISOString(),
                sourceAsset: {
                  ...current.job.sourceAsset,
                  ...(deletionCompleted
                    ? {
                        contentDeletedAt: new Date().toISOString(),
                        contentDeletionReason: "owner_requested",
                      }
                    : {}),
                },
              },
            }
          : current
      );
    } catch (cause) {
      if (signal.aborted) return;
      setDeleteError(userFacingErrorMessage(cause, "Unable to delete your uploaded file"));
    } finally {
      if (!signal.aborted) setDeletingSource(false);
    }
  };

  if ((!file && !resumeJobId) || state.kind === "idle") return null;
  if (state.kind === "opening") return <FloorPlanImportOpeningCard fileName={resumeFileName} />;
  const surface = "rounded-xl border border-success-tint-border bg-success-tint p-4 shadow-sm sm:p-5";
  const subtle = "text-label-secondary";
  const control = "rounded-md border border-control-secondary-border bg-field px-2 py-1.5 text-xs text-label";

  if (state.kind === "working") return <FloorPlanImportProgressCard state={state} />;

  if (state.kind === "error") {
    return (
      <FloorPlanImportPausedNotice subtle={subtle} message={state.message}
        authenticationRequired={Boolean(state.authenticationRequired)} resumableJobId={state.resumableJobId ?? null} />
    );
  }

  if (activeJob?.status === "failed") {
    return (
      <div className={surface} data-testid="floor-plan-import-failed" data-floor-plan-workspace-state="failure">
        <div className="text-xs font-semibold">Could not read this drawing</div>
        <p className={`mt-1 text-xs ${subtle}`}>
          Retry with a clearer drawing or upload a new file.
        </p>
        {!sourceContentDeleted && !sourceDeletionPending ? (
          <Button
            data-floor-plan-workspace-focus="primary"
            variant="primary" size="compact" className="mt-3"
            disabled={disabled || retryingDetection || deletingSource}
            onClick={() => void retryDetection()}
          >
            {retryingDetection
              ? "Retrying improved detection…"
              : "Retry with improved detection"}
          </Button>
        ) : null}
        {!sourceContentDeleted && !sourceDeletionPending ? (
          <Button
            variant="secondary" size="compact" className="mt-2"
            disabled={disabled || deletingSource || retryingDetection}
            onClick={() => void deletePrivateSource()}
          >
            {deletingSource ? "Deleting upload…" : "Delete private upload now"}
          </Button>
        ) : sourceDeletionPending ? (
          <p className={`mt-2 text-xs ${subtle}`}>
            Deletion requested; removal from private storage is queued.
          </p>
        ) : (
          <p className={`mt-2 text-xs ${subtle}`}>
            {savedUnderlaysScrubbed > 0
              ? "Your upload and its floor plan image in your designs were deleted."
              : "Private upload deleted."}
          </p>
        )}
        {deleteError && <p className="mt-2 text-xs text-on-danger-tint">{deleteError}</p>}
      </div>
    );
  }

  if (activeJob?.status === "ready") {
    return <FloorPlanImportReadyCard key={activeJob.id} {...{ activeJob, candidate, floor, setCandidate, canonicalRoomCount, canonicalDimensionCount, disabled, submitting, deletingSource, createDesign, createError, title, setTitle, subtle, surface, control, sourceDeletionPending, sourceContentDeleted, savedUnderlaysScrubbed, retentionDate, deletePrivateSource, onChooseFile, deleteError }} />;
  }

  if (
    activeJob?.status === "selecting_page" &&
    pageSelection?.candidates.length
  ) {
    return (
      <div className={surface}>
        <FloorPlanPageSelectionPanel
          job={activeJob}
          candidates={pageSelection.candidates}
          selectedPageNumber={selectedPageNumber}
          onSelectedPageNumberChange={setSelectedPageNumber}
          onConfirm={() => void confirmSelectedPage()}
          submitting={submitting}
          disabled={disabled}
        />
      </div>
    );
  }

  if (!activeJob || !candidate || !floor) return null;
  return (
    <div className={surface} data-surface="floating" data-testid="floor-plan-import-review" data-floor-plan-workspace-state="review">
      {reviewError ? (
        <p className="mb-3 rounded-md bg-danger-tint p-2 text-xs text-on-danger-tint" role="alert">
          {reviewError}
        </p>
      ) : null}
      <FloorPlanReviewDraftSave disabled={disabled} submitting={submitting} deletingSource={deletingSource}
        savedVersion={savedDraftVersion} subtle={subtle} history={reviewHistory} onSave={() => void submitReview(issues, true)} />
      <SourceTraceAction.Provider value={{candidateVersion:activeJob.candidateVersion,saved:parseFloorPlanImportDocument(activeJob.candidateJson),onAccept:request=>void retryDetection(undefined,request)}}>
      <PhotoReviewAction.Provider value={(request)=>void retryDetection(request)}><FloorPlanImportReviewPanel
        candidate={candidate}
        job={activeJob}
        issues={issues}
        setCandidate={setCandidate}
        setIssues={setIssues}
        entranceOpeningId={entranceOpeningId}
        setEntranceOpeningId={setEntranceOpeningId}
        cannotFinishReason={cannotFinishReason}
        onChooseFile={onChooseFile}
        onRetryDetection={() => void retryDetection()}
        retryingDetection={retryingDetection}
        onSubmit={(reviewIssues) => void submitReview(reviewIssues)}
        submitting={submitting}
        disabled={photoReviewBusy(disabled,submitting,retryingDetection)} proMode={proMode} reviewRestores={reviewHistory.restores}
      /></PhotoReviewAction.Provider></SourceTraceAction.Provider>
    </div>
  );
}
