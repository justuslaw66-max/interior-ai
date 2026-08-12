"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  floorPlanImportResponseJson,
  loadConsumerFloorPlanImportJob,
  parseFloorPlanImportDocument,
  parseFloorPlanImportIssues,
  useConsumerFloorPlanImportSession,
} from "./useConsumerFloorPlanImportSession";
import {
  isPausedFloorPlanImportStatus,
  startAndPollFloorPlanImport,
} from "@/lib/floor-plan-import-client";
import {
  isFloorPlanMvpBlockingIssue,
  type FloorPlanReviewIssue,
} from "@/lib/floor-plan-imports/types";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import FloorPlanImportReviewPanel from "./floor-plan-import-review/FloorPlanImportReviewPanel";
import FloorPlanVisualReviewTools from "./floor-plan-import-review/FloorPlanVisualReviewTools";
import FloorPlanOptionalConfigurationPanel from "./FloorPlanOptionalConfigurationPanel";
import { inspectFloorPlanOptionalConfigurations } from "@/lib/floor-plan-optional-configurations";
import { readFloorPlanPageSelection } from "@/lib/floor-plan-imports/page-selection";
import { formatFloorPlanRemainingTime } from "@/lib/floor-plan-imports/progress-estimate";
import FloorPlanPageSelectionPanel from "./FloorPlanPageSelectionPanel";

type FloorPlanImportAssistantProps = {
  file: File | null;
  trainingBenchmarkOptIn?: boolean;
  dark?: boolean;
  disabled?: boolean;
  resumeJobId?: string | null;
  onChooseFile?: () => void;
  onActiveJobIdChange?: (jobId: string | null) => void;
  onJobUpdate?: (job: ConsumerFloorPlanImportJob) => void;
};

export default function FloorPlanImportAssistant({
  file,
  trainingBenchmarkOptIn = false,
  dark = false,
  disabled = false,
  resumeJobId = null,
  onChooseFile,
  onActiveJobIdChange,
  onJobUpdate,
}: FloorPlanImportAssistantProps) {
  const router = useRouter();
  const {
    state,
    setState,
    candidate,
    setCandidate,
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
  const [retryingDetection, setRetryingDetection] = useState(false);
  const [selectedPageNumber, setSelectedPageNumber] = useState<number | null>(
    null
  );

  useEffect(() => {
    setEntranceOpeningId("");
    setSourceDeleted(false);
    setSourceDeletionQueued(false);
    setSavedUnderlaysScrubbed(0);
    setDeleteError(null);
    setCreateError(null);
    setReviewError(null);
    setRetryingDetection(false);
    setSelectedPageNumber(null);
  }, [file, resumeJobId]);

  const activeJob = state.kind === "job" ? state.job : null;
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

  const showWorkingJob = useCallback(
    (job: ConsumerFloorPlanImportJob, fallbackMessage: string) => {
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
    },
    [onJobUpdate, setState]
  );

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
    reviewIssues: FloorPlanReviewIssue[] = issues
  ) => {
    if (
      !activeJob ||
      !candidate ||
      reviewIssues.some(isFloorPlanMvpBlockingIssue)
    ) {
      return;
    }
    setSubmitting(true);
    setReviewError(null);
    try {
      const nextCandidate = structuredClone(candidate);
      const nextFloor = nextCandidate.floors[0];
      if (entranceOpeningId && nextFloor) {
        const entrance = nextFloor.openings.find((opening) => opening.id === entranceOpeningId);
        if (entrance && !nextFloor.annotations.some((annotation) => annotation.configurationId === "main-entrance")) {
          let annotationIndex = nextFloor.annotations.length + 1;
          while (
            nextFloor.annotations.some(
              (annotation) => annotation.id === `annotation-${annotationIndex}`
            )
          ) {
            annotationIndex += 1;
          }
          nextFloor.annotations.push({
            id: `annotation-${annotationIndex}`,
            kind: "label",
            text: "Main entrance",
            geometry: {
              kind: "wall_span",
              wallId: entrance.wallId,
              offsetMm: entrance.offsetMm,
              widthMm: entrance.widthMm,
            },
            configurationId: "main-entrance",
            provenance: structuredClone(entrance.provenance),
          });
        }
      }
      await floorPlanImportResponseJson(
        await fetch(`/api/floor-plan-imports/${activeJob.id}/candidate`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            candidate: nextCandidate,
            reviewIssues,
            candidateVersion: activeJob.candidateVersion,
            correctionNote:
              "Consumer confirmed the AI-generated floor plan against the uploaded source.",
          }),
        })
      );
      const job = await processAndPoll(
        activeJob.id,
        "Validating your corrections"
      );
      setCandidate(parseFloorPlanImportDocument(job.candidateJson));
      setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
      setState({ kind: "job", job });
    } catch (cause) {
      setReviewError(
        cause instanceof Error
          ? cause.message
          : "Unable to save floor-plan review"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const createDesign = useCallback(async () => {
    if (!activeJob || activeJob.status !== "ready") return;
    setSubmitting(true);
    setCreateError(null);
    try {
      const payload = await floorPlanImportResponseJson(
        await fetch(`/api/floor-plan-imports/${activeJob.id}/confirm`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, candidateVersion: activeJob.candidateVersion }),
        })
      );
      const id = typeof payload.id === "string" ? payload.id : null;
      if (!id) throw new Error("The new design ID is missing");
      onActiveJobIdChange?.(null);
      router.push(
        `/design?designId=${encodeURIComponent(
          id
        )}&view=2d&workspace=furnish&floorPlanImport=${encodeURIComponent(
          activeJob.id
        )}`
      );
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : "Unable to create the new design";
      setCreateError(message);
    } finally {
      setSubmitting(false);
    }
  }, [activeJob, onActiveJobIdChange, router, title]);

  const optionalConfigurationCount = useMemo(
    () => candidate ? inspectFloorPlanOptionalConfigurations(candidate).length : 0,
    [candidate]
  );

  const confirmSelectedPage = async () => {
    if (
      !activeJob ||
      activeJob.status !== "selecting_page" ||
      selectedPageNumber === null
    ) {
      return;
    }
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
      const job = await processAndPoll(
        activeJob.id,
        "Analyzing the selected floor plan",
        { continueSelectedPage: true }
      );
      setCandidate(parseFloorPlanImportDocument(job.candidateJson));
      setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
      setState({ kind: "job", job });
    } catch (cause) {
      setState({
        kind: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "Unable to analyze the selected page",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const retryDetection = async () => {
    if (!activeJob || !["needs_review", "failed"].includes(activeJob.status)) {
      return;
    }
    setRetryingDetection(true);
    setReviewError(null);
    try {
      const retryPayload = await floorPlanImportResponseJson(
        await fetch(
          `/api/floor-plan-imports/${activeJob.id}/retry-detection`,
          { method: "POST" }
        )
      );
      const retryJobId =
        retryPayload.job &&
        typeof retryPayload.job === "object" &&
        typeof (retryPayload.job as { id?: unknown }).id === "string"
          ? (retryPayload.job as { id: string }).id
          : null;
      if (!retryJobId) throw new Error("The retry job ID is missing");
      onActiveJobIdChange?.(retryJobId);
      const job = await processAndPoll(
        retryJobId,
        "Retrying with improved wall and dimension detection"
      );
      setCandidate(parseFloorPlanImportDocument(job.candidateJson));
      setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
      setState({ kind: "job", job });
    } catch (cause) {
      setState({
        kind: "error",
        message:
          cause instanceof Error
            ? cause.message
            : "Unable to retry floor-plan detection",
      });
    } finally {
      setRetryingDetection(false);
    }
  };

  const deletePrivateSource = async () => {
    if (!activeJob || sourceContentDeleted || sourceDeletionPending) return;
    setDeletingSource(true);
    setDeleteError(null);
    try {
      const payload = await floorPlanImportResponseJson(
        await fetch(`/api/floor-plan-imports/${activeJob.id}/source`, {
          method: "DELETE",
        })
      );
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
      setDeleteError(
        cause instanceof Error
          ? cause.message
          : "Unable to delete the private floor-plan source"
      );
    } finally {
      setDeletingSource(false);
    }
  };

  if ((!file && !resumeJobId) || state.kind === "idle") return null;
  const surface = dark
    ? "designer-recessed rounded-xl border border-white/10 p-4 sm:p-5"
    : "rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-sm sm:p-5";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs text-neutral-100"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900";

  if (state.kind === "working") {
    const estimate = state.estimate;
    const progress = Math.max(0, Math.min(99, Math.round(state.progress)));
    const retrySeconds =
      estimate?.activity === "retrying" && estimate.nextAttemptAt
        ? Math.max(
            1,
            Math.ceil((Date.parse(estimate.nextAttemptAt) - Date.now()) / 1_000)
          )
        : null;
    const timingMessage =
      estimate?.activity === "queued"
        ? "Waiting to start"
        : estimate?.activity === "retrying"
          ? `Retrying in ${retrySeconds ?? 1} sec`
          : estimate?.activity === "awaiting_user"
            ? "Waiting for your review"
            : estimate?.activity === "attention" &&
                !estimate.heartbeatHealthy
              ? "Processing connection delayed"
              : estimate?.unusuallySlow
                ? "Taking longer than usual — AI is still working"
                : formatFloorPlanRemainingTime(
                    estimate?.remainingRangeMs ?? null,
                    estimate?.confidence ?? null
                  );
    return (
      <div
        className={`${surface} flex min-h-[440px] flex-col items-center justify-center text-center`}
        data-testid="floor-plan-import-progress" data-floor-plan-workspace-state="working"
      >
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-100" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-emerald-600" />
        </div>
        <h3 className="mt-5 text-xl font-semibold">AI is reading your floor plan</h3>
        <p className={`mt-2 max-w-lg text-sm leading-6 ${subtle}`}>
          Finding walls, printed dimensions, room names, doors, and windows.
          You can leave this screen and return later.
        </p>
        <div className="mt-5 w-full max-w-xl">
          <div className="flex items-center justify-between gap-2 text-xs font-semibold">
            <span className="flex items-center gap-2 text-left">
              {state.message}
              {estimate?.heartbeatHealthy ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              ) : null}
            </span>
            <span>{progress}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Estimated floor-plan import progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            className={
              dark
                ? "mt-2 h-2 overflow-hidden rounded-full bg-white/10"
                : "mt-2 h-2 overflow-hidden rounded-full bg-emerald-100"
            }
          >
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className={`mt-3 text-xs font-medium ${subtle}`}>
            Estimated progress
          </div>
          <div className={`mt-1 min-h-5 text-sm ${subtle}`} aria-live="polite">
            {timingMessage ?? "Calculating time remaining…"}
          </div>
          <div className={`mt-2 text-xs ${subtle}`}>
            Upload · Detection · Dimensions · Editable plan
          </div>
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={dark ? "designer-recessed rounded-lg border border-amber-400/20 p-3" : "rounded-lg border border-amber-200 bg-amber-50 p-3"} data-testid="floor-plan-import-error" data-floor-plan-workspace-state="failure">
        <div className="text-xs font-semibold">Auto-detection paused</div>
        <p className={`mt-1 text-xs leading-4 ${subtle}`}>{state.message}</p>
        {state.resumableJobId && !state.authenticationRequired ? (
          <button
            type="button" data-floor-plan-workspace-focus="primary"
            className={`${control} mt-3 font-semibold`}
            onClick={() => window.location.reload()}
          >
            Resume processing
          </button>
        ) : null}
      </div>
    );
  }

  if (activeJob?.status === "failed") {
    return (
      <div className={surface} data-testid="floor-plan-import-failed" data-floor-plan-workspace-state="failure">
        <div className="text-xs font-semibold">Could not read this drawing</div>
        <p className={`mt-1 text-xs ${subtle}`}>
          {activeJob.errorMessage ?? "Retry with a clearer drawing or start a new import."}
        </p>
        {!sourceContentDeleted && !sourceDeletionPending ? (
          <button
            type="button" data-floor-plan-workspace-focus="primary"
            className="mt-3 rounded-md bg-neutral-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
            disabled={disabled || retryingDetection}
            onClick={() => void retryDetection()}
          >
            {retryingDetection
              ? "Retrying improved detection…"
              : "Retry with improved detection"}
          </button>
        ) : null}
        {!sourceContentDeleted && !sourceDeletionPending ? (
          <button
            type="button"
            className={dark ? "designer-control mt-2 rounded-md border px-2 py-1.5 text-xs" : "mt-2 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs"}
            disabled={disabled || deletingSource}
            onClick={() => void deletePrivateSource()}
          >
            {deletingSource ? "Deleting upload…" : "Delete private upload now"}
          </button>
        ) : sourceDeletionPending ? (
          <p className={`mt-2 text-[10px] ${subtle}`}>
            Deletion requested; removal from private storage is queued.
          </p>
        ) : (
          <p className={`mt-2 text-[10px] ${subtle}`}>
            {savedUnderlaysScrubbed > 0
              ? "Upload and matching saved-design reference deleted."
              : "Private upload deleted."}
          </p>
        )}
        {deleteError && <p className="mt-2 text-[10px] text-red-600">{deleteError}</p>}
      </div>
    );
  }

  if (activeJob?.status === "ready") {
    return (
      <div className={surface} data-testid="floor-plan-import-ready" data-floor-plan-workspace-state="ready">
        <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
          AI import complete
        </div>
        <h3 className="mt-1 text-2xl font-semibold">Your editable plan is ready</h3>
        <p className={`mt-2 max-w-3xl text-sm leading-6 ${subtle}`}>
          AI found {canonicalRoomCount} room
          {canonicalRoomCount === 1 ? "" : "s"} and{" "}
          {canonicalDimensionCount} exact printed measurement
          {canonicalDimensionCount === 1 ? "" : "s"}. Create a separate design
          with editable walls, rooms, doors, and windows. It starts with no
          furniture.
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-800">
            Editable 2D
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-800">
            Editable 3D
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-800">
            Zero furniture
          </span>
          <span className="rounded-full bg-emerald-100 px-3 py-1.5 font-semibold text-emerald-800">
            Current design unchanged
          </span>
        </div>
        {candidate && floor ? (
          <FloorPlanVisualReviewTools
            document={candidate}
            job={activeJob}
            focusedIssueEntityIds={[]}
            onChange={(next) => setCandidate(next)}
            previewOnly
            dark={dark}
            disabled
          />
        ) : null}
        <button
          type="button" data-floor-plan-workspace-focus="primary"
          className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          disabled={disabled || submitting}
          onClick={() => void createDesign()}
        >
          {submitting
            ? "Creating and opening…"
            : createError
              ? "Try creating again"
              : "Create editable plan"}
        </button>
        <p className={`mt-2 text-center text-xs leading-5 ${subtle}`}>
          Opens in 2D Furnish. Switch to 3D at any time.
        </p>
        {createError ? (
          <p className="mt-2 text-[10px] leading-4 text-red-600">
            Creation paused: {createError}
          </p>
        ) : null}
        <details
          className={
            dark
              ? "designer-recessed mt-4 rounded-xl p-3"
              : "mt-4 rounded-xl border border-neutral-200 bg-white p-3"
          }
        >
          <summary className="cursor-pointer text-xs font-semibold">
            Rename, plan options & privacy
          </summary>
          <label className={`mt-3 block text-xs ${subtle}`}>
            Design name
            <input
              className={`${control} mt-1 w-full`}
              value={title}
              maxLength={160}
              aria-label="New design name"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          {candidate && optionalConfigurationCount > 0 ? (
            <FloorPlanOptionalConfigurationPanel
              document={candidate}
              dark={dark}
              disabled={disabled || submitting}
              compact
            />
          ) : null}
          <p
            className={`mt-3 text-xs leading-5 ${subtle}`}
            data-testid="floor-plan-import-accuracy-baseline"
          >
            Accuracy baseline passed: {canonicalRoomCount} canonical room
            {canonicalRoomCount === 1 ? "" : "s"} and{" "}
            {canonicalDimensionCount} exact printed dimension
            {canonicalDimensionCount === 1 ? "" : "s"}. Source scale and all
            critical review items passed validation.
          </p>
          <p className={`mt-2 text-xs leading-5 ${subtle}`}>
            {sourceDeletionPending
              ? "Private-source deletion is queued."
              : sourceContentDeleted
                ? savedUnderlaysScrubbed > 0
                  ? "The upload and saved-design reference were deleted."
                  : "The private upload was deleted."
                : retentionDate && !Number.isNaN(retentionDate.getTime())
                  ? `Private file bytes are scheduled for deletion by ${retentionDate.toLocaleDateString()}.`
                  : "Private file bytes are retained temporarily."}
          </p>
          {!sourceContentDeleted && !sourceDeletionPending ? (
            <button
              type="button"
              className={
                dark
                  ? "designer-control mt-2 rounded-md border px-3 py-2 text-xs font-semibold"
                  : "mt-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700"
              }
              disabled={disabled || deletingSource || submitting}
              onClick={() => void deletePrivateSource()}
            >
              {deletingSource ? "Deleting upload…" : "Delete private upload"}
            </button>
          ) : null}
          {onChooseFile ? (
            <button
              type="button"
              className={
                dark
                  ? "designer-control ml-2 mt-2 rounded-md border px-3 py-2 text-xs font-semibold"
                  : "ml-2 mt-2 rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700"
              }
              disabled={disabled || submitting}
              onClick={onChooseFile}
            >
              Use a different file
            </button>
          ) : null}
          {deleteError ? (
            <p className="mt-2 text-[10px] text-red-600">{deleteError}</p>
          ) : null}
        </details>
      </div>
    );
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
          dark={dark}
        />
      </div>
    );
  }

  if (!activeJob || !candidate || !floor) return null;

  return (
    <div className={surface} data-testid="floor-plan-import-review" data-floor-plan-workspace-state="review">
      {reviewError ? (
        <p className="mb-3 rounded-md bg-red-50 p-2 text-xs text-red-700" role="alert">
          {reviewError}
        </p>
      ) : null}
      <FloorPlanImportReviewPanel
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
        disabled={disabled}
        dark={dark}
      />
    </div>
  );
}
