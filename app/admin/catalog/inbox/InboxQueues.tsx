import Link from "next/link";
import {
  getImportJobValidationBlockers,
  type AdminImportWorkflowJob,
  type ImportWorkflowQueue,
  type ImportWorkflowQueueCounts,
} from "@/lib/import-jobs/admin-workflow";
import { AdminStatusBadge } from "../../AdminStatusBadge";
import { describeAdminStatus } from "../../admin-status";

/** How many jobs a queue card lists; the card says when it lists fewer than the queue holds. */
export const INBOX_QUEUE_CARD_LIMIT = 12;

/** Counts for every import job (UX audit AD6); the blocked count is from the jobs loaded below. */
export function InboxSummary({ counts, blocked }: { counts: ImportWorkflowQueueCounts; blocked: number }) {
  const tiles: Array<[string, number]> = [
    ["Total jobs", counts.total],
    ["Scrape queue", counts.byQueue.scrape],
    ["Normalize queue", counts.byQueue.normalize],
    ["Review queue", counts.byQueue.review],
    ["Blocked (latest 300)", blocked],
  ];
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {tiles.map(([label, value]) => (
        <div className="rounded-xl border p-3" key={label}>
          <div className="text-xs text-neutral-500">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      ))}
    </section>
  );
}

function InboxJobCard({ job }: { job: AdminImportWorkflowJob }) {
  const validationBlockers = getImportJobValidationBlockers(job);
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link className="text-sm font-medium text-blue-600 hover:text-blue-700" href={`/admin/imports/${job.id}`}>
            {job.sourceFileName}
          </Link>
          <div className="mt-1 text-xs text-neutral-500">
            {job.sourceBrand ?? "Unknown brand"}
            {job.sourceSku ? ` · SKU ${job.sourceSku}` : ""}
          </div>
        </div>
        <AdminStatusBadge kind="importJob" status={job.status} />
      </div>
      <div className="mt-2 text-xs text-neutral-600">Stage: {describeAdminStatus("workflowStage", job.workflowStage).label}</div>
      <div className="mt-1 text-xs text-neutral-600">Next: {job.nextAction ?? "-"}</div>
      {validationBlockers.length > 0 ? (
        <div className="mt-2 text-xs text-red-700">
          {validationBlockers.length} blocker{validationBlockers.length === 1 ? "" : "s"}
        </div>
      ) : null}
    </div>
  );
}

export function InboxQueueCard({ queue }: { queue: ImportWorkflowQueue }) {
  const shown = queue.jobs.slice(0, INBOX_QUEUE_CARD_LIMIT);
  return (
    <section className="rounded-xl border p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">{queue.title}</h2>
          <p className="mt-1 text-xs text-neutral-600">{queue.description}</p>
        </div>
        <div className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">
          {queue.jobs.length}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {shown.map((job) => (
          <InboxJobCard job={job} key={job.id} />
        ))}
        {queue.jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-xs text-neutral-500">
            No jobs in this queue.
          </div>
        ) : null}
        {queue.jobs.length > shown.length ? (
          <p className="text-xs text-neutral-600">
            Showing the {shown.length} most recently changed of {queue.jobs.length}.{" "}
            <Link className="text-blue-600 hover:text-blue-700" href="/admin/imports?sort=updated">
              See them all in Import jobs
            </Link>
          </p>
        ) : null}
      </div>
    </section>
  );
}
