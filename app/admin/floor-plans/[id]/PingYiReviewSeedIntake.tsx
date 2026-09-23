"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelFloorPlanAdminJobMutation,
  notifyFloorPlanAdminJobUpdated,
  requestFloorPlanAdminJobMutation,
  subscribeToFloorPlanAdminJobUpdates,
} from "@/lib/floor-plan-admin-review-events";

type SeedFixture = {
  layoutId: string;
  label: string;
  sourcePage: number;
  criticalIssueCount: number;
};

type SeedAvailability = {
  sourceMatches: boolean;
  eligible: boolean;
  reason: string | null;
  candidateVersion: number;
  fixtures: SeedFixture[];
};

export default function PingYiReviewSeedIntake({ jobId }: { jobId: string }) {
  const [availability, setAvailability] = useState<SeedAvailability | null>(null);
  const [layoutId, setLayoutId] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const response = await fetch(
      `/api/admin/floor-plan-imports/${jobId}/review-seed`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error("Review-seed availability could not be loaded.");
    }
    const payload = (await response.json()) as SeedAvailability;
    setAvailability(payload);
    setLayoutId((current) =>
      payload.fixtures.some((fixture) => fixture.layoutId === current)
        ? current
        : (payload.fixtures[0]?.layoutId ?? "")
    );
  }, [jobId]);

  useEffect(() => {
    let active = true;
    reload()
      .catch(() => {
        if (active) setAvailability(null);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  useEffect(
    () =>
      subscribeToFloorPlanAdminJobUpdates(jobId, () => {
        void reload().catch(() => setAvailability(null));
      }),
    [jobId, reload]
  );

  if (!availability?.sourceMatches) return null;

  const selected = availability.fixtures.find((fixture) => fixture.layoutId === layoutId);
  const applySeed = async () => {
    if (!selected || !availability.eligible || pending) return;
    const mutationId = requestFloorPlanAdminJobMutation(
      jobId,
      `Applying the ${selected.label} review seed`
    );
    if (!mutationId) {
      setFeedback("Review seed cancelled; your unsaved review changes were kept.");
      return;
    }
    setPending(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/admin/floor-plan-imports/${jobId}/review-seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layoutId: selected.layoutId,
          candidateVersion: availability.candidateVersion,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; candidateVersion?: number }
        | null;
      if (!response.ok) throw new Error(payload?.error ?? "Review seed could not be applied.");
      setFeedback(`Candidate v${payload?.candidateVersion ?? "next"} created for review.`);
      notifyFloorPlanAdminJobUpdated(jobId, { mutationId });
    } catch (cause) {
      cancelFloorPlanAdminJobMutation(jobId, mutationId);
      setFeedback(cause instanceof Error ? cause.message : "Review seed could not be applied.");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <div className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            Exact Ping Yi Court source matched
          </div>
          <h2 className="mt-1 text-base font-semibold text-neutral-950">
            Start from a native V2 review seed
          </h2>
          <p className="mt-1 text-sm text-neutral-700">
            Choose the source-page layout to replace the machine candidate. The result remains
            needs-review with every critical issue and evidence record intact. It is not approved
            or published.
          </p>
        </div>
        <div className="flex min-w-[320px] flex-wrap items-end gap-2">
          <label className="min-w-[230px] flex-1 text-xs font-medium text-neutral-700">
            Review layout
            <select
              className="mt-1 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
              disabled={!availability.eligible || pending}
              onChange={(event) => setLayoutId(event.target.value)}
              value={layoutId}
            >
              {availability.fixtures.map((fixture) => (
                <option key={fixture.layoutId} value={fixture.layoutId}>
                  {fixture.label} · PDF page {fixture.sourcePage}
                </option>
              ))}
            </select>
          </label>
          <button
            className="rounded-lg bg-amber-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!availability.eligible || !selected || pending}
            onClick={applySeed}
            type="button"
          >
            {pending ? "Applying…" : "Apply review seed"}
          </button>
        </div>
      </div>
      {selected ? (
        <div className="mt-3 text-xs text-amber-900">
          {selected.criticalIssueCount} critical seed issue
          {selected.criticalIssueCount === 1 ? "" : "s"} will stay open · optimistic candidate v
          {availability.candidateVersion}
        </div>
      ) : null}
      {!availability.eligible && availability.reason ? (
        <div className="mt-3 rounded-lg border border-amber-300 bg-white p-2 text-xs text-amber-900">
          {availability.reason}
        </div>
      ) : null}
      {feedback ? <div className="mt-3 text-sm text-amber-950" role="status">{feedback}</div> : null}
    </section>
  );
}
