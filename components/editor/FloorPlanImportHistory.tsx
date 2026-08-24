"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isResumableFloorPlanImportStatus,
} from "@/lib/floor-plan-import-client";
import type { ConsumerFloorPlanImportJob, ConsumerFloorPlanImportSummary } from "./floor-plan-import-ui-types";
import { useFloorPlanHistoryConfirmationState } from "./useFloorPlanHistoryConfirmationState";

type FloorPlanImportHistoryProps = {
  dark?: boolean;
  disabled?: boolean;
  activeJobId: string | null;
  activeJobSnapshot: ConsumerFloorPlanImportJob | null;
  refreshKey: number;
  onResume: (jobId: string | null) => void; onConfirmationOpenChange: (open: boolean) => void;
};

type ImportListResponse = {
  jobs?: ConsumerFloorPlanImportSummary[];
  nextCursor?: string | null;
  error?: string;
};

const CANCELLABLE_STATUSES = new Set([
  "received",
  "rendered",
  "extracted",
  "selecting_page",
  "scale_solved",
  "topology_built",
  "validating",
  "needs_review",
]);
function statusLabel(job: ConsumerFloorPlanImportSummary) {
  if (job.status === "failed" && job.errorMessage === "Cancelled by owner") return "Cancelled";
  return job.status.replaceAll("_", " ");
}

export default function FloorPlanImportHistory({
  dark = false,
  disabled = false,
  activeJobId,
  activeJobSnapshot,
  refreshKey,
  onResume, onConfirmationOpenChange,
}: FloorPlanImportHistoryProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ConsumerFloorPlanImportSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [confirmDeleteJobId, setConfirmDeleteJobId] = useState<string | null>(null);
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(
    () => new Set()
  );
  const [bulkDeleteScope, setBulkDeleteScope] = useState<
    "selected" | "all" | null
  >(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const guardConfirmationEscape = useFloorPlanHistoryConfirmationState(confirmDeleteJobId, bulkDeleteScope, historyOpen, onConfirmationOpenChange);

  const load = useCallback(async (
    cursor: string | null,
    append: boolean,
    silent = false
  ) => {
    if (!silent) {
      if (append) setLoadingMore(true);
      else setLoading(true);
    }
    setErrorMessage(null);
    try {
      const query = new URLSearchParams({ limit: "6" });
      if (cursor) query.set("cursor", cursor);
      const response = await fetch(`/api/floor-plan-imports?${query}`, {
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      const payload = (await response.json().catch(() => ({}))) as ImportListResponse;
      if (!response.ok) throw new Error(payload.error ?? "Imports could not be loaded");
      const page = Array.isArray(payload.jobs) ? payload.jobs : [];
      setJobs((current) => append ? [...current, ...page] : page);
      if (!append) {
        const pageIds = new Set(page.map((job) => job.id));
        setSelectedJobIds(
          (current) =>
            new Set([...current].filter((jobId) => pageIds.has(jobId)))
        );
      }
      setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Imports could not be loaded");
    } finally {
      if (!silent) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void load(null, false);
  }, [load, refreshKey]);

  useEffect(() => {
    if (!activeJobSnapshot) return;
    setJobs((current) =>
      current.map((job) =>
        job.id === activeJobSnapshot.id
          ? {
              ...job,
              status: activeJobSnapshot.status,
              progress: activeJobSnapshot.progress,
              adapterId: activeJobSnapshot.adapterId,
              candidateVersion: activeJobSnapshot.candidateVersion,
              errorMessage: activeJobSnapshot.errorMessage,
              appliedDesignId: activeJobSnapshot.appliedDesignId,
              nextAttemptAt: activeJobSnapshot.nextAttemptAt,
              leaseExpiresAt: activeJobSnapshot.leaseExpiresAt,
            }
          : job
      )
    );
  }, [activeJobSnapshot]);

  useEffect(() => {
    if (!historyOpen) return;
    const refreshVisibleHistory = () => {
      if (document.visibilityState === "visible") {
        void load(null, false, true);
      }
    };
    const interval = window.setInterval(refreshVisibleHistory, 10_000);
    document.addEventListener("visibilitychange", refreshVisibleHistory);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshVisibleHistory);
    };
  }, [historyOpen, load]);

  const runAction = async (
    job: ConsumerFloorPlanImportSummary,
    action: "cancel" | "retry" | "delete"
  ) => {
    setActionJobId(job.id);
    setErrorMessage(null);
    try {
      const jobUrl = `/api/floor-plan-imports/${encodeURIComponent(job.id)}`;
      const response = await fetch(
        action === "delete" ? jobUrl : `${jobUrl}/${action}`,
        {
          method: action === "delete" ? "DELETE" : "POST",
          headers: { Accept: "application/json" },
        }
      );
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        job?: { id?: string };
      };
      if (!response.ok) throw new Error(payload.error ?? `Unable to ${action} this import`);
      if (action === "retry" && typeof payload.job?.id === "string") {
        onResume(payload.job.id);
      } else if (activeJobId === job.id) {
        onResume(null);
      }
      if (action === "delete") {
        setConfirmDeleteJobId(null);
        setJobs((current) => current.filter((entry) => entry.id !== job.id));
        setSelectedJobIds((current) => {
          const next = new Set(current);
          next.delete(job.id);
          return next;
        });
      }
      await load(null, false);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : `Unable to ${action} this import`);
    } finally {
      setActionJobId(null);
    }
  };

  const runBulkDelete = async (scope: "selected" | "all") => {
    const selectedIds = [...selectedJobIds];
    if (scope === "selected" && selectedIds.length === 0) return;
    setBulkDeleting(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/floor-plan-imports", {
        method: "DELETE",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          scope === "all" ? { all: true } : { jobIds: selectedIds }
        ),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        deletedCount?: number;
        skippedBusyCount?: number;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to delete these imports");
      }
      if (
        scope === "all" ||
        (activeJobId !== null && selectedJobIds.has(activeJobId))
      ) {
        onResume(null);
      }
      setSelectedJobIds(new Set());
      setBulkDeleteScope(null);
      setConfirmDeleteJobId(null);
      await load(null, false);
      if ((payload.skippedBusyCount ?? 0) > 0) {
        setErrorMessage(
          `${payload.deletedCount ?? 0} imports were deleted. ${
            payload.skippedBusyCount
          } still finishing a processing step can be deleted shortly.`
        );
      }
    } catch (cause) {
      setErrorMessage(
        cause instanceof Error ? cause.message : "Unable to delete these imports"
      );
    } finally {
      setBulkDeleting(false);
    }
  };

  const allShownSelected = jobs.length > 0 && jobs.every((job) => selectedJobIds.has(job.id));
  const toggleAllShown = () => {
    setSelectedJobIds((current) => {
      const next = new Set(current);
      if (allShownSelected) {
        for (const job of jobs) next.delete(job.id);
      } else {
        for (const job of jobs) next.add(job.id);
      }
      return next;
    });
  };

  const subtle = dark ? "text-neutral-400" : "text-neutral-500";
  const card = dark
    ? "designer-control rounded-lg border border-white/10 p-2.5"
    : "rounded-lg border border-neutral-200 bg-white p-2.5";
  const secondary = dark
    ? "designer-control rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
    : "rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <details
      className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg bg-neutral-50 p-3"}
      open={historyOpen}
      onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      onKeyDownCapture={guardConfirmationEscape}
    >
      <summary className="cursor-pointer text-xs font-semibold">My floor-plan imports</summary>
      <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
        Resume a review after refreshing or leaving the editor. Imports remain private to your account.
      </p>
      {!loading && jobs.length > 0 ? (
        <div
          className={`mt-2 flex flex-wrap items-center gap-2 rounded-md border p-2 ${
            dark
              ? "border-white/10 bg-black/10"
              : "border-neutral-200 bg-white"
          }`}
          data-testid="floor-plan-import-bulk-actions"
        >
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] font-semibold">
            <input
              type="checkbox"
              checked={allShownSelected}
              disabled={disabled || bulkDeleting}
              onChange={toggleAllShown}
            />
            Select shown
          </label>
          <span className={`text-[10px] ${subtle}`}>
            {selectedJobIds.size} selected
          </span>
          <div className="ml-auto flex flex-wrap gap-1.5">
            <button
              type="button"
              className={`${secondary} text-red-700`}
              disabled={
                disabled || bulkDeleting || selectedJobIds.size === 0
              }
              onClick={() => setBulkDeleteScope("selected")}
            >
              Delete selected
            </button>
            <button
              type="button"
              className={`${secondary} text-red-700`}
              disabled={disabled || bulkDeleting}
              onClick={() => setBulkDeleteScope("all")}
            >
              Delete all
            </button>
          </div>
        </div>
      ) : null}
      {bulkDeleteScope ? (
        <div
          role="alertdialog"
          aria-labelledby="floor-plan-bulk-delete-title"
          className={`mt-2 rounded-md border p-2 ${
            dark
              ? "border-red-400/30 bg-red-950/30"
              : "border-red-200 bg-red-50"
          }`}
          data-testid="floor-plan-import-bulk-delete-confirmation"
        >
          <p
            id="floor-plan-bulk-delete-title"
            className="text-[11px] font-semibold"
          >
            {bulkDeleteScope === "all"
              ? "Delete all imports from your history?"
              : `Delete ${selectedJobIds.size} selected ${
                  selectedJobIds.size === 1 ? "import" : "imports"
                }?`}
          </p>
          <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
            Generated designs will stay. Unfinished imports will be stopped
            when safe, and uploaded sources continue to follow your private
            retention settings.
          </p>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              className={secondary}
              disabled={disabled || bulkDeleting}
              onClick={() => setBulkDeleteScope(null)}
            >
              Keep imports
            </button>
            <button
              type="button"
              className={`${secondary} text-red-700`}
              disabled={disabled || bulkDeleting}
              onClick={() => void runBulkDelete(bulkDeleteScope)}
            >
              {bulkDeleting
                ? "Deleting…"
                : bulkDeleteScope === "all"
                  ? "Delete all imports"
                  : "Delete selected imports"}
            </button>
          </div>
        </div>
      ) : null}
      {loading ? <p className={`mt-2 text-xs ${subtle}`}>Loading imports…</p> : null}
      {!loading && jobs.length === 0 ? (
        <p className={`mt-2 text-xs ${subtle}`}>No previous imports yet.</p>
      ) : null}
      <div className="mt-2 grid gap-2">
        {jobs.map((job) => {
          const active = job.id === activeJobId;
          const busy = actionJobId === job.id || bulkDeleting;
          const canResume = isResumableFloorPlanImportStatus(job.status);
          const confirmingDelete = confirmDeleteJobId === job.id;
          return (
            <article key={job.id} className={card} data-testid={`floor-plan-import-history-${job.id}`}>
              <div className="flex items-start justify-between gap-2">
                <label className="mt-0.5 flex shrink-0 cursor-pointer items-center">
                  <input
                    type="checkbox"
                    checked={selectedJobIds.has(job.id)}
                    disabled={disabled || bulkDeleting}
                    aria-label={`Select ${
                      job.sourceAsset.fileName ?? "private floor plan"
                    }`}
                    onChange={(event) =>
                      setSelectedJobIds((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(job.id);
                        else next.delete(job.id);
                        return next;
                      })
                    }
                  />
                </label>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-semibold">
                    {job.sourceAsset.fileName ?? "Private floor plan"}
                  </div>
                  <div className={`mt-0.5 text-[10px] capitalize ${subtle}`}>
                    {job.status === "failed"
                      ? statusLabel(job)
                      : `${statusLabel(job)} · ${Math.round(job.progress)}%`}
                  </div>
                </div>
                {active ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-800">
                    Open
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {canResume ? (
                  <button type="button" className={secondary} disabled={disabled || busy} onClick={() => onResume(job.id)}>
                    {active ? "Continue below" : "Resume"}
                  </button>
                ) : null}
                {job.appliedDesignId ? (
                  <button
                    type="button"
                    className={secondary}
                    disabled={disabled || busy}
                    onClick={() =>
                      router.push(
                        `/design?designId=${encodeURIComponent(
                          job.appliedDesignId!
                        )}&view=2d&workspace=furnish&floorPlanImport=${encodeURIComponent(
                          job.id
                        )}`
                      )
                    }
                  >
                    Open design
                  </button>
                ) : null}
                {job.status === "failed" ? (
                  <button type="button" className={secondary} disabled={disabled || busy} onClick={() => void runAction(job, "retry")}>
                    {busy ? "Retrying…" : "Retry from source"}
                  </button>
                ) : null}
                {CANCELLABLE_STATUSES.has(job.status) ? (
                  <button
                    type="button"
                    className={`${secondary} text-red-700`}
                    disabled={disabled || busy}
                    onClick={() => void runAction(job, "cancel")}
                  >
                    {busy ? "Cancelling…" : "Cancel"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${secondary} text-red-700`}
                  disabled={disabled || busy}
                  onClick={() => setConfirmDeleteJobId(job.id)}
                >
                  Delete
                </button>
              </div>
              {confirmingDelete ? (
                <div
                  role="alertdialog"
                  aria-labelledby={`floor-plan-delete-title-${job.id}`}
                  className={`mt-2 rounded-md border p-2 ${
                    dark
                      ? "border-red-400/30 bg-red-950/30"
                      : "border-red-200 bg-red-50"
                  }`}
                >
                  <p
                    id={`floor-plan-delete-title-${job.id}`}
                    className="text-[11px] font-semibold"
                  >
                    Delete this import from your history?
                  </p>
                  <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
                    Any design already created from it will stay. Its uploaded
                    source continues to follow your private retention settings.
                    {CANCELLABLE_STATUSES.has(job.status)
                      ? " This will also stop this import."
                      : ""}
                  </p>
                  <div className="mt-2 flex gap-1.5">
                    <button
                      type="button"
                      className={secondary}
                      disabled={disabled || busy}
                      onClick={() => setConfirmDeleteJobId(null)}
                    >
                      Keep import
                    </button>
                    <button
                      type="button"
                      className={`${secondary} text-red-700`}
                      disabled={disabled || busy}
                      onClick={() => void runAction(job, "delete")}
                    >
                      {busy ? "Deleting…" : "Delete import"}
                    </button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      {nextCursor ? (
        <button type="button" className={`${secondary} mt-2 w-full`} disabled={loadingMore} onClick={() => void load(nextCursor, true)}>
          {loadingMore ? "Loading…" : "Show older imports"}
        </button>
      ) : null}
      {errorMessage ? <p role="alert" className="mt-2 text-[10px] text-red-600">{errorMessage}</p> : null}
    </details>
  );
}
