"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  isResumableFloorPlanImportStatus,
} from "@/lib/floor-plan-import-client";
import type { ConsumerFloorPlanImportSummary } from "./floor-plan-import-ui-types";

type FloorPlanImportHistoryProps = {
  dark?: boolean;
  disabled?: boolean;
  activeJobId: string | null;
  refreshKey: number;
  onResume: (jobId: string | null) => void;
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
  refreshKey,
  onResume,
}: FloorPlanImportHistoryProps) {
  const router = useRouter();
  const [jobs, setJobs] = useState<ConsumerFloorPlanImportSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async (cursor: string | null, append: boolean) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
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
      setNextCursor(typeof payload.nextCursor === "string" ? payload.nextCursor : null);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : "Imports could not be loaded");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load(null, false);
  }, [load, refreshKey]);

  const runAction = async (job: ConsumerFloorPlanImportSummary, action: "cancel" | "retry") => {
    setActionJobId(job.id);
    setErrorMessage(null);
    try {
      const response = await fetch(
        `/api/floor-plan-imports/${encodeURIComponent(job.id)}/${action}`,
        { method: "POST", headers: { Accept: "application/json" } }
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
      await load(null, false);
    } catch (cause) {
      setErrorMessage(cause instanceof Error ? cause.message : `Unable to ${action} this import`);
    } finally {
      setActionJobId(null);
    }
  };

  const subtle = dark ? "text-neutral-400" : "text-neutral-500";
  const card = dark
    ? "designer-control rounded-lg border border-white/10 p-2.5"
    : "rounded-lg border border-neutral-200 bg-white p-2.5";
  const secondary = dark
    ? "designer-control rounded-md border px-2 py-1 text-[11px] font-semibold disabled:opacity-50"
    : "rounded-md border border-neutral-200 bg-white px-2 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50";

  return (
    <details className={dark ? "designer-recessed rounded-lg p-3" : "rounded-lg bg-neutral-50 p-3"}>
      <summary className="cursor-pointer text-xs font-semibold">My floor-plan imports</summary>
      <p className={`mt-1 text-[10px] leading-4 ${subtle}`}>
        Resume a review after refreshing or leaving the editor. Imports remain private to your account.
      </p>
      {loading ? <p className={`mt-2 text-xs ${subtle}`}>Loading imports…</p> : null}
      {!loading && jobs.length === 0 ? (
        <p className={`mt-2 text-xs ${subtle}`}>No previous imports yet.</p>
      ) : null}
      <div className="mt-2 grid gap-2">
        {jobs.map((job) => {
          const active = job.id === activeJobId;
          const busy = actionJobId === job.id;
          const canResume = isResumableFloorPlanImportStatus(job.status);
          return (
            <article key={job.id} className={card} data-testid={`floor-plan-import-history-${job.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold">
                    {job.sourceAsset.fileName ?? "Private floor plan"}
                  </div>
                  <div className={`mt-0.5 text-[10px] capitalize ${subtle}`}>
                    {statusLabel(job)} · {Math.round(job.progress)}%
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
                    onClick={() => router.push(`/design/${encodeURIComponent(job.appliedDesignId!)}`)}
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
              </div>
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
