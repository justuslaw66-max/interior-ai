"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type CreatedReviewJob = {
  job?: { id: string };
  next?: { processUrl?: string; reviewSeedUrl?: string; reviewUrl?: string };
  error?: string;
};

type ProcessedReviewJob = {
  job?: { status?: string };
  processing?: { outcome?: string };
  error?: string;
};

type ReviewSeedAvailability = {
  eligible?: boolean;
  reason?: string | null;
  candidateVersion?: number;
};

export default function PingYiReviewJobButton({
  label,
  layoutId,
}: {
  label: string;
  layoutId: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");

  const createReviewJob = async () => {
    if (pending) return;
    setPending(true);
    setFeedback("Creating durable source job…");
    let reviewUrl = "";
    try {
      const createdResponse = await fetch("/api/admin/floor-plan-imports/review-seeds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layoutId }),
      });
      const created = (await createdResponse.json().catch(() => null)) as CreatedReviewJob | null;
      if (!createdResponse.ok || !created?.job?.id) {
        throw new Error(created?.error ?? "Review job could not be created.");
      }
      reviewUrl = created.next?.reviewUrl ?? `/admin/floor-plans/${created.job.id}`;

      setFeedback("Rendering and registering the source PDF…");
      const processedResponse = await fetch(
        created.next?.processUrl ?? `/api/floor-plan-imports/${created.job.id}/process`,
        { method: "POST" }
      );
      const processed = (await processedResponse.json().catch(() => null)) as
        | ProcessedReviewJob
        | null;
      if (!processedResponse.ok) {
        throw new Error(processed?.error ?? "The source job was created but processing failed.");
      }

      const status = processed?.job?.status;
      if (status === "needs_review" || status === "ready") {
        const reviewSeedUrl = created.next?.reviewSeedUrl ??
          `/api/admin/floor-plan-imports/${created.job.id}/review-seed`;
        const availabilityResponse = await fetch(reviewSeedUrl, { cache: "no-store" });
        const availability = (await availabilityResponse.json().catch(() => null)) as
          | ReviewSeedAvailability
          | null;
        if (!availabilityResponse.ok || !availability?.eligible) {
          throw new Error(
            availability?.reason ?? "The processed source is not ready for its review seed."
          );
        }
        if (!Number.isSafeInteger(availability.candidateVersion)) {
          throw new Error("The review candidate version is unavailable.");
        }
        setFeedback(`Applying the ${label} editable V2 review seed…`);
        const seededResponse = await fetch(reviewSeedUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            layoutId,
            candidateVersion: availability.candidateVersion,
          }),
        });
        const seeded = (await seededResponse.json().catch(() => null)) as
          | { error?: string }
          | null;
        if (!seededResponse.ok) {
          throw new Error(seeded?.error ?? "The review seed could not be applied.");
        }
      } else {
        setFeedback(
          processed?.processing?.outcome === "queued"
            ? "Source queued. Apply the review seed when processing finishes."
            : "Source job created. Continue in the review workspace."
        );
      }

      router.push(reviewUrl);
      router.refresh();
    } catch (cause) {
      setFeedback(cause instanceof Error ? cause.message : "Review job could not be created.");
      if (reviewUrl) window.setTimeout(() => router.push(reviewUrl), 1_500);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mt-3">
      <button
        className="rounded-md bg-amber-900 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`create-review-job-${layoutId}`}
        disabled={pending}
        onClick={createReviewJob}
        type="button"
      >
        {pending ? "Preparing review…" : "Create editable review job"}
      </button>
      {feedback ? (
        <div className="mt-2 text-xs text-amber-950" role="status">
          {feedback}
        </div>
      ) : null}
    </div>
  );
}
