"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  floorPlanImportResponseJson,
  parseFloorPlanImportDocument,
  parseFloorPlanImportIssues,
  useConsumerFloorPlanImportSession,
} from "./useConsumerFloorPlanImportSession";
import { pollFloorPlanImportJobUntilPaused } from "@/lib/floor-plan-import-client";
import { isFloorPlanMvpBlockingIssue } from "@/lib/floor-plan-imports/types";
import type { ConsumerFloorPlanImportJob } from "./floor-plan-import-ui-types";
import FloorPlanImportReviewPanel from "./floor-plan-import-review/FloorPlanImportReviewPanel";
import FloorPlanOptionalConfigurationPanel from "./FloorPlanOptionalConfigurationPanel";
import { inspectFloorPlanOptionalConfigurations } from "@/lib/floor-plan-optional-configurations";

type FloorPlanImportAssistantProps = {
  file: File | null;
  trainingBenchmarkOptIn?: boolean;
  dark?: boolean;
  disabled?: boolean;
  resumeJobId?: string | null;
  onActiveJobIdChange?: (jobId: string | null) => void;
  onSourceContentDeleted?: () => void;
};

export default function FloorPlanImportAssistant({
  file,
  trainingBenchmarkOptIn = false,
  dark = false,
  disabled = false,
  resumeJobId = null,
  onActiveJobIdChange,
  onSourceContentDeleted,
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
  });
  const [entranceOpeningId, setEntranceOpeningId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deletingSource, setDeletingSource] = useState(false);
  const [sourceDeleted, setSourceDeleted] = useState(false);
  const [sourceDeletionQueued, setSourceDeletionQueued] = useState(false);
  const [savedUnderlaysScrubbed, setSavedUnderlaysScrubbed] = useState(0);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [autoCreateError, setAutoCreateError] = useState<string | null>(null);
  const autoCreateAttemptRef = useRef<string | null>(null);

  useEffect(() => {
    setEntranceOpeningId("");
    setSourceDeleted(false);
    setSourceDeletionQueued(false);
    setSavedUnderlaysScrubbed(0);
    setDeleteError(null);
    setAutoCreateError(null);
    autoCreateAttemptRef.current = null;
  }, [file, resumeJobId]);

  const activeJob = state.kind === "job" ? state.job : null;
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
  const unresolvedCritical = issues.filter(isFloorPlanMvpBlockingIssue);
  const cannotFinishReason = useMemo(() => {
    if (!candidate || !floor) return "No canonical plan candidate is available.";
    if (!floor.rooms.length || !floor.walls.length) {
      return cadPreview
        ? "The CAD source does not contain enough reviewed room topology to create a design. The importer will not promote unrelated linework into rooms."
        : "Automatic room detection was too weak. Keep the underlay and use Set scale + Draw room; the importer will not invent a layout.";
    }
    return null;
  }, [cadPreview, candidate, floor]);

  const submitReview = async () => {
    if (!activeJob || !candidate || unresolvedCritical.length > 0) return;
    setSubmitting(true);
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
            reviewIssues: issues,
            candidateVersion: activeJob.candidateVersion,
            correctionNote: "Consumer completed the quick floor-plan review.",
          }),
        })
      );
      setState({ kind: "working", message: "Validating your corrections", progress: 78 });
      await floorPlanImportResponseJson(
        await fetch(`/api/floor-plan-imports/${activeJob.id}/process`, { method: "POST" })
      );
      const refreshed = await floorPlanImportResponseJson(
        await fetch(`/api/floor-plan-imports/${activeJob.id}`, { cache: "no-store" })
      );
      let job = refreshed.job as ConsumerFloorPlanImportJob;
      job = await pollFloorPlanImportJobUntilPaused({
        initialJob: job,
        loadJob: async () => {
          const pending = await floorPlanImportResponseJson(
            await fetch(`/api/floor-plan-imports/${activeJob.id}`, { cache: "no-store" })
          );
          return pending.job as ConsumerFloorPlanImportJob;
        },
        onProgress: (pendingJob) => setState({
          kind: "working",
          message: "Validating your corrections",
          progress: pendingJob.progress,
        }),
      });
      setCandidate(parseFloorPlanImportDocument(job.candidateJson));
      setIssues(parseFloorPlanImportIssues(job.reviewIssuesJson));
      setState({ kind: "job", job });
    } catch (cause) {
      setState({
        kind: "error",
        message: cause instanceof Error ? cause.message : "Unable to save floor-plan review",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const createDesign = useCallback(async (automatic = false) => {
    if (!activeJob || activeJob.status !== "ready") return;
    setSubmitting(true);
    setAutoCreateError(null);
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
      router.push(`/design/${encodeURIComponent(id)}`);
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message
        : "Unable to create the new design";
      if (automatic) setAutoCreateError(message);
      else setState({ kind: "error", message });
    } finally {
      setSubmitting(false);
    }
  }, [activeJob, onActiveJobIdChange, router, setState, title]);

  const optionalConfigurationCount = useMemo(
    () => candidate ? inspectFloorPlanOptionalConfigurations(candidate).length : 0,
    [candidate]
  );

  useEffect(() => {
    if (
      disabled ||
      submitting ||
      !activeJob ||
      activeJob.status !== "ready" ||
      optionalConfigurationCount > 0
    ) {
      return;
    }
    const attemptKey = `${activeJob.id}:${activeJob.candidateVersion}`;
    if (autoCreateAttemptRef.current === attemptKey) return;
    autoCreateAttemptRef.current = attemptKey;
    void createDesign(true);
  }, [
    activeJob,
    createDesign,
    disabled,
    optionalConfigurationCount,
    submitting,
  ]);

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
      onSourceContentDeleted?.();
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
    ? "designer-recessed rounded-lg border border-white/10 p-3"
    : "rounded-lg border border-emerald-200 bg-emerald-50/70 p-3";
  const subtle = dark ? "text-neutral-400" : "text-neutral-600";
  const control = dark
    ? "designer-control rounded-md border px-2 py-1.5 text-xs text-neutral-100"
    : "rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900";

  if (state.kind === "working") {
    return (
      <div className={surface} data-testid="floor-plan-import-progress" aria-live="polite">
        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
          <span>{state.message}</span>
          <span>{Math.max(0, Math.min(100, Math.round(state.progress)))}%</span>
        </div>
        <div className={dark ? "mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" : "mt-2 h-1.5 overflow-hidden rounded-full bg-emerald-100"}>
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${state.progress}%` }} />
        </div>
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className={dark ? "designer-recessed rounded-lg border border-amber-400/20 p-3" : "rounded-lg border border-amber-200 bg-amber-50 p-3"} data-testid="floor-plan-import-error">
        <div className="text-xs font-semibold">Auto-detection paused</div>
        <p className={`mt-1 text-xs leading-4 ${subtle}`}>{state.message}</p>
      </div>
    );
  }

  if (activeJob?.status === "failed") {
    return (
      <div className={surface} data-testid="floor-plan-import-failed">
        <div className="text-xs font-semibold">Could not read this drawing</div>
        <p className={`mt-1 text-xs ${subtle}`}>
          {activeJob.errorMessage ?? "Keep the uploaded underlay and continue with guided tracing."}
        </p>
        {!sourceContentDeleted && !sourceDeletionPending ? (
          <button
            type="button"
            className={dark ? "designer-control mt-2 rounded-md border px-2 py-1.5 text-xs" : "mt-2 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs"}
            disabled={disabled || deletingSource}
            onClick={() => void deletePrivateSource()}
          >
            {deletingSource ? "Deleting upload…" : "Delete upload and underlay now"}
          </button>
        ) : sourceDeletionPending ? (
          <p className={`mt-2 text-[10px] ${subtle}`}>
            Deletion requested. The underlay is cleared now; removal from private storage is queued.
          </p>
        ) : (
          <p className={`mt-2 text-[10px] ${subtle}`}>
            {savedUnderlaysScrubbed > 0
              ? "Upload and matching saved-design underlay deleted."
              : "Upload deleted and the open underlay cleared."}
          </p>
        )}
        {deleteError && <p className="mt-2 text-[10px] text-red-600">{deleteError}</p>}
      </div>
    );
  }

  if (activeJob?.status === "ready") {
    return (
      <div className={surface} data-testid="floor-plan-import-ready">
        <div className="text-xs font-semibold text-emerald-700">Floor plan ready</div>
        <p
          className={`mt-1 text-xs leading-4 ${subtle}`}
          data-testid="floor-plan-import-accuracy-baseline"
        >
          Accuracy baseline passed: {canonicalRoomCount} canonical room
          {canonicalRoomCount === 1 ? "" : "s"} and {canonicalDimensionCount} exact
          printed dimension{canonicalDimensionCount === 1 ? "" : "s"}. Source
          scale and all critical review items passed validation.
        </p>
        <p className={`mt-1 text-xs leading-4 ${subtle}`}>
          {optionalConfigurationCount > 0
            ? "Choose any source-supported option, then create the saved design. Your current design stays saved and is not replaced."
            : submitting && !autoCreateError
              ? "Creating the editable 2D/3D design now. Your current design stays saved and is not replaced."
              : "The editable design is created automatically. Your current design stays saved and is not replaced."}
        </p>
        <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
          {sourceDeletionPending
            ? "Deletion requested. The open underlay is cleared; removal from private storage is queued. The editable plan and integrity hashes remain."
            : sourceContentDeleted
            ? savedUnderlaysScrubbed > 0
              ? "The upload and matching saved-design underlay have been deleted. The editable plan and integrity hashes remain."
              : "The upload was deleted and the open underlay cleared. The editable plan and integrity hashes remain."
            : retentionDate && !Number.isNaN(retentionDate.getTime())
              ? `Private file bytes are scheduled for deletion by ${retentionDate.toLocaleDateString()}. You can delete them now without deleting this plan.`
              : "Private file bytes are retained temporarily and can be deleted now without deleting this plan."}
        </p>
        <input
          className={`${control} mt-2 w-full`}
          value={title}
          maxLength={160}
          aria-label="New design name"
          onChange={(event) => setTitle(event.target.value)}
        />
        {candidate ? (
          <FloorPlanOptionalConfigurationPanel
            document={candidate}
            dark={dark}
            disabled={disabled || submitting}
            compact
          />
        ) : null}
        <button
          type="button"
          className="mt-2 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
          disabled={disabled || submitting}
          onClick={() => void createDesign(false)}
        >
          {submitting
            ? "Creating and opening…"
            : autoCreateError
              ? "Try creating again"
              : "Create new design"}
        </button>
        {autoCreateError ? (
          <p className="mt-2 text-[10px] leading-4 text-red-600">
            Automatic creation paused: {autoCreateError}
          </p>
        ) : null}
        {!sourceContentDeleted && !sourceDeletionPending && (
          <button
            type="button"
            className={dark ? "designer-control mt-2 w-full rounded-md border px-3 py-2 text-xs font-semibold" : "mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700"}
            disabled={disabled || deletingSource || submitting}
            onClick={() => void deletePrivateSource()}
          >
            {deletingSource ? "Deleting upload…" : "Delete upload and underlay now"}
          </button>
        )}
        {deleteError && <p className="mt-2 text-[10px] text-red-600">{deleteError}</p>}
      </div>
    );
  }

  if (!activeJob || !candidate || !floor) return null;

  return (
    <div className={surface} data-testid="floor-plan-import-review">
      <FloorPlanImportReviewPanel
        candidate={candidate}
        job={activeJob}
        issues={issues}
        setCandidate={setCandidate}
        setIssues={setIssues}
        entranceOpeningId={entranceOpeningId}
        setEntranceOpeningId={setEntranceOpeningId}
        cannotFinishReason={cannotFinishReason}
        onSubmit={() => void submitReview()}
        submitting={submitting}
        disabled={disabled}
        dark={dark}
      />
    </div>
  );
}
