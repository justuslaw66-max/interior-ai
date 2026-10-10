"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { allowedImportStatusesFrom } from "@/lib/import-jobs/status";
import type { ImportJobStatus } from "@/lib/import-jobs/types";
import { describeAdminStatus } from "../../admin-status";
import { useImportStatusChange } from "./useImportStatusChange";

type ImportJobActionsProps = {
  jobId: string;
  currentStatus: string;
  initialNotes: string;
  initialErrorMessage: string;
  initialCatalogItemId: string;
  initialNormalizedAssetId: string;
};

export default function ImportJobActions(props: ImportJobActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [status, setStatus] = useState<ImportJobStatus | string>(props.currentStatus);
  const [notes, setNotes] = useState(props.initialNotes);
  const [errorMessage, setErrorMessage] = useState(props.initialErrorMessage);
  const [catalogItemId, setCatalogItemId] = useState(props.initialCatalogItemId);
  const [normalizedAssetId, setNormalizedAssetId] = useState(props.initialNormalizedAssetId);
  const [feedback, setFeedback] = useState<string>("");

  const statusOptions = useMemo(() => allowedImportStatusesFrom(props.currentStatus), [props.currentStatus]);

  const runUpdate = (nextStatus: ImportJobStatus | string) => {
    setFeedback("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/admin/imports/${props.jobId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: nextStatus,
            notes: notes.trim() || null,
            errorMessage: errorMessage.trim() || null,
            catalogItemId: catalogItemId.trim() || null,
            normalizedAssetId: normalizedAssetId.trim() || null,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "Failed to update import job.");
        }

        setStatus(nextStatus);
        setFeedback("Saved.");
        router.refresh();
      } catch (error) {
        const err = error as Error;
        setFeedback(`Error: ${err.message}`);
      }
    });
  };

  // A status change can't be undone, so it's confirmed first (AD4).
  const { requestChange: requestUpdate, dialog } = useImportStatusChange(props.currentStatus, (nextStatus) => {
    setStatus(nextStatus);
    runUpdate(nextStatus);
  });

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    requestUpdate(status);
  };

  return (
    <section className="rounded-xl border p-4">
      {dialog}
      <h2 className="text-sm font-semibold">Workflow actions</h2>
      <form className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <label className="text-xs text-neutral-600">
          Status
          <select
            className="mt-1 w-full rounded border p-2 text-sm"
            value={status}
            onChange={(event) => setStatus(event.target.value as ImportJobStatus)}
            disabled={isPending}
          >
            {statusOptions.map((nextStatus) => (
              <option key={nextStatus} value={nextStatus}>
                {describeAdminStatus("importJob", nextStatus).label}
              </option>
            ))}
          </select>
        </label>

        <label className="text-xs text-neutral-600">
          Catalog Item Id
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={catalogItemId}
            onChange={(event) => setCatalogItemId(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600">
          Model Asset Id
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={normalizedAssetId}
            onChange={(event) => setNormalizedAssetId(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Error Message
          <input
            className="mt-1 w-full rounded border p-2 text-sm"
            value={errorMessage}
            onChange={(event) => setErrorMessage(event.target.value)}
            disabled={isPending}
          />
        </label>

        <label className="text-xs text-neutral-600 md:col-span-2">
          Notes
          <textarea
            className="mt-1 min-h-24 w-full rounded border p-2 text-sm"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={isPending}
          />
        </label>

        <div className="md:col-span-2 flex items-center gap-3">
          <button
            type="submit"
            className="rounded bg-black px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
            disabled={isPending}
          >
            {isPending ? "Saving..." : "Save workflow update"}
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={isPending || !statusOptions.includes("needs_review")}
            onClick={() => requestUpdate("needs_review")}
          >
            Mark needs review
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={isPending || !statusOptions.includes("approved")}
            onClick={() => requestUpdate("approved")}
          >
            Mark approved
          </button>
          <button
            type="button"
            className="rounded border px-3 py-2 text-xs font-medium disabled:opacity-60"
            disabled={isPending || !statusOptions.includes("published")}
            onClick={() => requestUpdate("published")}
          >
            Mark published
          </button>
          {feedback && <span className="text-xs text-neutral-600">{feedback}</span>}
        </div>
      </form>
    </section>
  );
}
