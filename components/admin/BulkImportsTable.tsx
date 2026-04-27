"use client";

import Link from "next/link";
import { useState } from "react";
import {
  getImportJobValidationBlockers,
  getPrimaryImportWorkflowQueue,
  type AdminImportWorkflowJob,
} from "@/lib/import-jobs/admin-workflow-shared";

const STATUS_TONE: Record<string, string> = {
  failed: "bg-red-50 text-red-700 border-red-200",
  needs_review: "bg-amber-50 text-amber-800 border-amber-200",
  needs_mapping: "bg-blue-50 text-blue-700 border-blue-200",
  published: "bg-green-50 text-green-700 border-green-200",
};

function statusTone(status: string): string {
  return STATUS_TONE[status] ?? "bg-neutral-50 text-neutral-700 border-neutral-200";
}

const QUEUE_ACTIONS = [
  { key: "received", label: "Reset to Intake", queue: "scrape" },
  { key: "needs_mapping", label: "Send to Mapping", queue: "normalize" },
  { key: "needs_review", label: "Send to Review", queue: "review" },
  { key: "approved", label: "Mark Approved", queue: "publish" },
] as const;

interface BulkImportsTableProps {
  jobs: AdminImportWorkflowJob[];
}

export function BulkImportsTable({ jobs }: BulkImportsTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleSelectAll = () => {
    if (selected.size === jobs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(jobs.map((j) => j.id)));
    }
  };

  const handleBulkUpdate = async (status: string) => {
    if (selected.size === 0) {
      setError("Please select at least one job");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/imports/bulk", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: Array.from(selected),
          status,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to update jobs");
        setIsLoading(false);
        return;
      }

      // Clear selection and refresh page
      setSelected(new Set());
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {selected.size > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm font-medium text-blue-900">
              {selected.size} job{selected.size === 1 ? "" : "s"} selected
            </div>
            <div className="flex flex-wrap gap-2">
              {QUEUE_ACTIONS.map((action) => (
                <button
                  key={action.key}
                  onClick={() => handleBulkUpdate(action.key)}
                  disabled={isLoading}
                  className="rounded-lg border border-blue-300 bg-white px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {action.label}
                </button>
              ))}
              <button
                onClick={() => setSelected(new Set())}
                disabled={isLoading}
                className="rounded-lg border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Clear
              </button>
            </div>
          </div>
          {error && <div className="mt-2 text-xs text-red-700">{error}</div>}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b bg-neutral-50 text-left">
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.size === jobs.length && jobs.length > 0}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-neutral-300"
                />
              </th>
              <th className="px-3 py-2 font-medium">Job</th>
              <th className="px-3 py-2 font-medium">Queue</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Source</th>
              <th className="px-3 py-2 font-medium">Brand</th>
              <th className="px-3 py-2 font-medium">Next action</th>
              <th className="px-3 py-2 font-medium">Updated</th>
              <th className="px-3 py-2 font-medium">Validation blockers</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const blockers = getImportJobValidationBlockers(job);
              const isSelected = selected.has(job.id);
              return (
                <tr
                  key={job.id}
                  className={`border-b align-top ${isSelected ? "bg-blue-50" : ""}`}
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(job.id)}
                      className="h-4 w-4 rounded border-neutral-300"
                    />
                  </td>
                  <td className="px-3 py-2 font-medium">
                    <Link className="text-blue-600 hover:text-blue-700" href={`/admin/imports/${job.id}`}>
                      {job.id}
                    </Link>
                  </td>
                  <td className="px-3 py-2 capitalize">{getPrimaryImportWorkflowQueue(job)}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex rounded border px-2 py-0.5 text-xs ${statusTone(job.status)}`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{job.sourceFileName}</td>
                  <td className="px-3 py-2">{job.sourceBrand ?? "-"}</td>
                  <td className="px-3 py-2 text-xs text-neutral-600">{job.nextAction ?? "-"}</td>
                  <td className="px-3 py-2 text-neutral-600">{job.updatedAt.toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-neutral-600">
                    {blockers.length > 0 ? blockers.slice(0, 2).join("; ") : "-"}
                  </td>
                </tr>
              );
            })}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-xs text-neutral-500">
                  No import jobs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
